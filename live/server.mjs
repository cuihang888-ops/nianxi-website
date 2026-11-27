import http from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { resolve, dirname, extname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Store, passwordHash, passwordMatches, publicUser } from './lib/store.mjs';
import { ApiError, keys, text, date, version, countFields, sessionInput, inventoryInput, taskInput, conflict } from './lib/validation.mjs';
import { directory, handleDirectory, sessionSlotWrite } from './lib/directory.mjs';
import { ROLES, PUBLIC_ENTRY_USER, isStaff, safeDataset, entryDirectory, entryInput, duplicateEntry, hasSessionMetrics, fillableSession, fillSession, mergeableSession, mergeSession } from './lib/entry.mjs';
import { completenessForDate } from './lib/completeness.mjs';
import { createFeedback } from './lib/feedback.mjs';
import { chinaDate } from './lib/seed.mjs';
import { handleMonthly } from './lib/monthly.mjs';
import { handleAnchorReview } from './lib/review.mjs';
import { createTearoom } from './lib/tearoom.mjs';
import { jadeGuideScripts } from './lib/tearoom-jade-guide.mjs';
import { createWishes } from './lib/wishes.mjs';
import { createDepartmentGoals } from './lib/department-goals.mjs';
import { PERIODS, resolveShiftPeriod } from './public/shift-periods.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const TTL = 12 * 60 * 60 * 1000;
const DASHBOARD_ATTEMPT_WINDOW = 15 * 60 * 1000;
const PUBLIC_ENTRY_WINDOW = 60 * 1000;
const PUBLIC_ENTRY_WRITE_LIMIT = 240;
const ACCOUNT_COOKIE = 'command_session';
const DASHBOARD_COOKIE = 'command_dashboard';
const DASHBOARD_VIEWER = { id: 'dashboard-viewer', name: '业绩看板', role: 'dashboard_viewer' };
const tearoomStarterScripts = [
  { id: 'starter-bargain', cat: '砍价', title: '客户说「再便宜点」怎么接', body: '可以先问「您希望控制在什么预算？这只是日常佩戴，还是有特定场合用？」再按预算给出两三款，讲清差异，让客户自己选。' },
  { id: 'starter-certificate', cat: '证书售后', title: '客户问证书和售后怎么答', body: '可以说「我先帮您核对这一款的证书和售后规则，确认后发给您看。您看清楚再决定。」只说明已核实的商品信息和当前规则。' },
  { id: 'starter-color', cat: '色名意境', title: '用一句话讲清「晴底」', body: '可以先描述镜头里看得到的颜色和通透感，再用「像雨后透着一点淡青的湖水」举例。提醒客户在不同光线下观察实物颜色。' }
];
const dashboardAccountFields = ['id', 'name', 'color'];
const dashboardAnchorFields = ['id', 'name', 'accountId', 'slotId', 'slotLabel', 'sourceRow', 'activeFrom', 'activeTo'];
const dashboardSessionFields = [
  'id', 'date', 'accountId', 'anchorId', 'slotId', 'slotLabel', 'period', 'sourceStatus', 'cancelled',
  'status', 'start', 'end', 'endDayOffset', 'scheduleUnknown', 'actualMinutes', 'target', 'orderAmount',
  'received', 'refunds', 'adSpend', ...countFields
];
const selectFields = (record, fields) => Object.fromEntries(fields.filter(field => Object.hasOwn(record, field)).map(field => [field, record[field]]));
const csvCell = value => {
  let content = String(value ?? '');
  if (/^[\s]*[=+\-@\t\r]/.test(content)) content = `'${content}`;
  return `"${content.replaceAll('"', '""')}"`;
};

export function configuration(env = process.env) {
  const production = env.NODE_ENV === 'production';
  if (production && (!env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length < 12 || /^(demo|admin|password)/i.test(env.ADMIN_PASSWORD))) throw new Error('生产环境须设置 ADMIN_PASSWORD，至少 12 位且不能使用演示或常见默认密码。');
  const dashboardPassword = env.DASHBOARD_PASSWORD?.trim();
  if (production && !dashboardPassword) throw new Error('生产环境须设置独立的 DASHBOARD_PASSWORD。');
  if (dashboardPassword && (dashboardPassword.length > 200 || dashboardPassword === env.ADMIN_PASSWORD?.trim())) throw new Error('DASHBOARD_PASSWORD 须与管理员密码不同且不超过 200 个字符。');
  const host = production ? (env.HOST || '0.0.0.0') : (env.HOST || '127.0.0.1');
  if (!production && !['127.0.0.1', 'localhost', '::1'].includes(host)) throw new Error('演示模式仅允许绑定本机。多人服务器请使用生产模式和独立密码。');
  const port = Number(env.PORT || 4177);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT 无效');
  if (production && env.PREVIEW_IMPORT === 'true') throw new Error('真实数据本地预览不可使用生产环境，请移除 PREVIEW_IMPORT。');
  const bookingUrl = new URL(env.BOOKING_URL || 'http://43.135.1.109:3000/');
  if (!['http:', 'https:'].includes(bookingUrl.protocol) || bookingUrl.username || bookingUrl.password) {
    throw new Error('BOOKING_URL 须为不含登录信息的 HTTP 或 HTTPS 地址。');
  }
  return { demo: !production, mode: env.PREVIEW_IMPORT === 'true' ? 'imported' : production ? 'production' : 'demo', production, host, port, dataDir: resolve(env.DATA_DIR || resolve(ROOT, 'data')), adminPassword: env.ADMIN_PASSWORD, adminUsername: env.ADMIN_USERNAME, adminName: env.ADMIN_NAME, cookieSecure: env.COOKIE_SECURE === 'true', dashboardPassword, bookingUrl, assistantAccess: env.ASSISTANT_ACCESS };
}

async function body(request, maxBytes = 64 * 1024) {
  if (!(request.headers['content-type'] || '').startsWith('application/json')) throw new ApiError(415, '请使用 application/json');
  const chunks = []; let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > maxBytes) throw new ApiError(413, '单次录入内容过大');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new ApiError(400, 'JSON 格式无效'); }
}

export function createApplication(options = {}) {
  const config = { ...configuration(), ...options };
  const store = new Store(options.dbPath || resolve(config.dataDir, 'command-center.sqlite'), config);
  const tearoom = createTearoom({
    store, cookieSecure: config.cookieSecure, seedScripts: [...tearoomStarterScripts, ...jadeGuideScripts]
  });
  const wishes = createWishes({ store });
  const departmentGoals = createDepartmentGoals({ store });
  const feedback = createFeedback({ store });
  const assistantAccess = ['pilot', 'employees'].includes(config.assistantAccess) ? config.assistantAccess : 'off';
  const assistantMode = assistantAccess === 'pilot' ? 'pilot'
    : !config.production && options.assistantDemo === true && options.assistantFetch ? 'demo' : 'live';
  let assistantPromise;
  function loadAssistant() {
    return assistantPromise ??= import('./lib/assistant.mjs').then(({ assistantConfiguration, createAssistant }) => {
      const settings = options.assistantConfig ?? assistantConfiguration();
      return settings.primary ? createAssistant({ store, config: settings, fetchImpl: options.assistantFetch }) : null;
    }).catch(() => {
      console.error('AI 助手初始化失败，服务已停用。请检查后端配置。');
      return null;
    });
  }
  const datasetInfo = () => store.getDataset();
  const demoVisible = () => store.demo && datasetInfo().kind === 'demo';
  const logins = new Map();
  const attempts = new Map();
  const dashboardAttempts = new Map();
  const publicEntryWrites = new Map();
  const dashboardHash = config.dashboardPassword ? passwordHash(config.dashboardPassword) : null;
  const dummyHash = passwordHash(randomBytes(32).toString('hex'));
  function accessPayload(user, session) {
    const dashboardOnly = session.dashboardOnly === true;
    const dashboardRequired = !!dashboardHash && !dashboardOnly && !isStaff(user);
    const dashboardUnlocked = !isStaff(user) && (!dashboardRequired || session.dashboardUnlocked === true);
    const dataset = dashboardOnly ? selectFields(datasetInfo(), ['kind', 'label', 'cutoffDate']) : dashboardUnlocked ? datasetInfo() : safeDataset(datasetInfo());
    return { user: publicUser(user), demo: demoVisible(), dashboardOnly, dashboardRequired, dashboardUnlocked, dataset };
  }
  function dashboardPayload(user, session) {
    const accounts = store.list('accounts').map(item => selectFields(item, dashboardAccountFields));
    const anchors = store.list('anchors').map(item => selectFields(item, dashboardAnchorFields));
    const sessions = store.list('sessions').map(item => selectFields(item, dashboardSessionFields));
    const slots = directory(store).slots.map(item => selectFields(item, ['id', 'accountId', 'name', 'period']));
    return { ...accessPayload(user, session), currency: 'CNY', accounts, anchors, slots, sessions };
  }
  function send(response, status, value, headers = {}) {
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
    response.end(JSON.stringify(value));
  }
  function sessionToken(request, name) {
    const prefix = `${name}=`;
    return (request.headers.cookie || '').split(';').map(item => item.trim()).find(item => item.startsWith(prefix))?.slice(prefix.length);
  }
  function readSession(request, cookieName) {
    const token = sessionToken(request, cookieName);
    const session = logins.get(token);
    if (!session || session.expires <= Date.now()) {
      if (token) logins.delete(token);
      return null;
    }
    const dashboardOnly = cookieName === DASHBOARD_COOKIE;
    if (dashboardOnly !== session.dashboardOnly) return null;
    const user = dashboardOnly ? DASHBOARD_VIEWER : store.userById(session.userId);
    return user ? { user, session, token, cookieName } : null;
  }
  function assistantAllowed(adminUser) {
    return assistantAccess === 'employees' || (assistantAccess === 'pilot' && adminUser?.role === 'admin');
  }
  async function handleAssistant(path, request, response) {
    const user = readSession(request, ACCOUNT_COOKIE)?.user;
    if (!assistantAllowed(user)) return send(response, 404, { error: 'AI 助手暂未开放' });
    const canViewUsage = user?.role === 'admin';
    const isStatus = path === '/api/ai/status' && request.method === 'GET';
    const isChat = path === '/api/ai/chat' && request.method === 'POST';
    const isUsage = path === '/api/ai/usage' && request.method === 'GET';
    if (!isStatus && !isChat && !isUsage) return send(response, 404, { error: '接口不存在' });
    if (isUsage && !canViewUsage) return send(response, user ? 403 : 401, { error: '仅管理员可以查看 AI 用量' });
    const profile = !isUsage && assistantAccess === 'employees' ? tearoom.session(request) : null;
    if (isChat && assistantAccess === 'employees' && !profile) {
      return send(response, 401, { error: '请进入茶水间后再试。' });
    }
    const assistant = await loadAssistant();
    if (isStatus) return send(response, 200, {
      mode: assistant ? assistantMode : 'off', canViewUsage: Boolean(assistant) && canViewUsage,
      needsTeaSession: Boolean(assistant) && assistantAccess === 'employees' && !profile
    });
    if (!assistant) return send(response, 503, { error: 'AI 助手暂未启用。' });
    if (isUsage) return send(response, 200, assistant.usage());
    const input = await body(request);
    keys(input, ['task', 'text', 'target']);
    const output = await assistant.run({ action: input.task, text: input.text, target: input.target }, {
      identity: profile?.actor ?? 'admin:' + user.id, secondaryIdentity: request.socket.remoteAddress
    });
    return send(response, 200, { ...output, mode: assistantMode });
  }
  function requireSession(request, scope) {
    const account = scope === 'dashboard' ? null : readSession(request, ACCOUNT_COOKIE);
    const login = account || (scope !== 'account' && readSession(request, DASHBOARD_COOKIE));
    if (!login) throw new ApiError(401, scope === 'dashboard' ? '请输入业绩看板密码' : '请先登录');
    return login;
  }
  function entryUser(request) {
    if (request.headers['x-command-scope'] === 'public-entry') return PUBLIC_ENTRY_USER;
    return readSession(request, ACCOUNT_COOKIE)?.user || PUBLIC_ENTRY_USER;
  }
  function issueSession(cookieName, data) {
    for (const [token, session] of logins) if (session.expires <= Date.now()) logins.delete(token);
    const token = randomBytes(32).toString('hex');
    const session = { ...data, dashboardOnly: cookieName === DASHBOARD_COOKIE, expires: Date.now() + TTL };
    logins.set(token, session);
    return { session, header: cookie(cookieName, token) };
  }
  function verifyDashboardPassword(request, password, user) {
    if (!dashboardHash) throw new ApiError(503, '业绩看板密码未配置');
    const now = Date.now();
    for (const [key, failures] of dashboardAttempts) {
      if (failures.at(-1) <= now - DASHBOARD_ATTEMPT_WINDOW) dashboardAttempts.delete(key);
    }
    const userKey = user && `user:${user.id}`;
    const addressKey = `address:${request.socket.remoteAddress || 'unknown'}`;
    const recent = key => (dashboardAttempts.get(key) || []).filter(time => time > now - DASHBOARD_ATTEMPT_WINDOW);
    const userFailures = recent(userKey);
    const addressFailures = recent(addressKey);
    if (userFailures.length >= 5 || addressFailures.length >= 12) {
      throw new ApiError(429, '看板解锁尝试过多，请稍后再试', { code: 'DASHBOARD_RATE_LIMITED' });
    }
    if (!passwordMatches(password, dashboardHash)) {
      if (userKey) dashboardAttempts.set(userKey, [...userFailures, now]);
      dashboardAttempts.set(addressKey, [...addressFailures, now]);
      throw new ApiError(401, '业绩看板密码错误', { code: 'DASHBOARD_PASSWORD_INVALID' });
    }
    if (userKey) dashboardAttempts.delete(userKey);
  }
  function writable(user) { if (!['admin', 'manager', 'editor'].includes(user.role)) throw new ApiError(403, '此账号没有管理数据编辑权限'); }
  function entryWritable(user, request) {
    if (user.role !== PUBLIC_ENTRY_USER.role) {
      if (!['admin', 'manager', 'editor', 'anchor_entry', 'service_entry'].includes(user.role)) throw new ApiError(403, '此账号没有录入权限');
      return;
    }
    const now = Date.now();
    for (const [address, window] of publicEntryWrites) {
      if (window.expires <= now) publicEntryWrites.delete(address);
    }
    const address = request.socket.remoteAddress || 'unknown';
    const window = publicEntryWrites.get(address) || { expires: now + PUBLIC_ENTRY_WINDOW, count: 0 };
    if (window.count >= PUBLIC_ENTRY_WRITE_LIMIT) throw new ApiError(429, '录入过于频繁，请稍后再保存');
    window.count += 1;
    publicEntryWrites.set(address, window);
  }
  function admin(user) { if (user.role !== 'admin') throw new ApiError(403, '仅管理员可以管理成员'); }
  function tearoomScope(request) {
    const profile = tearoom.session(request);
    if (!profile) throw new ApiError(401, '请刷新页面继续使用茶水间');
    return { ...profile, canModerate: readSession(request, ACCOUNT_COOKIE)?.user.role === 'admin' };
  }
  function goalProgress(plan, user) {
    const { month } = plan;
    const today = chinaDate();
    const dayMs = 86400000;
    const start = Date.parse(month + '-01');
    const end = Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0);
    const cutoff = Math.min(end, Date.parse(today) - dayMs);
    const asOf = cutoff >= start ? new Date(cutoff).toISOString().slice(0, 10) : null;
    const remainingDays = Math.max(0, (end - Math.max(start, Date.parse(today))) / dayMs + 1);
    let salesCents = 0;
    let salesReported = 0;
    let salesPending = 0;
    if (asOf) {
      for (const row of store.list('sessions')) {
        if (!row.date.startsWith(month + '-') || row.date > asOf || row.sourceStatus === 'stopped' || row.cancelled) continue;
        if (Number.isFinite(row.orderAmount)) {
          salesCents += Math.round(row.orderAmount * 100);
          salesReported++;
        } else {
          salesPending++;
        }
      }
    }
    return {
      ...plan, asOf, remainingDays, salesReported, salesPending,
      salesActual: salesReported ? salesCents / 100 : null,
      canEdit: ['admin', 'manager'].includes(user.role)
    };
  }
  function cookie(name, value, maxAge = TTL / 1000) { return `${name}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${config.cookieSecure ? '; Secure' : ''}`; }
  const server = http.createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'same-origin');
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'");
    try {
      const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
      const path = decodeURIComponent(url.pathname);
      if (path === '/api/health' && request.method === 'GET') return send(response, 200, { ok: true });
      if (!['GET', 'HEAD'].includes(request.method)) {
        const origin = request.headers.origin;
        if (origin) {
          let parsed;
          try { parsed = new URL(origin); } catch { throw new ApiError(403, '来源无效'); }
          if (parsed.host !== request.headers.host || !['http:', 'https:'].includes(parsed.protocol)) throw new ApiError(403, '不允许跨站写入');
        }
      }
      if (path === '/api/login' && request.method === 'POST') {
        const input = await body(request); keys(input, ['username', 'password']);
        const username = text(input.username, '用户名', 100, true);
        const password = text(input.password, '密码', 200, true);
        const address = request.socket.remoteAddress || 'unknown';
        const key = address;
        const recent = (attempts.get(key) || []).filter(time => Date.now() - time < 15 * 60 * 1000);
        if (recent.length >= 12) throw new ApiError(429, '登录尝试过多，请 15 分钟后再试');
        const found = store.findUser(username);
        const valid = passwordMatches(password, found?.passwordHash || dummyHash);
        if (!found || !valid) { attempts.set(key, [...recent, Date.now()]); throw new ApiError(401, '用户名或密码错误'); }
        attempts.delete(key);
        const { session, header } = issueSession(ACCOUNT_COOKIE, { userId: found.id });
        return send(response, 200, accessPayload(found, session), { 'Set-Cookie': header });
      }
      if (path === '/api/dashboard/unlock' && request.method === 'POST') {
        const input = await body(request);
        keys(input, ['password', 'mode']);
        const password = text(input.password, '业绩看板密码', 200, true);
        if (input.mode === 'manage') {
          const { user, session } = requireSession(request, 'account');
          if (isStaff(user)) throw new ApiError(403, '员工账号仅可使用基础数据录入入口');
          if (dashboardHash && !session.dashboardUnlocked) verifyDashboardPassword(request, password, user);
          session.dashboardUnlocked = true;
          return send(response, 200, accessPayload(user, session));
        }
        if (Object.hasOwn(input, 'mode')) throw new ApiError(400, '看板登录方式无效');
        verifyDashboardPassword(request, password);
        const previous = readSession(request, DASHBOARD_COOKIE);
        if (previous) logins.delete(previous.token);
        const { session, header } = issueSession(DASHBOARD_COOKIE);
        const payload = url.searchParams.get('include') === 'dashboard'
          ? dashboardPayload(DASHBOARD_VIEWER, session)
          : accessPayload(DASHBOARD_VIEWER, session);
        return send(response, 200, payload, { 'Set-Cookie': header });
      }
      if (path.startsWith('/api/')) {
        if (path === '/api/ai' || path.startsWith('/api/ai/')) return await handleAssistant(path, request, response);
        if (path === '/api/tearoom/wishes') {
          const scope = tearoomScope(request);
          if (request.method === 'GET') return send(response, 200, wishes.list(scope));
          if (request.method === 'POST') {
            const input = await body(request);
            tearoom.limitWrite(scope.actor);
            return send(response, 201, wishes.post(input, scope));
          }
          throw new ApiError(405, '请求方法不支持');
        }
        const wishRoute = /^\/api\/tearoom\/wishes\/([a-z0-9-]{36})\/(contact|status)$/.exec(path);
        if (wishRoute) {
          const [, id, action] = wishRoute;
          const scope = tearoomScope(request);
          if (action === 'contact' && request.method === 'GET') return send(response, 200, wishes.contact(id, scope));
          if (action === 'status' && request.method === 'POST') return send(response, 200, wishes.status(id, await body(request), scope));
          throw new ApiError(405, '请求方法不支持');
        }
        if (path === '/api/tearoom/honors') {
          if (request.method !== 'GET') throw new ApiError(405, '请求方法不支持');
          tearoomScope(request);
          return send(response, 200, feedback.honorsForTearoom());
        }
        if (path === '/api/tearoom/activity') {
          if (request.method !== 'GET') throw new ApiError(405, '请求方法不支持');
          tearoomScope(request);
          const limit = Number(url.searchParams.get('limit') ?? 20);
          return send(response, 200, feedback.activityFeed(Number.isFinite(limit) ? limit : 20));
        }
        if (await tearoom.handle({
          path, request, response, send, body,
          getAdmin: () => readSession(request, ACCOUNT_COOKIE)?.user.role === 'admin'
        })) return;
        if (path === '/api/entry/bootstrap' && request.method === 'GET') {
          return send(response, 200, entryDirectory(directory(store)));
        }
        if (path === '/api/entry/completeness' && request.method === 'GET') {
          // 只下发完成状态与缺项名称，不下发任何指标数值（录入只写不读）。
          const target = date(url.searchParams.get('date') ?? '');
          return send(response, 200, completenessForDate(store, directory(store), target));
        }
        if (path === '/api/entry/sessions' && request.method === 'POST') {
          const user = entryUser(request);
          entryWritable(user, request);
          const input = await body(request);
          const known = directory(store);
          const result = entryInput(input, user, known);
          if (result.orderAmount >= 100000 && input.confirmAmount !== true) {
            throw new ApiError(422, '请再次核对填写的业绩金额。确认后可以继续提交。', { code: 'ENTRY_CONFIRM_AMOUNT' });
          }
          const matching = duplicateEntry(result, store.list('sessions'), known.anchors);
          const blank = matching.length === 1 && fillableSession(matching[0], result) ? matching[0] : null;
          // 补录：场次已填一部分时，只补空缺字段，不覆盖已填数值；与已填值冲突仍按重复提交拦截。
          const partial = !blank && matching.length === 1 && mergeableSession(matching[0], result) ? matching[0] : null;
          if (matching.length && !blank && !partial) {
            throw new ApiError(409, '该场次无法重复提交。需要更正时请联系主管。');
          }
          const existing = blank ?? partial;
          const next = blank ? fillSession(blank, result)
            : partial ? mergeSession(partial, result)
            : { ...result, id: randomUUID() };
          try {
            if (!existing) conflict(next, store.list('sessions'));
            store.save('sessions', next, existing?.version, user);
          } catch (error) {
            if (!(error instanceof ApiError) || error.status !== 409) throw error;
            throw new ApiError(409, '该场次无法重复提交。需要更正时请联系主管。');
          }
          return send(response, 201, { ok: true });
        }
        if (path.startsWith('/api/entry/')) {
          throw new ApiError(405, '录入入口只接受新场次提交。');
        }
        const { user, session, token, cookieName } = requireSession(request, request.headers['x-command-scope']);
        if (path === '/api/me' && request.method === 'GET') return send(response, 200, accessPayload(user, session));
        if (path === '/api/logout' && request.method === 'POST') {
          logins.delete(token);
          return send(response, 200, { ok: true }, { 'Set-Cookie': cookie(cookieName, '', 0) });
        }
        if (path === '/api/department-goals') {
          if (isStaff(user)) throw new ApiError(403, '员工录入账号无法查看部门月度目标');
          if (!session.dashboardOnly && dashboardHash && !session.dashboardUnlocked) {
            throw new ApiError(403, '请先解锁业绩看板', { code: 'DASHBOARD_LOCKED' });
          }
          if (request.method === 'GET') {
            const month = url.searchParams.get('month') ?? chinaDate().slice(0, 7);
            return send(response, 200, goalProgress(departmentGoals.read(month), user));
          }
          if (request.method === 'PUT') {
            if (!['admin', 'manager'].includes(user.role)) throw new ApiError(403, '仅管理员和主管可以维护部门月度目标');
            const plan = departmentGoals.save(await body(request), user);
            return send(response, 200, goalProgress(plan, user));
          }
          throw new ApiError(405, '请求方法不支持');
        }
        if (path === '/api/dashboard/feedback' || path.startsWith('/api/dashboard/feedback/') ||
            path === '/api/dashboard/completeness' || path === '/api/dashboard/honors') {
          // 员工反馈正文、协调事项与录入完整性总览按看板权限在服务端保护：
          // 未解锁看板的会话一律拿不到，员工录入账号直接拒绝。
          if (isStaff(user)) throw new ApiError(403, '员工录入账号无法查看员工反馈');
          if (!session.dashboardOnly && dashboardHash && !session.dashboardUnlocked) {
            throw new ApiError(403, '请先解锁业绩看板', { code: 'DASHBOARD_LOCKED' });
          }
          const canManage = session.dashboardOnly || ['admin', 'manager'].includes(user.role);
          if (path === '/api/dashboard/feedback' && request.method === 'GET') {
            return send(response, 200, feedback.dashboardFeedback());
          }
          const suggestionRoute = /^\/api\/dashboard\/feedback\/suggestions\/(JY-[A-F0-9]+)\/status$/.exec(path);
          if (suggestionRoute && request.method === 'POST') {
            if (!canManage) throw new ApiError(403, '仅管理层可以处理建议');
            return send(response, 200, feedback.updateSuggestion(suggestionRoute[1], await body(request)));
          }
          const ventRoute = /^\/api\/dashboard\/feedback\/vents\/([\w-]+)\/visibility$/.exec(path);
          if (ventRoute && request.method === 'POST') {
            if (!canManage) throw new ApiError(403, '仅管理层可以管理吐槽');
            return send(response, 200, feedback.setVentHidden(ventRoute[1], await body(request)));
          }
          const coordinateRoute = /^\/api\/dashboard\/feedback\/coordinates\/([\w-]+)\/status$/.exec(path);
          if (coordinateRoute && request.method === 'POST') {
            if (!canManage) throw new ApiError(403, '仅管理层可以处理协调事项');
            return send(response, 200, feedback.updateCoordinate(coordinateRoute[1], await body(request)));
          }
          if (path === '/api/dashboard/completeness' && request.method === 'GET') {
            const target = date(url.searchParams.get('date') ?? '');
            return send(response, 200, completenessForDate(store, directory(store), target));
          }
          if (path === '/api/dashboard/honors') {
            if (request.method === 'GET') return send(response, 200, { honors: feedback.listHonors() });
            if (request.method === 'POST') {
              if (!canManage) throw new ApiError(403, '仅管理层可以发布荣誉');
              return send(response, 201, feedback.publishHonor(await body(request, 2 * 1024 * 1024), user.name));
            }
          }
          throw new ApiError(404, '接口不存在');
        }
        if (session.dashboardOnly) {
          if (await handleAnchorReview({ path, url, request, response, user, store, send, body, canWriteNotes: false })) return;
          if (path !== '/api/bootstrap' || request.method !== 'GET') throw new ApiError(403, '业绩看板仅提供数据查看', { code: 'DASHBOARD_READ_ONLY' });
          return send(response, 200, dashboardPayload(user, session));
        }
        if (isStaff(user)) throw new ApiError(403, '员工账号仅可使用基础数据录入入口');
        if (dashboardHash && !session.dashboardUnlocked) throw new ApiError(403, '请先解锁业绩看板', { code: 'DASHBOARD_LOCKED' });
        if (path === '/api/anchor-review' || path.startsWith('/api/anchor-review/')) {
          if (!['admin', 'manager'].includes(user.role)) throw new ApiError(403, '仅负责人和主管可使用主播复盘');
          if (await handleAnchorReview({ path, url, request, response, user, store, send, body, canWriteNotes: true })) return;
        }
        if (await handleMonthly({ path, url, request, response, user, store, send, body })) return;
        if (path === '/api/bootstrap' && request.method === 'GET') {
          return send(response, 200, { user, demo: demoVisible(), dataset: datasetInfo(), currency: 'CNY', ...directory(store), sessions: store.list('sessions'), inventory: store.list('inventory'), tasks: store.list('tasks'), ...(user.role === 'admin' ? { users: store.users() } : {}) });
        }
        if (path === '/api/audit' && request.method === 'GET') return send(response, 200, { audit: store.audit() });
        if (await handleDirectory({ path, url, request, response, user, store, send, body })) return;
        if (path === '/api/users') {
          admin(user);
          if (request.method === 'GET') return send(response, 200, { users: store.users() });
          if (request.method === 'POST') {
            const input = await body(request); keys(input, ['username', 'password', 'name', 'role']);
            const username = text(input.username, '用户名', 80, true);
            if (!/^[A-Za-z0-9_.-]{3,80}$/.test(username)) throw new ApiError(400, '用户名须为 3–80 位字母、数字或 ._-');
            const password = text(input.password, '密码', 200, true);
            if (password.length < 12) throw new ApiError(400, '成员密码至少 12 位');
            const name = text(input.name, '姓名', 80, true);
            if (!ROLES.includes(input.role)) throw new ApiError(400, '成员角色无效');
            const created = store.createUser({ username, name, password, role: input.role });
            store.recordAudit(user, 'create', 'users', created.id, null, created);
            return send(response, 201, { user: created });
          }
        }
        if (path === '/api/export.csv' && request.method === 'GET') {
          const from = url.searchParams.get('dateFrom') || '2000-01-01'; const to = url.searchParams.get('dateTo') || '2100-12-31';
          date(from); date(to); if (from > to) throw new ApiError(400, '开始日期须早于结束日期');
          const accounts = new Map(store.list('accounts').map(item => [item.id, item.name]));
          const anchors = new Map(store.list('anchors').map(item => [item.id, item.name]));
          const accountId = url.searchParams.get('accountId') || '';
          const anchorId = url.searchParams.get('anchorId') || '';
          const status = url.searchParams.get('status') || '';
          const period = url.searchParams.get('period') || '';
          if (accountId && !accounts.has(accountId)) throw new ApiError(400, '账号筛选无效');
          if (anchorId && !anchors.has(anchorId)) throw new ApiError(400, '主播筛选无效');
          if (status && !['planned', 'live', 'completed'].includes(status)) throw new ApiError(400, '状态筛选无效');
          if (period && !PERIODS.some(item => item.id === period)) throw new ApiError(400, '场次筛选无效');
          const slots = period ? directory(store).slots : [];
          const header = [
            '场次ID', '日期', '账号', '主播', '开始', '结束', '排期时长(小时)', '实际直播时长(分钟)', '状态', '目标成交额(CNY)',
            '触达人数(本场)', '浏览量(次数)', '浏览人数(本场;跨场汇总为人次)', '曝光次数', '峰值在线人数', '平均观看时长(秒)',
            '互动次数', '心情数', '评论次数', '分享次数', '链接点击次数', '新增关注数', '私信人数', '有效询单数', '确认订单数', '确认成交额(CNY)',
            '付款订单数', '退款订单数', '净售件数', '累计回款退款前(CNY)', '累计退款(CNY)', '净回款(CNY)',
            '匹配已售商品净成本(CNY)', '广告费(CNY)', '物流(CNY)', '手续费(CNY)', '其他变动成本(CNY)',
            '变动成本合计(CNY)', '贡献利润未扣固定成本(CNY)', '成交目标达成率', '进房率(观看/触达)',
            '私信率(私信/观看)', '询单有效率(有效询单/私信)', '询单成单率(确认订单/有效询单)',
            '订单付款率(付款订单/确认订单)', '退款金额率(退款/累计回款)', '客单回款(CNY/付款订单)',
            '千次观看回款(CNY)', '每实际直播小时销售额(CNY)', '每实际直播小时回款(CNY)', '贡献利润率(贡献利润/净回款)',
            '成交广告倍数(非利润ROI)', '更新时间', '更新人', '备注',
            '原始记录状态', '场次标记', '来源工作簿', '来源工作表', '来源单元格', '导入批次', '实际开播时间(UTC+08:00)', '实际下播时间(UTC+08:00)'
          ];
          const rounded = value => Number.isFinite(value) ? +value.toFixed(4) : '';
          const ratio = (numerator, denominator) => Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0 ? rounded(numerator / denominator) : '';
          const complete = values => values.every(Number.isFinite);
          const minutes = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
          const hours = item => item.scheduleUnknown ? null : (minutes(item.end) - minutes(item.start)) / 60 + (item.endDayOffset || 0) * 24;
          const rows = store.list('sessions')
            .filter(item => item.date >= from && item.date <= to && (!accountId || item.accountId === accountId) && (!anchorId || item.anchorId === anchorId) && (!status || item.status === status))
            .filter(item => !period || resolveShiftPeriod(item, slots) === period)
            .map(item => {
              const net = complete([item.received, item.refunds]) ? item.received - item.refunds : null;
              const costParts = [item.cogs, item.adSpend, item.shipping, item.fees, item.otherCost];
              const costs = complete(costParts) ? costParts.reduce((sum, value) => sum + value, 0) : null;
              const profit = complete([net, costs]) ? net - costs : null;
              const actualHours = Number.isFinite(item.actualMinutes) ? item.actualMinutes / 60 : null;
              return [
                item.id, item.date, accounts.get(item.accountId), anchors.get(item.anchorId), item.scheduleUnknown ? '' : item.start, item.scheduleUnknown ? '' : item.end, rounded(hours(item)), item.actualMinutes ?? '', item.status, item.target,
                item.reach, item.views, item.viewers, item.impressions, item.peak, item.watchSeconds, item.interactions, item.reactions, item.comments, item.shares, item.linkClicks, item.newFollowers,
                item.messages, item.qualified, item.orders, item.orderAmount, item.paidOrders, item.refundOrders, item.units,
                item.received, item.refunds, rounded(net), item.cogs, item.adSpend, item.shipping, item.fees, item.otherCost,
                rounded(costs), rounded(profit), ratio(item.orderAmount, item.target), ratio(item.viewers, item.reach),
                ratio(item.messages, item.viewers), ratio(item.qualified, item.messages), ratio(item.orders, item.qualified),
                ratio(item.paidOrders, item.orders), ratio(item.refunds, item.received), ratio(item.received, item.paidOrders),
                ratio(Number.isFinite(item.received) ? item.received * 1000 : null, item.viewers), ratio(item.orderAmount, actualHours), ratio(item.received, actualHours), ratio(profit, net),
                ratio(item.orderAmount, item.adSpend), item.updatedAt, item.updatedBy, item.notes,
                item.sourceStatus, item.slotLabel, item.sourceWorkbook || datasetInfo().sourceFile,
                item.sourceSheet, item.sourceCell, item.importBatch, item.actualStart, item.actualEnd
              ];
            });
          response.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="live-sessions.csv"', 'Cache-Control': 'no-store' });
          return response.end('\ufeff' + [header, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n'));
        }
        const match = /^\/api\/(sessions|inventory|tasks)(?:\/([\w-]+))?$/.exec(path);
        if (match?.[1] === 'sessions' && match[2] && request.method === 'DELETE') {
          if (user.role !== 'admin') throw new ApiError(403, '仅管理员可以取消直播排期');
          const input = await body(request);
          keys(input, ['version']);
          version(input.version);
          const existing = store.get('sessions', match[2]);
          if (!existing) throw new ApiError(404, '记录不存在');
          if (existing.version !== input.version) throw new ApiError(409, '记录已更新，请重新载入场次');
          if (existing.status !== 'planned' || existing.sourceStatus === 'stopped' || hasSessionMetrics(existing)) {
            throw new ApiError(409, '仅可取消尚未播出且未录入指标的排期');
          }
          const session = store.save('sessions', { ...existing, status: 'completed', sourceStatus: 'stopped', cancelled: true }, input.version, user);
          return send(response, 200, { session });
        }
        if (match && ['POST', 'PUT'].includes(request.method)) {
          writable(user);
          const [, kind, id] = match;
          if ((request.method === 'POST' && id) || (request.method === 'PUT' && !id)) throw new ApiError(405, '请求方法不支持');
          const input = await body(request);
          const existing = id ? store.get(kind, id) : undefined;
          if (id && !existing) throw new ApiError(404, '记录不存在');
          if (id) { version(input.version); if (existing.version !== input.version) throw new ApiError(409, '其他成员已更新此记录，请刷新后再保存', { current: existing }); }
          else if (Object.hasOwn(input, 'version')) throw new ApiError(400, '新建记录不能指定 version');
          const sessions = store.list('sessions');
          let result;
          const recordId = id || randomUUID();
          if (kind === 'sessions') {
            const { slotId, ...sessionData } = input;
            const roster = directory(store);
            const { timing, ...assignment } = sessionSlotWrite(input, existing, roster);
            result = sessionInput({ ...sessionData, ...timing }, existing, roster);
            result.id = recordId;
            Object.assign(result, assignment);
            conflict(result, sessions);
            if (!existing) result.managedSchedule = true;
          }
          if (kind === 'inventory') result = inventoryInput(input, existing, sessions);
          if (kind === 'tasks') result = taskInput(input, existing, sessions);
          result.id = recordId;
          if (kind === 'inventory' && store.list(kind).some(item => item.id !== result.id && item.sku.toLowerCase() === result.sku.toLowerCase())) throw new ApiError(409, '货号已存在，每件手镯须使用唯一货号');
          const saved = store.save(kind, result, id ? input.version : undefined, user);
          return send(response, id ? 200 : 201, { [kind === 'sessions' ? 'session' : kind === 'inventory' ? 'item' : 'task']: saved });
        }
        throw new ApiError(404, '接口不存在');
      }
      if (!['GET', 'HEAD'].includes(request.method)) throw new ApiError(405, '请求方法不支持');
      if (path === '/tearoom') {
        response.writeHead(308, { Location: './tearoom/', 'Cache-Control': 'no-store' });
        return response.end();
      }
      if (path === '/entry/' || path === '/dashboard/') {
        response.writeHead(308, { Location: `..${path.slice(0, -1)}`, 'Cache-Control': 'no-store' });
        return response.end();
      }
      if (['/booking', '/booking/'].includes(path)) {
        const destination = new URL(config.bookingUrl);
        const module = url.searchParams.get('module');
        if (['rooms', 'schedule', 'admin'].includes(module)) destination.searchParams.set('module', module);
        response.writeHead(302, { Location: destination.href, 'Cache-Control': 'no-store' });
        return response.end();
      }
      const publicRoot = resolve(ROOT, 'public');
      const pages = { '/': 'index.html', '/entry': 'entry.html', '/dashboard': 'dashboard.html', '/tearoom/': 'tearoom/index.html' };
      const target = resolve(publicRoot, Object.hasOwn(pages, path) ? pages[path] : `.${path}`);
      if (target !== publicRoot && !target.startsWith(publicRoot + sep)) throw new ApiError(404, '文件不存在');
      const relativePath = target.slice(publicRoot.length).split(sep).join('/');
      const assistantAsset = /^\/tearoom\/assistant\.(html|js|css)$/i.test(relativePath);
      const tearoomIndex = relativePath.toLowerCase() === '/tearoom/index.html';
      const showAssistant = (assistantAsset || tearoomIndex) && assistantAllowed(readSession(request, ACCOUNT_COOKIE)?.user);
      if (assistantAsset && !showAssistant) return send(response, 404, { error: 'AI 助手暂未开放' });
      let metadata;
      try { metadata = await stat(target); } catch { throw new ApiError(404, '文件不存在'); }
      if (!metadata.isFile()) throw new ApiError(404, '文件不存在');
      let content = await readFile(target);
      if (tearoomIndex && showAssistant) {
        const link = '<a class="training-link" href="./assistant.html">AI 助手 <span>翻译与话术润色</span></a>';
        content = content.toString('utf8').replace('<!-- assistant-entry -->', link);
      }
      const versionedTearoomAsset = /^\/tearoom\/[a-z-]+\.(js|css)$/.test(path)
        && /^[0-9]{8}-[a-z0-9-]+$/.test(url.searchParams.get('v') || '');
      response.writeHead(200, {
        'Content-Type': MIME[extname(target)] || 'application/octet-stream',
        'Cache-Control': (tearoomIndex || assistantAsset) && assistantAccess === 'pilot'
          ? 'private, no-store' : versionedTearoomAsset ? 'public, max-age=86400' : 'no-cache'
      });
      response.end(request.method === 'HEAD' ? undefined : content);
    } catch (error) {
      if (response.headersSent) return response.end();
      const status = error instanceof ApiError ? error.status : 500;
      if (status === 500) console.error(error);
      if (request.url?.startsWith('/api/entry/')) {
        return send(response, status, { error: status === 500 ? '服务处理失败，请稍后再试' : error.message, ...error.details });
      }
      const safeErrorDataset = safeDataset(datasetInfo());
      send(response, status, { error: status === 500 ? '服务处理失败，请稍后再试' : error.message, ...(error.details || {}), demo: demoVisible(), dataset: safeErrorDataset });
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  return { server, store, config, listen: () => new Promise(resolveListen => server.listen(config.port, config.host, () => resolveListen(server.address()))), close: () => new Promise(resolveClose => { server.close(() => { store.close(); resolveClose(); }); server.closeIdleConnections(); }) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const app = createApplication();
    await app.listen();
    console.log(`直播作战指挥中心 ${app.config.demo ? '[演示数据]' : '[正式模式]'} http://${app.config.host}:${app.server.address().port}`);
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await app.close(); process.exit(0); });
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
