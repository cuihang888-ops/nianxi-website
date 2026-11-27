import { departmentGoalsSlot } from './department-goals.js?v=20261127-goals';

const calendar = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
});
const currency = new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', minimumFractionDigits: 0, maximumFractionDigits: 0 });
const number = new Intl.NumberFormat('zh-CN');
const whole = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 });
const metrics = [
  ['orderAmount', '业绩', value => whole.format(value / 100)],
  ['orders', '单量', value => number.format(value)],
  ['actualMinutes', '直播时长', value => {
    const minutes = Math.round(value);
    return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
  }],
  ['impressions', '浏览量', value => number.format(value)],
  ['shares', '分享次数', value => number.format(value)],
  ['newFollowers', '关注数', value => number.format(value)]
];
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

export function beijingToday(now = new Date()) {
  const parts = Object.fromEntries(calendar.formatToParts(now).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function lastCompletedDay(now = new Date()) {
  return previousDate(beijingToday(now));
}

function previousDate(date, days = 1) {
  const earlier = new Date(date + 'T00:00:00Z');
  earlier.setUTCDate(earlier.getUTCDate() - days);
  return earlier.toISOString().slice(0, 10);
}

function saleTotals(rows) {
  let reported = 0;
  let pending = 0;
  let stopped = 0;
  let cents = 0;
  for (const row of rows) {
    if (row.sourceStatus === 'stopped') {
      stopped++;
    } else if (Number.isFinite(row.orderAmount)) {
      reported++;
      cents += Math.round(row.orderAmount * 100);
    } else {
      pending++;
    }
  }
  return { amount: reported ? cents / 100 : null, reported, pending, stopped };
}

export function collectDailySales(data, date) {
  const monthStart = date.slice(0, 7) + '-01';
  const month = data.sessions.filter(row => row.date >= monthStart && row.date <= date);
  const day = month.filter(row => row.date === date);
  const rooms = data.accounts.map(account => ({
    name: account.name,
    day: saleTotals(day.filter(row => row.accountId === account.id)),
    month: saleTotals(month.filter(row => row.accountId === account.id))
  }));
  return { monthStart, day: saleTotals(day), month: saleTotals(month), rooms };
}

function sumMetric(rows, key) {
  const recorded = rows.filter(row => row.sourceStatus !== 'stopped' && Number.isFinite(row[key]));
  if (!recorded.length) return null;
  return recorded.reduce((sum, row) => sum + (key === 'orderAmount' ? Math.round(row[key] * 100) : row[key]), 0);
}

function collectAnchorDailyMetrics(data, date, metric) {
  const dates = Array.from({ length: 5 }, (_, index) => previousDate(date, 4 - index));
  const monthStart = date.slice(0, 7) + '-01';
  const accounts = new Map(data.accounts.map(account => [account.id, account.name]));
  const sessions = new Map((data.anchors || []).map(anchor => [anchor.id, []]));

  for (const row of data.sessions) {
    if (row.date <= date) sessions.get(row.anchorId)?.push(row);
  }

  const anchors = (data.anchors || []).map(anchor => {
    const rows = sessions.get(anchor.id);
    const latest = rows.reduce((best, row) => !best || row.date > best.date ? row : best, null);
    const monthRows = rows.filter(row => row.date >= monthStart);
    const monthSales = sumMetric(monthRows, 'orderAmount');
    const monthValue = metric === 'orderAmount' ? monthSales : sumMetric(monthRows, metric);
    const dayValues = dates.map(day => {
      const dayRows = rows.filter(row => row.date === day);
      return {
        value: sumMetric(dayRows, metric),
        stopped: dayRows.length > 0 && dayRows.every(row => row.sourceStatus === 'stopped')
      };
    });
    return { id: anchor.id, name: anchor.name, account: accounts.get(latest?.accountId || anchor.accountId), monthSales, monthValue, dayValues };
  });

  anchors.sort((a, b) => {
    if (a.monthSales !== null && b.monthSales === null) return -1;
    if (a.monthSales === null && b.monthSales !== null) return 1;
    return (b.monthSales ?? 0) - (a.monthSales ?? 0)
      || a.name.localeCompare(b.name, 'zh-CN')
      || a.id.localeCompare(b.id);
  });
  return { dates, anchors };
}

function renderDailyValue({ value, stopped }, format, accessibleFormat = format) {
  if (value !== null) return `<td><strong title="${escapeHtml(accessibleFormat(value))}">${format(value)}</strong></td>`;
  return `<td class="daily-status">${stopped ? '停播' : '待补'}</td>`;
}

const amount = totals => totals.amount === null ? '待补' : currency.format(totals.amount);
function coverage(totals) {
  const count = totals.reported + totals.pending + totals.stopped;
  if (!count) return '暂无记录';
  const parts = [`已填 ${totals.reported} 场`];
  if (totals.pending) parts.push(`待补 ${totals.pending} 场`);
  if (totals.stopped) parts.push(`停播 ${totals.stopped} 场`);
  return parts.join(' · ');
}

export function renderDailySales(data, selectedDate, canEdit, manage, selectedMetric = 'orderAmount', canManageDirectory = false) {
  const today = beijingToday();
  const yesterday = lastCompletedDay();
  const date = selectedDate && selectedDate <= today ? selectedDate : yesterday;
  const { rooms } = collectDailySales(data, date);
  const { day: yesterdaySale, month } = collectDailySales(data, yesterday);
  const monthStart = today.slice(0, 7) + '-01';
  const hasCompletedDayThisMonth = yesterday >= monthStart;
  const [metric, metricLabel, format] = metrics.find(([key]) => key === selectedMetric) || metrics[0];
  const { dates, anchors } = collectAnchorDailyMetrics(data, date, metric);
  const unit = metric === 'orderAmount' ? '元' : metric === 'actualMinutes' ? '时:分' : metric === 'orders' ? '单' : metric === 'newFollowers' ? '人' : '次';
  const accessibleFormat = metric === 'actualMinutes' ? value => `${Math.floor(Math.round(value) / 60)}小时${Math.round(value) % 60}分` : metric === 'orderAmount' ? value => `${whole.format(value / 100)}元` : format;
  const dayLabel = date === yesterday ? '昨日销售' : date === today ? '今日销售' : '当日销售';
  return `<main class="daily-board" data-testid="daily-board">
    <header class="daily-head">
      <div class="daily-identity">
        <h1>直播看板</h1>
      </div>
      <div class="daily-controls daily-date-controls">
        <label>五日截止 <input type="date" aria-label="查看日期" data-filter="dailyDate" value="${date}" max="${today}"></label>
        ${date !== today ? '<button type="button" data-action="daily-today">看今天</button>' : ''}
        ${date !== yesterday ? '<button type="button" data-action="daily-yesterday">回到昨日</button>' : ''}
        <button type="button" data-action="daily-fullscreen">全屏</button>
      </div>
      <nav class="daily-controls daily-analysis" aria-label="看板分析">
        <button type="button" data-view="performance">播后变化</button>
        <button type="button" data-view="compare">数据对比</button>
        <button type="button" data-view="session-details">主播场次明细</button>
        <button type="button" data-view="anchor-review">主播复盘</button>
      </nav>
    </header>
    <div class="daily-totals">
      <section>
        <h2>昨日业绩<small>${yesterday}</small></h2>
        <strong data-testid="daily-total">${amount(yesterdaySale)}</strong>
        <p>${coverage(yesterdaySale)}</p>
      </section>
      <section>
        <h2>本月累计业绩<small>${hasCompletedDayThisMonth ? `${monthStart} 至 ${yesterday}` : `${monthStart} 起`}</small></h2>
        <strong data-testid="daily-month-total">${hasCompletedDayThisMonth ? amount(month) : '待补'}</strong>
        <p>${hasCompletedDayThisMonth ? coverage(month) : '本月暂无已结束日期'}</p>
      </section>
    </div>
    ${departmentGoalsSlot(today.slice(0, 7))}
    <div class="daily-data">
      <section class="daily-changes" aria-labelledby="daily-changes-title">
        <header>
          <div class="daily-metric-heading">
            <h2 id="daily-changes-title">主播近五天数据</h2>
            <div class="daily-metric-buttons" role="group" aria-label="查看指标">
              ${metrics.map(([key, label]) => `<button type="button" data-daily-metric="${key}" aria-pressed="${key === metric}">${label}</button>`).join('')}
            </div>
          </div>
          <p class="daily-table-note">月初至所选日期 · ${metricLabel}（${unit}）</p>
        </header>
        <div class="daily-scroll" role="region" tabindex="0" aria-labelledby="daily-changes-title">
          <table data-testid="daily-changes" aria-label="各主播近五天${metricLabel}">
            <colgroup><col class="daily-person-col"><col class="daily-month-col">${dates.map(() => '<col>').join('')}</colgroup>
            <thead>
              <tr><th scope="col">主播</th><th scope="col" aria-label="月累计${metricLabel}（${unit}）"><span class="daily-month-desktop">月累计${metricLabel}</span><span class="daily-month-mobile">月累计</span></th>
              ${dates.map(day => `<th scope="col"><time datetime="${day}">${day.slice(5)}</time></th>`).join('')}</tr>
            </thead>
            <tbody>
              ${anchors.map((anchor, index) => `<tr data-anchor-id="${escapeHtml(anchor.id)}">
                <th scope="row">
                  <span class="daily-rank">${anchor.monthSales === null ? '—' : index + 1}</span>
                  <span class="daily-anchor-name">${escapeHtml(anchor.name)}${anchor.account ? `<small>${escapeHtml(anchor.account)}</small>` : ''}</span>
                </th>
                ${renderDailyValue({ value: anchor.monthValue }, format, accessibleFormat)}
                ${anchor.dayValues.map(value => renderDailyValue(value, format, accessibleFormat)).join('')}
              </tr>`).join('') || '<tr><td colspan="7">暂无主播</td></tr>'}
            </tbody>
          </table>
        </div>
      </section>
      <section class="daily-room-list" aria-labelledby="daily-rooms-title">
        <header><h2 id="daily-rooms-title">各直播间业绩</h2></header>
        <table>
          <thead><tr><th scope="col">直播间</th><th scope="col">${dayLabel}</th><th scope="col">月累计</th><th scope="col">当日填报</th></tr></thead>
          <tbody>${rooms.map(room => `
            <tr><th scope="row">${escapeHtml(room.name)}</th><td>${amount(room.day)}</td><td>${amount(room.month)}</td><td>${coverage(room.day)}</td></tr>
          `).join('')}</tbody>
        </table>
      </section>
    </div>
    <footer class="daily-footer">
      <span>北京时间 · 人民币 · 已登记场次销售额</span>
      <div class="daily-controls">
        <button type="button" data-action="refresh">刷新</button>
        ${manage ? '<button type="button" data-view="monthly" data-testid="nav-monthly">主播月度总结报告</button>' : ''}
        ${canEdit ? '<button type="button" data-action="daily-schedule">补录销售</button>' : ''}
        ${canManageDirectory ? '<button type="button" data-view="directory">直播名录</button>' : ''}
        ${!manage ? '<button type="button" data-action="logout">锁定看板</button><a href="./dashboard?mode=manage">销售管理</a>' : ''}
      </div>
    </footer>
  </main>`;
}

