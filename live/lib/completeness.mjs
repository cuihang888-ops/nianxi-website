import { active, activeOn } from './directory.mjs';

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
export function completenessForDate(store, roster, date) {
  const rows = store.list('sessions').filter(row => row.date === date);
  const anchorsById = new Map(roster.anchors.map(anchor => [anchor.id, anchor]));
  const used = new Set();
  const groups = new Map();
  const groupFor = account => {
    if (!groups.has(account.id)) {
      groups.set(account.id, { accountId: account.id, accountName: account.name, sessions: [] });
    }
    return groups.get(account.id);
  };
  const describe = (row, anchor) => {
    const { status, missing } = sessionStatus(row);
    return {
      anchorId: anchor?.id ?? row?.anchorId ?? null,
      anchorName: anchor?.name ?? anchorsById.get(row?.anchorId)?.name ?? '未分配主播',
      slotLabel: row?.slotLabel ?? anchor?.slotLabel ?? '直播场次',
      period: row?.period ?? null,
      status, missing
    };
  };

  // 名录内当日有效的场次：有记录按记录判定，无记录记为未录。
  for (const account of roster.accounts.filter(active)) {
    const group = groupFor(account);
    const anchors = roster.anchors.filter(anchor => anchor.accountId === account.id && activeOn(anchor, date));
    for (const anchor of anchors) {
      const row = rows.find(candidate => !used.has(candidate.id) && candidate.accountId === account.id &&
        (candidate.anchorId === anchor.id ||
          (candidate.slotId && anchor.slotId && candidate.slotId === anchor.slotId)));
      if (row) used.add(row.id);
      group.sessions.push(describe(row ?? null, anchor));
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
    group.sessions.push(describe(row, anchorsById.get(row.anchorId)));
  }

  const accounts = [...groups.values()].filter(group => group.sessions.length);
  const summary = { expected: 0, complete: 0, partial: 0, empty: 0, stopped: 0 };
  for (const group of accounts) for (const session of group.sessions) {
    summary.expected++;
    summary[session.status]++;
  }
  return { date, accounts, summary };
}

const blankSummary = () => ({ expected: 0, complete: 0, partial: 0, empty: 0, stopped: 0 });
const addSummary = (target, source) => {
  for (const key of Object.keys(target)) target[key] += source[key] ?? 0;
};
const summarizeSessions = sessions => {
  const summary = blankSummary();
  for (const session of sessions) { summary.expected++; summary[session.status]++; }
  return summary;
};

// YYYY-MM-DD 按 UTC 加减天数，避免本地时区漂移。
export const shiftDate = (value, days) => {
  const parsed = new Date(value + 'T00:00:00Z');
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
};

// 提醒周期口径（负责人 2026-11-28 定版）：以自然月为周期——
// 本月 1 号到今天之内的未录/缺项都算待补；跨了月不再提醒；今天之后还没发生的场次不算未录。
export const monthToDateRange = today => ({ from: today.slice(0, 8) + '01', to: today });

// 范围汇总：逐日复用 completenessForDate，保证范围数与单日结果永远对得上。
// 返回逐日汇总（升序）、按直播间汇总与总汇总；同样只含状态计数，不含任何指标数值。
export function completenessRange(store, roster, from, to) {
  const days = [];
  const accountsById = new Map();
  const summary = blankSummary();
  if (from <= to) {
    for (let date = from; date <= to; date = shiftDate(date, 1)) {
      const day = completenessForDate(store, roster, date);
      days.push({ date, summary: day.summary });
      addSummary(summary, day.summary);
      for (const group of day.accounts) {
        if (!accountsById.has(group.accountId)) {
          accountsById.set(group.accountId, { accountId: group.accountId, accountName: group.accountName, summary: blankSummary() });
        }
        addSummary(accountsById.get(group.accountId).summary, summarizeSessions(group.sessions));
      }
    }
  }
  return { from, to, days, accounts: [...accountsById.values()], summary };
}
