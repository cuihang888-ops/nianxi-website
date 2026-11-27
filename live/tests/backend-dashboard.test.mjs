import test from 'node:test';
import assert from 'node:assert/strict';
import { createApplication } from '../server.mjs';

test('dashboard unlock protects finance routes and leaves basic entry available', async t => {
  const dashboardPassword = 'TestBoardPass';
  const app = createApplication({ dbPath: ':memory:', port: 0, dashboardPassword, today: '2026-11-25' });
  const address = await app.listen();
  t.after(() => app.close());
  const origin = `http://127.0.0.1:${address.port}`;
  app.store.setDataset({ kind: 'imported', label: '导入数据', cutoffDate: '2026-11-25', salesTotal: 9000, sourceWorkbook: 'private.xlsx' });
  const [session] = app.store.list('sessions');
  const savedSession = app.store.save('sessions', { ...session, slotId: 'slot-1', slotLabel: '早场', notes: '私密复盘', cogs: 400, shipping: 100 }, session.version, app.store.findUser('demo'));
  function call(path, { cookie, scope, data, method = data === undefined ? 'GET' : 'POST' } = {}) {
    return fetch(origin + path, {
      method,
      headers: { ...(cookie && { Cookie: cookie }), ...(scope && { 'X-Command-Scope': scope }), ...(data && { 'Content-Type': 'application/json' }) },
      body: data && JSON.stringify(data)
    });
  }
  async function login(username, password) {
    const response = await call('/api/login', { data: { username, password } });
    assert.equal(response.status, 200);
    return { cookie: response.headers.get('set-cookie').split(';')[0], result: await response.json() };
  }
  function unlock(cookie, password = dashboardPassword, mode) {
    return call('/api/dashboard/unlock', { cookie, data: { password, mode } });
  }
  const admin = await login('demo', 'demo2026!');
  const anotherSession = await login('demo', 'demo2026!');
  const staff = await login('recorder', 'record2026!');
  const staffService = await login('service', 'service2026!');
  const manager = await login('manager', 'manage2026!');
  assert.equal(admin.result.dashboardRequired, true);
  assert.equal(admin.result.dashboardUnlocked, false);
  assert.deepEqual(admin.result.dataset, { kind: 'imported', label: '导入数据' });
  assert.equal((await call('/api/me', { scope: 'dashboard' })).status, 401);
  assert.equal((await unlock(undefined, dashboardPassword, 'manage')).status, 401);
  assert.equal((await unlock(staff.cookie, dashboardPassword, 'manage')).status, 403);
  assert.equal(staff.result.dashboardRequired, false);
  assert.equal(staff.result.dashboardUnlocked, false);
  for (const session of [admin, staff, staffService]) {
    const entry = await call('/api/entry/bootstrap?date=2026-11-25', session);
    assert.equal(entry.status, 200);
    assert.ok((await entry.json()).sessions.every(item => !Object.hasOwn(item, 'orderAmount')));
  }
  for (const endpoint of ['/api/bootstrap', '/api/monthly?month=2026-11', '/api/audit', '/api/export.csv', '/api/users']) {
    const response = await call(endpoint, admin);
    assert.equal(response.status, 403, endpoint);
    assert.equal((await response.json()).code, 'DASHBOARD_LOCKED');
  }
  const pendingWrite = await call('/api/sessions', { cookie: admin.cookie, data: { orderAmount: 500 } });
  assert.equal(pendingWrite.status, 403);
  assert.equal((await pendingWrite.json()).code, 'DASHBOARD_LOCKED');
  const invalid = await call('/api/dashboard/unlock?include=dashboard', { data: { password: 'wrong code' } });
  assert.equal(invalid.status, 401);
  const invalidResult = await invalid.json();
  assert.equal(invalidResult.code, 'DASHBOARD_PASSWORD_INVALID');
  assert.equal(Object.hasOwn(invalidResult, 'sessions'), false);
  const allowed = await unlock();
  assert.equal(allowed.status, 200);
  const header = allowed.headers.get('set-cookie');
  assert.match(header, /^command_dashboard=/);
  assert.match(header, /HttpOnly/);
  const board = { cookie: header.split(';')[0], scope: 'dashboard' };
  const boardAccess = await allowed.json();
  assert.equal(boardAccess.user.role, 'dashboard_viewer');
  assert.equal(boardAccess.dashboardOnly, true);
  assert.equal(boardAccess.dashboardUnlocked, true);
  assert.equal((await call('/api/me', { cookie: staff.cookie + '; ' + board.cookie, scope: 'dashboard' }).then(response => response.json())).user.role, 'dashboard_viewer');
  assert.equal((await call('/api/me', { cookie: staff.cookie + '; ' + board.cookie }).then(response => response.json())).user.role, 'anchor_entry');
  const daily = await call('/api/bootstrap', board);
  assert.equal(daily.status, 200);
  const sales = await daily.json();
  const initial = await call('/api/dashboard/unlock?include=dashboard', { data: { password: dashboardPassword } });
  assert.equal(initial.status, 200);
  assert.equal(initial.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await initial.json(), sales);
  assert.deepEqual(sales.dataset, { kind: 'imported', label: '导入数据', cutoffDate: '2026-11-25' });
  assert.deepEqual(Object.keys(sales.accounts[0]), ['id', 'name', 'color']);
  const lookup = sales.sessions.find(item => item.id === savedSession.id);
  assert.equal(sales.anchors.find(item => item.id === lookup.anchorId).name, app.store.get('anchors', lookup.anchorId).name);
  for (const field of ['date', 'slotId', 'slotLabel', 'start', 'end', 'orderAmount', 'actualMinutes', 'orders', 'viewers', 'shares', 'newFollowers', 'reach', 'messages', 'qualified', 'adSpend', 'received', 'refunds']) {
    assert.equal(lookup[field], savedSession[field], field);
  }
  for (const field of ['notes', 'cogs', 'shipping', 'fees', 'otherCost', 'version', 'updatedBy', 'sourceWorkbook']) {
    assert.ok(!Object.hasOwn(lookup, field), field);
  }
  assert.equal(sales.users, undefined);
  assert.equal(sales.inventory, undefined);
  assert.equal(sales.tasks, undefined);
  for (const endpoint of ['/api/monthly?month=2026-11', '/api/audit', '/api/export.csv', '/api/users']) {
    const response = await call(endpoint, board);
    assert.equal(response.status, 403, endpoint);
    assert.equal((await response.json()).code, 'DASHBOARD_READ_ONLY');
  }
  assert.equal((await call('/api/sessions', { ...board, data: { orderAmount: 500 } })).status, 403);
  const publicEntry = await call('/api/entry/bootstrap?date=2026-11-25', board);
  assert.equal(publicEntry.status, 200);
  assert.equal((await publicEntry.json()).user.role, 'public_entry');
  assert.equal((await unlock(board.cookie, dashboardPassword, 'manage')).status, 401);
  const signOut = await call('/api/logout', { ...board, cookie: admin.cookie + '; ' + board.cookie, data: {} });
  assert.equal(signOut.status, 200);
  assert.match(signOut.headers.get('set-cookie'), /^command_dashboard=/);
  assert.equal((await call('/api/me', board)).status, 401);
  assert.equal((await call('/api/me', admin)).status, 200);
  assert.equal((await call('/api/bootstrap', admin)).status, 403);
  assert.equal((await unlock(admin.cookie, dashboardPassword, 'manage')).status, 200);
  assert.equal((await call('/api/me', admin).then(response => response.json())).dashboardUnlocked, true);
  assert.equal((await call('/api/bootstrap', admin)).status, 200);
  assert.equal((await call('/api/bootstrap', anotherSession)).status, 403);
  assert.equal((await call('/api/monthly?month=2026-11', admin)).status, 200);
  assert.equal((await call('/api/bootstrap', staff)).status, 403);
  await call('/api/logout', { cookie: admin.cookie, data: {} });
  assert.equal((await call('/api/bootstrap', admin)).status, 401);

  for (let i = 0; i < 5; i++) assert.equal((await unlock(manager.cookie, 'bad code', 'manage')).status, 401);
  const renewedManager = await login('manager', 'manage2026!');
  const rateLimited = await unlock(renewedManager.cookie, dashboardPassword, 'manage');
  assert.equal(rateLimited.status, 429);
  assert.equal((await rateLimited.json()).code, 'DASHBOARD_RATE_LIMITED');
  for (let i = 0; i < 6; i++) assert.equal((await unlock(undefined, 'bad code')).status, 401);
  assert.equal((await unlock()).status, 429);
  assert.equal((await call('/api/entry/bootstrap?date=2026-11-25', staff)).status, 200);
});
