import assert from 'node:assert/strict';
import test from 'node:test';
import { createApplication } from '../server.mjs';
import { COMPLETENESS_FIELDS, beijingEntryTime, completenessForDate, completenessRange, monthToDateRange, sessionStatus } from '../lib/completeness.mjs';
import { duplicateEntry } from '../lib/entry.mjs';
import { chinaDate } from '../lib/seed.mjs';
import { suggestionTiming, SUGGESTION_SLA_MS } from '../lib/feedback.mjs';

const BOARD_PASSWORD = 'TestBoardPass';

function assertStatusOnly(result) {
  for (const group of result.accounts) {
    for (const session of group.sessions) {
      for (const [metric] of COMPLETENESS_FIELDS) assert.ok(!Object.hasOwn(session, metric));
    }
  }
}

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
      raw: path => fetch(base + path, { headers: { Cookie: [...cookies].map(([key, value]) => key + '=' + value).join('; ') } }),
      login: (username, password) => request('/api/login', { username, password }),
      unlockBoard: () => request('/api/dashboard/unlock', { password: BOARD_PASSWORD }),
      unlockManagement: () => request('/api/dashboard/unlock', { password: BOARD_PASSWORD, mode: 'manage' }),
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
  assert.deepEqual(result.accounts[0].sessions[0].missingKeys, ['orders']);
  assertStatusOnly(result);
});

test('entry duplicate identity is the date, live room and anchor', () => {
  const original = { date: '2026-11-25', accountId: 'a1', anchorId: 'an1', slotId: 's1' };
  const rows = [
    { ...original, id: 'original' },
    { ...original, id: 'relief', anchorId: 'an2' },
    { ...original, id: 'previous-day', date: '2026-11-24' },
    { ...original, id: 'other-room', accountId: 'a2' },
    { ...original, id: 'other-slot', slotId: 's2' },
    { ...original, id: 'cancelled', cancelled: true }
  ];
  assert.deepEqual(duplicateEntry(original, rows).map(row => row.id), ['original', 'other-slot']);
  assert.deepEqual(duplicateEntry({ ...original, anchorId: 'an2' }, rows).map(row => row.id), ['relief']);
  assert.deepEqual(duplicateEntry({ ...original, anchorId: 'an3' }, rows), []);
});

test('completeness keeps same-shift anchors independent and reserves orphan import fallback for a sole candidate', () => {
  const date = '2026-11-25';
  const clock = { day: '2026-11-28', time: '20:00' };
  const activeAnchor = { id: 'an1', accountId: 'a1', slotId: 's1', name: '主播甲' };
  const secondAnchor = { ...activeAnchor, id: 'an2', name: '主播乙' };
  const formerAnchor = { ...activeAnchor, id: 'former', name: '往期主播', activeTo: '2026-11-24' };
  const roster = {
    accounts: [{ id: 'a1', name: '测试间' }],
    anchors: [activeAnchor, secondAnchor, formerAnchor],
    slots: [{ id: 's1', accountId: 'a1', period: 'early' }]
  };
  const filled = { orderAmount: 0, orders: 0, actualMinutes: 0, impressions: 0, shares: 0, newFollowers: 0 };
  const rows = [
    { ...filled, id: 'second', date, accountId: 'a1', slotId: 's1', anchorId: secondAnchor.id },
    { ...filled, id: 'former', date, accountId: 'a1', slotId: 's1', anchorId: formerAnchor.id },
    { ...filled, id: 'orphan', date, accountId: 'a1', slotId: 's1', anchorId: 'no-directory-id', sourceStatus: 'reported' }
  ];
  const summarize = (anchors, sessionRows) => Object.fromEntries(
    completenessForDate(null, { ...roster, anchors }, date, sessionRows, clock).accounts[0].sessions.map(row => [row.anchorId, row])
  );
  const gathered = summarize(roster.anchors, rows);
  assert.equal(gathered.an1.status, 'empty');
  assert.equal(gathered.an1.canEnter, true);
  assert.equal(gathered.an2.status, 'complete');
  assert.equal(gathered.former.anchorName, formerAnchor.name);
  assert.equal(gathered.former.canEnter, false);
  assert.equal(gathered['no-directory-id'].canEnter, false);
  const sole = summarize([activeAnchor, formerAnchor], rows.slice(1));
  assert.equal(sole.an1.historicalReference, true);
  assert.equal(sole.an1.canEnter, false);
  assert.equal(sole.former.status, 'complete');
  assert.equal(Object.hasOwn(sole, 'no-directory-id'), false);
});

test('completeness range: month-to-date only — in-month gaps count, last month and future days do not', () => {
  assert.deepEqual(monthToDateRange('2026-11-25'), { from: '2026-11-01', to: '2026-11-25' });
  assert.deepEqual(monthToDateRange('2026-11-01'), { from: '2026-11-01', to: '2026-11-01' });
  const zero = { orderAmount: 0, orders: 0, actualMinutes: 0, impressions: 0, shares: 0, newFollowers: 0 };
  const roster = {
    accounts: [{ id: 'a1', name: '甲直播间', active: true }],
    anchors: [{ id: 'an1', name: '主播甲', accountId: 'a1', slotId: 's1', slotLabel: '早场', activeFrom: null, activeTo: null }]
  };
  const sessions = [
    { id: 'r-partial', date: '2026-11-03', accountId: 'a1', anchorId: 'an1', slotId: 's1', ...zero, orders: null },
    { id: 'r-full', date: '2026-11-04', accountId: 'a1', anchorId: 'an1', slotId: 's1', ...zero },
    // 上月的缺项记录与本月未来日期的记录都在库里，但都不应计入本月至今的提醒范围。
    { id: 'r-last-month', date: '2026-10-20', accountId: 'a1', anchorId: 'an1', slotId: 's1', ...zero, orders: null },
    { id: 'r-future', date: '2026-11-28', accountId: 'a1', anchorId: 'an1', slotId: 's1', ...zero, orders: null }
  ];
  const store = { list: name => name === 'sessions' ? sessions : [] };
  const { from, to } = monthToDateRange('2026-11-25');
  const range = completenessRange(store, roster, from, to);
  assert.equal(range.days.length, 25);
  assert.equal(range.days[0].date, '2026-11-01');
  assert.equal(range.days.at(-1).date, '2026-11-25');
  // 25 天各 1 场：11-03 缺项、11-04 齐全，其余未录；上月与未来日期均未计入。
  assert.deepEqual(range.summary, { expected: 25, complete: 1, partial: 1, empty: 23, stopped: 0, upcoming: 0 });
  assert.deepEqual(range.accounts[0].summary, range.summary);
  // 范围汇总与逐日单日结果对得上。
  const totals = { expected: 0, complete: 0, partial: 0, empty: 0, stopped: 0, upcoming: 0 };
  for (const day of range.days) {
    const single = completenessForDate(store, roster, day.date);
    assert.deepEqual(day.summary, single.summary);
    for (const key of Object.keys(totals)) totals[key] += single.summary[key];
  }
  assert.deepEqual(range.summary, totals);
  // 范围结果同样只含状态计数，不含指标数值。
  assert.doesNotMatch(JSON.stringify(range), /"(?:orderAmount|actualMinutes|impressions)":/);
});

test('Beijing shift start releases the late shift into current-month reminders at 20:00', () => {
  const roster = {
    accounts: [{ id: 'a1', name: '测试间' }],
    anchors: [{ id: 'an1', accountId: 'a1', slotId: 's1', name: '测试主播' }],
    slots: [{ id: 's1', accountId: 'a1', start: '20:00', end: '02:00', endDayOffset: 1 }]
  };
  const unusableStore = { list() { assert.fail('completeness must reuse the passed snapshot'); } };
  const sessions = [];
  const before = beijingEntryTime(new Date('2026-11-28T11:59:00Z'));
  const started = beijingEntryTime(new Date('2026-11-28T12:00:00Z'));
  const upcoming = completenessForDate(unusableStore, roster, before.day, sessions, before);
  assert.equal(upcoming.summary.expected, 0);
  assert.equal(upcoming.summary.upcoming, 1);
  assert.equal(upcoming.accounts[0].sessions[0].status, 'upcoming');
  assert.deepEqual(upcoming.accounts[0].sessions[0].missing, []);
  assert.equal(upcoming.accounts[0].sessions[0].canEnter, false);
  assert.deepEqual(completenessRange(unusableStore, roster, before.day, before.day, sessions, before).summary, upcoming.summary);
  assert.deepEqual(completenessRange(unusableStore, roster, before.day, before.day, sessions, before).days[0].pendingShifts, []);
  const live = completenessForDate(unusableStore, roster, started.day, sessions, started);
  assert.equal(live.summary.expected, 1);
  assert.equal(live.summary.empty, 1);
  assert.equal(live.accounts[0].sessions[0].canEnter, true);
  const [shift] = completenessRange(unusableStore, roster, started.day, started.day, sessions, started).days[0].pendingShifts;
  assert.equal(shift.anchorName, '测试主播');
  assert.equal(shift.slotId, 's1');
  assert.ok(shift.missingKeys.includes('actualMinutes'));
});

test('completeness API: default range is month-to-date (Beijing), matching daily endpoints and the dashboard', async t => {
  const { browser } = await fixture(t);
  const staff = browser();
  const today = chinaDate();
  const monthStart = today.slice(0, 8) + '01';
  const range = await staff.request('/api/entry/completeness');
  assert.equal(range.status, 200, JSON.stringify(range.body));
  assert.equal(range.body.from, monthStart);
  assert.equal(range.body.to, today);
  assert.equal(range.body.days.length, Number(today.slice(8, 10)));
  assert.ok(range.body.days.every(day => day.date >= monthStart && day.date <= today));
  let pending = 0;
  for (const day of range.body.days) {
    const single = await staff.request('/api/entry/completeness?date=' + day.date);
    assert.equal(single.status, 200);
    assert.deepEqual(day.summary, single.body.summary);
    pending += single.body.summary.partial + single.body.summary.empty;
  }
  assert.equal(range.body.summary.partial + range.body.summary.empty, pending);
  // 单日接口保留：上月日期仍可单独查（供补录核对），只是不进默认提醒范围。
  const lastMonth = await staff.request('/api/entry/completeness?date=2026-10-15');
  assert.equal(lastMonth.status, 200);
  assert.equal(lastMonth.body.date, '2026-10-15');
  // 看板默认口径与录入端一致。
  const board = browser();
  await board.unlockBoard();
  const dash = await board.request('/api/dashboard/completeness');
  assert.equal(dash.status, 200);
  assert.equal(dash.body.from, monthStart);
  assert.equal(dash.body.to, today);
  assert.deepEqual(dash.body.summary, range.body.summary);
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
  assertStatusOnly(completeness.body);
});

test('duration-only backfill recovers from a stale impression draft without changing saved figures', async t => {
  const { app, browser } = await fixture(t);
  const user = browser();
  const scope = { 'X-Command-Scope': 'public-entry' };
  const entry = { date: '2026-11-28', accountId: 'account-1', anchorId: 'anchor-1' };
  const initial = { orderAmount: 4520.5, orders: 7, impressions: 9086, shares: 0, newFollowers: 12 };
  const endpoint = '/api/entry/sessions?status=1';
  const row = report => report.accounts.find(group => group.accountId === entry.accountId).sessions.find(session => session.anchorId === entry.anchorId);
  const saved = () => app.store.list('sessions').find(session => session.date === entry.date && session.anchorId === entry.anchorId);
  const before = await user.request('/api/entry/sessions', { ...entry, ...initial }, scope);
  assert.equal(before.status, 201);
  assert.deepEqual(before.body, { ok: true });
  const stored = saved();

  const bootstrap = await user.request('/api/entry/bootstrap?completeness=1&date=' + entry.date);
  assert.equal(bootstrap.status, 200);
  assert.equal(row(bootstrap.body.completeness).slotId, 'slot-1');
  assert.equal(row(bootstrap.body.completeness).canEnter, true);
  assert.deepEqual(row(bootstrap.body.completeness).missingKeys, ['actualMinutes']);
  assertStatusOnly(bootstrap.body.completeness);
  assert.equal(bootstrap.body.month.to, chinaDate());
  const stale = await user.request(endpoint, { ...entry, actualMinutes: 310, impressions: initial.impressions - 1 }, scope);
  assert.equal(stale.status, 409);
  assert.equal(stale.body.code, 'ENTRY_CONFLICT');
  assert.equal(stale.body.assignmentChanged, undefined);
  assert.deepEqual(row(stale.body.completeness).missingKeys, ['actualMinutes']);
  assertStatusOnly(stale.body.completeness);
  assert.equal(stale.body.month.to, chinaDate());
  assert.deepEqual(saved(), stored);

  const durationOnly = await user.request(endpoint, { ...entry, actualMinutes: 310 }, scope);
  assert.equal(durationOnly.status, 201, JSON.stringify(durationOnly.body));
  assert.equal(durationOnly.body.ok, true);
  assert.equal(row(durationOnly.body.completeness).status, 'complete');
  assert.equal(row(durationOnly.body.completeness).canEnter, false);
  assertStatusOnly(durationOnly.body.completeness);
  assert.equal(durationOnly.body.month.to, chinaDate());
  assert.equal(saved().id, stored.id);
  assert.equal(saved().version, stored.version + 1);
  assert.equal(saved().actualMinutes, 310);
  for (const [metric, expected] of Object.entries(initial)) assert.equal(saved()[metric], expected);
});

test('a relief anchor may register in the same slot and a stale slot cannot take a new assignment', async t => {
  const { app, browser } = await fixture(t);
  const employee = browser();
  const scope = { 'X-Command-Scope': 'public-entry' };
  const endpoint = '/api/entry/sessions?status=1';
  const entry = { date: '2026-11-26', accountId: 'account-1', slotId: 'slot-1', orders: 2 };
  const relief = { id: 'relief-anchor', name: '合成替播主播', accountId: entry.accountId, slotId: entry.slotId, version: 1 };
  app.store.insert('anchors', relief);
  const primary = await employee.request(endpoint, { ...entry, anchorId: 'anchor-1' }, scope);
  const secondary = await employee.request(endpoint, { ...entry, anchorId: relief.id, orders: 6 }, scope);
  assert.equal(primary.status, 201, JSON.stringify(primary.body));
  assert.equal(secondary.status, 201, JSON.stringify(secondary.body));
  const recorded = app.store.list('sessions').filter(row => row.date === entry.date && row.accountId === entry.accountId && row.slotId === entry.slotId);
  assert.deepEqual(recorded.map(row => [row.anchorId, row.orders]), [['anchor-1', 2], [relief.id, 6]]);
  const statuses = secondary.body.completeness.accounts.find(group => group.accountId === entry.accountId).sessions;
  assert.deepEqual(statuses.filter(row => row.slotId === entry.slotId).map(row => [row.anchorId, row.canEnter]), [
    ['anchor-1', true], [relief.id, true]
  ]);
  const stale = await employee.request(endpoint, { ...entry, slotId: 'slot-2', anchorId: relief.id }, scope);
  assert.equal(stale.status, 409);
  assert.equal(stale.body.code, 'ENTRY_CONFLICT');
  assert.equal(stale.body.assignmentChanged, true);
  assert.equal(stale.body.completeness.date, entry.date);
  assert.equal(stale.body.month.to, chinaDate());
  const wrongRoom = await employee.request(endpoint, { ...entry, accountId: 'account-2', anchorId: relief.id }, scope);
  assert.equal(wrongRoom.status, 409);
  assert.equal(wrongRoom.body.assignmentChanged, true);
  assert.deepEqual(app.store.list('sessions').filter(row => row.date === entry.date && row.accountId === entry.accountId && row.slotId === entry.slotId), recorded);
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
  assert.deepEqual(Object.keys(coord.body.coordinates[0]).sort(), ['code', 'createdAt', 'mine', 'status', 'time']);
  assert.doesNotMatch(JSON.stringify((await alice.tea()).body), /需要协调换灯|直播间顶灯坏了/);
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

  // 只读看板可查看录入完整性，反馈处理需要已解锁的管理账号。
  const board = browser();
  assert.equal((await board.unlockBoard()).status, 200);
  assert.equal((await board.request('/api/dashboard/completeness?date=2026-11-25')).status, 200);
  assert.equal((await board.request('/api/dashboard/feedback')).status, 403);
  assert.equal((await board.request(`/api/dashboard/feedback/suggestions/${anonCode}/status`, { status: '处理中' })).status, 403);
  const editor = browser();
  assert.equal((await editor.login('editor', 'editor2026!')).status, 200);
  assert.equal((await editor.unlockManagement()).status, 200);
  assert.equal((await editor.request('/api/dashboard/feedback')).status, 403);
  const manager = browser();
  assert.equal((await manager.login('manager', 'manage2026!')).status, 200);
  assert.equal((await manager.unlockManagement()).status, 200);
  let feedback = (await manager.request('/api/dashboard/feedback')).body;
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
  feedback = (await manager.request('/api/dashboard/feedback')).body;
  assert.equal(feedback.suggestions.find(item => item.code === anonCode).overdue, true);
  assert.equal(feedback.counts.suggestionsOverdue, 1);

  // 状态流转：已调整必须填写调整动作；填了之后逾期解除，员工凭编号能查到。
  const noReply = await manager.request(`/api/dashboard/feedback/suggestions/${anonCode}/status`, { status: '已调整' });
  assert.equal(noReply.status, 400);
  const adjusted = await manager.request(`/api/dashboard/feedback/suggestions/${anonCode}/status`, { status: '已调整', reply: '已把排班表改为提前一周发布' });
  assert.equal(adjusted.status, 200);
  assert.equal(adjusted.body.suggestions.find(item => item.code === anonCode).overdue, false);
  const tracked = (await bob.action('suggestLookup', { code: anonCode })).body.trackedSuggestion;
  assert.equal(tracked.status, '已调整');
  assert.equal(tracked.reply, '已把排班表改为提前一周发布');

  // 协调事项状态流转。
  const coordId = feedback.coordinates[0].id;
  assert.equal((await board.request(`/api/dashboard/feedback/coordinates/${coordId}/status`, { status: '协调中' })).status, 403);
  const progressed = await manager.request(`/api/dashboard/feedback/coordinates/${coordId}/status`, { status: '协调中' });
  assert.equal(progressed.status, 200);
  assert.equal((await alice.tea()).body.coordinates[0].status, '协调中');
});

test('private vents are visible and actionable only to named management members', async t => {
  const { browser } = await fixture(t);
  const alice = browser();
  await alice.enterTea();
  await alice.rename('吐槽员工');
  const posted = await alice.action('vent', { body: '晚场空调太冷了，希望能调高两度。' });
  assert.equal(posted.status, 200, JSON.stringify(posted.body));
  // 提交成功，但员工端状态里不下发任何吐槽内容（包括自己刚发的）。
  assert.deepEqual(posted.body.vents, []);

  const bob = browser();
  await bob.enterTea();
  assert.deepEqual((await bob.tea()).body.vents, []);
  assert.doesNotMatch(JSON.stringify((await bob.tea()).body), /晚场空调太冷了/);

  const board = browser();
  await board.unlockBoard();
  const denied = await board.request('/api/dashboard/feedback');
  assert.equal(denied.status, 403);
  assert.doesNotMatch(JSON.stringify(denied.body), /晚场空调太冷了/);
  const admin = browser();
  assert.equal((await admin.login('demo', 'demo2026!')).status, 200);
  assert.equal((await admin.unlockManagement()).status, 200);
  const feedback = (await admin.request('/api/dashboard/feedback')).body;
  assert.equal(feedback.vents.length, 1);
  assert.doesNotMatch(JSON.stringify(feedback.vents), /吐槽员工/);
  const ventId = feedback.vents[0].id;
  assert.equal((await board.request(`/api/dashboard/feedback/vents/${ventId}/visibility`, { hidden: true })).status, 403);
  const hidden = await admin.request(`/api/dashboard/feedback/vents/${ventId}/visibility`, { hidden: true });
  assert.equal(hidden.status, 200);
  const activity = (await bob.request('/api/tearoom/activity')).body;
  assert.equal(activity.items.filter(item => item.kind === 'vent').length, 0);
});


test('honors require named management to publish and remain visible on the tearoom wall', async t => {
  const { browser } = await fixture(t);
  const board = browser();
  await board.unlockBoard();
  const admin = browser();
  assert.equal((await admin.login('demo', 'demo2026!')).status, 200);
  assert.equal((await admin.unlockManagement()).status, 200);
  assert.equal((await board.request('/api/dashboard/honors')).status, 403);
  assert.equal((await board.request('/api/dashboard/honors', { periodType: 'week', personName: '只读', citation: '权限检查' })).status, 403);
  for (const [periodType, personName] of [['month', '月星同事'], ['week', '周星同事'], ['yesterday', '昨日星同事']]) {
    const published = await admin.request('/api/dashboard/honors', { periodType, personName, citation: '这一期表现特别温暖，值得大家学习。' });
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

test('honor photos published by management remain visible on the tea room wall', async t => {
  const { browser } = await fixture(t);
  const admin = browser();
  assert.equal((await admin.login('demo', 'demo2026!')).status, 200);
  assert.equal((await admin.unlockManagement()).status, 200);
  const pixelBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=', 'base64');
  const pixel = 'data:image/png;base64,' + pixelBytes.toString('base64');
  const published = await admin.request('/api/dashboard/honors', { periodType: 'week', personName: '带照片的星', citation: '照片版荣誉墙测试。', photoData: pixel });
  assert.equal(published.status, 201, JSON.stringify(published.body));
  assert.equal(published.body.hasPhoto, true);
  assert.equal(published.body.photoUrl, undefined);
  const bad = await admin.request('/api/dashboard/honors', { periodType: 'week', personName: '坏照片', citation: '应被拒绝。', photoData: 'data:text/html;base64,PGI+' });
  assert.equal(bad.status, 400);
  const visitor = browser();
  await visitor.enterTea();
  const wall = (await visitor.request('/api/tearoom/honors')).body;
  assert.equal(wall.current.week.photoUrl, `../api/tearoom/honors/${published.body.id}/photo`);
  const photoPath = wall.current.week.photoUrl.slice(2);
  assert.equal((await browser().request(photoPath)).status, 401);
  const photo = await visitor.raw(photoPath);
  assert.equal(photo.status, 200);
  assert.equal(photo.headers.get('content-type'), 'image/png');
  assert.equal(photo.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(Buffer.from(await photo.arrayBuffer()), pixelBytes);
  const url = 'https://example.invalid/honor.jpg';
  const fallback = await admin.request('/api/dashboard/honors', { periodType: 'month', personName: '引用照片的星', citation: '外链照片测试。', photoUrl: url });
  assert.equal(fallback.status, 201);
  assert.equal((await visitor.request('/api/tearoom/honors')).body.current.month.photoUrl, url);
  const tea = await visitor.raw('/tearoom/');
  const dashboard = await visitor.raw('/dashboard');
  assert.match(tea.headers.get('content-security-policy'), /img-src 'self' data: https:/);
  assert.doesNotMatch(dashboard.headers.get('content-security-policy'), /img-src [^;]*https:/);
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
  assert.equal(feed.items.some(item => item.kind === 'vent'), false);
  assert.equal(feed.items.some(item => item.kind === 'coordinate'), false);
  const serialized = JSON.stringify(feed);
  assert.doesNotMatch(serialized, /协调正文绝密内容|协调标题不应出现|建议正文不应出现在动态|吐槽正文不应出现在动态/);
  // 未进入茶水间的浏览器拿不到动态。
  assert.equal((await browser().request('/api/tearoom/activity')).status, 401);
});
