import { active, activeOn } from './directory.mjs';
import { duplicateEntry, fillableSession, hasSessionMetrics } from './entry.mjs';

const beijingClock = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});

export function beijingEntryTime(now = new Date()) {
  const [day, time] = beijingClock.format(now).split(' ');
  return { day, time };
}

// 录入完整性只认这六项（与录入页字段一一对应）：
// 业绩 orderAmount、单量 orders、直播时长 actualMinutes、浏览量 impressions、分享次数 shares、关注数 newFollowers。
// 判定口径：字段为 null/undefined 才算缺项；明确填入的 0 是有效值，计为已填。
export const COMPLETENESS_FIELDS = [
  ['orderAmount', '业绩'],
  ['orders', '单量'],
  ['actualMinutes', '直播时长'],
  ['impressions', '浏览量'],
  ['shares', '分享次数'],
  ['newFollowers', '关注数']
];

export const missingFields = row => COMPLETENESS_FIELDS
  .filter(([field]) => row?.[field] == null)
  .map(([, label]) => label);

export const isStopped = row => Boolean(row?.cancelled) || row?.sourceStatus === 'stopped';

// 单场状态：stopped 停播/取消（不计缺项）、complete 六项齐全、
// partial 已填一部分、empty 一项未填（无记录或占位记录）。
export function sessionStatus(row) {
  if (!row) return { status: 'empty', missing: COMPLETENESS_FIELDS.map(([, label]) => label) };
  if (isStopped(row)) return { status: 'stopped', missing: [] };
  const missing = missingFields(row);
  if (!missing.length) return { status: 'complete', missing };
  if (missing.length === COMPLETENESS_FIELDS.length) return { status: 'empty', missing };
  return { status: 'partial', missing };
}

// 按日期汇总每个直播间每个场次的录入完整性。
// 只返回状态与缺项名称，绝不返回任何指标数值（录入端只写不读的隔离要求）。
export function completenessForDate(store, roster, date, sessions = store.list('sessions'), clock = beijingEntryTime()) {
  return completenessForRows(roster, date, sessions.filter(row => row.date === date), clock);
}

function completenessForRows(roster, date, rows, clock) {
  const anchorsById = new Map(roster.anchors.map(anchor => [anchor.id, anchor]));
  const used = new Set();
  const groups = new Map();
  const groupFor = account => {
    if (!groups.has(account.id)) {
      groups.set(account.id, { accountId: account.id, accountName: account.name, sessions: [] });
    }
    return groups.get(account.id);
  };
  const describe = (row, anchor, slot, selectable = false, ambiguous = false, historicalReference = false) => {
    const current = sessionStatus(row);
    const startsAt = row?.scheduleUnknown === false ? row.start ?? slot?.start : slot?.start;
    const upcoming = ['empty', 'partial'].includes(current.status) &&
      (date > clock.day || (date === clock.day && startsAt && clock.time < startsAt));
    const { status, missing } = upcoming ? { status: 'upcoming', missing: [] } : current;
    const slotId = row?.slotId ?? slot?.id ?? anchor?.slotId ?? null;
    const hasMissing = status === 'empty' || status === 'partial';
    const compatible = !row || (row.anchorId === anchor?.id && (!row.slotId || row.slotId === anchor?.slotId));
    const canEnter = selectable && !ambiguous && !historicalReference && hasMissing && compatible &&
      (!row || hasSessionMetrics(row) || fillableSession(row, { anchorId: anchor.id, slotId }));
    return {
      anchorId: anchor?.id ?? row?.anchorId ?? null,
      anchorName: anchor?.name ?? anchorsById.get(row?.anchorId)?.name ?? '未分配主播',
      slotId, slotLabel: row?.slotLabel ?? slot?.name ?? anchor?.slotLabel ?? '直播场次',
      period: row?.period ?? slot?.period ?? null,
      status, missing, missingKeys: hasMissing ? COMPLETENESS_FIELDS.filter(([field]) => row?.[field] == null).map(([field]) => field) : [],
      canEnter, ambiguous, ...(historicalReference && { historicalReference })
    };
  };

  // 名录内当日有效的场次：有记录按记录判定，无记录记为未录。
  for (const account of roster.accounts.filter(active)) {
    const group = groupFor(account);
    const anchors = roster.anchors.filter(anchor => anchor.accountId === account.id && activeOn(anchor, date) &&
      (!roster.slots || roster.slots.some(slot => slot.accountId === account.id && slot.id === anchor.slotId && active(slot))));
    const matchesByAnchor = new Map();
    const roomRows = rows.filter(row => row.accountId === account.id);
    for (const anchor of anchors) {
      const entry = { date, accountId: account.id, anchorId: anchor.id };
      const matching = duplicateEntry(entry, roomRows);
      const candidates = roomRows.filter(row => row.anchorId === anchor.id && (!row.slotId || row.slotId === anchor.slotId));
      const row = candidates.find(candidate => !isStopped(candidate)) ?? candidates[0] ?? null;
      const ambiguous = matching.length > 1 || (matching.length === 1 && matching[0].id !== row?.id);
      if (row) used.add(row.id);
      matchesByAnchor.set(anchor.id, { row, ambiguous });
    }
    for (const anchor of anchors) {
      const slot = roster.slots?.find(slot => slot.accountId === account.id && slot.id === anchor.slotId);
      const { row, ambiguous } = matchesByAnchor.get(anchor.id);
      const soleSlot = anchor.slotId && anchors.filter(other => other.slotId === anchor.slotId).length === 1;
      const references = !row && !ambiguous && soleSlot ? roomRows.filter(candidate =>
        !used.has(candidate.id) && !anchorsById.has(candidate.anchorId) && candidate.slotId === anchor.slotId &&
        (candidate.sourceStatus || candidate.importBatch || candidate.sourceWorkbook)) : [];
      const reference = references.length === 1 ? references[0] : null;
      if (reference) used.add(reference.id);
      group.sessions.push(describe(row ?? reference, anchor, slot, true, ambiguous, Boolean(reference)));
    }
  }
  // 名录之外的当日记录（如导入数据）也如实列出，避免总览漏项。
  for (const row of rows) {
    if (used.has(row.id)) continue;
    used.add(row.id);
    const account = roster.accounts.find(item => item.id === row.accountId);
    const group = account ? groupFor(account) : (groups.get('') ?? groups.set('', {
      accountId: '', accountName: '未分配直播间', sessions: []
    }).get(''));
    const anchor = anchorsById.get(row.anchorId);
    const slot = roster.slots?.find(slot => slot.accountId === row.accountId && slot.id === (row.slotId ?? anchor?.slotId));
    group.sessions.push(describe(row, anchor, slot));
  }

  const accounts = [...groups.values()].filter(group => group.sessions.length);
  const summary = blankSummary();
  for (const group of accounts) addSummary(summary, summarizeSessions(group.sessions));
  return { date, accounts, summary };
}

const blankSummary = () => ({ expected: 0, complete: 0, partial: 0, empty: 0, stopped: 0, upcoming: 0 });
function addSummary(target, source) {
  for (const key of Object.keys(target)) target[key] += source[key];
}
function summarizeSessions(sessions) {
  const summary = blankSummary();
  for (const session of sessions) {
    if (session.status !== 'upcoming') summary.expected++;
    summary[session.status]++;
  }
  return summary;
}

export function shiftDate(value, days) {
  const parsed = new Date(value + 'T00:00:00Z');
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

export const monthToDateRange = today => ({ from: today.slice(0, 8) + '01', to: today });

export function completenessRange(store, roster, from, to, sessions = store.list('sessions'), clock = beijingEntryTime()) {
  const byDate = new Map();
  for (const session of sessions) {
    if (session.date < from || session.date > to) continue;
    if (!byDate.has(session.date)) byDate.set(session.date, []);
    byDate.get(session.date).push(session);
  }
  const days = [];
  const accounts = new Map();
  const summary = blankSummary();
  for (let date = from; date <= to; date = shiftDate(date, 1)) {
    const day = completenessForRows(roster, date, byDate.get(date) ?? [], clock);
    const pendingShifts = day.accounts.flatMap(group => group.sessions
      .filter(session => session.canEnter)
      .map(({ anchorId, anchorName, slotId, slotLabel, period, status, missing, missingKeys }) => ({
        accountId: group.accountId, anchorId, anchorName, slotId, slotLabel, period, status, missing, missingKeys
      })));
    days.push({ date, summary: day.summary, pendingShifts });
    addSummary(summary, day.summary);
    for (const group of day.accounts) {
      if (!accounts.has(group.accountId)) {
        const { accountId, accountName } = group;
        accounts.set(accountId, { accountId, accountName, summary: blankSummary() });
      }
      addSummary(accounts.get(group.accountId).summary, summarizeSessions(group.sessions));
    }
  }
  return { from, to, days, accounts: [...accounts.values()], summary };
}
