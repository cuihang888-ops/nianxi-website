'use strict';
const $ = (s, root = document) => root.querySelector(s);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icons = {
  calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 11h18M8 15h2m4 0h2m-8 3h2"/>',
  room:'<path d="M4 21V5l12-2v18M2 21h20M16 7h4v14M12 12v2"/>',
  people:'<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M17 4a3 3 0 0 1 0 6m1 4a5 5 0 0 1 3 4v3"/>',
  person:'<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  shield:'<path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Z"/><path d="m8 12 3 3 5-6"/>',
  arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',
  left:'<path d="m14 6-6 6 6 6"/>',right:'<path d="m10 6 6 6-6 6"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',
  check:'<path d="m5 12 4 4L19 6"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  logout:'<path d="M9 4H4v16h5M10 12h11m-4-4 4 4-4 4"/>',
  grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>'
};
const icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.grid}</svg>`;
const pad = n => String(n).padStart(2,'0');
const today = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const addDays = (date, n) => { const d=new Date(date+'T00:00:00Z'); d.setUTCDate(d.getUTCDate()+n); return d.toISOString().slice(0,10); };
const monthRange = month => { const [y,m]=month.split('-').map(Number); return {from:month+'-01',to:month+'-'+pad(new Date(Date.UTC(y,m,0)).getUTCDate())}; };
const monthLabel = month => `${Number(month.slice(0,4))}年 ${Number(month.slice(5,7))}月`;
const dateLabel = date => `${Number(date.slice(5,7))}月${Number(date.slice(8))}日`;
function remember(key,value){try{localStorage.setItem(key,value);}catch{}}
function recall(key,fallback=''){try{return localStorage.getItem(key)||fallback;}catch{return fallback;}}
function savedScheduleRoom(key='tongchang-favorite-room'){
  try{
    const saved=JSON.parse(recall(key,'null'));
    const dept=state.config?.departments.find(item=>item.id===saved?.department);
    return dept?.groups.includes(saved.group)?{department:dept.id,group:saved.group,name:dept.name}:null;
  }catch{return null;}
}
function isFavoriteRoom(){
  const saved=savedScheduleRoom();
  return saved?.department===state.department&&saved?.group===state.group;
}
function rememberScheduleRoom(){
  remember('tongchang-recent-room',JSON.stringify({department:state.department,group:state.group}));
}
function renderSavedScheduleRoom(){
  const favorite=savedScheduleRoom(),saved=favorite||savedScheduleRoom('tongchang-recent-room');
  if(!saved)return '';
  return `<div class="saved-room-shortcut"><span>${favorite?'常看直播间':'最近查看'}</span><button type="button" data-action="pick-schedule-room" data-dept="${esc(saved.department)}" data-group="${esc(saved.group)}"><strong>${esc(saved.name)} · ${esc(saved.group)}</strong><span>查看今天 ${icon('right')}</span></button></div>`;
}
function randomId(){return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=crypto.getRandomValues(new Uint8Array(1))[0]%16;return(c==='x'?r:(r&3)|8).toString(16);});}
let clientId=recall('tongchang-device'); if(!clientId){clientId=randomId();remember('tongchang-device',clientId);}
const requestedModule = new URLSearchParams(location.search).get('module');
const state = {config:null,user:null,csrfToken:'',role:null,page:'rooms',month:today().slice(0,7),date:today(),department:'d1',group:'一组',business:'all',scheduleOpenDept:'',schedulePicked:false,schedulePickerEditing:true,scheduleSearch:'',slotConfigDepartment:'d1',slotConfigGroup:'一组',slotConfigDraft:null,talents:[],schedules:[],bookings:[],connected:false,error:'',syncAt:null,search:'',talentStatus:'active',audit:null,auditLoading:false,auditError:'',auditFilters:{category:'view',outcome:'',day:today(),search:'',offset:0}};
if (requestedModule === 'rooms') state.role = 'venue';
if (requestedModule === 'schedule') {
  state.role = 'host';
  state.page = 'schedule';
}
const roles={venue:'查看模式',host:'查看模式',manager:'管理员'};
let modalContext=null,refreshNumber=0,toastTimer;
state.dataReady=false;state.loading=false;
const publicReadCache=new Map();
const pageHistory=[];
function navigationSnapshot(){
  return {role:state.role,page:state.page,month:state.month,date:state.date,department:state.department,group:state.group,business:state.business,
    scheduleOpenDept:state.scheduleOpenDept,schedulePicked:state.schedulePicked,schedulePickerEditing:state.schedulePickerEditing,
    slotConfigDepartment:state.slotConfigDepartment,slotConfigGroup:state.slotConfigGroup,scrollY};
}
function navigate(update){
  if(pageHistory.length>=50)pageHistory.shift();
  pageHistory.push(navigationSnapshot());
  Object.assign(state,update);render();window.scrollTo(0,0);recordView();
}
function goHome(){
  if(modalContext?.busy)return;
  closeModal(true);pageHistory.length=0;state.role=null;render();window.scrollTo(0,0);
}
function goBack(){
  if($('#modal').open)return closeModal();
  const previous=pageHistory.pop();
  if(previous){const position=previous.scrollY,changed=state.month!==previous.month||state.date!==previous.date;delete previous.scrollY;Object.assign(state,previous);if(changed){state.schedules=[];state.bookings=[];state.connected=false;}render();window.scrollTo(0,position);recordView();if(changed)refresh();}
  else goHome();
}
function recordView(kind=state.page,extra={}){
  if(!state.role||!['rooms','schedule','talents','talent-profile','talent-stories','talent-search'].includes(kind))return;
  const payload={kind,date:state.date,...extra};
  if(kind==='schedule'&&state.schedulePicked)Object.assign(payload,{department:state.department,group:state.group});
  api('/api/view-events',{method:'POST',body:JSON.stringify(payload)}).catch(()=>{});
}
async function api(url, options={}){
  const headers={'Content-Type':'application/json',...(options.headers||{})};
  const cacheable=(!options.method||options.method==='GET')&&url==='/api/talents?view=summary';
  const cached=cacheable?publicReadCache.get(url):null;
  if(cached?.etag)headers['If-None-Match']=cached.etag;
  if(state.csrfToken) headers['X-CSRF-Token']=state.csrfToken;
  const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),12000);
  try{
    let res=await fetch(url,{...options,headers,credentials:'same-origin',cache:'no-store',signal:controller.signal});
    if(res.status===304){
      if(cached)return cached.data;
      delete headers['If-None-Match'];
      res=await fetch(url,{...options,headers,credentials:'same-origin',cache:'no-store',signal:controller.signal});
    }
    const data=await res.json();
    if(!res.ok){const e=new Error(data.message||'操作未完成，请重试');e.status=res.status;e.data=data;throw e;}
    if(cacheable&&res.headers.get('ETag'))publicReadCache.set(url,{etag:res.headers.get('ETag'),data});
    return data;
  }catch(e){if(e.name==='AbortError')throw new Error('连接超时，请稍后重试');throw e;}
  finally{clearTimeout(timer);}
}
function toast(message){clearTimeout(toastTimer);$('#toast').textContent=message;$('#toast').classList.add('show');toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),4000);}
function talent(id){return state.talents.find(t=>t.id===id);}
function scheduleTalentIds(schedule){
  if(!schedule)return [];
  const ids=Array.isArray(schedule.talentIds)?schedule.talentIds.filter(Boolean):[];
  if(!ids.length&&schedule.talentId)ids.push(schedule.talentId);
  return [...new Set(ids)].slice(0,3);
}
function schedulePeople(schedule){
  return scheduleTalentIds(schedule).map(talent).filter(Boolean);
}
function activeDepartment(id){return state.config?.departments?.find(item=>item.id===id);}
function departmentById(id){return activeDepartment(id)||state.config?.archivedDepartments?.find(item=>item.id===id);}
function department(){return activeDepartment(state.department)||state.config?.departments?.[0];}
function normalizeDepartmentSelections(){
  const current=activeDepartment(state.department);
  if(!current?.groups.includes(state.group)){
    const fallback=state.config?.departments?.[0];
    state.department=fallback?.id||'';state.group=fallback?.groups[0]||'';
    state.schedulePicked=false;state.schedulePickerEditing=true;state.scheduleOpenDept='';
  }
  const managed=activeDepartment(state.slotConfigDepartment)||state.config?.departments?.[0];
  state.slotConfigDepartment=managed?.id||'';
  if(!managed?.groups.includes(state.slotConfigGroup))state.slotConfigGroup=managed?.groups[0]||'';
}
function departmentSlots(dept=department(),group=state.group){return dept?.groups.includes(group)?dept.groupSlots?.[group]||dept.slots:[];}
function departmentSlotSummary(dept){const variants=[...new Set(dept.groups.map(group=>departmentSlots(dept,group).join('|')))];return variants.length>1?'按组显示场次':departmentSlots(dept,dept.groups[0]).map(slot=>slotName(slot).replace('场','')).join(' / ');}
function slotName(slot){return state.config.slots.find(s=>s.id===slot)?.name||slot;}
function slotTime(slot){const s=state.config.slots.find(s=>s.id===slot);return s?`${s.start}–${s.endDayOffset?'次日':''}${s.end}`:'';}
function slotTimeLines(slot){const s=state.config.slots.find(s=>s.id===slot);return s?`${s.start}<br>–${s.endDayOffset?'次日':''}${s.end}`:'';}
function safeAvatar(url){return typeof url==='string' && (/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(url)||/^\/api\/talents\/[A-Za-z0-9-]+\/avatar\?v=[a-f0-9]{64}$/.test(url));}
function avatar(person,size=''){return `<span class="avatar ${size}">${safeAvatar(person?.avatar)?`<img src="${esc(person.avatar)}" loading="lazy" decoding="async" alt="${esc(person.name)}的头像">`:esc((person?.name||'待').slice(0,1))}</span>`;}
function talentProfileButton(person,extraClass=''){return `<span class="talent-content-actions ${extraClass}"><button type="button" class="talent-profile-button" data-action="talent-profile" data-id="${esc(person.id)}" aria-label="查看${esc(person.name)}的身份简介">身份简介</button><button type="button" class="talent-profile-button talent-stories-button" data-action="talent-stories" data-id="${esc(person.id)}" aria-label="查看${esc(person.name)}的最近剧情">最近剧情</button></span>`;}
function businessClass(b){return b==='虾皮'?'business-shopee':b==='国内'?'business-domestic':'';}
function stat(label,value,unit,ico){return `<div class="stat"><div><span>${label}</span><strong>${value}</strong><small>${unit}</small></div>${icon(ico)}</div>`;}
function selectOptions(values,selected,label=v=>v,value=v=>v){return values.map(v=>`<option value="${esc(value(v))}" ${String(value(v))===String(selected)?'selected':''}>${esc(label(v))}</option>`).join('');}
function monthControl(){return `<div class="month-picker"><button class="icon-button" data-action="month-prev" aria-label="上个月">${icon('left')}</button><strong>${monthLabel(state.month)}</strong><button class="icon-button" data-action="month-next" aria-label="下个月">${icon('right')}</button><button class="button secondary small" data-action="today">本月</button></div>`;}
function weekLabel(date){return ['日','一','二','三','四','五','六'][new Date(date+'T00:00:00Z').getUTCDay()];}
const roomPhoneLayout=window.matchMedia('(max-width:760px)');
function roomViewDays(){return roomPhoneLayout.matches?1:3;}
roomPhoneLayout.addEventListener('change',()=>{if(state.role&&state.page==='rooms')render();});
function navItems(){const items=[['rooms','room'],['schedule','calendar']];if(state.user)items.push(['talents','people'],['slot-config','grid']);return items;}
function systemVersionButton(){
  const version=state.config?.release?.version;
  return version?`<button type="button" class="system-version" data-action="release-notes" aria-label="查看系统版本${esc(version)}及更新记录">v${esc(version)}</button>`:'';
}
function managerFooter(){
  const actions=state.user?`<div class="manager-quick"><button class="text-button" data-action="page" data-page="rooms">场地预约</button><button class="text-button" data-action="page" data-page="schedule">卖手排班</button><button class="text-button" data-action="page" data-page="talents">卖手维护</button><button class="text-button" data-action="page" data-page="slot-config">部门与场次</button>${state.user.username==='owner'?'<button class="text-button" data-action="page" data-page="audit">安全日志</button>':''}<button class="text-button" data-action="logout">退出登录</button>${systemVersionButton()}</div>`:`<div class="manager-quick"><button class="button outline small" data-action="login">管理员登录</button>${systemVersionButton()}</div>`;
  return `<footer class="manager-footer"><strong>${state.user?`管理员：${esc(state.user.displayName)}`:'管理员入口'}</strong>${actions}</footer>`;
}
function renderEntry(){
  $('#app').innerHTML=`<main class="simple-entry"><section class="simple-entry-card"><div class="simple-entry-title"><span class="brand-mark">同</span><h1>预约工作台</h1>${systemVersionButton()}</div><div class="simple-entry-actions"><button class="simple-entry-action" data-action="choose-role" data-role="venue">${icon('room')}<span>看场地</span>${icon('arrow')}</button><button class="simple-entry-action" data-action="choose-role" data-role="host">${icon('people')}<span>看卖手</span>${icon('arrow')}</button><button class="simple-entry-action admin" data-action="login">${icon('shield')}<span>${state.user?'管理后台':'管理员登录'}</span>${icon('arrow')}</button></div></section></main>`;
}
function render(){
  if(!state.config||!state.role){renderEntry();return;}
  normalizeDepartmentSelections();
  if(!state.user&&['talents','slot-config'].includes(state.page))state.page='rooms';
  if(state.page==='audit'&&state.user?.username!=='owner')state.page='rooms';
  const titles={rooms:'场地预约',schedule:'卖手预约',talents:'人才总库',audit:'安全日志','slot-config':'部门与场次'};
  const nav=navItems().map(([page,ico])=>`<button data-action="page" data-page="${page}" class="${state.page===page?'active':''}" ${state.page===page?'aria-current="page"':''}>${icon(ico)}${titles[page]}${page==='talents'?`<small>${state.talents.filter(t=>t.active).length}</small>`:''}</button>`).join('');
  const identity=state.user?`<div class="identity-card"><strong>管理员 · ${esc(state.user.displayName)}</strong><div class="identity-actions"><button class="text-button" data-action="logout">返回首页</button></div></div>`:`<div class="identity-card"><strong>${esc(roles[state.role])}</strong><div class="identity-actions"><button class="text-button" data-action="switch-role">返回首页</button><button class="text-button" data-action="login">管理员登录</button></div></div>`;
  if(!state.dataReady){
    $('#app').innerHTML=`<main class="initial-data-loading"><div class="navigation-controls"><button class="text-button" data-action="go-back">返回</button><button class="text-button" data-action="home">首页</button></div><section class="panel" role="status"><p>${state.error?esc(state.error):'正在读取最新安排…'}</p>${state.error?'<button class="button secondary" data-action="refresh">重新读取</button>':''}</section></main>`;
    return;
  }
  $('#app').innerHTML=`<div class="shell ${state.page==='rooms'?'rooms-page':''} ${state.page==='schedule'?'schedule-page':''} ${state.page==='schedule'&&state.schedulePicked&&!state.schedulePickerEditing?'schedule-selected':''} ${state.user?'is-admin':''}"><aside class="sidebar"><div class="navigation-controls" aria-label="页面返回"><button class="text-button" data-action="go-back" aria-label="返回上一层">${icon('left')}返回</button><button class="text-button" data-action="home" aria-label="回到主页面">首页</button></div><nav class="nav" aria-label="主导航">${nav}</nav><div class="sidebar-bottom">${identity}</div></aside><div class="workspace"><header class="topbar"><h1>${titles[state.page]}</h1><div class="top-right"><span class="status ${state.connected?'':'offline'}" id="sync-state">${syncText()}</span><span class="mobile-brand"><button class="text-button" data-action="home">首页</button></span>${state.user?`<span class="admin-badge">${esc(state.user.displayName)}</span><button class="text-button mobile-brand" data-action="logout">退出登录</button>`:`<button class="button outline small" data-action="login">管理员登录</button>`}</div></header><main class="content">${state.error?`<div class="banner-error"><span>${esc(state.error)}</span><button class="button secondary small" data-action="refresh">重试</button></div>`:''}${state.page==='rooms'?renderRooms():state.page==='schedule'?renderScheduleV2():state.page==='audit'?renderAudit():state.page==='slot-config'?renderSlotConfig():renderTalents()}</main>${managerFooter()}</div></div>`;
}
function syncText(){return state.loading?'正在同步…':state.connected?`已同步 ${state.syncAt||''}`:'连接中断';}
function renderRooms(){
  const dayCount=roomViewDays();
  const viewDates=Array.from({length:dayCount},(_,i)=>addDays(state.date,i));
  const viewBookings=state.bookings.filter(b=>viewDates.includes(b.date));
  const totalSlots=state.config.rooms.length*state.config.slots.length*viewDates.length;
  const rangeLabel=dayCount===1?`${dateLabel(state.date)} · 周${weekLabel(state.date)}`:`${dateLabel(viewDates[0])} 至 ${dateLabel(viewDates.at(-1))}`;
  return `<div class="page-heading compact-heading"><h2>${rangeLabel}</h2><span class="pill">${state.config.rooms.length} 间场地 · ${totalSlots-viewBookings.length} 个空闲</span></div>
    <section class="panel room-board-panel">
      <div class="panel-head room-board-head">
        <div class="room-board-description"><h2>场地时段</h2><p>${state.user?'点击空闲格预约，点击已预约格查看详情。':'点击查看时段详情，仅管理员可预约。'}</p></div>
        <div class="toolbar room-range-tools">
          <button class="icon-button" data-action="room-prev" aria-label="${dayCount===1?'前一天':'前3天'}">${icon('left')}</button>
          <input type="date" id="room-start-date" value="${state.date}" aria-label="${dayCount===1?'选择日期':'选择起始日期'}">
          <button class="icon-button" data-action="room-next" aria-label="${dayCount===1?'后一天':'后3天'}">${icon('right')}</button>
          <button class="button secondary small" data-action="room-today">今天</button>
        </div>
      </div>
      <div class="room-board-scroll"><div class="room-board" style="--room-count:${state.config.rooms.length}">
        <div class="room-board-dates"><div class="corner-cell">直播间</div>${viewDates.map(d=>`<div class="board-date" style="grid-column:span ${state.config.slots.length}"><b>${dateLabel(d)}</b><small>${d===today()?'今天':'周'+weekLabel(d)}</small></div>`).join('')}</div>
        <div class="room-board-slots"><div class="corner-cell muted">房间</div>${viewDates.map(()=>state.config.slots.map(slot=>`<div><b>${esc(slot.name)}</b><small>${slotTime(slot.id)}</small></div>`).join('')).join('')}</div>
        ${state.config.rooms.map((room,index)=>`<div class="room-board-row">
          <div class="board-room"><strong>${esc(room)}</strong><small>${pad(index+1)}</small></div>
          ${viewDates.map(date=>state.config.slots.map(slot=>{
            const b=viewBookings.find(b=>b.date===date&&b.room===room&&b.slot===slot.id),past=date<today();
            return `<button class="board-slot ${b?'booked':''}" data-action="room-slot" data-date="${date}" data-room="${esc(room)}" data-slot="${slot.id}" ${(!state.connected||(!b&&past))?'disabled':''} aria-label="${esc(room)} ${date} ${slot.name} ${b?'已预约':'空闲'}"><b>${b?esc(b.department):past?'已结束':'空闲'}</b><small>${b?esc(b.bookerName):slotTime(slot.id)}</small></button>`;
          }).join('')).join('')}
        </div>`).join('')}
      </div></div>
      <div class="calendar-footer"><div class="legend"><span><i class="dot"></i>空闲</span><span><i class="dot booked"></i>已预约</span></div><span class="room-board-hint">${dayCount===1?`${state.config.rooms.length} 间 · 周${weekLabel(state.date)}`:'左右滑动查看日期'}</span></div>
    </section>`;
}
function renderSchedulePicker(){
  const current=department(),departments=state.config.departments||[];
  if(state.schedulePicked&&!state.schedulePickerEditing&&current)return `<section class="panel schedule-picker-summary"><div>${icon('room')}<span><small>当前直播间</small><strong>${esc(current.name)} · ${esc(state.group)}</strong></span></div><button class="button outline small" data-action="change-schedule-room">更换直播间</button></section>`;
  if(!departments.length)return `<section class="panel department-empty"><h2>暂无可排班部门</h2><p>已有排班可通过上方搜索查看。${state.user?'请先在“部门与场次”新增部门。':'新增部门后会显示在这里。'}</p>${state.user?'<button class="button" data-action="page" data-page="slot-config">管理部门与场次</button>':''}</section>`;
  return `<section class="panel schedule-picker"><div class="picker-head"><div><h2>选择直播间</h2><p>选择部门和组别，查看当天安排。</p></div>${state.schedulePicked&&current?`<span class="pill">当前：${esc(current.name)} · ${esc(state.group)}</span>`:''}</div>${renderSavedScheduleRoom()}<div class="schedule-accordion">${departments.map(d=>{const open=state.scheduleOpenDept===d.id||(state.schedulePicked&&state.department===d.id);return `<article class="schedule-section ${open?'open':''}"><button class="schedule-section-head" data-action="toggle-schedule-dept" data-id="${esc(d.id)}" aria-expanded="${open}"><span><b>${esc(d.name)}</b></span><em>${d.groups.length} 个组 · ${departmentSlotSummary(d)}</em></button>${open?`<div class="schedule-room-list">${d.groups.map(g=>`<button data-action="pick-schedule-room" data-dept="${esc(d.id)}" data-group="${esc(g)}" class="${state.schedulePicked&&state.department===d.id&&state.group===g?'active':''}"><strong>${esc(d.name)}${esc(g)}</strong><small>${departmentSlots(d,g).map(slotName).join(' / ')}</small></button>`).join('')}</div>`:''}</article>`;}).join('')}</div></section>`;
}
function scheduleRangeLabel(from,to){return from===to?dateLabel(from):`${dateLabel(from)}—${dateLabel(to)}`;}
function scheduleSegments(viewDates,schedules,slot){
  const segments=[];
  for(const day of viewDates){
    const schedule=schedules.find(s=>s.date===day&&s.slot===slot);
    const key=schedule?`${schedule.business}|${scheduleTalentIds(schedule).slice().sort().join('|')}`:`empty:${day<today()?'past':'open'}`;
    const last=segments.at(-1);
    if(last&&last.key===key&&addDays(last.to,1)===day){
      last.to=day;if(schedule)last.schedules.push(schedule);
    }else segments.push({from:day,to:day,key,schedules:schedule?[schedule]:[]});
  }
  return segments;
}
function posterPerson(person,index){
  if(!person)return `<div class="poster-person poster-person-vacant"><span class="poster-photo poster-photo-empty">${icon('person')}<em>第${index+1}位</em></span><strong>待安排</strong><small>尚未安排卖手</small></div>`;
  const portrait=safeAvatar(person.avatar)?`<img src="${esc(person.avatar)}" decoding="async" alt="${esc(person.name)}的头像">`:`<span class="poster-avatar-fallback">${esc(person.name.slice(0,1))}<small>未上传头像</small></span>`;
  return `<div class="poster-person"><button type="button" class="poster-photo" data-action="talent-photo" data-id="${esc(person.id)}" aria-label="放大查看${esc(person.name)}的完整照片">${portrait}<b class="poster-number">${esc(person.number)}</b></button><div class="poster-person-caption"><span><strong>${esc(person.name)}</strong><small>${esc(person.number)}</small></span>${talentProfileButton(person)}</div></div>`;
}
function posterPeople(schedule){
  const people=schedulePeople(schedule);
  const count=Math.max(2,Math.min(3,people.length));
  return `<div class="poster-people ${count===3?'has-third':''}">${Array.from({length:count},(_,index)=>posterPerson(people[index],index)).join('')}</div>`;
}
function renderSchedulePoster(viewDates,viewSchedules,dept){
  return `<section class="schedule-poster ${viewDates.length===1?'portrait-board':''}" aria-label="${viewDates.length===1?'当天大头像排班':'三日排班总览'}">
    <div class="poster-dates"><span>班次</span>${viewDates.map(day=>`<div><b>${dateLabel(day)}</b><small>${day===today()?'今天':'周'+weekLabel(day)}</small></div>`).join('')}</div>
    <div class="poster-shifts">${departmentSlots(dept).map(slot=>{
      const allSegments=scheduleSegments(viewDates,viewSchedules,slot);
      return `<section class="poster-shift" aria-label="${slotName(slot)}安排"><div class="poster-shift-title"><h3>${slotName(slot)}</h3><span>${slotTimeLines(slot)}</span></div><div class="poster-segments">${allSegments.map(segment=>{
        const days=viewDates.filter(day=>day>=segment.from&&day<=segment.to).length;
        const start=viewDates.indexOf(segment.from)+1;
        const schedule=segment.schedules[0],past=segment.to<today(),noAccess=!state.user||past||!state.connected;
        const filtered=schedule&&state.business!=='all'&&schedule.business!==state.business;
        if(filtered)return `<article class="poster-segment is-filtered days-${days}" style="grid-column:${start} / span ${days}"><span class="poster-empty-label">${esc(schedule.business)}安排</span><small>已按业务筛选隐藏</small></article>`;
        return `<article class="poster-segment days-${days} ${schedule?'has-schedule '+businessClass(schedule.business):'is-empty'} ${!schedule&&noAccess?'is-inactive':''}" style="grid-column:${start} / span ${days}"><button type="button" class="schedule-card-open" data-action="${schedule?'schedule-segment':'schedule-slot'}" data-from="${segment.from}" data-to="${segment.to}" data-date="${segment.from}" data-slot="${slot}" ${schedule?`data-business="${esc(schedule.business)}"`:''} ${!schedule&&noAccess?'disabled':''} aria-label="${scheduleRangeLabel(segment.from,segment.to)} ${slotName(slot)} ${schedule?esc(schedulePeople(schedule).map(p=>`${p.name} 编号${p.number}`).join('、')):'未排班'}"></button>${schedule?`<div class="poster-segment-head"><b>${esc(schedule.business)}</b><strong>${days>1?scheduleRangeLabel(segment.from,segment.to):''}</strong></div>${posterPeople(schedule)}`:`<span class="poster-empty-label">${past?'已结束':'未排班'}</span>${state.user&&!past?'<small>点击安排</small>':''}`}</article>`;
      }).join('')}</div></section>`;
    }).join('')}</div>
  </section>`;
}
function renderScheduleGrid(viewDates,viewSchedules,dept){
  return `<div class="seller-board-scroll"><div class="seller-board" style="--schedule-shifts:${departmentSlots(dept).length}"><div class="seller-head sticky-left">时段</div>${viewDates.map(d=>`<div class="seller-head"><b>${dateLabel(d)}</b><small>${d===today()?'今天':'周'+weekLabel(d)}</small></div>`).join('')}${departmentSlots(dept).map(slot=>`<div class="seller-slot-label sticky-left"><b>${slotName(slot)}</b><small>${slotTime(slot)}</small></div>${viewDates.map(date=>{const s=viewSchedules.find(s=>s.date===date&&s.slot===slot),people=schedulePeople(s),past=date<today(),filtered=s&&state.business!=='all'&&s.business!==state.business,noAccess=!s&&(!state.user||past||!state.connected);return `<article class="seller-cell ${s?'occupied '+businessClass(s.business):''} ${filtered?'filtered':''} ${noAccess?'is-inactive':''}"><button type="button" class="schedule-card-open" data-action="schedule-slot" data-date="${date}" data-slot="${slot}" ${s?`data-id="${esc(s.id)}"`:''} ${noAccess?'disabled':''} aria-label="${date} ${slotName(slot)} ${s?esc(people.map(p=>`${p.name} ${p.number}`).join('、'))+' 已排班':'未排班'}"></button>${s?`<div class="seller-people ${people.length>2?'has-third':''}">${people.map(p=>`<div class="seller-person">${avatar(p,'schedule-avatar')}<span class="seller-person-meta"><b>${esc(p.name)}</b><small>${esc(p.number)}</small></span>${talentProfileButton(p)}</div>`).join('')}${people.length<2?`<div class="seller-person seller-person-empty"><span class="seller-person-placeholder">＋</span><span class="seller-person-meta"><b>待安排</b><small>可补第${people.length+1}人</small></span></div>`:''}</div><span class="seller-business">${esc(s.business)} · ${people.length===3?'3位（含特使）':people.length===2?'2位':'1位'}</span>`:`<span class="seller-empty"><b>${past?'已结束':'未排班'}</b><small>${state.user&&!past?'点击新增':' '}</small></span>`}</article>`;}).join('')}`).join('')}</div></div>`;
}
function renderScheduleV2(){
  const dept=department(),viewDates=[state.date];
  const inGroup=state.schedulePicked&&dept?state.schedules.filter(s=>s.department===dept.id&&s.group===state.group):[];
  const viewSchedules=inGroup.filter(s=>viewDates.includes(s.date));
  const headingAction=state.user&&state.schedulePicked?`<button class="button" data-action="new-schedule">${icon('plus')}新增排班</button>`:`<span class="pill">${state.schedulePicked?'常规2位 · 特殊场次可加第3位':'先选择直播间'}</span>`;
  const intro=`<div class="page-heading compact-heading"><h2>卖手排班</h2>${headingAction}</div><form id="schedule-quick-search-form" class="schedule-quick-search" role="search"><label class="search">${icon('search')}<input type="search" id="schedule-quick-search" name="q" maxlength="64" value="${esc(state.scheduleSearch)}" placeholder="搜索卖手姓名或编号" aria-label="搜索卖手姓名或编号"></label><button class="button small" type="submit">搜索</button></form>${renderSchedulePicker()}`;
  if(!dept||!state.schedulePicked||state.schedulePickerEditing)return intro;
  const favorite=isFavoriteRoom();
  const controls=`<div class="schedule-controls"><div class="schedule-room-bar"><div class="schedule-room-title"><button type="button" class="schedule-room-name" data-action="change-schedule-room" aria-label="更换直播间，当前${esc(dept.name)}${esc(state.group)}"><h2>${esc(dept.name)} · ${esc(state.group)}</h2>${icon('right')}</button><button type="button" class="favorite-room-button ${favorite?'is-saved':''}" data-action="toggle-favorite-room" aria-pressed="${favorite}" aria-label="${favorite?'取消常看直播间':'设为常看直播间'}" title="${favorite?'已设为常看':'设为常看'}">${favorite?'★':'☆'}</button></div><div class="schedule-room-actions"><button class="icon-button" data-action="find-talent" aria-label="搜索卖手">${icon('search')}</button>${state.user?'<button class="button outline small" data-action="copy-schedule">沿用上轮</button><button class="button small" data-action="new-schedule">新增</button>':''}</div></div><div class="schedule-control-row"><div class="toolbar room-range-tools"><button class="icon-button" data-action="room-prev-3" aria-label="前一天">${icon('left')}</button><input type="date" id="room-start-date" value="${state.date}" aria-label="选择日期"><button class="icon-button" data-action="room-next-3" aria-label="后一天">${icon('right')}</button><button class="button secondary small" data-action="room-today">今天</button></div><div class="schedule-options"><select id="business-filter" aria-label="业务筛选"><option value="all">全部业务</option>${selectOptions(state.config.businesses,state.business)}</select></div></div></div>`;
  const content=renderSchedulePoster(viewDates,viewSchedules,dept);
  return controls+`<section class="panel seller-board-panel">${content}<div class="calendar-footer"><span>常规安排2位 · 特殊场次可加第3位 · 身份简介、最近剧情可分别点开</span></div></section>`;
}
function renderTalents(){
  const q=state.search.toLocaleLowerCase(),people=state.talents.filter(t=>(state.talentStatus==='all'||(state.talentStatus==='active'?t.active:!t.active))&&`${t.number} ${t.name}`.toLocaleLowerCase().includes(q));
  return `<div class="page-heading compact-heading"><h2>卖手维护</h2>${state.user?`<button class="button" data-action="new-talent">${icon('plus')}录入卖手</button>`:'<span class="pill">仅管理员可编辑</span>'}</div><div class="talent-tools"><div class="search">${icon('search')}<input id="talent-search" type="search" value="${esc(state.search)}" placeholder="搜索名字或编号" aria-label="搜索卖手"></div><select id="talent-status" aria-label="人员状态">${selectOptions([{v:'active',l:'可排班人员'},{v:'inactive',l:'暂停排班'},{v:'all',l:'全部人员'}],state.talentStatus,v=>v.l,v=>v.v)}</select><span class="muted" style="font-size:11px">共 ${people.length} 位</span></div><div class="talents-grid">${people.length?people.map(p=>`<article class="talent-card"><div class="talent-info">${avatar(p,'large')}<div><h3>${esc(p.name)}</h3><p>编号 ${esc(p.number)}</p></div></div><div class="talent-card-foot"><span>${p.active?'● 可排班':'○ 已暂停'}</span><div class="talent-card-actions">${talentProfileButton(p)}${state.user?`<button class="text-button" data-action="edit-talent" data-id="${esc(p.id)}">编辑资料</button>`:`<span>本月 ${state.schedules.filter(s=>scheduleTalentIds(s).includes(p.id)).length} 场</span>`}</div></div></article>`).join(''):`<div class="empty">${icon('people')}<h3>${state.talents.length?'没有找到符合条件的卖手':'暂无卖手'}</h3><p>${state.user?'录入头像、姓名和编号后即可排班。':'请联系管理员录入人员。'}</p>${state.user?'<button class="button" data-action="new-talent">录入卖手</button>':''}</div>`}</div>`;
}
function renderSlotConfig(){
  const departments=state.config?.departments||[];
  const selectedDepartment=departments.find(item=>item.id===state.slotConfigDepartment)||departments[0];
  const group=selectedDepartment?.groups.includes(state.slotConfigGroup)?state.slotConfigGroup:selectedDepartment?.groups[0];
  if(selectedDepartment){state.slotConfigDepartment=selectedDepartment.id;state.slotConfigGroup=group||'';}
  const draft=state.slotConfigDraft;
  const hasDraft=Boolean(draft&&draft.department===selectedDepartment?.id&&draft.group===group);
  const active=new Set(hasDraft?draft.slots:departmentSlots(selectedDepartment,group));
  const slots=state.config?.slots||[];
  const orphanedDraft=draft&&!activeDepartment(draft.department)?.groups.includes(draft.group);
  const heading=`<div class="page-heading compact-heading department-management-heading"><div><h2>部门与场次</h2><p>管理员可新增、改名、删除部门与组别，并设置早、中、晚场。</p></div><button class="button" data-action="new-department">${icon('plus')}新增部门</button></div>${orphanedDraft?`<div class="banner-error department-orphaned-draft" role="alert"><strong>刚才编辑的部门或组别已停用，场次草稿尚未保存。</strong><span>${esc(departmentById(draft.department)?.name||'原部门')} · ${esc(draft.group)}：${draft.slots.length?draft.slots.map(slotName).map(esc).join(' / '):'未勾选场次'}</span><span>重新选择部门或组别，或点“恢复当前设置”后再编辑。</span></div>`:''}`;
  if(!selectedDepartment)return heading+`<section class="panel department-empty"><h2>暂无部门</h2><p>新增一个部门和组别后，即可安排卖手。已有排班仍可从卖手搜索查看。</p><button class="button" data-action="new-department">新增第一个部门</button></section>`;
  return heading+`
    <section class="panel slot-config-panel">
      <div class="panel-head"><div><h2>${esc(selectedDepartment.name)}</h2><p>${selectedDepartment.groups.length} 个组 · 仅管理员可编辑</p></div><div class="department-manage-actions"><button type="button" class="button secondary small" data-action="rename-department">改名</button><button type="button" class="text-button department-delete" data-action="delete-department">删除部门</button></div></div>
      <form id="slot-config-form" class="slot-config-form">
        <div class="form-grid slot-config-selects">
          <label>部门<select id="slot-config-department" name="department">${selectOptions(departments,selectedDepartment?.id||'',d=>d.name,d=>d.id)}</select></label>
          <label>组别<select id="slot-config-group" name="group">${selectOptions(selectedDepartment?.groups||[],group||'')}</select></label>
        </div>
        <div class="department-group-actions"><span>当前组别：${esc(group)}</span><div><button type="button" class="button secondary small" data-action="new-department-group">${icon('plus')}新增组别</button><button type="button" class="text-button department-delete" data-action="delete-department-group" ${selectedDepartment.groups.length<=1?'disabled title="每个部门至少保留一个组别"':''}>删除此组</button></div></div>
        <fieldset class="slot-config-options"><legend>启用场次</legend><div class="slot-config-grid">${slots.map(slot=>`<label class="slot-config-option ${active.has(slot.id)?'is-active':''}"><input type="checkbox" name="slot" value="${esc(slot.id)}" ${active.has(slot.id)?'checked':''}><span><strong>${esc(slot.name)}</strong><small>${esc(slotTime(slot.id))}</small></span></label>`).join('')}</div></fieldset>
        <div class="form-notice slot-config-history">删除部门、组别或停用场次，均保留已有排班，停止后续新增。历史安排仍可从卖手搜索查看，管理员可取消当天及未来的安排。</div>
        ${hasDraft?'<p class="department-draft-note" role="status">场次修改尚未保存</p>':''}
        <div class="form-error" id="slot-config-error"></div>
        <div class="modal-actions"><button class="button secondary" type="button" data-action="slot-config-reset">恢复当前设置</button><button class="button" type="submit" ${orphanedDraft?'disabled':''}>保存场次设置</button></div>
      </form>
    </section>`;
}
function departmentSlotFields(selected=state.config.slotIds||state.config.slots.map(slot=>slot.id)){
  return `<fieldset class="slot-config-options"><legend>启用场次</legend><div class="slot-config-grid">${state.config.slots.map(slot=>`<label class="slot-config-option ${selected.includes(slot.id)?'is-active':''}"><input type="checkbox" name="slot" value="${esc(slot.id)}" ${selected.includes(slot.id)?'checked':''}><span><strong>${esc(slot.name)}</strong><small>${esc(slotTime(slot.id))}</small></span></label>`).join('')}</div></fieldset>`;
}
function openDepartmentEditor(action){
  if(!state.user)return openLogin();
  const selected=activeDepartment(state.slotConfigDepartment),group=state.slotConfigGroup;
  if(action!=='new-department'&&!selected)return toast('该部门已删除，请重新选择');
  if(action==='new-department')return openModal('新增部门','',`<form id="department-form"><label>部门名称<input name="name" required maxlength="40" placeholder="例如：六部"></label><label>初始组别<textarea name="groups" required rows="3" maxlength="1000" placeholder="每行填写一个组别">一组</textarea><small>每行一个组别，每个名称最多20字。</small></label>${departmentSlotFields()}<div class="form-error" id="form-error"></div><div class="modal-actions"><button type="button" class="button secondary" data-action="close-modal">取消</button><button type="submit" class="button">新增部门</button></div></form>`,{kind:'department-editor'});
  if(action==='rename-department')return openModal('部门改名','',`<form id="rename-department-form"><label>部门名称<input name="name" required maxlength="40" value="${esc(selected.name)}"></label><p class="help-text">改名后，原组别和已有排班继续保留。</p><div class="form-error" id="form-error"></div><div class="modal-actions"><button type="button" class="button secondary" data-action="close-modal">取消</button><button type="submit" class="button">保存名称</button></div></form>`,{kind:'department-editor',department:selected.id});
  if(action==='new-department-group')return openModal('新增组别',esc(selected.name),`<form id="department-group-form"><label>组别名称<input name="name" required maxlength="20" placeholder="例如：五组"><small>最多20字。</small></label>${departmentSlotFields()}<div class="form-error" id="form-error"></div><div class="modal-actions"><button type="button" class="button secondary" data-action="close-modal">取消</button><button type="submit" class="button">新增组别</button></div></form>`,{kind:'department-editor',department:selected.id});
  if(action==='delete-department-group'&&!selected.groups.includes(group))return toast('该组别已删除，请重新选择');
  if(action==='delete-department-group'&&selected.groups.length<=1)return toast('每个部门至少保留一个组别');
  const isGroup=action==='delete-department-group',target=isGroup?`${selected.name} · ${group}`:selected.name,formId=isGroup?'delete-department-group-form':'delete-department-form';
  openModal(isGroup?'删除组别':'删除部门',esc(target),`<form id="${formId}"><p class="help-text">确认删除${esc(target)}？</p><div class="form-notice">保留已有排班，停止后续新增。历史安排仍可从卖手搜索查看，管理员可取消当天及未来的安排。</div><div class="form-error" id="form-error"></div><div class="modal-actions"><button type="button" class="button secondary" data-action="close-modal">保留${isGroup?'组别':'部门'}</button><button type="submit" class="button danger">确认删除${isGroup?'组别':'部门'}</button></div></form>`,{kind:'department-editor',department:selected.id,group:isGroup?group:null});
}
function renderAudit(){
  const filters=state.auditFilters,labels={login:'登录',view:'查看',operation:'操作',security:'安全'};
  const entries=state.audit?.entries||[];
  return `<div class="page-heading compact-heading"><h2>登录与查看日志</h2><button class="button secondary small" data-action="audit-refresh">刷新日志</button></div>
    <p class="help-text audit-help">微信头像、昵称：尚未接入微信授权。当前微信访问标记来自浏览器信息，不能确认真实微信身份。日志仅负责人可见。</p>
    <form class="audit-filters" id="audit-filter-form">
      <select name="category" aria-label="日志类型">${selectOptions([{v:'',l:'全部类型'},...Object.entries(labels).map(([v,l])=>({v,l}))],filters.category,v=>v.l,v=>v.v)}</select>
      <select name="outcome" aria-label="结果">${selectOptions([{v:'',l:'全部结果'},{v:'success',l:'成功'},{v:'failed',l:'失败'}],filters.outcome,v=>v.l,v=>v.v)}</select>
      <input name="day" type="date" value="${esc(filters.day)}" aria-label="日志日期">
      <input name="search" value="${esc(filters.search)}" maxlength="80" placeholder="访客 / IP / 操作" aria-label="搜索日志">
      <button class="button small" type="submit">筛选</button>
    </form>
    ${state.auditError?`<div class="banner-error">${esc(state.auditError)}</div>`:''}
    <div class="audit-count">${state.auditLoading?'正在读取日志…':`共 ${state.audit?.total||0} 条记录 · ${state.audit?.visitors||0} 个查看设备 · 微信内访问 ${state.audit?.wechatViews||0} 条`}</div>
    <div class="audit-list">${entries.map(entry=>`<article class="panel audit-entry">
      <div class="audit-entry-head"><strong>${esc(entry.action)}</strong><span class="audit-result ${entry.outcome==='failed'?'failed':''}">${entry.outcome==='success'?'成功':'失败'} · ${entry.status}</span></div>
      <p>${esc(entry.actor.name)} · ${esc({owner:'负责人',staff:'管理员',employee:'历史自填姓名',visitor:'访客'}[entry.actor.role]||entry.actor.role)}${entry.actor.role==='visitor'&&entry.actor.id?` · 设备 ${esc(entry.actor.id.slice(0,8))}`:''}</p>
      <div class="audit-entry-meta"><time>${esc(new Date(entry.time).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}))}</time><span>IP：${esc(entry.ip)}</span></div>
      ${entry.detail?`<p class="audit-detail">${esc(entry.detail)}</p>`:''}
      <details><summary>访问详情</summary><p>${esc(entry.method)} ${esc(entry.path)}</p><p>${esc(entry.userAgent||'未提供设备信息')}</p></details>
    </article>`).join('')||(!state.auditLoading?'<div class="empty">没有符合条件的日志</div>':'')}</div>
    <div class="audit-pagination"><button class="button secondary small" data-action="audit-prev" ${!filters.offset?'disabled':''}>上一页</button><span>第 ${Math.floor(filters.offset/100)+1} 页</span><button class="button secondary small" data-action="audit-next" ${!state.audit?.hasMore?'disabled':''}>下一页</button></div>
    <p class="help-text audit-help">设备数量按浏览器标识统计，不等于人数；定时读取数据按一分钟合并。IP与设备信息供核查，不能据此确认是否为公司员工。${esc(state.audit?.retention||'')}</p>`;
}
async function loadAudit(){
  if(state.user?.username!=='owner')return;
  state.auditLoading=true;state.auditError='';render();
  try{
    const params=new URLSearchParams(state.auditFilters);
    const logs=await api('/api/audit?'+params);
    if(state.user?.username!=='owner'||state.page!=='audit')return;
    state.audit=logs;
  }catch(error){state.auditError=error.message;}
  finally{state.auditLoading=false;if(state.page==='audit')render();}
}
async function refresh({quiet=false}={}){
  const run=++refreshNumber,month=state.month,selectedDate=state.date,baseRange=monthRange(month),roomEnd=addDays(selectedDate,2);
  const range={from:[baseRange.from,selectedDate].sort()[0],to:[baseRange.to,roomEnd].sort()[1]};
  state.loading=true;
  try{
    const [config,me,ts,ss,bs]=await Promise.all([api('/api/config'),api('/api/me'),api('/api/talents?view=summary'),api(`/api/schedules?from=${range.from}&to=${range.to}`),api(`/api/bookings?from=${range.from}&to=${range.to}`)]);
    if(run!==refreshNumber||month!==state.month||selectedDate!==state.date)return;
    const changed=JSON.stringify([state.config,state.talents,state.schedules,state.bookings,state.user])!==JSON.stringify([config,ts.talents,ss.schedules,bs.bookings,me.user])||!state.connected;
    state.config=config;state.user=me.user;state.csrfToken=me.csrfToken||'';state.talents=ts.talents;state.schedules=ss.schedules;state.bookings=bs.bookings;state.connected=true;state.dataReady=true;state.loading=false;state.error='';state.syncAt=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit'}).format(new Date());
    protectOpenDepartmentDraft();
    if(!quiet||changed)render();else if($('#sync-state')){$('#sync-state').textContent=syncText();$('#sync-state').classList.remove('offline');}
  }catch(e){if(run!==refreshNumber)return;state.loading=false;state.connected=false;state.error=e.message;render();}
}
function openDepartmentTargetError(){
  if(!modalContext)return '';
  const context=modalContext;
  let id=context.department,group=context.group,slot;
  if(context.kind==='edit-schedule'){
    const item=state.schedules.find(schedule=>schedule.id===context.id);
    if(!item)return '当前排班已变更，请返回后重新打开。未保存内容仍保留在这里。';
    id=item.department;group=item.group;slot=item.slot;
  }
  if(context.kind==='schedule')slot=$('#schedule-form')?.elements.slot.value;
  if(!['schedule','edit-schedule','copy-schedule-picker','department-editor'].includes(context.kind)||!id)return '';
  const selected=activeDepartment(id);
  if(!selected||(group&&!selected.groups.includes(group))||(slot&&!departmentSlots(selected,group).includes(slot)))return '当前部门、组别或场次已停用，未保存内容已保留。请返回后重新选择，不能保存到其他组。';
  return '';
}
function protectOpenDepartmentDraft(){
  const context=modalContext;if(!context||context.busy)return;
  const message=openDepartmentTargetError(),previous=context.departmentTargetError,error=$('#form-error')||$('#copy-schedule-error');
  if(message){
    context.departmentTargetError=message;
    if(error)error.textContent=message;
    if(context.kind==='schedule'){context.optionsReady=false;context.selectionConflict=message;updateScheduleSummary();}
  }else if(previous){
    if(error?.textContent===previous)error.textContent='';
    context.departmentTargetError='';
    if(context.kind==='schedule'&&context.selectionConflict===previous){context.selectionConflict='';void updateScheduleOptions();}
  }
  if(context.kind==='copy-schedule-picker')$('#copy-schedule-choices')?.querySelectorAll('button').forEach(button=>{button.disabled=Boolean(message);});
}
function syncModalViewport(){
  const modal=$('#modal'),viewport=window.visualViewport;
  const height=Math.max(1,Math.round(viewport?.height||window.innerHeight));
  modal.style.setProperty('--modal-viewport-height',height+'px');
  modal.style.setProperty('--modal-viewport-top',Math.max(0,Math.round(viewport?.offsetTop||0))+'px');
  modal.dataset.compact=String(height<480);
  if(!modal.open||height>=480)return;
  requestAnimationFrame(()=>{
    const body=$('.modal-body',modal),field=document.activeElement;
    if(!body||!body.contains(field)||!field.matches('input,select,textarea'))return;
    const visible=body.getBoundingClientRect(),bounds=field.getBoundingClientRect();
    if(bounds.height>visible.height-16){
      if(bounds.top<visible.top||bounds.top>visible.bottom-44)body.scrollTop+=bounds.top-visible.top-8;
    }else if(bounds.bottom>visible.bottom-8)body.scrollTop+=bounds.bottom-visible.bottom+8;
    else if(bounds.top<visible.top+8)body.scrollTop+=bounds.top-visible.top-8;
  });
}
function prepareModalForm(){
  const modal=$('#modal'),form=$('.modal-body form',modal);
  const actions=form&&[...form.children].find(child=>child.classList.contains('modal-actions'));
  modal.classList.toggle('modal-editor',Boolean(actions));
  if(!actions)return;
  form.classList.add('editor-form');
  const footer=document.createElement('div');footer.className='modal-footer';
  const error=$('#form-error',modal);
  if(error){error.classList.add('modal-feedback');error.setAttribute('role','alert');footer.append(error);}
  for(const button of actions.querySelectorAll('button')){
    if(button.type==='submit')button.setAttribute('form',form.id);
  }
  footer.append(actions);modal.append(footer);
}
function openModal(title,subtitle,body,context={}){
  const modal=$('#modal');
  let returnView=null;
  if(modal.open){
    const content=document.createDocumentFragment();
    returnView={content,context:modalContext,scrollTop:modal.scrollTop,bodyScrollTop:$('.modal-body',modal)?.scrollTop||0,focus:document.activeElement};
    while(modal.firstChild)content.appendChild(modal.firstChild);
  }
  modalContext={...context,returnView};
  modal.innerHTML=`<div class="modal-head"><div><h2 id="modal-title">${title}</h2>${subtitle?`<small>${subtitle}</small>`:''}</div><button class="icon-button" data-action="close-modal" aria-label="关闭弹窗">${icon('close')}</button><div class="modal-navigation"><button type="button" class="text-button" data-action="go-back">${icon('left')}返回上一层</button><button type="button" class="text-button" data-action="home">回到主页面</button></div></div><div class="modal-body">${body}</div>`;
  modal.dataset.kind=context.kind||'';
  prepareModalForm();syncModalViewport();
  window.TalentPicker?.enhanceAll(modal,state.talents,person=>avatar(person,'large'));
  if(!modal.open)modal.showModal();
  modal.scrollTop=0;syncModalViewport();
}
function closeModal(all=false){
  if(modalContext?.busy)return;
  const modal=$('#modal'),returnView=modalContext?.returnView;
  if(modalContext?.kind==='talent-search'){clearTimeout(modalContext.searchTimer);modalContext.loadRun=(modalContext.loadRun||0)+1;}
  if(returnView&&!all){
    modal.replaceChildren(returnView.content);modalContext=returnView.context;modal.dataset.kind=modalContext?.kind||'';
    modal.classList.toggle('modal-editor',Boolean($('.modal-footer',modal)));syncModalViewport();modal.scrollTop=returnView.scrollTop;
    window.TalentPicker?.enhanceAll(modal,state.talents,person=>avatar(person,'large'));
    if($('#schedule-form'))updateScheduleOptions();
    protectOpenDepartmentDraft();
    const body=$('.modal-body',modal);if(body)body.scrollTop=returnView.bodyScrollTop||0;
    if(returnView.focus?.isConnected)returnView.focus.focus({preventScroll:true});
    return;
  }
  modal.close();modalContext=null;
}
function openReleaseNotes(){
  const release=state.config?.release;if(!release)return;
  const entries=release.history.map((item,index)=>{
    const changes=`<ul class="release-changes">${item.changes.map(change=>`<li>${esc(change)}</li>`).join('')}</ul>`;
    const heading=`<strong>${esc(item.version)}</strong><span>${esc(item.title)}</span>${item.date?`<time datetime="${esc(item.date)}">${esc(item.date)}</time>`:''}`;
    return index===0?`<section class="release-current"><div class="release-heading">${heading}</div>${changes}</section>`:`<details class="release-history"><summary>${heading}</summary>${changes}</details>`;
  }).join('');
  openModal('系统版本',`当前版本 ${esc(release.version)}`,`<div class="release-notes">${entries}<section class="release-rule"><h3>版本更新规则</h3><p>${esc(release.policy.description)}</p></section></div>`,{kind:'release-notes'});
}
function openTalentSearch(query=state.scheduleSearch){
  state.scheduleSearch=String(query||'').slice(0,64);
  openModal('搜索卖手','查找全部直播间的最近场次',`<form id="schedule-talent-search-form" class="schedule-quick-search" role="search"><label class="search">${icon('search')}<input type="search" id="schedule-talent-search" name="q" maxlength="64" value="${esc(state.scheduleSearch)}" placeholder="输入卖手姓名或编号" aria-label="搜索卖手姓名或编号" autocomplete="off"></label><button type="submit" class="button small">搜索</button></form><div id="schedule-talent-search-results" class="talent-search-results" aria-live="polite"></div>`,{kind:'talent-search',query:state.scheduleSearch,results:[],loadRun:0});
  recordView('talent-search');
  if(state.scheduleSearch.trim())loadTalentSearch(modalContext);
  else $('#schedule-talent-search-results').innerHTML='<p class="talent-search-empty">输入姓名或编号，查看正在进行、即将开始和最近已结束的场次。</p>';
  $('#schedule-talent-search').focus({preventScroll:true});
}
function queueTalentSearch(input,immediate=false){
  const context=modalContext;if(context?.kind!=='talent-search'||context.busy)return;
  state.scheduleSearch=input.value;context.query=input.value;
  clearTimeout(context.searchTimer);context.loadRun++;
  context.results=[];
  const box=$('#schedule-talent-search-results');box.setAttribute('aria-busy','false');
  if(!input.value.trim()){box.innerHTML='<p class="talent-search-empty">输入姓名或编号，查看最近场次。</p>';return;}
  box.innerHTML='<p class="talent-search-empty">正在搜索…</p>';
  if(immediate)return loadTalentSearch(context);
  context.searchTimer=setTimeout(()=>loadTalentSearch(context),250);
}
function talentSearchSchedule(item){
  const dept=departmentById(item.department);
  const status=item.status==='ongoing'?'正在进行':item.status==='upcoming'?'即将开始':'已结束';
  return `<button type="button" class="talent-search-schedule ${item.status==='ongoing'?'is-ongoing':''}" data-action="search-schedule" data-id="${esc(item.id)}"><span class="talent-search-schedule-line"><strong>${esc(item.date)} · ${slotName(item.slot)}</strong><em>${status}</em></span><span class="talent-search-schedule-line"><b>${esc(dept?.name||item.department)} · ${esc(item.group)}</b><span>${esc(item.business)}</span></span><span class="talent-search-schedule-line"><small>${slotTime(item.slot)}</small><span class="talent-search-open">查看排班 ${icon('right')}</span></span></button>`;
}
async function loadTalentSearch(context){
  const box=$('#schedule-talent-search-results');if(!box||modalContext!==context||context.busy)return;
  clearTimeout(context.searchTimer);
  const query=context.query.trim(),run=++context.loadRun;
  if(!query){context.results=[];box.innerHTML='<p class="talent-search-empty">输入姓名或编号，查看最近场次。</p>';return;}
  box.setAttribute('aria-busy','true');box.innerHTML='<p class="talent-search-empty">正在搜索…</p>';
  try{
    const result=await api('/api/talent-search?'+new URLSearchParams({q:query}));
    if(modalContext!==context||run!==context.loadRun)return;
    context.results=result.results;
    box.innerHTML=`<p class="talent-search-count">找到 ${result.total} 位卖手${result.total>result.limit?`，显示前 ${result.limit} 位，请补充姓名或编号`:''} · 场次时间为北京时间</p>${result.results.map(item=>{
      const person=talent(item.talent.id)||item.talent;
      return `<article class="talent-search-result" data-talent-id="${esc(person.id)}"><div class="talent-search-person">${avatar(person,'large')}<div class="talent-search-person-info"><h3>${esc(person.name)}</h3><p>编号 ${esc(person.number)}${person.active?'':' · 已暂停新排班'}</p>${talentProfileButton(person)}</div></div>${item.upcoming.length?`<section class="talent-search-section"><h4>当前 / 即将开始 <small>最近 ${item.upcoming.length} 场${item.upcomingTotal>item.upcoming.length?` / 共 ${item.upcomingTotal} 场`:''}</small></h4>${item.upcoming.map(talentSearchSchedule).join('')}</section>`:''}${item.recent.length?`<section class="talent-search-section"><h4>最近已结束 <small>最近 ${item.recent.length} 场${item.recentTotal>item.recent.length?` / 共 ${item.recentTotal} 场`:''}</small></h4>${item.recent.map(talentSearchSchedule).join('')}</section>`:''}${!item.upcoming.length&&!item.recent.length?'<p class="talent-search-empty">该卖手暂无排班记录。</p>':''}</article>`;
    }).join('')||'<p class="talent-search-empty">没有找到符合条件的卖手，请核对姓名或编号。</p>'}`;
  }catch(error){
    if(modalContext!==context||run!==context.loadRun)return;
    context.results=[];box.innerHTML=`<p class="form-error">${esc(error.message)}</p><button type="button" class="button secondary small" data-action="retry-talent-search">重新搜索</button>`;
  }finally{if(modalContext===context&&run===context.loadRun)box.setAttribute('aria-busy','false');}
}
async function openSearchSchedule(id){
  const context=modalContext;if(context?.kind!=='talent-search'||context.busy)return;
  const selected=context.results.flatMap(item=>[...item.upcoming,...item.recent]).find(item=>item.id===id);
  if(!selected)return toast('搜索结果已更新，请重新搜索');
  context.busy=true;
  const buttons=[...$('#schedule-talent-search-results').querySelectorAll('button')];buttons.forEach(button=>button.disabled=true);
  const range=monthRange(selected.date.slice(0,7)),end=addDays(selected.date,2);
  if(end>range.to)range.to=end;
  try{
    const [config,people,schedules,bookings]=await Promise.all([api('/api/config'),api('/api/talents?view=summary'),api(`/api/schedules?from=${range.from}&to=${range.to}`),api(`/api/bookings?from=${range.from}&to=${range.to}`)]);
    if(modalContext!==context)return;
    if(!schedules.schedules.some(item=>item.id===id))throw new Error('这个场次已调整，请重新搜索');
    const update={page:'schedule',date:selected.date,month:selected.date.slice(0,7),department:selected.department,group:selected.group,business:'all',
      scheduleOpenDept:selected.department,schedulePicked:true,schedulePickerEditing:false,config,talents:people.talents,schedules:schedules.schedules,bookings:bookings.bookings,connected:true,error:''};
    if(context.navigationSaved){Object.assign(state,update);render();recordView();}
    else{navigate(update);context.navigationSaved=true;}
    context.busy=false;
    openScheduleDetail(id,true);
  }catch(error){toast(error.message);}
  finally{context.busy=false;buttons.forEach(button=>button.disabled=false);}
}
function openTalentPhoto(id){
  const person=talent(id);if(!person)return toast('卖手资料已更新，请刷新后查看');
  openModal('卖手照片',`${esc(person.name)} · 编号 ${esc(person.number)}`,`${safeAvatar(person.avatar)?`<div class="full-talent-photo"><img src="${esc(person.avatar)}" alt="${esc(person.name)}的完整照片" decoding="async"></div>`:'<p class="help-text">尚未上传照片</p>'}<div class="modal-actions"><button type="button" class="button secondary" data-action="talent-profile" data-id="${esc(id)}">身份简介</button><button type="button" class="button secondary" data-action="close-modal">返回排班</button></div>`,{kind:'talent-photo',id});
}
function openTalentProfile(id,trigger){
  const person=talent(id);if(!person)return toast('卖手资料已更新，请刷新后查看');
  const modal=$('#modal');
  const nested=modal.open;
  const introduction=typeof person.introduction==='string'?person.introduction.trim():'';
  openModal('身份简介','',`<section class="talent-profile"><div class="talent-profile-heading">${avatar(person,'large')}<div><h3>${esc(person.name)}</h3><p>编号 ${esc(person.number)}</p></div></div><div class="talent-profile-content ${introduction?'':'is-empty'}">${esc(introduction||'暂无简介')}</div></section><div class="modal-actions"><button type="button" class="button secondary" data-action="talent-stories" data-id="${esc(id)}">最近剧情</button><button type="button" class="button secondary" data-action="close-modal">${nested?'返回上一层':'返回排班'}</button></div>`,{kind:'talent-profile',id});
  recordView('talent-profile',{id});
  modal.scrollTop=0;$('#modal-title').tabIndex=-1;$('#modal-title').focus({preventScroll:true});
}
function openTalentStories(id){
  const person=talent(id);if(!person)return toast('卖手资料已更新，请刷新后查看');
  openModal('最近剧情',`${esc(person.name)} · 编号 ${esc(person.number)}`,`<div id="story-list-content" aria-live="polite">正在读取剧情…</div>`,{kind:'talent-stories',id,stories:[]});
  recordView('talent-stories',{id});
  loadStoryList(modalContext);
}
async function loadStoryList(context){
  const box=$('#story-list-content');if(!box||modalContext!==context)return;
  box.textContent='正在读取剧情…';
  const run=context.loadRun=(context.loadRun||0)+1;
  try{
    const result=await api(`/api/talents/${encodeURIComponent(context.id)}/stories`);
    if(modalContext!==context||run!==context.loadRun)return;
    context.stories=result.stories;
    box.innerHTML=`<div class="story-toolbar"><small>按剧情日期从新到旧显示</small>${state.user?`<button class="button small" data-action="new-story">新增剧情</button>`:''}</div><div class="story-list">${result.stories.map((story,index)=>`<article class="story-entry"><div class="story-entry-heading"><span><time>${esc(story.date)}</time>${index===0?'<b>最新</b>':''}</span>${state.user?`<button class="text-button" data-action="edit-story" data-id="${esc(story.id)}">编辑</button>`:''}</div><h3>${esc(story.title)}</h3><div class="story-content">${esc(story.content)}</div></article>`).join('')||'<p class="story-empty">暂无剧情，更新后会显示在这里。</p>'}</div><div class="modal-actions"><button type="button" class="button secondary" data-action="reload-stories">刷新</button><button type="button" class="button secondary" data-action="close-modal">返回上一层</button></div>`;
  }catch(error){
    if(modalContext!==context||run!==context.loadRun)return;
    box.innerHTML=`<p class="form-error">${esc(error.message)}</p><button type="button" class="button secondary" data-action="reload-stories">重新读取</button>`;
  }
}
function openStoryEditor(id){
  if(!state.user)return openLogin();
  const parent=modalContext;if(parent?.kind!=='talent-stories')return;
  const story=id?parent.stories.find(item=>item.id===id):null;
  if(id&&!story)return toast('剧情已更新，请刷新后查看');
  const person=talent(parent.id);
  openModal(story?'编辑剧情':'新增剧情',`${esc(person.name)} · 编号 ${esc(person.number)}`,`<form id="story-form" class="story-form"><label>剧情日期<input type="date" name="date" value="${esc(story?.date||today())}" required></label><label>剧情标题<input name="title" maxlength="80" required value="${esc(story?.title||'')}" placeholder="本次上播剧情标题"></label><label>剧情内容<textarea name="content" rows="8" maxlength="12000" required placeholder="填写或粘贴剧情内容">${esc(story?.content||'')}</textarea><small>最多12000字，其他历史剧情保留。</small></label><div class="form-error" id="form-error"></div><div class="modal-actions"><button class="button secondary" type="button" data-action="close-modal">取消</button><button class="button" type="submit">保存剧情</button></div></form>`,{kind:'story-editor',talentId:parent.id,id:story?.id,revision:story?.revision});
}
function openLogin(){
  if(state.user){navigate({role:'manager',page:'rooms'});return;}
  openModal('管理员登录','',`<form id="login-form" style="display:grid;gap:18px"><label>管理密码<input name="password" type="password" autocomplete="current-password" required placeholder="输入管理密码" maxlength="128" autofocus></label><div class="form-error" id="form-error"></div><div class="modal-actions"><button type="button" class="button secondary" data-action="close-modal">取消</button><button class="button" type="submit">登录</button></div></form>`,{kind:'login'});
}
function openTalent(id){
  if(!state.user)return openLogin();const p=id?talent(id):null;
  openModal(p?'编辑卖手资料':'录入新卖手','',`<form id="talent-form" style="display:grid;gap:18px"><div class="upload-row"><div id="avatar-preview">${avatar(p,'large')}</div><label>图片头像<input type="file" id="avatar-file" accept="image/jpeg,image/png,image/webp"><small>JPG、PNG、WebP</small></label></div><div class="form-grid"><label>卖手姓名<input name="name" required maxlength="40" value="${esc(p?.name||'')}" placeholder="填写姓名"></label><label>人员编号<input name="number" required maxlength="20" value="${esc(p?.number||'')}" placeholder="例如：0001"></label></div><label>卖手简介 <small>选填</small><textarea name="introduction" rows="4" maxlength="2000" placeholder="填写身份、人设及合作特点">${esc(p?.introduction||'')}</textarea><small>对查看排班的人公开，最多2000字。</small></label>${p?`<label>排班状态<select name="active">${selectOptions([{v:'true',l:'可排班'},{v:'false',l:'暂停新排班（保留已有安排）'}],String(p.active),v=>v.l,v=>v.v)}</select></label>`:''}<div class="form-error" id="form-error"></div><div class="modal-actions"><button type="button" class="button secondary" data-action="close-modal">取消</button><button class="button" type="submit">${p?'保存资料':'录入人才总库'}</button></div></form>`,{kind:'talent',id:p?.id,avatar:p?.avatar||''});
}
async function readAvatar(file){
  if(!file)return '';if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('请选择 JPG、PNG 或 WebP 图片');if(file.size>10*1024*1024)throw new Error('请选择 10 MB 以内的图片');
  const url=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('图片无法读取'));reader.readAsDataURL(file);});
  const img=await new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(new Error('图片无法读取，请更换图片'));im.src=url;});const size=Math.min(img.width,img.height),canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;canvas.getContext('2d').drawImage(img,(img.width-size)/2,(img.height-size)/2,size,size,0,0,256,256);return canvas.toDataURL('image/jpeg',.86);
}
function availablePeople(dates,slot,exceptId,selectedIds=[]){
  const selected=new Set(selectedIds.filter(Boolean));
  return state.talents.filter(t=>t.active).map(t=>{
    const clash=(modalContext?.allSchedules||state.schedules).find(s=>s.id!==exceptId&&scheduleTalentIds(s).includes(t.id)&&s.slot===slot&&dates.includes(s.date));
    return {t,clash,duplicate:selected.has(t.id)};
  });
}
function scheduleConflictText(schedule){
  const dept=departmentById(schedule.department);
  return `${dateLabel(schedule.date)} · ${dept?.name||schedule.department}${schedule.group} · ${slotName(schedule.slot)}`;
}
function updateScheduleSummary(){
  const form=$('#schedule-form'),summary=$('#schedule-save-summary');
  if(!form||!summary||!modalContext)return;
  const start=form.elements.startDate.value,days=Number(form.elements.days.value);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!Number.isInteger(days)||days<1||days>7){summary.textContent='请先选择开始日期和天数';return;}
  const end=addDays(start,days-1),people=[form.elements.talentId1?.value,form.elements.talentId2?.value,form.elements.talentId3?.value].map(talent).filter(Boolean);
  const submit=$(`button[type="submit"][form="${form.id}"]`);if(submit&&modalContext.copiedFrom)submit.textContent=`保存这${days}天排班`;
  const dept=departmentById(modalContext.department);
  summary.innerHTML=`<span class="save-summary-label">本次安排</span><strong>${esc(dept?.name)}${esc(modalContext.group)} · ${slotName(form.elements.slot.value)} · ${esc(form.elements.business.value)}</strong><span>${dateLabel(start)}—${dateLabel(end)}，共 ${days} 天</span><span>${people.length?esc(people.map(person=>person.name).join('、')):'待选择卖手'}${people.length===1?' · 第2位待补':''}${people.length===2?' · 第3位可选':''}</span><small class="${modalContext.selectionConflict?'summary-conflict':''}">${esc(modalContext.selectionConflict||(!modalContext.optionsReady?'正在检查这几天的空闲情况…':!people.length?'请至少选择1位卖手':'日期和人员已检查，确认后保存'))}</small>`;
}
async function updateScheduleOptions(){
  const form=$('#schedule-form');if(!form||!modalContext)return;
  const context=modalContext,start=form.elements.startDate.value,days=Number(form.elements.days.value),slot=form.elements.slot.value;
  const errorBox=$('#form-error');
  const targetError=openDepartmentTargetError();
  if(targetError){protectOpenDepartmentDraft();return;}
  if(errorBox&&[context.selectionConflict,context.optionsError].filter(Boolean).includes(errorBox.textContent))errorBox.textContent='';
  context.optionsReady=false;context.selectionConflict='';
  if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!Number.isInteger(days)||days<1||days>7){updateScheduleSummary();return;}
  const end=addDays(start,days-1),dates=Array.from({length:days},(_,i)=>addDays(start,i)),previous=[form.elements.talentId1?.value||'',form.elements.talentId2?.value||'',form.elements.talentId3?.value||''];
  updateScheduleSummary();
  context.optionVersion=(context.optionVersion||0)+1;const version=context.optionVersion;
  try{const result=await api(`/api/schedules?from=${start}&to=${end}`);if(modalContext!==context||version!==context.optionVersion)return;
    if(openDepartmentTargetError()){protectOpenDepartmentDraft();return;}
    context.allSchedules=result.schedules;
    if(context.optionsError&&$('#form-error')?.textContent===context.optionsError)$('#form-error').textContent='';
    context.optionsError='';
     const renderOptions=(selectedIndex)=>{
      const selectedIds=[form.elements.talentId1?.value||'',form.elements.talentId2?.value||'',form.elements.talentId3?.value||''];
      const previousValue=previous[selectedIndex]||'';
      const options=state.talents.filter(t=>t.active||t.id===previousValue).map(t=>{
        const clash=result.schedules.find(item=>item.id!==context.id&&item.slot===slot&&dates.includes(item.date)&&scheduleTalentIds(item).includes(t.id));
         const duplicate=selectedIds.some((selectedId,index)=>index!==selectedIndex&&selectedId===t.id);
        const reason=clash?scheduleConflictText(clash)+'已排':duplicate?'已选为另一位':!t.active?'暂停排班':'';
        return `<option value="${esc(t.id)}" ${reason?'disabled':''} ${t.id===previousValue?'selected':''}>${esc(t.number+' · '+t.name)}${reason?'（'+esc(reason)+'）':''}</option>`;
      }).join('');
      const missing=previousValue&&!talent(previousValue)?`<option value="${esc(previousValue)}" selected disabled>该人员已不在人才库，请重新选择</option>`:'';
      return `<option value="">${selectedIndex===0?'请选择第1位卖手':selectedIndex===1?'待补第2位':'待补第3位'}</option>${options}${missing}`;
    };
    if(form.elements.talentId1)form.elements.talentId1.innerHTML=renderOptions(0);
    if(form.elements.talentId2)form.elements.talentId2.innerHTML=renderOptions(1);
    if(form.elements.talentId3)form.elements.talentId3.innerHTML=renderOptions(2);
    if(!state.talents.filter(t=>t.active).length&&!previous.some(Boolean)){
      if(form.elements.talentId1)form.elements.talentId1.innerHTML='<option value="">人才库还没有可排班人员</option>';
      if(form.elements.talentId2)form.elements.talentId2.innerHTML='<option value="">人才库还没有可排班人员</option>';
      if(form.elements.talentId3)form.elements.talentId3.innerHTML='<option value="">人才库还没有可排班人员</option>';
    }
    const roomClash=result.schedules.find(item=>item.department===context.department&&item.group===context.group&&item.slot===slot);
    const personClash=result.schedules.find(item=>item.slot===slot&&scheduleTalentIds(item).some(id=>previous.includes(id)));
    const unavailable=previous.filter(Boolean).map(talent).find(person=>!person?.active);
    if(roomClash)context.selectionConflict=`${scheduleConflictText(roomClash)}已有安排，请更换开始日期或班次。`;
    else if(personClash){const names=scheduleTalentIds(personClash).filter(id=>previous.includes(id)).map(id=>talent(id)?.name||'该卖手').join('、');context.selectionConflict=`${names}在${scheduleConflictText(personClash)}已有安排，请更换人员或日期。`;}
    else if(unavailable||previous.some(id=>id&&!talent(id)))context.selectionConflict='已选人员暂停排班或不在人才库，请更换人员。';
    context.optionsReady=true;
    window.TalentPicker?.refreshAll(form);updateScheduleSummary();
  }catch(e){if(modalContext===context&&version===context.optionVersion){if(openDepartmentTargetError()){protectOpenDepartmentDraft();return;}context.selectionConflict='未能完成检查，请调整日期重试。';context.optionsError='未能检查可用人员：'+e.message;$('#form-error').textContent=context.optionsError;updateScheduleSummary();}}
}
function openSchedule(date,slot,source=null){
  if(!state.user)return openLogin();const d=department();
  if(!d||!d.groups.includes(state.group)||!departmentSlots(d).length)return toast('请先选择可排班的部门和组别');
  if(source&&(source.department!==d.id||source.group!==state.group))return toast('原直播间已变更，请返回后重新选择');
  date=date||state.date;if(date<today())date=today();slot=departmentSlots(d).includes(slot)?slot:departmentSlots(d)[0];
  const ids=scheduleTalentIds(source),initialPerson=index=>{
    const person=talent(ids[index]);
    return person?`<option value="${esc(person.id)}" selected>${esc(person.number+' · '+person.name)}</option>`:'';
  };
  openModal(source?'沿用上轮 · 确认新安排':'新增卖手排班',`${esc(d.name)} · ${esc(state.group)}`,`<form id="schedule-form" style="display:grid;gap:18px">${source?'<p class="copy-source-notice">已带入上一轮的卖手和业务，可直接修改日期或换人。</p>':''}<div class="form-grid"><label>开始日期<input type="date" name="startDate" value="${date}" min="${today()}" required></label><label>连续天数<select name="days">${selectOptions([1,2,3,4,5,6,7],3,n=>`${n} 天${n===3?'（默认）':''}`)}</select></label></div><div class="form-grid"><label>业务分类<select name="business">${selectOptions(state.config.businesses,source?.business||(state.business==='all'?'FB':state.business))}</select></label><label>直播时段<select name="slot">${selectOptions(departmentSlots(d),slot,s=>`${slotName(s)} ${slotTime(s)}`)}</select></label></div><div class="seller-picker-grid"><label>第1位卖手<select name="talentId1" required><option value="">请选择第1位卖手</option>${initialPerson(0)}</select></label><label>第2位卖手<select name="talentId2"><option value="">待补第2位</option>${initialPerson(1)}</select></label><label>第3位卖手<select name="talentId3"><option value="">待补第3位</option>${initialPerson(2)}</select></label></div><div class="schedule-save-summary" id="schedule-save-summary" aria-live="polite"></div><div class="form-error" id="form-error"></div><div class="modal-actions"><button type="button" class="button secondary" data-action="close-modal">取消</button><button class="button" type="submit">${source?'保存这3天排班':'确认排班'}</button></div></form>`,{kind:'schedule',department:d.id,group:state.group,optionsReady:false,copiedFrom:source?.id||null});
  updateScheduleOptions();
}
async function openCopySchedule(){
  if(!state.user)return openLogin();
  const dept=department(),reference=state.date<today()?today():state.date;
  if(!dept||!dept.groups.includes(state.group)||!departmentSlots(dept).length)return toast('请先选择可排班的部门和组别');
  openModal('沿用上一轮',`${esc(dept.name)} · ${esc(state.group)}`,`<div id="copy-schedule-error" class="form-error" role="alert"></div><div id="copy-schedule-choices" class="copy-schedule-choices" aria-live="polite"><p class="help-text">正在查找最近的安排…</p></div>`,{kind:'copy-schedule-picker',department:dept.id,group:state.group,copySources:[]});
  const context=modalContext;
  try{
    const result=await api(`/api/schedules?from=${addDays(reference,-83)}&to=${addDays(reference,6)}`);
    if(modalContext!==context)return;
    context.copySources=departmentSlots(dept,context.group).map(slot=>{
      const matching=result.schedules.filter(item=>item.department===dept.id&&item.group===context.group&&item.slot===slot);
      const source=matching.filter(item=>item.date<=reference).sort((a,b)=>b.date.localeCompare(a.date))[0];
      if(!source)return null;
      const samePeople=item=>scheduleTalentIds(item).slice().sort().join('|')===scheduleTalentIds(source).slice().sort().join('|');
      const batchExtent=matching.filter(item=>item.batchId===source.batchId).sort((a,b)=>a.date.localeCompare(b.date));
      const batch=batchExtent.filter(item=>item.business===source.business&&samePeople(item));
      const last=batchExtent.at(-1)?.date||source.date,next=addDays(last,1);
      return {source,from:batch[0]?.date||source.date,to:batch.at(-1)?.date||source.date,startDate:next<reference?reference:next};
    }).filter(Boolean);
    $('#copy-schedule-choices').innerHTML=context.copySources.length?`<p class="help-text">选择要沿用的班次，带入人员后再确认新日期。</p>${context.copySources.map(item=>`<button type="button" class="copy-schedule-choice" data-action="copy-schedule-slot" data-id="${esc(item.source.id)}"><span class="copy-choice-heading"><strong>${slotName(item.source.slot)}</strong><small>${esc(item.source.business)} · ${scheduleRangeLabel(item.from,item.to)}</small>${icon('right')}</span><span class="copy-choice-people">${schedulePeople(item.source).map(person=>`<span>${avatar(person)}<span><b>${esc(person.name)}</b><small>${esc(person.number)}</small></span></span>`).join('')}</span><span class="copy-choice-next">下一轮：${dateLabel(item.startDate)}—${dateLabel(addDays(item.startDate,2))} · 3天</span></button>`).join('')}`:'<p class="help-text">这个直播间近84天还没有可沿用的排班。</p><button class="button" type="button" data-action="new-schedule">新增排班</button>';
    protectOpenDepartmentDraft();
  }catch(error){if(modalContext===context)$('#copy-schedule-choices').innerHTML=`<p class="form-error">${esc(error.message)}</p><button type="button" class="button secondary" data-action="copy-schedule">重新读取</button>`;}
}
function openScheduleSegment(from,to,slot,business){
  const schedules=state.schedules.filter(s=>s.department===state.department&&s.group===state.group&&s.slot===slot&&s.date>=from&&s.date<=to&&s.business===business).sort((a,b)=>a.date.localeCompare(b.date));
  if(!schedules.length)return toast('安排已更新，请刷新后查看');
  if(schedules.length===1)return openScheduleDetail(schedules[0].id);
  const first=schedules[0],dept=departmentById(first.department);
  openModal(`${slotName(slot)} · ${scheduleRangeLabel(from,to)}`,`${esc(dept?.name||first.department)} ${esc(first.group)} · ${esc(business)} · 这几天安排相同`,`${posterPeople(first)}<div class="segment-date-list">${schedules.map(s=>`<button data-action="schedule-slot" data-id="${esc(s.id)}" data-date="${s.date}" data-slot="${slot}"><span><b>${dateLabel(s.date)}</b><small>周${weekLabel(s.date)}${s.date===today()?' · 今天':''}</small></span><strong>${state.user&&s.date>=today()?'单日调整':'查看这天'}</strong>${icon('arrow')}</button>`).join('')}</div><div class="form-notice">点选上面的具体日期，${state.user?'只调整那一天的卖手；原来同批排班的其他日期保持不变。':'查看当天安排。需要调整时，请联系管理员。'}</div>`,{kind:'schedule-segment'});
}
function openScheduleDetail(id,fromSearch=false){
  const s=state.schedules.find(s=>s.id===id);if(!s)return toast('安排已更新，请刷新后查看');
  const d=departmentById(s.department),active=activeDepartment(s.department),activeSlot=Boolean(active&&departmentSlots(active,s.group).includes(s.slot)),canCancel=state.user&&s.date>=today(),editable=canCancel&&activeSlot,ids=scheduleTalentIds(s),people=schedulePeople(s);
  const detailOptions=(index)=>{
    const selected=ids[index]||'',others=ids.filter((_,candidateIndex)=>candidateIndex!==index);
    return state.talents.filter(t=>t.active||ids.includes(t.id)).map(t=>{
      const busy=state.schedules.some(otherSchedule=>otherSchedule.id!==s.id&&otherSchedule.date===s.date&&otherSchedule.slot===s.slot&&scheduleTalentIds(otherSchedule).includes(t.id));
      const duplicate=others.includes(t.id);
      return `<option value="${esc(t.id)}" ${t.id===selected?'selected':''} ${busy||duplicate?'disabled':''}>${esc(t.number+' · '+t.name)}${busy?'（同场已排）':duplicate?'（已选为另一位）':''}</option>`;
    }).join('');
  };
  const preview=people.length?`<div class="preview-people">${people.map(p=>`<div class="preview-person">${avatar(p,'large')}<div class="preview-person-meta"><strong>${esc(p.name)}</strong><small>编号 ${esc(p.number)} · ${esc(s.business)}</small>${talentProfileButton(p)}</div></div>`).join('')}${people.length<2?`<div class="preview-person preview-person-empty"><span class="seller-person-placeholder">＋</span><div><strong>待安排第2位</strong><small>当前场次只有 1 位卖手</small></div></div>`:''}</div>`:`<div class="preview-person preview-person-empty"><span class="seller-person-placeholder">＋</span><div><strong>暂无卖手</strong><small>请补充本场安排</small></div></div>`;
  const detailNotice=!activeSlot?`该部门、组别或班次已停用，原排班保留供查看。${canCancel?'可取消当天安排，其他日期不变。':''}`:s.date<today()?'过去的排班已归档，仅可查看。':'调整排班请联系管理员。';
  const form=editable?`<form id="edit-schedule-form" style="display:grid;gap:18px"><div class="form-grid editor-people-fields"><label>第1位卖手<select name="talentId1" required><option value="">请选择第1位卖手</option>${detailOptions(0)}</select></label><label>第2位卖手<select name="talentId2"><option value="">可选第2位卖手</option>${detailOptions(1)}</select></label><label>第3位卖手<select name="talentId3"><option value="">可选第3位卖手</option>${detailOptions(2)}</select></label></div><label>业务分类<select name="business">${selectOptions(state.config.businesses,s.business)}</select></label><div class="form-notice">仅修改 ${dateLabel(s.date)}的${slotName(s.slot)}，其他日期不变。</div><details class="editor-reference"><summary>查看当前卖手资料</summary>${preview}</details><div class="form-error" id="form-error"></div><div class="modal-actions"><button class="button danger" type="button" data-action="confirm-delete-schedule" data-id="${esc(s.id)}">取消当天排班</button><button class="button" type="submit">保存当天调整</button></div></form>`:`<dl class="detail-list"><div><dt>排班日期</dt><dd>${s.date}</dd></div><div><dt>直播间</dt><dd>${esc(d?.name)} · ${esc(s.group)}</dd></div><div><dt>直播时段</dt><dd>${slotName(s.slot)} ${slotTime(s.slot)}</dd></div><div><dt>业务分类</dt><dd>${esc(s.business)}</dd></div></dl><div class="form-notice">${detailNotice}</div><div class="modal-actions">${canCancel?`<button class="button danger" type="button" data-action="confirm-delete-schedule" data-id="${esc(s.id)}">取消当天排班</button>`:''}<button class="button secondary" data-action="close-modal">关闭</button></div>`;
  openModal(editable?'编辑当天排班':'单日排班详情',`${s.date} · ${esc(d?.name)} ${esc(s.group)} · ${slotName(s.slot)}`,`${fromSearch&&active?.groups.includes(s.group)?'<div class="search-board-link"><button type="button" class="button outline small" data-action="search-show-board">查看该直播间</button></div>':''}${editable?'':preview}${form}`,{kind:'edit-schedule',id:s.id});
}
function updateEditScheduleOptions(){
  const form=$('#edit-schedule-form'),s=state.schedules.find(s=>s.id===modalContext?.id);if(!form||!s)return;
  const selected=[form.elements.talentId1?.value||'',form.elements.talentId2?.value||'',form.elements.talentId3?.value||''];
  for(const index of [0,1,2]){
    const select=form.elements[`talentId${index+1}`];
    if(!select)continue;
    for(const option of select.options){
      if(!option.value)continue;
      const busy=state.schedules.some(other=>other.id!==s.id&&other.date===s.date&&other.slot===s.slot&&scheduleTalentIds(other).includes(option.value));
      const duplicate=selected.some((value,candidateIndex)=>candidateIndex!==index&&value===option.value);
      option.disabled=busy||duplicate;
      const person=talent(option.value);
      if(person)option.textContent=person.number+' · '+person.name+(busy?'（同场已排）':duplicate?'（已选为另一位）':'');
    }
  }
  window.TalentPicker?.refreshAll(form);
}
function confirmDeleteSchedule(id){
  const s=state.schedules.find(s=>s.id===id);if(!s)return;
  const names=schedulePeople(s).map(p=>p.name).join('、')||'当前卖手';
  openModal('取消这一天的排班',`${s.date} · ${slotName(s.slot)}`,`<p class="help-text">${esc(names)}在这一天的安排将被移除；其他日期的安排不变。</p><div class="form-error" id="form-error"></div><form id="delete-schedule-form"><div class="modal-actions"><button type="button" class="button secondary" data-action="close-modal">保留安排</button><button type="submit" class="button danger">确认取消当天</button></div></form>`,{kind:'delete-schedule',id});
}
function openRoom(room,slot,date=state.date){
  const b=state.bookings.find(b=>b.date===date&&b.room===room&&b.slot===slot);
  if(b){openModal('场地预约详情',`${date} · ${esc(room)} · ${slotName(slot)}`,`<dl class="detail-list"><div><dt>预约部门</dt><dd>${esc(b.department)}</dd></div><div><dt>预约人</dt><dd>${esc(b.bookerName)}</dd></div><div><dt>时间</dt><dd>${slotTime(slot)}</dd></div>${b.note?`<div><dt>备注</dt><dd>${esc(b.note)}</dd></div>`:''}</dl><div class="form-notice">该时段已经预约，其他人员无法重复预约。</div><div class="modal-actions">${state.user&&date>=today()?`<button class="button danger" data-action="confirm-cancel-room" data-id="${esc(b.id)}">释放时段</button>`:''}<button class="button secondary" data-action="close-modal">关闭</button></div>`,{kind:'room-detail',id:b.id});return;}
  if(date<today())return toast('过去的日期只可查看');
  if(!state.user){openModal('场地时段详情',`${date} · ${esc(room)} · ${slotName(slot)}`,`<dl class="detail-list"><div><dt>状态</dt><dd>空闲</dd></div><div><dt>时间</dt><dd>${slotTime(slot)}</dd></div></dl><div class="form-notice">仅管理员可以预约或释放场地。</div><div class="modal-actions"><button class="button secondary" data-action="close-modal">返回</button></div>`,{kind:'room-detail'});return;}
  openModal('预约场地',`${date} · ${esc(room)} · ${slotName(slot)} ${slotTime(slot)}`,`<form id="room-form" style="display:grid;gap:18px"><div class="form-grid"><label>预约部门<input name="department" value="${esc(recall('tongchang-department'))}" maxlength="60" required placeholder="例如：直播一部"></label><label>预约人<input name="bookerName" value="${esc(recall('tongchang-booker'))}" maxlength="40" required placeholder="填写姓名"></label></div><label>备注 <small>选填</small><textarea name="note" maxlength="300" placeholder="填写用途或需要说明的事项"></textarea></label><div class="form-notice">保存后，同一日期与时段将对所有人员显示为已预约。</div><div class="form-error" id="form-error"></div><div class="modal-actions"><button class="button secondary" type="button" data-action="close-modal">取消</button><button class="button" type="submit">确认预约</button></div></form>`,{kind:'book-room',date,room,slot});
}
function confirmCancelRoom(id){
  if(!state.user)return toast('仅管理员可以释放场地');
  const b=state.bookings.find(b=>b.id===id);if(!b)return;
  openModal('释放场地时段',`${b.date} · ${esc(b.room)} · ${slotName(b.slot)}`,`<p class="help-text">释放后，其他人员可以预约这个时段。</p><div class="form-error" id="form-error"></div><form id="cancel-room-form"><div class="modal-actions"><button class="button secondary" type="button" data-action="close-modal">保留预约</button><button class="button danger" type="submit">确认释放</button></div></form>`,{kind:'cancel-room',id});
}
async function setMonth(month){if(!/^\d{4}-\d{2}$/.test(month))return;state.month=month;state.date=month===today().slice(0,7)?today():month+'-01';state.schedules=[];state.bookings=[];state.connected=false;render();await refresh();}
async function setRoomStart(date){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return;
  const monthChanged=state.month!==date.slice(0,7);
  state.date=date;state.month=date.slice(0,7);
  if(monthChanged){state.schedules=[];state.bookings=[];state.connected=false;render();await refresh();}
  else {render();await refresh({quiet:true});}
  recordView();
}
document.addEventListener('click',async e=>{
  const el=e.target.closest('[data-action]');if(!el||el.disabled)return;const a=el.dataset.action;
  if(modalContext?.busy&&el.closest('#modal'))return;
  try{
    if(a==='go-back')return goBack();
    if(a==='home'||a==='switch-role')return goHome();
    if(a==='choose-role'){navigate({role:el.dataset.role,page:el.dataset.role==='host'?'schedule':'rooms'});if(el.dataset.role==='host'&&state.date!==today())await setRoomStart(today());else if(!state.dataReady&&!state.loading)await refresh();return;}
    if(a==='page'){if(state.page===el.dataset.page)return;if(['talents','slot-config'].includes(el.dataset.page)&&!state.user)return openLogin();if(el.dataset.page==='audit'&&state.user?.username!=='owner')return;navigate({page:el.dataset.page});if(state.page==='audit')await loadAudit();return;}
    if(a==='login')return openLogin();
    if(a==='release-notes')return openReleaseNotes();
    if(a==='logout'){await api('/api/logout',{method:'POST',body:'{}'});state.user=null;state.csrfToken='';state.audit=null;goHome();return;}
    if(a==='close-modal')return closeModal();
    if(a==='refresh')return refresh();
    if(a==='month-prev'||a==='month-next'){const d=new Date(state.month+'-01T00:00:00Z');d.setUTCMonth(d.getUTCMonth()+(a==='month-next'?1:-1));return setMonth(d.toISOString().slice(0,7));}
    if(a==='today')return setMonth(today().slice(0,7));
    if(a==='select-date'){return setRoomStart(el.dataset.date);}
    if(a==='room-prev-3')return setRoomStart(addDays(state.date,-1));
    if(a==='room-next-3')return setRoomStart(addDays(state.date,1));
    if(a==='room-prev')return setRoomStart(addDays(state.date,-roomViewDays()));
    if(a==='room-next')return setRoomStart(addDays(state.date,roomViewDays()));
    if(a==='room-today')return setRoomStart(today());
    if(a==='audit-refresh')return loadAudit();
    if(a==='audit-prev'||a==='audit-next'){state.auditFilters.offset=Math.max(0,state.auditFilters.offset+(a==='audit-next'?100:-100));return loadAudit();}
    if(a==='toggle-department'||a==='toggle-schedule-dept'){navigate({scheduleOpenDept:state.scheduleOpenDept===el.dataset.id?'':el.dataset.id});return;}
    if(a==='change-schedule-room'){navigate({schedulePickerEditing:true,scheduleOpenDept:state.department});return;}
    if(a==='schedule-group'||a==='pick-schedule-room'){const id=el.dataset.dept||el.dataset.id;if(!activeDepartment(id)?.groups.includes(el.dataset.group))return toast('该直播间已停用，请重新选择');navigate({department:id,group:el.dataset.group,scheduleOpenDept:id,schedulePicked:true,schedulePickerEditing:false});rememberScheduleRoom();if(el.closest('.saved-room-shortcut')&&state.date!==today())await setRoomStart(today());return;}
    if(a==='toggle-favorite-room'){const already=isFavoriteRoom();remember('tongchang-favorite-room',already?'':JSON.stringify({department:state.department,group:state.group}));render();toast(already?'已取消常看直播间':'已设为常看，下次进入可直接查看');return;}
    if(a==='slot-config-reset'){state.slotConfigDraft=null;return render();}
    if(['new-department','rename-department','delete-department','new-department-group','delete-department-group'].includes(a))return openDepartmentEditor(a);
    if(a==='department'){const selected=activeDepartment(el.dataset.id);if(!selected)return;state.department=selected.id;state.group=selected.groups[0];state.schedulePicked=true;state.schedulePickerEditing=false;render();return;}
    if(a==='group'){state.group=el.dataset.group;render();return;}
    if(a==='new-talent')return openTalent();
    if(a==='edit-talent')return openTalent(el.dataset.id);
    if(a==='find-talent')return openTalentSearch();
    if(a==='retry-talent-search')return loadTalentSearch(modalContext);
    if(a==='search-schedule')return openSearchSchedule(el.dataset.id);
    if(a==='search-show-board'){closeModal(true);render();window.scrollTo(0,0);return;}
    if(a==='talent-profile'){e.stopPropagation();return openTalentProfile(el.dataset.id,el);}
    if(a==='talent-photo'){e.stopPropagation();return openTalentPhoto(el.dataset.id);}
    if(a==='talent-stories'){e.stopPropagation();return openTalentStories(el.dataset.id);}
    if(a==='reload-stories')return loadStoryList(modalContext);
    if(a==='new-story')return openStoryEditor();
    if(a==='edit-story')return openStoryEditor(el.dataset.id);
    if(a==='new-schedule')return openSchedule();
    if(a==='copy-schedule')return openCopySchedule();
    if(a==='copy-schedule-slot'){const targetError=openDepartmentTargetError();if(targetError){protectOpenDepartmentDraft();return toast(targetError);}const item=modalContext?.copySources?.find(entry=>entry.source.id===el.dataset.id);if(item)return openSchedule(item.startDate,item.source.slot,item.source);return;}
    if(a==='schedule-segment')return openScheduleSegment(el.dataset.from,el.dataset.to,el.dataset.slot,el.dataset.business);
    if(a==='schedule-slot')return el.dataset.id?openScheduleDetail(el.dataset.id):openSchedule(el.dataset.date,el.dataset.slot);
    if(a==='confirm-delete-schedule')return confirmDeleteSchedule(el.dataset.id);
    if(a==='room-slot')return openRoom(el.dataset.room,el.dataset.slot,el.dataset.date);
    if(a==='confirm-cancel-room')return confirmCancelRoom(el.dataset.id);
  }catch(error){toast(error.message);}
});
document.addEventListener('change',async e=>{
  const el=e.target;
  if(el.matches('.slot-config-option input[type="checkbox"]'))el.closest('.slot-config-option').classList.toggle('is-active',el.checked);
  if(el.id==='business-filter'){state.business=el.value;render();}
  if(el.id==='talent-status'){state.talentStatus=el.value;render();}
  if(el.id==='slot-config-department'){state.slotConfigDepartment=el.value;const dept=activeDepartment(el.value);state.slotConfigGroup=dept?.groups[0]||'';state.slotConfigDraft=null;render();return;}
  if(el.id==='slot-config-group'){state.slotConfigGroup=el.value;state.slotConfigDraft=null;render();return;}
  if(el.closest('#slot-config-form')&&el.name==='slot'){
    const form=el.closest('form'),slots=[...form.querySelectorAll('input[name="slot"]:checked')].map(input=>input.value);
    state.slotConfigDraft={department:form.elements.department.value,group:form.elements.group.value,slots};
    if($('.department-orphaned-draft')){render();return;}
    form.querySelectorAll('.slot-config-option').forEach(option=>option.classList.toggle('is-active',option.querySelector('input').checked));
    if(!form.querySelector('.department-draft-note')){const note=document.createElement('p');note.className='department-draft-note';note.setAttribute('role','status');note.textContent='场次修改尚未保存';form.querySelector('.slot-config-options').after(note);}
  }
  if(el.id==='room-start-date')await setRoomStart(el.value);
  if(el.id==='schedule-month')await setMonth(el.value);
  if(el.closest('#schedule-form')&&['startDate','days','slot','talentId1','talentId2','talentId3'].includes(el.name))updateScheduleOptions();
  if(el.closest('#schedule-form')&&el.name==='business')updateScheduleSummary();
  if(el.closest('#edit-schedule-form')&&['talentId1','talentId2','talentId3'].includes(el.name))updateEditScheduleOptions();
  if(el.id==='avatar-file'){
    if(!el.files[0])return;
    const context=modalContext;
    try{context.avatarLoading=true;$('#form-error').textContent='';const result=await readAvatar(el.files[0]);if(modalContext!==context)return;context.avatar=result;context.avatarChanged=true;$('#avatar-preview').innerHTML=avatar({avatar:result,name:'头像'},'large');}
    catch(error){if(modalContext===context)$('#form-error').textContent=error.message;}
    finally{context.avatarLoading=false;}
  }
});
document.addEventListener('input',e=>{
  if(e.target.id==='schedule-quick-search')state.scheduleSearch=e.target.value;
  if(e.target.id==='schedule-talent-search'){
    if(e.isComposing){const context=modalContext;if(context?.kind==='talent-search'){clearTimeout(context.searchTimer);context.loadRun++;}}
    else queueTalentSearch(e.target);
  }
  if(e.target.id==='talent-search'&&!e.isComposing){const position=e.target.selectionStart;state.search=e.target.value;render();const search=$('#talent-search');search.focus();try{search.setSelectionRange(position,position);}catch{}}
});
document.addEventListener('compositionend',e=>{if(e.target.id==='schedule-talent-search')queueTalentSearch(e.target);if(e.target.id==='talent-search'){state.search=e.target.value;render();$('#talent-search').focus();}});
document.addEventListener('submit',async e=>{
  const form=e.target;
  if(form.id==='schedule-quick-search-form'){e.preventDefault();return openTalentSearch(form.elements.q.value);}
  if(form.id==='schedule-talent-search-form'){e.preventDefault();return queueTalentSearch(form.elements.q,true);}
  if(form.id==='audit-filter-form'){e.preventDefault();state.auditFilters={...Object.fromEntries(new FormData(form)),offset:0};await loadAudit();return;}
  if(form.id==='slot-config-form'){
    e.preventDefault();
    if(!state.user)return openLogin();
    const errorBox=$('#slot-config-error',form),submit=e.submitter||form.querySelector('button[type="submit"]');
    const currentDepartment=activeDepartment(form.elements.department.value);
    if(!currentDepartment?.groups.includes(form.elements.group.value)||state.slotConfigDraft&&!activeDepartment(state.slotConfigDraft.department)?.groups.includes(state.slotConfigDraft.group)){if(errorBox)errorBox.textContent='原部门或组别已停用，请重新选择后再保存。';return;}
    const slots=[...form.querySelectorAll('input[name="slot"]:checked')].map(input=>input.value);
    if(!slots.length){if(errorBox)errorBox.textContent='至少保留一个可用场次';return;}
    if(submit){submit.disabled=true;submit.dataset.original=submit.textContent;submit.textContent='保存中…';}
    if(errorBox)errorBox.textContent='';
    try{
      await api('/api/slot-config',{method:'PATCH',body:JSON.stringify({department:form.elements.department.value,group:form.elements.group.value,slots})});
      state.config=await api('/api/config');
      state.slotConfigDraft=null;
      state.schedules=[];state.bookings=[];state.connected=false;
      render();await refresh({quiet:true});toast('场次设置已保存');
    }catch(error){if(errorBox)errorBox.textContent=error.message;else toast(error.message);}
    finally{if(submit){submit.disabled=false;submit.textContent=submit.dataset.original||'保存场次设置';}}
    return;
  }
  if(!form.closest('#modal'))return;e.preventDefault();const context=modalContext;if(!context||context.busy)return;
  const departmentTargetError=openDepartmentTargetError();
  if(departmentTargetError){protectOpenDepartmentDraft();return;}
  if(context.avatarLoading){$('#form-error').textContent='头像正在处理，请稍等片刻';return;}
  const fields=Object.fromEntries(new FormData(form));for(const key of Object.keys(fields))if(typeof fields[key]==='string')fields[key]=fields[key].trim();
  const departmentSlotsSelected=['department-form','department-group-form'].includes(form.id)?[...form.querySelectorAll('input[name="slot"]:checked')].map(input=>input.value):null;
  if(departmentSlotsSelected&&!departmentSlotsSelected.length){$('#form-error').textContent='至少保留一个可用场次';return;}
  if(form.id==='schedule-form'){
    if(!context.optionsReady){$('#form-error').textContent='正在检查日期和可用人员，请稍候再保存。';return;}
    if(context.selectionConflict){$('#form-error').textContent=context.selectionConflict;return;}
  }
  const submit=e.submitter||[...form.elements].find(element=>element.type==='submit');context.busy=true;if(submit){submit.disabled=true;submit.dataset.original=submit.textContent;submit.textContent='保存中…';}$('#form-error').textContent='';
  try{
    let success='操作成功';
    if(['department-form','rename-department-form','delete-department-form','department-group-form','delete-department-group-form'].includes(form.id)){
      let result;
      const departmentPath='/api/departments/'+encodeURIComponent(context.department||'');
      if(form.id==='department-form'){
        const groups=fields.groups.split(/[\r\n,，、]+/u).map(group=>group.trim()).filter(Boolean);
        if(!groups.length)throw new Error('至少填写一个组别');
        if(groups.some(group=>group.length>20))throw new Error('每个组别名称最多20字');
        if(new Set(groups).size!==groups.length)throw new Error('组别名称不能重复');
        result=await api('/api/departments',{method:'POST',body:JSON.stringify({name:fields.name,groups,slots:departmentSlotsSelected})});
        state.slotConfigDepartment=result.department.id;state.slotConfigGroup=result.department.groups[0];success='部门已新增';
      }
      if(form.id==='rename-department-form'){result=await api(departmentPath,{method:'PATCH',body:JSON.stringify({name:fields.name})});success='部门名称已更新';}
      if(form.id==='delete-department-form'){result=await api(departmentPath,{method:'DELETE',body:'{}'});success='部门已删除，已有排班保留';}
      if(form.id==='department-group-form'){
        result=await api(departmentPath+'/groups',{method:'POST',body:JSON.stringify({name:fields.name,slots:departmentSlotsSelected})});
        state.slotConfigDepartment=context.department;state.slotConfigGroup=fields.name;success='组别已新增';
      }
      if(form.id==='delete-department-group-form'){result=await api(departmentPath+'/groups/'+encodeURIComponent(context.group),{method:'DELETE',body:'{}'});success='组别已删除，已有排班保留';}
      if(result?.departments)state.config={...state.config,departments:result.departments,archivedDepartments:result.archivedDepartments||[]};
      state.slotConfigDraft=null;
    }
    if(form.id==='story-form'){
      const url=`/api/talents/${encodeURIComponent(context.talentId)}/stories${context.id?'/'+encodeURIComponent(context.id):''}`;
      await api(url,{method:context.id?'PATCH':'POST',body:JSON.stringify({...fields,revision:context.revision})});
      context.busy=false;closeModal();await loadStoryList(modalContext);toast('剧情已保存');return;
    }
    if(form.id==='login-form'){const result=await api('/api/login',{method:'POST',body:JSON.stringify(fields)});state.user=result.user;state.csrfToken=result.csrfToken;state.config=await api('/api/config');if(!state.role)state.role='manager';state.page='rooms';success='已登录';}
    if(form.id==='talent-form'){
      const payload={name:fields.name,number:fields.number,introduction:fields.introduction||'',active:fields.active!=='false'};
      if(!context.id||context.avatarChanged)payload.avatar=context.avatar;
      await api(context.id?'/api/talents/'+encodeURIComponent(context.id):'/api/talents',{method:context.id?'PATCH':'POST',body:JSON.stringify(payload)});
      success=context.id?'卖手资料已更新':'已录入人才总库';
    }
    if(form.id==='schedule-form'){
      const talentIds=[fields.talentId1,fields.talentId2,fields.talentId3].filter(Boolean);
      if(talentIds.length<1)throw new Error('请选择至少 1 位卖手');
      await api('/api/schedules',{method:'POST',body:JSON.stringify({...fields,talentIds,days:Number(fields.days),department:context.department,group:context.group})});
      success=`已安排 ${dateLabel(fields.startDate)}至${dateLabel(addDays(fields.startDate,Number(fields.days)-1))}，共 ${fields.days} 天，${talentIds.length} 位卖手`;
      state.month=fields.startDate.slice(0,7);state.date=fields.startDate;
    }
    if(form.id==='edit-schedule-form'){
      const talentIds=[fields.talentId1,fields.talentId2,fields.talentId3].filter(Boolean);
      if(talentIds.length<1)throw new Error('请选择至少 1 位卖手');
      await api('/api/schedules/'+encodeURIComponent(context.id),{method:'PATCH',body:JSON.stringify({talentIds,business:fields.business})});
      success='当天排班已调整，其他日期不变';
    }
    if(form.id==='delete-schedule-form'){await api('/api/schedules/'+encodeURIComponent(context.id),{method:'DELETE'});success='已取消当天排班';}
    if(form.id==='room-form'){await api('/api/book',{method:'POST',body:JSON.stringify({...fields,date:context.date,room:context.room,slot:context.slot,clientId})});remember('tongchang-department',fields.department);remember('tongchang-booker',fields.bookerName);success='场地预约成功';}
    if(form.id==='cancel-room-form'){await api('/api/cancel',{method:'POST',body:JSON.stringify({id:context.id,clientId})});success='时段已释放';}
    context.busy=false;closeModal(true);await refresh();recordView();toast(success);
  }catch(error){context.busy=false;const errorBox=$('#form-error');if(errorBox)errorBox.textContent=error.message;if(error.status===409){await refresh({quiet:true});if(form.id==='schedule-form'&&modalContext===context)await updateScheduleOptions();}if(error.status===401&&form.id!=='login-form'){state.user=null;state.csrfToken='';render();}if(submit){submit.disabled=false;submit.textContent=submit.dataset.original;}}
});
$('#modal').addEventListener('cancel',e=>{e.preventDefault();closeModal();});
$('#modal').addEventListener('click',e=>{if(e.target===$('#modal')){const box=$('#modal').getBoundingClientRect();if(e.clientX<box.left||e.clientX>box.right||e.clientY<box.top||e.clientY>box.bottom)closeModal();}});
window.visualViewport?.addEventListener('resize',syncModalViewport);
window.visualViewport?.addEventListener('scroll',syncModalViewport);
window.addEventListener('resize',syncModalViewport);
async function init(){
  try{const [config,me]=await Promise.all([api('/api/config'),api('/api/me')]);state.config=config;state.user=me.user;state.csrfToken=me.csrfToken||'';render();if(requestedModule==='admin')openLogin();void refresh({quiet:true});}
  catch(e){$('#app').innerHTML=`<main class="error-screen"><span class="brand-mark">同</span><h2 style="margin-top:20px">暂时无法连接工作台</h2><p>${esc(e.message)}。请确认服务已启动，并通过工作台网址访问。</p><button class="button" id="init-retry">重新连接</button></main>`;$('#init-retry').onclick=init;}
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.config)refresh({quiet:true});});
setInterval(()=>{if(state.config&&!document.hidden)refresh({quiet:true});},10000);
init();
