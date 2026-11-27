import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../lib/store.mjs';
import { directory, handleDirectory, sessionSlotWrite } from '../lib/directory.mjs';
import { entryInput, entryDirectory, fillSession, PUBLIC_ENTRY_USER } from '../lib/entry.mjs';
import { conflict, sessionInput } from '../lib/validation.mjs';

const staff = { id: 'test-admin', name: '测试主管', role: 'admin' };
const accountId = 'fb-room-1';
const anchorId = 'fb-anchor-1';
const lateId = 'fb-slot-1-3';
const late = { start: '20:00', end: '02:00', endDayOffset: 1, scheduleUnknown: false };

function fixture(t) {
  const store = new Store(':memory:', { adminPassword: 'Synthetic-shifts-admin-test' });
  t.after(() => store.close());
  store.insert('accounts', { id: accountId, name: '测试直播间', version: 1 });
  store.insert('anchors', {
    id: anchorId, accountId, slotId: lateId, slotLabel: '第3场（时段待补）', name: '小周',
    activeFrom: '2026-11-01', version: 1
  });
  const legacy = {
    id: 'legacy-shift', date: '2026-11-24', accountId, anchorId, slotId: lateId, slotLabel: '第3场（时段待补）',
    start: '00:00', end: '00:01', scheduleUnknown: true, status: 'planned', sourceStatus: 'missing',
    sourceCell: 'X1', version: 1
  };
  store.insert('sessions', legacy);
  return { store, legacy };
}

test('imported slot IDs map to canonical times, and existing unknown timing remains in place', t => {
  const { store, legacy } = fixture(t);
  const roster = directory(store);
  const roomSlots = roster.slots.filter(slot => slot.accountId === accountId);
  assert.equal(roomSlots.length, 3);
  assert.equal(roomSlots.filter(slot => slot.period === 'late').length, 1);
  assert.deepEqual(roomSlots.map(({ period, start, end, endDayOffset }) => ({ period, start, end, endDayOffset }))
    .sort((a, b) => a.start.localeCompare(b.start)), [
    { period: 'early', start: '08:00', end: '13:40', endDayOffset: 0 },
    { period: 'middle', start: '14:00', end: '19:40', endDayOffset: 0 },
    { period: 'late', start: '20:00', end: '02:00', endDayOffset: 1 }
  ]);
  assert.deepEqual(entryDirectory(roster).slots.find(slot => slot.id === lateId), {
    id: lateId, accountId, name: legacy.slotLabel, period: 'late', start: '20:00', end: '02:00', endDayOffset: 1
  });
  const correction = sessionSlotWrite({ version: 1, orders: 2 }, legacy, roster);
  assert.deepEqual(correction, { slotId: lateId, slotLabel: legacy.slotLabel, timing: {} });
  const fresh = sessionSlotWrite({ date: '2026-12-01', accountId, anchorId }, null, roster);
  assert.deepEqual(fresh, { slotId: lateId, slotLabel: legacy.slotLabel, period: 'late', timing: late });
  const submitted = entryInput({ date: legacy.date, accountId, anchorId, orderAmount: 450 }, PUBLIC_ENTRY_USER, roster);
  assert.equal(submitted.period, 'late');
  assert.equal(submitted.endDayOffset, 1);
  assert.deepEqual(fillSession(legacy, submitted), { ...legacy, orderAmount: 450, status: 'completed' });
  assert.deepEqual(store.get('sessions', legacy.id), legacy);
});

test('night shift overlaps the following calendar day and frees the period at its exact end', t => {
  const { store } = fixture(t);
  const roster = directory(store);
  const entry = { date: '2026-11-30', accountId, anchorId, ...late };
  const prior = sessionInput(entry, null, roster);
  prior.id = 'late';
  assert.equal(prior.date, entry.date);
  const onNextDay = (start, end) => ({
    id: 'next', accountId, anchorId, date: '2026-12-01', start, end
  });
  assert.throws(() => conflict(prior, [onNextDay('01:30', '03:00')]), { status: 409 });
  assert.throws(() => conflict(onNextDay('01:30', '03:00'), [prior]), { status: 409 });
  assert.doesNotThrow(() => conflict(onNextDay('02:00', '03:00'), [prior]));
  assert.throws(() => sessionInput({ ...entry, endDayOffset: 0 }, null, roster), { status: 400 });
  assert.throws(() => sessionInput({ ...entry, endDayOffset: 2 }, null, roster), { status: 400 });
});

test('directory saves same-name anchors in separate rooms and enforces assignment and slot activation', async t => {
  const { store } = fixture(t);
  async function request(method, path, payload, user = staff) {
    let result;
    const url = new URL(path, 'http://localhost');
    await handleDirectory({ path: url.pathname, url, request: { method }, user, store,
      body: async () => payload, send: (_, status, json) => { result = { status, ...json }; } });
    return result;
  }
  const { account: other } = await request('POST', '/api/accounts', { name: '另一个直播间' });
  const { anchor: sameName } = await request('POST', '/api/anchors', {
    name: '小周', accountId: other.id, slotId: 'early', activeFrom: '2026-12-01'
  });
  assert.notEqual(sameName.id, anchorId);
  const samePeriod = { name: '重复早场', accountId: other.id, period: 'early' };
  await assert.rejects(request('POST', '/api/slots', samePeriod), { status: 409 });
  await assert.rejects(request('POST', '/api/slots', { ...samePeriod, period: 'noon' }), { status: 400 });
  await assert.rejects(request('POST', '/api/slots', samePeriod, { role: 'manager' }), { status: 403 });

  const defaultEarly = '/api/slots/early?accountId=' + other.id;
  const { slot: stopped } = await request('PUT', defaultEarly, { version: 1, active: false });
  assert.equal(stopped.period, 'early');
  assert.equal(stopped.active, false);
  const payload = { date: '2026-12-01', accountId: other.id, anchorId: sameName.id, orders: 2 };
  assert.throws(() => entryInput(payload, PUBLIC_ENTRY_USER, directory(store)), { status: 400 });
  await request('PUT', defaultEarly, { version: stopped.version, active: true });
  const cleared = await request('PUT', '/api/anchors/' + sameName.id, { version: sameName.version, activeFrom: null });
  assert.equal(cleared.anchor.activeFrom, null);
  const roster = directory(store);
  assert.throws(() => sessionSlotWrite({ ...payload, accountId }, null, roster), { status: 409 });
  assert.throws(() => sessionSlotWrite({ ...payload, slotId: 'middle' }, null, roster), { status: 409 });
  assert.equal(entryInput(payload, PUBLIC_ENTRY_USER, roster).period, 'early');
});
