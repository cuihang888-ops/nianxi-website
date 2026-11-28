import { randomUUID } from 'node:crypto';
import { anchorDefaults } from './seed.mjs';
import { ApiError, date, keys, text, version } from './validation.mjs';

const slotKey = (accountId, slotId) => accountId + ':' + slotId;
const periods = {
  early: { name: '早场', start: '08:00', end: '13:40', endDayOffset: 0 },
  middle: { name: '中场', start: '14:00', end: '19:40', endDayOffset: 0 },
  late: { name: '晚场', start: '20:00', end: '02:00', endDayOffset: 1 }
};
const periodNames = Object.keys(periods);
const validPeriod = period => typeof period === 'string' && Object.hasOwn(periods, period);

function inferredPeriod(slotId, name) {
  if (validPeriod(slotId)) return slotId;
  const legacy = /^(?:slot-|fb-slot-\d+-)([1-3])$/.exec(slotId);
  if (legacy) return periodNames[Number(legacy[1]) - 1];
  return periodNames.find(period => periods[period].name === name) ?? null;
}

function normalizedSlot(slot) {
  const period = validPeriod(slot.period) ? slot.period : inferredPeriod(slot.id, slot.name);
  const fixed = periods[period];
  return {
    ...slot, period, start: fixed?.start ?? null, end: fixed?.end ?? null,
    endDayOffset: fixed?.endDayOffset ?? null
  };
}

export function slotTiming(slot) {
  if (!validPeriod(slot?.period)) return {};
  const { start, end, endDayOffset } = periods[slot.period];
  return { start, end, endDayOffset, scheduleUnknown: false };
}

export const active = record => Boolean(record && record.active !== false);
export const activeOn = (anchor, date) => active(anchor) &&
  (!anchor.activeFrom || date >= anchor.activeFrom) &&
  (!anchor.activeTo || date <= anchor.activeTo);

export function directory(store, sessionRows = store.list('sessions')) {
  const accounts = store.list('accounts').map(record => ({ ...record, active: active(record), archived: record.archived === true }));
  const currentAccounts = new Set(accounts.map(account => account.id));
  const latest = new Map();
  for (const session of sessionRows) {
    const before = latest.get(session.anchorId);
    if (!before || session.date > before.date) latest.set(session.anchorId, session);
  }
  const anchors = store.list('anchors').map(record => {
    const fallback = store.demo ? anchorDefaults.find(anchor => anchor.id === record.id) : null;
    const history = latest.get(record.id);
    const accountId = record.accountId || fallback?.accountId || history?.accountId || null;
    const sameRoom = history?.accountId === accountId ? history : null;
    return {
      ...record, active: active(record), archived: record.archived === true, accountId,
      slotId: record.slotId || fallback?.slotId || sameRoom?.slotId || record.id,
      slotLabel: record.slotLabel || fallback?.slotLabel || sameRoom?.slotLabel || '直播场次'
    };
  });

  const slots = new Map();
  for (const row of [...anchors, ...sessionRows]) {
    if (!row.slotId || !currentAccounts.has(row.accountId)) continue;
    const id = slotKey(row.accountId, row.slotId);
    if (!slots.has(id)) {
      slots.set(id, normalizedSlot({ id: row.slotId, accountId: row.accountId, name: row.slotLabel || '直播场次', active: true, archived: false, version: 1 }));
    }
  }
  for (const record of store.list('slots')) {
    const { id: key, slotId, ...rest } = record;
    slots.set(key, normalizedSlot({ ...rest, id: slotId, active: active(record), archived: record.archived === true }));
  }
  for (const account of accounts) {
    const present = new Set([...slots.values()].filter(slot => slot.accountId === account.id).map(slot => slot.period));
    for (const period of periodNames) {
      if (present.has(period)) continue;
      const key = slotKey(account.id, period);
      if (slots.has(key)) continue;
      slots.set(key, normalizedSlot({ id: period, accountId: account.id, name: periods[period].name,
        period, active: true, archived: false, version: 1 }));
    }
  }
  const anchorRows = anchors.map(anchor => ({
    ...anchor, slotLabel: slots.get(slotKey(anchor.accountId, anchor.slotId))?.name || anchor.slotLabel
  }));
  return { accounts, anchors: anchorRows, slots: [...slots.values()] };
}

export function sessionSlotWrite(input, existing, roster) {
  const accountId = input.accountId ?? existing?.accountId;
  const anchorId = input.anchorId ?? existing?.anchorId;
  const sessionDate = input.date ?? existing?.date;
  const anchor = roster.anchors.find(item => item.id === anchorId);
  const moved = !existing || accountId !== existing.accountId || anchorId !== existing.anchorId;
  let slotId = existing?.slotId ?? null;
  if (Object.hasOwn(input, 'slotId')) slotId = text(input.slotId, '场次', 160, true);
  else if (moved) slotId = anchor?.accountId === accountId ? anchor.slotId : null;
  const reassigned = moved || sessionDate !== existing.date || (Object.hasOwn(input, 'slotId') && slotId !== existing.slotId);
  const slot = roster.slots.find(item => item.accountId === accountId && item.id === slotId);
  if (reassigned) {
    if (!active(roster.accounts.find(item => item.id === accountId))) throw new ApiError(409, '直播间已停用或不存在');
    if (!activeOn(anchor, sessionDate)) throw new ApiError(409, '主播已停用或不在该日期的录入名录内');
    if (anchor.accountId !== accountId || anchor.slotId !== slotId) throw new ApiError(409, '主播未分配至此直播间和场次');
    if (!active(slot)) throw new ApiError(409, '场次已停用或不存在');
  }
  const period = reassigned ? slot?.period ?? null : existing?.period;
  return {
    slotId,
    slotLabel: reassigned ? slot?.name ?? null : existing?.slotLabel ?? null,
    ...(period !== undefined && { period }),
    timing: reassigned ? slotTiming(slot) : {}
  };
}

const adminFields = {
  accounts: ['name', 'page', 'color', 'active'],
  anchors: ['name', 'accountId', 'slotId', 'active', 'activeFrom', 'activeTo'],
  slots: ['name', 'accountId', 'active', 'period']
};
const entityKeys = { accounts: 'account', anchors: 'anchor', slots: 'slot' };

export async function handleDirectory({ path, url, request, response, user, store, send, body }) {
  const match = /^\/api\/(accounts|anchors|slots)(?:\/([\w-]+))?$/.exec(path);
  const list = path === '/api/directory' && request.method === 'GET';
  if (!match && !list) return false;
  if (user.role !== 'admin') throw new ApiError(403, '仅管理员可以管理直播名录');
  if (list) {
    send(response, 200, directory(store));
    return true;
  }

  const [, kind, id] = match;
  const create = request.method === 'POST' && !id;
  const archive = request.method === 'DELETE' && id;
  if (!(create || archive || (request.method === 'PUT' && id))) throw new ApiError(405, '请求方法不支持');
  const input = await body(request);
  keys(input, archive ? ['version', ...(kind === 'slots' ? ['accountId'] : [])] : [
    ...adminFields[kind], ...(create ? [] : ['version'])
  ]);
  if (!create) version(input.version);
  if (Object.hasOwn(input, 'active') && typeof input.active !== 'boolean') throw new ApiError(400, '启用状态须为布尔值');

  const roster = directory(store);
  const accountScope = input.accountId ?? url.searchParams.get('accountId');
  const matches = create ? [] : roster[kind].filter(record => record.id === id &&
    (kind !== 'slots' || !accountScope || record.accountId === accountScope));
  if (matches.length > 1) throw new ApiError(400, '请指定场次所属直播间');
  const existing = matches[0];
  if (!create && !existing) throw new ApiError(404, '记录不存在');
  if (existing && existing.version !== input.version) throw new ApiError(409, '记录已更新，请重新载入名录');

  const next = {
    ...existing, id: existing?.id ?? randomUUID(),
    name: text(input.name ?? existing?.name, '名称', 120, true),
    active: archive ? false : input.active ?? existing?.active ?? true,
    archived: archive ? true : input.active === true ? false : Boolean(existing?.archived)
  };
  if (kind === 'accounts') {
    next.page = text(input.page ?? existing?.page ?? '', 'Facebook 页面', 300);
    next.color = text(input.color ?? existing?.color ?? '#174c3e', '颜色', 7);
    if (!/^#[0-9a-fA-F]{6}$/.test(next.color)) throw new ApiError(400, '账号颜色须为六位十六进制色值');
  }
  if (kind === 'anchors' || kind === 'slots') {
    next.accountId = text(input.accountId ?? existing?.accountId ?? '', '所属直播间', 160, create);
    if (kind === 'slots') {
      if (existing && next.accountId !== existing.accountId) throw new ApiError(400, '场次的所属直播间固定');
      if ((create || Object.hasOwn(input, 'period')) && !validPeriod(input.period)) throw new ApiError(400, '请选择早场、中场或晚场');
      next.period = input.period ?? existing?.period ?? null;
      if (next.active && next.period && roster.slots.some(slot => slot.accountId === next.accountId &&
          slot.id !== next.id && active(slot) && slot.period === next.period)) {
        throw new ApiError(409, '该直播间已启用同一时段的场次');
      }
    }
    if (kind === 'anchors') {
      next.slotId = text(input.slotId ?? existing?.slotId ?? '', '场次', 160, create);
      for (const key of ['activeFrom', 'activeTo']) {
        if (Object.hasOwn(input, key)) next[key] = input[key] === null ? null : date(input[key], '主播有效期');
      }
      if (next.activeFrom && next.activeTo && next.activeFrom > next.activeTo) throw new ApiError(400, '主播有效期结束日期早于开始日期');
    }
    if (create || (next.active && !existing?.active) || next.accountId !== existing?.accountId || next.slotId !== existing?.slotId) {
      if (!active(roster.accounts.find(item => item.id === next.accountId))) throw new ApiError(409, '请先启用所属直播间');
      if (kind === 'anchors') {
        const slot = roster.slots.find(item => item.accountId === next.accountId && item.id === next.slotId);
        if (!active(slot)) throw new ApiError(409, '请选择已启用的场次');
        next.slotLabel = slot.name;
      }
    }
  }
  if (kind !== 'anchors' && roster[kind].some(record => record.name === next.name &&
    (kind !== 'slots' || record.accountId === next.accountId) &&
    (record.id !== next.id || (kind === 'slots' && record.accountId !== next.accountId)))) {
    throw new ApiError(409, '名称已存在');
  }

  const stored = kind === 'slots'
    ? { ...next, id: slotKey(next.accountId, next.id), slotId: next.id }
    : next;
  // A slot derived from the legacy roster has an implicit version 1.
  const defaultRecord = kind === 'slots' && existing ? { ...existing, id: stored.id, slotId: existing.id } : undefined;
  const previousSlot = kind === 'anchors' && existing && (existing.accountId !== next.accountId || existing.slotId !== next.slotId)
    ? roster.slots.find(item => item.accountId === existing.accountId && item.id === existing.slotId)
    : null;
  const preserveSlot = previousSlot
    ? { ...previousSlot, id: slotKey(previousSlot.accountId, previousSlot.id), slotId: previousSlot.id }
    : undefined;
  const saved = store.save(kind, stored, existing?.version, user, { defaultRecord, preserveSlot });
  const result = kind === 'slots' ? normalizedSlot({ ...saved, id: saved.slotId }) : saved;
  send(response, create ? 201 : 200, { [entityKeys[kind]]: result });
  return true;
}
