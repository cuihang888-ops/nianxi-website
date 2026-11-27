const known = v => typeof v === 'number' && Number.isFinite(v);
const sum = (rows, key) => rows.reduce((a, r) => a + (known(r[key]) ? r[key] : 0), 0);
const count = (rows, key) => rows.filter(r => known(r[key])).length;
const format = (v, digits = 0) => known(v) ? v.toLocaleString('zh-CN', { maximumFractionDigits: digits }) : '待补';
const currency = v => known(v) ? `¥${format(v, 0)}` : '待补';
const short = v => known(v) ? format(v, Number.isInteger(v) ? 0 : 1) : '—';
const escape = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const shift = (d, offset) => { const t = new Date(`${d}T12:00:00+08:00`); t.setUTCDate(t.getUTCDate()+offset); return t.toISOString().slice(0,10); };
const metrics = [['orderAmount','业绩'],['orders','单量'],['actualMinutes','直播时长'],['impressions','浏览量'],['shares','分享次数'],['newFollowers','关注数']];
const period = state => ({start:shift(state.periodEnd,1-Number(state.windowDays)),end:state.periodEnd});
const percentage = (current, previous) => previous > 0 ? `${current >= previous ? '+' : ''}${format((current-previous)/previous*100,1)}%` : '无基期';

export function renderImported(state, helpers) {
  const {heading, icon, canEdit, canExport} = helpers, data=state.data;
  const accounts = data.accounts;
  const accountName = id => accounts.find(x=>x.id===id)?.name || '';
  const anchorName = id => data.anchors.find(x=>x.id===id)?.name || '';
  const p=period(state), days=Array.from({length:Number(state.windowDays)},(_,i)=>shift(p.start,i));
  const all=data.sessions.filter(s=>(!state.account||s.accountId===state.account)&&(!state.anchor||s.anchorId===state.anchor));
  const rows=all.filter(s=>s.date>=p.start&&s.date<=p.end), previous=all.filter(s=>s.date>=shift(p.start,-Number(state.windowDays))&&s.date<p.start);
  const month=all.filter(s=>s.date>=`${p.end.slice(0,7)}-01`&&s.date<=p.end);
  const roomOptions=`<option value="">全部直播间</option>${accounts.map(a=>`<option value="${a.id}" ${a.id===state.account?'selected':''}>${escape(a.name)}</option>`).join('')}`;
  const anchorOptions=`<option value="">全部主播（含交接历史）</option>${data.anchors.filter(a=>!state.account||a.accountId===state.account).map(a=>`<option value="${a.id}" ${a.id===state.anchor?'selected':''}>${escape(a.name)} · ${escape(accountName(a.accountId))}</option>`).join('')}`;
  const toolbar=`<div class="period-toolbar"><div class="period-days"><button data-days="5" class="${Number(state.windowDays)===5?'active':''}">近5天</button><button data-days="7" class="${Number(state.windowDays)===7?'active':''}">近7天</button></div><div class="period-date"><button class="icon" data-action="period-prev" aria-label="前移一天">${icon('chevron-left')}</button><input type="date" data-filter="periodEnd" aria-label="窗口截止日期" value="${p.end}"><button class="icon" data-action="period-next" aria-label="后移一天" >${icon('chevron-right')}</button></div><span class="period-range">${p.start.slice(5).replace('-','/')}—${p.end.slice(5).replace('-','/')}${data.dataset.cutoffDate ? `<small>初始导入至 ${escape(data.dataset.cutoffDate)}</small>` : ''}</span><button class="period-reset" data-action="period-today">回到今天</button></div><div class="filters"><select data-filter="account" aria-label="筛选账号">${roomOptions}</select><select data-filter="anchor" aria-label="筛选主播">${anchorOptions}</select></div>`;
  const title=state.view==='schedule'?'直播间与场次':state.view==='compare'?'数据对比':'播后变化';
  if(state.view==='review') return `${heading('复盘行动','按已登记的六项数据核对变化。','')}<div class="import-empty"><h2>先补齐同场数据，再复盘变化</h2><p>以业绩、单量、直播时长、浏览量、分享次数和关注数为准，缺项保留待补。</p><button data-view="performance">返回业绩面板</button></div>`;
  if(['inventory','overview','method'].includes(state.view)) return `${heading('当前导入范围','当前文件只有每日销售，其他数据等待后续补充。','')}<div class="import-empty"><h2>没有混入演示记录</h2><p>采购库存、回款、退款、费用、实际时长等尚未从该表获得，当前不展示虚构数值和利润。</p><button data-view="performance">查看已导入业绩</button></div>`;
  const sourceNote = data.dataset?.sourceFile ? `<div class="import-source" data-testid="import-source"><span>${icon('file-spreadsheet')}${escape(data.dataset.sourceFile)}</span><b>含历史表格导入</b></div>` : '';
  const result=`${heading(title, '按日期查看各项数据和变化', canExport ? `<button data-action="export">${icon('download')}导出明细</button>` : '', 'FACEBOOK LIVE')}${sourceNote}${toolbar}`;
  if(state.view==='schedule') return result+roomSchedule(state,rows,accounts,data.anchors,helpers);
  const registered=count(rows,'orderAmount'),stopped=rows.filter(r=>r.sourceStatus==='stopped').length;
  const missing=rows.length-registered-stopped;
  const total=sum(rows,'orderAmount');
  const recordedWindow = (list, key) => (
    new Set(list.map(row => row.date)).size === days.length
    && count(list, key) > 0
    && list.every(row => row.sourceStatus === 'stopped' || known(row[key]))
  );
  const full = recordedWindow(rows, 'orderAmount') && recordedWindow(previous, 'orderAmount');
  const latest=rows.filter(s=>s.date===p.end),latestCount=count(latest,'orderAmount');
  const kpis=`<div class="performance-kpis"><div class="performance-hero"><div class="kpi-label">窗口已登记销售额</div><strong data-testid="import-sales-total">${registered ? currency(total) : '待补'}</strong><span class="performance-change ${full&&total<sum(previous,'orderAmount')?'bad':'good'}">${full?percentage(total,sum(previous,'orderAmount')):'登记不足 · 待比较'}<small>${registered}/${rows.length} 个销售数字${stopped?` · ${stopped}停`:''}</small></span></div><div class="performance-small"><span>本月已登记销售</span><b>${count(month,'orderAmount') ? currency(sum(month,'orderAmount')) : '待补'}</b><em>${count(month,'orderAmount')}个数字 · 截至${p.end.slice(5)}</em></div><div class="performance-small"><span>末日登记情况</span><b>${latestCount}<small> / ${latest.length} 场</small></b><em class="bad">${latest.length-latestCount-latest.filter(s=>s.sourceStatus==='stopped').length}场销售待补</em></div><div class="performance-small"><span>窗口新增关注</span><b>${count(rows,'newFollowers') ? format(sum(rows,'newFollowers')) : '待补'}</b><em>${count(rows,'newFollowers')} 场已填</em></div></div><p class="data-completeness">${escape(p.end)} ${latestCount}/${latest.length}场已有销售数字，空白保留待补，不视作0。${missing?`窗口还有 ${missing} 场销售待补。`:''}前后窗口均有完整记录时显示涨跌。</p><div class="duration-band"><div><span>窗口实际时长</span><b>${count(rows,'actualMinutes')?`${format(sum(rows,'actualMinutes')/60,1)}h（已填）`:'待登记'}</b></div><div><span>月累计实际时长</span><b>${count(month,'actualMinutes')?`${format(sum(month,'actualMinutes')/60,1)}h（已填）`:'待登记'}</b></div><div><span>月新增粉</span><b>${count(month,'newFollowers')?`${format(sum(month,'newFollowers'))}（已填）`:'待登记'}</b></div><div><span>每小时销售</span><b>${sum(rows,'actualMinutes')>0 && rows.filter(s=>s.sourceStatus!=='stopped').every(s=>known(s.actualMinutes) && known(s.orderAmount)) ? currency(sum(rows,'orderAmount')*60/sum(rows,'actualMinutes')) : '待补'}</b></div></div>`;
  const group=state.importGroup || (data.dataset?.kind === 'imported' ? 'slot' : 'account');
  const chosenMetric=state.performanceMetric==='monthFollowers'?'newFollowers':state.performanceMetric;
  const byMonth=state.performanceMetric==='monthFollowers';
  const identities=makeGroups(state,group);
  const describeChange = selected => {
    if (byMonth) return '';
    const prior = previous.filter(selected.match);
    if (!recordedWindow(selected.rows, chosenMetric) || !recordedWindow(prior, chosenMetric)) return '';
    return percentage(selected.total, sum(prior, chosenMetric));
  };
  const metricTotal = list => {
    if (!count(list, chosenMetric)) return '待补';
    const total = sum(list, chosenMetric);
    if (chosenMetric === 'actualMinutes') return `${format(total/60, 1)}h`;
    if (chosenMetric === 'orderAmount') return currency(total);
    return short(total);
  };
  const monthMetricRows = day => all.filter(row => row.date >= day.slice(0,7) + '-01' && row.date <= day);
  const grouped=identities.map(g=>{const match=r=>g.match(r);const selectedRows=rows.filter(match),basis=(byMonth?month:rows).filter(match);return {...g,rows:selectedRows,total:sum(basis,chosenMetric),reported:count(basis,chosenMetric),basis,daily:days.map(day=>selectedRows.filter(s=>s.date===day))};}).sort((a,b)=>b.total-a.total||a.sort-b.sort);
  const cell = (list,key=chosenMetric) => {
    if(!list.length) return '<span class="import-blank">—</span>';
    if(list.every(s=>s.sourceStatus==='stopped')) return '<span class="import-stop">停</span>';
    const values=list.filter(s=>known(s[key]));if(!values.length)return '<span class="import-pending">待补</span>';
    const value=sum(values,key),partial=values.length<list.filter(s=>s.sourceStatus!=='stopped').length;
    return `<span class="heat-value ${partial?'partial':''}" style="--heat:${.04+value/Math.max(1,...grouped.map(g=>g.total))*0.7}">${key==='actualMinutes'?`${format(value/60,1)}h`:key==='orderAmount'?format(value,0):short(value)}${partial?'<sup>＊</sup>':''}</span>`;
  };
  const matrix=`<section class="performance-section"><div class="section-bar"><h2>按日期看真实业绩</h2><span class="spacer"></span><div class="segmented"><button data-import-group="slot" class="${group==='slot'?'active':''}">场次</button><button data-import-group="anchor" class="${group==='anchor'?'active':''}">主播</button><button data-import-group="account" class="${group==='account'?'active':''}">直播间</button></div></div><div class="metric-switch">${metrics.map(([key,label])=>`<button data-metric="${key}" data-testid="import-metric-${key}" class="${state.performanceMetric===key?'active':''}">${label}</button>`).join('')}</div><div class="heatmap-scroll"><table class="heatmap-table" data-testid="import-performance-table"><thead><tr><th class="identity-col">${group==='slot'?'直播间 / 场次':group==='anchor'?'主播 / 直播间':'直播间'}<small>${byMonth?'月初至当日累计':metrics.find(m=>m[0]===state.performanceMetric)?.[1]}</small></th>${days.map(d=>`<th class="day-col"><strong>${d.slice(5).replace('-','/')}</strong></th>`).join('')}<th class="summary-col">${byMonth?'月累计':'已登记合计'}</th></tr></thead><tbody>${grouped.map((g,i)=>`<tr><td class="identity-col">${canEdit ? `<button data-import-open="${escape(g.rows.filter(r=>r.date===p.end)[0]?.id||g.rows.at(-1)?.id||'')}">` : '<div class="data-name">'}<span class="rank-chip ${i<3?'top':''}">${String(i+1).padStart(2,'0')}</span><span><b>${escape(g.name)}</b><small title="${escape(g.sub)}">${escape(g.sub)}</small></span>${canEdit ? '</button>' : '</div>'}</td>${g.daily.map((list,index)=>`<td class="day-col">${cell(byMonth?all.filter(r=>g.match(r)&&r.date>=`${days[index].slice(0,7)}-01`&&r.date<=days[index]):list)}</td>`).join('')}<td class="summary-col"><b>${g.reported?(chosenMetric==='orderAmount'?currency(g.total):chosenMetric==='actualMinutes'?`${format(g.total/60,1)}h`:format(g.total)):'待补'}</b><small>${g.reported}/${g.basis.filter(r=>r.sourceStatus!=='stopped').length}已填</small>${describeChange(g) ? `<small>较前一窗口 ${describeChange(g)}</small>` : ''}</td></tr>`).join('')}</tbody><tfoot><tr><td class="identity-col">已登记合计</td>${days.map(day=>`<td>${metricTotal(byMonth ? monthMetricRows(day) : rows.filter(s=>s.date===day))}</td>`).join('')}<td class="summary-col">${metricTotal(byMonth ? month : rows)}</td></tr></tfoot></table></div><p class="rule-note">＊ 为部分场次已填；数字0保留真实0，“待补”为空白，“停”保留原表标记。${canEdit ? '点名称打开记录补录。' : ''}</p></section>`;
  if (!canExport) return result + kpis + matrix;
  return result+kpis+matrix+`<div class="handover-note"><strong>演示直播间 · 第1场交接</strong><p>11月1—21日：示例主播甲；11月21日标“停”；11月22日起：示例主播乙。场次连续展示，主播个人业绩分别归属，未将两人合并。</p></div><section class="import-analysis"><h2>哪些变量影响更大？</h2><p>按业绩、单量、直播时长、浏览量、分享次数和关注数查看变化。缺项保留待补，补齐同场数据后再核对变化，不凭销售额推断其他数值。</p></section><p class="rule-note">来源：${escape(data.dataset.sourceFile)} / ${escape(data.dataset.sourceSheet)}，保留原表销售原值。目标列仍写10月、单位未确认，因此未导入目标，也未计算完成率。开播时段未提供，场次顺序不是已确认的早午晚。</p>`;
}
function makeGroups(state,group) {
  const data=state.data,accountName=id=>data.accounts.find(a=>a.id===id)?.name||'';
  const anchors=data.anchors.filter(a=>(!state.account||a.accountId===state.account)&&(!state.anchor||a.id===state.anchor));
  if(group==='account')return data.accounts.filter(a=>!state.account||a.id===state.account).map((a,i)=>({id:a.id,name:a.name,sub:a.owner||a.page,sort:i,match:s=>s.accountId===a.id}));
  if(group==='anchor')return anchors.map(a=>({id:a.id,name:a.name,sub:`${accountName(a.accountId)} · ${a.slotLabel}`,sort:a.sourceRow,match:s=>s.anchorId===a.id}));
  const grouped=new Map();
  for(const a of anchors){const key=a.slotId||a.id;if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(a);}
  return [...grouped].map(([id,people],i)=>({id,name:people.map(a=>a.name).join(' → '),sub:`${accountName(people[0].accountId)} · ${people[0].slotLabel}`,sort:i,match:s=>(s.slotId||s.anchorId)===id}));
}
function roomSchedule(state,rows,accounts,anchors,{icon}) {
  const visible=accounts.filter(a=>!state.account||a.id===state.account), day=state.periodEnd;
  return `<div class="section-bar"><h2>${day} · 15个场次位</h2><span class="spacer"></span><span class="quiet">实际时段待补</span></div><div class="schedule-wrap"><div class="schedule" style="grid-template-columns:80px repeat(${visible.length},minmax(155px,1fr));min-width:${80+visible.length*165}px"><div class="grid-corner">原表顺序</div>${visible.map(a=>`<div class="account-head"><div class="account-head-top"><span class="account-icon">f</span>${escape(a.name)}</div><p>${escape(a.owner)}</p></div>`).join('')}${[1,2,3].map(index=>`<div class="slot-label"><strong>第${index}场</strong><span>时段待补</span></div>${visible.map(a=>{const s=rows.find(s=>s.date===day&&s.accountId===a.id&&s.slotId===`fb-slot-${a.id.split('-').at(-1)}-${index}`);const person=s?anchors.find(x=>x.id===s.anchorId):null;return `<div class="slot-cell">${s?`<button class="session-card" data-import-open="${s.id}"><div class="session-top"><span class="session-time">第${index}场 · 时段待补</span><span class="badge ${known(s.orderAmount)?'':'planned'}">${s.sourceStatus==='stopped'?'停':known(s.orderAmount)?'销售已填':'待补销售'}</span></div><div class="session-anchor">${escape(person?.name||'待安排')}</div><div class="session-metric"><span>销售金额</span><b>${currency(s.orderAmount)}</b></div><div class="session-metric"><span>单量 / 浏览量 / 时长</span><span>待补</span></div></button>`:'<span class="empty">没有匹配记录</span>'}</div>`;}).join('')}`).join('')}</div></div><p class="rule-note">原表没有真实起止时间，界面只保留第1/2/3场顺序，未伪造早午晚。点击场次可补录数据。</p>`;
}
