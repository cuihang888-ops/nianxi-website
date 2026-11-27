const number = new Intl.NumberFormat('zh-CN');
const currency = new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', minimumFractionDigits: 0, maximumFractionDigits: 0 });
const metrics = [
  ['orderAmount', '业绩（元）', value => currency.format(value)],
  ['orders', '单量'],
  ['actualMinutes', '时长', value => {
    const minutes = Math.round(value);
    return `${Math.floor(minutes / 60)}小时${minutes % 60}分`;
  }],
  ['impressions', '浏览量（次）'], ['shares', '分享次数'], ['newFollowers', '关注数']
];
function rowsForDate(data, date, accountFilter, anchorFilter) {
  const accounts = new Map(data.accounts.map(({ id, name }, index) => [id, { name, index }]));
  const anchors = new Map(data.anchors.map(anchor => [anchor.id, anchor]));
  const sessions = data.sessions.filter(session => session.date === date);
  const rows = sessions.map(session => ({ session, anchor: anchors.get(session.anchorId), accountId: session.accountId }));
  const scheduled = new Set(sessions.map(({ accountId, anchorId }) => `${accountId}:${anchorId}`));
  const occupiedSlots = new Set(sessions.map(({ accountId, slotId, anchorId }) => `${accountId}:${slotId || anchors.get(anchorId)?.slotId || anchorId}`));
  for (const anchor of data.anchors) {
    const { accountId, activeFrom, activeTo, slotId } = anchor;
    if (!accountId || (activeFrom && date < activeFrom) || (activeTo && date > activeTo)) continue;
    if (scheduled.has(`${accountId}:${anchor.id}`) || occupiedSlots.has(`${accountId}:${slotId || anchor.id}`)) continue;
    rows.push({ anchor, accountId });
  }
  return rows.filter(({ accountId, anchor, session }) => (!accountFilter || accountId === accountFilter) && (!anchorFilter || (anchor?.id || session?.anchorId) === anchorFilter))
    .map(row => ({ ...row, account: accounts.get(row.accountId) }))
    .sort((a, b) => (a.account?.index ?? Infinity) - (b.account?.index ?? Infinity)
      || (a.session?.slotId || a.anchor?.slotId || '').localeCompare(b.session?.slotId || b.anchor?.slotId || '', 'zh-CN', { numeric: true })
      || (a.session?.start || '').localeCompare(b.session?.start || '')
      || (a.anchor?.name || '').localeCompare(b.anchor?.name || '', 'zh-CN'));
}

export function renderSessionDetails(data, date, accountFilter, anchorFilter, { esc, today, expanded }) {
  const rows = rowsForDate(data, date, accountFilter, anchorFilter);
  const columns = metrics;
  const options = (items, selected) => items.map(({ id, name }) => `<option value="${esc(id)}"${selected === id ? ' selected' : ''}>${esc(name)}</option>`).join('');
  const cell = (session, key, format) => {
    const value = session?.[key];
    if (Number.isFinite(value)) return `<td>${format ? format(value) : number.format(value)}</td>`;
    return `<td class="quiet">${session?.sourceStatus === 'stopped' ? '—' : '待补'}</td>`;
  };
  return `<section class="session-details" data-testid="session-details">
    <header class="page-heading"><div><h1>主播场次明细</h1><p>按日期查看各直播间的主播排班与场次数据。</p></div></header>
    <div class="filters">
      <label>日期 <input type="date" aria-label="场次日期" data-filter="detailDate" value="${esc(date)}" max="${esc(today)}"></label>
      <select data-filter="detailAccount" aria-label="场次直播间"><option value="">全部直播间</option>${options(data.accounts, accountFilter)}</select>
      <select data-filter="detailAnchor" aria-label="场次主播"><option value="">全部主播</option>${options(data.anchors.filter(anchor => !accountFilter || !anchor.accountId || anchor.accountId === accountFilter), anchorFilter)}</select>
      <span class="quiet">${rows.length} 场</span>
    </div>
    <p class="session-scroll-hint quiet">左右滑动查看场次指标</p>
    <div class="table-scroll" tabindex="0" role="region" aria-label="主播场次数据"><table class="data-table session-detail-table">
      <thead><tr><th scope="col">直播间</th><th scope="col">主播</th><th scope="col">场次与时间</th><th scope="col">状态</th>${columns.map(([, label]) => `<th scope="col">${label}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(({ session, anchor, account }) => {
        const slot = session?.slotLabel || anchor?.slotLabel || '场次';
        const time = !session?.scheduleUnknown && session?.start && session?.end ? `${session.start}–${session.end}` : '';
        const reported = metrics.some(([key]) => Number.isFinite(session?.[key]));
        const status = session?.sourceStatus === 'stopped' ? '停播' : session?.status === 'live' ? '直播中' : session?.status === 'planned' ? '已排班' : reported ? '已填报' : '待填报';
        return `<tr><td>${esc(account?.name || '未分配')}</td><th scope="row">${esc(anchor?.name || '待安排')}</th><td>${esc(slot)}${time ? `<small>${esc(time)}</small>` : ''}</td><td>${status}</td>${columns.map(([key, , format]) => cell(session, key, format)).join('')}</tr>`;
      }).join('') || `<tr><td class="empty" colspan="${4 + columns.length}">所选日期和筛选条件下暂无场次。</td></tr>`}</tbody>
    </table></div>
  </section>`;
}

