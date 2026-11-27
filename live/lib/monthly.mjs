import { randomUUID } from 'node:crypto';
import { ApiError, keys, text, date, version, numeric } from './validation.mjs';

const value = n => typeof n === 'number' && Number.isFinite(n);
const total = (rows, key) => rows.reduce((sum, row) => sum + (value(row[key]) ? row[key] : 0), 0);
const monthValid = month => { if (typeof month !== 'string' || !/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)) throw new ApiError(400, '月份须为 YYYY-MM'); return month; };
const canWrite = user => { if (!['admin', 'manager', 'editor'].includes(user.role)) throw new ApiError(403, '仅主管和管理员可以维护月度计划及总结'); };
const amount = (v, label) => v === null ? null : numeric(v, label);
const count = (v, label) => v === null ? null : numeric(v, label, true);
const fmt = (v, digits = 2) => Number(v).toLocaleString('zh-CN', { maximumFractionDigits: digits });
const fields = ['salesTarget', 'collectionTarget', 'ordersTarget', 'hoursTarget'];

export function buildMonthlyMetrics(store, month) {
  monthValid(month);
  const sessions = store.list('sessions').filter(s => s.date.startsWith(month));
  const receipts = store.list('receipts').filter(r => r.receivedDate.startsWith(month));
  const plans = store.list('plans').filter(p => p.month === month);
    const end = `${month}-${new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate()}`;
  return store.list('anchors').filter(a => sessions.some(s => s.anchorId === a.id) || plans.some(p => p.anchorId === a.id) || receipts.some(r => r.anchorId === a.id) || ((!a.activeFrom || a.activeFrom <= end) && (!a.activeTo || a.activeTo >= `${month}-01`))).map(anchor => {
    const rows=sessions.filter(s=>s.anchorId===anchor.id), cash=receipts.filter(r=>r.anchorId===anchor.id), plan=plans.find(p=>p.anchorId===anchor.id)||null;
    const eligible=rows.filter(s=>s.sourceStatus!=='stopped');
    const received=total(cash.filter(r=>r.kind==='receipt'),'amount')-total(cash.filter(r=>r.kind==='refund'),'amount');
    const coverage=Object.fromEntries(['orderAmount','orders','actualMinutes','received'].map(key=>[key,{known:eligible.filter(s=>value(s[key])).length,expected:eligible.length}]));
    const all=key=>eligible.length>0&&coverage[key].known===eligible.length;
    const sales=coverage.orderAmount.known?total(rows,'orderAmount'):null;
    const orders=coverage.orders.known?total(rows,'orders'):null;
    const hours=coverage.actualMinutes.known?total(rows,'actualMinutes')/60:null;
    const collection=cash.length?received:null;
    const actual={sales,orders,hours,collection};
    const targetKeys={sales:'salesTarget',orders:'ordersTarget',hours:'hoursTarget',collection:'collectionTarget'};
    const comparisons=Object.fromEntries(Object.entries(targetKeys).map(([metric,targetKey])=>{
      const target=plan?.[targetKey]??null,current=actual[metric];
      return [metric,{target,actual:current,gap:value(target)&&value(current)?target-current:null,completion:value(target)&&target>0&&value(current)?current/target:null,complete:metric==='collection'?false:all(metric==='sales'?'orderAmount':metric==='hours'?'actualMinutes':'orders')}];
    }));
    return {anchorId:anchor.id,name:anchor.name,accountId:anchor.accountId||rows.at(-1)?.accountId||'',month,plan,actual,coverage,comparisons,sessionCount:rows.length,stoppedCount:rows.filter(s=>s.sourceStatus==='stopped').length,receiptCount:cash.length,cutoffDate:store.getDataset().cutoffDate||null};
  });
}

export function generateMonthlySummary(metric, options={}) {
  const {name,month,actual,comparisons,coverage,sessionCount,receiptCount}=metric;
  const lines=[`${month} · ${name} 主播月度总结报告`, ''];
  if(metric.plan?.notes)lines.push(`月度计划重点：${metric.plan.notes}`, '');
  const labels={sales:['销售金额','元'],collection:['到账净收款','元'],orders:['确认订单','单'],hours:['实际直播','小时']};
  for(const [key,[label,unit]] of Object.entries(labels)) {
    const c=comparisons[key], digits=key==='hours'?1:0,status=key==='collection'?(receiptCount?'按已登记到账流水':'尚未登记到账流水'):c.complete?'已登记场次字段已填齐，须复核全月覆盖':'当前已填部分，待补齐';
    lines.push(`${label}：目标 ${value(c.target)?fmt(c.target,digits):'未设'}${value(c.target)?unit:''}，实际 ${value(actual[key])?fmt(actual[key],digits):'待补'}${value(actual[key])?unit:''}（${status}）。`);
    if(value(c.gap)) lines.push(c.gap>0?`距${label}目标尚差 ${fmt(c.gap,digits)} ${unit}${c.complete?'。':'；数据未齐，此差额仅供核对。'}`:c.gap===0?`${label}已登记值恰好达到目标${c.complete?'。':'；请核对完整度。'}`:`${label}已超过目标 ${fmt(Math.abs(c.gap),digits)} ${unit}${c.complete?'。':'；需补齐数据后复核。'}`);
    if(value(c.completion))lines.push(`登记完成率 ${fmt(c.completion*100,1)}%${c.complete?'。':'（部分数据口径）。'}`);
  }
  lines.push('',`场次记录 ${sessionCount} 条。销售已填 ${coverage.orderAmount.known}/${coverage.orderAmount.expected}，单量已填 ${coverage.orders.known}/${coverage.orders.expected}，时长已填 ${coverage.actualMinutes.known}/${coverage.actualMinutes.expected}。`);
  lines.push('以上为系统已登记记录合计；已登记场次填齐不代表全月场次无遗漏，月结前须按排班及停播记录复核日期覆盖。');
  if(metric.cutoffDate&&metric.cutoffDate.startsWith(month))lines.push(`历史表格初始导入截止 ${metric.cutoffDate}；后续日期以系统实际补录记录为准。`);
  lines.push('收款按每笔实际到账日期归入月份，关联主播；不拿确认销售金额代替到账现金。退款流水按实际退款日冲减，非银行自动核对。');
  lines.push('', '下月优先方向：');
  if(!metric.plan)lines.push('1. 先设定可核对的月销售、收款、单量与直播时长计划。');
  if(!comparisons.hours.complete)lines.push('• 补齐上下播时间，确认实际直播小时，再判断是播出不足还是每小时销售效率下降。');
  if(!comparisons.orders.complete)lines.push('• 由客服补齐单量，再拆解订单数量和订单均价，暂不判断转化环节。');
  if(!receiptCount)lines.push('• 由主管或财务逐笔登记到账与退款，核对未收余额及账龄，暂不判断回款完成。');
  if(comparisons.sales.gap>0&&comparisons.sales.complete){
    if(comparisons.hours.complete&&comparisons.hours.gap>0)lines.push('• 销售与直播时长均未达计划，先核对排期兑现和停播原因，验证增加有效播出是否改善销售。');
    else lines.push('• 销售未达计划，优先用同主播的曝光、询单、订单均价和货盘记录找出差距，下一轮只调整少数变量验证。');
  }
  if(comparisons.orders.complete&&value(comparisons.orders.gap)&&comparisons.orders.gap<=0&&comparisons.sales.gap>0)lines.push('• 单量达标但销售未达标，检查成交价格带、订单均价和货盘结构，同时核对利润与退款。');
  if(comparisons.sales.complete&&value(comparisons.sales.gap)&&comparisons.sales.gap<=0)lines.push('• 销售达到计划，复盘表现较好的货盘、时段与讲解片段，确认退款与利润后再推广。');
  lines.push('以上为基于已登记事实的复盘建议，不是对个人能力或销售因果的自动判断；主管确认后再安排下月动作。');
  if(options.monthClosed===false)lines.push('', '当前月份尚未结束，本总结为阶段草稿，不能当作最终月结。');
  return lines.join('\n');
}

export async function handleMonthly({path,url,request,response,user,store,send,body}) {
  if(!path.startsWith('/api/monthly'))return false;
  if(path==='/api/monthly'&&request.method==='GET'){
    const month=monthValid(url.searchParams.get('month'));
    send(response,200,{month,metrics:buildMonthlyMetrics(store,month),plans:store.list('plans').filter(p=>p.month===month),receipts:store.list('receipts').filter(r=>r.receivedDate.startsWith(month)),reports:store.list('reports').filter(r=>r.month===month)});return true;
  }
  const match=/^\/api\/monthly\/(plans|receipts|reports)(?:\/([\w-]+))?$/.exec(path);
  if(!match||!['POST','PUT'].includes(request.method))throw new ApiError(404,'月度接口不存在');
  canWrite(user);
  const [,kind,id]=match,input=await body(request),existing=id?store.get(kind,id):null;
  if(id&&!existing)throw new ApiError(404,'记录不存在');
  if((request.method==='POST'&&id)||(request.method==='PUT'&&!id))throw new ApiError(405,'请求方法不支持');
  if(existing){version(input.version);if(input.version!==existing.version)throw new ApiError(409,'记录已被其他成员更新，请刷新后保存');}
  const item={...(existing||{}),id:id||randomUUID()};
  if(kind==='plans'){
    keys(input,['month','anchorId',...fields,'notes','version']);
    item.month=monthValid(input.month??existing?.month);item.anchorId=text(input.anchorId??existing?.anchorId,'主播',120,true);
    if(!store.get('anchors',item.anchorId))throw new ApiError(400,'主播不存在');
    for(const key of fields)item[key]=Object.hasOwn(input,key)?(key==='ordersTarget'?count(input[key],key):amount(input[key],key)):(existing?.[key]??null);
    item.notes=text(input.notes??existing?.notes??'','计划备注',4000);
    if(store.list('plans').some(p=>p.id!==item.id&&p.month===item.month&&p.anchorId===item.anchorId))throw new ApiError(409,'该主播本月计划已存在，请编辑原计划');
  }
  if(kind==='receipts'){
    keys(input,['anchorId','receivedDate','amount','kind','reference','originMonth','sessionId','orderReference','notes','version']);
    item.anchorId=text(input.anchorId??existing?.anchorId,'主播',120,true);if(!store.get('anchors',item.anchorId))throw new ApiError(400,'主播不存在');
    item.receivedDate=date(input.receivedDate??existing?.receivedDate,'实际到账日期');
    item.amount=numeric(input.amount??existing?.amount,'流水金额');if(!(item.amount>0))throw new ApiError(400,'流水金额必须大于0');
    item.kind=input.kind??existing?.kind??'receipt';if(!['receipt','refund'].includes(item.kind))throw new ApiError(400,'流水类型无效');
    item.reference=text(input.reference??existing?.reference??'','流水凭据号',160,true);
    item.sessionId=text(input.sessionId??existing?.sessionId??'','原成交场次',160);
    item.originMonth=input.originMonth??existing?.originMonth??'';
    if(item.originMonth)monthValid(item.originMonth);
    item.orderReference=text(input.orderReference??existing?.orderReference??'','原订单编号',200);
    if(item.sessionId){
      const session=store.get('sessions',item.sessionId);
      if(!session||session.anchorId!==item.anchorId)throw new ApiError(400,'原成交场次与归属主播不一致');
      if(item.originMonth&&item.originMonth!==session.date.slice(0,7))throw new ApiError(400,'原成交月份与所选场次不一致');
      item.originMonth=session.date.slice(0,7);
    }
    item.notes=text(input.notes??existing?.notes??'','备注',4000);
    if(store.list('receipts').some(r=>r.id!==item.id&&r.reference===item.reference))throw new ApiError(409,'该流水凭据号已存在，请核对避免重复收款');
  }
  if(kind==='reports'){
    keys(input,['month','anchorId','content','status','version']);item.month=monthValid(input.month??existing?.month);item.anchorId=text(input.anchorId??existing?.anchorId,'主播',120,true);
    const metric=buildMonthlyMetrics(store,item.month).find(m=>m.anchorId===item.anchorId);if(!metric)throw new ApiError(400,'主播不存在');
    const currentMonth=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit'}).format(new Date());
    item.content=Object.hasOwn(input,'content')?text(input.content,'总结内容',16000,true):generateMonthlySummary(metric,{monthClosed:item.month<currentMonth});
    item.status=input.status??existing?.status??'draft';if(!['draft','confirmed'].includes(item.status))throw new ApiError(400,'总结状态无效');
    if(item.status==='confirmed'&&item.month>=currentMonth)throw new ApiError(400,'当前或未来月份尚未结束，只能保存阶段草稿');
    item.snapshot=existing?.snapshot||metric;item.generatedAt=existing?.generatedAt||new Date().toISOString();
  }
  const saved=store.save(kind,item,existing?input.version:undefined,user);send(response,existing?200:201,{[kind==='plans'?'plan':kind==='receipts'?'receipt':'report']:saved});return true;
}
