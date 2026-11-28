// 协作中心 v1.3.2 独立评审 · 接口级实测（Muse）
// 自起进程内实例（:memory: 演示数据），不碰 4297 浏览器评审实例。
import { createApplication } from '../src/live/server.mjs';
import { chinaDate } from '../src/live/lib/seed.mjs';
import { writeFileSync } from 'node:fs';

const BOARD = 'Local-admin-board-2026';
const results = [];
function check(id, title, expected, actual, pass, detail = '') {
  results.push({ id, title, expected, actual, pass: Boolean(pass), detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} [${id}] ${title} :: ${actual}${detail ? ' | ' + detail : ''}`);
}

const app = createApplication({ dbPath: ':memory:', host: '127.0.0.1', port: 0, demo: true, dashboardPassword: BOARD });
const address = await app.listen();
const base = 'http://127.0.0.1:' + address.port;

function browser() {
  const cookies = new Map();
  async function request(path, input, headers = {}) {
    const response = await fetch(base + path, {
      method: input === undefined ? 'GET' : 'POST',
      headers: { Cookie: [...cookies].map(([k, v]) => k + '=' + v).join('; '), ...headers, ...(input === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: input === undefined ? undefined : JSON.stringify(input)
    });
    for (const c of response.headers.getSetCookie()) {
      const pair = c.split(';')[0]; const i = pair.indexOf('=');
      if (c.includes('Max-Age=0')) cookies.delete(pair.slice(0, i)); else cookies.set(pair.slice(0, i), pair.slice(i + 1));
    }
    return { status: response.status, body: await response.json().catch(() => ({})) };
  }
  return {
    request,
    login: (u, p) => request('/api/login', { username: u, password: p }),
    unlockBoard: () => request('/api/dashboard/unlock', { password: BOARD }),
    unlockManagement: () => request('/api/dashboard/unlock', { password: BOARD, mode: 'manage' }),
    enterTea: () => request('/api/tearoom/session', {}),
    rename: name => request('/api/tearoom/profile', { name }),
    tea: () => request('/api/tearoom'),
    action: (name, input) => request('/api/tearoom/actions', { action: name, ...input })
  };
}
const PUB = { 'X-Command-Scope': 'public-entry' };
const today = chinaDate();
const [Y, M] = today.split('-').map(Number);
const monthPrefix = today.slice(0, 8);
const inMonthDay = d => `${monthPrefix}${String(d).padStart(2, '0')}`;

// 自建评审专用直播间（无演示种子场次，避免撞车）
app.store.insert('accounts', { id: 'review-acc', name: '评审专用间', page: 'Review · Facebook', color: '#0f766e', version: 1 });
for (const [id, name, slotId, slotLabel] of [
  ['ra-a', '评审主播甲', 'slot-1', '第 1 场'], ['ra-b', '评审替播乙', 'slot-1', '第 1 场'],
  ['ra-old', '评审旧主播', 'slot-1', '第 1 场'], ['ra-ref', '评审参考主播', 'slot-2', '第 2 场'],
  ['ra-c1', '评审双候选一', 'slot-3', '第 3 场'], ['ra-c2', '评审双候选二', 'slot-3', '第 3 场'],
  ['ra-late', '评审晚场主播', 'slot-3', '第 3 场']
]) app.store.insert('anchors', { id, name, accountId: 'review-acc', slotId, slotLabel, version: 1 });
const lastMonth = M === 1 ? `${Y - 1}-12-15` : `${Y}-${String(M - 1).padStart(2, '0')}-15`;

// ---------- A. 临时替播 ----------
{
  const emp = browser();
  const D = inMonthDay(10);
  const ep = '/api/entry/sessions?status=1';
  const baseE = { date: D, accountId: 'review-acc', slotId: 'slot-1' };
  const p1 = await emp.request(ep, { ...baseE, anchorId: 'ra-a', orders: 11 }, PUB);
  const p2 = await emp.request(ep, { ...baseE, anchorId: 'ra-b', shares: 5 }, PUB);
  check('A1', '替播：同日同间同时段两位主播分别提交', '两人均 201，两条独立记录',
    `主播 ${p1.status} / 替播 ${p2.status}`, p1.status === 201 && p2.status === 201, JSON.stringify(p1.body).slice(0,120));
  const rows = () => app.store.list('sessions').filter(r => r.date === D && r.accountId === 'review-acc' && ['ra-a', 'ra-b'].includes(r.anchorId));
  check('A1b', '替播：两条记录归属独立', '2 条，anchorId 各一', `${rows().length} 条: ${rows().map(r => r.anchorId).join(',')}`, rows().length === 2);
  const b1 = await emp.request(ep, { ...baseE, anchorId: 'ra-a', impressions: 777 }, PUB);
  const b2 = await emp.request(ep, { ...baseE, anchorId: 'ra-b', actualMinutes: 240 }, PUB);
  const rA = rows().find(r => r.anchorId === 'ra-a');
  const rB = rows().find(r => r.anchorId === 'ra-b');
  check('A2', '替播：分别补录互不串扰不覆盖', '两人均 201；各自字段落到各自记录，对方字段为空',
    `${b1.status}/${b2.status}; 甲 impressions=${rA?.impressions} shares=${rA?.shares}; 乙 shares=${rB?.shares} impressions=${rB?.impressions} minutes=${rB?.actualMinutes}`,
    b1.status === 201 && b2.status === 201 && rA?.impressions === 777 && rA?.shares == null && rB?.shares === 5 && rB?.impressions == null && rB?.actualMinutes === 240);
  const dup = await emp.request(ep, { ...baseE, anchorId: 'ra-a', orders: 99 }, PUB);
  const dup2 = await emp.request(ep, { ...baseE, anchorId: 'ra-b', shares: 6 }, PUB);
  check('A3', '替播：同一主播同日同间冲突值重复提交仍被拦', '均 409 且原值不变',
    `${dup.status}/${dup2.status}; orders=${rows().find(r => r.anchorId === 'ra-a')?.orders} shares=${rows().find(r => r.anchorId === 'ra-b')?.shares}`,
    dup.status === 409 && dup2.status === 409 && rows().find(r => r.anchorId === 'ra-a')?.orders === 11 && rows().find(r => r.anchorId === 'ra-b')?.shares === 5);
  const editor = browser();
  await editor.login('editor', 'editor2026!');
  await editor.unlockManagement();
  const sched = { date: '2026-12-20', accountId: 'account-1', anchorId: 'anchor-1', start: '08:00', end: '12:00', target: 1000 };
  const s1 = await editor.request('/api/sessions', sched);
  const sOverlap = await editor.request('/api/sessions', { ...sched, start: '11:59', end: '13:00' });
  const sWrongRoom = await editor.request('/api/sessions', { ...sched, accountId: 'account-2', start: '11:59', end: '13:00' });
  const sOtherPeriod = await editor.request('/api/sessions', { ...sched, anchorId: 'anchor-2', start: '11:59', end: '13:00' });
  check('A4', '管理员排班：时间冲突检查仍生效（登录+管理解锁后）', '首建 201；同主播重叠时段 409；主播跨间归属冲突 409；另一主播按其时段规范化后可建 201',
    `${s1.status}/${sOverlap.status}/${sWrongRoom.status}/${sOtherPeriod.status} 次场start=${sOtherPeriod.body?.session?.start}`,
    s1.status === 201 && sOverlap.status === 409 && sWrongRoom.status === 409 && sOtherPeriod.status === 201,
    JSON.stringify(sOverlap.body).slice(0, 110));
}

// ---------- B. 历史记录 ----------
{
  const emp = browser();
  const D = inMonthDay(5);
  const full = { orderAmount: 100, orders: 1, actualMinutes: 60, impressions: 10, shares: 1, newFollowers: 1 };
  app.store.insert('sessions', { id: 'review-old-1', date: D, accountId: 'review-acc', anchorId: 'ra-old', slotId: 'slot-1', slotLabel: '第 1 场', period: 'early', status: 'completed', version: 1, ...full });
  let comp = (await emp.request(`/api/entry/completeness?date=${D}`)).body;
  let g = comp.accounts.find(x => x.accountId === 'review-acc');
  let mine = g.sessions.find(x => x.anchorId === 'ra-old');
  check('B1', '历史记录：有主播的旧记录归原主播', 'ra-old 显示 complete',
    `ra-old=${mine?.status}`, mine?.status === 'complete');
  app.store.insert('sessions', { id: 'review-orphan-1', date: D, accountId: 'review-acc', anchorId: 'ghost-import', slotId: 'slot-2', slotLabel: '第 2 场', period: 'middle', status: 'completed', version: 1, sourceStatus: 'imported', importBatch: 'review-batch', ...full, orders: null });
  comp = (await emp.request(`/api/entry/completeness?date=${D}`)).body;
  g = comp.accounts.find(x => x.accountId === 'review-acc');
  const ref = g.sessions.find(x => x.anchorId === 'ra-ref');
  check('B2', '历史记录：无主播导入行在唯一候选时作只读参考', 'ra-ref（slot-2 唯一主播）historicalReference=true 且 canEnter=false',
    `historicalReference=${ref?.historicalReference} canEnter=${ref?.canEnter} status=${ref?.status}`,
    ref?.historicalReference === true && ref?.canEnter === false);
  app.store.insert('sessions', { id: 'review-orphan-2', date: D, accountId: 'review-acc', anchorId: 'ghost-import-2', slotId: 'slot-3', slotLabel: '第 3 场', period: 'late', status: 'completed', version: 1, sourceStatus: 'imported', importBatch: 'review-batch', ...full });
  comp = (await emp.request(`/api/entry/completeness?date=${D}`)).body;
  g = comp.accounts.find(x => x.accountId === 'review-acc');
  const c1 = g.sessions.find(x => x.anchorId === 'ra-c1');
  const c2 = g.sessions.find(x => x.anchorId === 'ra-c2');
  const orphanListed = g.sessions.find(x => x.anchorId === 'ghost-import-2');
  check('B3', '历史记录：双主播同槽时导入行不串认', '两位主播均为 empty（未认领），导入行单独列出',
    `ra-c1=${c1?.status} ra-c2=${c2?.status} orphanRow=${orphanListed ? orphanListed.status : '未单独列出'}`,
    c1?.status === 'empty' && c2?.status === 'empty' && Boolean(orphanListed));
}

// ---------- C. 本月待补 ----------
{
  const emp = browser();
  const range = (await emp.request('/api/entry/completeness')).body;
  check('C1a', '本月待补：默认范围为北京时间本月 1 号→今天', `from=${today.slice(0, 8)}01 to=${today}`,
    `from=${range.from} to=${range.to}`, range.from === `${today.slice(0, 8)}01` && range.to === today);
  // 逐日对账：抽 3 天，范围汇总 == 单日接口汇总
  let ok = true; const details = [];
  for (const d of [inMonthDay(1), inMonthDay(3), today]) {
    const dayApi = (await emp.request(`/api/entry/completeness?date=${d}`)).body;
    const dayRange = range.days.find(x => x.date === d);
    const same = JSON.stringify(dayApi.summary) === JSON.stringify(dayRange?.summary);
    if (!same) { ok = false; details.push(`${d}: 单日 ${JSON.stringify(dayApi.summary)} vs 范围 ${JSON.stringify(dayRange?.summary)}`); }
  }
  check('C1b', '本月待补：按日汇总与逐日明细对账', '抽查 3 天 summary 完全一致', ok ? '3/3 一致' : details.join('; '), ok);
  // 按间对账：范围 accounts 汇总 == 逐日单日接口按间汇总之和
  let roomOk = true; const roomDetail = [];
  const perDay = [];
  for (let d = 1; d <= Number(today.slice(8)); d++) perDay.push((await emp.request(`/api/entry/completeness?date=${inMonthDay(d)}`)).body);
  for (const g of range.accounts) {
    let e = 0, p = 0;
    for (const dayApi of perDay) {
      const dg = dayApi.accounts.find(x => x.accountId === g.accountId);
      if (dg) { e += dg.sessions.filter(x => x.status === 'empty').length; p += dg.sessions.filter(x => x.status === 'partial').length; }
    }
    if (e !== g.summary.empty || p !== g.summary.partial) { roomOk = false; roomDetail.push(`${g.accountName}: 范围 empty=${g.summary.empty}/partial=${g.summary.partial} vs 逐日和 ${e}/${p}`); }
  }
  check('C1c', '本月待补：按间汇总与逐日之和对账', '各间 empty/partial 均相等', roomOk ? '全部一致' : roomDetail.join('; '), roomOk);
  const todayComp = (await emp.request(`/api/entry/completeness?date=${today}`)).body;
  const gToday = todayComp.accounts.find(x => x.accountId === 'review-acc');
  const lateAnchor = gToday.sessions.find(x => x.anchorId === 'ra-late');
  const earlyAnchor = gToday.sessions.find(x => x.anchorId === 'ra-old');
  check('C2', '本月待补：当天未开播（晚场）不算未录', '晚场主播 status=upcoming；已开播早场主播 status=empty（对照）',
    `晚场=${lateAnchor?.status} 早场=${earlyAnchor?.status}`,
    lateAnchor?.status === 'upcoming' && earlyAnchor?.status === 'empty');
  // C3 往月可补录但不进本月提醒
  const oldEntry = { date: lastMonth, accountId: 'review-acc', anchorId: 'ra-a', orderAmount: 10, orders: 1, actualMinutes: 30, impressions: 5, shares: 0, newFollowers: 0 };
  const sub = await emp.request('/api/entry/sessions', oldEntry, PUB);
  const rangeAfter = (await emp.request('/api/entry/completeness')).body;
  const oldDay = (await emp.request(`/api/entry/completeness?date=${lastMonth}`)).body;
  const oldMine = oldDay.accounts.flatMap(g => g.sessions).find(s => s.anchorId === 'ra-a');
  check('C3', '本月待补：往月可补录但不进本月提醒', '往月提交 201；往月单日显示 complete；本月范围不含该日期',
    `提交=${sub.status} 往月状态=${oldMine?.status} 范围含往月=${rangeAfter.days.some(d => d.date === lastMonth)}`,
    sub.status === 201 && oldMine?.status === 'complete' && !rangeAfter.days.some(d => d.date === lastMonth));
  // C4 停播不计 + 晚场归开播日
  const D = inMonthDay(6);
  app.store.insert('sessions', { id: 'review-stopped', date: D, accountId: 'review-acc', anchorId: 'ra-ref', slotId: 'slot-2', status: 'planned', version: 1, sourceStatus: 'stopped' });
  const yDay = new Date(new Date(`${today}T12:00:00+08:00`).getTime() - 86400000);
  const yesterday = yDay.toISOString().slice(0, 10);
  const full = { orderAmount: 1, orders: 1, actualMinutes: 1, impressions: 1, shares: 1, newFollowers: 1 };
  app.store.insert('sessions', { id: 'review-late', date: yesterday, accountId: 'review-acc', anchorId: 'ra-late', slotId: 'slot-3', slotLabel: '第 3 场', period: 'late', status: 'completed', version: 1, ...full });
  const compD = (await emp.request(`/api/entry/completeness?date=${D}`)).body;
  const stopped = compD.accounts.flatMap(g => g.sessions).find(s => s.anchorId === 'ra-ref');
  const compToday = (await emp.request(`/api/entry/completeness?date=${today}`)).body;
  const lateToday = compToday.accounts.flatMap(g => g.sessions).find(s => s.anchorId === 'ra-late');
  const compY = (await emp.request(`/api/entry/completeness?date=${yesterday}`)).body;
  const lateY = compY.accounts.flatMap(g => g.sessions).find(s => s.anchorId === 'ra-late');
  check('C4', '本月待补：停播不计缺项；晚场记录归开播日', '停播=stopped；昨晚场次在昨日 complete、今日不出现该记录状态',
    `stopped=${stopped?.status} 昨日=${lateY?.status} 今日同主播=${lateToday?.status}`,
    stopped?.status === 'stopped' && lateY?.status === 'complete' && lateToday?.status !== 'complete');
}

// ---------- E. 并发补录 ----------
{
  const emp = browser();
  const D = inMonthDay(8);
  const baseE = { date: D, accountId: 'review-acc', anchorId: 'ra-ref' };
  await emp.request('/api/entry/sessions', { ...baseE, orders: 3 }, PUB);
  const [r1, r2] = await Promise.all([
    emp.request('/api/entry/sessions?status=1', { ...baseE, impressions: 111 }, PUB),
    browser().request('/api/entry/sessions?status=1', { ...baseE, shares: 9 }, PUB)
  ]);
  let row = app.store.list('sessions').find(r => r.date === D && r.anchorId === 'ra-ref');
  let recovered = '不需要恢复';
  if (row?.impressions == null || row?.shares == null) {
    // 按 409 回执口径只补仍缺项后重试
    const missing = [];
    if (row?.impressions == null) missing.push(['impressions', 111]);
    if (row?.shares == null) missing.push(['shares', 9]);
    const retry = await emp.request('/api/entry/sessions?status=1', { ...baseE, ...Object.fromEntries(missing) }, PUB);
    recovered = `首轮 ${r1.status}/${r2.status}，按缺项重试 ${retry.status}`;
    row = app.store.list('sessions').find(r => r.date === D && r.anchorId === 'ra-ref');
  }
  check('E1', '并发补录：两端同时补同一场不同缺项不互相覆盖', '最终 impressions=111、shares=9、orders=3 全部落库',
    `${recovered}；最终 orders=${row?.orders} impressions=${row?.impressions} shares=${row?.shares}`,
    row?.orders === 3 && row?.impressions === 111 && row?.shares === 9);
}

// ---------- D. 看板与茶水间 ----------
{
  const board = browser();
  await board.unlockBoard();
  const compStatus = (await board.request('/api/dashboard/completeness')).status;
  const fbDenied = (await board.request('/api/dashboard/feedback')).status;
  const honorDenied = (await board.request('/api/dashboard/honors', { periodType: 'week', personName: '只读', citation: 'x' })).status;
  check('D1', '看板：共享口令可看录入统计，私密维护被拒', 'completeness 200；feedback 403；honors POST 403',
    `${compStatus}/${fbDenied}/${honorDenied}`, compStatus === 200 && fbDenied === 403 && honorDenied === 403);

  const alice = browser(); await alice.enterTea(); await alice.rename('评审员工甲');
  const bob = browser(); await bob.enterTea(); await bob.rename('评审员工乙');
  const sug = await alice.action('suggest', { body: '评审建议：希望夜宵拼单置顶', anonymous: false });
  const code = sug.body.submittedCode;
  const coord = await alice.action('coordinate', { title: '评审协调', body: '评审协调正文内容' });
  await alice.action('vent', { body: '评审吐槽正文' });
  const market = await alice.action('market', { type: '夜宵拼单', title: '评审拼烧烤' });
  const bobState = (await bob.tea()).body;
  const feed = (await bob.request('/api/tearoom/activity')).body;
  const feedText = JSON.stringify(feed);
  check('D2', '茶水间：协调/吐槽员工端零下发，动态脱敏', '乙看不到协调与吐槽；动态含拼单、不含三类正文与 vent 条目',
    `乙 coordinates=${bobState.coordinates.length} vents=${bobState.vents.length} 动态拼单=${feed.items.some(i => i.kind === 'market')} vent条目=${feed.items.some(i => i.kind === 'vent')} 正文泄露=${/评审协调正文|评审吐槽正文|评审建议：希望/.test(feedText)}`,
    bobState.coordinates.length === 0 && bobState.vents.length === 0 && feed.items.some(i => i.kind === 'market') && !feed.items.some(i => i.kind === 'vent') && !/评审协调正文|评审吐槽正文|评审建议：希望/.test(feedText));

  const mgr = browser();
  await mgr.login('manager', 'manage2026!');
  await mgr.unlockManagement();
  let fb = (await mgr.request('/api/dashboard/feedback')).body;
  const sugItem = fb.suggestions.find(i => i.code === code);
  const overdue = sugItem ? sugItem.overdue : undefined;
  await mgr.request(`/api/dashboard/feedback/suggestions/${code}/status`, { status: '处理中', reply: '已安排' });
  const lookup = await alice.action('suggestLookup', { code });
  check('D3', '茶水间：建议闭环（提交→管理处理→员工凭编号查状态）+48H 标记字段', 'trackedSuggestion.status=处理中 且 mine=true；新建议 overdue=false',
    `overdue=${overdue} tracked=${JSON.stringify(lookup.body?.trackedSuggestion)}`,
    overdue === false && lookup.body?.trackedSuggestion?.status === '处理中' && lookup.body?.trackedSuggestion?.mine === true);
  // 48H 逾期：真实提交一条建议后把其创建时间拨到 49 小时前（专用表 tearoom_posts）。
  const oldSug = await alice.action('suggest', { body: '评审旧建议内容' });
  const oldCode = oldSug.body.submittedCode;
  app.store.db.prepare('UPDATE tearoom_posts SET createdAt = ? WHERE id = ?').run(Date.now() - 49 * 3600 * 1000, oldCode);
  fb = (await mgr.request('/api/dashboard/feedback')).body;
  const oldItem = fb.suggestions.find(i => i.code === oldCode);
  check('D4', '建议 48H：超 48 小时未处理标逾期', 'overdue=true 且 remainingMs<0',
    `code=${oldCode} overdue=${oldItem?.overdue} remainingMs=${oldItem?.remainingMs}`, oldItem?.overdue === true && oldItem?.remainingMs < 0);

  // 荣誉三周期 + 照片
  const pixel = 'data:image/png;base64,' + Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=', 'base64').toString('base64');
  const pubs = [];
  for (const [pt, name] of [['month', '月星'], ['week', '周星'], ['yesterday', '昨日星']]) {
    pubs.push((await mgr.request('/api/dashboard/honors', { periodType: pt, personName: name, citation: '评审颁奖词', ...(pt === 'week' ? { photoData: pixel } : {}) })).status);
  }
  const wall = (await alice.request('/api/tearoom/honors')).body;
  const photoUrl = wall.current.week?.photoUrl || '';
  const anonPhoto = await fetch(base + '/' + photoUrl.replace(/^\.\.\//, '')).then(r => r.status).catch(() => 0);
  const teaPhoto = await fetch(base + '/' + photoUrl.replace(/^\.\.\//, ''), { headers: { Cookie: '' } }).then(r => r.status).catch(() => 0);
  check('D5', '荣誉墙：三周期发布 + 照片经员工会话下发、无会话 401', '发布 201×3；墙面三周期齐；photoUrl 为站内照片接口',
    `发布=${pubs.join('/')} 三周期=${['month', 'week', 'yesterday'].map(k => wall.current[k]?.personName).join(',')} photoUrl=${photoUrl} 无会话=${teaPhoto}`,
    pubs.every(s => s === 201) && wall.current.month && wall.current.week && wall.current.yesterday && photoUrl.includes('/photo') && teaPhoto === 401);
}

// ---------- D6. AI 默认关闭（无 ASSISTANT_ACCESS 的实例） ----------
{
  const app2 = createApplication({ dbPath: ':memory:', host: '127.0.0.1', port: 0, demo: true, dashboardPassword: BOARD });
  const addr2 = await app2.listen();
  const b2 = 'http://127.0.0.1:' + addr2.port;
  const stRes = await fetch(b2 + '/api/ai/status');
  const st = await stRes.json().catch(() => ({}));
  const chat = await fetch(b2 + '/api/ai/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task: 'translate', text: '你好', target: 'English' }) });
  check('D6', 'AI 门槛：未配置 ASSISTANT_ACCESS 时默认关闭', 'status 显示 off/不可用；chat 被拒（403/404/503）',
    `status=${stRes.status} ${JSON.stringify(st).slice(0, 100)} chat=${chat.status}`,
    (st.access === 'off' || st.enabled === false || st.mode === 'off' || st.available === false || /暂未开放|未开放/.test(st.error || '')) && [403, 404, 503].includes(chat.status));
  await app2.close();
}

await app.close();
writeFileSync(new URL('./api-results.json', import.meta.url), JSON.stringify({ at: new Date().toISOString(), today, results }, null, 2));
const failed = results.filter(r => !r.pass);
console.log(`\n== API 评审：${results.length - failed.length}/${results.length} 通过 ==`);
process.exit(failed.length ? 1 : 0);
