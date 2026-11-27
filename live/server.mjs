import http from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { resolve, dirname, extname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Store, passwordHash, passwordMatches, publicUser } from './lib/store.mjs';
import { ApiError, keys, text, date, version, countFields, sessionInput, inventoryInput, taskInput, conflict } from './lib/validation.mjs';
import { ROLES, PUBLIC_ENTRY_USER, isStaff, safeDataset, safeEntrySession, entryDirectory, entryInput, duplicateEntry } from './lib/entry.mjs';
import { chinaDate } from './lib/seed.mjs';
import { handleMonthly } from './lib/monthly.mjs';
import { createTearoom } from './lib/tearoom.mjs';
import { jadeGuideScripts } from './lib/tearoom-jade-guide.mjs';

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
  'id', 'date', 'accountId', 'anchorId', 'slotId', 'slotLabel', 'sourceStatus',
  'status', 'start', 'end', 'scheduleUnknown', 'actualMinutes', 'target', 'orderAmount',
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
  const bookingUrl = new URL(env.BOOKING_URL || 'http://127.0.0.1:3000/');
  if (!['http:', 'https:'].includes(bookingUrl.protocol) || bookingUrl.username || bookingUrl.password) {
    throw new Error('BOOKING_URL 须为不含登录信息的 HTTP 或 HTTPS 地址。');
  }
  return { demo: !production, mode: env.PREVIEW_IMPORT === 'true' ? 'imported' : production ? 'production' : 'demo', production, host, port, dataDir: resolve(env.DATA_DIR || resolve(ROOT, 'data')), adminPassword: env.ADMIN_PASSWORD, adminUsername: env.ADMIN_USERNAME, adminName: env.ADMIN_NAME, cookieSecure: env.COOKIE_SECURE === 'true', dashboardPassword, bookingUrl };
}

async function body(request) {
  if (!(request.headers['content-type'] || '').startsWith('application/json')) throw new ApiError(415, '请使用 application/json');
  const chunks = []; let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > 64 * 1024) throw new ApiError(413, '单次录入内容过大');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new ApiError(400, 'JSON 格式无效'); }
}

export function createApplication(options = {}) {
  const config = { ...configuration(), ...options };
  const store = new Store(options.dbPath || resolve(config.dataDir, 'command-center.sqlite'), config);
  const handleTearoom = createTearoom({
    store, cookieSecure: config.cookieSecure, seedScripts: [...tearoomStarterScripts, ...jadeGuideScripts]
  });
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
    return { ...accessPayload(user, session), currency: 'CNY', accounts, anchors, sessions };
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
        if (await handleTearoom({
          path, request, response, send, body,
          getAdmin: () => readSession(request, ACCOUNT_COOKIE)?.user.role === 'admin'
        })) return;
        if (path === '/api/entry/bootstrap' && request.method === 'GET') {
          const user = entryUser(request);
          const selectedDate = date(url.searchParams.get('date') || chinaDate());
          return send(response, 200, { user, dataset: safeDataset(datasetInfo()), ...entryDirectory(store), sessions: store.list('sessions').filter(item => item.date === selectedDate).map(item => safeEntrySession(item, user)) });
        }
        const entryMatch = /^\/api\/entry\/sessions(?:\/([\w-]+))?$/.exec(path);
        if (entryMatch && ['POST', 'PUT'].includes(request.method)) {
          const user = entryUser(request);
          entryWritable(user, request);
          const id = entryMatch[1];
          if ((request.method === 'POST' && id) || (request.method === 'PUT' && !id)) throw new ApiError(405, '请求方法不支持');
          const input = await body(request);
          const existing = id ? store.get('sessions', id) : undefined;
          if (id && !existing) throw new ApiError(404, '记录不存在');
          if (id) {
            version(input.version);
            if (input.version !== existing.version) throw new ApiError(409, '其他成员已更新此记录，请刷新后再保存', { current: safeEntrySession(existing, user) });
          }
          const known = { accounts: store.list('accounts'), anchors: store.list('anchors'), entryAnchors: entryDirectory(store).anchors };
          const result = entryInput(input, existing, user, known);
          result.id = id || randomUUID();
          if (!id) {
            const duplicate = duplicateEntry(result, store.list('sessions'), known.anchors);
            if (duplicate) throw new ApiError(409, '该日期、直播间和场次已有记录，请刷新后填写', { current: safeEntrySession(duplicate, user) });
          }
          let saved;
          try {
            saved = store.save('sessions', result, id ? input.version : undefined, user);
          } catch (error) {
            if (error instanceof ApiError && error.status === 409 && error.details?.current) {
              throw new ApiError(409, error.message, { current: safeEntrySession(error.details.current, user) });
            }
            throw error;
          }
          return send(response, id ? 200 : 201, { session: safeEntrySession(saved, user) });
        }
        const { user, session, token, cookieName } = requireSession(request, request.headers['x-command-scope']);
        if (path === '/api/me' && request.method === 'GET') return send(response, 200, accessPayload(user, session));
        if (path === '/api/logout' && request.method === 'POST') {
          logins.delete(token);
          return send(response, 200, { ok: true }, { 'Set-Cookie': cookie(cookieName, '', 0) });
        }
        if (session.dashboardOnly) {
          if (path !== '/api/bootstrap' || request.method !== 'GET') throw new ApiError(403, '业绩看板仅提供数据查看', { code: 'DASHBOARD_READ_ONLY' });
          return send(response, 200, dashboardPayload(user, session));
        }
        if (isStaff(user)) throw new ApiError(403, '员工账号仅可使用基础数据录入入口');
        if (dashboardHash && !session.dashboardUnlocked) throw new ApiError(403, '请先解锁业绩看板', { code: 'DASHBOARD_LOCKED' });
        if (await handleMonthly({ path, url, request, response, user, store, send, body })) return;
        if (path === '/api/bootstrap' && request.method === 'GET') {
          return send(response, 200, { user, demo: demoVisible(), dataset: datasetInfo(), currency: 'CNY', accounts: store.list('accounts'), anchors: store.list('anchors'), sessions: store.list('sessions'), inventory: store.list('inventory'), tasks: store.list('tasks'), ...(user.role === 'admin' ? { users: store.users() } : {}) });
        }
        if (path === '/api/audit' && request.method === 'GET') return send(response, 200, { audit: store.audit() });
        const directoryMatch = /^\/api\/(accounts|anchors)\/([\w-]+)$/.exec(path);
        if (directoryMatch && request.method === 'PUT') {
          admin(user);
          const [, kind, id] = directoryMatch;
          const existing = store.get(kind, id);
          if (!existing) throw new ApiError(404, '记录不存在');
          const input = await body(request);
          keys(input, kind === 'accounts' ? ['name', 'page', 'color', 'version'] : ['name', 'version']);
          version(input.version);
          const next = { ...existing, name: text(input.name ?? existing.name, '名称', 120, true) };
          if (kind === 'accounts') {
            next.page = text(input.page ?? existing.page, 'Facebook 页面', 300);
            next.color = input.color ?? existing.color;
            if (!/^#[0-9a-fA-F]{6}$/.test(next.color)) throw new ApiError(400, '账号颜色须为六位十六进制色值');
          }
          if (store.list(kind).some(item => item.id !== id && item.name === next.name)) throw new ApiError(409, '名称已存在');
          return send(response, 200, { [kind === 'accounts' ? 'account' : 'anchor']: store.save(kind, next, input.version, user) });
        }
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
          if (accountId && !accounts.has(accountId)) throw new ApiError(400, '账号筛选无效');
          if (anchorId && !anchors.has(anchorId)) throw new ApiError(400, '主播筛选无效');
          if (status && !['planned', 'live', 'completed'].includes(status)) throw new ApiError(400, '状态筛选无效');
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
          const hours = item => item.scheduleUnknown ? null : (Number(item.end.slice(0, 2)) * 60 + Number(item.end.slice(3)) - Number(item.start.slice(0, 2)) * 60 - Number(item.start.slice(3))) / 60;
          const rows = store.list('sessions')
            .filter(item => item.date >= from && item.date <= to && (!accountId || item.accountId === accountId) && (!anchorId || item.anchorId === anchorId) && (!status || item.status === status))
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
          if (kind === 'sessions') result = sessionInput(input, existing, { accounts: store.list('accounts'), anchors: store.list('anchors') });
          if (kind === 'inventory') result = inventoryInput(input, existing, sessions);
          if (kind === 'tasks') result = taskInput(input, existing, sessions);
          result.id = id || randomUUID();
          if (kind === 'sessions') conflict(result, sessions);
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
      let metadata;
      try { metadata = await stat(target); } catch { throw new ApiError(404, '文件不存在'); }
      if (!metadata.isFile()) throw new ApiError(404, '文件不存在');
      const content = await readFile(target);
      const versionedTearoomAsset = ['/tearoom/app.js', '/tearoom/styles.css'].includes(path)
        && url.searchParams.get('v') === '20261127-response';
      response.writeHead(200, {
        'Content-Type': MIME[extname(target)] || 'application/octet-stream',
        'Cache-Control': versionedTearoomAsset ? 'public, max-age=86400' : 'no-cache'
      });
      response.end(request.method === 'HEAD' ? undefined : content);
    } catch (error) {
      if (response.headersSent) return response.end();
      const status = error instanceof ApiError ? error.status : 500;
      if (status === 500) console.error(error);
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
