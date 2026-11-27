'use strict';

const crypto = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const config = require('./config');
const { avatar, validDate } = require('./validation');
const { normalizeIntroduction, sellerScheduleContext } = require('./storage');

class ImportError extends Error {
  constructor(message) { super(message); this.name = 'ImportError'; }
}
function fail(message) { throw new ImportError(message); }
function record(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(`${label}须为普通对象`);
}
function fields(value, allowed, required, label) {
  record(value, label);
  if (Object.keys(value).some(key => !allowed.includes(key)) ||
      required.some(key => !Object.hasOwn(value, key))) fail(`${label}字段不完整或包含未允许的字段`);
}
function string(value, max, label, { empty = false } = {}) {
  if (typeof value !== 'string' || value.length > max || (!empty && !value.trim()) ||
      /[\u0000-\u001f\u007f-\u009f]/u.test(value)) fail(`${label}格式不正确`);
  return value;
}
function sourceKey(value, label) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(value)) fail(`${label}格式不正确`);
  return value;
}
function integer(value, label) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 1000000) fail(`${label}须为有效的正整数`);
  return value;
}
function sourceMarker(value, label) {
  fields(value, ['key', 'sequence'], ['key', 'sequence'], label);
  return { key: sourceKey(value.key, `${label}标识`), sequence: integer(value.sequence, `${label}序号`) };
}
function markerKey(marker) { return `${marker.key}\0${marker.sequence}`; }
function unique(values, label) {
  if (new Set(values).size !== values.length) fail(`${label}存在重复，整批未导入`);
}
function checkedAvatar(value, label, required) {
  if (typeof value !== 'string' || (required && !value)) fail(`${label}不能为空`);
  try { return avatar(value); } catch (_) { fail(`${label}须为有效的 PNG、JPEG 或 WebP 图片，且不超过1 MB`); }
}

function validateManifest(manifest) {
  fields(manifest, ['version', 'source', 'talents'], ['version', 'source', 'talents'], '导入文件');
  if (manifest.version !== 1) fail('导入文件版本不支持');
  fields(manifest.source, ['key', 'filename', 'sheet', 'sha256'], ['key', 'filename', 'sheet', 'sha256'], '来源信息');
  const source = {
    key: sourceKey(manifest.source.key, '来源标识'),
    filename: string(manifest.source.filename, 255, '来源文件名'),
    sheet: string(manifest.source.sheet, 100, '工作表名称'),
    sha256: manifest.source.sha256
  };
  if (/[\\/]/.test(source.filename) || typeof source.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(source.sha256)) fail('来源文件名或摘要格式不正确');
  if (!Array.isArray(manifest.talents) || manifest.talents.length < 1 || manifest.talents.length > 1000) fail('导入人员须为1至1000条');
  const talents = manifest.talents.map((entry, index) => {
    const label = `第${index + 1}条人员`;
    fields(entry,
      ['sourceRow', 'sourceSequence', 'number', 'name', 'avatar', 'introduction', 'active', 'missingName'],
      ['sourceRow', 'sourceSequence', 'number', 'name', 'avatar', 'introduction', 'active', 'missingName'], label);
    const number = string(entry.number, 24, `${label}编号`);
    if (!/^[A-Za-z0-9_-]+$/.test(number)) fail(`${label}编号格式不正确`);
    const name = string(entry.name, 40, `${label}姓名`).trim();
    const introduction = normalizeIntroduction(entry.introduction);
    if (introduction === null) fail(`${label}简介须为不超过2000字的文字`);
    if (typeof entry.active !== 'boolean' || typeof entry.missingName !== 'boolean' || (entry.missingName && entry.active)) fail(`${label}状态无效，待补姓名人员须暂停排班`);
    return {
      sourceRow: integer(entry.sourceRow, `${label}来源行`),
      sourceSequence: integer(entry.sourceSequence, `${label}来源序号`),
      number, name, avatar: checkedAvatar(entry.avatar, `${label}头像`, true),
      introduction, active: entry.active, missingName: entry.missingName
    };
  });
  unique(talents.map(entry => entry.number.toLowerCase()), '导入编号');
  unique(talents.map(entry => entry.sourceSequence), '来源序号');
  unique(talents.map(entry => entry.sourceRow), '来源行');
  return { version: 1, source, talents };
}

function validateCurrent(current, scheduleConfig) {
  record(current, '现有人才库');
  let directory;
  try { directory = config.scheduleDirectory(scheduleConfig); }
  catch (_) { fail('部门与场次配置无效，整批未导入'); }
  const knownDepartments = [...directory.departments, ...directory.archivedDepartments];
  if (current.version !== 1 || !Array.isArray(current.talents) || !Array.isArray(current.schedules)) fail('现有人才库结构无效，已保留原文件');
  for (const person of current.talents) {
    record(person, '现有人员');
    string(person.id, 200, '现有人员ID');
    string(person.number, 24, '现有人员编号');
    string(person.name, 40, '现有人员姓名');
    if (typeof person.active !== 'boolean') fail('现有人员排班状态无效');
    checkedAvatar(person.avatar, '现有人员头像', false);
    if (Object.hasOwn(person, 'introduction') && normalizeIntroduction(person.introduction) === null) fail('现有人员简介无效');
    if (Object.hasOwn(person, 'importSource')) sourceMarker(person.importSource, '现有人员来源');
  }
  unique(current.talents.map(person => person.id), '现有人员ID');
  unique(current.talents.map(person => person.number.toLowerCase()), '现有人员编号');
  unique(current.talents.filter(person => person.importSource).map(person => markerKey(person.importSource)), '现有人员来源');
  const ids = new Set(current.talents.map(person => person.id)), occupancy = [], roomOccupancy = [];
  for (const schedule of current.schedules) {
    record(schedule, '现有排班');
    string(schedule.id, 200, '现有排班ID'); string(schedule.batchId, 200, '现有排班批次');
    const department = knownDepartments.find(item => item.id === schedule.department);
    if (!validDate(schedule.date) || !config.businesses.includes(schedule.business) ||
        !config.storedScheduleSlots(department, schedule.group).includes(schedule.slot)) fail('现有排班结构无效');
    const assigned = Array.isArray(schedule.talentIds) ? schedule.talentIds : [schedule.talentId];
    if (assigned.length < 1 || assigned.length > config.maxTalentsPerSchedule || assigned.some(id => typeof id !== 'string' || !ids.has(id)) ||
        new Set(assigned).size !== assigned.length ||
        (schedule.talentIds !== undefined && (!Array.isArray(schedule.talentIds) ||
          (schedule.talentId !== undefined && schedule.talentId !== assigned[0])))) fail('现有排班人员关系无效');
    for (const id of assigned) occupancy.push(`${schedule.date}|${schedule.slot}|${id}`);
    roomOccupancy.push(`${schedule.date}|${schedule.slot}|${schedule.department}|${schedule.group}`);
  }
  unique(current.schedules.map(schedule => schedule.id), '现有排班ID');
  unique(occupancy, '现有人员排班');
  unique(roomOccupancy, '现有直播间排班');
}

// This function performs no filesystem I/O. Validate every record and collision
// before generating IDs or constructing a replacement state.
function planTalentImport(current, input, options = {}) {
  const manifest = validateManifest(input);
  const scheduleConfig = options.scheduleConfig ?? (options.departments === undefined
    ? sellerScheduleContext(current) : { version: 2, departments: options.departments, archivedDepartments: options.archivedDepartments || [] });
  validateCurrent(current, scheduleConfig);
  const byNumber = new Map(current.talents.map(person => [person.number.toLowerCase(), person]));
  const bySource = new Map(current.talents.filter(person => person.importSource).map(person => [markerKey(person.importSource), person]));
  const matches = manifest.talents.map((entry, index) => {
    const existing = byNumber.get(entry.number.toLowerCase());
    const marker = { key: manifest.source.key, sequence: entry.sourceSequence };
    const sourceMatch = bySource.get(markerKey(marker));
    if (sourceMatch && sourceMatch !== existing) fail(`第${index + 1}条人员的来源已对应其他编号，整批未导入`);
    if (existing) {
      if (existing.importSource) {
        if (markerKey(existing.importSource) !== markerKey(marker)) fail(`第${index + 1}条人员编号已由其他来源占用，整批未导入`);
      } else if (existing.name !== entry.name) fail(`第${index + 1}条人员编号与已有姓名不一致，整批未导入`);
    }
    return { entry, existing, marker };
  });
  const state = structuredClone(current);
  const indices = new Map(state.talents.map((person, index) => [person.id, index]));
  const existingIds = new Set(state.talents.map(person => person.id));
  const createId = options.createId || crypto.randomUUID;
  if (typeof createId !== 'function') fail('ID生成器无效');
  const stats = {
    incoming: matches.length, created: 0, updated: 0, unchanged: 0,
    missingNames: matches.filter(match => match.entry.missingName).length,
    preserved: current.talents.length - matches.filter(match => match.existing).length,
    totalBefore: current.talents.length, totalAfter: current.talents.length,
    schedulesPreserved: current.schedules.length
  };
  for (const { entry, existing, marker } of matches) {
    if (existing) {
      const updated = {
        ...state.talents[indices.get(existing.id)],
        // A blank source name never erases a name corrected by an administrator.
        name: entry.missingName ? existing.name : entry.name,
        avatar: entry.avatar, introduction: entry.introduction, importSource: marker
      };
      // Keep the existing ID, number and active status, even for a paused person.
      if (isDeepStrictEqual(updated, existing)) stats.unchanged++;
      else { state.talents[indices.get(existing.id)] = updated; stats.updated++; }
    } else {
      const id = createId();
      if (typeof id !== 'string' || !/^[A-Za-z0-9-]{1,200}$/.test(id) || existingIds.has(id)) fail('生成的人员ID无效或重复，整批未导入');
      existingIds.add(id);
      state.talents.push({
        id, number: entry.number, name: entry.name, avatar: entry.avatar,
        introduction: entry.introduction, active: entry.active, importSource: marker
      });
      stats.created++;
    }
  }
  stats.totalAfter = state.talents.length;
  return { changed: stats.created + stats.updated > 0, state, stats };
}

module.exports = { ImportError, validateManifest, planTalentImport };
