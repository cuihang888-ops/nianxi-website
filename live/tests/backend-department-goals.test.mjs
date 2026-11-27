import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../lib/store.mjs';
import { createDepartmentGoals } from '../lib/department-goals.mjs';
import { chinaDate } from '../lib/seed.mjs';
import { createApplication } from '../server.mjs';

function fixture(t) {
  const store = new Store(':memory:', { adminPassword: 'Synthetic-department-goals-test' });
  t.after(() => store.close());
  const today = () => '2026-11-27';
  const goals = createDepartmentGoals({ store, today });
  const blank = { month: '2026-11', salesTarget: null, signedTarget: null, signedActual: null, signedAsOf: null, version: 0 };
  return { store, today, goals, blank };
}

test('department goals persist by month and keep independently recorded signed delivery', t => {
  const { store, today, goals, blank } = fixture(t);
  const actor = { id: 'manager-1', name: '合成主管' };
  assert.deepEqual(goals.read(blank.month), blank);
  assert.equal(store.list('department-goals').length, 0);

  const first = goals.save({
    ...blank, salesTarget: 420000.259, signedTarget: 240000, signedActual: 0, signedAsOf: '2026-11-27'
  }, actor);
  assert.deepEqual(first, {
    month: blank.month, salesTarget: 420000.26, signedTarget: 240000, signedActual: 0, signedAsOf: '2026-11-27', version: 1
  });
  assert.deepEqual(createDepartmentGoals({ store, today }).read(blank.month), first);
  assert.equal(store.audit()[0].userId, actor.id);

  const futureMonth = goals.save({ ...blank, month: '2026-12', salesTarget: 850000, signedTarget: 420000 }, actor);
  assert.equal(futureMonth.version, 1);
  assert.equal(futureMonth.signedActual, null);
  assert.deepEqual(goals.read(blank.month), first);

  const updated = goals.save({ ...first, signedActual: 102800.45, signedAsOf: '2026-11-26' }, actor);
  assert.deepEqual(updated, { ...first, signedActual: 102800.45, signedAsOf: '2026-11-26', version: 2 });
  assert.deepEqual(goals.save({ ...blank, version: updated.version }, actor), { ...blank, version: 3 });
  assert.deepEqual(goals.read(futureMonth.month), futureMonth);
});

test('department goals reject invalid amounts, dates, and partial forms without saving', t => {
  const { store, goals, blank } = fixture(t);
  assert.throws(() => goals.read('2026-13'), { status: 400 });
  for (const patch of [
    { month: '2026-2' }, { month: '2026-11-01' }, { salesTarget: -1 }, { signedTarget: '4' },
    { signedTarget: Number.NaN }, { signedActual: Number.POSITIVE_INFINITY },
    { signedActual: 0 }, { signedAsOf: '2026-11-03' },
    { signedActual: 10, signedAsOf: '2026-11-31' }, { signedActual: 10, signedAsOf: '2026-10-30' },
    { signedActual: 10, signedAsOf: '2026-11-28' }, { signedActual: 10, signedAsOf: '' },
    { version: -1 }, { version: 0.5 }, { version: '0' }, { received: 700000 }
  ]) {
    assert.throws(() => goals.save({ ...blank, ...patch }), { status: 400 }, JSON.stringify(patch));
  }
  const { signedTarget, ...incomplete } = blank;
  assert.throws(() => goals.save(incomplete), { status: 400 });
  assert.deepEqual(goals.read(blank.month), blank);
  assert.equal(store.audit().length, 0);
});

test('department goal updates reject stale version zero and subsequent outdated saves', t => {
  const { store, today, goals, blank } = fixture(t);
  const other = createDepartmentGoals({ store, today });
  const init = goals.read(blank.month);
  const first = other.save({ ...init, signedTarget: 20000 });
  assert.throws(() => goals.save({ ...init, signedTarget: 25000 }), {
    status: 409, details: { current: first }
  });
  const next = other.save({ ...first, signedActual: 19000, signedAsOf: '2026-11-27' });
  assert.throws(() => goals.save({ ...first, signedActual: 1000, signedAsOf: '2026-11-26' }), {
    status: 409, details: { current: next }
  });
  assert.deepEqual(goals.read(blank.month), next);
  assert.equal(store.audit().length, 2);
});

test('department goals API separates sales, signed delivery and actual cash under dashboard permissions', async t => {
  const boardPassword = 'Synthetic-goals-board';
  const app = createApplication({ dbPath: ':memory:', host: '127.0.0.1', port: 0, demo: true, dashboardPassword: boardPassword, today: '2020-01-02' });
  t.after(() => app.close());
  const { port } = await app.listen();
  const today = chinaDate();
  const previousMonthDate = new Date(today.slice(0, 7) + '-01T00:00:00Z');
  previousMonthDate.setUTCDate(0);
  const asOf = previousMonthDate.toISOString().slice(0, 10);
  const month = asOf.slice(0, 7);
  const goalPath = '/api/department-goals';
  const readPath = goalPath + '?month=' + month;
  const allowed = { month, salesTarget: 500000, signedTarget: 300000, signedActual: 210000, signedAsOf: asOf, version: 0 };
  app.store.insert('sessions', { id: 'goal-sales-1', date: asOf, orderAmount: 140000, received: 85000 });
  app.store.insert('sessions', { id: 'goal-sales-2', date: asOf, orderAmount: 0, received: 0 });
  app.store.insert('sessions', { id: 'goal-sales-3', date: asOf, orderAmount: null });
  app.store.insert('sessions', { id: 'goal-sales-4', date: asOf, orderAmount: 12000, sourceStatus: 'stopped' });

  async function call(path, { cookie, method = 'GET', input, scope } = {}) {
    const headers = { ...(cookie && { Cookie: cookie }), ...(scope && { 'X-Command-Scope': scope }),
      ...(input !== undefined && { 'Content-Type': 'application/json' }) };
    const response = await fetch('http://127.0.0.1:' + port + path, { method, headers, body: input === undefined ? undefined : JSON.stringify(input) });
    return { status: response.status, payload: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }
  async function signin(username, password) {
    const result = await call('/api/login', { method: 'POST', input: { username, password } });
    assert.equal(result.status, 200);
    return { cookie: result.cookie };
  }
  const manager = await signin('manager', 'manage2026!');
  const staff = await signin('recorder', 'record2026!');
  const board = await call('/api/dashboard/unlock', { method: 'POST', input: { password: boardPassword } });
  assert.equal(board.status, 200);
  const dashboard = { cookie: board.cookie, scope: 'dashboard' };
  assert.equal((await call(readPath)).status, 401);
  assert.equal((await call(readPath, staff)).status, 403);
  assert.equal((await call(readPath, manager)).status, 403);
  assert.equal((await call(goalPath, { ...dashboard, method: 'PUT', input: allowed })).status, 403);
  const blank = await call(readPath, dashboard);
  assert.equal(blank.status, 200);
  assert.equal(blank.payload.canEdit, false);
  assert.equal(blank.payload.salesActual, 140000);
  assert.equal(blank.payload.salesReported, 2);
  assert.equal(blank.payload.salesPending, 1);
  assert.equal(blank.payload.signedActual, null);
  const unlock = await call('/api/dashboard/unlock', { ...manager, method: 'POST', input: { password: boardPassword, mode: 'manage' } });
  assert.equal(unlock.status, 200);
  const result = await call(goalPath, { ...manager, method: 'PUT', input: allowed });
  assert.equal(result.status, 200);
  assert.equal(result.payload.canEdit, true);
  const visible = await call(readPath, dashboard);
  assert.equal(visible.status, 200);
  assert.equal(visible.payload.signedActual, 210000);
  assert.equal(visible.payload.signedAsOf, asOf);
  assert.equal(visible.payload.salesActual, 140000);
  assert.equal(visible.payload.salesTarget, 500000);
  assert.equal(visible.payload.signedTarget, 300000);
  assert.equal(visible.payload.remainingDays, 0);
  assert.equal(visible.payload.version, 1);
  assert.equal((await call(goalPath, { ...manager, method: 'PUT', input: allowed })).status, 409);
});
