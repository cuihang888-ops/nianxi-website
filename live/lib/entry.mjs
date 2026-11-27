import { ApiError, keys, text, date, numeric, sessionInput, moneyFields, countFields } from './validation.mjs';
import { active, activeOn, slotTiming } from './directory.mjs';

export const ROLES = ['admin', 'manager', 'anchor_entry', 'service_entry', 'editor', 'viewer'];
export const PUBLIC_ENTRY_USER = { id: 'public-entry', name: '匿名录入', role: 'public_entry' };
export const isStaff = user => ['anchor_entry', 'service_entry'].includes(user?.role);
export const anchorEntryFields = ['actualStart', 'actualEnd', 'reach', 'views', 'viewers', 'impressions', 'interactions', 'reactions', 'comments', 'shares', 'linkClicks', 'newFollowers', 'peak', 'watchSeconds'];
export const serviceEntryFields = ['orders', 'paidOrders', 'units', 'refundOrders', 'messages', 'qualified'];
const publicEntryFields = ['orderAmount', 'orders', 'actualMinutes', 'impressions', 'shares', 'newFollowers', 'viewers'];
const sessionMetrics = [...moneyFields.filter(field => field !== 'target'), ...countFields, 'actualMinutes', 'actualStart', 'actualEnd'];
export function entryFields(user) {
  if (user.role === 'anchor_entry') return anchorEntryFields;
  if (user.role === 'service_entry') return serviceEntryFields;
  return [...anchorEntryFields, ...serviceEntryFields];
}
export function safeDataset(dataset) { return { kind: dataset.kind, label: dataset.label }; }
export function entryDirectory(roster) {
  const accounts = roster.accounts.filter(active);
  const accountsById = new Set(accounts.map(account => account.id));
  const slots = roster.slots.filter(slot => active(slot) && accountsById.has(slot.accountId));
  return {
    accounts: accounts.map(({ id, name }) => ({ id, name })),
    slots: slots.map(({ id, accountId, name, period, start, end, endDayOffset }) => ({ id, accountId, name, period, start, end, endDayOffset })),
    anchors: roster.anchors.filter(item => active(item) && slots.some(slot => slot.accountId === item.accountId && slot.id === item.slotId))
      .map(({ id, name, accountId, slotId, slotLabel, activeFrom, activeTo }) => ({
        id, name, accountId, slotId, slotLabel, activeFrom: activeFrom ?? null, activeTo: activeTo ?? null
      }))
  };
}

export function entryInput(input, user, known) {
  const isPublic = user.role === PUBLIC_ENTRY_USER.role;
  const allowed = isPublic ? publicEntryFields : entryFields(user);
  keys(input, ['date', 'accountId', 'anchorId', ...allowed, ...(isPublic ? ['confirmAmount'] : [])]);
  if (isPublic && Object.hasOwn(input, 'confirmAmount') && typeof input.confirmAmount !== 'boolean') {
    throw new ApiError(400, '金额确认须为布尔值');
  }
  const anchorId = text(input.anchorId, '主播', 160, true);
  const accountId = text(input.accountId, '账号', 160, true);
  const selectedDate = date(input.date);
  const anchor = known.anchors.find(item => item.id === anchorId);
  if (!anchor) throw new ApiError(400, '请选择有效主播');
  if (!active(known.accounts.find(item => item.id === accountId))) throw new ApiError(400, '请选择已启用的直播间');
  if (!activeOn(anchor, selectedDate)) throw new ApiError(400, '该主播在此日期不在录入名录有效期内');
  if (anchor.accountId !== accountId) throw new ApiError(400, '主播与直播间归属不一致');
  const slot = known.slots.find(item => item.accountId === accountId && item.id === anchor.slotId);
  if (!active(slot)) throw new ApiError(400, '请选择已启用的场次');
  const patch = Object.fromEntries(allowed.filter(key => Object.hasOwn(input, key)).map(key => [key, input[key]]));
  if (!Object.values(patch).some(value => value !== null)) {
    throw new ApiError(400, '请至少填写一项指标');
  }
  if (isPublic && Object.hasOwn(patch, 'actualMinutes') && patch.actualMinutes !== null) {
    if (numeric(patch.actualMinutes, '直播时长（分钟）', true) > 1440) throw new ApiError(400, '单场直播时长最长 24 小时');
  }
  Object.assign(patch, {
    date: selectedDate, accountId, anchorId, start: '00:00', end: '00:01', status: 'completed',
    scheduleUnknown: true, ...slotTiming(slot)
  });
  const result = sessionInput(patch, null, known);
  result.slotId = slot.id;
  result.slotLabel = slot.name;
  result.period = slot.period;
  return result;
}

export function duplicateEntry(item, sessions, anchors) {
  return sessions.filter(other => !other.cancelled && other.date === item.date && other.accountId === item.accountId &&
    (other.anchorId === item.anchorId || (other.slotId || anchors.find(anchor => anchor.id === other.anchorId)?.slotId) === item.slotId));
}

export function hasSessionMetrics(row) {
  return sessionMetrics.some(field => row[field] != null);
}

export function fillableSession(row, entry) {
  if (row.anchorId !== entry.anchorId || (row.slotId && row.slotId !== entry.slotId) ||
    row.status !== 'planned' || row.cancelled || hasSessionMetrics(row)) return false;
  if (row.sourceStatus === 'missing') return row.version === 1 && row.scheduleUnknown === true && row.target == null;
  return row.sourceStatus == null && (row.managedSchedule === true || row.scheduleUnknown !== true);
}

export function fillSession(row, entry) {
  const values = sessionMetrics.filter(field => entry[field] != null).map(field => [field, entry[field]]);
  return { ...row, ...Object.fromEntries(values), slotId: row.slotId ?? entry.slotId, slotLabel: row.slotLabel ?? entry.slotLabel, status: 'completed' };
}

// 补录口径：场次已有一部分指标时，只允许补齐仍为空缺的字段。
// 新提交若与已填数值不一致（同字段两个不同的值），不视为补录，仍按重复提交拦截，避免覆盖已填数值。
export function mergeableSession(row, entry) {
  if (row.anchorId !== entry.anchorId || (row.slotId && row.slotId !== entry.slotId) ||
    row.cancelled || row.sourceStatus === 'stopped' || !hasSessionMetrics(row)) return false;
  let additions = 0;
  for (const field of sessionMetrics) {
    if (entry[field] == null) continue;
    if (row[field] == null) additions++;
    else if (row[field] !== entry[field]) return false;
  }
  return additions > 0;
}

export function mergeSession(row, entry) {
  const values = sessionMetrics.filter(field => row[field] == null && entry[field] != null)
    .map(field => [field, entry[field]]);
  return { ...row, ...Object.fromEntries(values), status: 'completed' };
}
