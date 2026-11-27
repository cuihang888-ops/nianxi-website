'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./lib/config');
const { HttpError, object, text, date, addDays, shanghaiDate, dateRange, avatar } = require('./lib/validation');
const { atomicWrite, loadSellers, loadRooms, saveRooms, loadRoomDirectory, normalizeIntroduction, normalizeMultiline, loadStories, deriveAvatar, loadScheduleConfig } = require('./lib/storage');
const { makeAuth, makeSecurity } = require('./lib/auth');

function send(res, status, value, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(type.startsWith('application/json') ? JSON.stringify(value) : value);
}
function sendConditional(req, res, body, type, etag, cacheControl) {
  const headers = { 'Content-Type': type, 'Cache-Control': cacheControl, ETag: etag };
  // If-None-Match uses a weak comparison for GET, including lists and "*".
  const unchanged = typeof req.headers['if-none-match'] === 'string' &&
    req.headers['if-none-match'].split(',').some(value => {
      const candidate = value.trim();
      return candidate === '*' || candidate.replace(/^W\//, '') === etag;
    });
  if (unchanged) { res.writeHead(304, headers); return res.end(); }
  res.writeHead(200, { ...headers, 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}
function readBody(req) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) return Promise.reject(new HttpError(415, '请求须使用 JSON 格式'));
  const limit = 1500000;
  return new Promise((resolve, reject) => {
    let total = 0, chunks = [], exceeded = false;
    req.on('data', chunk => {
      total += chunk.length;
      if (total > limit) {
        chunks = [];
        if (!exceeded) { exceeded = true; reject(new HttpError(413, '提交内容过大，头像须不超过 1 MB')); }
      } else if (!exceeded) chunks.push(chunk);
    });
    req.on('end', () => {
      if (exceeded) return;
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        if (!object(body)) throw new Error('Not an object');
        resolve(body);
      } catch (_) { reject(new HttpError(400, '请求内容不是有效的 JSON 对象')); }
    });
    req.on('aborted', () => reject(new HttpError(400, '请求已中断')));
    req.on('error', reject);
  });
}
function publicBooking(item, roomId) {
  return { id: item.id, room: item.room, roomId, slot: item.slot, date: item.date, department: item.department, bookerName: item.bookerName, note: item.note || '', createdAt: item.createdAt || '' };
}
function introduction(value) {
  const normalized = normalizeIntroduction(value);
  if (normalized === null) throw new HttpError(400, '卖手简介须为不超过 2000 字的文字，可使用换行和制表符');
  return normalized;
}
function talentSearchQuery(params) {
  const queries = params.getAll('q');
  if (queries.length > 1) throw new HttpError(400, '请只提供一个卖手搜索关键词');
  const raw = queries[0] || '';
  if (/[\u0000-\u001f\u007f-\u009f]/u.test(raw)) throw new HttpError(400, '卖手搜索关键词不能包含控制字符');
  const query = raw.normalize('NFKC').trim();
  if (query.length > 64) throw new HttpError(400, '卖手搜索关键词最多 64 字');
  return query;
}
function searchTalents(data, query, instant) {
  const normalized = value => value.normalize('NFKC').trim().toLowerCase();
  const keyword = normalized(query);
  const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
  const matches = data.talents.map(talent => {
    const fields = [normalized(talent.number), normalized(talent.name)];
    const rank = Math.min(...fields.map(value => value === keyword ? 0 : value.startsWith(keyword) ? 1 : value.includes(keyword) ? 2 : 3));
    return { talent, rank, number: fields[0], name: fields[1] };
  }).filter(item => item.rank < 3).sort((a, b) => a.rank - b.rank ||
    compare(a.number, b.number) || compare(a.name, b.name) || compare(a.talent.id, b.talent.id));
  const results = matches.slice(0, 20).map(({ talent }) => ({
    talent: { id: talent.id, name: talent.name, number: talent.number, active: talent.active },
    upcoming: [], recent: [], upcomingTotal: 0, recentTotal: 0
  }));
  const byTalent = new Map(results.map(result => [result.talent.id, result]));
  const currentTime = instant.getTime();
  for (const schedule of data.schedules) {
    const recipients = schedule.talentIds.map(id => byTalent.get(id)).filter(Boolean);
    if (!recipients.length) continue;
    const slot = config.slots.find(item => item.id === schedule.slot);
    const startsAt = `${schedule.date}T${slot.start}:00+08:00`;
    const endDate = slot.endDayOffset ? addDays(schedule.date, slot.endDayOffset) : schedule.date;
    const endsAt = `${endDate}T${slot.end}:00+08:00`;
    const startTime = Date.parse(startsAt), endTime = Date.parse(endsAt);
    const status = currentTime >= endTime ? 'finished' : currentTime >= startTime ? 'ongoing' : 'upcoming';
    const item = { ...schedule, status, startsAt: new Date(startTime).toISOString(), endsAt: new Date(endTime).toISOString() };
    for (const result of recipients) (status === 'finished' ? result.recent : result.upcoming).push(item);
  }
  for (const result of results) {
    result.upcomingTotal = result.upcoming.length;
    result.recentTotal = result.recent.length;
    result.upcoming.sort((a, b) => Number(b.status === 'ongoing') - Number(a.status === 'ongoing') ||
      compare(a.startsAt, b.startsAt) || compare(a.id, b.id));
    result.recent.sort((a, b) => compare(b.endsAt, a.endsAt) || compare(a.id, b.id));
    result.upcoming = result.upcoming.slice(0, 3);
    result.recent = result.recent.slice(0, 3);
  }
  return { total: matches.length, results };
}
function createServer(options = {}) {
  const dataDir = path.resolve(options.dataDir || process.env.DATA_DIR || path.join(__dirname, 'data'));
  const roomFile = path.resolve(options.legacyFile || process.env.BOOKINGS_FILE || path.join(__dirname, 'bookings.json'));
  const roomDirectoryFile = path.join(dataDir, 'room-directory.json');
  const sellerFile = path.join(dataDir, 'sellers.json');
  const storyFile = path.join(dataDir, 'talent-stories.json');
  const slotConfigFile = path.join(dataDir, 'schedule-config.json');
  const publicDir = path.resolve(options.publicDir || path.join(__dirname, 'public'));
  const now = options.now || (() => new Date());
  const auth = makeAuth(dataDir, { now, secureCookies: options.secureCookies ?? process.env.SECURE_COOKIES === '1' });
  const security = makeSecurity(dataDir, auth, { now, secureCookies: options.secureCookies ?? process.env.SECURE_COOKIES === '1' });
  let sellerReadCache = null;
  let slotConfigCache = null, slotConfigSignature = null;
  const slotConfigFileSignature = () => {
    try {
      const stat = fs.statSync(slotConfigFile, { bigint: true });
      return [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(':');
    } catch (error) {
      if (error.code === 'ENOENT') return 'missing';
      throw error;
    }
  };
  function readSlotConfig() {
    const signature = slotConfigFileSignature();
    if (slotConfigCache && slotConfigSignature === signature) return slotConfigCache;
    // Never retain a formerly valid directory after the file becomes damaged.
    slotConfigCache = null;
    slotConfigSignature = null;
    const value = loadScheduleConfig(slotConfigFile);
    slotConfigCache = value;
    slotConfigSignature = signature;
    return value;
  }
  function saveSlotConfig(value) {
    config.validateScheduleConfig(value);
    atomicWrite(slotConfigFile, value);
    slotConfigCache = value;
    slotConfigSignature = slotConfigFileSignature();
    sellerReadCache = null;
  }
  function activeScheduleSlots(departmentId, group, slotConfig = readSlotConfig()) {
    const department = config.scheduleDirectory(slotConfig).departments.find(item => item.id === departmentId);
    return config.scheduleSlots(department, group)?.slice() || [];
  }
  function dynamicDepartments(slotConfig = readSlotConfig()) {
    return config.scheduleDirectory(slotConfig).departments;
  }
  function normalizedSlotList(value, label = '场次') {
    if (!Array.isArray(value) || value.length > config.slotIds.length ||
        new Set(value).size !== value.length || value.some(slot => typeof slot !== 'string' || !config.slotIds.includes(slot))) {
      throw new HttpError(400, `${label}须从早场、中场、晚场中选择，且不能重复`);
    }
    return config.slotIds.filter(slot => value.includes(slot));
  }
  function slotConfigTarget(body, slotConfig) {
    const departmentId = text(body.department, '部门', 20);
    const group = text(body.group, '组别', 20);
    const department = dynamicDepartments(slotConfig).find(item => item.id === departmentId);
    if (!department || !department.groups.includes(group)) throw new HttpError(400, '请选择有效的部门和组别');
    return { department, departmentId, group };
  }
  function updateSlotConfig(body, method) {
    const allowedFields = method === 'PATCH' ? ['department', 'group', 'slots'] : ['department', 'group', 'slot'];
    if (Object.keys(body).some(field => !allowedFields.includes(field))) {
      throw new HttpError(400, '场次设置包含不支持的字段');
    }
    const original = readSlotConfig();
    const { department, departmentId, group } = slotConfigTarget(body, original);
    const nextConfig = structuredClone(original);
    const current = activeScheduleSlots(departmentId, group, original);
    let selected;
    if (method === 'PATCH') {
      selected = normalizedSlotList(body.slots);
    } else {
      const slot = text(body.slot, '时段', 20);
      if (!config.slotIds.includes(slot)) throw new HttpError(400, '请选择有效的早、中、晚场');
      const set = new Set(current);
      if (method === 'POST') set.add(slot);
      else set.delete(slot);
      selected = config.slotIds.filter(item => set.has(item));
    }
    if (selected.length === 0) throw new HttpError(400, '至少保留一个可用场次');
    const target = original.version === 1
      ? (nextConfig.groups[departmentId] ||= {})
      : (nextConfig.departments.find(item => item.id === departmentId).groupSlots ||= {});
    const defaults = department.slots;
    if (selected.length === defaults.length && selected.every((slot, index) => slot === defaults[index])) {
      delete target[group];
    } else {
      target[group] = selected;
    }
    if (original.version === 1 && Object.keys(target).length === 0) delete nextConfig.groups[departmentId];
    const changed = JSON.stringify(nextConfig) !== JSON.stringify(original);
    if (changed) saveSlotConfig(nextConfig);
    const { departments, archivedDepartments } = config.scheduleDirectory(nextConfig);
    const updated = departments.find(item => item.id === departmentId);
    return { changed, department: { id: departmentId, name: department.name }, group, slots: selected, config: updated, departments, archivedDepartments };
  }
  function exactFields(body, allowed, required = allowed) {
    if (Object.keys(body).some(key => !allowed.includes(key)) || required.some(key => !Object.hasOwn(body, key))) {
      throw new HttpError(400, '部门设置字段不完整或包含不支持的字段');
    }
  }
  function directoryName(value, label, max = 40) {
    const result = text(value, label, max);
    if (!config.validDirectoryName(result, max)) throw new HttpError(400, `${label}格式不正确`);
    return result;
  }
  function requiredSlots(value) {
    const selected = normalizedSlotList(value);
    if (!selected.length) throw new HttpError(400, '至少保留一个可用场次');
    return selected;
  }
  function editableDirectory() {
    return { version: 2, ...config.scheduleDirectory(readSlotConfig()) };
  }
  function departmentResult(value, department) {
    return { department: structuredClone(department), ...config.scheduleDirectory(value) };
  }
  function createDepartment(body) {
    exactFields(body, ['name', 'groups', 'slots']);
    const name = directoryName(body.name, '部门名称');
    if (!Array.isArray(body.groups) || body.groups.length < 1 || body.groups.length > 100) throw new HttpError(400, '部门须设置1至100个组别');
    const groups = body.groups.map(group => directoryName(group, '组别名称', 20));
    if (new Set(groups.map(config.directoryNameKey)).size !== groups.length) throw new HttpError(400, '组别名称不能重复');
    const selected = requiredSlots(body.slots), nextConfig = editableDirectory();
    if (nextConfig.departments.some(item => config.directoryNameKey(item.name) === config.directoryNameKey(name))) {
      throw new HttpError(409, '该部门名称已存在');
    }
    const all = [...nextConfig.departments, ...nextConfig.archivedDepartments];
    if (all.length >= 1000) throw new HttpError(400, '部门记录过多，请联系管理员');
    let id;
    do { id = `d-${crypto.randomBytes(8).toString('hex')}`; } while (all.some(item => item.id === id));
    const department = { id, name, groups, slots: selected, archivedGroups: [] };
    nextConfig.departments.push(department);
    saveSlotConfig(nextConfig);
    return departmentResult(nextConfig, department);
  }
  function editDepartment(departmentId, groupName, method, body) {
    const nextConfig = editableDirectory();
    const department = nextConfig.departments.find(item => item.id === departmentId);
    if (!department) throw new HttpError(404, '该部门不存在或已停用');
    if (groupName === undefined && method === 'PATCH') {
      exactFields(body, ['name']);
      const name = directoryName(body.name, '部门名称');
      if (nextConfig.departments.some(item => item.id !== departmentId && config.directoryNameKey(item.name) === config.directoryNameKey(name))) {
        throw new HttpError(409, '该部门名称已存在');
      }
      department.name = name;
    } else if (groupName === undefined && method === 'DELETE') {
      nextConfig.departments = nextConfig.departments.filter(item => item.id !== departmentId);
      nextConfig.archivedDepartments.push(department);
    } else if (groupName === null && method === 'POST') {
      exactFields(body, ['name', 'slots']);
      const requestedName = directoryName(body.name, '组别名称', 20);
      const selected = requiredSlots(body.slots);
      if (department.groups.some(item => config.directoryNameKey(item) === config.directoryNameKey(requestedName))) {
        throw new HttpError(409, '该组别已存在');
      }
      if (department.groups.length >= 100) throw new HttpError(400, '一个部门最多设置100个组别');
      department.archivedGroups ||= [];
      // Reopening a group reuses its original key so historical assignments
      // stay attached to the same room even after case/width normalization.
      const archivedName = department.archivedGroups.find(item => config.directoryNameKey(item) === config.directoryNameKey(requestedName));
      const name = archivedName || requestedName;
      department.archivedGroups = department.archivedGroups.filter(item => item !== name);
      department.groups.push(name);
      department.groupSlots ||= {};
      department.groupSlots[name] = selected;
    } else if (typeof groupName === 'string' && method === 'DELETE') {
      if (!department.groups.includes(groupName)) throw new HttpError(404, '该组别不存在或已停用');
      if (department.groups.length <= 1) throw new HttpError(400, '至少保留一个组别；如需停用整个部门，请删除部门');
      if ((department.archivedGroups?.length || 0) >= 100) {
        throw new HttpError(400, '停用组别记录已达上限，可恢复已有组别或移除整个部门');
      }
      department.groupSlots ||= {};
      department.groupSlots[groupName] = config.scheduleSlots(department, groupName).slice();
      department.groups = department.groups.filter(item => item !== groupName);
      department.archivedGroups ||= [];
      department.archivedGroups.push(groupName);
    } else throw new HttpError(404, '接口不存在');
    saveSlotConfig(nextConfig);
    return departmentResult(nextConfig, department);
  }
  function restoreDepartment(id) {
    const nextConfig = editableDirectory();
    const index = nextConfig.archivedDepartments.findIndex(department => department.id === id);
    if (index < 0) throw new HttpError(404, '已归档部门不存在');
    const department = nextConfig.archivedDepartments[index];
    if (nextConfig.departments.some(item => config.directoryNameKey(item.name) === config.directoryNameKey(department.name))) {
      throw new HttpError(409, '有同名在用部门，请先修改其名称');
    }
    nextConfig.archivedDepartments.splice(index, 1);
    nextConfig.departments.push(department);
    saveSlotConfig(nextConfig);
    return departmentResult(nextConfig, department);
  }
  const sellerSignature = () => {
    const stat = fs.statSync(sellerFile, { bigint: true });
    return [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(':');
  };
  function sellerSnapshot() {
    const scheduleConfig = readSlotConfig();
    const directorySignature = slotConfigSignature;
    let signature;
    try { signature = sellerSignature(); }
    catch (error) {
      sellerReadCache = null;
      if (error.code === 'ENOENT') return loadSellers(sellerFile, scheduleConfig);
      throw error;
    }
    if (sellerReadCache?.signature === signature && sellerReadCache.directorySignature === directorySignature) return sellerReadCache.data;
    // Do not fall back to a stale snapshot if disk data can no longer be read.
    sellerReadCache = null;
    const data = loadSellers(sellerFile, scheduleConfig);
    // External replacements during a read may be served once but never cached
    // under a different file's signature.
    if (sellerSignature() === signature && slotConfigFileSignature() === directorySignature) sellerReadCache = { signature, directorySignature, data };
    return data;
  }
  function saveSellers(data) {
    atomicWrite(sellerFile, data);
    sellerReadCache = null;
  }
  const today = () => shanghaiDate(now());
  function futureDate(value) {
    const result = date(value);
    if (result < today()) throw new HttpError(400, '过去的日期只能查看，不能新增或修改预约');
    return result;
  }
  function readRoomDirectory(state = loadRooms(roomFile)) {
    return loadRoomDirectory(roomDirectoryFile, state.bookings);
  }
  function roomsPayload(directory) {
    return {
      rooms: directory.rooms.filter(room => room.active).map(room => room.name),
      roomDirectory: directory.rooms.map(({ id, name, active, archived }) => ({ id, name, active, archived }))
    };
  }
  function roomByName(directory, name) {
    return directory.rooms.find(room => room.name === name || room.aliases.includes(name));
  }
  function roomName(directory, value, current) {
    const name = directoryName(value, '场地名称', 80);
    const key = config.directoryNameKey(name);
    if (directory.rooms.some(room => room !== current &&
        [room.name, ...room.aliases].some(used => config.directoryNameKey(used) === key))) {
      throw new HttpError(409, '该场地名称已被使用');
    }
    return name;
  }
  function changeRoom(id, method, body) {
    const directory = readRoomDirectory();
    let room = directory.rooms.find(item => item.id === id);
    if (!id) {
      if (Object.keys(body).length !== 1 || !Object.hasOwn(body, 'name')) throw new HttpError(400, '请填写场地名称');
      room = { id: 'room-' + crypto.randomBytes(16).toString('hex'), name: roomName(directory, body.name), active: true, archived: false, aliases: [] };
      directory.rooms.push(room);
    } else {
      if (!room) throw new HttpError(404, '场地不存在');
      if (method === 'DELETE') {
        room.active = false;
        room.archived = true;
      } else if (method === 'POST') {
        room.active = true;
        room.archived = false;
      } else {
        if (room.archived) throw new HttpError(409, '请先恢复已归档场地');
        if (!Object.keys(body).length || Object.keys(body).some(key => !['name', 'active'].includes(key))) {
          throw new HttpError(400, '请填写需要修改的场地名称或状态');
        }
        if (Object.hasOwn(body, 'active')) {
          if (typeof body.active !== 'boolean') throw new HttpError(400, '场地状态格式不正确');
          room.active = body.active;
        }
        if (Object.hasOwn(body, 'name')) {
          const name = roomName(directory, body.name, room);
          if (name !== room.name) {
            room.aliases = room.aliases.filter(alias => alias !== name);
            room.aliases.push(room.name);
            room.name = name;
          }
        }
      }
    }
    atomicWrite(roomDirectoryFile, directory);
    const payload = roomsPayload(directory);
    return { ...payload, room: payload.roomDirectory.find(item => item.id === room.id) };
  }
  function selection(body, data, retainedTalentIds) {
    const slotConfig = readSlotConfig();
    const departments = dynamicDepartments(slotConfig);
    const department = departments.find(d => d.id === body.department);
    const activeSlots = activeScheduleSlots(body.department, body.group, slotConfig);
    if (!activeSlots.includes(body.slot)) {
      const originalDepartment = config.departments.find(d => d.id === body.department);
      if (originalDepartment?.retiredSlots?.includes(body.slot)) throw new HttpError(400, '一部已取消早场，请选择中场或晚场');
      throw new HttpError(400, '该场次已停用，请选择当前开放的场次');
    }
    if (!config.businesses.includes(body.business)) throw new HttpError(400, '请选择 FB、虾皮或国内业务');
    const retained = new Set(Array.isArray(retainedTalentIds) ? retainedTalentIds : retainedTalentIds ? [retainedTalentIds] : []);
    const requested = body.talentIds !== undefined ? body.talentIds : body.talentId !== undefined ? [body.talentId] : [...retained];
    if (!Array.isArray(requested) || requested.length < 1 || requested.length > config.maxTalentsPerSchedule || requested.some(id => typeof id !== 'string' || id.length === 0) || new Set(requested).size !== requested.length) {
      throw new HttpError(400, `每个场次请选择 1 至 ${config.maxTalentsPerSchedule} 位不同的卖手`);
    }
    const talents = requested.map(id => data.talents.find(t => t.id === id && (t.active || retained.has(t.id))));
    if (talents.some(t => !t)) throw new HttpError(400, '请选择人才总库中在用的卖手');
    return { business: body.business, department: department.id, group: body.group, slot: body.slot, talentId: talents[0].id, talentIds: talents.map(t => t.id) };
  }
  function checkConflicts(proposed, current, exceptId) {
    const conflicts = current.filter(existing => existing.id !== exceptId && proposed.some(item => {
      const existingTalentIds = Array.isArray(existing.talentIds) ? existing.talentIds : [existing.talentId];
      const proposedTalentIds = Array.isArray(item.talentIds) ? item.talentIds : [item.talentId];
      return existing.date === item.date && existing.slot === item.slot &&
        (existingTalentIds.some(id => proposedTalentIds.includes(id)) || (existing.department === item.department && existing.group === item.group));
    }));
    if (conflicts.length) throw new HttpError(409, '排班冲突：该卖手或该直播间在同一天、同一时段已有安排。本次未保存，请调整后重试。', { conflicts });
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    try {
      let url;
      try { url = new URL(req.url, 'http://localhost'); } catch (_) { throw new HttpError(400, '请求地址无效'); }
      const route = url.pathname, method = req.method;
      if (method === 'GET' && ['/', '/index.html', '/api/access'].includes(route)) security.prepareVisitor(req, res);
      const actions = { '/api/login': '管理员登录', '/api/logout': '管理员退出',
        '/api/book': '预约场地', '/api/cancel': '释放场地',
        '/api/audit': '查看安全日志', '/api/slot-config': '维护场次' };
      let auditEvent = route.startsWith('/api/') && !['GET', 'HEAD'].includes(method) && route !== '/api/view-events'
        ? { category: route.includes('login') || route.includes('logout') ? 'login' : 'operation',
          action: actions[route] || (route.startsWith('/api/talents') ? '维护卖手' : route.startsWith('/api/schedules') ? '调整排班' : route.startsWith('/api/departments') ? '维护直播间部门' : route.startsWith('/api/rooms') ? '维护场地' : '访问接口') }
        : route === '/api/audit' ? { category: 'security', action: actions[route] } : null;
      if (auditEvent) auditEvent.actor = security.identity(req);
      // An attempt entry must be persisted before executing a mutation.
      if (auditEvent) security.record(req, { ...auditEvent, outcome: 'attempt', detail: '请求开始' });
      res.once('finish', () => {
        try {
          if (auditEvent) security.record(req, { ...auditEvent, status: res.statusCode,
            outcome: res.statusCode < 400 ? 'success' : 'failed' });
          else if (route.startsWith('/api/') && res.statusCode >= 400) security.record(req, {
            category: 'security', action: '访问被拒绝', status: res.statusCode, outcome: 'failed', detail: route });
          else if (method === 'GET' && (/^\/api\/(?:config|departments|rooms|talents|talent-search|schedules|bookings)$/.test(route) || /^\/api\/talents\/[A-Za-z0-9-]+\/stories$/.test(route))) {
            security.recordRead(req, route, route === '/api/talent-search' ? '卖手排班搜索' :
              ['date', 'from', 'to'].map(key => url.searchParams.has(key) ? `${key}=${url.searchParams.get(key).slice(0, 20)}` : '').filter(Boolean).join(' '));
          }
        } catch (error) { console.error(`[${now().toISOString()}] 安全日志写入失败：${error.message}`); }
      });
      if (['POST', 'PATCH', 'DELETE', 'PUT'].includes(method) && req.headers.origin) {
        let origin;
        try { origin = new URL(req.headers.origin); } catch (_) { throw new HttpError(403, '请求来源无效'); }
        if (origin.host !== req.headers.host || !['http:', 'https:'].includes(origin.protocol)) throw new HttpError(403, '不允许来自其他网站的操作');
      }
      if (method === 'GET' && route === '/api/health') return send(res, 200, { ok: true });
      if (method === 'GET' && route === '/api/access') return send(res, 200, security.me(req));
      if (method === 'GET' && route === '/api/audit') return send(res, 200, security.list(req, url.searchParams));
      if (method === 'GET' && route === '/api/config') return send(res, 200, { ...config, ...config.scheduleDirectory(readSlotConfig()), ...roomsPayload(readRoomDirectory()), today: today() });
      if (method === 'GET' && ['/api/slot-config', '/api/departments'].includes(route)) {
        return send(res, 200, { ...config.scheduleDirectory(readSlotConfig()), slots: config.slots });
      }
      if (method === 'POST' && route === '/api/departments') {
        auth.requireAdmin(req);
        const result = createDepartment(await readBody(req));
        auditEvent.action = '新增直播间部门';
        auditEvent.detail = `${result.department.name} · ${result.department.groups.join('、')}`;
        return send(res, 201, result);
      }
      const departmentRestore = /^\/api\/departments\/([A-Za-z0-9_-]+)\/restore$/.exec(route);
      if (method === 'POST' && departmentRestore) {
        auth.requireAdmin(req);
        const result = restoreDepartment(departmentRestore[1]);
        auditEvent.action = '恢复直播间部门';
        auditEvent.detail = result.department.name;
        return send(res, 200, result);
      }
      const departmentRoute = /^\/api\/departments\/([A-Za-z0-9_-]{1,20})(\/groups)?(?:\/([^/]+))?$/.exec(route);
      if (departmentRoute && ['PATCH', 'POST', 'DELETE'].includes(method)) {
        auth.requireAdmin(req);
        const hasGroups = Boolean(departmentRoute[2]), encodedGroup = departmentRoute[3];
        if ((!hasGroups && (method === 'POST' || encodedGroup !== undefined)) ||
            (hasGroups && ((method === 'POST' && encodedGroup !== undefined) ||
              (method === 'DELETE' && encodedGroup === undefined) || method === 'PATCH'))) {
          throw new HttpError(404, '接口不存在');
        }
        let groupName = hasGroups ? null : undefined;
        if (encodedGroup !== undefined) {
          try { groupName = decodeURIComponent(encodedGroup); } catch (_) { throw new HttpError(400, '组别地址无效'); }
          groupName = directoryName(groupName, '组别名称', 20);
        }
        const body = method === 'DELETE' ? undefined : await readBody(req);
        const result = editDepartment(departmentRoute[1], groupName, method, body);
        auditEvent.action = hasGroups ? (method === 'POST' ? '新增直播间组别' : '停用直播间组别')
          : method === 'PATCH' ? '修改直播间部门' : '停用直播间部门';
        auditEvent.detail = `${result.department.name}${hasGroups ? ` · ${groupName || body.name}` : ''}`;
        return send(res, 200, result);
      }
      if (['POST', 'PATCH', 'DELETE'].includes(method) && route === '/api/slot-config') {
        auth.requireAdmin(req);
        const body = await readBody(req);
        const result = updateSlotConfig(body, method);
        auditEvent.detail = `${result.department.name} ${result.group} · ${result.slots.join('、') || '停用全部场次'}`;
        return send(res, 200, result);
      }
      if (method === 'GET' && route === '/api/me') {
        const current = auth.session(req);
        return send(res, 200, current ? { user: current.user, csrfToken: current.csrfToken } : { user: null });
      }
      if (method === 'POST' && route === '/api/login') {
        const result = await auth.login(req, res, await readBody(req));
        auditEvent.actor = { name: result.user.displayName, role: result.user.username, id: result.user.username };
        return send(res, 200, result);
      }
      if (method === 'POST' && route === '/api/logout') return send(res, 200, auth.logout(req, res));
      if (method === 'POST' && route === '/api/view-events') {
        const body = await readBody(req);
        const names = { rooms: '查看场地', schedule: '查看卖手排班', 'talent-profile': '查看卖手简介', 'talent-stories': '查看卖手剧情', 'talent-search': '搜索卖手排班', talents: '查看人才库' };
        if (!Object.hasOwn(names, body.kind)) throw new HttpError(400, '查看类型无效');
        const details = [];
        if (body.date !== undefined) details.push(date(body.date));
        if (body.kind === 'talent-profile' || body.kind === 'talent-stories') {
          const person = loadSellers(sellerFile).talents.find(item => item.id === body.id);
          if (!person) throw new HttpError(404, '卖手不存在');
          details.push(`${person.number} ${person.name}`);
        }
        if (body.kind === 'schedule' && body.department) {
          const directory = config.scheduleDirectory(readSlotConfig());
          const dept = [...directory.departments, ...directory.archivedDepartments].find(item => item.id === body.department);
          if (!dept || !(dept.groups.includes(body.group) || dept.archivedGroups?.includes(body.group))) throw new HttpError(400, '直播间不存在');
          details.push(`${dept.name} ${body.group}`);
        }
        security.record(req, { category: 'view', action: names[body.kind], detail: details.join(' · ') });
        return send(res, 200, { ok: true });
      }
      if (method === 'GET' && route === '/api/talents') {
        if (url.searchParams.get('view') !== 'summary') return send(res, 200, { talents: loadSellers(sellerFile).talents });
        const talents = sellerSnapshot().talents;
        const body = JSON.stringify({ talents: talents.map(person => {
          const image = deriveAvatar(person.avatar);
          return { ...person, avatar: image ? `/api/talents/${encodeURIComponent(person.id)}/avatar?v=${image.hash}` : '' };
        }) });
        const etag = `"talents-${crypto.createHash('sha256').update(body).digest('hex')}"`;
        return sendConditional(req, res, body, 'application/json; charset=utf-8', etag, 'private, no-cache');
      }
      const avatarRoute = /^\/api\/talents\/([A-Za-z0-9_-]{1,200})\/avatar$/.exec(route);
      if (method === 'GET' && avatarRoute) {
        const versions = url.searchParams.getAll('v');
        if (versions.length !== 1 || !/^[a-f0-9]{64}$/.test(versions[0])) throw new HttpError(404, '头像不存在或已更新');
        const person = sellerSnapshot().talents.find(item => item.id === avatarRoute[1]);
        const image = person ? deriveAvatar(person.avatar) : null;
        if (!image || image.hash !== versions[0]) throw new HttpError(404, '头像不存在或已更新');
        return sendConditional(req, res, image.bytes, image.mime, `"${image.hash}"`,
          'private, max-age=86400, immutable');
      }
      if (method === 'GET' && route === '/api/talent-search') {
        const query = talentSearchQuery(url.searchParams), instant = now();
        return send(res, 200, { query, today: shanghaiDate(instant), limit: 20,
          ...(query ? searchTalents(loadSellers(sellerFile), query, instant) : { total: 0, results: [] }) });
      }
      const storyRoute = /^\/api\/talents\/([A-Za-z0-9-]+)\/stories(?:\/([A-Za-z0-9-]+))?$/.exec(route);
      if (storyRoute && ['GET', 'POST', 'PATCH'].includes(method)) {
        if (method !== 'GET') auth.requireAdmin(req);
        const person = loadSellers(sellerFile).talents.find(item => item.id === storyRoute[1]);
        if (!person) throw new HttpError(404, '卖手不存在');
        if (method === 'GET') {
          if (storyRoute[2]) throw new HttpError(404, '接口不存在');
          return send(res, 200, { stories: loadStories(storyFile).stories.filter(item => item.talentId === person.id)
            .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)) });
        }
        if ((method === 'POST' && storyRoute[2]) || (method === 'PATCH' && !storyRoute[2])) throw new HttpError(404, '接口不存在');
        const body = await readBody(req);
        const data = loadStories(storyFile);
        const content = normalizeMultiline(body.content, 12000);
        if (!content) throw new HttpError(400, '请填写剧情内容，最多 12000 字，可分行填写');
        const fields = { title: text(body.title, '剧情标题', 80), date: date(body.date), content };
        const timestamp = now().toISOString();
        let story;
        if (method === 'POST') {
          story = { id: crypto.randomUUID(), talentId: person.id, ...fields, createdAt: timestamp, updatedAt: timestamp, revision: 1 };
          data.stories.push(story);
        } else {
          const index = data.stories.findIndex(item => item.id === storyRoute[2] && item.talentId === person.id);
          if (index < 0) throw new HttpError(404, '该卖手的剧情不存在');
          if (body.revision !== data.stories[index].revision) throw new HttpError(409, '这篇剧情已被其他管理员更新，请返回列表刷新后重新编辑');
          story = { ...data.stories[index], ...fields, updatedAt: timestamp, revision: data.stories[index].revision + 1 };
          data.stories[index] = story;
        }
        auditEvent.action = method === 'POST' ? '新增卖手剧情' : '编辑卖手剧情';
        auditEvent.detail = `${person.number} ${person.name} · ${story.date} · 剧情 ${story.id}`;
        atomicWrite(storyFile, data);
        return send(res, method === 'POST' ? 201 : 200, { story });
      }
      if (method === 'POST' && route === '/api/talents') {
        auth.requireAdmin(req);
        const body = await readBody(req), state = loadSellers(sellerFile);
        auditEvent.detail = `新增 ${String(body.number || '').slice(0, 24)} ${String(body.name || '').slice(0, 40)}`;
        const talent = { id: crypto.randomUUID(), number: text(body.number, '编号', 24), name: text(body.name, '姓名', 40), avatar: avatar(body.avatar), introduction: Object.hasOwn(body, 'introduction') ? introduction(body.introduction) : '', active: true };
        auditEvent.action = '新增卖手';
        if (!/^[A-Za-z0-9_-]+$/.test(talent.number)) throw new HttpError(400, '编号只允许字母、数字、下划线或连字符');
        if (state.talents.some(t => t.number.toLowerCase() === talent.number.toLowerCase())) throw new HttpError(409, '该编号已存在，请使用其他编号');
        state.talents.push(talent);
        saveSellers(state);
        return send(res, 201, { talent });
      }
      const talentRoute = /^\/api\/talents\/([A-Za-z0-9_-]+)$/.exec(route);
      const talentRestore = /^\/api\/talents\/([A-Za-z0-9_-]+)\/restore$/.exec(route);
      if ((method === 'DELETE' && talentRoute) || (method === 'POST' && talentRestore)) {
        auth.requireAdmin(req);
        const state = loadSellers(sellerFile);
        const talent = state.talents.find(item => item.id === (talentRoute || talentRestore)[1]);
        if (!talent) throw new HttpError(404, '未找到该卖手');
        const archived = method === 'DELETE';
        talent.archived = archived;
        talent.active = !archived;
        auditEvent.action = archived ? '归档卖手' : '恢复卖手';
        auditEvent.detail = `${talent.number} ${talent.name}`;
        saveSellers(state);
        return send(res, 200, { talent });
      }
      if (method === 'PATCH' && talentRoute) {
        auth.requireAdmin(req);
        const body = await readBody(req), state = loadSellers(sellerFile);
        const index = state.talents.findIndex(t => t.id === talentRoute[1]);
        if (index < 0) throw new HttpError(404, '未找到该卖手');
        const fields = Object.keys(body);
        if (!fields.length || fields.some(key => !['name', 'number', 'avatar', 'introduction', 'active'].includes(key))) {
          throw new HttpError(400, '请提供有效的卖手资料或在用状态');
        }
        const talent = { ...state.talents[index] };
        if (talent.archived) throw new HttpError(409, '请先恢复已归档卖手');
        auditEvent.action = body.active === false ? '停用卖手' : body.active === true ? '启用卖手' : '修改卖手';
        auditEvent.detail = `${talent.number} ${talent.name} · 修改 ${fields.join('、')}`;
        if (Object.hasOwn(body, 'number')) {
          talent.number = text(body.number, '编号', 24);
          if (!/^[A-Za-z0-9_-]+$/.test(talent.number)) throw new HttpError(400, '编号只允许字母、数字、下划线或连字符');
        }
        if (Object.hasOwn(body, 'name')) talent.name = text(body.name, '姓名', 40);
        if (Object.hasOwn(body, 'avatar')) talent.avatar = avatar(body.avatar);
        if (Object.hasOwn(body, 'introduction')) talent.introduction = introduction(body.introduction);
        if (Object.hasOwn(body, 'active')) {
          if (typeof body.active !== 'boolean') throw new HttpError(400, '在用状态格式不正确');
          talent.active = body.active;
        }
        if (state.talents.some(t => t.id !== talent.id && t.number.toLowerCase() === talent.number.toLowerCase())) throw new HttpError(409, '该编号已存在，请使用其他编号');
        state.talents[index] = talent;
        saveSellers(state);
        return send(res, 200, { talent });
      }
      if (method === 'GET' && route === '/api/schedules') {
        const { from, to } = dateRange(url.searchParams, today()), state = loadSellers(sellerFile);
        return send(res, 200, { schedules: state.schedules.filter(s => s.date >= from && s.date <= to).sort((a, b) => a.date.localeCompare(b.date) || a.department.localeCompare(b.department) || a.group.localeCompare(b.group)) });
      }
      if (method === 'POST' && route === '/api/schedules') {
        auth.requireAdmin(req);
        const body = await readBody(req), startDate = futureDate(body.startDate);
        auditEvent.detail = `${startDate} · ${String(body.department || '').slice(0, 20)} ${String(body.group || '').slice(0, 20)} ${String(body.slot || '').slice(0, 20)}`;
        const days = body.days === undefined ? 3 : body.days;
        if (!Number.isInteger(days) || days < 1 || days > 7) throw new HttpError(400, '排班天数须为 1 至 7 天，默认包含开始日在内共 3 天');
        const state = loadSellers(sellerFile), fields = selection(body, state), batchId = crypto.randomUUID();
        const schedules = Array.from({ length: days }, (_, offset) => ({ id: crypto.randomUUID(), date: date(addDays(startDate, offset)), ...fields, batchId }));
        checkConflicts(schedules, state.schedules);
        state.schedules.push(...schedules);
        saveSellers(state);
        return send(res, 201, { schedules });
      }
      const scheduleRoute = /^\/api\/schedules\/([A-Za-z0-9-]+)$/.exec(route);
      if (scheduleRoute && (method === 'PATCH' || method === 'DELETE')) {
        auth.requireAdmin(req);
        const body = method === 'PATCH' ? await readBody(req) : null, state = loadSellers(sellerFile);
        const index = state.schedules.findIndex(s => s.id === scheduleRoute[1]);
        if (index < 0) throw new HttpError(404, '未找到该排班，可能已被其他管理员修改');
        const current = state.schedules[index];
        auditEvent.action = method === 'DELETE' ? '取消单日排班' : '调整单日排班';
        auditEvent.detail = `${current.date} · ${current.department} ${current.group} ${current.slot}`;
        futureDate(current.date);
        if (method === 'DELETE') {
          state.schedules.splice(index, 1);
          saveSellers(state);
          return send(res, 200, { ok: true });
        }
        if (!Object.keys(body).some(k => ['talentId', 'talentIds', 'business'].includes(k)) || Object.keys(body).some(k => !['talentId', 'talentIds', 'business'].includes(k))) throw new HttpError(400, '单日调整只允许更换卖手或业务分类');
        const selectionBody = { ...current, ...body };
        // A legacy single talentId PATCH replaces the whole assignment.
        // Remove the carried-over array so selection does not silently ignore it.
        if (Object.hasOwn(body, 'talentId') && !Object.hasOwn(body, 'talentIds')) delete selectionBody.talentIds;
        const schedule = { ...current, ...selection(selectionBody, state, current.talentIds || current.talentId) };
        checkConflicts([schedule], state.schedules, current.id);
        state.schedules[index] = schedule;
        saveSellers(state);
        return send(res, 200, { schedule });
      }
      if (method === 'GET' && route === '/api/rooms') return send(res, 200, roomsPayload(readRoomDirectory()));
      const roomRoute = /^\/api\/rooms\/(room-[a-f0-9]{32})$/.exec(route);
      const roomRestore = /^\/api\/rooms\/(room-[a-f0-9]{32})\/restore$/.exec(route);
      const isNewRoom = method === 'POST' && route === '/api/rooms';
      if (isNewRoom || (roomRoute && ['PATCH', 'DELETE'].includes(method)) || (roomRestore && method === 'POST')) {
        auth.requireAdmin(req);
        const body = isNewRoom || method === 'PATCH' ? await readBody(req) : null;
        const result = changeRoom((roomRoute || roomRestore)?.[1], method, body);
        auditEvent.action = isNewRoom ? '新增场地' : roomRestore ? '恢复场地'
          : method === 'DELETE' ? '归档场地' : body.active === false ? '停用场地' : '修改场地';
        auditEvent.detail = result.room.name;
        return send(res, isNewRoom ? 201 : 200, result);
      }
      if (method === 'GET' && route === '/api/bookings') {
        const { from, to } = dateRange(url.searchParams, today()), state = loadRooms(roomFile);
        const directory = readRoomDirectory(state);
        return send(res, 200, { bookings: state.bookings.filter(b => b.date >= from && b.date <= to)
          .map(item => publicBooking(item, item.roomId || roomByName(directory, item.room).id)) });
      }
      if (method === 'POST' && route === '/api/book') {
        auth.requireAdmin(req);
        const body = await readBody(req), day = futureDate(body.date);
        const department = text(body.department, '预约部门', 80), bookerName = text(body.bookerName, '预约人姓名', 80);
        const note = text(body.note, '备注', 300, true), clientId = text(body.clientId, '设备标识', 128), state = loadRooms(roomFile);
        const directory = readRoomDirectory(state);
        const room = body.roomId !== undefined
          ? directory.rooms.find(item => item.id === body.roomId)
          : roomByName(directory, text(body.room || body.roomName, '房间', 80));
        if (!room?.active || !config.slots.some(slot => slot.id === body.slot)) throw new HttpError(400, '请选择在用场地和有效时段');
        auditEvent.detail = `${day} · ${room.name} · ${body.slot} · ${department} ${bookerName}`;
        const conflict = state.bookings.find(b => b.date === day && b.slot === body.slot &&
          (b.roomId || roomByName(directory, b.room).id) === room.id);
        if (conflict) throw new HttpError(409, `该时段已被 ${conflict.department} · ${conflict.bookerName} 预约`, { booking: publicBooking(conflict, room.id) });
        const booking = { id: crypto.randomUUID(), date: day, room: room.name, roomId: room.id, slot: body.slot, department, bookerName, note, clientId, createdAt: now().toISOString() };
        state.bookings.push(booking);
        saveRooms(roomFile, state);
        return send(res, 201, { booking: publicBooking(booking, room.id), token: booking.id });
      }
      if (method === 'POST' && route === '/api/cancel') {
        auth.requireAdmin(req);
        const body = await readBody(req), id = text(body.id, '预约编号', 200), state = loadRooms(roomFile);
        const index = state.bookings.findIndex(b => b.id === id);
        if (index < 0) throw new HttpError(404, '预约记录不存在');
        const booking = state.bookings[index];
        auditEvent.detail = `${booking.date} · ${booking.room} ${booking.slot} · ${booking.department} ${booking.bookerName}`;
        futureDate(booking.date);
        state.bookings.splice(index, 1);
        saveRooms(roomFile, state);
        return send(res, 200, { ok: true });
      }
      if (route.startsWith('/api/')) throw new HttpError(404, '接口不存在');
      if (method === 'GET' || method === 'HEAD') {
        let relative;
        try { relative = decodeURIComponent(route === '/' ? '/index.html' : route).slice(1); } catch (_) { throw new HttpError(400, '页面地址无效'); }
        const parts = relative.split('/');
        const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
        const extension = path.extname(relative).toLowerCase();
        if (!types[extension] || relative.includes('\\') || relative.includes('\0') || relative.includes(':') || parts.some(p => !p || p.startsWith('.'))) throw new HttpError(404, '页面不存在');
        const filename = path.resolve(publicDir, relative);
        if (!filename.startsWith(`${publicDir}${path.sep}`) || !fs.existsSync(filename) || !fs.statSync(filename).isFile()) throw new HttpError(404, '页面不存在');
        const realRoot = fs.realpathSync(publicDir), realFile = fs.realpathSync(filename);
        if (!realFile.startsWith(`${realRoot}${path.sep}`)) throw new HttpError(404, '页面不存在');
        return send(res, 200, method === 'HEAD' ? '' : fs.readFileSync(filename), types[extension]);
      }
      throw new HttpError(404, '页面不存在');
    } catch (error) {
      if (res.headersSent || res.destroyed) return;
      if (error instanceof HttpError) return send(res, error.status, { message: error.message, ...error.details });
      console.error(`[${now().toISOString()}] ${error.message}`);
      return send(res, 500, { message: '数据读取或保存失败，原有数据已保留。请联系管理员检查服务日志。' });
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  return server;
}
if (require.main === module) {
  const port = Number(process.env.PORT || 3000), host = process.env.HOST || '127.0.0.1';
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT 必须为 1 至 65535');
  const server = createServer();
  server.listen(port, host, () => console.log(`场地预约与卖手排班系统已启动：http://${host}:${port}`));
  server.on('error', error => { console.error(`服务启动失败：${error.message}`); process.exitCode = 1; });
}
module.exports = { createServer };
