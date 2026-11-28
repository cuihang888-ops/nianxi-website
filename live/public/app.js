import { totals, change, decomposeSales } from './metrics.js?v=20261127-impressions';
import { renderImported } from './imported-view.js?v=20261127-impressions';
import { setupMonthly, monthlyPage } from './monthly.js';
import { beijingToday, lastCompletedDay, renderDailySales } from './daily-board.js?v=20261128-monthly-completeness';
import { renderSessionDetails } from './session-details.js?v=20261127-v130';
import { setupAnchorReview } from './anchor-review.js?v=20261127-v12';
import { setupDirectory } from './directory.js?v=20261127-v130';
import { setupDepartmentGoals } from './department-goals.js?v=20261127-goals';
import { setupFeedback } from './feedback.js?v=20261128-monthly-completeness';
import { PERIODS, resolveShiftPeriod } from './shift-periods.js?v=20261127-comparison';
const $ = (s, root = document) => root.querySelector(s);
const root = $('#app');
const dialog = $('#editor');
const search = new URLSearchParams(location.search);
const manage = search.get('mode') === 'manage';
const requestedView = search.get('view');
const initialView = manage && ['monthly', 'directory', 'feedback'].includes(requestedView) ? requestedView
  : ['anchor-review', 'completeness'].includes(requestedView) ? requestedView : 'daily';
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const state = { data: null, view: initialView, dailyDate: '', dailyMetric: 'orderAmount', date: today, from: today, to: today, account: '', anchor: '', status: '', group: 'account', sort: 'orderAmount', direction: -1, scheduleMode: 'grid', inventoryFilter: '', query: '', taskFilter: '', loadedAt: '', audit: [], periodEnd: today, windowDays: 5, performanceGroup: 'anchor', performanceMetric: 'orderAmount', selectedPerformer: '', trendMetric: 'orderAmount' };
const num = n => Number(n) || 0;
const sum = (rows, key) => rows.reduce((a, x) => a + num(x[key]), 0);
const fmt = (n, digits = 0) => num(n).toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const money = n => `¥${fmt(n)}`;
const rate = (a, b) => b > 0 ? `${fmt(a / b * 100, 1)}%` : '—';
const ratio = (a, b) => b > 0 ? `${fmt(a / b, 2)}×` : '—';
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = (name, extra = '') => `<i data-lucide="${name}" ${extra}></i>`;
const dateLabel = date => new Date(`${date}T12:00:00+08:00`).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long', timeZone: 'Asia/Shanghai' });
const shiftDate = (value, days) => { const d = new Date(`${value}T12:00:00+08:00`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
const accountName = id => state.data?.accounts.find(a => a.id === id)?.name || id || '未分配';
const anchorName = id => state.data?.anchors.find(a => a.id === id)?.name || id || '未分配';
const roleName = role => ({ admin: '管理员', manager:'主管', anchor_entry:'主播录入', service_entry:'客服录入', editor: '主管编辑（旧角色）', viewer: '管理只读（旧角色）', dashboard_viewer: '看板' }[role] || role);
const statusName = status => ({ planned: '待开播', live: '直播中', completed: '已结束', in_stock: '在库', reserved: '已锁定', sold: '已售出', returned: '已退货主', open: '待处理', doing: '进行中', done: '已验收' }[status] || status);
const canEdit = () => ['admin', 'manager', 'editor'].includes(state.data?.user?.role);
const options = (rows, selected, all = '') => `${all ? `<option value="">${all}</option>` : ''}${rows.map(r => `<option value="${esc(r.id)}" ${r.id === selected ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}`;
const statusOptions = (keys, selected, all = '') => `${all ? `<option value="">${all}</option>` : ''}${keys.map(k => `<option value="${k}" ${k === selected ? 'selected' : ''}>${statusName(k)}</option>`).join('')}`;
let iconScript;
function renderIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
    return;
  }
  if (iconScript || !state.data || state.view === 'daily') return;
  iconScript = document.createElement('script');
  iconScript.src = './vendor/lucide.min.js';
  iconScript.onload = () => window.lucide?.createIcons();
  iconScript.onerror = () => {
    iconScript.remove();
    iconScript = null;
  };
  document.head.append(iconScript);
}
function icons() {
  renderIcons();
  if (state.data?.dataset?.kind === 'imported') {
    const marker = $('.top-right .badge') || $('.top-right .demo');
    if (marker) { marker.textContent = '真实表格 · 仅销售'; marker.className = 'badge imported-badge'; }
    const side = $('.side-bottom p'); if (side) side.textContent = '直播间与主播历史';
    document.querySelectorAll('.heatmap-table').forEach(table => table.classList.toggle('seven-days', Number(state.windowDays) === 7));
    return;
  }
  document.querySelectorAll('.heatmap-table').forEach(table => table.classList.toggle('seven-days', Number(state.windowDays) === 7));
  if (state.view === 'performance' && state.performanceMetric === 'actualMinutes' && state.data) {
    document.querySelectorAll('[data-testid="performance-table"] tbody tr').forEach(row => {
      const id = row.querySelector('[data-performer]')?.dataset.performer;
      if (!id || row.querySelector('.monthly-duration')) return;
      const p = periodInfo();
      const records = state.data.sessions.filter(s => s.date >= p.monthStart && s.date <= p.end && (!state.account || s.accountId === state.account) && (!state.anchor || s.anchorId === state.anchor) && (state.performanceGroup === 'account' ? s.accountId : s.anchorId) === id);
      const total = totals(records);
      const label = document.createElement('small'); label.className = 'monthly-duration'; label.textContent = `月 ${fmt(total.actualMinutes / 60, 1)}h${total.missingDuration ? ' · 缺报' : ''}`; row.querySelector('.summary-col')?.append(label);
    });
  }
  if ($('#member-form') && !$('#directory-button')) {
    const button = document.createElement('button'); button.id = 'directory-button'; button.type = 'button'; button.dataset.action = 'directory'; button.textContent = '管理直播间、主播与场次'; $('#member-form').before(button);
  }
  if (state.view === 'performance' && state.data && !$('.data-completeness')) {
    const p = periodInfo(), applicable = state.data.sessions.filter(s => (!state.account || s.accountId === state.account) && (!state.anchor || s.anchorId === state.anchor));
    const currentDates = new Set(applicable.filter(s => s.date >= p.start && s.date <= p.end).map(s => s.date));
    const previousDates = new Set(applicable.filter(s => s.date >= p.previousStart && s.date <= p.previousEnd).map(s => s.date));
    if (currentDates.size < Number(state.windowDays) || previousDates.size < Number(state.windowDays)) {
      const note = document.createElement('p'); note.className = 'data-completeness'; note.textContent = `登记覆盖：当前窗口 ${currentDates.size}/${state.windowDays} 天，对比窗口 ${previousDates.size}/${state.windowDays} 天。缺报或未开播日期不能区分，涨跌仅供核对，暂停变化贡献分解。`; $('.performance-kpis')?.before(note);
    }
  }
}
function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => $('#toast').classList.remove('show'), 3600); }
async function api(path, data, method = 'GET') {
  const headers = new Headers({ 'X-Command-Scope': manage ? 'account' : 'dashboard' });
  if (data) headers.set('Content-Type', 'application/json');
  const response = await fetch(new URL(path.replace(/^\//, ''), document.baseURI), {
    method, credentials: 'same-origin', headers, body: data ? JSON.stringify(data) : undefined
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error || result.message || '请求失败，请稍后重试');
    error.status = response.status;
    error.code = result.code;
    error.demo = result.demo;
    error.dataset = result.dataset;
    throw error;
  }
  return result;
}
function normalize(data) {
  for (const key of ['accounts', 'anchors', 'slots', 'sessions', 'inventory', 'tasks']) data[key] ||= [];
  return data;
}
async function reload() {
  let access;
  if (manage) {
    access = await api('/api/me');
    if (['anchor_entry', 'service_entry'].includes(access.user?.role)) {
      location.replace('./entry');
      return;
    }
    if (access.dashboardRequired && !access.dashboardUnlocked) {
      showDashboardUnlock();
      return;
    }
  }
  const data = await api('/api/bootstrap');
  loadDashboard(access ? { ...data, dashboardOnly: access.dashboardOnly, dashboardUnlocked: access.dashboardUnlocked } : data);
}
function loadDashboard(payload) {
  const data = normalize(payload);
  if (state.data?.user?.id !== data.user?.id) window.dispatchEvent(new Event('monthly-reset'));
  state.data = data;
  const cutoffDate = state.data.dataset?.cutoffDate;
  if (state.data.dataset?.kind === 'imported' && /^\d{4}-\d{2}-\d{2}$/.test(cutoffDate) && !state.importLoaded) {
    state.periodEnd = cutoffDate;
    state.date = cutoffDate;
    state.from = shiftDate(cutoffDate, -4);
    state.to = cutoffDate;
    state.importGroup = 'slot';
    state.importLoaded = true;
  }
  state.loadedAt = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  render();
}
function sessions(range = false) {
  return state.data.sessions.filter(s => (range ? s.date >= state.from && s.date <= state.to : s.date === state.date) && (!state.account || s.accountId === state.account) && (!state.anchor || s.anchorId === state.anchor) && (!state.status || s.status === state.status));
}
function hours(row) { const t = s => { const [h, m] = String(s).split(':').map(Number); return h + m / 60; }; return Math.max(0, t(row.end) - t(row.start) + 24 * (row.endDayOffset || 0)); }
function sessionTime(row) {
  return row.scheduleUnknown ? '实际时段待补' : `${row.start}—${row.endDayOffset === 1 ? '次日' : ''}${row.end}`;
}
function aggregate(rows) {
  const result = {};
  for (const k of ['target', 'reach', 'impressions', 'views', 'viewers', 'shares', 'peak', 'interactions', 'newFollowers', 'messages', 'qualified', 'orders', 'orderAmount', 'paidOrders', 'received', 'refundOrders', 'refunds', 'units', 'cogs', 'adSpend', 'shipping', 'fees', 'otherCost']) result[k] = sum(rows, k);
  result.net = result.received - result.refunds;
  result.profit = result.net - result.cogs - result.adSpend - result.shipping - result.fees - result.otherCost;
  result.hours = rows.reduce((a, s) => a + num(s.actualMinutes) / 60, 0);
  result.missingDuration = rows.filter(s => s.actualMinutes === null || s.actualMinutes === undefined).length;
  result.count = rows.length;
  result.watch = result.viewers ? rows.reduce((a, s) => a + num(s.watchSeconds) * num(s.viewers), 0) / result.viewers : 0;
  result.conversion = result.qualified ? result.orders / result.qualified : null;
  result.perHour = result.hours && !result.missingDuration ? result.orderAmount / result.hours : null;
  result.attainment = result.target ? result.orderAmount / result.target : null;
  result.adMultiple = result.adSpend ? result.orderAmount / result.adSpend : null;
  result.collection = result.orderAmount ? result.received / result.orderAmount : null;
  result.refundRate = result.received ? result.refunds / result.received : null;
  return result;
}
function kpis(rows, inventory = false) {
  const a = aggregate(rows);
  if (inventory) {
    const items = state.data.inventory;
    const bought = items.filter(i => i.purchaseDate >= state.from && i.purchaseDate <= state.to);
    return `<div class="kpi-grid">${kpi('本期现金采购', money(sum(bought, 'cost')), `${bought.length} 件入账 · 采购日期口径`, 'banknote')}${kpi('当前库存占款', money(sum(items.filter(i => ['in_stock', 'reserved'].includes(i.state)), 'cost')), '在库 + 已锁定 · 采购成本', 'boxes')}${kpi('当前可售手镯', `${items.filter(i => i.state === 'in_stock').length}<small> 件</small>`, '按唯一货号管理', 'gem')}${kpi('已锁定待处理', `${items.filter(i => i.state === 'reserved').length}<small> 件</small>`, '跟进付款与场次归属', 'lock-keyhole')}</div>`;
  }
  return `<div class="kpi-grid">${kpi('确认成交额', money(a.orderAmount), `目标 ${money(a.target)} · 达成 <span class="positive">${rate(a.orderAmount, a.target)}</span>`, 'badge-check')}${kpi('净实收', money(a.net), `已收 ${money(a.received)} · 已退 ${money(a.refunds)}`, 'wallet')}${kpi('贡献利润', money(a.profit), `<span class="${a.profit < 0 ? 'negative' : 'positive'}">已扣售出成本与场次费用</span> · 未扣固定成本`, 'chart-no-axes-combined')}${kpi('有效询单 / 确认订单', `${fmt(a.qualified)}<span class="quiet"> / </span>${fmt(a.orders)}`, `询单转化 ${rate(a.orders, a.qualified)} · ${a.count} 场`, 'messages-square')}</div>`;
}
function kpi(label, value, note, symbol) { return `<div class="kpi"><div class="kpi-label">${icon(symbol)}${label}</div><div class="kpi-value">${value}</div><div class="kpi-note">${note}</div></div>`; }
const manageNav = [ ['daily', 'layout-dashboard', '单日大屏'], ['directory', 'settings', '直播名录'], ['performance', 'activity', '播后变化'], ['schedule', 'calendar-range', '场次排期'], ['compare', 'columns-3', '数据对比'], ['session-details', 'list', '主播场次明细'], ['monthly', 'notebook-pen', '主播月度总结报告'], ['review', 'clipboard-check', '复盘行动'], ['inventory', 'gem', '采购库存'], ['overview', 'chart-no-axes-combined', '经营总览'], ['method', 'book-open', '指标口径'] ];
const nav = [
  ...(manage ? manageNav : manageNav.filter(([id]) => ['daily', 'performance', 'compare', 'session-details'].includes(id))),
  ['anchor-review', 'clipboard-check', '主播复盘'],
  ['completeness', 'clipboard-check', '录入完整性'],
  ['feedback', 'messages-square', '员工反馈']
];
const isDirectoryAdmin = () => manage && state.data?.user?.role === 'admin';
const canManageFeedback = () => manage && state.data?.dashboardOnly === false &&
  state.data.dashboardUnlocked === true && ['admin', 'manager'].includes(state.data.user?.role);
function canOpenView(view) {
  if (!state.data) return false;
  if (view === 'directory') return isDirectoryAdmin();
  if (view === 'feedback') return canManageFeedback();
  return nav.some(([id]) => id === view);
}
const directory = setupDirectory({ api, dialog, toast, reload, render, isAdmin: isDirectoryAdmin });
const anchorReview = setupAnchorReview({ api, render, today, isActive: () => state.view === 'anchor-review' && Boolean(state.data) });
function render() {
  const d = state.data;
  if (!d) return;
  if (!canOpenView(state.view)) state.view = 'daily';
  if (state.view === 'daily') {
    root.innerHTML = renderDailySales(d, state.dailyDate, manage && canEdit(), manage, state.dailyMetric, isDirectoryAdmin(), canManageFeedback());
    return;
  }
  root.innerHTML = `<div class="app-shell"><aside class="sidebar"><div class="brand"><div class="brandmark">${icon('radar')}</div><div><strong>协作中心</strong></div></div><div class="workspace"><small>当前工作空间</small><strong>直播数据工作空间</strong><p>Facebook / 人民币 CNY</p></div><div class="nav-label">工作台</div><nav class="navigation">${nav.filter(([id]) => canOpenView(id)).map(([id, symbol, title]) => `<button type="button" data-view="${id}" data-testid="nav-${id}" class="${state.view === id ? 'active' : ''} ${['method', 'inventory', 'overview'].includes(id) ? 'desktop-nav' : ''}">${icon(symbol)}<span>${title}</span></button>`).join('')}</nav><div class="side-bottom"><div class="connection"><span class="dot"></span>共享工作空间</div><p>${d.accounts.length} 个直播账号</p><p>最近同步 ${esc(state.loadedAt)}</p></div></aside><main class="main"><header class="topbar"><div class="mobile-brand">协作中心</div><div class="crumb">工作空间 <span style="margin:0 10px">/</span> <b>${nav.find(n => n[0] === state.view)?.[2]}</b></div><div class="top-right">${d.demo ? '<span class="demo">演示数据 · 非真实经营数据</span>' : '<span class="badge neutral">人民币 CNY</span>'}<button type="button" class="icon" data-action="refresh" title="刷新共享数据" aria-label="刷新共享数据">${icon('refresh-cw')}</button>${manage ? `<button type="button" class="user-button" data-action="profile"><span class="avatar">${esc(d.user?.name?.slice(0, 1) || '我')}</span><span>${esc(d.user?.name || '成员')}</span>${icon('chevron-down')}</button>` : `<button type="button" class="icon" data-action="logout" aria-label="锁定看板" title="锁定看板">${icon('lock-keyhole')}</button>`}</div></header><div class="content">${content()}</div></main></div>`;
  icons();
}
function heading(title, description, actions = '', tag = 'FACEBOOK LIVE · JADE OPERATIONS') { return `<div class="page-heading"><div><div class="eyebrow"><span class="dot"></span>${tag}</div><h1>${title}</h1><p>${description}</p></div><div class="heading-actions">${actions}</div></div>`; }
function filters(range = false, extra = '') {
  return `<div class="filters">${range ? `<label>日期 <input type="date" aria-label="开始日期" data-filter="from" value="${state.from}"></label><span class="quiet">至</span><label><input type="date" aria-label="结束日期" data-filter="to" value="${state.to}"></label><button type="button" data-action="last7" class="icon" title="最近7天" aria-label="最近7天">${icon('calendar-days')}</button>` : `<button class="icon" data-action="previous-day" title="前一天" aria-label="前一天">${icon('chevron-left')}</button><label><input aria-label="排期日期" type="date" data-filter="date" value="${state.date}"></label><button class="icon" data-action="next-day" title="后一天" aria-label="后一天">${icon('chevron-right')}</button><button data-action="today">今天</button>`}<select aria-label="筛选账号" data-filter="account">${options(state.data.accounts, state.account, '全部账号')}</select><select aria-label="筛选主播" data-filter="anchor">${options(state.data.anchors, state.anchor, '全部主播')}</select>${extra}<span class="spacer"></span><span class="quiet">CNY · 场次归因口径</span></div>`;
}
function exportButton() { return `<button data-action="export">${icon('download')}导出数据</button>`; }
function content() {
  if (state.view === 'directory') return directory.page();
  if (state.view === 'anchor-review') return anchorReview.page(state.data.anchors, state.dailyDate || lastCompletedDay());
  if (state.view === 'session-details') {
    return renderSessionDetails(
      state.data, state.detailDate || state.dailyDate || lastCompletedDay(),
      state.detailAccount, state.detailAnchor,
      { esc, today: beijingToday(), expanded: Boolean(state.detailHistory) }
    );
  }
  if (state.view === 'completeness') return `${heading('录入完整性', '按日期查看场次录入进度与缺失字段。')}<section data-feedback-root="completeness" aria-label="录入完整性总览"></section>`;
  if (state.view === 'feedback') return `${heading('员工反馈', '茶水间的优化建议、吐槽与协调事项汇总在这里。建议自提交起计时，请在 48 小时内给出调整动作或处理进展。')}<section data-feedback-root="manage" aria-label="员工反馈"></section>`;
  if(state.view==='monthly')return monthlyPage({heading,icon});
  if (state.view === 'compare') return comparePage();
  if (!manage || state.data.dataset?.kind === 'imported') return renderImported(state, {heading, icon, canEdit: manage && canEdit(), canExport: manage});
  let html;
  if (state.view === 'performance') html = performancePage();
  else if (state.view === 'schedule') html = schedulePage();
  else if (state.view === 'compare') html = comparePage();
  else if (state.view === 'overview') html = overviewPage();
  else if (state.view === 'inventory') html = inventoryPage();
  else if (state.view === 'review') html = reviewPage();
  else html = methodPage();
  return `${!canEdit() ? '<div class="read-only-note">当前为查看权限，数据由管理员和编辑成员维护。</div>' : ''}${html}<footer class="audit-note"><span>现金采购与销售回款分账 · 所有金额为人民币</span><span>最近同步 ${esc(state.loadedAt)} · ${esc(roleName(state.data.user?.role))}</span></footer>`;
}
const performanceMetrics = [ ['orderAmount', '销售金额', 'money'], ['orders', '单量', 'count'], ['reach', '触达人数', 'count'], ['impressions', '浏览量', 'count'], ['shares', '分享次数', 'count'], ['newFollowers', '新增粉', 'count'], ['actualMinutes', '实际时长', 'duration'] ];
function signedMoney(value) { return `${value >= 0 ? '+' : '−'}¥${fmt(Math.abs(value))}`; }
function deltaLabel(current, previous) { const d = change(current, previous); return d === null ? (current > 0 ? '新增 / 无基期' : '无可比数据') : `${d >= 0 ? '+' : ''}${fmt(d * 100, 1)}%`; }
function metricValue(value, type = 'count') { return value === null ? '待补' : type === 'money' ? money(value) : type === 'duration' ? `${fmt(value / 60, 1)}h` : fmt(value); }
function periodInfo() {
  const end = state.periodEnd, start = shiftDate(end, 1 - Number(state.windowDays));
  return { start, end, previousEnd: shiftDate(start, -1), previousStart: shiftDate(start, -Number(state.windowDays)), monthStart: `${end.slice(0, 7)}-01` };
}
function performancePage() {
  const p = periodInfo(), days = Array.from({ length: Number(state.windowDays) }, (_, i) => shiftDate(p.start, i));
  const all = state.data.sessions.filter(s => (!state.account || s.accountId === state.account) && (!state.anchor || s.anchorId === state.anchor));
  const current = all.filter(s => s.date >= p.start && s.date <= p.end);
  const previous = all.filter(s => s.date >= p.previousStart && s.date <= p.previousEnd);
  const month = all.filter(s => s.date >= p.monthStart && s.date <= p.end);
  const a = totals(current), b = totals(previous), m = totals(month);
  const metric = performanceMetrics.find(x => x[0] === state.performanceMetric) || performanceMetrics[0];
  const allIdentities = state.performanceGroup === 'account' ? state.data.accounts.filter(x => !state.account || x.id === state.account) : state.data.anchors.filter(x => (!state.anchor || x.id === state.anchor) && (!state.account || state.data.sessions.some(s => s.accountId === state.account && s.anchorId === x.id)));
  const groups = allIdentities.map(item => {
    const match = s => (state.performanceGroup === 'account' ? s.accountId : s.anchorId) === item.id;
    const rows = current.filter(match), old = previous.filter(match), monthRows = month.filter(match);
    return { ...item, rows, previous: old, month: monthRows, sum: totals(rows), old: totals(old), monthSum: totals(monthRows), daily: days.map(day => totals(rows.filter(s => s.date === day))) };
  }).sort((x, y) => y.sum[state.performanceMetric] - x.sum[state.performanceMetric]);
  const selected = groups.find(g => g.id === state.selectedPerformer);
  const focusCurrent = selected ? selected.rows : current, focusPrevious = selected ? selected.previous : previous;
  const focusA = totals(focusCurrent), focusB = totals(focusPrevious);
  const currentDateCount = new Set(focusCurrent.map(s => s.date)).size;
  const previousDateCount = new Set(focusPrevious.map(s => s.date)).size;
  const incomplete = currentDateCount < Number(state.windowDays) || previousDateCount < Number(state.windowDays);
  const factors = incomplete ? null : decomposeSales(focusA, focusB);
  const factorSorted = factors?.slice().sort((x, y) => Math.abs(y.value) - Math.abs(x.value));
  const growth = a.orderAmount - b.orderAmount;
  const monthFollowers = state.performanceGroup === 'account' && !state.anchor ? `${fmt(m.newFollowers)}` : '见账号口径';
  const titleRange = `${p.start.slice(5).replace('-', '/')}—${p.end.slice(5).replace('-', '/')}`;
  const scale = Math.max(1, ...groups.flatMap(g => g.daily.map(d => d[state.performanceMetric])));
  const dateHead = days.map((day, i) => `<th class="day-col ${day === today ? 'today-col' : ''}"><span>${i === days.length - 1 ? '末日' : ['日', '一', '二', '三', '四', '五', '六'][new Date(`${day}T12:00:00+08:00`).getUTCDay()]}</span><strong>${day.slice(5).replace('-', '/')}</strong></th>`).join('');
  return `<div data-testid="performance-page">${heading('播后业绩 · 看变化，做调整', `5 个账号 × 15 位主播 · 销售金额为主业绩 · ${p.end.slice(0, 4)} 年`, `${canEdit() ? `<button data-action="record-today" class="primary">${icon('square-pen')}登记播后数据</button>` : ''}`, 'POST-LIVE PERFORMANCE')}<div class="period-toolbar"><div class="period-days" role="group" aria-label="统计天数"><button class="${Number(state.windowDays) === 5 ? 'active' : ''}" data-days="5" data-testid="window-5">近 5 天</button><button class="${Number(state.windowDays) === 7 ? 'active' : ''}" data-days="7" data-testid="window-7">近 7 天</button></div><div class="period-date"><button class="icon" data-action="period-prev" aria-label="前移一天" title="前移一天">${icon('chevron-left')}</button><label><input type="date" aria-label="窗口截止日期" data-filter="periodEnd" value="${p.end}" max="${today}"></label><button class="icon" data-action="period-next" aria-label="后移一天" title="后移一天" ${p.end >= today ? 'disabled' : ''}>${icon('chevron-right')}</button></div><span class="period-range">${titleRange}<small>对比 ${p.previousStart.slice(5).replace('-', '/')}—${p.previousEnd.slice(5).replace('-', '/')}</small></span><button class="period-reset" data-action="period-today">回到今天</button></div><div class="filters performance-filters"><select aria-label="筛选账号" data-filter="account">${options(state.data.accounts, state.account, '全部5个账号')}</select><select aria-label="筛选主播" data-filter="anchor">${options(state.data.anchors, state.anchor, '全部15位主播')}</select><span class="spacer"></span><span class="quiet">${current.length} 场记录 · ${current.filter(s => s.status !== 'completed').length} 场未结束</span></div><div class="performance-kpis"><div class="performance-hero"><div class="kpi-label">${icon('chart-no-axes-combined')}近 ${state.windowDays} 天销售金额</div><strong>${money(a.orderAmount)}</strong><span class="performance-change ${growth >= 0 ? 'good' : 'bad'}">${icon(growth >= 0 ? 'trending-up' : 'trending-down')}${deltaLabel(a.orderAmount, b.orderAmount)}<small>较前 ${state.windowDays} 天 ${b.orderAmount ? signedMoney(growth) : ''}</small></span></div><div class="performance-small"><span>订单总量</span><b>${fmt(a.orders)}<small> 单</small></b><em class="${a.orders >= b.orders ? 'good' : 'bad'}">${deltaLabel(a.orders, b.orders)}</em></div><div class="performance-small"><span>触达累计</span><b>${fmt(a.reach)}</b><em class="${a.reach >= b.reach ? 'good' : 'bad'}">${deltaLabel(a.reach, b.reach)}</em></div><div class="performance-small"><span>窗口新增粉</span><b>${fmt(a.newFollowers)}<small> 人</small></b><em class="${a.newFollowers >= b.newFollowers ? 'good' : 'bad'}">${deltaLabel(a.newFollowers, b.newFollowers)}</em></div></div><div class="duration-band"><div>${icon('timer')}<span>窗口实际时长</span><b>${fmt(a.actualMinutes / 60, 1)}h</b></div><div><span>本月累计直播</span><b>${fmt(m.actualMinutes / 60, 1)}h</b></div><div><span>每小时销售</span><b>${!a.missingDuration && a.actualMinutes > 0 ? money(a.orderAmount / (a.actualMinutes / 60)) : '—'}</b></div><div><span>本月新增粉</span><b>${fmt(m.newFollowers)}</b></div></div>${a.missingDuration ? `<p class="rule-note bad">${a.missingDuration} 场未登记实际时长；时长合计仅含已填值，每小时销售暂停比较。</p>` : ''}<section class="performance-section"><div class="section-bar"><h2>每天怎么变 · ${state.performanceGroup === 'anchor' ? '15 位主播' : '5 个账号'}</h2><span class="spacer"></span><div class="segmented"><button data-performance-group="anchor" class="${state.performanceGroup === 'anchor' ? 'active' : ''}" data-testid="group-anchor">主播</button><button data-performance-group="account" class="${state.performanceGroup === 'account' ? 'active' : ''}" data-testid="group-account">账号</button></div></div><div class="metric-switch" role="group" aria-label="对比指标">${performanceMetrics.map(([key, label]) => `<button data-metric="${key}" data-testid="metric-${key}" class="${state.performanceMetric === key ? 'active' : ''}">${label}</button>`).join('')}<button data-metric="monthFollowers" data-testid="metric-monthFollowers" class="${state.performanceMetric === 'monthFollowers' ? 'active' : ''}">月累计新粉</button></div>${state.performanceMetric === 'monthFollowers' ? followerBoard(all, days, p) : `<div class="heatmap-scroll"><table class="heatmap-table" data-testid="performance-table"><thead><tr><th class="identity-col">${state.performanceGroup === 'anchor' ? '主播 / 账号' : 'Facebook 账号'}<small>${metric[1]} · ${metric[2] === 'money' ? '元' : metric[2] === 'duration' ? '小时' : metric[0] === 'orders' ? '单' : ['impressions', 'shares'].includes(metric[0]) ? '次' : '人次'}</small></th>${dateHead}<th class="summary-col">${state.windowDays} 天合计<small>较前 ${state.windowDays} 天</small></th></tr></thead><tbody>${groups.map((g, i) => `<tr class="${g.id === selected?.id ? 'selected' : ''}"><td class="identity-col"><button data-performer="${esc(g.id)}"><span class="rank-chip ${i < 3 ? 'top' : ''}">${String(i + 1).padStart(2, '0')}</span><span><b>${esc(g.name)}</b><small>${state.performanceGroup === 'anchor' ? esc([...new Set(g.rows.map(s => accountName(s.accountId)))].join(' · ') || '窗口暂无场次') : `${g.rows.length} 场 · ${fmt(g.sum.actualMinutes / 60, 1)}h`}</small></span></button></td>${g.daily.map((d, index) => { const missing = state.performanceMetric === 'actualMinutes' && d.missingDuration; const has = g.rows.some(s => s.date === days[index]); const value = d[state.performanceMetric]; return `<td class="day-col ${days[index] === today ? 'today-col' : ''}" data-performer="${esc(g.id)}"><span class="heat-value" style="--heat:${has && value !== null ? .035 + value / scale * .20 : 0}">${!has || missing ? '—' : metricValue(value, metric[2]).replace('¥', '')}</span></td>`; }).join('')}<td class="summary-col"><b>${metricValue(g.sum[state.performanceMetric], metric[2])}</b><small class="${g.sum[state.performanceMetric] >= g.old[state.performanceMetric] ? 'good' : 'bad'}">${g.sum[state.performanceMetric] === null || g.old[state.performanceMetric] === null ? '待补' : deltaLabel(g.sum[state.performanceMetric], g.old[state.performanceMetric])}</small></td></tr>`).join('')}</tbody><tfoot><tr><td class="identity-col">合计</td>${days.map(day => `<td>${metricValue(totals(current.filter(s => s.date === day))[state.performanceMetric], metric[2]).replace('¥', '')}</td>`).join('')}<td class="summary-col">${metricValue(a[state.performanceMetric], metric[2])}</td></tr></tfoot></table></div>`}<p class="rule-note">由高到低按窗口合计排名。表格可横向滑动；点主播查看变化贡献。浏览量按次数累加，触达和新粉跨场累加，月新增粉按账号归属。</p></section><section class="performance-section decomposition"><div class="section-bar"><h2>销售变动，先看哪一项</h2><span class="spacer"></span><select data-filter="selectedPerformer" aria-label="分析对象"><option value="">${state.account ? esc(accountName(state.account)) : '全部账号'} · 合计</option>${groups.map(g => `<option value="${esc(g.id)}" ${g.id === selected?.id ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select></div><div class="decomp-overview"><div><span>${esc(selected?.name || '当前筛选合计')} · 前后两个 ${state.windowDays} 天</span><strong class="${focusA.orderAmount >= focusB.orderAmount ? 'good' : 'bad'}">${signedMoney(focusA.orderAmount - focusB.orderAmount)}</strong></div><p>${factorSorted ? `绝对贡献最大：<b>${esc(factorSorted[0].name)}</b><br>${factorSorted[0].value >= 0 ? '拉动' : '拖累'}销售约 ${money(Math.abs(factorSorted[0].value))}` : '链路分母为零或没有可比记录，先补齐数据。'}</p></div>${factors ? `<div class="factor-list">${factorSorted.map((f, i) => `<div class="factor-row" data-testid="factor-contribution" data-factor="${f.key}" data-value="${f.value}"><span class="factor-name"><i>${String(i + 1).padStart(2, '0')}</i>${f.name}<small>${f.key === 'reach' ? `${fmt(f.previous)} → ${fmt(f.current)}` : f.key === 'basket' ? `${money(f.previous)} → ${money(f.current)}` : `${fmt(f.previous * 100, 1)}% → ${fmt(f.current * 100, 1)}%`}</small></span><div class="factor-track"><i class="${f.value < 0 ? 'negative' : ''}" style="width:${Math.max(2, Math.abs(f.value) / Math.max(1, ...factors.map(x => Math.abs(x.value))) * 100)}%"></i></div><b class="${f.value >= 0 ? 'good' : 'bad'}">${signedMoney(f.value)}</b></div>`).join('')}</div><div class="decomp-check" data-testid="decomposition-total" data-value="${focusA.orderAmount - focusB.orderAmount}">五项贡献合计 ${signedMoney(factors.reduce((v, f) => v + f.value, 0))} = 销售差额</div>` : '<div class="empty">暂无足够的可比分母，保留原量趋势，不强行分解。</div>'}<p class="rule-note">按触达人数 × 私信承接率 × 询单有效率 × 每询单订单数 × 订单均价分解，使用全部替换顺序的平均贡献。它是数学贡献，不能证明因果；同客多单时“每询单订单数”不等同买家转化率。</p><div class="duration-insight">${icon('clock-3')}<div><strong>播得更久，还是每小时卖得更好？</strong><p>${durationInsight(focusA, focusB)}</p></div></div><div class="performance-next"><p>${factorSorted ? suggestion(factorSorted[0].key) : '先完整登记触达、私信、询单、订单与销售，再选同主播的相邻周期比较。'}</p><button data-action="performance-task">${icon('plus')}转成复盘行动</button></div></section><p class="rule-note">月度口径：${p.monthStart}—${p.end}；粉丝为本月新增累计，不是账号粉丝总量。当日未播完、退款未结束、成员组合或场次安排变化时，前后对比需结合实际记录。未接 Facebook 自动采集。</p></div>`;
}
function durationInsight(current, previous) {
  if (current.missingDuration || previous.missingDuration || !current.actualMinutes || !previous.actualMinutes) return '有场次时长尚未登记或基期时长为零，暂不判断时长与效率变化。';
  const h1 = current.actualMinutes / 60, h0 = previous.actualMinutes / 60, e1 = current.orderAmount / h1, e0 = previous.orderAmount / h0;
  const time = (h1 - h0) * (e1 + e0) / 2, efficiency = (e1 - e0) * (h1 + h0) / 2;
  return `实际时长 ${fmt(h0, 1)}h → ${fmt(h1, 1)}h，小时销售 ${money(e0)} → ${money(e1)}；时长变化贡献 ${signedMoney(time)}，小时效率变化贡献 ${signedMoney(efficiency)}。同样为数学分解，不等于因果。`;
}
function suggestion(key) {
  return { reach: '优先核对触达来源、开播时段、投流预算与实际播出时长，再比较同主播的销售效率。', messageRate: '优先回看引导私信的话术、货号展示、回复速度和客户承接，记录具体片段验证。', qualifiedRate: '优先核对货盘圈口、价位与受众匹配，复查有效询单登记口径是否一致。', orderRate: '优先回访未成交询单，分类记录货况信任、价格、圈口和支付障碍。', basket: '优先比较成交货品价格带、件数与高货占比，同时查看利润和退款，避免只抬成交额。' }[key];
}
function followerBoard(all, days, p) {
  const accounts = state.data.accounts.filter(a => !state.account || a.id === state.account);
  const values = accounts.map(account => ({ ...account, values: days.map(day => sum(all.filter(s => s.accountId === account.id && s.date >= `${day.slice(0, 7)}-01` && s.date <= day), 'newFollowers')) })).sort((a, b) => b.values.at(-1) - a.values.at(-1));
  return `<div class="heatmap-scroll"><table class="heatmap-table" data-testid="monthly-followers-table"><thead><tr><th class="identity-col">账号月累计新粉<small>月初至当天 · 跨日逐步累计</small></th>${days.map(day => `<th class="day-col"><strong>${day.slice(5).replace('-', '/')}</strong></th>`).join('')}<th class="summary-col">截至末日</th></tr></thead><tbody>${values.map(a => `<tr><td class="identity-col"><strong>${esc(a.name)}</strong></td>${a.values.map(v => `<td>${fmt(v)}</td>`).join('')}<td class="summary-col"><b>${fmt(a.values.at(-1))}</b></td></tr>`).join('')}</tbody></table></div><p class="rule-note">新粉属于 Facebook 账号。${state.anchor ? '当前已筛主播，数值仅为该主播归属场次贡献的新粉；清除主播筛选查看账号完整累计。' : ''}累计依赖月初以来完整登记；本版按场次新粉累加，不代表唯一自然人去重。</p>`;
}
function schedulePage() {
  const rows = sessions();
  const a = aggregate(rows);
  return `${heading('场次作战台', `${dateLabel(state.date)} · 把每一场的流量、成交和利润放在同一张作战图上。`, `${exportButton()}${canEdit() ? `<button class="primary" data-action="add-session">${icon('plus')}新建场次</button>` : ''}`)}${filters(false, `<select aria-label="筛选场次状态" data-filter="status">${statusOptions(['planned', 'live', 'completed'], state.status, '全部状态')}</select>`)}${kpis(rows)}<div class="section-bar"><h2>账号 × 场次排期</h2><span class="quiet">${rows.length} 场 · ${rows.filter(s => s.status === 'completed').length} 已结束 · ${rows.filter(s => s.status === 'live').length} 直播中</span><span class="spacer"></span><button class="icon ${state.scheduleMode === 'grid' ? 'good' : ''}" data-action="grid-mode" title="排期布局" aria-label="排期布局">${icon('layout-grid')}</button><button class="icon ${state.scheduleMode === 'list' ? 'good' : ''}" data-action="list-mode" title="列表布局" aria-label="列表布局">${icon('list')}</button></div>${state.scheduleMode === 'grid' ? scheduleGrid(rows) : sessionList(rows)}<div class="bottom-grid"><section class="unframed"><div class="section-bar"><h2>今日主播 · 贡献排行</h2><span class="spacer"></span><button data-view="compare" class="icon" title="查看完整对比" aria-label="查看完整对比">${icon('arrow-up-right')}</button></div>${ranking(rows)}</section><section class="unframed"><div class="section-bar"><h2>待跟进行动</h2><span class="spacer"></span><span class="quiet">${state.data.tasks.filter(t => t.status !== 'done').length} 项未完成</span></div>${attention(rows, a)}</section></div>`;
}
function scheduleGrid(rows) {
  const accounts = state.data.accounts.filter(a => (!state.account || a.id === state.account) &&
    (a.active !== false || rows.some(row => row.accountId === a.id)));
  const catalog = state.data.slots;
  const byPeriod = rows.map(row => ({ row, period: resolveShiftPeriod(row, catalog) }));
  const periods = byPeriod.some(item => item.period === 'unknown')
    ? [...PERIODS, { id: 'unknown', name: '场次待确认' }] : PERIODS;
  const cells = periods.map(period => `<div class="slot-label"><strong>${period.name}</strong>${period.start ? `<span>${sessionTime(period)}</span>` : ''}</div>
    ${accounts.map(account => {
      const matches = byPeriod.filter(item => item.row.accountId === account.id && item.period === period.id);
      const slot = catalog.find(item => item.accountId === account.id && item.period === period.id && item.active !== false);
      const canSchedule = canEdit() && account.active !== false && slot;
      return `<div class="slot-cell">${matches.length ? matches.map(({ row }) => sessionCard(row)).join('')
        : canSchedule ? `<button class="slot-add" data-add-account="${esc(account.id)}" data-add-slot="${esc(slot.id)}">${icon('plus')}安排场次</button>`
          : '<span class="empty">未安排</span>'}</div>`;
    }).join('')}`).join('');
  return `<div class="schedule-wrap"><div class="schedule" style="grid-template-columns:110px repeat(${accounts.length},minmax(156px,1fr));min-width:${Math.max(360, 110 + accounts.length * 166)}px"><div class="grid-corner">${icon('clock-3')}&nbsp; 场次 / 账号</div>${accounts.map((a, i) => `<div class="account-head"><div class="account-head-top"><span class="account-icon">f</span>${esc(a.name)}</div><p>${esc(a.page || `Facebook · ${i + 1} 号主页`)}</p></div>`).join('')}${cells}</div></div>`;
}
function sessionCard(s) {
  return `<button type="button" data-session="${esc(s.id)}" data-testid="session-card" class="session-card ${esc(s.status)}"><div class="session-top"><span class="session-time">${esc(sessionTime(s))}</span><span class="badge ${s.status}">${s.status === 'live' ? '<span class="dot"></span>' : ''}${s.cancelled ? '已取消' : statusName(s.status)}</span></div><div class="session-anchor"><span class="session-avatar">${esc(anchorName(s.anchorId).slice(0, 1))}</span>${esc(anchorName(s.anchorId))}</div>${s.slotLabel ? `<div class="quiet">${esc(s.slotLabel)}</div>` : ''}<div class="session-metric"><span>确认成交</span><b>${money(s.orderAmount)}</b></div><div class="meter"><i style="width:${Math.min(100, num(s.target) ? num(s.orderAmount) / s.target * 100 : 0)}%"></i></div><div class="session-footer"><span>目标 ${money(s.target)}</span><span>${rate(s.orderAmount, s.target)}</span></div><div class="session-metric"><span>${fmt(s.orders)} 单 · 有效询单 ${fmt(s.qualified)}</span><span>净收 ${money(num(s.received) - num(s.refunds))}</span></div></button>`;
}
function sessionList(rows) { return `<div class="table-scroll"><table class="data-table"><thead><tr><th>账号 / 主播</th><th>时段</th><th>状态</th><th>确认成交额</th><th>目标达成</th><th>净实收</th><th>贡献利润</th><th></th></tr></thead><tbody>${rows.sort((a, b) => a.start.localeCompare(b.start)).map(s => `<tr><td><b>${esc(anchorName(s.anchorId))}</b><div class="data-sub">${esc(accountName(s.accountId))}</div></td><td>${esc(sessionTime(s))}</td><td><span class="badge ${s.status}">${s.cancelled ? '已取消' : statusName(s.status)}</span></td><td>${money(s.orderAmount)}</td><td>${rate(s.orderAmount, s.target)}</td><td>${money(aggregate([s]).net)}</td><td>${money(aggregate([s]).profit)}</td><td><button class="icon" data-session="${esc(s.id)}" title="查看场次">${icon('arrow-up-right')}</button></td></tr>`).join('') || '<tr><td colspan="8" class="empty">当前日期没有场次</td></tr>'}</tbody></table></div>`; }
function ranking(rows) {
  const groups = groupRows(rows, 'anchor').sort((a, b) => b.profit - a.profit).slice(0, 5);
  return `<table class="mini-table"><thead><tr><th>主播</th><th>成交额</th><th>净实收</th><th>贡献利润</th></tr></thead><tbody>${groups.map((r, i) => `<tr><td><span class="rank-number ${i < 3 ? 'top' : ''}">${String(i + 1).padStart(2, '0')}</span>${esc(r.name)}</td><td>${money(r.orderAmount)}</td><td>${money(r.net)}</td><td class="${r.profit < 0 ? 'bad' : 'good'}">${money(r.profit)}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">暂无数据</td></tr>'}</tbody></table>`;
}
function attention(rows) {
  const tasks = state.data.tasks.filter(t => t.status !== 'done').sort((a, b) => a.due.localeCompare(b.due)).slice(0, 3);
  return tasks.map(t => `<div class="attention-row"><span class="attention-icon">${icon('flag')}</span><div><strong>${esc(t.title)}</strong><p>${esc(t.owner || '未分配')} · 截止 ${esc(t.due)} · ${statusName(t.status)}</p></div><button class="icon" data-task="${esc(t.id)}" title="打开复盘行动">${icon('arrow-up-right')}</button></div>`).join('') || '<div class="empty">所有行动已完成</div>';
}
function groupRows(rows, group) {
  const groups = new Map();
  rows.forEach(s => {
    const id = group === 'anchor' ? s.anchorId : group === 'date' ? s.date : group === 'slot' ? (s.scheduleUnknown || !s.start ? (s.slotLabel?.replace('（时段待补）', '') || '时段待补') : Number(s.start.slice(0, 2)) < 12 ? '早场' : Number(s.start.slice(0, 2)) < 17 ? '午场' : '晚场') : s.accountId;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(s);
  });
  return [...groups].map(([id, items]) => ({ id, name: group === 'anchor' ? anchorName(id) : group === 'account' ? accountName(id) : id, rows: items, ...aggregate(items) }));
}
const comparisons = [
  ['orderAmount', '业绩（元）', 'money'], ['orders', '单量', 'number'],
  ['actualMinutes', '实际时长', 'duration'], ['impressions', '浏览量', 'number'],
  ['shares', '分享次数', 'number'], ['newFollowers', '关注数', 'number']
];
const compareModes = [
  ['total', '全累计'],
  ['room-periods', '同直播间早中晚'],
  ['rooms', '直播间对比'],
  ['same-period', '同场次对比']
];
const comparePeriods = [...PERIODS, { id: 'unknown', name: '时段待补' }];
const compare = { mode: 'total', from: '', to: '', account: '', anchor: '', room: '', period: 'early' };
const comparisonStopped = row => row.sourceStatus === 'stopped' || row.cancelled === true;
function comparisonFigures(rows) {
  const applicable = rows.filter(row => !comparisonStopped(row));
  return Object.fromEntries(comparisons.map(([key]) => {
    const recorded = applicable.filter(row => Number.isFinite(row[key]));
    return [key, { value: recorded.length ? recorded.reduce((sum, row) => sum + (key === 'orderAmount' ? Math.round(row[key] * 100) : row[key]), 0) / (key === 'orderAmount' ? 100 : 1) : null, known: recorded.length, expected: applicable.length }];
  }));
}
function comparisonSelection() {
  const latest = lastCompletedDay();
  const first = state.data.sessions.reduce((day, row) => row.date < day ? row.date : day, latest);
  const from = compare.from || first;
  const to = compare.to || latest;
  const acrossRooms = compare.mode !== 'room-periods';
  const matchingDates = state.data.sessions.filter(row => row.date >= from && row.date <= to);
  const roomsWithRecords = new Set(matchingDates.map(row => row.accountId));
  const account = acrossRooms ? compare.account : compare.room ||
    state.data.accounts.find(room => roomsWithRecords.has(room.id))?.id || state.data.accounts[0]?.id || '';
  const accountRows = matchingDates.filter(row => !account || row.accountId === account);
  const anchorIds = new Set(accountRows.map(row => row.anchorId));
  const anchors = state.data.anchors.filter(anchor => anchorIds.has(anchor.id));
  const rows = accountRows.filter(row => !compare.anchor || row.anchorId === compare.anchor);
  return { from, to, latest, account, acrossRooms, anchors, rows };
}

function comparePage() {
  const selection = comparisonSelection();
  const { from, to, latest, account, acrossRooms, anchors } = selection;
  const tagged = selection.rows.map(row => ({ row, period: resolveShiftPeriod(row, state.data.slots) }));
  const shown = compare.mode === 'same-period' ? tagged.filter(item => item.period === compare.period) : tagged;
  const rows = shown.map(item => item.row);
  const columns = comparisons;
  const dayCount = Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1);
  const countsByDay = new Map();
  for (const row of rows) countsByDay.set(row.date, (countsByDay.get(row.date) || 0) + 1);
  const lowest = countsByDay.size === dayCount && dayCount ? Math.min(...countsByDay.values()) : 0;
  const highest = Math.max(0, ...countsByDay.values());
  const dailyCount = lowest === highest ? fmt(highest) : `${fmt(lowest)}–${fmt(highest)}`;
  const countCell = records => {
    const stopped = records.filter(comparisonStopped).length;
    const reported = records.filter(row => !comparisonStopped(row) && comparisons.some(([key]) => Number.isFinite(row[key]))).length;
    const pending = records.length - stopped - reported;
    const counts = [`已填 ${fmt(reported)}`];
    if (pending) counts.push(`待补 ${fmt(pending)}`);
    if (stopped) counts.push(`停播或取消 ${fmt(stopped)}`);
    return `<td class="compare-count"><strong>${fmt(records.length)}</strong><small class="data-sub">${counts.join(' · ')}</small></td>`;
  };
  if (!columns.some(([key]) => key === state.sort)) { state.sort = 'orderAmount'; state.direction = -1; }
  const makeGroup = (name, records) => ({ name, rows: records, figures: comparisonFigures(records) });
  const byRoom = compare.mode === 'rooms' || compare.mode === 'same-period';
  let groups = [];
  if (compare.mode === 'room-periods') {
    groups = comparePeriods.filter(period => period.id !== 'unknown' || tagged.some(item => item.period === 'unknown'))
      .map(period => makeGroup(period.name, shown.filter(item => item.period === period.id).map(item => item.row)));
  } else if (byRoom) {
    groups = state.data.accounts.filter(room => !account || room.id === account).map(room =>
      makeGroup(room.name, rows.filter(row => row.accountId === room.id)));
    groups.sort((a, b) => {
      const first = a.figures[state.sort].value, second = b.figures[state.sort].value;
      if (first === null) return second === null ? 0 : 1;
      if (second === null) return -1;
      return (first - second) * state.direction;
    });
  }
  const total = comparisonFigures(rows);
  const metricClass = key => `compare-metric${key === state.sort ? ' current' : ''}`;
  const value = (figure, type) => {
    const { value, known, expected } = figure;
    if (value === null) return '<span class="quiet">待补</span>';
    const minutes = Math.round(value);
    const label = type === 'money' ? money(value) : type === 'duration' ? `${Math.floor(minutes / 60)}h${minutes % 60}m` : fmt(value);
    return `${label}${known < expected ? `<small class="data-sub">${known}/${expected}场已填</small>` : ''}`;
  };
  const metricButtons = columns.map(([key, title]) => {
    const label = { orderAmount: '业绩', actualMinutes: '时长' }[key] || title;
    return `<button type="button" data-compare-metric="${key}" aria-pressed="${key === state.sort}">${label}</button>`;
  }).join('');
  return `${heading('数据对比', '按日期汇总直播运营数据。', manage ? exportButton() : '')}
  <div class="compare-modes" role="group" aria-label="对比方式">${compareModes.map(([key, title]) =>
    `<button type="button" data-compare-mode="${key}" aria-pressed="${compare.mode === key}">${title}</button>`).join('')}</div>
  <div class="compare-filters">
    <label>起始日期 <input type="date" aria-label="开始日期" data-compare-filter="from" value="${esc(from)}" max="${latest}"></label>
    <label>截止日期 <input type="date" aria-label="结束日期" data-compare-filter="to" value="${esc(to)}" max="${latest}"></label>
    <label>直播间 <select aria-label="筛选账号" data-compare-filter="${acrossRooms ? 'account' : 'room'}">${options(state.data.accounts, account, acrossRooms ? '全部直播间' : '')}</select></label>
    <label>主播 <select aria-label="筛选主播" data-compare-filter="anchor">${options(anchors, compare.anchor, '全部主播')}</select></label>
    ${compare.mode === 'same-period' ? `<label>场次时段 <select aria-label="场次时段" data-compare-filter="period">${options(comparePeriods, compare.period)}</select></label>` : ''}
    ${compare.from || compare.to ? '<button type="button" data-action="compare-reset-dates">恢复全量日期</button>' : ''}
  </div>
  <p class="compare-period-note" data-testid="compare-period-summary">已选 ${fmt(dayCount)} 天 · 区间累计 ${fmt(rows.length)} 场 · 每天 ${dailyCount} 条场次记录</p>
  <div class="compare-metric-buttons" role="group" aria-label="对比指标">${metricButtons}</div>
  <div class="table-scroll comparison-scroll">
    <table class="data-table comparison-table" data-testid="comparison-table">
      <thead><tr><th>${compare.mode === 'room-periods' ? '时段' : byRoom ? '直播间' : '汇总范围'}</th><th>区间累计场次</th>${columns.map(([key, title]) => `<th class="${metricClass(key)}">${byRoom ? `<button class="table-sort" data-sort="${key}">${title}${state.sort === key ? icon(state.direction === -1 ? 'arrow-down' : 'arrow-up') : ''}</button>` : title}</th>`).join('')}</tr></thead>
      <tbody>${groups.map(group => `<tr><th scope="row">${esc(group.name)}</th>${countCell(group.rows)}${columns.map(([key, , type]) => `<td class="${metricClass(key)}">${value(group.figures[key], type)}</td>`).join('')}</tr>`).join('')}
      <tr class="total-row"><th scope="row">区间合计</th>${countCell(rows)}${columns.map(([key, , type]) => `<td class="${metricClass(key)}">${value(total[key], type)}</td>`).join('')}</tr></tbody>
    </table>
  </div>
  <p class="rule-note">场次按所选日期逐日累加，含已填、待补、停播和取消记录。已填指至少登记一项指标，具体指标按各自的已填场次汇总。</p>`;
}
function overviewPage() {
  const rows = sessions(true), a = aggregate(rows);
  const dates = groupRows(rows, 'date').sort((a, b) => a.id.localeCompare(b.id));
  const max = Math.max(1, ...dates.map(d => d.net));
  const costParts = [['已售商品净成本', a.cogs], ['Facebook 广告费用', a.adSpend], ['物流 / 包装', a.shipping], ['平台 / 支付费用', a.fees], ['其他变动费用', a.otherCost]];
  return `${heading('经营总览', '从 Facebook 流量到客户回款，再到售出成本与场次利润。', exportButton())}${filters(true)}${kpis(rows)}<div class="two-col"><section><div class="section-bar"><h2>净实收趋势</h2><span class="spacer"></span><span class="quiet">按归属场次日期 · 人民币</span></div><div class="chart">${dates.map(d => `<div class="chart-bar"><i style="height:${Math.max(1, d.net / max * 78)}%" data-value="${money(d.net)}"></i><span>${esc(d.id.slice(5))}</span></div>`).join('') || '<div class="empty">暂无数据</div>'}</div><div class="section-bar" style="margin-top:30px"><h2>成本与贡献</h2></div><table class="mini-table"><tbody>${costParts.map(([label, v]) => `<tr><td>${label}</td><td>${money(v)}</td><td>${rate(v, a.net)} <span class="quiet">占净实收</span></td></tr>`).join('')}<tr><td><b>贡献利润（未扣固定成本）</b></td><td class="${a.profit < 0 ? 'bad' : 'good'}"><b>${money(a.profit)}</b></td><td>${rate(a.profit, a.net)}</td></tr></tbody></table></section><section><div class="section-bar"><h2>直播转化链路</h2><span class="spacer"></span><span class="quiet">场次累计 · 未跨场去重</span></div><div class="funnel">${[['观看人次', a.viewers, '#bdd0b5'], ['私信人数', a.messages, '#a2b99a'], ['有效询单', a.qualified, '#87a27d'], ['确认订单', a.orders, '#698964'], ['已付款订单', a.paidOrders, '#476d47']].map(([label, n, color], i) => `<div class="funnel-row"><span>${label}</span><div class="funnel-bar"><i style="width:${Math.max(1, i === 0 ? 100 : n / Math.max(1, a.viewers) * 100)}%;background:${color}"></i></div><strong>${fmt(n)}</strong></div>`).join('')}</div><div class="highlights"><span class="highlight">${icon('messages-square')}观看→私信 ${rate(a.messages, a.viewers)}</span><span class="highlight">${icon('badge-check')}询单→订单 ${rate(a.orders, a.qualified)}</span></div><p class="rule-note">私信与有效询单按“人”录入，同一客户在同一场内去重；订单按“单”统计，多次下单会影响转化解释。</p><div class="section-bar" style="margin-top:28px"><h2>资金与库存</h2></div><table class="mini-table"><tbody><tr><td>本期现金采购支出</td><td>${money(sum(state.data.inventory.filter(i => i.purchaseDate >= state.from && i.purchaseDate <= state.to), 'cost'))}</td></tr><tr><td>当前库存占款（在库 + 锁定）</td><td>${money(sum(state.data.inventory.filter(i => ['in_stock', 'reserved'].includes(i.state)), 'cost'))}</td></tr></tbody></table><p class="rule-note">采购支出记资金与库存；场次贡献扣的是匹配已售货品的成本，不会把采购支出再扣一遍。净实收、退款按原场次归属，不能替代银行日流水。</p></section></div>`;
}
function inventoryPage() {
  const items = state.data.inventory.filter(i => (!state.inventoryFilter || i.state === state.inventoryFilter) && (!state.query || `${i.sku} ${i.name} ${i.supplier} ${i.size}`.toLowerCase().includes(state.query.toLowerCase()))).sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate));
  return `${heading('现金采购 / 库存', '一镯一号，把向货主付出的现金，变成可追踪的库存。', canEdit() ? `<button class="primary" data-action="add-inventory" data-testid="inventory-add">${icon('plus')}采购入库</button>` : '')}<div class="filters"><label>采购日期 <input type="date" data-filter="from" aria-label="采购开始日期" value="${state.from}"></label><span class="quiet">至</span><label><input type="date" data-filter="to" aria-label="采购结束日期" value="${state.to}"></label><span class="quiet">日期只影响采购金额统计，库存为当前快照</span></div>${kpis([], true)}<div class="inventory-intro"><img src="./assets/jade-bangle.jpg" alt="玉镯示意图"><div><h3>现金采购与销售成本分开记</h3><p>采购时记货主、成本与货号；成交后关联场次。退货恢复库存时同步调整该场次的已售成本。</p></div></div><div class="filters"><input class="filter-search" type="search" data-filter="query" value="${esc(state.query)}" placeholder="搜索货号、货主、圈口" aria-label="搜索库存"><select data-filter="inventoryFilter" aria-label="库存状态">${statusOptions(['in_stock', 'reserved', 'sold', 'returned'], state.inventoryFilter, '全部库存状态')}</select><span class="spacer"></span><span class="quiet">${items.length} 件 · 按最近采购排序</span></div><div class="table-scroll"><table class="data-table"><thead><tr><th>货号 / 货品</th><th>圈口</th><th>货主</th><th>采购日期</th><th>现金采购成本</th><th>标价</th><th>当前状态</th><th>归属场次</th><th>最后修改</th><th></th></tr></thead><tbody>${items.map(i => `<tr><td><div class="data-name"><img class="item-photo" src="./assets/jade-bangle.jpg" alt="玉镯示意"><div>${esc(i.sku)}<div class="data-sub">${esc(i.name)}</div></div></div></td><td>${esc(i.size)} mm</td><td>${esc(i.supplier)}</td><td>${esc(i.purchaseDate)}</td><td>${money(i.cost)}</td><td>${money(i.askingPrice)}</td><td><span class="badge ${i.state === 'sold' ? 'blue' : i.state === 'reserved' ? 'planned' : i.state === 'returned' ? 'red' : ''}">${statusName(i.state)}</span></td><td>${sessionLabel(i.sessionId)}</td><td>${esc(i.updatedBy || '—')}</td><td><button class="icon" data-inventory="${esc(i.id)}" title="查看货品" aria-label="查看货品">${icon('arrow-up-right')}</button></td></tr>`).join('') || '<tr><td colspan="10" class="empty">未找到货品</td></tr>'}</tbody></table></div><p class="rule-note">当前为采购库存台账，场次已售成本需由财务核对录入；库存状态变更不会自动重复计入场次成本。示意图片来源：Auckland Museum，CC BY 4.0，非实际货品照片。</p>`;
}
function sessionLabel(id) { const s = state.data.sessions.find(s => s.id === id); return s ? `${esc(s.date.slice(5))} ${esc(anchorName(s.anchorId))} ${esc(s.start)}` : '—'; }
function reviewPage() {
  const tasks = state.data.tasks.filter(t => !state.taskFilter || t.status === state.taskFilter);
  return `${heading('复盘行动', '用证据定位问题，让每个调整都有责任人、截止时间和验收标准。', canEdit() ? `<button class="primary" data-action="add-task" data-testid="review-add">${icon('plus')}新建复盘</button>` : '')}<div class="filters"><select data-filter="taskFilter" aria-label="复盘状态">${statusOptions(['open', 'doing', 'done'], state.taskFilter, '全部复盘')}</select><span class="quiet">${state.data.tasks.filter(t => t.status !== 'done').length} 项未完成</span><span class="spacer"></span><button data-action="audit">${icon('history')}修改记录</button></div><div class="review-board">${[['open', '待处理'], ['doing', '进行中'], ['done', '已验收']].map(([key, title]) => `<section class="review-col"><div class="review-col-head"><span class="dot" style="background:${key === 'open' ? '#bd9c65' : key === 'doing' ? '#7d9fbb' : '#81a381'}"></span>${title}<span class="count">${tasks.filter(t => t.status === key).length}</span></div>${tasks.filter(t => t.status === key).map(t => `<article class="task" tabindex="0" role="button" data-task="${esc(t.id)}" aria-label="${esc(t.title)}"><span class="badge ${key === 'open' ? 'planned' : key === 'doing' ? 'blue' : ''}">${t.sessionId ? sessionLabel(t.sessionId) : '跨场复盘'}</span><h3>${esc(t.title)}</h3><p>${esc(t.evidence || '待补充事实证据')}</p><p><b>动作</b> ${esc(t.action || '待明确执行动作')}</p><div class="task-footer"><span>${esc(t.owner || '待分配')}</span><span class="${t.due < today && key !== 'done' ? 'bad' : ''}">截止 ${esc(t.due)}</span></div></article>`).join('') || '<div class="empty">暂无行动</div>'}</section>`).join('')}</div>`;
}
function methodPage() {
  return `${heading('指标口径', '统一口径，再比较表现。不同日期与场次始终用同一套算法。', `<button data-action="audit">${icon('history')}修改记录</button>`)}<div class="two-col"><section><div class="section-bar"><h2>销售与资金</h2></div><ul class="method-list"><li><strong>确认成交额 ≠ 实收</strong><p>确认成交额为已确认订单金额；实收为客户实际付款。净实收 = 实收 − 已退金额，均归属原场次。未付款订单不计实收。</p></li><li><strong>贡献利润 ≠ 财务净利润</strong><p>净实收 − 已售商品净成本 − 广告费 − 物流包装 − 平台支付费 − 其他变动费用。未扣工资、房租等固定费用；不替代会计利润。</p></li><li><strong>现金采购支出 ≠ 当期销售成本</strong><p>向货主现金采购时增加库存；只将已售货品匹配成本计入场次。退货恢复库存时调减已售成本，不重复扣采购现金。</p></li><li><strong>金额退款率</strong><p>已退金额 ÷ 实收（退款前）。按订单原场次追踪，适合比较成熟场次，近期场次的售后尚未结束。</p></li></ul></section><section><div class="section-bar"><h2>流量与效率</h2></div><ul class="method-list"><li><strong>观看人次与跨场去重</strong><p>每场观看人数采用 Facebook 导出值；跨场仅相加为观看人次，不能当作公司去重触达。平均观看时长按观看人数加权。</p></li><li><strong>有效询单与确认订单</strong><p>有效询单为有明确货品、圈口、预算或购买意向的客户数；同场同客去重。询单转化 = 订单数 ÷ 有效询单人数，允许同客多单。</p></li><li><strong>广告倍数与每小时成交</strong><p>成交广告倍数 = 确认成交额 ÷ 广告费，不命名为 ROI。每小时成交 = 成交额 ÷ 排期时长。未填广告费或时长为零时显示“—”。</p></li><li><strong>汇总与修改</strong><p>比例使用汇总后的分子 ÷ 分母，不能简单平均各主播百分比。场次与采购台账按版本保存；同记录并发修改会阻止覆盖。</p></li></ul></section></div><p class="rule-note">本版为人工录入与 CSV 导出的协作原型，尚未连接 Facebook API、订单系统、物流系统或银行流水。演示数据只是虚构样例。</p>`;
}
function field(name, label, value = '', type = 'number', help = '') {
  return `<div class="field"><label for="f-${name}">${label}</label><input id="f-${name}" name="${name}" type="${type}" value="${esc(value)}" ${type === 'number' ? 'min="0" step="0.01"' : ''} ${['date', 'start', 'end', 'sku', 'title', 'cost', 'purchaseDate', 'username', 'password', 'name'].includes(name) ? 'required' : ''}>${help ? `<span class="form-help">${help}</span>` : ''}</div>`;
}
function selectField(name, label, markup) { return `<div class="field"><label for="f-${name}">${label}</label><select id="f-${name}" name="${name}">${markup}</select></div>`; }
function textField(name, label, value = '', help = '') { return `<div class="field full"><label for="f-${name}">${label}</label><textarea id="f-${name}" name="${name}">${esc(value)}</textarea>${help ? `<span class="form-help">${help}</span>` : ''}</div>`; }
function openForm(title, subtitle, body, kind, record, testid = '') {
  dialog.innerHTML = `<form id="edit-form" data-kind="${kind}" ${testid ? `data-testid="${testid}"` : ''}><header class="dialog-head"><div><h2>${title}</h2><div class="quiet">${subtitle}</div></div><button type="button" class="icon" data-close aria-label="关闭" title="关闭">${icon('x')}</button></header><div class="dialog-body">${!canEdit() ? '<div class="read-only-note">当前为只读权限</div>' : ''}<fieldset ${!canEdit() ? 'disabled' : ''} style="padding:0;border:0;margin:0">${body}</fieldset><div class="dialog-error error" id="dialog-error" hidden role="alert"></div></div><footer class="dialog-footer"><span class="quiet">${record?.id ? `版本 ${record.version} · 上次修改 ${esc(record.updatedBy || '—')}` : '新建记录 · 全体成员共享'}</span><button type="button" data-close>取消</button>${canEdit() ? '<button class="primary" type="submit" data-testid="save-record">保存记录</button>' : ''}</footer></form>`;
  dialog.record = record || null;
  if (kind === 'session' && record?.scheduleUnknown) {
    const checkbox = document.createElement('label'); checkbox.className='unknown-schedule'; checkbox.innerHTML='<input type="checkbox" id="f-scheduleUnknown" checked> 实际时段待补（不使用占位时间）';
    $('.dialog-body',dialog).prepend(checkbox);
    const update=()=>{for(const name of ['start','end']){const input=dialog.querySelector(`[name="${name}"]`);input.disabled=$('#f-scheduleUnknown').checked;input.value=$('#f-scheduleUnknown').checked?'':record[name];}};
    checkbox.addEventListener('change',update);update();
  }
  dialog.showModal();
  icons();
}
const sessionNumbers = ['target', 'reach', 'impressions', 'viewers', 'peak', 'watchSeconds', 'interactions', 'newFollowers', 'messages', 'qualified', 'orders', 'orderAmount', 'paidOrders', 'received', 'refundOrders', 'refunds', 'units', 'cogs', 'adSpend', 'shipping', 'fees', 'otherCost'];
function openSession(id, preset = {}) {
  const roomChoices = state.data.accounts;
  const existing = state.data.sessions.find(session => session.id === id);
  if (id && !existing) return;
  const activeRooms = roomChoices.filter(room => room.active !== false || room.id === existing?.accountId);
  if (!activeRooms.length) { toast('请先启用一个直播间'); return; }
  const s = existing || {
    date: state.date, accountId: state.account, anchorId: state.anchor,
    start: '08:00', end: '12:00', status: 'planned', ...preset
  };
  if (!existing && !activeRooms.some(room => room.id === s.accountId)) s.accountId = activeRooms[0].id;
  const currentOptions = `${selectField('accountId', '直播间', options(activeRooms, s.accountId))}${selectField('anchorId', '主播', '')}${selectField('slotId', '直播场次', '')}`;
  const numbers = list => list.map(([name, label, help]) => field(name, label, s[name] ?? '', 'number', help)).join('');
  openForm(id ? `${accountName(s.accountId)} · ${anchorName(s.anchorId)}` : '新建直播场次', '流量由运营录入，订单与回款由客服 / 财务核对。', `<h3 class="form-section">排期与实际直播</h3><div class="form-grid">${field('date', '直播日期', s.date, 'date')}${currentOptions}${field('start', '排期开始时间', s.start, 'time')}${field('end', '排期结束时间', s.end, 'time')}${selectField('status', '场次状态', statusOptions(['planned', 'live', 'completed'], s.status))}${field('actualMinutes', '实际直播时长（分钟）', s.actualMinutes ?? '', 'number', '播后登记；空白为未登记，0 为确实未播')}${numbers([['target', '目标成交额（元）']])}</div><h3 class="form-section">Facebook 流量</h3><div class="form-grid">${numbers([['reach', '本场触达人数'], ['impressions', '本场浏览量（曝光总数）'], ['viewers', '本场观看人数'], ['peak', '最高同时在线'], ['watchSeconds', '平均观看时长（秒）'], ['interactions', '互动次数'], ['newFollowers', '本场新增粉丝'], ['messages', '私信人数'], ['qualified', '有效询单人数', '同场同客去重，有明确货品 / 购买意向']])}</div><h3 class="form-section">成交、收款与退款</h3><div class="form-grid">${numbers([['orders', '确认订单（单）'], ['orderAmount', '销售金额（元）'], ['units', '成交件数（件）'], ['paidOrders', '已付款订单（单）'], ['received', '实际收款（元）', '退款前实收，归属原场次'], ['refundOrders', '退款订单（单）'], ['refunds', '已退金额（元）']])}</div><h3 class="form-section">销售匹配成本与场次费用</h3><div class="form-grid">${numbers([['cogs', '已售商品净成本（元）', '已退入库货品的成本需调减，不填整批采购支出'], ['adSpend', '广告费用（元）'], ['shipping', '物流 / 包装（元）'], ['fees', '平台 / 支付费用（元）'], ['otherCost', '其他变动费用（元）']])}${textField('notes', '场次备注 / 复盘线索', s.notes)}</div>`, 'session', existing, 'session-dialog');
  const form = dialog.querySelector('form');
  const { accountId, anchorId, slotId, date } = form.elements;
  const eligible = (anchor, room) => anchor.active !== false && (!anchor.accountId || anchor.accountId === room)
    && (!anchor.activeFrom || anchor.activeFrom <= date.value) && (!anchor.activeTo || anchor.activeTo >= date.value);
  function refreshSlots(preferred) {
    const assigned = state.data.anchors.find(anchor => anchor.id === anchorId.value);
    const room = accountId.value;
    const preserve = existing?.accountId === room && existing?.anchorId === anchorId.value && existing?.date === date.value;
    const activeSlots = state.data.slots.filter(slot => slot.accountId === room && (slot.active !== false || (preserve && slot.id === existing.slotId)));
    if (preserve && !existing.slotId) activeSlots.unshift({ id: '', name: '历史场次' });
    slotId.innerHTML = activeSlots.length ? options(activeSlots, preferred ?? assigned?.slotId) : '<option value="">尚无可用场次</option>';
  }
  function refreshAnchors(preferred, preferredSlot) {
    const room = accountId.value;
    const preserve = existing?.accountId === room && existing?.date === date.value;
    const available = state.data.anchors.filter(anchor => eligible(anchor, room) || (preserve && anchor.id === existing.anchorId));
    const selected = available.find(anchor => anchor.id === preferred) || available[0];
    anchorId.innerHTML = available.length ? options(available, selected.id) : '<option value="">暂无可用主播</option>';
    anchorId.required = true;
    refreshSlots(preferredSlot);
  }
  const scheduledAnchor = preset.slotId && state.data.anchors.find(anchor => anchor.slotId === preset.slotId && eligible(anchor, s.accountId));
  if (preset.slotId && !scheduledAnchor) {
    dialog.close();
    toast('请先在直播名录分配此场次的主播');
    return;
  }
  refreshAnchors(scheduledAnchor?.id || s.anchorId, preset.slotId ?? existing?.slotId ?? (existing ? '' : undefined));
  const startInput = form.elements.start;
  const endInput = form.elements.end;
  const unknown = dialog.querySelector('#f-scheduleUnknown');
  function showSlotTiming() {
    const selected = state.data.slots.find(item => item.id === slotId.value && item.accountId === accountId.value);
    const reassigned = !existing || accountId.value !== existing.accountId || anchorId.value !== existing.anchorId ||
      date.value !== existing.date || slotId.value !== (existing.slotId || '');
    const fixed = reassigned && Boolean(selected?.period);
    startInput.readOnly = fixed;
    endInput.readOnly = fixed;
    endInput.labels[0].textContent = (fixed ? selected.endDayOffset : existing?.endDayOffset) === 1 ? '排期结束时间（次日）' : '排期结束时间';
    if (!fixed) return;
    if (unknown) {
      unknown.checked = false;
      startInput.disabled = false;
      endInput.disabled = false;
    }
    startInput.value = selected.start;
    endInput.value = selected.end;
  }
  showSlotTiming();
  accountId.addEventListener('change', () => refreshAnchors());
  date.addEventListener('change', () => refreshAnchors(anchorId.value, slotId.value));
  anchorId.addEventListener('change', () => refreshSlots());
  for (const input of [accountId, date, anchorId, slotId]) input.addEventListener('change', showSlotTiming);
  if (isDirectoryAdmin() && existing?.status === 'planned' && !existing.cancelled) {
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = '取消此排期';
    dialog.querySelector('.dialog-footer').prepend(cancel);
    cancel.addEventListener('click', async () => {
      if (!window.confirm('取消这次排期？历史记录会标记为停播。')) return;
      cancel.disabled = true;
      try {
        await api('/api/sessions/' + encodeURIComponent(existing.id), { version: existing.version }, 'DELETE');
        dialog.close();
        await reload();
        toast('排期已取消');
      } catch (error) {
        const errorBox = dialog.querySelector('[role=alert]');
        errorBox.hidden = false;
        errorBox.textContent = error.message;
        cancel.disabled = false;
      }
    });
  }
}
function openInventory(id) {
  const i = state.data.inventory.find(i => i.id === id) || { sku: '', name: '', size: '', supplier: '', purchaseDate: today, cost: 0, askingPrice: 0, state: 'in_stock', sessionId: '', notes: '' };
  openForm(id ? `货品 ${i.sku}` : '现金采购入库', '一镯一号；采购支出记录在库存账，不直接扣场次利润。', `<div class="form-grid two">${field('sku', '唯一货号', i.sku, 'text')}${field('name', '货品名称', i.name, 'text')}${field('size', '圈口（mm）', i.size, 'text')}${field('supplier', '货主 / 供货人', i.supplier, 'text')}${field('purchaseDate', '现金采购日期', i.purchaseDate, 'date')}${field('cost', '现金采购成本（元）', i.cost)}${field('askingPrice', '建议标价（元）', i.askingPrice)}${selectField('state', '库存状态', statusOptions(['in_stock', 'reserved', 'sold', 'returned'], i.state))}${selectField('sessionId', '关联成交场次', options(state.data.sessions.map(s => ({ id: s.id, name: `${s.date} ${accountName(s.accountId)} ${anchorName(s.anchorId)} ${s.start}` })), i.sessionId, '暂不关联'))}${textField('notes', '鉴定 / 货况 / 付款备注', i.notes)}</div>`, 'inventory', id ? i : null, 'inventory-dialog');
}
function openTask(id) {
  const t = state.data.tasks.find(t => t.id === id) || { title: '', sessionId: '', owner: state.data.user?.name || '', due: shiftDate(today, 1), status: 'open', evidence: '', action: '', acceptance: '' };
  openForm(id ? '复盘行动详情' : '新建复盘行动', '先记事实，再写动作，最后约定如何验收。', `<div class="form-grid two">${field('title', '问题 / 改进目标', t.title, 'text')}${selectField('sessionId', '关联场次', options(state.data.sessions.map(s => ({ id: s.id, name: `${s.date} ${anchorName(s.anchorId)} ${s.start}` })), t.sessionId, '跨场复盘'))}${field('owner', '责任人', t.owner, 'text')}${field('due', '完成截止日期', t.due, 'date')}${selectField('status', '行动状态', statusOptions(['open', 'doing', 'done'], t.status))}${textField('evidence', '事实与证据', t.evidence, '写清账号、场次、指标差异；区分观察与猜测。')}${textField('action', '调整动作 / 要验证的假设', t.action)}${textField('acceptance', '验收标准 / 实际结果', t.acceptance, '完成后记录结果，避免只关闭待办。')}</div>`, 'task', id ? t : null, 'review-dialog');
}
async function openAudit() {
  try {
    const response = await api('/api/audit');
    const audit = Array.isArray(response) ? response : response.audit || response.entries || [];
    dialog.innerHTML = `<header class="dialog-head"><div><h2>修改记录</h2><div class="quiet">最近 100 条 · 保存操作由服务器记录</div></div><button class="icon" data-close aria-label="关闭">${icon('x')}</button></header><div class="dialog-body">${audit.map(a => `<div class="audit-entry"><strong>${esc(a.actor || a.userName || a.username || a.user || a.updatedBy || '成员')}</strong> · ${esc(a.action || '修改')} · ${esc(a.entity || a.resource || a.type || '')}<p>${esc(a.summary || a.entityId || a.recordId || a.id || '')} · ${esc(a.at || a.createdAt || a.timestamp || '')}</p></div>`).join('') || '<div class="empty">暂无修改记录</div>'}</div>`;
    dialog.showModal(); icons();
  } catch (e) { toast(e.message); }
}
async function profile() {
  let users = [];
  if (state.data.user?.role === 'admin') { try { const r = await api('/api/users'); users = Array.isArray(r) ? r : r.users || []; } catch (e) { toast(e.message); } }
  dialog.innerHTML = `<header class="dialog-head"><div><h2>工作空间成员</h2><div class="quiet">${esc(state.data.user?.name)} · ${roleName(state.data.user?.role)}</div></div><button class="icon" data-close aria-label="关闭">${icon('x')}</button></header><div class="dialog-body">${users.map(u => `<div class="user-row"><span class="avatar">${esc(u.name?.slice(0, 1))}</span><strong>${esc(u.name)}</strong><span class="quiet">${esc(u.username)}</span><span class="badge neutral">${roleName(u.role)}</span></div>`).join('')}${state.data.user?.role === 'admin' ? `<form id="member-form"><h3 class="form-section">新增成员</h3><div class="form-grid two">${field('name', '姓名', '', 'text')}${field('username', '登录账号', '', 'text')}${field('password', '初始密码（至少12位）', '', 'password')}${selectField('role', '权限', '<option value="anchor_entry">主播录入 · 时间与直播基础数据</option><option value="service_entry">客服录入 · 单量与询单</option><option value="manager">主管 · 录入业绩及查看结果</option><option value="admin">管理员 · 全部数据与成员管理</option>')}</div><div class="dialog-error error" id="member-error" hidden role="alert"></div><button type="submit" class="primary" style="margin-top:20px">${icon('user-plus')}创建成员</button></form>` : '<p class="rule-note">管理员可以创建编辑与查看账号。</p>'}</div><footer class="dialog-footer"><button data-action="logout">${icon('log-out')}退出登录</button></footer>`;
  dialog.showModal(); icons();
}
async function saveRecord(form) {
  const kind = form.dataset.kind;
  const data = Object.fromEntries(new FormData(form));
  const numberKeys = kind === 'session' ? sessionNumbers : kind === 'inventory' ? ['cost', 'askingPrice'] : [];
  for (const key of numberKeys) data[key] = data[key] === '' ? null : Number(data[key]);
  if (kind === 'session') {
    data.actualMinutes = data.actualMinutes === '' ? null : Number(data.actualMinutes);
    if (!data.slotId || data.slotId === dialog.record?.slotId) delete data.slotId;
  }
  if (kind === 'session' && dialog.record?.scheduleUnknown) {
    data.scheduleUnknown = $('#f-scheduleUnknown')?.checked ?? true;
    if (data.scheduleUnknown) { data.start='00:00'; data.end='00:01'; }
  }
  if (kind === 'session' && !data.scheduleUnknown) data.endDayOffset = data.end < data.start ? 1 : 0;
  if (kind === 'task' && (!data.title.trim() || !data.owner.trim())) throw new Error('请填写改进目标和责任人。');
  const record = dialog.record;
  if (record) data.version = record.version;
  const endpoint = kind === 'session' ? 'sessions' : kind === 'inventory' ? 'inventory' : kind === 'account' ? 'accounts' : kind === 'anchor' ? 'anchors' : 'tasks';
  await api(`/api/${endpoint}${record ? `/${encodeURIComponent(record.id)}` : ''}`, data, record ? 'PUT' : 'POST');
  dialog.close();
  await reload();
  toast('已保存，全体成员可查看最新记录');
}
function resetDashboard() {
  Object.assign(compare, { mode: 'total', from: '', to: '', account: '', anchor: '', room: '', period: 'early' });
  directory.reset();
  anchorReview.reset();
  state.data = null;
  state.view = initialView;
  window.dispatchEvent(new Event('monthly-reset'));
  if (dialog.open) dialog.close();
}

function showLogin(demo = false, error = '') {
  resetDashboard();
  root.innerHTML = `
    <main class="board-auth">
      <form class="login-box" id="login-form">
        <h1>销售管理登录</h1>
        <div class="field">
          <label for="login-user">账号</label>
          <input id="login-user" name="username" autocomplete="username" data-testid="login-user" value="${demo ? 'demo' : ''}" required>
        </div>
        <div class="field">
          <label for="login-password">密码</label>
          <input id="login-password" name="password" type="password" autocomplete="current-password" data-testid="login-password" required>
        </div>
        <button class="primary" type="submit" data-testid="login-submit">登录 ${icon('arrow-right')}</button>
        <div class="login-error error" role="alert">${esc(error)}</div>
        <a class="login-entry-link" href="./dashboard">返回看板</a>
      </form>
    </main>`;
  icons();
}

function showDashboardUnlock(error = '') {
  resetDashboard();
  root.innerHTML = `
    <main class="board-auth">
      <form class="login-box" id="dashboard-unlock">
        <h1>看板</h1>
        <div class="field">
          <label for="dashboard-password">看板密码</label>
          <input id="dashboard-password" name="password" type="password" autocomplete="off" required>
        </div>
        <button class="primary" type="submit">进入看板</button>
        <div class="login-error error" role="alert">${esc(error)}</div>
      </form>
    </main>`;
  icons();
}

function showAccessForm(error = '', demo = false) {
  if (manage) showLogin(demo, error);
  else showDashboardUnlock(error);
}

document.addEventListener('submit', async e => {
  if (!['login-form', 'dashboard-unlock', 'edit-form', 'member-form'].includes(e.target.id)) return;
  e.preventDefault();
  const submit = e.target.querySelector('button[type=submit]');
  if (submit) submit.disabled = true;
  try {
    if (e.target.id === 'login-form') { await api('/api/login', Object.fromEntries(new FormData(e.target)), 'POST'); await reload(); }
    else if (e.target.id === 'dashboard-unlock') {
      submit.textContent = '正在进入…';
      const input = e.target.elements.password;
      const password = input.value;
      input.value = '';
      if (manage) {
        await api('/api/dashboard/unlock', { password, mode: 'manage' }, 'POST');
        await reload();
      } else {
        const data = await api('/api/dashboard/unlock?include=dashboard', { password }, 'POST');
        if (Array.isArray(data.sessions)) loadDashboard(data);
        else await reload();
      }
    } else if (e.target.id === 'edit-form') await saveRecord(e.target);
    else { const data = Object.fromEntries(new FormData(e.target)); if (data.password.length < 12) throw new Error('成员密码至少需要12位。'); await api('/api/users', data, 'POST'); dialog.close(); await profile(); toast('新成员已创建'); }
  } catch (error) {
    const box = $('.login-error', e.target) || (e.target.id === 'member-form' ? $('#member-error') : $('#dialog-error'));
    if (error.code === 'DASHBOARD_LOCKED') {
      showDashboardUnlock();
      return;
    }
    if (box) { box.hidden = false; box.textContent = error.status === 409 ? `${error.message}。请先保留本次输入，再关闭并重新打开记录查看最新版本。` : error.message; box.scrollIntoView({ block: 'nearest' }); }
    if (error.status === 401 && error.code !== 'DASHBOARD_PASSWORD_INVALID' && e.target.id !== 'login-form') {
      if (dialog.open) dialog.close();
      showAccessForm('访问已过期，请重新验证。');
    }
  } finally {
    if (submit) submit.disabled = false;
    if (e.target.id === 'dashboard-unlock') submit.textContent = '进入看板';
  }
});
document.addEventListener('click', async e => {
  const target = e.target.closest('button,[data-task],[data-performer]');
  if (!target) return;
  if (target.hasAttribute('data-close')) { dialog.close(); return; }
  if (target.dataset.dailyMetric) {
    state.dailyMetric = target.dataset.dailyMetric;
    render();
    $('[data-daily-metric][aria-pressed="true"]')?.focus({ preventScroll: true });
    return;
  }
  if (target.dataset.view && canOpenView(target.dataset.view)) {
    if (state.view === 'daily') {
      const date = state.dailyDate || lastCompletedDay();
      state.periodEnd = date;
      state.from = shiftDate(date, 1 - Number(state.windowDays));
      state.to = date;
    }
    if (target.dataset.view === 'session-details' && state.view === 'daily') {
      state.detailDate = state.dailyDate || lastCompletedDay();
    }
    state.view = target.dataset.view;
    state.query = '';
    render();
    return;
  }
  if (target.dataset.session) { openSession(target.dataset.session); return; }
  if (target.dataset.importOpen) { openSession(target.dataset.importOpen); return; }
  if (target.dataset.importGroup) { state.importGroup=target.dataset.importGroup; render(); return; }
  if (target.dataset.inventory) { openInventory(target.dataset.inventory); return; }
  if (target.dataset.task) { openTask(target.dataset.task); return; }
  if (target.dataset.addAccount) { openSession(null, { accountId: target.dataset.addAccount, slotId: target.dataset.addSlot }); return; }
  if (target.dataset.compareMode) {
    compare.mode = target.dataset.compareMode;
    compare.anchor = '';
    render();
    $(`[data-compare-mode="${compare.mode}"]`)?.focus({ preventScroll: true });
    return;
  }
  if (target.dataset.group) { state.group = target.dataset.group; render(); return; }
  if (target.dataset.days) { state.windowDays = Number(target.dataset.days); render(); return; }
  if (target.dataset.performanceGroup) { state.performanceGroup = target.dataset.performanceGroup; if (state.performanceGroup === 'anchor' && state.performanceMetric === 'monthFollowers') state.performanceMetric = 'orderAmount'; state.selectedPerformer = ''; render(); return; }
  if (target.dataset.metric) { state.performanceMetric = target.dataset.metric; if (target.dataset.metric === 'monthFollowers') { state.performanceGroup = 'account'; state.selectedPerformer = ''; } render(); return; }
  if (target.dataset.performer) { state.selectedPerformer = target.dataset.performer; render(); $('.decomposition')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  if (target.dataset.compareMetric) {
    const metric = target.dataset.compareMetric;
    if (state.sort === metric) return;
    state.sort = metric;
    state.direction = -1;
    render();
    $(`[data-compare-metric="${metric}"]`)?.focus({ preventScroll: true });
    return;
  }
  if (target.dataset.sort) { state.direction = state.sort === target.dataset.sort ? -state.direction : -1; state.sort = target.dataset.sort; render(); return; }
  const action = target.dataset.action;
  try {
    if (action === 'compare-reset-dates') {
      compare.from = '';
      compare.to = '';
      compare.anchor = '';
      render();
    }
    if (action === 'daily-today') { state.dailyDate = beijingToday(); render(); }
    if (action === 'daily-yesterday') { state.dailyDate = ''; render(); }
    if (action === 'daily-fullscreen') {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      else toast('请使用浏览器的全屏功能');
    }
    if (action === 'daily-schedule') {
      state.date = state.dailyDate || lastCompletedDay();
      state.periodEnd = state.date;
      state.account = '';
      state.anchor = '';
      state.view = 'schedule';
      state.scheduleMode = 'list';
      render();
    }
    if (action === 'add-session') openSession();
    if (action === 'record-today') { state.date = state.periodEnd; state.view = 'schedule'; state.scheduleMode = 'list'; render(); }
    if (action === 'add-inventory') openInventory();
    if (action === 'add-task') openTask();
    if (action === 'refresh') { window.dispatchEvent(new Event('monthly-invalidate')); await reload(); toast('已同步最新数据'); }
    if (action === 'profile') await profile();
    if (action === 'detail-toggle-history') { state.detailHistory = !state.detailHistory; render(); }
    if (action === 'directory' && isDirectoryAdmin()) {
      dialog.close();
      state.view = 'directory';
      render();
    }
    if (action === 'audit') await openAudit();
    if (action === 'logout') { await api('/api/logout', {}, 'POST'); showAccessForm('', state.data?.demo); }
    if (action === 'previous-day' || action === 'next-day' || action === 'today') { state.date = action === 'today' ? today : shiftDate(state.date, action === 'previous-day' ? -1 : 1); render(); }
    if (action === 'last7') { state.from = shiftDate(today, -6); state.to = today; render(); }
    if (action === 'grid-mode' || action === 'list-mode') { state.scheduleMode = action === 'grid-mode' ? 'grid' : 'list'; render(); }
    if (action === 'period-prev' || action === 'period-next' || action === 'period-today') { const latest = manage && state.data.dataset?.cutoffDate ? [state.data.dataset.cutoffDate, today].sort().at(-1) : beijingToday(); state.periodEnd = action === 'period-today' ? latest : shiftDate(state.periodEnd, action === 'period-prev' ? -1 : 1); if (state.periodEnd > latest) state.periodEnd=latest; render(); }
    if (action === 'performance-task') { openTask(); $('#f-title').value = '销售变化复盘：' + (state.selectedPerformer ? (state.performanceGroup === 'account' ? accountName(state.selectedPerformer) : anchorName(state.selectedPerformer)) : '当前账号合计'); const p = periodInfo(); $('#f-evidence').value = `${p.start}—${p.end} 与 ${p.previousStart}—${p.previousEnd} 对比。请结合触达、私信、询单、订单均价、实际时长填写具体证据。`; }
    if (action === 'export') {
      const range = state.view !== 'schedule';
      const imported = state.data.dataset?.kind === 'imported';
      const selection = state.view === 'compare' ? comparisonSelection() : null;
      const dateFrom = selection?.from ?? (imported ? periodInfo().start : range ? state.from : state.date);
      const dateTo = selection?.to ?? (imported ? state.periodEnd : range ? state.to : state.date);
      const account = selection ? selection.account : state.account;
      const anchor = selection ? compare.anchor : state.anchor;
      const params = new URLSearchParams({ dateFrom, dateTo });
      if (account) params.set('accountId', account);
      if (anchor) params.set('anchorId', anchor);
      if (selection && compare.mode === 'same-period') params.set('period', compare.period);
      const link = document.createElement('a');
      link.href = `./api/export.csv?${params}`;
      link.download = '直播场次统计.csv';
      link.click();
    }
  } catch (error) {
    if (error.code === 'DASHBOARD_LOCKED') showDashboardUnlock();
    else if (error.status === 401) showAccessForm('访问已过期，请重新验证。');
    else toast(error.message);
  }
});
document.addEventListener('change', e => {
  const compareKey = e.target.dataset.compareFilter;
  if (compareKey) {
    const value = e.target.value;
    if (compareKey === 'from' || compareKey === 'to') {
      const { from, to, latest } = comparisonSelection();
      if (value > latest) { render(); return; }
      compare[compareKey] = value;
      if (compareKey === 'from' && value > to) compare.to = value;
      if (compareKey === 'to' && value && value < from) compare.from = value;
      if (!comparisonSelection().anchors.some(anchor => anchor.id === compare.anchor)) compare.anchor = '';
    } else {
      compare[compareKey] = value;
      if (compareKey === 'account' || compareKey === 'room') compare.anchor = '';
    }
    render();
    $(`[data-compare-filter="${compareKey}"]`)?.focus({ preventScroll: true });
    return;
  }
  const key = e.target.dataset.filter;
  if (!key) return;
  const value = e.target.value;
  if (!value && ['date', 'from', 'to', 'periodEnd', 'dailyDate', 'detailDate'].includes(key)) return;
  if (['dailyDate', 'detailDate'].includes(key) && value > beijingToday()) {
    render();
    return;
  }
  state[key] = value;
  if (key === 'account') state.anchor='';
  if (key === 'detailAccount') state.detailAnchor = '';
  if (key === 'periodEnd' && value > today) state.periodEnd = today;
  if (key === 'from' && state.from > state.to) state.to = state.from;
  if (key === 'to' && state.to < state.from) state.from = state.to;
  if (key === 'sort') state.direction = -1;
  render();
});
document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('article[data-task]')) { e.preventDefault(); openTask(e.target.dataset.task); } });
dialog.addEventListener('click', e => { if (e.target === dialog) { const rect = dialog.getBoundingClientRect(); if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) dialog.close(); } });
new MutationObserver(() => {
  const close = dialog.querySelector('.dialog-head [data-close]');
  if (!dialog.open || !close || dialog.querySelector('.cooperation-dialog-link')) return;
  const actions = document.createElement('div');
  actions.className = 'cooperation-dialog-actions';
  const link = document.createElement('a');
  link.className = 'cooperation-dialog-link';
  link.href = './';
  link.textContent = '返回协作中心';
  close.before(actions);
  actions.append(link, close);
}).observe(dialog, { attributes: true, attributeFilter: ['open'] });
setInterval(async () => {
  if (!state.data || dialog.open || document.visibilityState !== 'visible' || $('[data-goal-editor]:not([hidden])')) return;
  try {
    await reload();
    window.dispatchEvent(new Event('department-goals-invalidate'));
  }
  catch (error) {
    if (error.status === 401) showAccessForm('访问已过期，请重新验证。');
    else if (error.code === 'DASHBOARD_LOCKED') showDashboardUnlock();
  }
}, 30000);
setupMonthly({ api, toast, refresh: () => render(), dialog, state });
setupDepartmentGoals(api);
setupFeedback(api);
try { await reload(); }
catch (error) {
  if (error.code === 'DASHBOARD_LOCKED') showDashboardUnlock();
  else if (error.status === 401) showAccessForm('', error.demo === true);
  else showAccessForm(error.message);
}
