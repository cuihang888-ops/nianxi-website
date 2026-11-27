import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createApplication, configuration } from '../server.mjs';
import { demoData } from '../lib/seed.mjs';

test('command center API preserves permissions, data and collaboration rules', async t => {
  const app = createApplication({ dbPath: ':memory:', port: 0, host: '127.0.0.1', demo: true, today: '2026-11-25' });
  const address = await app.listen();
  const base = `http://127.0.0.1:${address.port}`;
  t.after(() => app.close());
  async function call(path, { cookie, method = 'GET', data, origin, raw } = {}) {
    const response = await fetch(base + path, { method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(data !== undefined || raw !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(origin ? { Origin: origin } : {}) }, body: raw ?? (data !== undefined ? JSON.stringify(data) : undefined) });
    const content = await response.text();
    let json; try { json = JSON.parse(content); } catch { json = null; }
    return { status: response.status, json, content, headers: response.headers };
  }
  async function login(username, password) {
    const result = await call('/api/login', { method: 'POST', data: { username, password } });
    assert.equal(result.status, 200);
    assert.match(result.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
    return result.headers.get('set-cookie').split(';')[0];
  }
  let adminCookie; let editorCookie; let viewerCookie; let createdSession;
  await t.test('anonymous access is denied; no anonymous admin', async () => {
    assert.equal((await call('/api/bootstrap')).status, 401);
    assert.equal((await call('/api/export.csv')).status, 401);
    assert.equal((await call('/api/health')).status, 200);
  });
  await t.test('login and seeded Facebook data are consistent', async () => {
    adminCookie = await login('demo', 'demo2026!');
    editorCookie = await login('editor', 'editor2026!');
    viewerCookie = await login('viewer', 'viewer2026!');
    const result = await call('/api/bootstrap', { cookie: adminCookie });
    assert.equal(result.status, 200); assert.equal(result.json.demo, true);
    assert.equal(result.json.accounts.length, 5); assert.equal(result.json.anchors.length, 15);
    assert.equal(result.json.sessions.filter(item => item.date === '2026-11-25').length, 15);
    assert.equal(result.json.sessions.length, 375); assert.equal(result.json.currency, 'CNY');
    for (const item of result.json.sessions) {
      assert.ok(item.received <= item.orderAmount); assert.ok(item.refunds <= item.received);
      assert.ok(item.paidOrders <= item.orders); assert.ok(item.refundOrders <= item.paidOrders);
      assert.ok(item.watchSeconds < 600);
    }
    assert.ok(!JSON.stringify(result.json).includes('passwordHash'));
    assert.equal((await call('/api/me', { cookie: viewerCookie })).json.user.role, 'viewer');
  });
  await t.test('viewers cannot write or manage members', async () => {
    assert.equal((await call('/api/sessions', { cookie: viewerCookie, method: 'POST', data: {} })).status, 403);
    assert.equal((await call('/api/inventory', { cookie: viewerCookie, method: 'POST', data: {} })).status, 403);
    assert.equal((await call('/api/users', { cookie: editorCookie })).status, 403);
    assert.equal((await call('/api/bootstrap', { cookie: viewerCookie })).json.users, undefined);
  });
  await t.test('editor creates a scheduled session and identifiers are server owned', async () => {
    const input = { date: '2026-11-26', accountId: 'account-1', anchorId: 'anchor-1', start: '08:00', end: '12:00', target: 50000, notes: '=HYPERLINK("https://bad.invalid")' };
    const result = await call('/api/sessions', { cookie: editorCookie, method: 'POST', data: input });
    assert.equal(result.status, 201, result.content); createdSession = result.json.session;
    assert.equal(createdSession.version, 1); assert.equal(createdSession.orders, null); assert.equal(createdSession.updatedBy, '演示运营');
    assert.equal(createdSession.actualMinutes, null);
    assert.equal((await call('/api/sessions', { cookie: editorCookie, method: 'POST', data: { ...input, id: 'injected' } })).status, 400);
  });
  await t.test('same account and same anchor time conflicts are rejected', async () => {
    const input = { date: '2026-11-26', accountId: 'account-1', anchorId: 'anchor-2', start: '11:59', end: '13:00' };
    assert.equal((await call('/api/sessions', { cookie: editorCookie, method: 'POST', data: input })).status, 409);
    assert.equal((await call('/api/sessions', { cookie: editorCookie, method: 'POST', data: { ...input, accountId: 'account-2', anchorId: 'anchor-1' } })).status, 409);
    assert.equal((await call('/api/sessions', { cookie: editorCookie, method: 'POST', data: { ...input, start: '12:00' } })).status, 201);
  });
  await t.test('optimistic locking prevents one editor overwriting another', async () => {
    const first = await call(`/api/sessions/${createdSession.id}`, { cookie: editorCookie, method: 'PUT', data: { version: 1, orders: 2, paidOrders: 1, orderAmount: 5000, received: 2000, cogs: 900, status: 'completed' } });
    assert.equal(first.status, 200, first.content); assert.equal(first.json.session.version, 2);
    const stale = await call(`/api/sessions/${createdSession.id}`, { cookie: adminCookie, method: 'PUT', data: { version: 1, received: 1000 } });
    assert.equal(stale.status, 409); assert.equal(stale.json.current.received, 2000);
    assert.equal((await call(`/api/sessions/${createdSession.id}`, { cookie: editorCookie, method: 'PUT', data: { received: 1000 } })).status, 400);
  });
  await t.test('invalid numbers, dates, times and incompatible totals are rejected', async () => {
    const invalid = [{ orders: -1 }, { orders: 1.5 }, { adSpend: '120' }, { received: 6000 }, { refunds: 3000 }, { paidOrders: 3 }, { qualified: 2, messages: 1 }, { date: '2026-02-30' }, { start: '25:00' }, { end: '07:00' }, { arbitrary: 10 }];
    for (const change of invalid) {
      const response = await call(`/api/sessions/${createdSession.id}`, { cookie: editorCookie, method: 'PUT', data: { version: 2, ...change } });
      assert.equal(response.status, 400, JSON.stringify(change) + response.content);
    }
    assert.equal((await call(`/api/sessions/${createdSession.id}`, { cookie: editorCookie, method: 'PUT', raw: '{"version":2,"adSpend":NaN}' })).status, 400);
  });
  await t.test('actual duration accepts missing registration, zero and fractional minutes but not negative or nonnumeric values', async () => {
    let currentVersion = 2;
    for (const actualMinutes of [0, 215.5, null]) {
      const result = await call(`/api/sessions/${createdSession.id}`, { cookie: editorCookie, method: 'PUT', data: { version: currentVersion, actualMinutes } });
      assert.equal(result.status, 200, result.content);
      assert.equal(result.json.session.actualMinutes, actualMinutes);
      currentVersion++;
    }
    for (const actualMinutes of [-1, '240', {}, true]) assert.equal((await call(`/api/sessions/${createdSession.id}`, { cookie: editorCookie, method: 'PUT', data: { version: currentVersion, actualMinutes } })).status, 400);
    assert.equal((await call(`/api/sessions/${createdSession.id}`, { cookie: editorCookie, method: 'PUT', raw: `{"version":${currentVersion},"actualMinutes":NaN}` })).status, 400);
    const exported = await call('/api/export.csv?dateFrom=2026-11-26&dateTo=2026-11-26&accountId=account-1', { cookie: viewerCookie });
    assert.ok(exported.content.includes('实际直播时长(分钟)'));
    assert.ok(exported.content.includes('每实际直播小时销售额(CNY)'));
  });
  await t.test('cross origin write is rejected even with valid cookie', async () => {
    const response = await call('/api/tasks', { cookie: editorCookie, method: 'POST', data: {}, origin: 'https://evil.invalid' });
    assert.equal(response.status, 403);
  });
  await t.test('cash procurement inventory is separate and unique SKU is enforced', async () => {
    const input = { sku: 'JADE-TEST-001', name: '测试翡翠手镯', size: '56', supplier: '测试货主', purchaseDate: '2026-11-25', cost: 1200, sessionId: '', notes: '现金采购' };
    const result = await call('/api/inventory', { cookie: editorCookie, method: 'POST', data: input });
    assert.equal(result.status, 201, result.content); assert.equal(result.json.item.state, 'in_stock');
    const { cost, ...missingCost } = input;
    assert.equal((await call('/api/inventory', { cookie: editorCookie, method: 'POST', data: { ...missingCost, sku: 'MISSING-COST' } })).status, 400);
    assert.equal((await call('/api/inventory', { cookie: editorCookie, method: 'POST', data: input })).status, 409);
    const updated = await call(`/api/inventory/${result.json.item.id}`, { cookie: editorCookie, method: 'PUT', data: { version: 1, state: 'reserved', sessionId: createdSession.id } });
    assert.equal(updated.status, 200);
    const session = (await call('/api/bootstrap', { cookie: editorCookie })).json.sessions.find(item => item.id === createdSession.id);
    assert.equal(session.cogs, 900, 'procurement must not be deducted as period sales cost');
  });
  await t.test('review task carries evidence, action, owner and acceptance', async () => {
    const result = await call('/api/tasks', { cookie: editorCookie, method: 'POST', data: { title: '测试复盘', owner: '阿玉', due: '2026-11-27', sessionId: createdSession.id, evidence: '询单 10 人', action: '调整圈口货盘', acceptance: '对比下场付款数' } });
    assert.equal(result.status, 201, result.content);
    const update = await call(`/api/tasks/${result.json.task.id}`, { cookie: editorCookie, method: 'PUT', data: { version: 1, status: 'done' } });
    assert.equal(update.status, 200); assert.equal(update.json.task.version, 2);
  });
  await t.test('admin creates a viewer without leaking credential material', async () => {
    const created = await call('/api/users', { cookie: adminCookie, method: 'POST', data: { username: 'finance.view', password: 'OnlyForTest2026!', name: '财务查看', role: 'viewer' } });
    assert.equal(created.status, 201, created.content); assert.equal(created.json.user.role, 'viewer');
    assert.equal((await call('/api/users', { cookie: adminCookie, method: 'POST', data: { username: 'finance.view', password: 'OnlyForTest2026!', name: '重复', role: 'viewer' } })).status, 409);
    assert.ok(!JSON.stringify((await call('/api/users', { cookie: adminCookie })).json).includes('password'));
  });
  await t.test('admin replaces account and anchor names without breaking historical links', async () => {
    const change = await call('/api/accounts/account-1', { cookie: adminCookie, method: 'PUT', data: { version: 1, name: '实际账号一号', page: '实际 Facebook 页面' } });
    assert.equal(change.status, 200, change.content); assert.equal(change.json.account.version, 2);
    assert.equal((await call('/api/accounts/account-1', { cookie: editorCookie, method: 'PUT', data: { version: 2, name: '越权修改' } })).status, 403);
    assert.equal((await call('/api/accounts/account-1', { cookie: adminCookie, method: 'PUT', data: { version: 1, name: '陈旧版本' } })).status, 409);
    assert.equal((await call('/api/anchors/anchor-1', { cookie: adminCookie, method: 'PUT', data: { version: 1, name: '实际主播姓名' } })).status, 200);
    const current = (await call('/api/bootstrap', { cookie: adminCookie })).json;
    assert.equal(current.sessions.find(item => item.id === createdSession.id).accountId, 'account-1');
  });
  await t.test('CSV is date filtered and spreadsheet formula injection is neutralized', async () => {
    const result = await call('/api/export.csv?dateFrom=2026-11-26&dateTo=2026-11-26', { cookie: viewerCookie });
    assert.equal(result.status, 200); assert.match(result.content, /贡献利润未扣固定成本/);
    assert.match(result.content, /'=HYPERLINK/);
    for (const line of result.content.split('\r\n').slice(1)) assert.match(line, /^"[^"]+","2026-11-26"/);
    assert.equal((await call('/api/export.csv?dateFrom=2026-11-27&dateTo=2026-11-26', { cookie: viewerCookie })).status, 400);
  });
  await t.test('CSV respects account, anchor and status filters and includes full metrics', async () => {
    const result = await call('/api/export.csv?dateFrom=2026-11-25&dateTo=2026-11-25&accountId=account-2&anchorId=anchor-4&status=completed', { cookie: viewerCookie });
    assert.equal(result.status, 200);
    const lines = result.content.trim().split('\r\n');
    assert.equal(lines.length, 2, 'one matching session plus header');
    assert.match(lines[1], /session-2026-11-25-2-1/); assert.match(lines[1], /翠缘2号/); assert.match(lines[1], /阿明/);
    for (const label of ['目标成交额(CNY)', '触达人数(本场)', '峰值在线人数', '平均观看时长(秒)', '互动次数', '新增关注数', '退款订单数', '净售件数', '成交目标达成率', '变动成本合计(CNY)', '成交广告倍数(非利润ROI)']) assert.ok(lines[0].includes(label), label);
    assert.equal((await call('/api/export.csv?accountId=missing', { cookie: viewerCookie })).status, 400);
    assert.equal((await call('/api/export.csv?anchorId=missing', { cookie: viewerCookie })).status, 400);
    assert.equal((await call('/api/export.csv?status=invalid', { cookie: viewerCookie })).status, 400);
  });
  await t.test('audit records changes and user identities', async () => {
    const result = await call('/api/audit', { cookie: viewerCookie });
    assert.equal(result.status, 200); assert.ok(result.json.audit.length >= 6);
    const change = result.json.audit.find(row => row.entityId === createdSession.id && row.action === 'update' && row.after.version === 2);
    assert.equal(change.userName, '演示运营'); assert.equal(change.before.received, null); assert.equal(change.after.received, 2000);
    assert.ok(!JSON.stringify(result.json).includes('password'));
  });
  await t.test('logout invalidates the session', async () => {
    const result = await call('/api/logout', { cookie: viewerCookie, method: 'POST' });
    assert.equal(result.status, 200);
    assert.equal((await call('/api/me', { cookie: viewerCookie })).status, 401);
  });
  await t.test('login failures are generic and rate limited', async () => {
    for (let index = 0; index < 12; index++) {
      const response = await call('/api/login', { method: 'POST', data: { username: index % 2 ? 'demo' : 'missing', password: 'wrong' } });
      assert.equal(response.status, 401); assert.equal(response.json.error, '用户名或密码错误');
    }
    assert.equal((await call('/api/login', { method: 'POST', data: { username: 'demo', password: 'wrong' } })).status, 429);
  });
});

test('production configuration rejects insecure defaults and local demo cannot bind publicly', () => {
  assert.throws(() => configuration({ NODE_ENV: 'production' }), /ADMIN_PASSWORD/);
  assert.throws(() => configuration({ NODE_ENV: 'production', ADMIN_PASSWORD: 'demo2026!demo' }), /ADMIN_PASSWORD/);
  assert.throws(() => configuration({ HOST: '0.0.0.0' }), /演示模式/);
  assert.throws(() => configuration({ NODE_ENV: 'production', ADMIN_PASSWORD: 'UniqueJadeCenter2026!' }), /DASHBOARD_PASSWORD/);
  assert.throws(() => configuration({ NODE_ENV: 'production', ADMIN_PASSWORD: 'UniqueJadeCenter2026!', DASHBOARD_PASSWORD: 'UniqueJadeCenter2026!' }), /DASHBOARD_PASSWORD/);
  const value = configuration({ NODE_ENV: 'production', ADMIN_PASSWORD: 'UniqueJadeCenter2026!', DASHBOARD_PASSWORD: 'TestBoardPass', COOKIE_SECURE: 'true' });
  assert.equal(value.demo, false); assert.equal(value.cookieSecure, true);
});

test('production starts without business sample data', async t => {
  const app = createApplication({ dbPath: ':memory:', port: 0, host: '127.0.0.1', demo: false, adminPassword: 'UniqueJadeCenter2026!', adminUsername: 'boss' });
  t.after(() => app.close()); await app.listen();
  assert.equal(app.store.demo, false); assert.equal(app.store.list('sessions').length, 0);
  assert.equal(app.store.list('inventory').length, 0); assert.equal(app.store.users().length, 1);
  assert.equal(app.store.findUser('demo'), undefined);
  assert.throws(() => app.store.backfillDemoHistory('2026-11-25'), /不可写入正式业务数据/);
  const address = app.server.address();
  const login = await fetch(`http://127.0.0.1:${address.port}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'boss', password: 'UniqueJadeCenter2026!' }) });
  const session = await fetch(`http://127.0.0.1:${address.port}/api/sessions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: login.headers.get('set-cookie').split(';')[0] }, body: JSON.stringify({ date: '2026-11-25', accountId: 'account-1', anchorId: 'anchor-1', start: '08:00', end: '12:00' }) });
  assert.equal(session.status, 201);
  assert.equal((await session.json()).session.actualMinutes, null, 'production never assumes scheduled time is actual duration');
});

test('SQLite changes survive restart and demo database is refused in production', async t => {
  await mkdir(resolve('tmp'), { recursive: true });
  const directory = await mkdtemp(resolve('tmp', 'backend-persistence-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = resolve(directory, 'test.sqlite');
  const first = createApplication({ dbPath: path, port: 0, host: '127.0.0.1', demo: true, today: '2026-11-25' });
  await first.listen();
  const actor = first.store.users().find(user => user.role === 'admin');
  const existing = first.store.list('tasks')[0];
  first.store.save('tasks', { ...existing, action: '重启后保留的复盘行动' }, existing.version, actor);
  await first.close();
  const second = createApplication({ dbPath: path, port: 0, host: '127.0.0.1', demo: true });
  await second.listen();
  assert.equal(second.store.get('tasks', existing.id).action, '重启后保留的复盘行动');
  assert.equal(second.store.get('tasks', existing.id).version, 2);
  assert.equal(second.store.list('sessions').length, 375, 'restart must not reseed or duplicate records');
  await second.close();
  assert.throws(() => createApplication({ dbPath: path, demo: false, adminPassword: 'UniqueJadeCenter2026!' }), /演示数据库/);
});

test('demo history covers entire current month and fourteen preceding days across year boundary', () => {
  for (const [today, start, days] of [['2026-11-25', '2026-11-01', 25], ['2027-01-05', '2026-12-22', 15]]) {
    const { sessions, tasks, inventory } = demoData(today);
    assert.equal(sessions.length, days * 15);
    assert.equal(sessions[0].date, start);
    const dates = new Map();
    for (const item of sessions) dates.set(item.date, (dates.get(item.date) || 0) + 1);
    for (const count of dates.values()) assert.equal(count, 15);
    assert.equal(dates.size, days);
    const ids = new Set(sessions.map(item => item.id));
    assert.equal(ids.size, sessions.length);
    for (const item of [...tasks, ...inventory]) if (item.sessionId) assert.ok(ids.has(item.sessionId));
    const currentMonth = sessions.filter(item => item.date.startsWith(today.slice(0, 7)));
    assert.equal(currentMonth.length, Number(today.slice(8)) * 15);
    for (const account of ['account-1', 'account-2', 'account-3', 'account-4', 'account-5']) {
      const rows = currentMonth.filter(item => item.accountId === account);
      assert.equal(rows.length, Number(today.slice(8)) * 3);
      assert.ok(rows.reduce((sum, item) => sum + item.newFollowers, 0) > 0);
      assert.ok(rows.every(item => item.actualMinutes >= 180 && item.actualMinutes <= 245));
      assert.ok(rows.reduce((sum, item) => sum + item.actualMinutes, 0) >= rows.length * 180);
    }
  }
  const today = demoData('2026-11-25').sessions.find(item => item.id === 'session-2026-11-25-1-1');
  const nextDay = demoData('2026-11-26').sessions.find(item => item.id === today.id);
  assert.equal(today.newFollowers, nextDay.newFollowers);
  assert.equal(today.orderAmount, nextDay.orderAmount, 'same calendar day seed is stable as the comparison window advances');
});

test('legacy demo history backfill preserves edits, legacy session IDs and all linked records', async t => {
  const app = createApplication({ dbPath: ':memory:', port: 0, host: '127.0.0.1', demo: true, today: '2026-11-25' });
  await app.listen(); t.after(() => app.close());
  for (const item of app.store.list('sessions')) {
    if (item.date < '2026-11-18') app.store.db.prepare('DELETE FROM entities WHERE kind=? AND id=?').run('sessions', item.id);
  }
  const item = app.store.list('sessions').find(row => row.date === '2026-11-25' && row.accountId === 'account-1' && row.start === '08:00');
  const oldId = item.id;
  item.id = 'session-7-1-1';
  item.notes = '用户已修改的历史演示记录'; item.newFollowers = 777; item.version = 4;
  item.updatedBy = '实际运营'; delete item.actualMinutes;
  app.store.db.prepare('UPDATE entities SET id=?,version=?,data=? WHERE kind=? AND id=?').run(item.id, item.version, JSON.stringify(item), 'sessions', oldId);
  const originalTasks = app.store.list('tasks');
  const originalInventory = app.store.list('inventory');
  const legacyDuration = app.store.list('sessions').find(row => row.id !== item.id);
  delete legacyDuration.actualMinutes;
  app.store.db.prepare('UPDATE entities SET data=? WHERE kind=? AND id=?').run(JSON.stringify(legacyDuration), 'sessions', legacyDuration.id);
  assert.equal(app.store.list('sessions').length, 120);
  assert.equal(app.store.backfillDemoHistory('2026-11-25'), 255);
  assert.equal(app.store.list('sessions').length, 375);
  assert.deepEqual(app.store.get('sessions', 'session-7-1-1'), item);
  const migrated = app.store.get('sessions', legacyDuration.id);
  assert.equal(migrated.actualMinutes, 240);
  assert.equal(migrated.version, legacyDuration.version);
  assert.equal(migrated.updatedAt, legacyDuration.updatedAt);
  assert.deepEqual(app.store.list('tasks'), originalTasks);
  assert.deepEqual(app.store.list('inventory'), originalInventory);
  assert.equal(app.store.get('sessions', oldId), undefined, 'must not recreate a second session at legacy occupied date/account/time');
  assert.equal(app.store.backfillDemoHistory('2026-11-25'), 0, 'backfill is idempotent');
  const byDate = new Map();
  for (const row of app.store.list('sessions')) byDate.set(row.date, (byDate.get(row.date) || 0) + 1);
  assert.equal(byDate.size, 25); for (const count of byDate.values()) assert.equal(count, 15);
});

test('nullable real metrics, unknown schedules and imported data remain separate from demonstrations', async t => {
  await mkdir(resolve('tmp'), { recursive: true });
  const directory = await mkdtemp(resolve('tmp', 'backend-imported-'));
  const path = resolve(directory, 'preview.sqlite');
  const preparation = createApplication({ dbPath: path, port: 0, host: '127.0.0.1', demo: true, today: '2026-11-25' });
  await preparation.listen();
  preparation.store.setDataset({ kind: 'imported', label: '2026FB销售真实导入', sourceFile: '2026FB销售.xlsx', sourceSheet: '11月', cutoffDate: '2026-11-25' });
  preparation.store.db.prepare('DELETE FROM entities WHERE kind IN (?,?,?)').run('sessions', 'inventory', 'tasks');
  const source = { id: 'import-real-1', date: '2026-11-25', accountId: 'account-1', anchorId: 'anchor-1', start: '00:00', end: '00:01', status: 'completed', scheduleUnknown: true, slotLabel: '第1场（时段待补）', sourceStatus: 'reported', sourceCell: 'H8', sourceSheet: '11月', orderAmount: 1200, version: 1, updatedAt: '2026-11-25T12:00:00Z', updatedBy: '真实表格导入' };
  for (const key of ['target', 'reach', 'viewers', 'peak', 'watchSeconds', 'interactions', 'newFollowers', 'messages', 'qualified', 'orders', 'paidOrders', 'received', 'refundOrders', 'refunds', 'units', 'cogs', 'adSpend', 'shipping', 'fees', 'otherCost', 'actualMinutes']) source[key] = null;
  preparation.store.insert('sessions', source);
  await preparation.close();
  const app = createApplication({ dbPath: path, port: 0, host: '127.0.0.1', demo: true, mode: 'imported', today: '2026-11-25' });
  await app.listen();
  t.after(async () => { await app.close(); await rm(directory, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const login = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'demo', password: 'demo2026!' }) });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  assert.equal((await login.json()).demo, false);
  const boot = await (await fetch(base + '/api/bootstrap', { headers: { Cookie: cookie } })).json();
  assert.equal(boot.demo, false); assert.equal(boot.dataset.kind, 'imported'); assert.equal(boot.sessions.length, 1);
  assert.equal(app.store.backfillDemoHistory('2026-11-25'), 0);
  assert.deepEqual(app.store.get('sessions', source.id), source);
  async function update(data) {
    const response = await fetch(`${base}/api/sessions/${source.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(data) });
    return { status: response.status, data: await response.json() };
  }
  const first = await update({ version: 1, orders: 0, newFollowers: null, actualMinutes: null, notes: '未知保持空白' });
  assert.equal(first.status, 200, JSON.stringify(first.data)); assert.equal(first.data.session.orders, 0); assert.equal(first.data.session.newFollowers, null);
  assert.equal(first.data.session.sourceCell, 'H8'); assert.equal(first.data.session.scheduleUnknown, true);
  assert.equal((await update({ version: 2, sourceCell: 'H9' })).status, 400);
  assert.equal((await update({ version: 2, scheduleUnknown: 'false' })).status, 400);
  const second = await update({ version: 2, orders: null, messages: null, qualified: 5 });
  assert.equal(second.status, 200, 'a known field is allowed when its validation denominator is unknown');
  const created = await fetch(base + '/api/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ date: source.date, accountId: 'account-1', anchorId: 'anchor-1', start: '00:00', end: '00:01', scheduleUnknown: true }) });
  assert.equal(created.status, 201, 'unknown schedules must not cause invented time conflicts');
  const added = (await created.json()).session;
  assert.equal(added.orders, null); assert.equal(added.received, null); assert.equal(added.orderAmount, null);
  const scheduled = await fetch(base + '/api/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ date: source.date, accountId: 'account-1', anchorId: 'anchor-1', start: '00:00', end: '00:01' }) });
  assert.equal(scheduled.status, 201, 'known schedule may overlap an unknown placeholder');
  const csv = await (await fetch(base + '/api/export.csv?dateFrom=2026-11-25&dateTo=2026-11-25', { headers: { Cookie: cookie } })).text();
  const lines = csv.trim().split('\r\n');
  const cells = line => [...line.matchAll(/"((?:[^"]|"")*)"(?:,|$)/g)].map(match => match[1].replaceAll('""', '"'));
  const headers = cells(lines[0].replace(/^\ufeff/, ''));
  const row = cells(lines.find(line => line.startsWith('"import-real-1"')));
  const value = label => row[headers.indexOf(label)];
  assert.equal(value('确认成交额(CNY)'), '1200');
  for (const label of ['开始', '结束', '排期时长(小时)', '实际直播时长(分钟)', '累计回款退款前(CNY)', '净回款(CNY)', '变动成本合计(CNY)', '贡献利润未扣固定成本(CNY)', '每实际直播小时销售额(CNY)', '千次观看回款(CNY)', '成交广告倍数(非利润ROI)']) assert.equal(value(label), '', label);
  const knownZero = await update({ version: 3, received: 0, refunds: 0, cogs: 0, adSpend: 0, shipping: 0, fees: 0, otherCost: 0 });
  assert.equal(knownZero.status, 200); assert.equal(knownZero.data.session.received, 0);
});
