import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { createApplication } from '../server.mjs';

async function fixture(t, options = {}) {
  const create = async () => {
    const app = createApplication({ dbPath: ':memory:', host: '127.0.0.1', port: 0, ...options });
    const address = await app.listen();
    app.base = 'http://127.0.0.1:' + address.port;
    return app;
  };
  let active = await create();
  t.after(() => active.close());
  async function restart() {
    await active.close();
    active = await create();
  }
  function browser() {
    const cookies = new Map();
    async function request(path, input) {
      const response = await fetch(active.base + path, {
        method: input === undefined ? 'GET' : 'POST',
        headers: {
          Cookie: [...cookies].map(([k, v]) => k + '=' + v).join('; '),
          ...(input === undefined ? {} : { 'Content-Type': 'application/json' })
        },
        body: input === undefined ? undefined : JSON.stringify(input)
      });
      for (const cookie of response.headers.getSetCookie()) {
        const pair = cookie.split(';')[0];
        const split = pair.indexOf('=');
        if (cookie.includes('Max-Age=0')) cookies.delete(pair.slice(0, split));
        else cookies.set(pair.slice(0, split), pair.slice(split + 1));
      }
      return { status: response.status, body: await response.json() };
    }
    const snapshot = () => request('/api/tearoom');
    const enter = () => request('/api/tearoom/session', {});
    const rename = name => request('/api/tearoom/profile', { name });
    const action = (name, input) => request('/api/tearoom/actions', { action: name, ...input });
    return { request, snapshot, enter, rename, action };
  }
  return { browser, restart };
}

test('fresh browsers enter directly with a selected default name and an optional rename', async t => {
  const { browser } = await fixture(t);
  const visitor = browser();
  assert.equal((await visitor.snapshot()).status, 401);
  assert.equal((await visitor.action('board', { body: '未初始化浏览器留言' })).status, 401);
  const result = await visitor.enter();
  assert.equal(result.status, 200);
  assert.equal(result.body.suggestedNames.length, 30);
  assert.equal(new Set(result.body.suggestedNames).size, 30);
  assert.ok(result.body.suggestedNames.includes(result.body.name));
  assert.equal((await visitor.rename(' ')).status, 400);
  assert.equal((await visitor.action('wall', { body: '使用默认昵称留言' })).body.wall[0].who, result.body.name);
  const next = await visitor.rename('  我的新名字  ');
  assert.equal(next.body.name, '我的新名字');
  assert.equal((await visitor.enter()).body.name, '我的新名字');
});

test('tea room browser profiles persist and protect private suggestions and ownership across shared sessions', async t => {
  await mkdir(resolve('tmp'), { recursive: true });
  const dir = await mkdtemp(resolve('tmp', 'backend-tearoom-'));
  const { browser, restart } = await fixture(t, { dbPath: resolve(dir, 'tea.sqlite') });
  t.after(() => rm(dir, { recursive: true, force: true }));
  const first = browser();
  const second = browser();
  const admin = browser();
  assert.equal((await first.snapshot()).status, 401);
  assert.equal((await first.action('board', { body: '未登录留言' })).status, 401);
  assert.equal((await first.enter()).status, 200);
  assert.equal((await second.enter()).status, 200);
  assert.equal((await first.rename('  员工甲  ')).body.name, '员工甲');
  assert.equal((await second.rename('员工乙')).body.name, '员工乙');
  assert.equal((await admin.request('/api/login', { username: 'demo', password: 'demo2026!' })).status, 200);
  assert.equal((await admin.snapshot()).status, 401);
  assert.equal((await admin.enter()).body.canModerate, true);

  const initial = (await first.snapshot()).body.scripts;
  const published = (await first.action('script', { cat: '砍价', title: '新话术', body: '先核对可提供的服务。' })).body;
  const script = published.scripts.find(item => item.title === '新话术');
  assert.equal(script.author, '员工甲');
  assert.equal((await first.action('script', { cat: '砍价', title: '署名绕过', body: '不可替人发帖', author: '员工乙' })).status, 400);
  assert.equal((await first.action('case', { title: '体验案例', body: '复核了时间。' })).body.cases[0].author, '员工甲');
  assert.equal((await first.request('/api/tearoom/profile', { name: '甲同事' })).body.name, '甲同事');

  const board = (await first.action('board', { body: '匿名留言' })).body.board[0];
  assert.doesNotMatch(JSON.stringify(board), /员工甲|甲同事|actor|author/);
  const wall = (await first.action('wall', { body: '一起做得更好' })).body.wall[0];
  assert.equal(wall.who, '甲同事');
  for (let i = 0; i < 2; i++) {
    const reacted = (await second.action('cheer', { id: wall.id, active: true })).body;
    assert.equal(reacted.wall[0].cheers, 1);
    assert.equal(reacted.cheered[wall.id], true);
  }
  const liked = (await second.action('favorite', { id: script.id, active: true })).body;
  assert.equal(liked.scripts.find(item => item.id === script.id).fav, 1);
  assert.equal(liked.favScripts[script.id], true);
  assert.equal((await first.snapshot()).body.favScripts[script.id], undefined);

  const question = (await first.action('help', { title: '新的问题' })).body.help[0];
  assert.equal(question.mine, true);
  assert.equal((await second.snapshot()).body.help[0].mine, false);
  assert.equal((await second.action('solve', { id: question.id })).status, 403);
  const answered = (await second.action('answer', { id: question.id, body: '我的建议是核对记录。' })).body.help[0];
  assert.equal(answered.answers[0].who, '员工乙');
  assert.equal((await first.action('solve', { id: question.id })).body.help[0].solved, true);

  const suggest = (await first.action('suggest', { body: '仅向管理员提出的细节' })).body;
  const code = suggest.submittedCode;
  assert.match(code, /^JY-[A-F0-9]{16}$/);
  assert.equal(suggest.suggest[0].mine, true);
  assert.deepEqual((await second.snapshot()).body.suggest, []);
  const tracked = (await second.action('suggestLookup', { code })).body.trackedSuggestion;
  assert.equal(tracked.status, '已收到');
  assert.equal(tracked.body, undefined);
  assert.equal((await second.action('suggestReply', { code, status: '已回复', reply: '无授权' })).status, 403);
  assert.equal((await admin.snapshot()).body.suggest[0].body, '仅向管理员提出的细节');
  assert.equal((await admin.action('suggestReply', { code, status: '已回复', reply: '已安排处理' })).status, 200);
  const reply = (await second.snapshot()).body.suggest[0];
  assert.equal(reply.reply, '已安排处理');
  assert.equal(reply.body, undefined);
  assert.equal(reply.code, undefined);

  assert.equal((await first.action('market', { type: '拼车', title: '晚场后顺路' })).body.market[0].contact, '甲同事');
  assert.equal((await first.action('market', { type: '拼车', title: '联系我', contact: '138 1234 5678' })).status, 400);
  await restart();
  assert.equal((await first.snapshot()).status, 401);
  const saved = (await first.enter()).body;
  assert.equal(saved.name, '甲同事');
  assert.equal(saved.suggest[0].code, code);
  assert.equal(saved.help[0].mine, true);
  assert.equal(saved.help[0].solved, true);
  assert.equal(saved.scripts.length, initial.length + 1);
  assert.equal(saved.wall[0].cheers, 1);
  assert.equal((await first.request('/api/tearoom/logout', {})).status, 200);
  assert.equal((await first.snapshot()).status, 401);
});

