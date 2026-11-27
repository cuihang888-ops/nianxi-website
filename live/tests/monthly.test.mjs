import test from 'node:test';
import assert from 'node:assert/strict';
import {createApplication} from '../server.mjs';
import {buildMonthlyMetrics,generateMonthlySummary} from '../lib/monthly.mjs';

test('monthly plans, cash dates and generated facts are management only',async()=>{
  const app=createApplication({dbPath:':memory:',demo:true,port:0,host:'127.0.0.1',today:'2026-11-25'});await app.listen();
  const base=`http://127.0.0.1:${app.server.address().port}`;
  const login=async(username,password)=>{const r=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})});return r.headers.get('set-cookie').split(';')[0];};
  const req=async(path,cookie,data,method='GET')=>{const response=await fetch(base+path,{method,headers:{cookie,...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})});return {status:response.status,data:await response.json()};};
  try{
    const admin=await login('demo','demo2026!'),staff=await login('recorder','record2026!');
    const anchorId=app.store.list('anchors')[0].id;
    assert.equal((await req('/api/monthly?month=2026-11',staff)).status,403);
    const p=await req('/api/monthly/plans',admin,{month:'2026-11',anchorId,salesTarget:500000,collectionTarget:300000,ordersTarget:200,hoursTarget:100,notes:'验证货盘'},'POST');
    assert.equal(p.status,201);assert.equal(p.data.plan.salesTarget,500000);
    assert.equal((await req('/api/monthly/plans',admin,{month:'2026-11',anchorId,salesTarget:1},'POST')).status,409);
    assert.equal((await req('/api/monthly/plans/'+p.data.plan.id,admin,{version:99,salesTarget:1},'PUT')).status,409);
    const origin=app.store.list('sessions').find(s=>s.anchorId===anchorId&&s.date.startsWith('2026-11'));
    const cash=await req('/api/monthly/receipts',admin,{anchorId,receivedDate:'2026-12-02',amount:1200,kind:'receipt',reference:'PAY-001',sessionId:origin.id,orderReference:'ORDER-001',notes:'11月订单12月到账'},'POST');assert.equal(cash.status,201);assert.equal(cash.data.receipt.originMonth,'2026-11');assert.equal(cash.data.receipt.sessionId,origin.id);assert.equal(cash.data.receipt.orderReference,'ORDER-001');
    assert.equal((await req('/api/monthly/receipts',admin,{anchorId,receivedDate:'2026-12-02',amount:10,reference:'PAY-WRONG',sessionId:origin.id,originMonth:'2026-10'},'POST')).status,400);
    assert.equal((await req('/api/monthly/receipts',admin,{anchorId,receivedDate:'2026-12-02',amount:1200,reference:'PAY-001'},'POST')).status,409);
    assert.equal(buildMonthlyMetrics(app.store,'2026-11').find(m=>m.anchorId===anchorId).actual.collection,null);
    assert.equal(buildMonthlyMetrics(app.store,'2026-12').find(m=>m.anchorId===anchorId).actual.collection,1200);
    const report=await req('/api/monthly/reports',admin,{month:'2026-11',anchorId},'POST');assert.equal(report.status,201);assert.equal(report.data.report.status,'draft');assert.ok(report.data.report.content.includes('实际直播'));assert.ok(report.data.report.snapshot.plan);
    assert.equal((await req('/api/monthly?month=2026-13',admin)).status,400);
  }finally{await app.close();}
});

test('summaries preserve unknown orders, duration and cash without inventing zero',()=>{
  const store={list:kind=>({anchors:[{id:'a',name:'测试主播'}],sessions:[{date:'2026-11-25',anchorId:'a',orderAmount:1000,orders:null,actualMinutes:null}],plans:[],receipts:[]}[kind]||[]),getDataset:()=>({cutoffDate:'2026-11-25'})};
  const metric=buildMonthlyMetrics(store,'2026-11')[0];
  assert.equal(metric.actual.orders,null);assert.equal(metric.actual.hours,null);assert.equal(metric.actual.collection,null);
  const content=generateMonthlySummary(metric,{monthClosed:false});assert.match(content,/确认订单：目标 未设，实际 待补/);assert.match(content,/实际直播：目标 未设，实际 待补/);assert.match(content,/阶段草稿/);
});

test('summary does not claim a target was reached when the target is unset or the full month is unverified',()=>{
  const store={list:kind=>({anchors:[{id:'a',name:'测试主播'}],sessions:[{date:'2026-11-25',anchorId:'a',orderAmount:1000,orders:2,actualMinutes:120}],plans:[],receipts:[]}[kind]||[]),getDataset:()=>({cutoffDate:'2026-11-25'})};
  const metric=buildMonthlyMetrics(store,'2026-11')[0],content=generateMonthlySummary(metric);
  assert.doesNotMatch(content,/销售达到计划|单量达标/);
  assert.match(content,/主播月度总结报告/);
  assert.match(content,/已登记场次填齐不代表全月场次无遗漏/);
  assert.match(content,/历史表格初始导入截止 2026-11-25/);
});

test('report rounds monetary display while metrics retain cents and plan notes',()=>{
  const store={list:kind=>({anchors:[{id:'a',name:'测试主播'}],sessions:[{date:'2026-11-25',anchorId:'a',orderAmount:1000.6,orders:2,actualMinutes:121}],plans:[{month:'2026-11',anchorId:'a',salesTarget:1200.3,notes:'重点核对货盘'}],receipts:[{receivedDate:'2026-11-25',anchorId:'a',kind:'receipt',amount:800.65}]}[kind]||[]),getDataset:()=>({})};
  const metric=buildMonthlyMetrics(store,'2026-11')[0],content=generateMonthlySummary(metric);
  assert.equal(metric.actual.sales,1000.6);assert.equal(metric.actual.collection,800.65);assert.equal(metric.comparisons.sales.target,1200.3);
  assert.match(content,/销售金额：目标 1,200元，实际 1,001元/);assert.match(content,/到账净收款：目标 未设，实际 801元/);assert.match(content,/重点核对货盘/);
  assert.doesNotMatch(content,/1,000\.6|800\.65|1,200\.3/);
});
