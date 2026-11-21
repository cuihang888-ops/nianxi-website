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
const profile = await mkdtemp(path.join('D:/CodexStorage/temp/', 'wechat-yard-'));
const bundlePath = process.env.ANHELI_YARD_BUNDLE ? path.resolve(process.env.ANHELI_YARD_BUNDLE) : path.join(root, 'dist/wechat-yard/game.js');
if (process.platform === 'win32') assert.match(await realpath(bundlePath), /^D:/i);
const bundle = await readFile(bundlePath, 'utf8');
const harness = path.join(output, 'harness.html');
await writeFile(harness, '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>安和里微信试玩验收</title><style>html,body{margin:0;overflow:hidden;background:#dce7c8}canvas#game{display:block;position:fixed;inset:0;width:100vw;height:100vh;touch-action:none}</style>');
const results = { target: path.relative(root, bundlePath), sha256: createHash('sha256').update(bundle).digest('hex'), checks: [], screenshots: [], errors: [] };
const context = await chromium.launchPersistentContext(profile, {
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
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
  const names = ['TouchStart','TouchMove','TouchEnd','TouchCancel','WindowResize','Show','Hide','Error'];
  const fire = (name, value = {}) => [...(events.get(name) || [])].forEach(callback => callback(value));
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
    request() { throw new Error('Network access is outside this single-player bundle acceptance'); },
  };
  for (const name of names) {
    events.set(name, new Set());
    platform['on' + name] = callback => events.get(name).add(callback);
    platform['off' + name] = callback => events.get(name).delete(callback);
  }
  window.wx = platform;
  window.__wxHarness = { canvases, dialogs, fire, overlayLabels,
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
async function tapGround(x,z){
  const point=await page.evaluate(([x,z])=>__wxHarness.api().project(x,z),[x,z]);
  assert.ok(point.x>0&&point.y>0&&point.x<page.viewportSize().width&&point.y<page.viewportSize().height);
  await page.touchscreen.tap(point.x,point.y);
  await page.waitForTimeout(350);
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
async function catchAtLake(expectedCount){
  await tap('fishing');
  await page.waitForFunction(()=>['waiting','bite'].includes(__wxHarness.api().snapshot().fishing.phase),null,{timeout:45000});
  await advance(6100);
  await page.waitForFunction(()=>__wxHarness.api().snapshot().fishing.phase==='bite');
  await tap('reel');
  await page.waitForFunction(count=>{
    const {context,ui}=__wxHarness.api().snapshot();
    return context.fishBasket.count===count&&ui.buttons.some(button=>button.id==='fishing');
  },expectedCount);
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
  assert.ok(start.stats.triangles>1000);
  results.portraitBuffers=await checkResolution(390,844);
  await screenshot('phone-survival');
  check('Native WebGL2 opens clean bare land with 10000 安币');

  await joystickGesture(-1,0);
  await joystickGesture(1,0,{cancel:true});
  const clicked=[-1.25,4.1];
  await tapGround(...clicked);
  await waitAt(clicked);
  check('Mobile joystick immediately moves and stops on release or cancellation, and tapping ground walks there');

  await openMarket();
  const arrival=await snapshot();
  assert.ok(Math.hypot(arrival.player.x-arrival.market.center.x,arrival.player.z-arrival.market.center.z)<.6);
  await tap('close-panel');
  assert.equal((await snapshot()).ui.menu,'');
  await screenshot('phone-market-square');
  await openTab('house');
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
  await boot();
  assert.equal((await snapshot()).economy.coins,finished.economy.coins);
  assert.equal((await snapshot()).house.id,finished.house.id);
  check('Construction and reload preserve the completed house and confirmed wallet debit');

  await openTab('settings');
  await tap('season');
  const summer=(await snapshot()).clock.season;
  assert.notEqual(summer,start.clock.season);
  await tap('time-of-day');
  assert.notEqual((await snapshot()).clock.hour,start.clock.hour);
  await travelTo('lake-route','lake');
  assert.ok(visible(await snapshot(),'fishing'));
  assert.ok(!visible(await snapshot(),'tab-fish'));
  assert.ok(!visible(await snapshot(),'interact'));
  assert.equal((await snapshot()).context.fishBasket.count,0);
  assert.ok((await page.evaluate(()=>__wxHarness.overlayLabels)).some(value=>value.includes('鱼篓 0/12')));
  await catchAtLake(1);
  assert.deepEqual(await checkResolution(390,844),results.portraitBuffers);
  assert.equal((await snapshot()).context.fishBasket.count,1);
  await screenshot('phone-fishing');
  const {capacity}=(await snapshot()).context.fishBasket;
  for(let count=2;count<=capacity;count++)await catchAtLake(count);
  const full=(await snapshot());
  assert.deepEqual(full.context.fishBasket,{count:capacity,capacity,full:true});
  assert.equal(visible(full,'fishing')?.disabled,true);
  assert.ok((await page.evaluate(()=>__wxHarness.overlayLabels)).some(value=>value.includes('鱼篓 12/12')));
  const beforeSale=(await snapshot()).economy.coins;
  await tap('land');
  const plotLocations=[[-6,8],[-8,8],[-13,7],[-23,7],[-24,2],[0,5]];
  for(const [x,z] of plotLocations){
    try{await tapGround(x,z);}catch(error){if(error.code!=='ERR_ASSERTION')throw error;continue;}
    if((await snapshot()).economy.selectedSpot?.valid)break;
  }
  const {selectedSpot}=(await snapshot()).economy;
  assert.ok(selectedSpot?.valid,'a nearby clear terrain plot can be selected');
  assert.ok(!visible(await snapshot(),'buy-plot'));

  await openMarket();
  await openTab('fish');
  await tap('sell-fish');
  assert.ok((await snapshot()).economy.coins>beforeSale);
  assert.equal((await snapshot()).context.fishBasket.count,0);
  assert.ok(!visible(await snapshot(),'fishing'));
  check('Native touch reaches the lake, shows and enforces the fish basket capacity, and sells fish at the plaza');

  await openTab('farm');
  const beforePlot=(await snapshot()).economy.coins;
  await tap('buy-plot');
  assert.equal((await snapshot()).economy.coins,beforePlot-160);
  await tap('buy-seed');
  assert.ok(!visible(await snapshot(),'sow'));
  await returnHome();
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
  check('The market trades land, seed and harvests, while plot actions only appear near the field');

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
  const price=listed.economy.estateListing.price;
  await tap('buy-used-house');
  const purchased=await snapshot();
  assert.equal(purchased.house.id,finished.house.id);
  assert.equal(purchased.economy.plots[0].crop,'rice');
  assert.equal(purchased.economy.plots[0].fertilized,true);
  assert.equal(purchased.economy.animals[0].species,'sheep');
  assert.equal(purchased.economy.coins,buyerBefore.coins-price);
  assert.equal(purchased.economy.estateListing,null);
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
  check('Native portrait and landscape canvas controls fit the viewport');
  check('The world and HUD use at least 2× logical resolution through movement and resize');
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
  await writeFile(path.join(output,'result.json'),JSON.stringify(results,null,2)+'\n');
  await context.close();
}
