import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

// Runs the generated WeChat bundle with real WebGL2 and wx-style touch events.
const root = await realpath(fileURLToPath(new URL('..', import.meta.url)));
const output = path.join(root, 'reports/wechat-yard');
await mkdir(output, { recursive: true });
if (process.platform === 'win32') assert.match(await realpath(output), /^D:/i);
const profileBase = process.platform === 'win32' ? 'D:/CodexStorage/temp/' : output;
const profile = await mkdtemp(path.join(profileBase, 'wechat-yard-'));
const bundlePath = process.env.ANHELI_YARD_BUNDLE ? path.resolve(process.env.ANHELI_YARD_BUNDLE) : path.join(root, 'dist/wechat-yard/game.js');
const focusLakeHome = process.env.ANHELI_YARD_FOCUS === 'lake-home';
if (process.platform === 'win32') assert.match(await realpath(bundlePath), /^D:/i);
const bundle = await readFile(bundlePath, 'utf8');
const harness = path.join(output, 'harness.html');
await writeFile(harness, '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>安和里微信试玩验收</title><style>html,body{margin:0;overflow:hidden;background:#dce7c8}canvas#game{display:block;position:fixed;inset:0;width:100vw;height:100vh;touch-action:none}</style>');
const results = { target: path.relative(root, bundlePath), sha256: createHash('sha256').update(bundle).digest('hex'), checks: [], screenshots: [], errors: [] };
const context = await chromium.launchPersistentContext(profile, {
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
    (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined),
  headless: true, viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 3,
  locale: 'zh-CN', timezoneId: 'Asia/Shanghai', downloadsPath: output,
  args: process.env.ANHELI_YARD_HARDWARE_GPU === '1'
    ? ['--use-angle=d3d11','--disable-software-rasterizer','--disable-background-timer-throttling']
    : ['--enable-unsafe-swiftshader','--use-angle=swiftshader','--disable-background-timer-throttling'],
});

const page = context.pages()[0];
page.setDefaultTimeout(12_000);
page.on('pageerror', error => results.errors.push({ type: 'pageerror', message: error.message }));
page.on('console', message => { if (message.type() === 'error') results.errors.push({ type: 'console', message: message.text() }); });

await page.addInitScript(() => {
  const dom = document, events = new Map(), canvases = [], dialogs = [], overlayLabels = [];
  const worldLabels = new Set();
  let keyboard = null;
  const names = ['TouchStart','TouchMove','TouchEnd','TouchCancel','WindowResize','Show','Hide','Error','KeyboardConfirm','KeyboardComplete'];
  const fire = (name, value = {}) => [...(events.get(name) || [])].forEach(callback => callback(value));
  const fillWorldText = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function(label,...args){
    if(this.canvas!==canvases[1])worldLabels.add(label);
    return fillWorldText.call(this,label,...args);
  };
  const info = () => ({ windowWidth: innerWidth, windowHeight: innerHeight, screenWidth: innerWidth, screenHeight: innerHeight,
    pixelRatio: devicePixelRatio, platform: 'ios', system: 'iOS 18', brand: 'iPhone', model: 'Canvas acceptance', SDKVersion: '3.18.0',
    screenTop: 0, statusBarHeight: 24, safeArea: { left: 0, right: innerWidth, top: 24, bottom: innerHeight - 12, width: innerWidth, height: innerHeight - 36 } });
  const platform = {
    __test: true,
    createCanvas() {
      const cv = dom.createElement('canvas'); cv.width = innerWidth; cv.height = innerHeight;
      cv.requestAnimationFrame = callback => requestAnimationFrame(callback);
      cv.cancelAnimationFrame = id => cancelAnimationFrame(id);
      canvases.push(cv);
      if (canvases.length === 1) {
        cv.id = 'game'; dom.body.append(cv); const points = new Map();
        const point = event => ({ identifier: event.pointerId, clientX: event.clientX, clientY: event.clientY, pageX: event.clientX, pageY: event.clientY });
        cv.addEventListener('pointerdown', event => { event.preventDefault(); cv.setPointerCapture(event.pointerId); const p = point(event); points.set(event.pointerId, p); fire('TouchStart', { touches: [...points.values()], changedTouches: [p], timeStamp: event.timeStamp }); });
        cv.addEventListener('pointermove', event => { if (!points.has(event.pointerId)) return; const p = point(event); points.set(event.pointerId, p); fire('TouchMove', { touches: [...points.values()], changedTouches: [p], timeStamp: event.timeStamp }); });
        for (const [eventName, wxName] of [['pointerup','TouchEnd'],['pointercancel','TouchCancel']]) cv.addEventListener(eventName, event => { const p = point(event); points.delete(event.pointerId); fire(wxName, { touches: [...points.values()], changedTouches: [p], timeStamp: event.timeStamp }); });
      } else if (canvases.length === 2) {
        const ctx = cv.getContext('2d');
        const fillText = ctx.fillText.bind(ctx);
        const clearRect = ctx.clearRect.bind(ctx);
        ctx.fillText = (label,...args) => { overlayLabels.push(label); return fillText(label,...args); };
        ctx.clearRect = (...args) => { overlayLabels.length=0; return clearRect(...args); };
      }
      return cv;
    },
    createOffscreenCanvas({ width = 1, height = 1 } = {}) { const cv = dom.createElement('canvas'); cv.width = width; cv.height = height; return cv; },
    createImage() { return new Image(); },
    getWindowInfo: info, getSystemInfoSync: info,
    getMenuButtonBoundingClientRect: () => ({ left: innerWidth - 93, right: innerWidth - 7, top: 26, bottom: 58, width: 86, height: 32 }),
    getAccountInfoSync: () => ({ miniProgram: { appId: 'wx24c1d8b3a00f962e', envVersion: 'develop', version: '' } }),
    getStorageSync(key) { const raw = localStorage.getItem(key); if (raw === null) return ''; try { return JSON.parse(raw); } catch { return raw; } },
    setStorageSync(key, value) { localStorage.setItem(key, JSON.stringify(value)); },
    removeStorageSync(key) { localStorage.removeItem(key); },
    getStorageInfoSync() { return { keys: Object.keys(localStorage), currentSize: 1, limitSize: 10240 }; },
    showModal(options) { dialogs.push({ title: options.title, content: options.content }); },
    showToast(options) { dialogs.push({ type: 'toast', title: options.title }); options.success?.({}); },
    showKeyboard(options) { keyboard = options; options.success?.({}); },
    hideKeyboard(options) {
      const opened = keyboard;
      keyboard = null;
      if(opened)fire('KeyboardComplete');
      options?.success?.({});
    },
    request() { throw new Error('Network access is outside this single-player bundle acceptance'); },
  };
  for (const name of names) {
    events.set(name, new Set());
    platform['on' + name] = callback => events.get(name).add(callback);
    platform['off' + name] = callback => events.get(name).delete(callback);
  }
  window.wx = platform;
  window.__wxHarness = { canvases, dialogs, fire, overlayLabels, worldLabels,
    keyboardDefault() { return keyboard ? keyboard.defaultValue : null; },
    finishKeyboard(value) {
      if(!keyboard)throw new Error('WeChat keyboard did not open');
      keyboard = null;
      if(value!==undefined)fire('KeyboardConfirm',{value});
      fire('KeyboardComplete',{value});
    },
    api() { return platform.__yard; } };
  addEventListener('resize', () => fire('WindowResize', { size: info() }));
});

const snapshot=()=>page.evaluate(()=>__wxHarness.api()?.snapshot());
const check=message=>{results.checks.push(message);console.log('PASS '+message);};
async function boot(){
  await page.goto(pathToFileURL(harness).href);
  await page.evaluate(code=>{
    new Function('wx','window','document',code+'\n//# sourceURL=game.js')(wx,undefined,undefined);
  },bundle);
  await page.waitForFunction(()=>!!__wxHarness.api()?.snapshot().ui.buttons.length||__wxHarness.dialogs.length);
  assert.deepEqual(await page.evaluate(()=>__wxHarness.dialogs),[]);
}
async function tap(id){
  let ui=(await snapshot()).ui;
  let rect=ui.buttons.find(button=>button.id===id);
  for(let attempt=0;(!rect||rect.h<12)&&ui.menu&&attempt<8;attempt++){
    const panel=ui.buttons.find(button=>button.id==='menu-panel');
    if(!panel)break;
    const session=await context.newCDPSession(page);
    const x=Math.round(panel.x+panel.w*.7);
    const from=Math.round(panel.y+panel.h*.86);
    const to=Math.round(panel.y+panel.h*.2);
    await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y:from}]});
    for(let step=1;step<=4;step++){
      await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:from+(to-from)*step/4}]});
    }
    await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await session.detach();
    await page.waitForTimeout(150);
    ui=(await snapshot()).ui;
    rect=ui.buttons.find(button=>button.id===id);
  }
  if(!rect||rect.h<12||rect.disabled){
    await page.waitForFunction(id=>__wxHarness.api().snapshot().ui.buttons.some(button=>button.id===id&&button.h>=12&&!button.disabled),id);
    rect=visible(await snapshot(),id);
  }
  await page.touchscreen.tap(rect.x+rect.w/2,rect.y+rect.h/2);
  await page.waitForTimeout(350);
}
async function renamePlayer(oldName,newName){
  await tap('rename-player');
  const defaultValue=await page.evaluate(()=>__wxHarness.keyboardDefault());
  assert.equal(defaultValue,oldName);
  await page.evaluate(value=>__wxHarness.finishKeyboard(value),newName);
  await page.waitForFunction(name=>__wxHarness.api().snapshot().playerName===name,newName);
  await page.waitForFunction(name=>__wxHarness.worldLabels.has(name),newName);
}
async function openMarket(){
  if((await snapshot()).market.open)return;
  await tap('market');
  await page.waitForFunction(()=>__wxHarness.api().snapshot().market.open,null,{timeout:90000});
  assert.ok((await snapshot()).market.near);
}
async function openTab(id){
  if((await snapshot()).ui.menu!==id)await tap('tab-'+id);
}
async function waitAt(target,radius=.65){
  await page.waitForFunction(({target,radius})=>{
    const {player}=__wxHarness.api().snapshot();
    return Math.hypot(player.x-target[0],player.z-target[1])<radius;
  },{target,radius},{timeout:60000});
}
async function walkToShore(target){
  await tapGround(...target);
  await waitAt(target);
  await page.waitForFunction(()=>{
    const {player,fishing}=__wxHarness.api().snapshot();
    return !player.walking&&Boolean(fishing.availableSpot);
  });
}
const waitForContext=zone=>page.waitForFunction(kind=>__wxHarness.api().snapshot().context.kind===kind,zone,{timeout:60000});
const distance=(first,second)=>Math.hypot(first.x-second.x,first.z-second.z);
const visible=(snapshot,id)=>snapshot.ui.buttons.find(button=>button.id===id);
const localActions=['tab-fish','tab-farm','tab-market','tab-house','zoom','fishing','reel','interact','livestock','sow','irrigate','fertilize','harvest'];
const home=[-2.95,3.4];

async function travelTo(id,zone){
  await openTab('settings');
  await tap(id);
  await waitForContext(zone);
  if((await snapshot()).ui.menu==='settings')await tap('close-panel');
}
async function travelToLake(){
  await openTab('settings');
  await tap('lake-route');
  await page.waitForFunction(()=>{
    const {fishing}=__wxHarness.api().snapshot();
    return fishing.availableSpot&&!fishing.approaching;
  },null,{timeout:60000});
  if((await snapshot()).ui.menu==='settings')await tap('close-panel');
  await page.waitForFunction(()=>__wxHarness.api().snapshot().ui.buttons.some(button=>button.id==='fishing'&&!button.disabled));
}
async function tapGround(x,z){
  const point=await page.evaluate(([x,z])=>__wxHarness.api().project(x,z),[x,z]);
  assert.ok(point.x>0&&point.y>0&&point.x<page.viewportSize().width&&point.y<page.viewportSize().height);
  await page.touchscreen.tap(point.x,point.y);
  await page.waitForTimeout(350);
}
async function tapSurveyCell(state,predicate=()=>true){
  const {survey,ui}=await snapshot();
  const cells=survey.cells.filter(cell=>cell.state===state&&predicate(cell));
  const points=await page.evaluate(cells=>cells.map(({x,z})=>__wxHarness.api().project(x,z)),cells);
  const {width,height}=page.viewportSize();
  const index=points.findIndex(({x,y})=>x>4&&x<width-4&&y>68&&y<height-8&&
    Math.hypot(x-ui.joystick.x,y-ui.joystick.y)>ui.joystick.radius+7&&
    !ui.buttons.some(box=>x>=box.x-2&&x<=box.x+box.w+2&&y>=box.y-2&&y<=box.y+box.h+2));
  assert.ok(index>=0,`an unobstructed ${state} tile is visible`);
  await tapGround(cells[index].x,cells[index].z);
  return (await snapshot()).survey.quote;
}
async function buySurveyParcel(){
  const before=await snapshot();
  const {quote}=before.survey;
  assert.ok(quote.valid);
  assert.ok(visible(before,'buy-plot')&&!visible(before,'buy-plot').disabled);
  await tap('buy-plot');
  const after=await snapshot();
  const parcel=after.economy.plots.at(-1);
  assert.equal(after.economy.coins,before.economy.coins-quote.price);
  assert.equal(after.economy.plots.length,before.economy.plots.length+1);
  assert.equal(parcel.price,quote.price);
  assert.equal(parcel.resale,quote.resale);
  assert.equal(parcel.size,before.survey.size);
  assert.equal(parcel.purpose,before.survey.purpose);
  assert.ok(after.survey.quote.owned);
  assert.ok(!visible(after,'buy-plot'));
  return parcel;
}
async function returnHome(){
  await tap('home-route');
  await waitAt(home);
  assert.equal((await snapshot()).market.open,false);
}
async function joystickGesture(dx,dy,{cancel=false}={}){
  const {ui,player}=await snapshot();
  const {x,y,radius}=ui.joystick;
  const session=await context.newCDPSession(page);
  try{
    await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
    await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*radius,y:y+dy*radius}]});
    await page.waitForFunction(({x,z})=>{
      const current=__wxHarness.api().snapshot();
      return current.ui.joystick.active&&Math.hypot(current.player.x-x,current.player.z-z)>.50;
    },player,{timeout:12000});
    await session.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});
    await page.waitForFunction(()=>{
      const {ui,player}=__wxHarness.api().snapshot();
      return !ui.joystick.active&&!ui.joystick.dx&&!ui.joystick.dy&&!player.walking;
    });
    const stopped=(await snapshot()).player;
    await page.waitForTimeout(450);
    assert.ok(distance(stopped,(await snapshot()).player)<.08,'released joystick leaves the player stopped');
  }finally{
    await session.detach();
  }
}
async function screenshot(name){
  const filename=path.join(output,name+'.png');
  await page.screenshot({path:filename,timeout:30000});
  results.screenshots.push(filename);
}
async function checkResolution(width,height){
  const [world,ui]=await page.evaluate(()=>__wxHarness.canvases.slice(0,2).map(canvas=>({
    width:canvas.width,height:canvas.height,
  })));
  for(const buffer of [world,ui]){
    assert.ok(buffer.width>=width*2&&buffer.height>=height*2);
    assert.ok(buffer.width*buffer.height<=1_805_000);
  }
  assert.ok(Math.abs(world.width-ui.width)<=1&&Math.abs(world.height-ui.height)<=1);
  return {world,ui};
}
async function advance(ms){
  await page.evaluate(delta=>{
    const real=window.__yardTimeNative??Date.now;
    window.__yardTimeNative=real;
    window.__yardTimeOffset=(window.__yardTimeOffset??0)+delta;
    Date.now=()=>real()+window.__yardTimeOffset;
  },ms);
  await page.waitForTimeout(500);
}
async function catchAtLake(expectedCount,capture){
  const {player,fishing}=await snapshot();
  assert.ok(fishing.availableSpot?.bobber);
  await tap('fishing');
  await page.waitForFunction(()=>['waiting','bite'].includes(__wxHarness.api().snapshot().fishing.phase),null,{timeout:45000});
  const cast=await snapshot();
  assert.ok(distance(cast.player,player)<.10,'casting leaves the player at the chosen shore position');
  assert.ok(distance(cast.fishing.spot.bobber,fishing.availableSpot.bobber)<.15);
  if(capture)await screenshot(capture);
  await advance(6100);
  await page.waitForFunction(()=>__wxHarness.api().snapshot().fishing.phase==='bite');
  await tap('reel');
  await page.waitForFunction(count=>{
    const {context,ui}=__wxHarness.api().snapshot();
    return context.fishBasket.count===count&&ui.buttons.some(button=>button.id==='fishing');
  },expectedCount);
  return cast;
}
async function verifyLakeHome(){
  await tap('home-sites');
  assert.equal((await snapshot()).ui.menu,'site');
  await tap('home-site-picker');
  const chosen=await snapshot();
  const chosenId=chosen.homeSites.selectedId;
  assert.equal(chosenId,'lake-west');
  const site=chosen.homeSites.quotes.find(candidate=>candidate.id===chosenId);
  assert.ok(site?.available);
  assert.equal(site.resale,Math.floor(site.price*.75));
  await screenshot('phone-lake-home-sites');
  await tap('buy-home-site');
  const acquired=await snapshot();
  assert.equal(acquired.economy.homeSiteId,site.id);
  assert.equal(acquired.economy.homesteadOwned,true);
  assert.equal(acquired.economy.coins,chosen.economy.coins-site.price);
  assert.equal(acquired.house,null);
  await tap('sell-home-site');
  const sold=await snapshot();
  assert.equal(sold.economy.homesteadOwned,false);
  assert.equal(sold.economy.coins,acquired.economy.coins+site.resale);
  await tap('visit-home-site');
  await waitAt([site.front.x,site.front.z]);
  await page.waitForFunction(()=>!__wxHarness.api().snapshot().player.walking);
  await tapGround(site.x,site.z);
  const tappedSite=await snapshot();
  assert.equal(tappedSite.ui.menu,'site');
  assert.equal(tappedSite.homeSites.selectedId,site.id);
  await tap('buy-home-site');
  const reacquired=await snapshot();
  assert.equal(reacquired.economy.homeSiteId,site.id);
  assert.equal(reacquired.economy.coins,sold.economy.coins-site.price);
  await tap('build-house');
  assert.equal((await snapshot()).homeSites.selectedId,site.id);
  await tap('housing-market');
  await page.waitForFunction(()=>{
    const {market,ui}=__wxHarness.api().snapshot();
    return market.open&&ui.menu==='house'&&ui.buttons.some(button=>button.id==='house-upgrade'&&!button.disabled);
  },null,{timeout:90000});
  await tap('house-upgrade');
  const lakeBuild=await snapshot();
  assert.ok(lakeBuild.economy.construction);
  assert.equal(lakeBuild.economy.coins,reacquired.economy.coins-180);
  await advance(lakeBuild.economy.construction.readyAt-Date.now()+1000);
  await boot();
  const lakeHome=await snapshot();
  assert.equal(lakeHome.house.id,'simple_shed');
  assert.equal(lakeHome.house.site.x,site.x);
  assert.ok(Math.abs(lakeHome.house.site.z-site.z)<1);
  assert.equal(lakeHome.playerName,chosen.playerName);
  assert.equal(lakeHome.homeSignName,lakeHome.playerName+'家');
  assert.ok(await page.evaluate(name=>__wxHarness.worldLabels.has(name),lakeHome.homeSignName),'lake house sign is painted on reload');
  assert.equal(lakeHome.economy.homeSiteId,site.id);
  await tap('home-sites');
  assert.equal((await snapshot()).homeSites.selectedId,site.id);
  await tap('visit-home-site');
  await waitAt([site.front.x,site.front.z]);
  await page.waitForFunction(()=>!__wxHarness.api().snapshot().player.walking);
  await screenshot('phone-lake-house');
  check('A lake homesite opens from a map tap and supports onsite purchase, 75% buyback, construction, and reload');
}
try{
  await boot();
  const start=await snapshot();
  assert.equal(start.economy.coins,10000);
  assert.equal(start.house,null);
  assert.deepEqual(start.economy.plots,[]);
  assert.deepEqual(start.economy.animals,[]);
  assert.equal(start.context.kind,'');
  assert.ok(localActions.every(id=>!visible(start,id)));
  for(const id of ['land','home-sites','build-house','shop-homes','rename-player'])assert.equal(visible(start,id)?.disabled,false,id+' on first screen');
  const firstScreen=await page.evaluate(()=>__wxHarness.overlayLabels);
  for(const caption of ['买地','宅基地','建房','买房'])assert.ok(firstScreen.includes(caption),caption+' on first screen');
  assert.ok(start.stats.triangles>1000);
  results.portraitBuffers=await checkResolution(390,844);
  await screenshot('phone-survival');
  check('Native WebGL2 opens clean bare land with 10000 安币');
  await tap('shop-homes');
  const firstShop=await snapshot();
  assert.equal(firstShop.ui.menu,'estate');
  assert.ok(!visible(firstShop,'buy-used-house')||visible(firstShop,'buy-used-house').disabled);
  assert.ok((await page.evaluate(()=>__wxHarness.overlayLabels)).some(label=>/暂无|还没有/.test(label)),'the house shop explains that no home is listed');
  await screenshot('phone-estate-entry');
  await tap('close-panel');
  const ownerName='湖岸小蓝';
  await renamePlayer(start.playerName,ownerName);
  check('First screen exposes land, construction, and housing listings, and the editable player name is rendered over the character');

  if(focusLakeHome){
    await verifyLakeHome();
    await walkToShore([-27.6,-18.75]);
    await catchAtLake(1,'phone-lake-house-cast');
    check('A named resident can cast directly from the bank outside the purchased lake home');
  }else{

  await joystickGesture(-1,0);
  await joystickGesture(1,0,{cancel:true});
  const clicked=[-1.25,4.1];
  await tapGround(...clicked);
  await waitAt(clicked);
  check('Mobile joystick immediately moves and stops on release or cancellation, and tapping ground walks there');

  await tap('land');
  const surveyStart=await snapshot();
  assert.equal(surveyStart.ui.survey,true);
  assert.ok(surveyStart.survey.quote?.valid,'the home entry recommends buyable land');
  const legend=await page.evaluate(()=>__wxHarness.overlayLabels);
  for(const caption of ['绿可买','蓝已拥有','灰红不可买'])assert.ok(legend.includes(caption));
  const blocked=await tapSurveyCell('blocked');
  assert.ok(blocked.reason&&!blocked.valid);
  assert.ok(!visible(await snapshot(),'buy-plot'));
  const fieldQuote=await tapSurveyCell('available');
  assert.ok(fieldQuote.valid);
  await tap('land-smaller');
  const small=(await snapshot()).survey;
  assert.ok(small.size<surveyStart.survey.size&&small.quote.valid&&small.quote.price<fieldQuote.price);
  await tap('land-larger');
  const resized=(await snapshot()).survey;
  assert.equal(resized.size,surveyStart.survey.size);
  assert.equal(resized.quote.price,fieldQuote.price);
  await screenshot('phone-land-survey');
  const starterParcel=await buySurveyParcel();
  assert.equal(starterParcel.purpose,'field');
  await tap('sell-plot');
  const resold=await snapshot();
  assert.equal(resold.economy.plots.length,0);
  assert.equal(resold.economy.coins,surveyStart.economy.coins-starterParcel.price+starterParcel.resale);
  await tap('land');
  check('Onsite land survey marks available, owned and protected land, resizes parcels, and settles the quoted purchase and resale');

  await tap('build-house');
  const buildEntry=await snapshot();
  assert.equal(buildEntry.ui.menu,'house');
  assert.equal(buildEntry.market.near,false);
  assert.equal(visible(buildEntry,'housing-market')?.disabled,false);
  assert.ok((await page.evaluate(()=>__wxHarness.overlayLabels)).some(label=>/安币/.test(label)&&!/10000/.test(label)),'the build menu shows a quote before travel');
  await screenshot('phone-build-entry');
  await tap('housing-market');
  await page.waitForFunction(()=>{
    const {market,ui}=__wxHarness.api().snapshot();
    return market.open&&ui.menu==='house'&&ui.buttons.some(button=>button.id==='house-upgrade'&&!button.disabled);
  },null,{timeout:90000});
  const arrival=await snapshot();
  assert.ok(distance(arrival.player,arrival.market.center)<.6);
  await screenshot('phone-market');
  check('Native navigation reaches the new plaza and enables commerce there');
  await tap('house-upgrade');
  const ordered=await snapshot();
  assert.equal(ordered.house,null);
  assert.ok(ordered.economy.construction);
  assert.ok(ordered.economy.coins<10000);
  await screenshot('phone-building');
  await advance(ordered.economy.construction.readyAt-Date.now()+1000);
  const finished=await snapshot();
  assert.ok(finished.house);
  assert.equal(finished.economy.construction,null);
  assert.equal(finished.economy.coins,ordered.economy.coins);
  assert.ok(finished.houseBounds);
  assert.equal(finished.homeSignName,ownerName+'家');
  assert.ok(await page.evaluate(name=>__wxHarness.worldLabels.has(name),finished.homeSignName),'the wooden sign was painted by the scene');
  await boot();
  const reloaded=await snapshot();
  assert.equal(reloaded.economy.coins,finished.economy.coins);
  assert.equal(reloaded.house.id,finished.house.id);
  assert.equal(reloaded.playerName,ownerName);
  assert.equal(reloaded.homeSignName,ownerName+'家');
  assert.ok(await page.evaluate(name=>__wxHarness.worldLabels.has(name),reloaded.homeSignName),'the sign is redrawn on reload');
  await screenshot('phone-first-home');
  check('The new-player construction entry guides checkout, and the finished home and owner signs survive a reload');

  await openMarket();
  await tap('close-panel');
  await screenshot('phone-market-square');
  await tapGround(31,14.5);
  await waitAt([31,14.5]);
  await tap('land');
  const marginal=await tapSurveyCell('available',cell=>cell.z>=20);
  assert.ok(marginal.valid);
  assert.equal(marginal.size,starterParcel.size);
  assert.ok(marginal.price>starterParcel.price&&marginal.resale>starterParcel.resale,
    'equally sized real parcels closer to the market cost and resell for more');
  await tap('land');
  check('Native navigation reaches the new plaza and a nearby onsite land quote still includes the market premium');

  await openTab('settings');
  await tap('season');
  const summer=(await snapshot()).clock.season;
  assert.notEqual(summer,start.clock.season);
  await tap('time-of-day');
  assert.notEqual((await snapshot()).clock.hour,start.clock.hour);
  await travelToLake();
  assert.ok(visible(await snapshot(),'fishing'));
  assert.ok(!visible(await snapshot(),'tab-fish'));
  assert.ok(!visible(await snapshot(),'interact'));
  assert.equal((await snapshot()).context.fishBasket.count,0);
  assert.ok((await page.evaluate(()=>__wxHarness.overlayLabels)).some(value=>value.includes('鱼篓 0/12')));
  const firstCast=await catchAtLake(1,'phone-fishing');
  assert.deepEqual(await checkResolution(390,844),results.portraitBuffers);
  assert.equal((await snapshot()).context.fishBasket.count,1);
  await walkToShore([-19.4,-.1]);
  const southwestCast=await catchAtLake(2,'phone-shore-southwest-cast');
  assert.ok(distance(firstCast.player,southwestCast.player)>5);
  assert.ok(distance(firstCast.fishing.spot.bobber,southwestCast.fishing.spot.bobber)>4);
  await walkToShore([-25.3,-5.9]);
  const westCast=await catchAtLake(3,'phone-shore-west-cast');
  assert.ok(westCast.player.x<-24.5,'the player can fish beyond the original western map edge');
  assert.ok(distance(southwestCast.fishing.spot.bobber,westCast.fishing.spot.bobber)>4);
  check('Tapping terrain along three banks casts in place, including the extended west bank');
  const {capacity}=(await snapshot()).context.fishBasket;
  for(let count=4;count<=capacity;count++)await catchAtLake(count);
  const full=(await snapshot());
  assert.deepEqual(full.context.fishBasket,{count:capacity,capacity,full:true});
  assert.equal(visible(full,'fishing')?.disabled,true);
  assert.ok((await page.evaluate(()=>__wxHarness.overlayLabels)).some(value=>value.includes('鱼篓 12/12')));
  const beforeSale=(await snapshot()).economy.coins;
  await openMarket();
  await openTab('fish');
  await tap('sell-fish');
  assert.ok((await snapshot()).economy.coins>beforeSale);
  assert.equal((await snapshot()).context.fishBasket.count,0);
  assert.ok(!visible(await snapshot(),'fishing'));
  check('Native touch reaches the lake, shows and enforces the fish basket capacity, and sells fish at the plaza');

  await openTab('farm');
  await tap('buy-seed');
  assert.ok(!visible(await snapshot(),'sow'));
  await returnHome();
  await travelToLake();
  await tap('land');
  const plotLocations=[[-6,8],[-8,8],[-13,7],[-23,7],[-24,2],[0,5]];
  let field;
  for(const [x,z] of plotLocations){
    try{await tapGround(x,z);}catch(error){if(error.code!=='ERR_ASSERTION')throw error;continue;}
    const quote=(await snapshot()).survey.quote;
    if(quote?.valid&&distance(quote,{x,z})<.3){field=quote;break;}
  }
  assert.ok(field?.valid,'tapping nearby clear ground selects a buyable field');
  const selectedSpot=await buySurveyParcel();
  await tap('land');
  await tapGround(selectedSpot.x,selectedSpot.z);
  await waitForContext('field');
  await tap('sow');
  assert.equal((await snapshot()).economy.plots[0].crop,'rice');
  await tap('irrigate');
  assert.ok((await snapshot()).economy.plots[0].wateredAt);
  await screenshot('phone-field');
  const beforeFertilize=(await snapshot()).economy.energy;
  await tap('fertilize');
  assert.equal((await snapshot()).economy.plots[0].fertilized,true);
  assert.equal((await snapshot()).economy.energy,beforeFertilize-2);
  assert.ok(!visible(await snapshot(),'fertilize'));
  await advance(18000);
  await tap('harvest');
  assert.equal((await snapshot()).economy.crops.rice,3);
  await openMarket();
  await openTab('farm');
  const beforeCrop=(await snapshot()).economy.coins;
  await tap('sell-crops');
  assert.equal((await snapshot()).economy.crops.rice,0);
  assert.ok((await snapshot()).economy.coins>beforeCrop);
  check('A field bought from the map supports nearby planting, watering, fertilizing and harvest, with seed and crop trades at the market');

  await openTab('market');
  await tap('market-livestockFeed-sheep');
  assert.ok(!visible(await snapshot(),'market-livestockCare-sheep'));
  await returnHome();
  await travelTo('pen-route','pen');
  assert.ok(visible(await snapshot(),'interact'));
  assert.ok(!visible(await snapshot(),'fishing'));
  await tap('livestock');
  assert.equal((await snapshot()).ui.menu,'pen');
  await screenshot('phone-pen');
  const beforeAnimal=(await snapshot()).economy.coins;
  await tap('market-livestockBuy-sheep');
  assert.equal((await snapshot()).economy.animals[0].species,'sheep');
  assert.equal((await snapshot()).economy.coins,beforeAnimal-260);
  await tap('market-livestockSell-sheep');
  assert.equal((await snapshot()).economy.animals.length,0);
  assert.equal((await snapshot()).economy.coins,beforeAnimal-260+215);
  await tap('market-livestockBuy-sheep');
  assert.ok(!visible(await snapshot(),'market-livestockFeed-sheep'));
  const beforeFeed=(await snapshot()).economy;
  await tap('market-livestockCare-sheep');
  const fed=(await snapshot()).economy;
  assert.ok(fed.animals[0].fedAt);
  assert.equal(fed.coins,beforeFeed.coins);
  assert.equal(fed.energy,beforeFeed.energy-2);
  await advance(120000);
  await tap('market-livestockCare-sheep');
  assert.equal((await snapshot()).economy.animals[0].fedAt,0);
  assert.equal((await snapshot()).economy.coins,fed.coins);
  await tap('close-panel');
  await tap('interact');
  await page.waitForFunction(()=>__wxHarness.overlayLabels.some(label=>label.includes('蹭')||label.includes('软')));
  await screenshot('phone-pen-petting');
  await openMarket();
  await openTab('market');
  await tap('sell-goods');
  assert.ok((await snapshot()).economy.coins>fed.coins);
  assert.ok(!visible(await snapshot(),'interact'));
  check('The pen exposes petting, direct animal trades and feeding, while feed and wool can be traded at the plaza');

  await returnHome();
  await travelTo('pen-route','pen');
  await tap('livestock');
  await tap('pen-land');
  assert.equal((await snapshot()).survey.purpose,'paddock');
  await tap('land-smaller');
  const penQuote=(await snapshot()).survey.quote;
  if(!penQuote?.valid)await tapSurveyCell('available');
  const paddock=await buySurveyParcel();
  assert.equal(paddock.purpose,'paddock');
  await tap('land');
  await tapGround(paddock.x,paddock.z);
  await page.waitForFunction(({x,z,size})=>{
    const {player,context}=__wxHarness.api().snapshot();
    return context.kind==='pen'&&Math.hypot(player.x-x,player.z-z)<=size/2+1.2;
  },paddock,{timeout:60000});
  await tap('livestock');
  await tap('market-livestockBuy-chicken');
  const chicken=(await snapshot()).economy.animals.find(animal=>animal.species==='chicken');
  assert.equal(chicken?.paddockId,paddock.id);
  await screenshot('phone-private-paddock-menu');
  await tap('close-panel');
  await screenshot('phone-private-paddock');
  await tap('land');
  const occupied=await tapSurveyCell('owned',cell=>distance(cell,paddock)<paddock.size/2+.1);
  assert.equal(occupied.id,paddock.id);
  assert.equal(visible(await snapshot(),'sell-plot')?.disabled,true);
  await boot();
  const saved=(await snapshot()).economy;
  assert.deepEqual(saved.plots.find(parcel=>parcel.id===paddock.id),paddock);
  assert.deepEqual(saved.animals.find(animal=>animal.id===chicken.id),chicken);
  check('The public pen panel opens fenced land selection, and a private paddock holds its own animals after reload');

  await openMarket();
  await openTab('farm');
  await tap('buy-seed');
  await returnHome();
  await tapGround(selectedSpot.x,selectedSpot.z);
  await waitForContext('field');
  await tap('sow');
  await tap('irrigate');
  await tap('fertilize');
  await openMarket();
  await openTab('house');
  const sellerWallet=(await snapshot()).economy.coins;
  const beforeListing=(await snapshot()).economy.cityRevenue;
  await tap('house-sell');
  assert.equal((await snapshot()).economy.estateListing,null);
  await tap('house-sell');
  const listed=await snapshot();
  assert.equal(listed.house,null);
  assert.ok(!listed.homeSignName,'vacancy does not keep the original household name');
  assert.ok(listed.houseBounds);
  assert.ok(listed.economy.estateListing);
  assert.equal(listed.economy.coins,sellerWallet);
  assert.equal(listed.economy.cityRevenue,beforeListing);
  assert.equal(listed.economy.plots.length,0);
  assert.equal(listed.economy.animals.length,0);
  assert.ok(!(listed.ui.buttons.some(button=>button.id==='buy-used-house'&&!button.disabled)));

  await tap('switch-player');
  const buyerBefore=(await snapshot()).economy;
  assert.equal(buyerBefore.residentId,'buyer');
  assert.ok(!(await snapshot()).ui.buttons.some(button=>button.id==='tab-city'));
  await tap('shop-homes');
  assert.equal((await snapshot()).ui.menu,'estate');
  const price=listed.economy.estateListing.price;
  await tap('buy-used-house');
  const purchased=await snapshot();
  assert.equal(purchased.house.id,finished.house.id);
  assert.equal(purchased.economy.plots[0].crop,'rice');
  assert.equal(purchased.economy.plots[0].fertilized,true);
  assert.equal(purchased.economy.animals[0].species,'sheep');
  assert.deepEqual(purchased.economy.plots.find(parcel=>parcel.id===paddock.id),paddock);
  assert.deepEqual(purchased.economy.animals.find(animal=>animal.id===chicken.id),chicken);
  assert.equal(purchased.economy.coins,buyerBefore.coins-price);
  assert.equal(purchased.economy.estateListing,null);
  assert.equal(purchased.homeSignName,purchased.playerName+'家');
  assert.notEqual(purchased.homeSignName,listed.homeSignName);
  if((await snapshot()).ui.menu!=='house')await openTab('house');
  await tap('switch-player');
  await openTab('city');
  assert.equal((await snapshot()).economy.coins,sellerWallet);
  assert.equal((await snapshot()).economy.cityRevenue,beforeListing+price);
  assert.equal((await snapshot()).economy.cityReceipts.at(-1).amount,price);
  const ledgerLabels=await page.evaluate(()=>__wxHarness.overlayLabels);
  assert.ok(ledgerLabels.some(label=>label.includes('城主收入 '+(beforeListing+price)+' 安币')));
  assert.ok(ledgerLabels.some(label=>label.includes('最近到账 '+price+' 安币')));
  await screenshot('phone-market-ledger');
  check('The vacant estate stays on the map, transfers planted land and animals, and pays only the city ledger');

  await returnHome();
  check('The westbound route returns from the market along the avenue');
  await travelTo('pen-route','pen');
  await tapGround(8.8,9.35);
  await waitAt([8.8,9.35]);
  await tapGround(12.9,9.25);
  await waitAt([12.9,9.25]);
  await tap('mount');
  await page.waitForFunction(()=>__wxHarness.api().snapshot().player.mounted,null,{timeout:60000});
  const mounted=(await snapshot()).player;
  const target=[mounted.x+1.2,mounted.z+2.4];
  await tapGround(...target);
  await page.waitForFunction(([x,z])=>{
    const {player}=__wxHarness.api().snapshot();
    return player.mounted&&Math.hypot(player.x-x,player.z-z)<.6;
  },target,{timeout:30000});
  await tap('mount');
  assert.equal((await snapshot()).player.mounted,false);
  check('Native touch mounts, rides and dismounts the public loan horse');

  await page.setViewportSize({width:844,height:390});
  await page.waitForTimeout(450);
  results.landscapeBuffers=await checkResolution(844,390);
  const {ui}=await snapshot();
  for(const {id,x,y,w,h} of ui.buttons)assert.ok(x>=0&&y>=0&&x+w<=844.1&&y+h<=390.1,id+' in the landscape viewport');
  await screenshot('landscape-fishing');
  await tap('land');
  const landscape=(await snapshot()).ui;
  assert.equal(landscape.survey,true);
  for(const {id,x,y,w,h} of landscape.buttons)assert.ok(x>=0&&y>=0&&x+w<=844.1&&y+h<=390.1,id+' in the landscape survey');
  await screenshot('landscape-land-survey');
  check('Native portrait and landscape canvas controls fit the viewport');
  check('The world and HUD use at least 2× logical resolution through movement and resize');

  await page.evaluate(()=>localStorage.clear());
  await page.setViewportSize({width:390,height:844});
  await boot();
  await verifyLakeHome();
  }
  assert.deepEqual(results.errors,[]);
  results.ok=true;
}catch(error){
  results.ok=false;
  results.failure=error.stack;
  results.last=await snapshot();
  results.dialogs=await page.evaluate(()=>__wxHarness.dialogs);
  console.error(error.stack);
  process.exitCode=1;
}finally{
  await writeFile(path.join(output,focusLakeHome?'result-lake-home.json':'result.json'),JSON.stringify(results,null,2)+'\n');
  await context.close();
}
