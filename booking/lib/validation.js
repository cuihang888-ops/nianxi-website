'use strict';

class HttpError extends Error {
  constructor(status, message, details = {}) { super(message); this.status = status; this.details = details; }
}
function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function text(value, name, max = 80, optional = false) {
  if (optional && (value === undefined || value === null)) return '';
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new HttpError(400, `${name}格式不正确（最多 ${max} 字）`);
  }
  const cleaned = value.trim();
  if (!optional && !cleaned) throw new HttpError(400, `请填写${name}`);
  return cleaned;
}
function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '2000-01-01' || value > '2100-12-31') return false;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}
function date(value, name = '日期') {
  if (!validDate(value)) throw new HttpError(400, `${name}无效，请使用 YYYY-MM-DD`);
  return value;
}
function addDays(value, offset) {
  return new Date(Date.parse(`${date(value)}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
}
function shanghaiDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
function dateRange(search, fallback) {
  const one = search.get('date');
  const from = date(search.get('from') || one || fallback, '开始日期');
  const to = date(search.get('to') || one || from, '结束日期');
  if (to < from || Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`) > 92 * 86400000) {
    throw new HttpError(400, '查询区间须为 1 至 93 天');
  }
  return { from, to };
}
function avatar(value) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string' || value.length > 1400000) throw new HttpError(400, '头像须为不超过 1 MB 的图片');
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) throw new HttpError(400, '头像只支持 PNG、JPEG 或 WebP 图片');
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length > 1048576 || bytes.toString('base64') !== match[2]) throw new HttpError(400, '头像数据无效或超过 1 MB');
  const valid = (match[1] === 'png' && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) ||
    (match[1] === 'jpeg' && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) ||
    (match[1] === 'webp' && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP');
  if (!valid) throw new HttpError(400, '头像文件内容与图片格式不符');
  return value;
}
module.exports = { HttpError, object, text, validDate, date, addDays, shanghaiDate, dateRange, avatar };
