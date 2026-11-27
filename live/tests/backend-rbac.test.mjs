import test from 'node:test';
import assert from 'node:assert/strict';
import { createApplication } from '../server.mjs';

test('employee entry is write-only and managers can correct records', async t => {
  const app = createApplication({ dbPath: ':memory:', port: 0, host: '127.0.0.1', demo: true, today: '2026-11-25' });
  await app.listen();
  t.after(() => app.close());
  app.store.setDataset({ kind: 'imported', label: '真实销售导入', salesTotal: 888888, hash: 'private-file-hash', sourceFile: 'secret.xlsx' });
  const base = 'http://127.0.0.1:' + app.server.address().port;
  async function api(path, { cookie, scope, method = 'GET', data } = {}) {
    const response = await fetch(base + path, {
      method,
      headers: {
        ...(cookie && { Cookie: cookie }),
        ...(scope && { 'X-Command-Scope': scope }),
        ...(data !== undefined && { 'Content-Type': 'application/json' })
      },
      body: data === undefined ? undefined : JSON.stringify(data)
    });
    return { status: response.status, json: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }
  async function login(username, password) {
    const result = await api('/api/login', { method: 'POST', data: { username, password } });
    assert.equal(result.status, 200);
    return result.cookie;
  }
  const anchorCookie = await login('recorder', 'record2026!');
  const serviceCookie = await login('service', 'service2026!');
  const managerCookie = await login('manager', 'manage2026!');
  const adminCookie = await login('demo', 'demo2026!');
  const baseEntry = '/api/entry/sessions';
  const bootstrap = '/api/entry/bootstrap';
  const publicAuth = { scope: 'public-entry' };
  const firstSlot = { date: '2026-11-28', accountId: 'account-1', anchorId: 'anchor-1' };
  const getSession = entry => app.store.list('sessions').find(item =>
    item.date === entry.date && item.accountId === entry.accountId && item.anchorId === entry.anchorId
  );

  await t.test('bootstrap exposes only static account and anchor fields for all entry callers', async () => {
    const count = app.store.list('sessions').length;
    const expected = (await api(bootstrap)).json;
    assert.deepEqual(Object.keys(expected).sort(), ['accounts', 'anchors', 'slots']);
    assert.equal(expected.accounts.length, 5);
    assert.equal(expected.anchors.length, 15);
    for (const account of expected.accounts) assert.deepEqual(Object.keys(account).sort(), ['id', 'name']);
    for (const anchor of expected.anchors) {
      assert.deepEqual(Object.keys(anchor).sort(), ['accountId', 'activeFrom', 'activeTo', 'id', 'name', 'slotId', 'slotLabel']);
      assert.ok(expected.accounts.some(account => account.id === anchor.accountId));
    }
    for (const query of ['', '?date=2026-11-25', '?date=2026-12-05']) {
      for (const auth of [publicAuth, { cookie: anchorCookie }, { cookie: serviceCookie }, { cookie: managerCookie, ...publicAuth }]) {
        const response = await api(bootstrap + query, auth);
        assert.equal(response.status, 200);
        assert.deepEqual(response.json, expected);
      }
    }
    assert.equal(app.store.list('sessions').length, count);
  });

  await t.test('public submission returns an opaque receipt and duplicate responses contain no record', async () => {
    const data = { ...firstSlot, orderAmount: 330.237, orders: 5, actualMinutes: 95, impressions: 360, shares: 4, newFollowers: 3 };
    const result = await api(baseEntry, { ...publicAuth, method: 'POST', data });
    assert.equal(result.status, 201, JSON.stringify(result.json));
    assert.deepEqual(result.json, { ok: true });
    const stored = getSession(firstSlot);
    assert.equal(stored.orderAmount, 330.24);
    assert.equal(stored.orders, 5);
    assert.equal(stored.actualMinutes, 95);
    assert.equal(stored.impressions, 360);
    assert.equal(stored.shares, 4);
    assert.equal(stored.newFollowers, 3);
    assert.equal(stored.views, null);
    assert.equal(stored.received, null);
    assert.equal(app.store.audit().find(event => event.entityId === stored.id).userName, '匿名录入');
    for (const auth of [publicAuth, { cookie: serviceCookie }, { cookie: managerCookie, ...publicAuth }]) {
      const duplicate = await api(baseEntry, { ...auth, method: 'POST', data: { ...firstSlot, orders: 9 } });
      assert.equal(duplicate.status, 409);
      assert.deepEqual(Object.keys(duplicate.json), ['error']);
      assert.deepEqual(getSession(firstSlot), stored);
    }
    for (const auth of [publicAuth, { cookie: anchorCookie }, { cookie: serviceCookie }, { cookie: managerCookie }]) {
      const recordUrl = baseEntry + '/' + stored.id;
      for (const [method, path] of [['GET', baseEntry], ['GET', recordUrl], ['PUT', recordUrl], ['DELETE', recordUrl]]) {
        const denied = await api(path, { ...auth, method, ...(method === 'PUT' && { data: { version: 1, orders: 7 } }) });
        assert.equal(denied.status, 405);
        assert.deepEqual(Object.keys(denied.json), ['error']);
      }
    }
    assert.deepEqual(Object.keys((await api(bootstrap)).json).sort(), ['accounts', 'anchors', 'slots']);
  });

  await t.test('high amounts require explicit confirmation and denied requests create no records', async () => {
    const entry = { ...firstSlot, date: '2026-11-29' };
    const data = { ...entry, orderAmount: 100000 };
    for (const confirmation of [{}, { confirmAmount: false }]) {
      const warning = await api(baseEntry, { ...publicAuth, method: 'POST', data: { ...data, ...confirmation } });
      assert.equal(warning.status, 422);
      assert.deepEqual(Object.keys(warning.json).sort(), ['code', 'error']);
      assert.equal(warning.json.code, 'ENTRY_CONFIRM_AMOUNT');
      assert.equal(getSession(entry), undefined);
    }
    const invalid = await api(baseEntry, { ...publicAuth, method: 'POST', data: { ...data, confirmAmount: 'true' } });
    assert.equal(invalid.status, 400);
    assert.equal(getSession(entry), undefined);
    const confirmed = await api(baseEntry, { ...publicAuth, method: 'POST', data: { ...data, confirmAmount: true } });
    assert.equal(confirmed.status, 201);
    assert.deepEqual(confirmed.json, { ok: true });
    assert.equal(getSession(entry).orderAmount, 100000);
    assert.equal(getSession(entry).confirmAmount, undefined);
  });

  await t.test('empty and invalid entries are rejected while explicit zero is recorded', async () => {
    const entry = { ...firstSlot, date: '2026-11-30' };
    for (const patch of [
      {}, { orderAmount: null }, { date: '2026-11-31', orders: 1 }, { accountId: 'account-2', orders: 1 },
      { target: 4 }, { paidOrders: 1 }, { received: 4 }, { orderAmount: -1 }, { orderAmount: '410.50' },
      { actualMinutes: 1441 }, { actualMinutes: 0.5 }, { impressions: -1 }, { impressions: 0.5 }
    ]) {
      const invalid = await api(baseEntry, { ...publicAuth, method: 'POST', data: { ...entry, ...patch } });
      assert.equal(invalid.status, 400, JSON.stringify(patch));
      assert.deepEqual(Object.keys(invalid.json), ['error']);
      assert.equal(getSession(entry), undefined);
    }
    const zero = await api(baseEntry, { ...publicAuth, method: 'POST', data: { ...entry, orderAmount: 0, actualMinutes: 1440 } });
    assert.equal(zero.status, 201);
    assert.deepEqual(zero.json, { ok: true });
    assert.equal(getSession(entry).orderAmount, 0);
    assert.equal(getSession(entry).actualMinutes, 1440);
    assert.equal(getSession(entry).orders, null);
  });

  let created;
  await t.test('staff can enter permitted data without reading records or changing submitted data', async () => {
    const entry = { date: '2026-11-26', accountId: 'account-5', anchorId: 'anchor-15' };
    const result = await api(baseEntry, { cookie: anchorCookie, method: 'POST', data: {
      ...entry, actualStart: '2026-11-26T23:30', actualEnd: '2026-11-27T01:15',
      views: 4500, viewers: 1800, impressions: 8300, reach: 3000
    } });
    assert.equal(result.status, 201, JSON.stringify(result.json));
    assert.deepEqual(result.json, { ok: true });
    created = getSession(entry);
    assert.equal(created.actualMinutes, 105);
    assert.equal(created.views, 4500);
    assert.equal(created.viewers, 1800);
    assert.equal(created.impressions, 8300);
    assert.equal(created.reach, 3000);
    assert.equal(created.orderAmount, null);
    assert.equal(created.slotId, 'slot-3');
    const ordersEntry = { ...entry, anchorId: 'anchor-14' };
    const service = await api(baseEntry, { cookie: serviceCookie, method: 'POST', data: { ...ordersEntry, orders: 3 } });
    assert.equal(service.status, 201);
    assert.deepEqual(service.json, { ok: true });
    assert.equal(getSession(ordersEntry).orders, 3);
    for (const [cookie, patch] of [
      [anchorCookie, { orderAmount: 9999 }], [anchorCookie, { actualMinutes: 999 }], [anchorCookie, { orders: 10 }],
      [serviceCookie, { reach: 1000 }], [serviceCookie, { notes: 'overwrite' }], [serviceCookie, { target: 888 }]
    ]) {
      const result = await api(baseEntry, { cookie, method: 'POST', data: { ...entry, date: '2026-11-27', ...patch } });
      assert.equal(result.status, 400, JSON.stringify(patch));
      assert.deepEqual(Object.keys(result.json), ['error']);
    }
    for (const patch of [
      { actualStart: '2026-11-27T22:00' }, { actualStart: '2026-11-27T23:00', actualEnd: null },
      { actualStart: '2026-11-27T23:00', actualEnd: '2026-11-27T23:00' },
      { actualStart: '2026-11-27T23:00', actualEnd: '2026-11-27T22:59' },
      { actualStart: '2026-11-27T23:00', actualEnd: '2026-11-28T23:01' },
      { actualStart: '2026-11-28T00:00', actualEnd: '2026-11-28T01:00' },
      { actualStart: '2026-11-27T24:00', actualEnd: '2026-11-28T01:00' },
      { views: -1 }, { views: 1.5 }, { impressions: '3000' }, { actualStart: '', actualEnd: '' }
    ]) {
      const invalid = await api(baseEntry, { cookie: anchorCookie, method: 'POST', data: { ...entry, date: '2026-11-27', ...patch } });
      assert.equal(invalid.status, 400, JSON.stringify(patch));
      assert.deepEqual(Object.keys(invalid.json), ['error']);
    }
  });

  await t.test('entry roles cannot use management endpoints and corrections require management access', async () => {
    for (const cookie of [anchorCookie, serviceCookie]) {
      for (const path of ['/api/bootstrap', '/api/audit', '/api/export.csv', '/api/users']) {
        const result = await fetch(base + path, { headers: { Cookie: cookie } });
        assert.equal(result.status, 403, path);
      }
      for (const path of ['/api/sessions', '/api/inventory', '/api/tasks', '/api/accounts/account-1', '/api/anchors/anchor-1']) {
        const method = /(accounts|anchors)\//.test(path) ? 'PUT' : 'POST';
        assert.equal((await api(path, { cookie, method, data: {} })).status, 403, path);
      }
    }
    assert.equal((await api('/api/bootstrap')).status, 401);
    assert.equal((await api('/api/sessions', { method: 'POST', data: {} })).status, 401);
    const result = await api('/api/sessions/' + created.id, { cookie: managerCookie, method: 'PUT', data: { version: 1, orderAmount: 6000 } });
    assert.equal(result.status, 200, JSON.stringify(result.json));
    assert.equal(result.json.session.orderAmount, 6000);
    assert.equal((await api('/api/users', { cookie: managerCookie })).status, 403);
    for (const role of ['anchor_entry', 'service_entry', 'manager']) {
      const result = await api('/api/users', { cookie: adminCookie, method: 'POST', data: { username: 'new-' + role, name: role, password: 'ValidTest2026!', role } });
      assert.equal(result.status, 201, JSON.stringify(result.json));
    }
  });
});
