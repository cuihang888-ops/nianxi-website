const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const has=v=>typeof v==='number'&&Number.isFinite(v);
const fmt=(v,digits=1)=>has(v)?v.toLocaleString('zh-CN',{maximumFractionDigits:digits}):'待补';
const monthNow=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit'}).format(new Date());
const cache=new Map();
let api,toast,refresh,dialog,state,monthly;
const currency=v=>has(v)?`¥${fmt(v,0)}`:'待补';
const target=(v,digits=0)=>has(v)?fmt(v,digits):'未设';
const input=(name,label,value,type='number')=>`<label class="month-field"><span>${label}</span><input name="${name}" type="${type}" ${type==='number'?'min="0" step="0.01"':''} value="${esc(value??'')}"></label>`;
export function setupMonthly(deps){({api,toast,refresh,dialog,state}=deps);monthly=monthNow;window.addEventListener('monthly-reset',()=>{cache.clear();monthly=monthNow;});window.addEventListener('monthly-invalidate',()=>cache.clear());}
export function monthlyPage(helpers){
  const data=cache.get(monthly), anchors=state.data.anchors,canEdit=['admin','manager','editor'].includes(state.data.user?.role),chosen=state.monthAnchor||'';
  if(!data&&!cache.has(`loading-${monthly}`)){cache.set(`loading-${monthly}`,true);api(`/api/monthly?month=${monthly}`).then(d=>{cache.set(monthly,d);refresh();}).catch(e=>{cache.set(monthly,{error:e.message});refresh();}).finally(()=>cache.delete(`loading-${monthly}`));}
  const metrics=data?.metrics?.filter(m=>!chosen||m.anchorId===chosen)||[];
  const controls=`<div class="filters"><label>月份 <input type="month" id="monthly-month" value="${monthly}" aria-label="总结月份"></label><select id="monthly-anchor" aria-label="月计划主播"><option value="">全部主播</option>${anchors.map(a=>`<option value="${a.id}" ${a.id===chosen?'selected':''}>${esc(a.name)}</option>`).join('')}</select><span class="spacer"></span>${canEdit?'<button class="primary" data-month-action="plan-grid">表格录入月计划</button><button data-month-action="new-plan">单人计划</button><button data-month-action="new-receipt">登记实际到账</button>':''}</div>`;
  return `${helpers.heading('主播月度总结报告','先录入月度计划，月底逐项核对目标、实际、差额和下月重点。','')}${controls}<div class="monthly-note">${monthly===monthNow?'本月尚未结束，当前为阶段草稿。':'按所选月份核对。'} 销售、单量和时长归属主播直播日期；收款另记实际到账日期，不拿销售额冒充现金。缺报会标记，避免生成虚假的完成率。</div>${!data?'<div class="empty">正在读取月度数据…</div>':data.error?`<div class="error">${esc(data.error)}</div>`:`<div class="table-scroll"><table class="data-table monthly-table"><thead><tr><th>主播</th><th>销售目标 / 实际</th><th>单量目标 / 实际</th><th>直播小时目标 / 实际</th><th>收款目标 / 实际到账</th><th>数据完整度</th><th>操作</th></tr></thead><tbody>${metrics.map(m=>`<tr><td><b>${esc(m.name)}</b><div class="data-sub">${m.sessionCount}条场次记录</div></td><td>${comparison(m.comparisons.sales,'money')}</td><td>${comparison(m.comparisons.orders,'number')}</td><td>${comparison(m.comparisons.hours,'hours')}</td><td>${comparison(m.comparisons.collection,'money')}</td><td><div class="data-sub">销售 ${m.coverage.orderAmount.known}/${m.coverage.orderAmount.expected}<br>单量 ${m.coverage.orders.known}/${m.coverage.orders.expected}<br>时长 ${m.coverage.actualMinutes.known}/${m.coverage.actualMinutes.expected}</div></td><td><div class="month-actions">${canEdit?`<button data-month-action="edit-plan" data-anchor="${m.anchorId}">计划</button><button data-month-action="generate" data-anchor="${m.anchorId}">生成总结</button>`:'<span class="quiet">仅查看</span>'}</div></td></tr>`).join('')||'<tr><td colspan="7" class="empty">该月暂无记录</td></tr>'}</tbody></table></div><p class="rule-note">计划可整表录入或逐人编辑，四项目标可留空；目标0与未设区分。已填部分合计不能代表完整月结。</p><section class="month-reports"><div class="section-bar"><h2>主播月度总结报告 · 草稿与确认记录</h2></div>${(data.reports||[]).filter(r=>!chosen||r.anchorId===chosen).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).map(r=>`<article class="month-report"><div><b>${esc(anchors.find(a=>a.id===r.anchorId)?.name||'主播')}</b><span class="badge ${r.status==='confirmed'?'':'planned'}">${r.status==='confirmed'?'已确认':'草稿'}</span></div><p>${esc(r.content.slice(0,190))}…</p><button data-month-action="open-report" data-id="${r.id}">查看 / 编辑总结</button></article>`).join('')||'<div class="empty">尚未生成总结；先设计划，再按主播生成草稿。</div>'}</section><section class="month-cash"><div class="section-bar"><h2>当月实际到账流水</h2><span class="quiet">凭据号避免重复登记 · ${data.receipts?.length||0}笔</span></div><div class="table-scroll"><table class="data-table"><thead><tr><th>日期 / 主播</th><th>类型</th><th>金额</th><th>凭据号</th><th></th></tr></thead><tbody>${(data.receipts||[]).filter(r=>!chosen||r.anchorId===chosen).map(r=>`<tr><td>${r.receivedDate} · ${esc(anchors.find(a=>a.id===r.anchorId)?.name||'')}</td><td>${r.kind==='refund'?'退款':'到账'}</td><td>${currency(r.amount)}</td><td>${esc(r.reference)}</td><td>${canEdit?`<button data-month-action="edit-receipt" data-id="${r.id}">编辑</button>`:''}</td></tr>`).join('')||'<tr><td colspan="5" class="empty">到账流水未登记，不填0、不从销售金额推算。</td></tr>'}</tbody></table></div></section>`}`;
}
function comparison(c,type){const digits=type==='hours'?1:0,actual=type==='money'?currency(c.actual):fmt(c.actual,digits),goal=target(c.target,digits);return `<div class="month-target">目标 ${goal}</div><strong>${actual}${type==='hours'&&has(c.actual)?'h':''}</strong><div class="data-sub ${has(c.gap)&&c.gap>0?'bad':'good'}">${has(c.gap)?`${c.gap===0?'达标':c.gap>0?'差':'超'} ${fmt(Math.abs(c.gap),digits)}`:'未设目标 / 待补'}${has(c.completion)?` · ${fmt(c.completion*100)}%`:''}</div><span class="monthly-partial">${!has(c.actual)?'待补':c.complete?'已登记场次已填':'部分已填'}</span>`;}
const choices=selected=>state.data.anchors.map(a=>`<option value="${a.id}" ${a.id===selected?'selected':''}>${esc(a.name)}</option>`).join('');
function shell(title,body,type,record){dialog.classList.toggle('month-plan-grid-dialog',type==='plan-grid');dialog.innerHTML=`<form id="month-form" data-kind="${type}"><header class="dialog-head"><h2>${title}</h2><button type="button" class="icon" data-close aria-label="关闭">×</button></header><div class="dialog-body">${body}<div id="month-error" class="error" hidden role="alert"></div></div><footer class="dialog-footer"><span class="quiet">${record?'版本 '+record.version:'新建记录'} · 主管维护</span><button type="button" data-close>取消</button><button type="submit" class="primary">保存</button></footer></form>`;dialog.monthRecord=record;dialog.showModal();dialog.scrollTop=0;}
function openPlan(anchorId){const p=cache.get(monthly)?.plans?.find(p=>p.anchorId===anchorId)||null;shell('月度计划表',`<div class="form-grid two"><label class="month-field"><span>月份</span><input name="month" type="month" value="${monthly}" required></label><label class="month-field"><span>主播</span><select name="anchorId">${choices(anchorId||state.monthAnchor)}</select></label>${input('salesTarget','销售金额目标（元）',p?.salesTarget)}${input('collectionTarget','实际到账收款目标（元）',p?.collectionTarget)}${input('ordersTarget','单量目标（单）',p?.ordersTarget)}${input('hoursTarget','实际直播时长目标（小时）',p?.hoursTarget)}<label class="month-field full"><span>月度重点 / 计划备注</span><textarea name="notes">${esc(p?.notes)}</textarea></label></div>`,'plans',p);}
function openReceipt(record){shell(record?'编辑到账流水':'登记实际到账',`<div class="form-grid two"><label class="month-field"><span>归属主播</span><select name="anchorId">${choices(record?.anchorId||state.monthAnchor)}</select></label>${input('receivedDate','实际到账 / 退款日期',record?.receivedDate||`${monthly}-01`,'date')}<label class="month-field"><span>类型</span><select name="kind"><option value="receipt">客户到账</option><option value="refund" ${record?.kind==='refund'?'selected':''}>客户退款</option></select></label>${input('amount','金额（元，正数）',record?.amount)}${input('reference','独立流水凭据号',record?.reference,'text')}${input('originMonth','原成交归属月份（未知可空）',record?.originMonth,'month')}${input('orderReference','原订单编号（未知可空）',record?.orderReference,'text')}<label class="month-field"><span>原成交场次（可选）</span><select name="sessionId"><option value="">暂不关联，稍后核对</option>${state.data.sessions.map(s=>`<option value="${s.id}" ${s.id===record?.sessionId?'selected':''}>${s.date} · ${esc(state.data.anchors.find(a=>a.id===s.anchorId)?.name||'')} · ${esc(s.slotLabel||s.start)}</option>`).join('')}</select></label><label class="month-field full"><span>原成交月份 / 订单归属 / 备注</span><textarea name="notes">${esc(record?.notes)}</textarea></label></div><p class="rule-note">流水按实际到账月份统计，与场次原归属回款是不同口径。请凭单核对，不重复导入同笔到账。</p>`,'receipts',record);}
function openReport(r){shell(`${state.data.anchors.find(a=>a.id===r.anchorId)?.name||'主播'} · ${r.month} 主播月度总结报告`, `<div class="monthly-note">${r.month>=monthNow?'该月未结束，只可保存阶段草稿。':'确认前核对销售、单量、时长与实际到账完整度。'}生成时的指标快照会保留，正文可由主管修订。</div>${reportSnapshot(r.snapshot)}<label class="month-field"><span>报告正文</span><textarea class="report-editor" name="content" required>${esc(r.content)}</textarea></label><label class="month-field"><span>状态</span><select name="status"><option value="draft">草稿</option><option value="confirmed" ${r.status==='confirmed'?'selected':''} ${r.month>=monthNow?'disabled':''}>主管确认</option></select></label><div class="month-report-tools"><button type="button" data-month-action="copy-report">复制正文</button><button type="button" data-month-action="download-report" data-id="${r.id}">下载报告</button></div>`,'reports',r);}
async function invalidate(){cache.delete(monthly);await refresh();}

function reportSnapshot(snapshot){
  if(!snapshot?.comparisons)return '';
  const labels={sales:['销售金额','元'],collection:['到账净收款','元'],orders:['确认单量','单'],hours:['实际直播时长','小时']};
  return `<section class="report-snapshot" aria-label="生成时指标快照"><h3>本月目标与实际 · 生成时快照</h3><div class="report-snapshot-grid">${Object.entries(labels).map(([key,[label,unit]])=>{
    const c=snapshot.comparisons[key],format=v=>has(v)?`${fmt(v,key==='hours'?1:0)} ${unit}`:'待补';
    const gap=!has(c.gap)?'未设目标 / 待补':c.gap===0?'已登记值达到目标':`${c.gap>0?'距目标尚差':'已登记值超出'} ${format(Math.abs(c.gap))}`;
    return `<div><h4>${label}</h4><strong>${format(c.actual)}</strong><span>目标 ${has(c.target)?format(c.target):'未设'}</span><b>${gap}</b><small>${key==='collection'?'按实际到账月已登记净收款':c.complete?'已登记场次字段已填齐':'当前已填部分，待补齐'}</small></div>`;
  }).join('')}</div><p>快照保留生成时的数据；已填齐不代表全月场次无遗漏。修改计划或数据后，重新生成报告可使用最新记录。</p></section>`;
}

const planFields=['salesTarget','collectionTarget','ordersTarget','hoursTarget','notes'];
function readPlanRow(row){return Object.fromEntries(planFields.map(key=>[key,row.querySelector(`[name="${key}"]`).value]));}
function openPlanGrid(){
  const data=cache.get(monthly);
  if(!data||data.error)throw new Error('请等待月度数据加载后再录入计划');
  const metrics=data.metrics.filter(m=>!state.monthAnchor||m.anchorId===state.monthAnchor);
  shell(`${monthly} 月度计划表`, `<p class="monthly-note">销售、收款、单量、直播小时四项目标均可留空；只保存修改的行。收款目标指实际到账月份的净收款。</p><div class="table-scroll"><table class="data-table month-plan-grid"><thead><tr><th>主播 / 直播间</th><th>销售目标（元）</th><th>收款目标（元）</th><th>单量目标（单）</th><th>直播目标（小时）</th><th>月度重点 / 备注</th><th>保存状态</th></tr></thead><tbody>${metrics.map(m=>{
    const plan=data.plans.find(p=>p.anchorId===m.anchorId),values=Object.fromEntries(planFields.map(key=>[key,String(plan?.[key]??'')]));
    const room=state.data.accounts.find(a=>a.id===m.accountId)?.name||'';
    return `<tr data-plan-anchor="${esc(m.anchorId)}" data-plan-id="${esc(plan?.id||'')}" data-plan-version="${plan?.version||''}" data-plan-original="${esc(JSON.stringify(values))}"><th scope="row">${esc(m.name)}<small>${esc(room)}</small></th>${planFields.map(key=>`<td>${key==='notes'?`<textarea name="notes" aria-label="${esc(m.name)}月度重点">${esc(values[key])}</textarea>`:`<input type="number" min="0" step="${key==='ordersTarget'?'1':'0.01'}" name="${key}" value="${esc(values[key])}" aria-label="${esc(m.name)}${({salesTarget:'销售',collectionTarget:'收款',ordersTarget:'单量',hoursTarget:'直播小时'})[key]}目标" placeholder="未设">`}</td>`).join('')}<td class="plan-row-status" role="status">${plan?'已载入':'未设计划'}</td></tr>`;
  }).join('')}</tbody></table></div>`, 'plan-grid', null);
  dialog.querySelector('[type="submit"]').textContent='保存已修改计划';
  dialog.querySelector('#month-form').dataset.month=monthly;
}

async function savePlanGrid(form){
  const rows=[...form.querySelectorAll('[data-plan-anchor]')];
  const changed=rows.filter(row=>JSON.stringify(readPlanRow(row))!==row.dataset.planOriginal);
  if(!changed.length){toast('计划没有修改');return;}
  const errorBox=form.querySelector('#month-error'),submit=form.querySelector('[type="submit"]');
  errorBox.hidden=true;submit.disabled=true;
  let failed=0,saved=0;
  for(const row of changed){
    const raw=readPlanRow(row),data={month:form.dataset.month,anchorId:row.dataset.planAnchor,notes:raw.notes};
    const status=row.querySelector('.plan-row-status');
    try{
      for(const key of planFields.filter(key=>key!=='notes')){
        const rawValue=raw[key].trim(),number=rawValue===''?null:Number(rawValue);
        if(number!==null&&(!Number.isFinite(number)||number<0||(key==='ordersTarget'&&!Number.isInteger(number))))throw new Error('目标须为非负数，单量须为整数');
        data[key]=number;
      }
      const id=row.dataset.planId;if(id)data.version=Number(row.dataset.planVersion);
      status.textContent='正在保存…';
      const {plan}=await api(`/api/monthly/plans${id?'/'+id:''}`,data,id?'PUT':'POST');
      row.dataset.planId=plan.id;row.dataset.planVersion=String(plan.version);row.dataset.planOriginal=JSON.stringify(raw);
      status.textContent='已保存';status.classList.remove('bad');saved++;
    }catch(error){failed++;status.textContent=error.message;status.classList.add('bad');}
  }
  submit.disabled=false;
  if(saved){cache.delete(form.dataset.month);await refresh();}
  if(failed){errorBox.textContent=`已保存 ${saved} 行，${failed} 行未保存。未保存的输入仍保留；提示版本冲突的行请先核对最新计划。`;errorBox.hidden=false;errorBox.scrollIntoView({block:'nearest'});}
  else{dialog.close();toast(`已保存 ${saved} 位主播的月计划`);}
}
document.addEventListener('click',async e=>{const b=e.target.closest('[data-month-action]');if(!b)return;try{const d=cache.get(monthly),a=b.dataset.monthAction;if(a==='plan-grid')openPlanGrid();if(a==='new-plan'||a==='edit-plan')openPlan(b.dataset.anchor);if(a==='new-receipt')openReceipt();if(a==='edit-receipt')openReceipt(d.receipts.find(r=>r.id===b.dataset.id));if(a==='generate'){b.disabled=true;const {report}=await api('/api/monthly/reports',{month:monthly,anchorId:b.dataset.anchor},'POST');cache.delete(monthly);await refresh();openReport(report);}if(a==='open-report')openReport(d.reports.find(r=>r.id===b.dataset.id));if(a==='copy-report'){await navigator.clipboard.writeText(dialog.querySelector('[name=content]').value);toast('总结正文已复制');}if(a==='download-report'){const r=d?.reports?.find(x=>x.id===b.dataset.id)||dialog.monthRecord;const blob=new Blob([dialog.querySelector('[name=content]')?.value||r.content],{type:'text/plain;charset=utf-8'}),link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=`${r.month}-${state.data.anchors.find(a=>a.id===r.anchorId)?.name||'主播'}-主播月度总结报告.txt`;link.click();URL.revokeObjectURL(link.href);}}catch(e){toast(e.message);}finally{b.disabled=false;}});
document.addEventListener('change',e=>{if(e.target.id==='monthly-month'){monthly=e.target.value||monthNow;refresh();}if(e.target.id==='monthly-anchor'){state.monthAnchor=e.target.value;refresh();}});
document.addEventListener('submit',async e=>{if(e.target.id!=='month-form')return;e.preventDefault();if(e.target.dataset.kind==='plan-grid'){await savePlanGrid(e.target);return;}const f=e.target,r=dialog.monthRecord,type=f.dataset.kind,data=Object.fromEntries(new FormData(f)),button=f.querySelector('[type=submit]');button.disabled=true;try{for(const k of ['salesTarget','collectionTarget','ordersTarget','hoursTarget','amount'])if(k in data)data[k]=data[k]===''?null:Number(data[k]);if(r)data.version=r.version;await api(`/api/monthly/${type}${r?'/'+r.id:''}`,data,r?'PUT':'POST');dialog.close();await invalidate();toast('月度记录已保存');}catch(e){const box=f.querySelector('#month-error');box.hidden=false;box.textContent=e.message;}finally{button.disabled=false;}});
