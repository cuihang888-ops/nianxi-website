import assert from 'node:assert/strict';
import test from 'node:test';
import { createApplication } from '../server.mjs';
import { completenessForDate, sessionStatus } from '../lib/completeness.mjs';
import { suggestionTiming, SUGGESTION_SLA_MS } from '../lib/feedback.mjs';

const BOARD_PASSWORD = 'TestBoardPass';

async function fixture(t) {
  const app = createApplication({ dbPath: ':memory:', host: '127.0.0.1', port: 0, demo: true, today: '2026-11-25', dashboardPassword: BOARD_PASSWORD });
  const address = await app.listen();
  t.after(() => app.close());
  const base = 'http://127.0.0.1:' + address.port;
  function browser() {
    const cookies = new Map();
    async function request(path, input, headers = {}) {
      const response = await fetch(base + path, {
        method: input === undefined ? 'GET' : 'POST',
        headers: {
          Cookie: [...cookies].map(([k, v]) => k + '=' + v).join('; '),
          ...headers,
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
      return { status: response.status, body: await response.json().catch(() => ({})) };
    }
    return {
      request,
      login: (username, password) => request('/api/login', { username, password }),
      unlockBoard: () => request('/api/dashboard/unlock', { password: BOARD_PASSWORD }),
      enterTea: () => request('/api/tearoom/session', {}),
      rename: name => request('/api/tearoom/profile', { name }),
      tea: () => request('/api/tearoom'),
      action: (name, input) => request('/api/tearoom/actions', { action: name, ...input })
    };
  }
  return { app, browser };
}

test('completeness: explicit zero counts as filled, partial lists missing names, stopped/cancelled never flagged', () => {
  const zero = { orderAmount: 0, orders: 0, actualMinutes: 0, impressions: 0, shares: 0, newFollowers: 0 };
  assert.deepEqual(sessionStatus(zero), { status: 'complete', missing: [] });
  const partial = sessionStatus({ orderAmount: 100, orders: null, actualMinutes: 300, impressions: undefined, shares: 2, newFollowers: 1 });
  assert.equal(partial.status, 'partial');
  assert.deepEqual(partial.missing, ['单量', '浏览量']);
  assert.equal(sessionStatus(null).status, 'empty');
  assert.equal(sessionStatus({ ...zero, orderAmount: null, cancelled: true }).status, 'stopped');
  assert.equal(sessionStatus({ sourceStatus: 'stopped' }).status, 'stopped');

  const roster = {
    accounts: [{ id: 'a1', name: '甲直播间', active: true }],
    anchors: [{ id: 'an1', name: '主播甲', accountId: 'a1', slotId: 's1', slotLabel: '早场', activeFrom: null, activeTo: null }]
  };
  const store = { list: name => name === 'sessions' ? [{ id: 'r1', date: '2026-11-25', accountId: 'a1', anchorId: 'an1', slotId: 's1', ...zero, orders: null }] : [] };
  const result = completenessForDate(store, roster, '2026-11-25');
  assert.equal(result.summary.expected, 1);
  assert.equal(result.summary.partial, 1);
  assert.deepEqual(result.accounts[0].sessions[0].missing, ['单量']);
  // 完整性结果只含状态与缺项名，不含任何指标数值字段。
  assert.doesNotMatch(JSON.stringify(result), /orderAmount|actualMinutes|impressions/);
});

test('suggestion timing: pending past 48h is overdue, resolved is neither', () => {
  const now = 1_800_000_000_000;
  const fresh = suggestionTiming({ status: '已收到' }, now - 60_000, now);
  assert.equal(fresh.pending, true);
  assert.equal(fresh.overdue, false);
  const late = suggestionTiming({ status: '处理中' }, now - SUGGESTION_SLA_MS - 1, now);
  assert.equal(late.pending, true);
  assert.equal(late.overdue, true);
  const done = suggestionTiming({ status: '已调整' }, now - SUGGESTION_SLA_MS - 1, now);
  assert.equal(done.pending, false);
  assert.equal(done.overdue, false);
});

test('entry backfill merges only empty fields and never overwrites filled values', async t => {
  const { app, browser } = await fixture(t);
  const staff = browser();
  const pub = { 'X-Command-Scope': 'public-entry' };
  const entry = { date: '2026-12-20', accountId: 'account-1', anchorId: 'anchor-1' };
  const stored = () => app.store.list('sessions').find(item => item.date === entry.date && item.accountId === entry.accountId && item.anchorId === entry.anchorId);

  const first = await staff.request('/api/entry/sessions', { ...entry, orders: 7, shares: 3 }, pub);
  assert.equal(first.status, 201, JSON.stringify(first.body));
  const second = await staff.request('/api/entry/sessions', { ...entry, orderAmount: 500, actualMinutes: 320, impressions: 900, newFollowers: 4 }, pub);
  assert.equal(second.status, 201, JSON.stringify(second.body));
  assert.equal(stored().orders, 7);
  assert.equal(stored().shares, 3);
  assert.equal(stored().orderAmount, 500);
  assert.equal(stored().newFollowers, 4);

  // 与已填值冲突的再次提交仍被拦截，且不改动已存数据。
  const conflict = await staff.request('/api/entry/sessions', { ...entry, orders: 9 }, pub);
  assert.equal(conflict.status, 409);
  assert.equal(stored().orders, 7);

  // 完整性接口能看到该场次已齐全，且不下发数值。
  const completeness = await staff.request('/api/entry/completeness?date=2026-12-20');
  assert.equal(completeness.status, 200);
  const mine = completeness.body.accounts.flatMap(group => group.sessions).find(item => item.anchorId === 'anchor-1');
  assert.equal(mine.status, 'complete');
  assert.deepEqual(mine.missing, []);
  assert.doesNotMatch(JSON.stringify(completeness.body), /"orderAmount"|"orders":/);
});

test('feedback: 48h overdue flag, status flow, coordinate isolation and board-only bodies', async t => {
  const { app, browser } = await fixture(t);
  const alice = browser();
  const bob = browser();
  await alice.enterTea();
  await alice.rename('反馈员工甲');
  await bob.enterTea();
  await bob.rename('反馈员工乙');

  // 建议：实名与匿名各一条；匿名不带姓名，实名带姓名。
  const named = await alice.action('suggest', { body: '希望排班表能提前一周发布', anonymous: false });
  const namedCode = named.body.submittedCode;
  assert.ok(namedCode);
  const anon = await bob.action('suggest', { body: '匿名的一条建议内容' });
  const anonCode = anon.body.submittedCode;

  // 协调事项：只有提交人自己能在茶水间看到，别人看不到。
  const coord = await alice.action('coordinate', { title: '需要协调换灯', body: '直播间顶灯坏了，需要管理层协调维修。' });
  assert.equal(coord.status, 200, JSON.stringify(coord.body));
  assert.equal(coord.body.coordinates.length, 1);
  assert.equal(coord.body.coordinates[0].status, '已收到');
  assert.deepEqual((await bob.tea()).body.coordinates, []);

  // 未解锁看板：拿不到反馈正文；员工录入账号直接拒绝。
  const locked = browser();
  await locked.login('demo', 'demo2026!');
  const denied = await locked.request('/api/dashboard/feedback');
  assert.equal(denied.status, 403);
  assert.equal(denied.body.code, 'DASHBOARD_LOCKED');
  const staffDenied = browser();
  await staffDenied.login('recorder', 'record2026!');
  assert.equal((await staffDenied.request('/api/dashboard/feedback')).status, 403);
  assert.equal((await browser().request('/api/dashboard/feedback')).status, 401);

  // 解锁看板（只读口令）后可查阅与处理。
  const board = browser();
  assert.equal((await board.unlockBoard()).status, 200);
  let feedback = (await board.request('/api/dashboard/feedback')).body;
  const namedItem = feedback.suggestions.find(item => item.code === namedCode);
  assert.equal(namedItem.anonymous, false);
  assert.equal(namedItem.authorName, '反馈员工甲');
  const anonItem = feedback.suggestions.find(item => item.code === anonCode);
  assert.equal(anonItem.anonymous, true);
  assert.equal(anonItem.authorName, null);
  assert.equal(feedback.coordinates[0].body, '直播间顶灯坏了，需要管理层协调维修。');
  assert.equal(feedback.counts.suggestionsPending, 2);
  assert.equal(feedback.counts.suggestionsOverdue, 0);

  // 把匿名建议的提交时间改到 49 小时前 → 看板应标逾期。
  app.store.db.prepare("UPDATE tearoom_posts SET createdAt = ? WHERE id = ?").run(Date.now() - 49 * 3600_000, anonCode);
  feedback = (await board.request('/api/dashboard/feedback')).body;
  assert.equal(feedback.suggestions.find(item => item.code === anonCode).overdue, true);
  assert.equal(feedback.counts.suggestionsOverdue, 1);

  // 状态流转：已调整必须填写调整动作；填了之后逾期解除，员工凭编号能查到。
  const noReply = await board.request(`/api/dashboard/feedback/suggestions/${anonCode}/status`, { status: '已调整' });
  assert.equal(noReply.status, 400);
  const adjusted = await board.request(`/api/dashboard/feedback/suggestions/${anonCode}/status`, { status: '已调整', reply: '已把排班表改为提前一周发布' });
  assert.equal(adjusted.status, 200);
  assert.equal(adjusted.body.suggestions.find(item => item.code === anonCode).overdue, false);
  const tracked = (await bob.action('suggestLookup', { code: anonCode })).body.trackedSuggestion;
  assert.equal(tracked.status, '已调整');
  assert.equal(tracked.reply, '已把排班表改为提前一周发布');

  // 协调事项状态流转。
  const coordId = feedback.coordinates[0].id;
  const progressed = await board.request(`/api/dashboard/feedback/coordinates/${coordId}/status`, { status: '协调中' });
  assert.equal(progressed.status, 200);
  assert.equal((await alice.tea()).body.coordinates[0].status, '协调中');
});

test('vents: anonymous on the wall, board can take a post down, hidden posts leave the wall and the feed', async t => {
  const { browser } = await fixture(t);
  const alice = browser();
  await alice.enterTea();
  await alice.rename('吐槽员工');
  const posted = await alice.action('vent', { body: '晚场空调太冷了，希望能调高两度。' });
  assert.equal(posted.status, 200, JSON.stringify(posted.body));
  assert.equal(posted.body.vents.length, 1);
  assert.doesNotMatch(JSON.stringify(posted.body.vents), /吐槽员工/);

  const bob = browser();
  await bob.enterTea();
  assert.equal((await bob.tea()).body.vents.length, 1);

  const board = browser();
  await board.unlockBoard();
  const feedback = (await board.request('/api/dashboard/feedback')).body;
  const ventId = feedback.vents[0].id;
  const hidden = await board.request(`/api/dashboard/feedback/vents/${ventId}/visibility`, { hidden: true });
  assert.equal(hidden.status, 200);
  assert.deepEqual((await bob.tea()).body.vents, []);
  const activity = (await bob.request('/api/tearoom/activity')).body;
  assert.equal(activity.items.filter(item => item.kind === 'vent').length, 0);
});

test('honors: three periods publish from the board and show on the tearoom wall without performance numbers', async t => {
  const { browser } = await fixture(t);
  const board = browser();
  await board.unlockBoard();
  for (const [periodType, personName] of [['month', '月星同事'], ['week', '周星同事'], ['yesterday', '昨日星同事']]) {
    const published = await board.request('/api/dashboard/honors', { periodType, personName, citation: '这一期表现特别温暖，值得大家学习。' });
    assert.equal(published.status, 201, JSON.stringify(published.body));
    assert.equal(published.body.periodLabel.length > 0, true);
  }
  // 员工账号（未解锁看板）不能发布荣誉。
  const staff = browser();
  await staff.login('recorder', 'record2026!');
  assert.equal((await staff.request('/api/dashboard/honors', { periodType: 'week', personName: '越权', citation: '不应成功' })).status, 403);

  const visitor = browser();
  await visitor.enterTea();
  const wall = (await visitor.request('/api/tearoom/honors')).body;
  assert.equal(wall.current.month.personName, '月星同事');
  assert.equal(wall.current.week.personName, '周星同事');
  assert.equal(wall.current.yesterday.personName, '昨日星同事');
  assert.equal(wall.history.length, 3);
  assert.doesNotMatch(JSON.stringify(wall), /orderAmount|业绩|实收|投流|退款/);
});

test('activity feed: new posts appear with light fields only; coordinates, suggestion and vent bodies never leak', async t => {
  const { browser } = await fixture(t);
  const alice = browser();
  await alice.enterTea();
  await alice.rename('动态员工');
  await alice.action('market', { type: '夜宵拼单', title: '下播后一起拼烧烤' });
  await alice.action('coordinate', { title: '协调标题不应出现', body: '协调正文绝密内容' });
  await alice.action('suggest', { body: '建议正文不应出现在动态' });
  await alice.action('vent', { body: '吐槽正文不应出现在动态' });

  const feed = (await alice.request('/api/tearoom/activity')).body;
  const market = feed.items.find(item => item.kind === 'market');
  assert.ok(market, JSON.stringify(feed.items));
  assert.equal(market.actorName, '动态员工');
  assert.match(market.text, /拼烧烤/);
  assert.equal(market.view, 'market');
  assert.ok(feed.items.some(item => item.kind === 'suggest' && item.actorName === null));
  assert.ok(feed.items.some(item => item.kind === 'vent' && item.actorName === null));
  assert.equal(feed.items.some(item => item.kind === 'coordinate'), false);
  const serialized = JSON.stringify(feed);
  assert.doesNotMatch(serialized, /协调正文绝密内容|协调标题不应出现|建议正文不应出现在动态|吐槽正文不应出现在动态/);
  // 未进入茶水间的浏览器拿不到动态。
  assert.equal((await browser().request('/api/tearoom/activity')).status, 401);
});
