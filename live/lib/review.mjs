import { randomUUID } from 'node:crypto';
import { chinaDate } from './seed.mjs';
import { ApiError, date, keys, text } from './validation.mjs';

const DAY_MS = 86400000;
const NOTE_KIND = 'anchor-review-notes';
const shift = (day, days) => new Date(Date.parse(day + 'T00:00:00Z') + days * DAY_MS).toISOString().slice(0, 10);
const dayCount = (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS) + 1;
const known = value => typeof value === 'number' && Number.isFinite(value);
const inPeriod = (rows, from, to) => rows.filter(row => row.date >= from && row.date <= to);
const usable = row => row.status === 'completed' && row.sourceStatus !== 'stopped';
const startTime = row => row.scheduleUnknown ? null : row.start;

function average(rows, key) {
  const reported = rows.filter(row => known(row[key]));
  return {
    value: reported.length ? reported.reduce((sum, row) => sum + row[key], 0) / reported.length : null,
    reported: reported.length
  };
}

function ratio(rows, numerator, denominator) {
  const reported = rows.filter(row => known(row[numerator]) && known(row[denominator]));
  const base = reported.reduce((sum, row) => sum + row[denominator], 0);
  return {
    value: base > 0 ? reported.reduce((sum, row) => sum + row[numerator], 0) / base : null,
    reported: reported.length
  };
}

function metrics(rows) {
  return {
    sessions: rows.length,
    received: average(rows, 'received'),
    orders: average(rows, 'orders'),
    viewers: average(rows, 'viewers'),
    paymentRate: ratio(rows, 'paidOrders', 'orders'),
    refundRate: ratio(rows, 'refundOrders', 'paidOrders'),
    conversionRate: ratio(rows, 'orders', 'viewers'),
    adEfficiency: ratio(rows, 'received', 'adSpend')
  };
}

function matchPeer(reference, peer) {
  if (reference.accountId !== peer.accountId) return false;
  if (reference.slotId && peer.slotId) return reference.slotId === peer.slotId;
  return Boolean(startTime(reference) && startTime(reference) === startTime(peer));
}

function getPeriods(params, own, today) {
  const mode = params.get('mode') || 'week';
  if (!['week', 'month', 'custom', 'recent'].includes(mode)) throw new ApiError(400, '请选择复盘区间');
  const to = date(params.get('to') || today, '结束日期');
  if (to > today) throw new ApiError(400, '复盘日期不能晚于今天');
  if (mode === 'recent') {
    const limit = Number(params.get('count') || 5);
    if (!Number.isSafeInteger(limit) || limit < 1) throw new ApiError(400, '最近场次请输入正整数');
    const completed = own.filter(row => row.date <= to);
    return Array.from({ length: 6 }, (_, index) => {
      const rows = completed.slice(index * limit, (index + 1) * limit);
      return { label: index ? '前 ' + index + ' 组' : '最近 ' + limit + ' 场', from: rows.at(-1)?.date ?? null, to: rows[0]?.date ?? null, rows };
    });
  }
  const from = mode === 'month' ? to.slice(0, 7) + '-01'
    : mode === 'custom' ? date(params.get('from') || '', '开始日期')
      : shift(to, -6);
  const length = dayCount(from, to);
  if (length < 1) throw new ApiError(400, '开始日期不能晚于结束日期');
  return Array.from({ length: 6 }, (_, index) => {
    let start = shift(from, -index * length);
    let end = shift(to, -index * length);
    if (mode === 'month' && index) {
      const monthBefore = new Date(from + 'T00:00:00Z');
      monthBefore.setUTCMonth(monthBefore.getUTCMonth() - index);
      start = monthBefore.toISOString().slice(0, 10);
      monthBefore.setUTCMonth(monthBefore.getUTCMonth() + 1);
      end = shift(monthBefore.toISOString().slice(0, 10), -1);
    }
    return { from: start, to: end, label: start.slice(5) + '–' + end.slice(5), rows: inPeriod(own, start, end) };
  });
}

function findAnchor(store, id) {
  const anchor = store.get('anchors', text(id, '主播', 160, true));
  if (!anchor) throw new ApiError(404, '找不到该主播');
  return anchor;
}

function publicNote({ id, date, reason, action, updatedAt }) {
  return { id, date, reason, action, updatedAt };
}

export async function handleAnchorReview({ path, url, request, response, user, store, send, body, canWriteNotes }) {
  if (path !== '/api/anchor-review' && path !== '/api/anchor-review/notes') return false;
  const today = chinaDate();
  if (path === '/api/anchor-review' && request.method === 'GET') {
    const anchor = findAnchor(store, url.searchParams.get('anchorId'));
    const rows = store.list('sessions').filter(usable);
    const own = rows.filter(row => row.anchorId === anchor.id)
      .sort((a, b) => b.date.localeCompare(a.date) || (b.start || '').localeCompare(a.start || '') || b.id.localeCompare(a.id));
    const periods = getPeriods(url.searchParams, own, today);
    const [current, previous] = periods;
    const peers = current.from
      ? inPeriod(rows, current.from, current.to).filter(row => row.anchorId !== anchor.id && current.rows.some(session => matchPeer(session, row)))
      : [];
    const notes = store.list(NOTE_KIND).filter(note => note.anchorId === anchor.id)
      .sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt)).slice(0, 8)
      .map(publicNote);
    const summarize = ({ rows, ...period }) => ({ ...period, ...metrics(rows) });
    send(response, 200, {
      anchor: { id: anchor.id, name: anchor.name },
      current: summarize(current), previous: summarize(previous), peer: metrics(peers),
      trend: periods.slice().reverse().map(summarize), notes, canWriteNotes: Boolean(canWriteNotes)
    });
    return true;
  }
  if (path === '/api/anchor-review/notes' && request.method === 'POST') {
    if (!canWriteNotes) throw new ApiError(403, '请使用负责人或主管账号保存复盘记录');
    const input = await body(request);
    keys(input, ['anchorId', 'date', 'reason', 'action']);
    const anchor = findAnchor(store, input.anchorId);
    const noteDate = date(input.date, '复盘日期');
    if (noteDate > today) throw new ApiError(400, '复盘日期不能晚于今天');
    const reason = text(input.reason ?? '', '主播自述', 800);
    const action = text(input.action ?? '', '约定的改进点', 400);
    if (!reason && !action) throw new ApiError(400, '请填写主播自述或约定的改进点');
    const note = store.save(NOTE_KIND, { id: randomUUID(), anchorId: anchor.id, date: noteDate, reason, action }, undefined, user);
    send(response, 201, { note: publicNote(note) });
    return true;
  }
  throw new ApiError(405, '请求方法不支持');
}
