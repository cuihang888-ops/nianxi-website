'use strict';

const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');
const { readJson, atomicWrite, badSchema } = require('./storage');
const { HttpError, object } = require('./validation');
const scrypt = promisify(crypto.scrypt);
const SESSION_MS = 12 * 60 * 60 * 1000;

function initializeAdmins(dataDir, options = {}) {
  const filename = path.join(dataDir, 'admins.json');
  if (fs.existsSync(filename)) throw new Error('管理员已初始化；为保护现有账号，本命令不会覆盖管理员文件。');
  const credentials = [
    { username: 'owner', displayName: '负责人', password: options.ownerPassword || crypto.randomBytes(18).toString('base64url') },
    { username: 'staff', displayName: '排班工作人员', password: options.staffPassword || crypto.randomBytes(18).toString('base64url') }
  ];
  for (const account of credentials) {
    if (typeof account.password !== 'string' || account.password.length < 12 || account.password.length > 256) throw new Error('管理员密码长度须为 12 至 256 个字符。');
  }
  const admins = credentials.map(account => {
    const salt = crypto.randomBytes(16).toString('hex');
    return { username: account.username, displayName: account.displayName, salt, hash: crypto.scryptSync(account.password, salt, 64).toString('hex') };
  });
  atomicWrite(filename, { version: 1, admins });
  return credentials;
}
function loadAdmins(filename) {
  const data = readJson(filename, () => null);
  if (data === null) throw new HttpError(503, '管理员账号尚未初始化，请由负责人运行账号初始化命令');
  if (!object(data) || data.version !== 1 || !Array.isArray(data.admins) || data.admins.length !== 2 || data.admins.some(a => !object(a) || !['owner', 'staff'].includes(a.username) || typeof a.displayName !== 'string' || typeof a.salt !== 'string' || !/^[a-f0-9]{32}$/.test(a.salt) || typeof a.hash !== 'string' || !/^[a-f0-9]{128}$/.test(a.hash)) || new Set(data.admins.map(a => a.username)).size !== 2) badSchema(filename);
  return data.admins;
}
function makeAuth(dataDir, { now = () => new Date(), secureCookies = false } = {}) {
  const sessions = new Map(), attempts = new Map();
  const dummySalt = crypto.randomBytes(16).toString('hex');
  const dummyHash = crypto.scryptSync(crypto.randomBytes(32), dummySalt, 64);
  const millis = () => now().getTime();
  function session(req) {
    const match = /(?:^|;\s*)room_session=([A-Za-z0-9_-]{43})(?:;|$)/.exec(req.headers.cookie || '');
    const result = match ? sessions.get(match[1]) : null;
    if (!result || result.expires <= millis()) { if (match) sessions.delete(match[1]); return null; }
    return { ...result, token: match[1] };
  }
  function requireAdmin(req, csrf = true) {
    const current = session(req);
    if (!current) throw new HttpError(401, '请先登录管理账号');
    const token = req.headers['x-csrf-token'];
    if (csrf && (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token) || !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(current.csrfToken)))) throw new HttpError(403, '操作验证已过期，请刷新页面后重试');
    return current;
  }
  function cookie(token, req, clear = false) {
    return `room_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${clear ? 0 : SESSION_MS / 1000}${secureCookies || req.socket.encrypted ? '; Secure' : ''}`;
  }
  async function login(req, res, body) {
    const time = millis();
    for (const [key, value] of attempts) if (value.until <= time) attempts.delete(key);
    for (const [key, value] of sessions) if (value.expires <= time) sessions.delete(key);
    const ip = req.socket.remoteAddress || 'unknown';
    let rate = attempts.get(ip);
    if (!rate) { rate = { count: 0, until: time + 15 * 60 * 1000 }; attempts.set(ip, rate); }
    if (rate.count >= 10 || attempts.size > 10000) throw new HttpError(429, '登录尝试过多，请 15 分钟后重试');
    rate.count++;
    const admins = loadAdmins(path.join(dataDir, 'admins.json'));
    const passwordOnly = !Object.hasOwn(body, 'username');
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    if (typeof body.password !== 'string' || body.password.length > 256) throw new HttpError(400, passwordOnly ? '密码错误' : '请填写账号和密码');
    let account;
    if (passwordOnly) {
      // Check both existing hashes without exposing account selection to the UI
      // or changing the stored credentials. Evaluate every account each time.
      const candidates = await Promise.all(admins.map(a => scrypt(body.password, a.salt, 64)));
      const matches = candidates.map((candidate, index) => crypto.timingSafeEqual(candidate, Buffer.from(admins[index].hash, 'hex')));
      account = admins.find((_, index) => matches[index]);
      if (!account) throw new HttpError(401, '密码错误');
    } else {
      account = admins.find(a => a.username === username);
      const candidate = await scrypt(body.password, account?.salt || dummySalt, 64);
      const expected = account ? Buffer.from(account.hash, 'hex') : dummyHash;
      if (!crypto.timingSafeEqual(candidate, expected) || !account) throw new HttpError(401, '账号或密码错误');
    }
    const previous = session(req);
    if (previous) sessions.delete(previous.token);
    if (sessions.size >= 10000) throw new HttpError(503, '当前登录人数过多，请稍后重试');
    const token = crypto.randomBytes(32).toString('base64url');
    const entry = { user: { username: account.username, displayName: account.displayName }, csrfToken: crypto.randomBytes(32).toString('base64url'), expires: time + SESSION_MS };
    sessions.set(token, entry);
    res.setHeader('Set-Cookie', cookie(token, req));
    return { user: entry.user, csrfToken: entry.csrfToken };
  }
  function logout(req, res) {
    const current = requireAdmin(req);
    sessions.delete(current.token);
    res.setHeader('Set-Cookie', cookie('', req, true));
    return { user: null };
  }
  return { session, requireAdmin, login, logout };
}
function makeSecurity(dataDir, auth, { now = () => new Date(), secureCookies = false } = {}) {
  const directory = path.join(dataDir, 'security');
  const auditFile = path.join(directory, 'audit.jsonl');
  const reads = new Map(), requestVisitors = new WeakMap();
  const clean = (value, max = 160) => String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, max);
  function visitorId(req) {
    const match = /(?:^|;\s*)room_visitor=([A-Za-z0-9_-]{43})(?:;|$)/.exec(req.headers.cookie || '');
    if (match) return match[1];
    if (!requestVisitors.has(req)) requestVisitors.set(req, crypto.randomBytes(32).toString('base64url'));
    return requestVisitors.get(req);
  }
  function prepareVisitor(req, res) {
    const id = visitorId(req);
    if (!/(?:^|;\s*)room_visitor=[A-Za-z0-9_-]{43}(?:;|$)/.test(req.headers.cookie || '')) {
      res.setHeader('Set-Cookie', `room_visitor=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${secureCookies || req.socket.encrypted ? '; Secure' : ''}`);
    }
  }
  function identity(req) {
    const admin = auth.session(req);
    if (admin) return { name: admin.user.displayName, role: admin.user.username, id: admin.user.username, source: 'administrator' };
    const wechat = /MicroMessenger\//i.test(req.headers['user-agent'] || '');
    // This identifies a browser, never a WeChat account or a verified person.
    return { name: wechat ? '微信访客（未授权昵称）' : '普通访客', role: 'visitor', id: visitorId(req),
      browser: wechat ? 'wechat' : 'web', source: 'browser', avatar: '' };
  }
  function requireOwner(req, csrf = false) {
    const current = auth.requireAdmin(req, csrf);
    if (current.user.username !== 'owner') throw new HttpError(403, '只有负责人可以查看日志');
    return current;
  }
  function me() {
    // Previous company policies remain archived on disk but no longer gate viewing.
    return { required: false, authorized: true, viewer: null };
  }
  function record(req, event) {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    if (fs.existsSync(auditFile) && fs.statSync(auditFile).size >= 2 * 1024 * 1024) {
      for (let index = 4; index >= 1; index--) {
        const from = index === 1 ? auditFile : `${auditFile}.${index - 1}`;
        const to = `${auditFile}.${index}`;
        if (fs.existsSync(from)) fs.renameSync(from, to);
      }
    }
    const actor = event.actor || identity(req);
    const entry = { id: crypto.randomUUID(), time: now().toISOString(), category: clean(event.category, 20),
      action: clean(event.action, 60), outcome: event.outcome || 'success',
      actor: { name: clean(actor.name, 60), role: clean(actor.role, 20), id: clean(actor.id, 100),
        browser: clean(actor.browser, 20), source: clean(actor.source, 30) },
      ip: clean(req.socket.remoteAddress, 80), userAgent: clean(req.headers['user-agent'], 300),
      method: clean(req.method, 10), path: clean(event.path || (req.url || '').split('?')[0], 180),
      status: Number(event.status || 200), detail: clean(event.detail, 300) };
    fs.appendFileSync(auditFile, JSON.stringify(entry) + '\n', { mode: 0o600 });
  }
  function recordRead(req, route, detail) {
    const actor = identity(req), key = `${actor.id || req.socket.remoteAddress}|${route}|${detail}`;
    const time = now().getTime();
    for (const [oldKey, stamp] of reads) if (time - stamp > 60000) reads.delete(oldKey);
    if (reads.has(key) || reads.size > 10000) return;
    reads.set(key, time);
    record(req, { category: 'view', action: '读取数据', detail, path: route, actor });
  }
  function list(req, params) {
    requireOwner(req);
    const category = params.get('category') || '', outcome = params.get('outcome') || '', day = params.get('day') || '';
    const search = clean(params.get('search'), 80).toLowerCase(), offset = Number(params.get('offset') || 0);
    if (!Number.isInteger(offset) || offset < 0 || offset > 50000 || (day && !/^\d{4}-\d{2}-\d{2}$/.test(day))) throw new HttpError(400, '日志筛选条件无效');
    const entries = [];
    for (const filename of [auditFile, ...[1, 2, 3, 4].map(index => `${auditFile}.${index}`)]) {
      if (!fs.existsSync(filename)) continue;
      const lines = fs.readFileSync(filename, 'utf8').split('\n').filter(Boolean).reverse();
      for (const line of lines) {
        let entry;
        try { entry = JSON.parse(line); } catch { continue; }
        if (entry.outcome === 'attempt') continue;
        if (category && entry.category !== category || outcome && entry.outcome !== outcome) continue;
        if (day && new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(new Date(entry.time)) !== day) continue;
        if (search && ![entry.actor?.name, entry.ip, entry.action, entry.detail].some(value => String(value || '').toLowerCase().includes(search))) continue;
        entries.push(entry);
      }
    }
    const views = entries.filter(entry => entry.category === 'view');
    return { entries: entries.slice(offset, offset + 100), total: entries.length, offset,
      visitors: new Set(views.map(entry => entry.actor?.id || `${entry.ip}|${entry.userAgent}`)).size,
      wechatViews: views.filter(entry => entry.actor?.browser === 'wechat').length,
      wechatIdentity: { connected: false, message: '尚未接入微信网页授权，无法取得真实微信头像和昵称。微信标记仅依据浏览器信息，设备标识不代表真实身份。' },
      hasMore: offset + 100 < entries.length, retention: '最近约10MB日志，循环保留', ipSource: '服务器直连IP，忽略客户端伪造的转发头' };
  }
  return { identity, prepareVisitor, requireOwner, me, record, recordRead, list };
}
module.exports = { initializeAdmins, loadAdmins, makeAuth, makeSecurity };
