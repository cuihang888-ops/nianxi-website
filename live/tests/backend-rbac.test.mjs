import test from 'node:test';
import assert from 'node:assert/strict';
import { createApplication } from '../server.mjs';

const financial = ['orderAmount', 'target', 'received', 'refunds', 'cogs', 'cost', 'adSpend', 'fees', 'shipping', 'otherCost', 'notes', 'passwordHash', 'salesTotal', 'hash', 'inventory', 'tasks', 'users'];
function assertSafe(value) {
  if (value === null || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) { assert.ok(!financial.includes(key), `leaked restricted key ${key}`); assertSafe(child); }
}
function assertPublicEntrySafe(session) {
  const { orderAmount, ...otherFields } = session;
  assert.ok(orderAmount === null || Number.isFinite(orderAmount));
  assertSafe(otherFields);
}

test('staff entry domains and management RBAC are enforced on the server', async t => {
  const app = createApplication({ dbPath: ':memory:', port: 0, host: '127.0.0.1', demo: true, today: '2026-11-25' });
  await app.listen(); t.after(() => app.close());
  app.store.setDataset({ kind: 'imported', label: '真实销售导入', salesTotal: 888888, hash: 'private-file-hash', sourceFile: 'secret.xlsx' });
  const base = `http://127.0.0.1:${app.server.address().port}`;
  async function api(path, { cookie, scope, method = 'GET', data, raw } = {}) {
    const response = await fetch(base + path, { method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(scope ? { 'X-Command-Scope': scope } : {}), ...(data !== undefined || raw !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: raw ?? (data !== undefined ? JSON.stringify(data) : undefined) });
    return { status: response.status, json: await response.json() };
  }
  async function login(username, password) {
    const response = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
    assert.equal(response.status, 200);
    return { cookie: response.headers.get('set-cookie').split(';')[0], json: await response.json() };
  }
  const anchorLogin = await login('recorder', 'record2026!');
  const serviceLogin = await login('service', 'service2026!');
  const managerLogin = await login('manager', 'manage2026!');
  const adminLogin = await login('demo', 'demo2026!');
  const anchorCookie = anchorLogin.cookie; const serviceCookie = serviceLogin.cookie;
  for (const login of [anchorLogin, serviceLogin]) assertSafe(login.json);
  await t.test('employee authentication and entry payloads reveal no financial or private dataset data', async () => {
    for (const cookie of [anchorCookie, serviceCookie]) {
      const me = await api('/api/me', { cookie }); assert.equal(me.status, 200); assertSafe(me.json);
      assert.deepEqual(me.json.dataset, { kind: 'imported', label: '真实销售导入' });
      const result = await api('/api/entry/bootstrap?date=2026-11-25', { cookie });
      assert.equal(result.status, 200); assertSafe(result.json); assert.equal(result.json.accounts.length, 5);
      assert.equal(result.json.anchors.length, 15); assert.equal(result.json.sessions.length, 15);
      assert.ok(result.json.sessions.every(item => item.version && item.id));
      for (const account of result.json.accounts) assert.deepEqual(Object.keys(account), ['id', 'name']);
    }
    const a = (await api('/api/entry/bootstrap?date=2026-11-25', { cookie: anchorCookie })).json.sessions[0];
    const s = (await api('/api/entry/bootstrap?date=2026-11-25', { cookie: serviceCookie })).json.sessions[0];
    assert.equal(a.orders, undefined); assert.equal(a.messages, undefined); assert.ok(Object.hasOwn(a, 'views'));
    assert.equal(s.reach, undefined); assert.equal(s.actualMinutes, undefined); assert.ok(Object.hasOwn(s, 'orders'));
  });
  await t.test('employee roles are denied every management endpoint including write and exports', async () => {
    const paths = ['/api/bootstrap', '/api/audit', '/api/export.csv', '/api/users'];
    for (const cookie of [anchorCookie, serviceCookie]) {
      for (const path of paths) { const result = await api(path, { cookie }); assert.equal(result.status, 403, path); assertSafe(result.json); }
      for (const path of ['/api/sessions', '/api/inventory', '/api/tasks', '/api/accounts/account-1', '/api/anchors/anchor-1']) {
        const result = await api(path, { cookie, method: path.includes('/accounts/') || path.includes('/anchors/') ? 'PUT' : 'POST', data: {} });
        assert.equal(result.status, 403, path); assertSafe(result.json);
      }
    }
  });
  await t.test('public entry reads and corrects session sales without exposing other private fields', async () => {
    const day = '2026-11-28';
    const url = `/api/entry/bootstrap?date=${day}`;
    const directory = await api(url);
    assert.equal(directory.status, 200);
    assert.equal(directory.json.user.role, 'public_entry');
    assert.deepEqual(directory.json.sessions, []);
    assertSafe(directory.json);
    const create = { date: day, accountId: 'account-1', anchorId: 'anchor-1', orderAmount: 330.237, orders: 5, actualMinutes: 95, impressions: 360, shares: 4, newFollowers: 3 };
    const created = await api('/api/entry/sessions', { method: 'POST', data: create });
    assert.equal(created.status, 201);
    assertPublicEntrySafe(created.json.session);
    const { id, version } = created.json.session;
    assert.equal(created.json.session.salesRecorded, true);
    assert.equal(created.json.session.orderAmount, 330.24);
    assert.equal(created.json.session.impressions, 360);
    assert.equal(created.json.session.viewers, null);
    assert.equal(app.store.get('sessions', id).views, null);
    assert.equal(created.json.session.actualMinutes, 95);
    assert.equal(created.json.session.orders, 5);
    assert.equal(created.json.session.updatedBy, undefined);
    assert.equal(app.store.get('sessions', id).orderAmount, 330.24);
    const stored = (await api(url)).json.sessions[0];
    assertPublicEntrySafe(stored);
    assert.equal(stored.salesRecorded, true);
    assert.equal(stored.orderAmount, 330.24);
    assert.equal(stored.actualStart, undefined);
    const forcedPublic = await api(url, { cookie: serviceCookie, scope: 'public-entry' });
    assert.equal(forcedPublic.json.user.role, 'public_entry');
    assert.equal(forcedPublic.json.sessions[0].impressions, 360);
    const duplicate = await api('/api/entry/sessions', { method: 'POST', data: create });
    assert.equal(duplicate.status, 409);
    assertPublicEntrySafe(duplicate.json.current);
    const legacy = await api(`/api/entry/sessions/${id}`, { method: 'PUT', data: { version, viewers: 140 } });
    assert.equal(legacy.status, 200);
    assert.equal(legacy.json.session.impressions, 360);
    const result = await api(`/api/entry/sessions/${id}`, { method: 'PUT', data: { version: legacy.json.session.version, impressions: 0, shares: 3, actualMinutes: 1440 } });
    assert.equal(result.status, 200);
    assertPublicEntrySafe(result.json.session);
    assert.equal(result.json.session.viewers, 140);
    assert.equal(result.json.session.impressions, 0);
    assert.equal(result.json.session.shares, 3);
    assert.equal(result.json.session.actualMinutes, 1440);
    assert.equal(app.store.get('sessions', id).orderAmount, 330.24);
    const stale = await api(`/api/entry/sessions/${id}`, { method: 'PUT', data: { version, orderAmount: 410.50 } });
    assert.equal(stale.status, 409);
    assertPublicEntrySafe(stale.json.current);
    assert.equal(stale.json.current.salesRecorded, true);
    assert.equal(stale.json.current.orderAmount, 330.24);
    for (const patch of [{ paidOrders: 1 }, { received: 4 }, { orderAmount: -1 }, { orderAmount: '410.50' }, { actualMinutes: 1441 }, { actualMinutes: 0.5 }, { impressions: -1 }, { impressions: 0.5 }]) {
      const invalid = await api(`/api/entry/sessions/${id}`, { method: 'PUT', data: { version: result.json.session.version, ...patch } });
      assert.equal(invalid.status, 400, JSON.stringify(patch));
      assertSafe(invalid.json);
    }
    const corrected = await api(`/api/entry/sessions/${id}`, { method: 'PUT', data: { version: result.json.session.version, orderAmount: 410.50 } });
    assert.equal(corrected.status, 200);
    assert.equal(corrected.json.session.orderAmount, 410.50);
    assert.equal(corrected.json.session.orders, 5);
    assert.equal(corrected.json.session.impressions, 0);
    assert.equal((await api(url)).json.sessions[0].orderAmount, 410.50);
    const cleared = await api(`/api/entry/sessions/${id}`, { method: 'PUT', data: { version: corrected.json.session.version, orderAmount: null } });
    assert.equal(cleared.status, 200);
    assert.equal(cleared.json.session.orderAmount, null);
    assert.equal(cleared.json.session.salesRecorded, false);
    const zero = await api(`/api/entry/sessions/${id}`, { method: 'PUT', data: { version: cleared.json.session.version, orderAmount: 0 } });
    assert.equal(zero.status, 200);
    assert.equal(zero.json.session.orderAmount, 0);
    assert.equal(zero.json.session.salesRecorded, true);
    assert.equal(app.store.audit().find(event => event.entityId === id).userName, '匿名录入');
    assert.equal((await api('/api/bootstrap')).status, 401);
    assert.equal((await api('/api/sessions', { method: 'POST', data: create })).status, 401);
  });
  let created;
  await t.test('anchor can enter every room with separate Facebook count meanings and automatic cross-day duration', async () => {
    const result = await api('/api/entry/sessions', { cookie: anchorCookie, method: 'POST', data: { date: '2026-11-26', accountId: 'account-5', anchorId: 'anchor-15', actualStart: '2026-11-26T23:30', actualEnd: '2026-11-27T01:15', views: 4500, viewers: 1800, impressions: 8300, reach: 3000, reactions: 230, comments: 64, shares: 19, linkClicks: 46, newFollowers: 42, peak: 150 } });
    assert.equal(result.status, 201, JSON.stringify(result.json)); assertSafe(result.json);
    created = result.json.session;
    assert.equal(created.actualMinutes, 105); assert.equal(created.views, 4500); assert.equal(created.viewers, 1800); assert.equal(created.impressions, 8300); assert.equal(created.reach, 3000);
    assert.equal(app.store.get('sessions', created.id).orderAmount, null);
    assert.equal(created.slotId, 'anchor-15');
    const duplicate = await api('/api/entry/sessions', { cookie: serviceCookie, method: 'POST', data: { date: '2026-11-26', accountId: 'account-5', anchorId: 'anchor-15', orders: 3 } });
    assert.equal(duplicate.status, 409); assertSafe(duplicate.json);
  });
  await t.test('service writes order counts only, and stale versions return domain-safe data', async () => {
    const update = await api(`/api/entry/sessions/${created.id}`, { cookie: serviceCookie, method: 'PUT', data: { version: 1, orders: 10, paidOrders: 7, units: 8, refundOrders: 1, messages: 40, qualified: 22 } });
    assert.equal(update.status, 200, JSON.stringify(update.json)); assertSafe(update.json);
    assert.equal(update.json.session.orders, 10); assert.equal(update.json.session.reach, undefined);
    const stale = await api(`/api/entry/sessions/${created.id}`, { cookie: anchorCookie, method: 'PUT', data: { version: 1, reach: 4000 } });
    assert.equal(stale.status, 409); assertSafe(stale.json); assert.equal(stale.json.current.orders, undefined);
    assert.equal(stale.json.current.reach, 3000);
    assert.equal(app.store.get('sessions', created.id).actualMinutes, 105);
  });
  await t.test('field forgery, direct durations and ownership changes are rejected', async () => {
    for (const [cookie, patch] of [
      [anchorCookie, { orderAmount: 9999 }], [anchorCookie, { actualMinutes: 999 }], [anchorCookie, { orders: 10 }],
      [serviceCookie, { reach: 1000 }], [serviceCookie, { notes: 'overwrite' }], [serviceCookie, { target: 888 }],
      [anchorCookie, { date: '2026-11-27' }], [anchorCookie, { accountId: 'account-1' }], [anchorCookie, { anchorId: 'anchor-1' }]
    ]) {
      const result = await api(`/api/entry/sessions/${created.id}`, { cookie, method: 'PUT', data: { version: 2, ...patch } });
      assert.equal(result.status, 400, JSON.stringify(patch)); assertSafe(result.json);
    }
    const missing = await api(`/api/entry/sessions/${created.id}`, { cookie: anchorCookie, method: 'PUT', data: { reach: 10 } });
    assert.equal(missing.status, 400); assertSafe(missing.json);
  });
  await t.test('invalid time pairs, duration boundaries and count values are rejected', async () => {
    for (const patch of [
      { actualStart: '2026-11-26T22:00' }, { actualStart: '2026-11-26T23:00', actualEnd: null },
      { actualStart: '2026-11-26T23:00', actualEnd: '2026-11-26T23:00' },
      { actualStart: '2026-11-26T23:00', actualEnd: '2026-11-26T22:59' },
      { actualStart: '2026-11-26T23:00', actualEnd: '2026-11-27T23:01' },
      { actualStart: '2026-11-27T00:00', actualEnd: '2026-11-27T01:00' },
      { actualStart: '2026-11-26T24:00', actualEnd: '2026-11-27T01:00' },
      { views: -1 }, { views: 1.5 }, { impressions: '3000' }, { actualStart: '', actualEnd: '' }
    ]) assert.equal((await api(`/api/entry/sessions/${created.id}`, { cookie: anchorCookie, method: 'PUT', data: { version: 2, ...patch } })).status, 400, JSON.stringify(patch));
    const fullDay = await api(`/api/entry/sessions/${created.id}`, { cookie: anchorCookie, method: 'PUT', data: { version: 2, actualStart: '2026-11-26T23:00', actualEnd: '2026-11-27T23:00', views: null } });
    assert.equal(fullDay.status, 200); assert.equal(fullDay.json.session.actualMinutes, 1440); assert.equal(fullDay.json.session.views, null);
  });
  await t.test('manager may view dashboard and edit sales, but only admin manages users', async () => {
    assert.equal((await api('/api/bootstrap', { cookie: managerLogin.cookie })).status, 200);
    const result = await api(`/api/sessions/${created.id}`, { cookie: managerLogin.cookie, method: 'PUT', data: { version: 3, orderAmount: 6000 } });
    assert.equal(result.status, 200); assert.equal(result.json.session.orderAmount, 6000);
    assert.equal((await api('/api/users', { cookie: managerLogin.cookie })).status, 403);
    for (const role of ['anchor_entry', 'service_entry', 'manager']) {
      const response = await api('/api/users', { cookie: adminLogin.cookie, method: 'POST', data: { username: `new-${role}`, name: role, password: 'ValidTest2026!', role } });
      assert.equal(response.status, 201, JSON.stringify(response.json));
    }
    assert.equal((await api('/api/users', { cookie: adminLogin.cookie, method: 'POST', data: { username: 'new-root', name: 'fake', password: 'ValidTest2026!', role: 'root' } })).status, 400);
  });
  await t.test('entry reads do not create empty day records and safe data stays safe after sales update', async () => {
    const before = app.store.list('sessions').length;
    const empty = await api('/api/entry/bootstrap?date=2026-12-05', { cookie: anchorCookie });
    assert.equal(empty.status, 200); assert.equal(empty.json.sessions.length, 0);
    assert.equal(app.store.list('sessions').length, before);
    for (const cookie of [anchorCookie, serviceCookie]) assertSafe((await api('/api/entry/bootstrap?date=2026-11-26', { cookie })).json);
  });
});
