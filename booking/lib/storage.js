'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');
const { object, validDate, avatar: validateAvatar } = require('./validation');

// Derived response data only. Originals remain in sellers.json unchanged.
// The bound also evicts replaced photos instead of retaining every edit forever.
const avatarCache = new Map();
const AVATAR_CACHE_BYTES = 32 * 1024 * 1024;
let avatarCacheBytes = 0;
function deriveAvatar(value) {
  if (typeof value !== 'string' || !value) return null;
  const cached = avatarCache.get(value);
  if (cached) {
    avatarCache.delete(value);
    avatarCache.set(value, cached);
    return cached;
  }
  try { if (!validateAvatar(value)) return null; } catch (_) { return null; }
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return null;
  const bytes = Buffer.from(match[2], 'base64');
  const result = { bytes, mime: match[1], hash: crypto.createHash('sha256').update(bytes).digest('hex'),
    size: value.length * 2 + bytes.length };
  while (avatarCache.size && avatarCacheBytes + result.size > AVATAR_CACHE_BYTES) {
    const oldest = avatarCache.keys().next().value;
    avatarCacheBytes -= avatarCache.get(oldest).size;
    avatarCache.delete(oldest);
  }
  if (result.size <= AVATAR_CACHE_BYTES) {
    avatarCache.set(value, result);
    avatarCacheBytes += result.size;
  }
  return result;
}

function readJson(filename, empty) {
  try { return JSON.parse(fs.readFileSync(filename, 'utf8').replace(/^\uFEFF/, '')); }
  catch (error) {
    if (error.code === 'ENOENT') return empty();
    throw new Error(`数据文件无法读取，已停止操作以保护原始数据：${path.basename(filename)}`, { cause: error });
  }
}
function atomicWrite(filename, value) {
  fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  const temporary = `${filename}.${crypto.randomBytes(8).toString('hex')}.tmp`;
  let handle;
  try {
    handle = fs.openSync(temporary, 'wx', 0o600);
    fs.writeFileSync(handle, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    fs.fsyncSync(handle);
    fs.closeSync(handle); handle = undefined;
    fs.renameSync(temporary, filename);
  } finally {
    if (handle !== undefined) fs.closeSync(handle);
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}
function badSchema(filename) { throw new Error(`数据结构无法识别，已保留原文件：${path.basename(filename)}`); }
function isString(value, max = 200) { return typeof value === 'string' && value.length > 0 && value.length <= max; }
function normalizeMultiline(value, max) {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/\r\n/g, '\n');
  // Keep paragraphs and tabs, but never remove invalid controls or coerce values.
  if (normalized.length > max || /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/u.test(normalized)) return null;
  return normalized.trim();
}
function normalizeIntroduction(value) { return normalizeMultiline(value, 2000); }
function loadStories(filename) {
  const data = readJson(filename, () => ({ version: 1, stories: [] }));
  if (!object(data) || data.version !== 1 || !Array.isArray(data.stories)) badSchema(filename);
  for (const story of data.stories) {
    if (!object(story) || !isString(story.id) || !isString(story.talentId) ||
      !isString(story.title, 80) || !validDate(story.date) ||
      !Number.isSafeInteger(story.revision) || story.revision < 1 ||
      typeof story.createdAt !== 'string' || !Number.isFinite(Date.parse(story.createdAt)) ||
      typeof story.updatedAt !== 'string' || !Number.isFinite(Date.parse(story.updatedAt)) ||
      !normalizeMultiline(story.content, 12000)) badSchema(filename);
  }
  ensureUnique(data.stories, item => item.id, filename);
  return data;
}
function ensureUnique(list, key, filename) {
  const values = list.map(key);
  if (new Set(values).size !== values.length) badSchema(filename);
}
const sellerScheduleContexts = new WeakMap();
function loadScheduleConfig(filename) {
  const value = readJson(filename, () => ({ version: 1, groups: {} }));
  config.validateScheduleConfig(value);
  return value;
}
function sellerScheduleContext(state) { return sellerScheduleContexts.get(state); }
function loadSellers(filename, scheduleConfig) {
  const directoryConfig = scheduleConfig === undefined
    ? loadScheduleConfig(path.join(path.dirname(filename), 'schedule-config.json')) : scheduleConfig;
  const directory = config.scheduleDirectory(directoryConfig);
  const knownDepartments = [...directory.departments, ...directory.archivedDepartments];
  const data = readJson(filename, () => ({ version: 1, talents: [], schedules: [] }));
  if (!object(data) || data.version !== 1 || !Array.isArray(data.talents) || !Array.isArray(data.schedules)) badSchema(filename);
  for (const talent of data.talents) {
    if (!object(talent) || !isString(talent.id) || !isString(talent.number, 24) || !isString(talent.name, 40) || typeof talent.active !== 'boolean' || typeof talent.avatar !== 'string') badSchema(filename);
    // Existing records need no migration or write just to expose an empty bio.
    const introduction = Object.hasOwn(talent, 'introduction') ? normalizeIntroduction(talent.introduction) : '';
    if (introduction === null) badSchema(filename);
    talent.introduction = introduction;
  }
  ensureUnique(data.talents, t => t.id, filename);
  ensureUnique(data.talents, t => t.number.toLowerCase(), filename);
  const ids = new Set(data.talents.map(t => t.id));
  for (const item of data.schedules) {
    const department = knownDepartments.find(d => d.id === item?.department);
    if (!object(item) || !isString(item.id) || !validDate(item.date) || !config.businesses.includes(item.business) || !config.storedScheduleSlots(department, item.group).includes(item.slot) || !isString(item.batchId)) badSchema(filename);
    // Older files have one talentId. Normalize those records in memory while
    // accepting the new talentIds array, including the optional third seller.
    const talentIds = Array.isArray(item.talentIds) ? item.talentIds : [item.talentId];
    if (talentIds.length < 1 || talentIds.length > config.maxTalentsPerSchedule || talentIds.some(id => !isString(id) || !ids.has(id)) || new Set(talentIds).size !== talentIds.length) badSchema(filename);
    if (item.talentIds !== undefined && (!Array.isArray(item.talentIds) || (item.talentId !== undefined && item.talentId !== talentIds[0]))) badSchema(filename);
    item.talentIds = talentIds;
    item.talentId = talentIds[0];
  }
  ensureUnique(data.schedules, s => s.id, filename);
  const talentKeys = data.schedules.flatMap(s => s.talentIds.map(talentId => `${s.date}|${s.slot}|${talentId}`));
  ensureUnique(talentKeys, key => key, filename);
  ensureUnique(data.schedules, s => `${s.date}|${s.slot}|${s.department}|${s.group}`, filename);
  sellerScheduleContexts.set(data, directoryConfig);
  return data;
}
function validRoomBooking(item) {
  return object(item) && isString(item.id) && validDate(item.date) && isString(item.room, 80) && config.slots.some(s => s.id === item.slot) && isString(item.department, 80) && isString(item.bookerName, 80) && (item.clientId === undefined || typeof item.clientId === 'string');
}
function loadRooms(filename) {
  const data = readJson(filename, () => ({}));
  let bookings = [], migration = true;
  if (!object(data)) badSchema(filename);
  // The original local service kept its placeholder alongside newly added UUID records.
  const originalEntries = Object.entries(data).filter(([key, value]) => !(key === '__placeholder__' && value === true));
  if (data.version === 2 && Array.isArray(data.bookings)) {
    if (Object.keys(data).some(key => !['version', 'bookings'].includes(key))) badSchema(filename);
    bookings = data.bookings;
    migration = false;
  } else if (Object.keys(data).length === 0 || (Object.keys(data).length === 1 && data.__placeholder__ === true)) {
    bookings = [];
  } else if (originalEntries.length && originalEntries.every(([, item]) => validRoomBooking(item))) {
    bookings = originalEntries.map(([, item]) => item);
  } else if (Object.keys(data).every(validDate)) {
    for (const [day, byRoom] of Object.entries(data)) {
      if (!object(byRoom)) badSchema(filename);
      for (const [room, bySlot] of Object.entries(byRoom)) {
        if (!object(bySlot) || !isString(room, 80)) badSchema(filename);
        for (const [slot, original] of Object.entries(bySlot)) {
          if (!object(original) || !config.slots.some(s => s.id === slot) || !isString(original.department, 80)) badSchema(filename);
          const id = `legacy-${crypto.createHash('sha256').update(`${day}\0${room}\0${slot}`).digest('hex').slice(0, 24)}`;
          bookings.push({ ...original, id, date: day, room, slot, bookerName: original.bookerName || '团队成员', note: original.note || '', createdAt: original.createdAt || original.updatedAt || '' });
        }
      }
    }
  } else badSchema(filename);
  if (!bookings.every(validRoomBooking)) badSchema(filename);
  ensureUnique(bookings, b => b.id, filename);
  ensureUnique(bookings, b => `${b.date}|${b.room}|${b.slot}`, filename);
  return { version: 2, bookings, migration };
}
function saveRooms(filename, state) {
  if (state.migration && fs.existsSync(filename)) {
    const backupDir = path.join(path.dirname(filename), 'backups');
    fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
    const backup = path.join(backupDir, `bookings.before-migration.${Date.now()}.${crypto.randomBytes(3).toString('hex')}.json`);
    fs.copyFileSync(filename, backup, fs.constants.COPYFILE_EXCL);
    fs.chmodSync(backup, 0o600);
  }
  atomicWrite(filename, { version: 2, bookings: state.bookings });
}
module.exports = { readJson, atomicWrite, loadSellers, loadRooms, saveRooms, badSchema, normalizeIntroduction, normalizeMultiline, loadStories, deriveAvatar, loadScheduleConfig, sellerScheduleContext };
