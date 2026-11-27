import { ApiError, keys, text, date, version, numeric, sessionInput } from './validation.mjs';

export const ROLES = ['admin', 'manager', 'anchor_entry', 'service_entry', 'editor', 'viewer'];
export const PUBLIC_ENTRY_USER = { id: 'public-entry', name: '匿名录入', role: 'public_entry' };
export const isStaff = user => ['anchor_entry', 'service_entry'].includes(user?.role);
export const anchorEntryFields = ['actualStart', 'actualEnd', 'reach', 'views', 'viewers', 'impressions', 'interactions', 'reactions', 'comments', 'shares', 'linkClicks', 'newFollowers', 'peak', 'watchSeconds'];
export const serviceEntryFields = ['orders', 'paidOrders', 'units', 'refundOrders', 'messages', 'qualified'];
const publicEntryFields = ['orderAmount', 'orders', 'actualMinutes', 'impressions', 'shares', 'newFollowers', 'viewers'];
export function entryFields(user) {
  if (user.role === 'anchor_entry') return anchorEntryFields;
  if (user.role === 'service_entry') return serviceEntryFields;
  return [...anchorEntryFields, ...serviceEntryFields];
}
export function safeDataset(dataset) { return { kind: dataset.kind, label: dataset.label }; }
const own = (item, key) => item[key] ?? null;
export function safeEntrySession(item, user) {
  const result = Object.fromEntries(['id', 'date', 'accountId', 'anchorId', 'version', 'updatedAt'].map(key => [key, own(item, key)]));
  result.slotId = item.slotId || item.anchorId;
  result.slotLabel = item.slotLabel || '直播场次';
  result.scheduleUnknown = !!item.scheduleUnknown;
  if (user.role === PUBLIC_ENTRY_USER.role) {
    result.salesRecorded = Number.isFinite(item.orderAmount);
    for (const field of publicEntryFields) result[field] = own(item, field);
    return result;
  }
  result.updatedBy = own(item, 'updatedBy');
  for (const field of entryFields(user)) result[field] = own(item, field);
  if (user.role !== 'service_entry') result.actualMinutes = own(item, 'actualMinutes');
  return result;
}
export function entryDirectory(store) {
  const sessions = store.list('sessions');
  return {
    accounts: store.list('accounts').map(({ id, name }) => ({ id, name })),
    anchors: store.list('anchors').map(item => {
      const latest = sessions.filter(session => session.anchorId === item.id).sort((a, b) => b.date.localeCompare(a.date))[0];
      return {
        id: item.id, name: item.name, accountId: item.accountId || latest?.accountId || null,
        slotId: item.slotId || latest?.slotId || item.id, slotLabel: item.slotLabel || latest?.slotLabel || '直播场次',
        activeFrom: item.activeFrom || null, activeTo: item.activeTo || null
      };
    })
  };
}

export function entryInput(input, existing, user, known) {
  const isPublic = user.role === PUBLIC_ENTRY_USER.role;
  const allowed = isPublic ? publicEntryFields : entryFields(user);
  keys(input, existing ? ['version', ...allowed] : ['date', 'accountId', 'anchorId', ...allowed]);
  if (existing) version(input.version);
  const anchorId = existing?.anchorId || text(input.anchorId, '主播', 160, true);
  const accountId = existing?.accountId || text(input.accountId, '账号', 160, true);
  const selectedDate = existing?.date || date(input.date);
  const anchor = known.anchors.find(item => item.id === anchorId);
  if (!anchor) throw new ApiError(400, '请选择有效主播');
  const entryAnchor = known.entryAnchors.find(item => item.id === anchorId);
  if (!known.accounts.some(item => item.id === accountId)) throw new ApiError(400, '请选择有效直播间');
  if (!existing && entryAnchor?.accountId && entryAnchor.accountId !== accountId) throw new ApiError(400, '主播与直播间归属不一致');
  if (!existing && ((anchor.activeFrom && selectedDate < anchor.activeFrom) || (anchor.activeTo && selectedDate > anchor.activeTo))) throw new ApiError(400, '该主播在此日期不在录入名录有效期内');
  const patch = Object.fromEntries(allowed.filter(key => Object.hasOwn(input, key)).map(key => [key, input[key]]));
  if (isPublic && Object.hasOwn(patch, 'actualMinutes') && patch.actualMinutes !== null) {
    if (numeric(patch.actualMinutes, '直播时长（分钟）', true) > 1440) throw new ApiError(400, '单场直播时长最长 24 小时');
  }
  if (!existing) Object.assign(patch, { date: selectedDate, accountId, anchorId, start: '00:00', end: '00:01', status: 'completed', scheduleUnknown: true });
  const result = sessionInput(patch, existing, known);
  if (!existing) {
    result.slotId = entryAnchor?.slotId || anchor.id;
    result.slotLabel = entryAnchor?.slotLabel || '直播场次';
  }
  return result;
}

export function duplicateEntry(item, sessions, anchors) {
  const slot = item.slotId || anchors.find(anchor => anchor.id === item.anchorId)?.slotId || item.anchorId;
  return sessions.find(other => other.date === item.date && other.accountId === item.accountId && (other.slotId || anchors.find(anchor => anchor.id === other.anchorId)?.slotId || other.anchorId) === slot);
}
