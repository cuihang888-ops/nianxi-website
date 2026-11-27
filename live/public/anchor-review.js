const details = [
  ['received', '场均实收', 'money'],
  ['orders', '场均开单', 'count'],
  ['viewers', '场均观看', 'count'],
  ['paymentRate', '付款率', 'percent'],
  ['refundRate', '退款率', 'percent'],
  ['conversionRate', '观看→下单', 'percent'],
  ['adEfficiency', '投流效率', 'multiple']
];

const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));
const number = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 });
const decimal = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 });
const money = new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', maximumFractionDigits: 2 });
const formats = {
  money: value => money.format(value),
  count: value => number.format(value),
  percent: value => decimal.format(value * 100) + '%',
  multiple: value => decimal.format(value) + '×'
};
const display = (value, type) => Number.isFinite(value) ? formats[type](value) : '待补';
const equals = (a, b) => Math.abs(a - b) < 0.000001;
const range = period => period.from && period.to ? period.from + ' 至 ' + period.to : '暂无场次';
const signed = value => (value > 0 ? '+' : '') + decimal.format(value);

function describe(report) {
  const { current, previous } = report;
  if (!current.sessions) return '所选区间暂无已结束场次。';
  if (!previous.sessions) return '本人上期暂无已结束场次。';
  const sentences = [];
  const now = current.received.value;
  const before = previous.received.value;
  if (Number.isFinite(now) && Number.isFinite(before)) {
    if (equals(now, before)) sentences.push('本期场均实收与上期持平。');
    else if (before > 0) sentences.push('本期场均实收环比 ' + signed((now - before) / before * 100) + '%。');
    else sentences.push('本期场均实收 ' + display(now, 'money') + '，上期为 0。');
  }
  const drivers = [
    ['viewers', '场均观看', (a, b) => b > 0 ? signed((a - b) / b * 100) + '%' : number.format(a) + ' 人'],
    ['conversionRate', '观看下单率', (a, b) => signed((a - b) * 100) + ' 个百分点'],
    ['paymentRate', '付款率', (a, b) => signed((a - b) * 100) + ' 个百分点'],
    ['refundRate', '退款率', (a, b) => signed((a - b) * 100) + ' 个百分点']
  ];
  const observed = drivers.flatMap(([key, title, difference]) => {
    const a = current[key].value;
    const b = previous[key].value;
    if (!Number.isFinite(a) || !Number.isFinite(b)) return [];
    if (equals(a, b)) return [title + '持平'];
    if (key === 'viewers' && b === 0) return [title + '由 0 增至 ' + difference(a, b)];
    return [title + ' ' + difference(a, b)];
  });
  if (observed.length) sentences.push(observed.join('，') + '。');
  return sentences.join('') || '本期或上期缺少相同指标，暂无法比较。';
}

function metricCell(group, key, type) {
  const { value, reported } = group[key];
  const coverage = group.sessions && reported < group.sessions
    ? `<small>${reported}/${group.sessions} 场已填</small>` : '';
  return `<td>${display(value, type)}${coverage}</td>`;
}

function lineChart(report, metric) {
  const [, label, type] = details.find(([key]) => key === metric) || details[0];
  const values = report.trend.map(period => period[metric].value);
  const ceiling = Math.max(1, ...values.filter(Number.isFinite));
  const x = index => 24 + 72 * index;
  const y = value => 112 - value / ceiling * 88;
  const marks = values.map((value, index) => {
    if (!Number.isFinite(value)) return '';
    const previous = values[index - 1];
    const segment = Number.isFinite(previous)
      ? `<line x1="${x(index - 1)}" y1="${y(previous)}" x2="${x(index)}" y2="${y(value)}"/>` : '';
    return segment + `<circle cx="${x(index)}" cy="${y(value)}" r="4"/>`;
  }).join('');
  return `<section class="anchor-review-card">
    <div class="anchor-review-heading"><h2>近六期趋势</h2>
      <label>趋势指标 <select id="anchor-review-trend" aria-label="趋势指标">
        ${details.map(([key, title]) => `<option value="${key}"${key === metric ? ' selected' : ''}>${title}</option>`).join('')}
      </select></label>
    </div>
    <svg class="anchor-review-chart" viewBox="0 0 408 124" aria-hidden="true">
      <line class="baseline" x1="24" y1="112" x2="384" y2="112"/>${marks}
    </svg>
    <ol class="anchor-review-points" aria-label="${label}近六期数值">
      ${report.trend.map((period, index) => `<li title="${esc(range(period))}"><span>${esc(period.label)}</span><strong>${display(values[index], type)}</strong></li>`).join('')}
    </ol>
  </section>`;
}

function noteCard(report, draft, pending) {
  return `<section class="anchor-review-card">
    <div class="anchor-review-heading"><h2>复盘记录</h2>
      ${report.canWriteNotes ? '' : '<a href="./dashboard?mode=manage&amp;view=anchor-review">进入销售管理记录</a>'}
    </div>
    ${report.notes.length ? `<ul class="anchor-review-history">
      ${report.notes.map(note => `<li><time datetime="${esc(note.date)}">${esc(note.date)}</time>
        ${note.reason ? `<p><strong>主播自述</strong> ${esc(note.reason)}</p>` : ''}
        ${note.action ? `<p><strong>约定改进</strong> ${esc(note.action)}</p>` : ''}
      </li>`).join('')}
    </ul>` : '<p class="quiet">暂无记录</p>'}
    ${report.canWriteNotes ? `<form id="anchor-review-note" class="anchor-review-note">
      <label>复盘日期 <input name="date" type="date" value="${esc(draft.date)}" required></label>
      <label>主播自述<textarea name="reason" rows="2" maxlength="800">${esc(draft.reason)}</textarea></label>
      <label>约定一个改进点<textarea name="action" rows="2" maxlength="400">${esc(draft.action)}</textarea></label>
      <div><button class="primary" type="submit"${pending ? ' disabled' : ''}>${pending ? '正在保存…' : '保存复盘记录'}</button></div>
    </form>` : ''}
  </section>`;
}

export function setupAnchorReview({ api, render, today, isActive }) {
  let report;
  let filters;
  let loading = false;
  let saving = false;
  let message = '';
  let failed = false;
  let metric = 'received';
  let revision = 0;
  let noteDraft = { date: today, reason: '', action: '' };

  function reset() {
    revision++;
    report = undefined;
    filters = undefined;
    loading = false;
    saving = false;
    message = '';
    failed = false;
    metric = 'received';
    noteDraft = { date: today, reason: '', action: '' };
  }

  async function load() {
    const request = ++revision;
    loading = true;
    failed = false;
    message = '';
    const q = new URLSearchParams(filters);
    if (q.get('mode') !== 'custom') q.delete('from');
    if (q.get('mode') !== 'recent') q.delete('count');
    try {
      const next = await api('/api/anchor-review?' + q);
      if (revision === request) report = next;
    } catch (error) {
      if (revision !== request) return;
      failed = true;
      message = error.message;
    } finally {
      if (revision === request) {
        loading = false;
        if (isActive()) render();
      }
    }
  }

  function page(anchors, cutoff) {
    if (!filters && anchors.length) {
      const from = new Date(Date.parse(cutoff) - 6 * 86400000).toISOString().slice(0, 10);
      filters = { anchorId: anchors[0].id, mode: 'week', to: cutoff, from, count: '5' };
      load();
    }
    if (!filters) return '<section class="anchor-review"><h1>主播复盘</h1><p class="quiet">暂无主播记录</p></section>';
    const select = (value, text) => `<option value="${value}"${filters.mode === value ? ' selected' : ''}>${text}</option>`;
    return `<section class="anchor-review" data-testid="anchor-review">
      <div class="anchor-review-heading"><div><h1>主播复盘</h1>
        <p>按场均表现对照本人上期和同一直播间、同时段的其他主播。</p></div>
        <button type="button" data-view="daily">返回直播看板</button>
      </div>
      <form id="anchor-review-filters" class="anchor-review-filters anchor-review-card">
        <label>主播 <select name="anchorId">${anchors.map(anchor => `<option value="${esc(anchor.id)}"${anchor.id === filters.anchorId ? ' selected' : ''}>${esc(anchor.name)}</option>`).join('')}</select></label>
        <label>复盘区间 <select name="mode">${select('week', '近一周')}${select('month', '月累计')}${select('custom', '自选日期')}${select('recent', '最近 N 场')}</select></label>
        <label data-review-option="custom"${filters.mode === 'custom' ? '' : ' hidden'}>开始日期 <input type="date" name="from" value="${esc(filters.from)}" max="${today}"${filters.mode === 'custom' ? ' required' : ''}></label>
        <label data-review-option="recent"${filters.mode === 'recent' ? '' : ' hidden'}>场次数 <input type="number" name="count" min="1" value="${esc(filters.count)}"${filters.mode === 'recent' ? ' required' : ''}></label>
        <label>截止日期 <input type="date" name="to" value="${esc(filters.to)}" max="${today}" required></label>
        <button class="primary" type="submit"${loading || saving ? ' disabled' : ''}>${loading ? '生成中…' : '生成复盘'}</button>
      </form>
      <div role="status" class="${failed ? 'anchor-review-error' : 'quiet'}">${esc(message)}</div>
      ${report ? `<section class="anchor-review-card">
        <h2>${esc(report.anchor.name)} · 场均对照</h2>
        <p class="anchor-review-summary">${esc(describe(report))}</p>
        <div class="table-scroll"><table class="data-table anchor-review-table">
          <thead><tr><th scope="col">指标</th><th scope="col">本期<small>${esc(range(report.current))}</small></th>
            <th scope="col">本人上期<small>${esc(range(report.previous))}</small></th>
            <th scope="col">同直播间同时段</th></tr></thead>
          <tbody><tr><th scope="row">场次</th>${[report.current, report.previous, report.peer].map(group => `<td>${group.sessions} 场</td>`).join('')}</tr>
            ${details.map(([key, label, type]) => `<tr><th scope="row">${label}</th>${[report.current, report.previous, report.peer].map(group => metricCell(group, key, type)).join('')}</tr>`).join('')}
          </tbody>
        </table></div>
        <p class="quiet anchor-review-method">实收按退款前金额。付款率为已付款单量 ÷ 开单量，退款率为退款单量 ÷ 已付款单量，下单率为开单量 ÷ 观看人数，投流效率为实收 ÷ 投流支出。比值只统计分子与分母均已登记的场次。</p>
        ${report.peer.sessions ? '' : '<p class="quiet">本期暂无同直播间同时段的其他主播场次。</p>'}
      </section>${lineChart(report, metric)}${noteCard(report, noteDraft, saving)}` : ''}
    </section>`;
  }

  document.addEventListener('change', event => {
    const target = event.target;
    if (target.matches('#anchor-review-filters [name="mode"]')) {
      target.form.querySelectorAll('[data-review-option]').forEach(group => {
        group.hidden = group.dataset.reviewOption !== target.value;
        group.querySelector('input').required = !group.hidden;
      });
    }
    if (target.matches('#anchor-review-trend')) {
      metric = target.value;
      render();
      document.getElementById('anchor-review-trend')?.focus();
    }
  });
  document.addEventListener('input', event => {
    const { target } = event;
    if (target.matches('#anchor-review-note [name]')) noteDraft[target.name] = target.value;
    if (target.matches('#anchor-review-filters [name]')) filters[target.name] = target.value;
  });
  document.addEventListener('submit', async event => {
    const form = event.target;
    if (form.id === 'anchor-review-filters') {
      event.preventDefault();
      if (loading || saving) return;
      const selected = Object.fromEntries(new FormData(form));
      if (selected.anchorId !== report?.anchor.id) noteDraft = { date: today, reason: '', action: '' };
      filters = selected;
      report = undefined;
      load();
      render();
    }
    if (form.id === 'anchor-review-note') {
      event.preventDefault();
      if (!report?.canWriteNotes || saving || loading) return;
      saving = true;
      message = '';
      failed = false;
      const request = revision;
      const draft = Object.fromEntries(new FormData(form));
      const anchorId = report.anchor.id;
      render();
      try {
        const { note } = await api('/api/anchor-review/notes', { anchorId, ...draft }, 'POST');
        if (revision !== request) return;
        report.notes = [note, ...report.notes].sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt)).slice(0, 8);
        noteDraft = { date: today, reason: '', action: '' };
        message = '复盘记录已保存';
      } catch (error) {
        if (revision !== request) return;
        failed = true;
        message = error.message;
      } finally {
        if (revision === request) {
          saving = false;
          if (isActive()) render();
        }
      }
    }
  });
  return { page, reset };
}
