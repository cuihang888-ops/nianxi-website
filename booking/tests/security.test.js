'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { once } = require('node:events');
const { createServer } = require('../server');
const { initializeAdmins } = require('../lib/auth');
const OWNER = 'Owner-isolated-88!', STAFF = 'Staff-isolated-77!';
async function fixture(t, { legacyPolicy = false } = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'room-security-'));
  const legacyFile = path.join(dataDir, 'bookings.json');
  fs.writeFileSync(legacyFile, '{"version":2,"bookings":[]}');
  fs.writeFileSync(path.join(dataDir, 'sellers.json'), '{"version":1,"talents":[],"schedules":[]}');
  initializeAdmins(dataDir, { ownerPassword: OWNER, staffPassword: STAFF });
  const adminBytes = fs.readFileSync(path.join(dataDir, 'admins.json'));
  if (legacyPolicy) {
    fs.mkdirSync(path.join(dataDir, 'security'));
    const salt = crypto.randomBytes(16).toString('hex');
    fs.writeFileSync(path.join(dataDir, 'security/policy.json'), JSON.stringify({
      version: 1, enabled: true, revision: 'previous-release', salt,
      hash: crypto.scryptSync('Old-company-code', salt, 64).toString('hex')
    }));
  }
  let server, base;
  async function start() {
    server = createServer({ dataDir, legacyFile, now: () => new Date('2026-10-15T06:00:00Z') });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    base = `http://127.0.0.1:${server.address().port}`;
  }
  async function stop() {
    const closed = new Promise(resolve => server.close(resolve));
    server.closeAllConnections?.(); await closed;
  }
  await start();
  t.after(async () => {
    await stop();
    assert.deepEqual(fs.readFileSync(path.join(dataDir, 'admins.json')), adminBytes);
    const resolved = fs.realpathSync(dataDir);
    assert.equal(path.dirname(resolved), fs.realpathSync(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith('room-security-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  async function request(method, route, body, session = {}, extra = {}) {
    const headers = { ...extra };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (session.cookie) headers.Cookie = session.cookie;
    if (session.csrfToken) headers['X-CSRF-Token'] = session.csrfToken;
    const response = await fetch(base + route, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await response.text();
    let json; try { json = JSON.parse(text); } catch {}
    return { status: response.status, json, text, cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }
  async function login(password) {
    const result = await request('POST', '/api/login', { password });
    assert.equal(result.status, 200);
    return { cookie: result.cookie, csrfToken: result.json.csrfToken };
  }
  const owner = await login(OWNER), staff = await login(STAFF);
  return { dataDir, legacyFile, request, owner, staff, restart: async () => { await stop(); await start(); }, login };
}
const booking = { date: '2026-10-16', room: '一期五号直播间', slot: 'morning', department: '直播一部', bookerName: '张三', clientId: 'isolated-device' };
test('所有人可直接查看，无策略或遗留公司口令均不限制公开读取，重启后保持', async t => {
  for (const legacyPolicy of [false, true]) {
    const app = await fixture(t, { legacyPolicy });
    const policyFile = path.join(app.dataDir, 'security/policy.json');
    const before = legacyPolicy ? fs.readFileSync(policyFile) : null;
    for (let pass = 0; pass < 2; pass++) {
      for (const route of ['/api/config', '/api/rooms', '/api/talents', '/api/bookings?date=2026-10-16', '/api/schedules?date=2026-10-16']) {
        assert.equal((await app.request('GET', route)).status, 200, route);
      }
      const access = await app.request('GET', '/api/access');
      assert.deepEqual(access.json, { required: false, authorized: true, viewer: null });
      assert.match(access.cookie, /^room_visitor=/);
      if (pass === 0) await app.restart();
    }
    if (before) assert.deepEqual(fs.readFileSync(policyFile), before);
    else assert.equal(fs.existsSync(policyFile), false);
  }
});
test('访客不能预约、释放、维护卖手或排班，伪造身份和旧设备标识均无效', async t => {
  const app = await fixture(t);
  const created = await app.request('POST', '/api/book', booking, app.owner);
  assert.equal(created.status, 201);
  const files = [app.legacyFile, path.join(app.dataDir, 'sellers.json')];
  const before = files.map(filename => fs.readFileSync(filename));
  for (const [method, route, body] of [
    ['POST', '/api/book', { ...booking, slot: 'evening' }],
    ['POST', '/api/cancel', { id: created.json.booking.id, clientId: booking.clientId }],
    ['POST', '/api/talents', { name: '伪造人员', number: '0001' }],
    ['PATCH', '/api/talents/fake-id', { name: '伪造' }],
    ['POST', '/api/schedules', { startDate: booking.date }],
    ['PATCH', '/api/schedules/fake-id', { business: 'FB' }],
    ['DELETE', '/api/schedules/fake-id', undefined]
  ]) {
    assert.equal((await app.request(method, route, body, {}, { 'X-Role': 'owner', Cookie: 'room_view=old-view-cookie' })).status, 401, route);
    assert.equal((await app.request(method, route, body, { cookie: app.owner.cookie })).status, 403, route);
  }
  files.forEach((filename, index) => assert.deepEqual(fs.readFileSync(filename), before[index]));
  assert.equal((await app.request('POST', '/api/cancel', { id: created.json.booking.id }, app.staff)).status, 200);
  assert.equal((await app.request('POST', '/api/book', booking, app.staff)).status, 201);
});
test('日志仅负责人可见，旧公司验证及设置入口不可重新启用', async t => {
  const app = await fixture(t, { legacyPolicy: true });
  assert.equal((await app.request('GET', '/api/audit')).status, 401);
  assert.equal((await app.request('GET', '/api/audit', undefined, app.staff)).status, 403);
  assert.equal((await app.request('GET', '/api/audit', undefined, app.owner)).status, 200);
  assert.equal((await app.request('POST', '/api/company-login', { name: '旧员工', password: 'Old-company-code' })).status, 404);
  assert.equal((await app.request('POST', '/api/access-settings', { enabled: true, password: 'Any-new-code' }, app.owner)).status, 404);
  for (const route of ['/api/access-settings', '/data/security/policy.json', '/data/security/audit.jsonl', '/security/audit.jsonl']) {
    assert.equal((await app.request('GET', route, undefined, app.owner)).status, 404);
  }
});
test('公开查看按浏览器记录，微信标记不冒充真实昵称头像，忽略伪造身份和转发IP', async t => {
  const app = await fixture(t);
  const visitor = await app.request('GET', '/api/access');
  const session = { cookie: visitor.cookie };
  const headers = { 'User-Agent': 'Mozilla/5.0 MicroMessenger/8.0.63', 'X-Forwarded-For': '8.8.8.8' };
  assert.equal((await app.request('POST', '/api/view-events', {
    kind: 'rooms', date: '2026-10-16', nickname: '冒充的微信名', avatar: 'https://fake.example/avatar.png'
  }, session, headers)).status, 200);
  const logs = await app.request('GET', '/api/audit?category=view&day=2026-10-15', undefined, app.owner);
  assert.equal(logs.json.total, 1);
  assert.equal(logs.json.visitors, 1);
  assert.equal(logs.json.wechatViews, 1);
  assert.equal(logs.json.wechatIdentity.connected, false);
  const [entry] = logs.json.entries;
  assert.equal(entry.actor.name, '微信访客（未授权昵称）');
  assert.equal(entry.actor.source, 'browser');
  assert.equal(entry.actor.browser, 'wechat');
  assert.equal(entry.ip, '127.0.0.1');
  assert.ok(!JSON.stringify(logs.json).includes('冒充的微信名'));
  assert.ok(!JSON.stringify(logs.json).includes('fake.example'));
  assert.equal((await app.request('POST', '/api/view-events', { kind: 'rooms' }, session, { Origin: 'http://evil.example' })).status, 403);
});
test('同一IP不同浏览器分别记录，同设备定时读取一分钟合并且真实页面查看保留', async t => {
  const app = await fixture(t);
  const first = await app.request('GET', '/api/access'), second = await app.request('GET', '/api/access');
  assert.notEqual(first.cookie, second.cookie);
  for (const cookie of [first.cookie, first.cookie, second.cookie]) {
    assert.equal((await app.request('GET', '/api/config', undefined, { cookie })).status, 200);
  }
  for (const kind of ['rooms', 'schedule']) {
    assert.equal((await app.request('POST', '/api/view-events', { kind, date: '2026-10-16' }, { cookie: first.cookie })).status, 200);
  }
  const logs = await app.request('GET', '/api/audit?category=view&day=2026-10-15', undefined, app.owner);
  assert.equal(logs.json.total, 4);
  assert.equal(logs.json.visitors, 2);
  assert.equal(logs.json.entries.filter(entry => entry.path === '/api/config').length, 2);
  assert.ok(logs.json.entries.some(entry => entry.action === '查看场地'));
  assert.ok(logs.json.entries.some(entry => entry.action === '查看卖手排班'));
});
test('日志按北京时间筛选，记录登录结果且不泄露密码、管理会话和CSRF', async t => {
  const app = await fixture(t);
  assert.equal((await app.request('POST', '/api/login', { password: 'bad-secret-admin' })).status, 401);
  await app.request('POST', '/api/view-events', { kind: 'rooms' });
  const filename = path.join(app.dataDir, 'security/audit.jsonl');
  const sample = JSON.parse(fs.readFileSync(filename, 'utf8').trim().split('\n').at(-1));
  fs.appendFileSync(filename, JSON.stringify({ ...sample, id: 'next-shanghai-day', time: '2026-10-15T16:10:00.000Z' }) + '\n');
  const next = await app.request('GET', '/api/audit?category=view&day=2026-10-16', undefined, app.owner);
  assert.deepEqual(next.json.entries.map(entry => entry.id), ['next-shanghai-day']);
  const failures = await app.request('GET', '/api/audit?category=login&outcome=failed', undefined, app.owner);
  assert.ok(failures.json.entries.some(entry => entry.action === '管理员登录'));
  const bytes = fs.readFileSync(filename, 'utf8');
  for (const secret of [OWNER, STAFF, 'bad-secret-admin', app.owner.cookie, app.owner.csrfToken, app.staff.cookie]) assert.ok(!bytes.includes(secret));
  for (let index = 0; index < 7; index++) assert.equal((await app.request('POST', '/api/login', { password: 'bad-again' })).status, 401);
  assert.equal((await app.request('POST', '/api/login', { password: 'bad-again' })).status, 429);
});
