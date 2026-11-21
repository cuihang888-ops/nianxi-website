import {createAnimals} from './animals.js';
import {houseAnchor,houseChoices,primaryHouses,heritageHouses} from './houses.js';
import {people} from './person.js';
import {bounds,createCourtyard,houseSite} from './yard.js';
import {fieldTerrainBlock,onAvenue,pondBlocks} from './woodland.js';
import {createYardView} from './view3d.js';
import {createLivestock,crops,cropStage,livestockLimit,livestockPosition,livestockTypes,loanHorse,plotPrice,plotResale,plotSize,stableBlocks} from './livestock.js';
import {openSegment,routeThroughYard} from './yard-navigation.js';
import {createFishing,fishCatalog} from './fishing.js';
import {cropFertilizer,fishMarket} from './economy-config.js';
import {createYardClock,gameDayMilliseconds} from './yard-clock.js';
import {marketCenter,inMarket} from './ruili-street.js';

const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const yardArrival={x:-2.95,z:3.4};
const directions=new Map([
  ['arrowup',[0,-1]],['w',[0,-1]],['arrowdown',[0,1]],['s',[0,1]],
  ['arrowleft',[-1,0]],['a',[-1,0]],['arrowright',[1,0]],['d',[1,0]],
]);

export function createYardApp({document,canvas,createCanvas:makeCanvas,createOption,storage,survival=false,pixelRatio,renderCards=true,overlay}) {
  const message=document.getElementById('message');
  const locationLabel=document.getElementById('avenue-location');
  const courtyard=createCourtyard(makeCanvas,{survival});
  const garden=courtyard.describe();
  const animals=createAnimals(makeCanvas);
  const livestock=createLivestock(storage,{survival,cityMarket:true,clock:()=>Date.now()});
  livestock.settle();
  const player={...yardArrival,facing:'s',heading:.40,walking:false,avatar:people[0].id,mountedId:null};
  const view=createYardView(canvas,{garden,houseSite,animalIds:animals.describe().map(sheep=>sheep.id),createCanvas:makeCanvas,survival,pixelRatio,overlay});
  const houseById=new Map(houseChoices.map(choice=>[choice.id,choice]));
  let house=houseById.get(livestock.homeId)??null;
  let quotedHouse=house??houseById.get('simple_shed'), surveying=false, selectedSpot=null, selectedPlotId=null;
  let sceneHouse=null,site=houseSite,houseVolumes=[],destination=null,animalTarget=null,gesture=null;
  let visibleProjectId=null;
  let renderedOwnPlots,renderedOtherPlots,scenePlots=[];
  let time=0,last=0,wateredIndex=-1,wateredAt=null,nextFarmUpdate=0;
  const keys=new Set();
  let movementX=0,movementY=0;
  const gate={x:3.75,z:4.6};
  const inside={x:4.95,z:4.6};
  let animalRoute=null;
  let horseRoute=null;
  let publicRoute=null,openMarket=false,confirmEstate=false;
  const clock=createYardClock();
  const fishing=createFishing();
  const shore=[
    {x:-12.1,z:.95,bobber:{x:-12.55,z:-2.95}},
    {x:-19.4,z:-.1,bobber:{x:-18.69,z:-3.48}},
  ];
  let fishingRoute=null, fishingSpot=null;
  const parkedHorses=new Map();
  const rideButton=document.querySelector('[data-action=mount]');
  const horseSpeed=8.1;
  const frameTime={sum:0,count:0,peak:0,lastAverage:0,lastPeak:0};

  function blocked(x,z) {
    return x<bounds.minX||x>bounds.maxX||z<bounds.minZ||z>bounds.maxZ
      ||pondBlocks(x,z)||stableBlocks(x,z)||courtyard.blocked(x,z,sceneHouse,site,houseVolumes);
  }
  function water() {
    const plot=nearbyPlot();
    if(plot){
      changeFarm(()=>livestock.waterPlot(plot.id));
      return;
    }
    const plant=courtyard.water(player,time);
    message.textContent=plant?'给'+plant+'浇了水。':survival?'选中一块已播种的田地，再给它浇水。':'走近菜地，再给它浇水。';
    if(plant){
      wateredIndex=garden.findIndex(bed=>bed.label===plant);
      wateredAt=time;
    }
  }
  function pet(id) {
    const result=animals.interact(player,time,id);
    message.textContent=result?result.message+'。':'走进羊圈，靠近小羊就能摸摸它。';
    return result;
  }
  function nearPen(){
    return (player.x>=2.7&&player.x<=12.1&&player.z>=.7&&player.z<=8.5)||
      (player.x>=11.75&&player.x<=18.5&&player.z>=1.1&&player.z<=9.5);
  }
  function nearbyPlot(){
    let found=null,best=1.7;
    for(const plot of livestock.plots){
      const margin=Math.hypot(Math.max(0,Math.abs(player.x-plot.x)-plotSize/2),
        Math.max(0,Math.abs(player.z-plot.z)-plotSize/2));
      if(margin<best){found=plot;best=margin;}
    }
    return found;
  }
  function nearbyShore(){
    return shore.reduce((best,spot)=>distance(player,spot)<distance(player,best)?spot:best);
  }
  function clearPath() {
    destination=null;
    animalTarget=null;
    animalRoute=null;
    horseRoute=null;
    fishingRoute=null;
    publicRoute=null;
  }
  function leaveFishing() {
    fishing.cancel();
    fishingSpot=null;
    fishingRoute=null;
  }

  function stockAt() {
    return [{...loanHorse,heading:-.73,moving:false},
      ...livestock.otherAnimals.map(animal=>({
        ...animal,...livestockPosition(animal,time),id:'estate-'+animal.id,moving:true,visiting:true,
      })),
      ...livestock.animals.map(animal=>({...animal,...livestockPosition(animal,time),moving:true}))].map(record=>{
      const parked=parkedHorses.get(record.id);
      if(record.id===player.mountedId)return {...record,x:player.x,z:player.z,heading:player.heading,moving:player.walking};
      return parked?{...record,...parked,moving:false}:record;
    });
  }

  function mount(horse) {
    clearPath();
    player.mountedId=horse.id;
    player.x=horse.x;
    player.z=horse.z;
    player.heading=horse.heading;
    player.walking=false;
    updateMarket();
    message.textContent='已上马。用摇杆或点地面，沿瑞丽大道小跑。';
  }

  function ride(horseId) {
    leaveFishing();
    if(player.mountedId!==null){
      parkedHorses.set(player.mountedId,{x:player.x,z:player.z,heading:player.heading});
      player.mountedId=null;
      player.walking=false;
      clearPath();
      updateMarket();
      message.textContent='已下马。马在身边等你。';
      return;
    }
    const horses=stockAt().filter(record=>record.species==='horse'&&!record.visiting);
    const horse=horses.find(record=>record.id===horseId) ??
      horses.find(record=>distance(record,player)<2&&openSegment(player,record,blocked))??horses[0];
    if(distance(horse,player)<2&&openSegment(player,horse,blocked)){
      mount(horse);
      return;
    }
    clearPath();
    const waypoints=routeThroughYard(player,horse,bounds,blocked);
    if(!waypoints.length){
      message.textContent='先到围场入口，再走向马匹。';
      return;
    }
    horseRoute={id:horse.id,waypoints};
    message.textContent='正在走向马匹。';
  }

  const market=document.getElementById('livestock-market');
  const storefront=document.getElementById('city-market');
  const inventory=document.getElementById('livestock-inventory');
  const marketRows=new Map();
  for(const [species,type] of Object.entries(livestockTypes)){
    const row=document.createElement('div');
    row.className='livestock-row';
    row.dataset.livestock=species;
    const title=document.createElement('strong');
    const subtitle=document.createElement('small');
    const actions=document.createElement('div');
    actions.className='livestock-actions';
    row.append(title,subtitle,actions);
    const button=(action,label,callback)=>{
      const control=document.createElement('button');
      control.className='quiet';
      control.dataset[action]=species;
      control.textContent=label;
      control.addEventListener('click',()=>{
        message.textContent=callback();
        document.getElementById('livestock-result').textContent=message.textContent;
        updateMarket();
      });
      actions.append(control);
      return control;
    };
    const buy=button('livestockBuy','买入 '+type.price,()=>livestockTrade(()=>livestock.buy(species)));
    const sell=button('livestockSell','卖出 '+type.resale,()=>livestockTrade(()=>livestock.sell(species,player.mountedId)));
    const feed=type.product?button('livestockFeed','买饲料 '+type.feedPrice,()=>marketTrade(()=>livestock.buyFeed(species))):null;
    const care=type.product?button('livestockCare','喂养 / 收取',()=>nearPen()?livestock.care(species):'请到羊圈附近照料牲畜。'):null;
    inventory.append(row);
    marketRows.set(species,{type,title,subtitle,buy,sell,feed,care});
  }
  function trading(){return openMarket&&inMarket(player.x,player.z);}
  function marketTrade(run){return trading()?run():'到瑞丽集市即可交易。';}
  function livestockTrade(run){return trading()||nearPen()?run():'到羊圈或瑞丽集市即可交易牲畜。';}

  function updateMarket() {
    document.getElementById('livestock-balance').textContent=livestock.coins+' 安币';
    document.getElementById('livestock-capacity').textContent='自有牲畜 '+livestock.animals.length+' 只 · 围场空位 '+livestock.animalSlotsAvailable+' / '+livestockLimit;
    document.getElementById('livestock-storage').hidden=!livestock.temporary;
    refreshFarm();
    rideButton.textContent=player.mountedId!==null?'下马':'骑马';
    rideButton.setAttribute('aria-pressed',String(player.mountedId!==null));
    updateLivestockContext();
    updateStorefront();
  }
  function updateLivestockContext(){
    const atPen=nearPen(),canTrade=atPen||trading();
    for(const [species,row] of marketRows){
      const owned=livestock.animals.filter(animal=>animal.species===species);
      row.title.textContent=row.type.name+' · '+owned.length+' 只';
      row.subtitle.textContent=row.type.product
        ? '饲料 '+(livestock.feed[species]??0)+' 份 · '+row.type.seconds+' 秒后收'+row.type.product+' · 每份 '+row.type.value+' 安币'
        : '沿大道骑行时比步行快，可向集市转卖。';
      row.buy.hidden=row.sell.hidden=!canTrade;
      row.buy.disabled=!canTrade||livestock.coins<row.type.price||livestock.animalSlotsAvailable<=0;
      row.sell.disabled=!canTrade||!owned.some(animal=>animal.id!==player.mountedId);
      if(row.feed){
        row.feed.hidden=!trading();
        row.feed.disabled=!trading()||livestock.coins<row.type.feedPrice;
      }
      if(row.care){
        row.care.hidden=!atPen||!owned.length;
        row.care.disabled=!atPen||!owned.length;
      }
    }
    const goods=Object.entries(livestock.goods).filter(([,count])=>count>0);
    get('goods-basket').textContent=goods.map(([id,count])=>livestockTypes[id].product+' × '+count).join(' · ')||'还没有养殖产物';
    action('sell-goods').hidden=!trading();
    action('sell-goods').disabled=!trading()||!goods.length;
  }
  const get=id=>document.getElementById(id);
  const actions=new Map([...document.querySelectorAll('[data-action]')].map(button=>[button.dataset.action,button]));
  const action=id=>actions.get(id);
  const plotPicker=get('plot-picker'),cropPicker=get('crop-picker');
  const plotStatus=get('farm-plot-state');
  get('fish-catalog').textContent=Object.values(fishCatalog).map(fish=>fish.name+' '+fish.value+' 安币').join(' · ');
  get('fish-market-rules').textContent='每轮前 '+fishMarket.fullPriceCount+' 条按原价收购，其余按 '+Math.round(fishMarket.surplusRate*100)+'% 收购，向下取整。每 '+gameDayMilliseconds/60_000+' 分钟开启新一轮。';
  let shownPlots=null;
  const plotLabels={empty:'空田',dry:'待浇水',growing:'生长中',ready:'可收获'};
  for(const [id,crop] of Object.entries(crops))cropPicker.add(createOption(crop.name,id));
  function updateStorefront(){
    const near=inMarket(player.x,player.z);
    const destination=action('market');
    const goingToMarket=publicRoute?.target===marketCenter;
    destination.textContent=goingToMarket?'取消前往':openMarket?'离开集市':near?'逛集市':'去集市';
    const homeRoute=action('home-route');
    homeRoute.hidden=player.x<=18&&publicRoute?.target!==yardArrival;
    homeRoute.textContent=publicRoute?.target===yardArrival?'取消返回':'回小院';
    storefront.open=openMarket;
    get('market-status').textContent=goingToMarket?'沿瑞丽大道前往集市。':openMarket?'瑞丽集市 · 买卖、宅院和城主账本':near?'已到瑞丽集市。':'可在瑞丽集市买种子、饲料和房产，出售收成。';
    const owner=livestock.residentId==='resident';
    get('player-role').textContent=owner?'当前角色 · 你的居民':'当前角色 · 本机试买者';
    get('city-balance').hidden=!owner;
    get('city-balance').textContent='城主收入 '+livestock.cityRevenue+' 安币';
    get('city-receipts').textContent=owner&&livestock.cityReceipts.length
      ?'宅院成交 '+livestock.cityReceipts.length+' 笔 · 最近到账 '+livestock.cityReceipts.at(-1).amount+' 安币':'';
    action('switch-player').hidden=!trading();
    action('switch-player').textContent=owner?'切换本机试买角色':'返回你的居民';
  }
  function refreshFarm(now=Date.now()){
    const status=livestock.coins+' 安币 · 体力 '+livestock.energy+'/100';
    if(get('farm-status').textContent!==status)get('farm-status').textContent=status;
    if(shownPlots!==livestock.plots){
      plotPicker.replaceChildren(...(livestock.plots.length?livestock.plots.map(plot=>
        createOption('第 '+plot.id+' 块田'+(plot.crop?' · '+crops[plot.crop].name:''),plot.id)):
        [createOption('还没有田地','')]));
      plotPicker.value=selectedPlotId??'';
      shownPlots=livestock.plots;
    }
    const plot=nearbyPlot();
    const stage=cropStage(plot,now);
    const growth=plot?.crop?crops[plot.crop].seconds*(plot.fertilized?cropFertilizer.growthTimeMultiplier:1):0;
    const seconds=stage==='growing'?Math.ceil((plot.wateredAt+growth*1000-now)/1000):0;
    const text=surveying
      ?selectedSpot?.reason||(selectedSpot?'这块空地可以购买。':'点地图上的空地查看。')
      :selectedSpot?.valid?'已选空地，可到集市确认购买。'
        :plot?plotLabels[stage]+(seconds?' · 约 '+seconds+' 秒成熟':''):'先在地图上选地，再到集市买地。';
    if(plotStatus.textContent!==text)plotStatus.textContent=text;
    action('buy-plot').disabled=!trading()||!selectedSpot?.valid||livestock.coins<plotPrice;
    action('buy-plot').hidden=!trading()||!selectedSpot?.valid;
    action('buy-seed').hidden=!trading();
    action('sow').hidden=trading()||surveying||!plot||stage!=='empty';
    action('sow').disabled=!livestock.seeds[cropPicker.value]||livestock.energy<4;
    action('irrigate').hidden=trading()||surveying||stage!=='dry';
    action('irrigate').disabled=livestock.energy<2;
    action('fertilize').hidden=trading()||surveying||stage!=='growing'||plot.fertilized;
    action('fertilize').disabled=livestock.energy<cropFertilizer.energy;
    action('harvest').hidden=trading()||surveying||stage!=='ready';
    action('harvest').disabled=false;
    const selected=livestock.plots.find(item=>item.id===selectedPlotId);
    action('sell-plot').hidden=!trading()||!selected||selected.crop!==null;
    action('market-help').hidden=livestock.marketHelpAmount===0;
    const inventory=Object.keys(crops).filter(id=>livestock.crops[id]>0).map(id=>crops[id].product+' × '+livestock.crops[id]);
    get('farm-inventory').textContent=inventory.length?inventory.join(' · '):'背篓是空的';
    action('sell-crops').hidden=!trading();
    action('sell-crops').disabled=!trading()||!inventory.length;
    const crop=crops[cropPicker.value];
    action('buy-seed').textContent='买种子 '+crop.price+' 安币';
    action('buy-seed').disabled=!trading()||livestock.coins<crop.price;
    get('crop-price').textContent='种子 '+(livestock.seeds[cropPicker.value]??0)+' 份 · 浇水后 '+crop.seconds+' 秒 · 收成值 '+crop.value*crop.yield+' 安币';
    showHousePrice(now);
  }

  const overlaps=(first,x,z,width,depth)=>
    Math.abs(first.x-x)<(plotSize+width)/2 && Math.abs(first.z-z)<(plotSize+depth)/2;

  function landReason(spot){
    if(livestock.otherPlots.some(plot=>overlaps(plot,spot.x,spot.z,plotSize,plotSize)))return '这块地已有归属。';
    if(livestock.plots.some(plot=>overlaps(plot,spot.x,spot.z,plotSize,plotSize)))return '这块地和已有田地重叠了。';
    const half=plotSize/2;
    if(spot.x-half<bounds.minX||spot.x+half>bounds.maxX||spot.z-half<bounds.minZ||spot.z+half>bounds.maxZ)
      return '田地要完整留在地图里。';
    if(sceneHouse&&overlaps(spot,site.x,site.z,sceneHouse.width+.34,sceneHouse.depth+.34))return '这块地和住宅重叠。';
    if(survival){
      const starter=houseById.get('simple_shed');
      const anchor=houseAnchor(starter,houseSite);
      if(overlaps(spot,anchor.x,anchor.z,starter.width+.34,starter.depth+.34))return '这块地是预留宅地。';
    }
    const pending=houseById.get((livestock.construction??livestock.cityEstate?.construction)?.id);
    if(pending){
      const anchor=houseAnchor(pending,houseSite);
      if(overlaps(spot,anchor.x,anchor.z,pending.width+.34,pending.depth+.34))return '这块地在住宅施工范围里。';
    }
    if(overlaps(spot,7.95,4.6,7.7,6.45)||overlaps(spot,15.08,5.05,5.65,6.5))return '这块地在围场里。';
    for(let row=0;row<=8;row++){
      for(let column=0;column<=8;column++){
        const x=spot.x-half+column*plotSize/8,z=spot.z-half+row*plotSize/8;
        const reason=fieldTerrainBlock(x,z);
        if(reason)return reason;
        if(blocked(x,z))return '这块地上已有设施。';
      }
    }
    return '';
  }

  function feedback(text){
    message.textContent=text;
    get('farm-feedback').textContent=text;
  }

  function survey(enabled){
    leaveFishing();
    surveying=enabled;
    selectedSpot=null;
    clearPath();
    view.setSurvey(enabled);
    view.fields.clearSelection();
    action('land').setAttribute('aria-pressed',String(enabled));
    action('land').textContent=enabled?'结束选地':'选地';
    refreshFarm();
  }

  function selectPlot(id){
    selectedPlotId=id;
    if(id!==null)plotPicker.value=String(id);
    const plot=livestock.plots.find(plot=>plot.id===id);
    if(plot)view.fields.select(plot,true);
    else view.fields.clearSelection();
    refreshFarm();
  }
  function changeFarm(run){
    feedback(run());
    updateMarket();
  }
  action('land').addEventListener('click',()=>{
    survey(!surveying);
    feedback(surveying?'点地面选一块空地，绿色边框表示可买。':'点自己的田地可以查看作物。');
  });
  action('buy-plot').textContent='买地 '+plotPrice+' 安币';
  action('buy-plot').addEventListener('click',()=>{
    if(!trading()||!selectedSpot?.valid)return;
    const before=livestock.plots.length;
    const result=livestock.buyPlot(selectedSpot,landReason);
    if(livestock.plots.length>before){
      survey(false);
      selectPlot(livestock.plots.at(-1).id);
    }
    feedback(result);
    updateMarket();
  });
  plotPicker.addEventListener('change',()=>selectPlot(Number(plotPicker.value)||null));
  cropPicker.addEventListener('change',()=>refreshFarm());
  function workPlot(run){
    const plot=nearbyPlot();
    if(plot)changeFarm(()=>run(plot.id));
  }
  action('sow').addEventListener('click',()=>workPlot(id=>livestock.plant(id,cropPicker.value)));
  action('irrigate').addEventListener('click',()=>workPlot(livestock.waterPlot));
  action('fertilize').addEventListener('click',()=>workPlot(livestock.fertilizePlot));
  action('harvest').addEventListener('click',()=>workPlot(livestock.harvest));
  action('buy-seed').addEventListener('click',()=>changeFarm(()=>marketTrade(()=>livestock.buySeed(cropPicker.value))));
  action('sell-crops').addEventListener('click',()=>changeFarm(()=>marketTrade(()=>livestock.sellCrops())));
  action('sell-goods').addEventListener('click',()=>changeFarm(()=>marketTrade(()=>livestock.sellGoods())));
  action('sell-plot').textContent='退空田 '+plotResale+' 安币';
  action('sell-plot').addEventListener('click',()=>{
    if(!trading())return;
    const before=livestock.plots.length;
    const result=livestock.sellPlot(selectedPlotId);
    if(livestock.plots.length<before)selectPlot(livestock.plots[0]?.id??null);
    feedback(result);
    updateMarket();
  });
  action('eat').addEventListener('click',()=>changeFarm(()=>livestock.eat()));
  action('market-help').addEventListener('click',()=>changeFarm(()=>livestock.marketHelp()));
  function fishState(now){
    return {...fishing.snapshot(now),...(fishingRoute?{phase:'approach'}:{}),spot:fishingSpot};
  }
  function updateFishingControls(now,day){
    const {phase}=fishState(now);
    const atLake=distance(player,nearbyShore())<2.3;
    const text={idle:'抛竿',approach:'走到岸边',waiting:'等待鱼咬钩',bite:'鱼上钩了'}[phase];
    if(action('fishing').textContent!==text)action('fishing').textContent=text;
    action('fishing').hidden=trading()||surveying||!atLake||phase==='bite';
    action('fishing').disabled=phase!=='idle'||livestock.fishBasket.full;
    action('reel').hidden=phase!=='bite';
    action('reel').disabled=phase!=='bite';
    const period=String(Math.floor(day.hour)).padStart(2,'0')+':'+String(Math.floor(day.hour%1*60)).padStart(2,'0');
    action('season').textContent=day.seasonName;
    action('time-of-day').textContent=day.period+' '+period;
    const basket=Object.keys(fishCatalog).filter(id=>livestock.fish[id]>0).map(id=>fishCatalog[id].name+' × '+livestock.fish[id]);
    get('fish-basket').textContent=basket.join(' · ')||'还没有鱼获';
    const quote=livestock.fishQuote(undefined,now);
    const sale=action('sell-fish');
    const caption=quote?.count?'卖出鱼获 · '+quote.value+' 安币':'卖出鱼获';
    if(sale.textContent!==caption)sale.textContent=caption;
    sale.hidden=!trading();
    sale.disabled=!trading()||!quote?.count;
    const demand=quote?.count
      ?'本次原价 '+quote.fullPriceCount+' 条 · 折价 '+quote.surplusCount+' 条'
      :quote?'本轮还可原价出售 '+quote.allowance+' 条':'';
    if(get('fish-quote').textContent!==demand)get('fish-quote').textContent=demand;
  }
  function fishFeedback(text){
    message.textContent=text;
    get('fish-feedback').textContent=text;
  }
  function castLine(spot,now){
    clearPath();
    fishingSpot=spot;
    player.heading=Math.atan2(spot.bobber.x-player.x,spot.bobber.z-player.z);
    const day=clock.read(now);
    if(fishing.cast(now,day.season,day.hour))fishFeedback('鱼漂落水了，等它动一动。');
    updateFishingControls(now,day);
  }
  action('fishing').addEventListener('click',()=>{
    const now=Date.now();
    if(fishState(now).phase!=='idle'||distance(player,nearbyShore())>=2.3)return;
    if(livestock.fishBasket.full){fishFeedback('鱼篓已满，可以去集市卖鱼。');return;}
    if(surveying)survey(false);
    if(player.mountedId!==null)ride();
    clearPath();
    const spot=nearbyShore();
    if(distance(player,spot)<.54){castLine(spot,now);return;}
    const waypoints=routeThroughYard(player,spot,bounds,blocked);
    if(!waypoints.length){fishFeedback('走到湖岸的小路上，就能抛竿。');return;}
    fishingRoute={spot,waypoints};
    fishFeedback('沿碎石路去湖边。');
    updateFishingControls(now,clock.read(now));
  });
  action('reel').addEventListener('click',()=>{
    const id=fishing.reel(Date.now());
    if(id)fishFeedback(livestock.catchFish(id));
    updateMarket();
    const now=Date.now();
    updateFishingControls(now,clock.read(now));
    updateContext(now);
  });
  action('sell-fish').addEventListener('click',()=>{
    const now=Date.now();
    fishFeedback(marketTrade(()=>livestock.sellFish(undefined,now)));
    updateMarket();
    updateFishingControls(now,clock.read(now));
  });
  action('season').addEventListener('click',()=>clock.nextSeason());
  action('time-of-day').addEventListener('click',()=>clock.nextPeriod(Date.now()));

  function setMarket(open){
    openMarket=open;
    confirmEstate=false;
    if(open){
      storefront.scrollIntoView({block:'nearest'});
      message.textContent='到了瑞丽集市。';
    }
    updateMarket();
    const now=Date.now();
    updateFishingControls(now,clock.read(now));
  }
  storefront.addEventListener('toggle',()=>{
    if(storefront.open===openMarket)return;
    if(inMarket(player.x,player.z))setMarket(storefront.open);
    else storefront.open=false;
  });
  function goToPublicPlace(target){
    if(publicRoute?.target===target){clearPath();updateStorefront();return;}
    if(surveying){
      surveying=false;
      view.setSurvey(false);
      view.fields.clearSelection();
      action('land').textContent='选地';
      action('land').setAttribute('aria-pressed','false');
    }
    leaveFishing();
    clearPath();
    const waypoints=routeThroughYard(player,target,bounds,blocked);
    if(!waypoints.length){message.textContent='请先走到瑞丽大道上。';return;}
    publicRoute={target,waypoints};
    message.textContent=target===marketCenter?'沿瑞丽大道前往集市。':'沿瑞丽大道回小院。';
    updateStorefront();
  }
  action('market').addEventListener('click',()=>{
    if(openMarket){setMarket(false);return;}
    if(inMarket(player.x,player.z)){setMarket(true);return;}
    goToPublicPlace(marketCenter);
  });
  action('home-route').addEventListener('click',()=>{
    if(openMarket)setMarket(false);
    goToPublicPlace(yardArrival);
  });
  action('lake-route').addEventListener('click',()=>{
    if(openMarket)setMarket(false);
    goToPublicPlace(nearbyShore());
  });
  action('pen-route').addEventListener('click',()=>{
    if(openMarket)setMarket(false);
    goToPublicPlace(gate);
  });

  function updateContext(now){
    const active=!trading()&&!surveying;
    const atLake=active&&distance(player,nearbyShore())<2.3;
    const plot=active?nearbyPlot():null;
    const atPen=active&&nearPen();
    const reachableHorse=active&&stockAt().some(record=>record.species==='horse'&&!record.visiting&&
      distance(player,record)<2.3&&openSegment(player,record,blocked));
    const status=get('yard-context');
    const kind=atLake?'lake':plot?'field':atPen?'pen':reachableHorse||player.mountedId!==null?'horse':'';
    const {count,capacity,full}=livestock.fishBasket;
    const stage=cropStage(plot,now);
    const description={
      lake:'湖边 · 鱼篓 '+count+'/'+capacity+(full?' · 可到集市卖鱼':''),
      field:plot?'田地 '+plot.id+' · '+plotLabels[stage]:'',
      pen:'羊圈 · 轻点小羊互动',
      horse:player.mountedId!==null?'骑行中':'马匹在附近',
    }[kind]??'';
    if(status.textContent!==description)status.textContent=description;
    if(status.dataset.kind!==kind){status.dataset.kind=kind;status.value=kind;}
    status.hidden=!kind;
    action('interact').hidden=!atPen;
    action('livestock').hidden=!atPen;
    action('mount').hidden=!reachableHorse&&player.mountedId===null;
    if(!atPen&&!trading())market.open=false;
    if(lastPen!==atPen){
      lastPen=atPen;
      updateLivestockContext();
    }
    get('market-tools').hidden=!trading();
    get('field-options').hidden=!trading()&&(!plot||stage!=='empty');
    market.hidden=!atPen&&!trading();
    if(trading())market.open=true;
    get('local-actions').hidden=['interact','livestock','mount','fishing','reel','sow','irrigate','fertilize','harvest'].every(id=>action(id).hidden);
  }
  let lastPen;

  function move(dt) {
    const yaw=view.getCamera().yaw;
    const c=Math.cos(yaw),s=Math.sin(yaw);
    let vx=movementX,vy=movementY;
    for(const key of keys){
      const [dx,dy]=directions.get(key);
      vx+=dx;
      vy+=dy;
    }
    if(vx||vy){
      leaveFishing();
      clearPath();
    }
    if(publicRoute){
      const {target,waypoints}=publicRoute;
      if(distance(player,target)<.38){
        clearPath();
        if(target===marketCenter)setMarket(true);
        if(target===yardArrival)message.textContent='回到湖边小院了。';
      }else{
        if(waypoints.length>1&&distance(player,waypoints[0])<.14&&
          openSegment(player,waypoints[1],blocked))waypoints.shift();
        destination=waypoints[0]??target;
      }
    }
    if(fishingRoute){
      const {spot,waypoints}=fishingRoute;
      if(distance(player,spot)<.30)castLine(spot,Date.now());
      else {
        if(waypoints.length&&distance(player,waypoints[0])<.14)waypoints.shift();
        destination=waypoints[0]??spot;
      }
    }
    if(horseRoute){
      const horse=stockAt().find(record=>record.id===horseRoute.id&&!record.visiting);
      if(!horse){
        clearPath();
      }else if(distance(player,horse)<1.30&&openSegment(player,horse,blocked)){
        mount(horse);
      }else{
        const waypoints=horseRoute.waypoints;
        if(waypoints.length&&distance(player,waypoints[0])<.16) waypoints.shift();
        destination=waypoints[0]??horse;
      }
    }
    if(animalTarget){
      const sheep=animals.describe().find(animal=>animal.id===animalTarget);
      if(distance(player,sheep)<2.18&&player.x>4.52){
        pet(animalTarget);
        clearPath();
      }else{
        if(animalRoute?.length&&distance(player,animalRoute[0])<.17) animalRoute.shift();
        destination=animalRoute?.[0]??sheep;
      }
    }

    let dx=vx*c+vy*s,dz=vy*c-vx*s;
    if(destination){
      dx=destination.x-player.x;
      dz=destination.z-player.z;
      if(Math.hypot(dx,dz)<.115&&!animalTarget&&!horseRoute&&!fishingRoute&&!publicRoute){
        clearPath();
        dx=0;
        dz=0;
      }
    }
    const length=Math.hypot(dx,dz);
    const oldX=player.x,oldZ=player.z;
    if(length>0){
      const speed=player.mountedId===null?4.45:horseSpeed;
      const strength=destination?1:Math.min(1,Math.hypot(vx,vy));
      const step=Math.min(dt*speed*strength,destination?length:Infinity);
      const steps=Math.max(1,Math.ceil(step/.19));
      for(let index=0;index<steps;index++){
        const x=player.x+dx/length*step/steps,z=player.z+dz/length*step/steps;
        if(!blocked(x,z)){
          player.x=x;
          player.z=z;
        }else{
          if(!blocked(x,player.z))player.x=x;
          if(!blocked(player.x,z))player.z=z;
        }
      }
    }

    const movedX=player.x-oldX,movedZ=player.z-oldZ;
    player.walking=Math.hypot(movedX,movedZ)>.0001;
    if(player.walking){
      player.heading=Math.atan2(movedX,movedZ);
      const screenX=movedX*c-movedZ*s,screenY=movedX*s+movedZ*c;
      player.facing=Math.abs(screenX)>Math.abs(screenY)?(screenX>0?'e':'w'):(screenY>0?'s':'n');
    }else if(dt>0&&destination){
      clearPath();
      message.textContent='沿小路绕过围栏和墙。';
    }
  }

  function draw(dt) {
    animals.update(time);
    move(dt);
    const nearMarket=inMarket(player.x,player.z);
    if(openMarket&&!nearMarket)setMarket(false);
    locationLabel.textContent=nearMarket?'瑞丽集市':'瑞丽大道';
    locationLabel.hidden=!onAvenue(player.x,player.z)&&!nearMarket;
    const now=Date.now();
    const day=clock.read(now);
    const cast=fishState(now);
    if(now>=nextFarmUpdate){
      const completed=livestock.settle(now);
      setHouse(houseById.get(livestock.homeId)??null);
      if(completed){
        updateMarket();
        feedback(houseById.get(completed).name+'已完工。');
      }
      syncConstruction();
      view.setEstateVacant?.(Boolean(livestock.estateListing));
      updateStorefront();
      refreshFarm(now);
      updateFishingControls(now,day);
      updateContext(now);
      nextFarmUpdate=now+260;
    }
    const otherPlots=livestock.otherPlots;
    if(renderedOwnPlots!==livestock.plots||renderedOtherPlots!==otherPlots){
      renderedOwnPlots=livestock.plots;
      renderedOtherPlots=otherPlots;
      scenePlots=otherPlots.length?[...renderedOwnPlots,...otherPlots]:renderedOwnPlots;
    }
    view.frame(player,animals.describe(),stockAt(),time,wateredIndex,wateredAt,dt,scenePlots,now,day,cast);
  }

  function step(now) {
    const interval=last?now-last:16;
    const dt=Math.min(.085,interval/1000);
    time+=dt;
    draw(dt);
    if(interval<250){
      frameTime.sum+=interval;
      frameTime.count++;
      frameTime.peak=Math.max(frameTime.peak,interval);
      if(frameTime.count===90){
        frameTime.lastAverage=frameTime.sum/frameTime.count;
        frameTime.lastPeak=frameTime.peak;
        frameTime.sum=frameTime.count=frameTime.peak=0;
      }
    }
    last=now;
  }

  function addChoice(container,type,id,name,renderCard,activate,caption) {
    const button=document.createElement('button');
    button.className=type==='house'?'choice':'avatar';
    button.dataset[type]=id;
    button.setAttribute('aria-pressed','false');
    if(renderCards){
      const card=makeCanvas();
      card.className=type==='house'?'thumb':'portrait';
      card.width=type==='house'?136:100;
      card.height=type==='house'?91:100;
      card.setAttribute('aria-hidden','true');
      renderCard(card,id);
      button.append(card);
    }
    const label=document.createElement('span');
    if(caption){
      const title=document.createElement('strong');
      const detail=document.createElement('small');
      title.textContent=name;
      detail.textContent=caption;
      label.append(title,detail);
    }else label.textContent=name;
    button.append(label);
    button.addEventListener('click',activate);
    container.append(button);
  }

  function select(type,id) {
    for(const button of document.querySelectorAll('[data-'+type+']')){
      button.setAttribute('aria-pressed',String(button.dataset[type]===id));
    }
  }
  function showProduct(choice) {
    const product=choice.product;
    document.getElementById('product-name').textContent=choice.role?choice.role+' · '+choice.name:choice.name;
    document.getElementById('product-floor-plan').textContent=product?.floorPlan??'';
    document.getElementById('product-silhouette').textContent=product?.silhouette??'';
    document.getElementById('product-experience').textContent=product?.experience??'';
    document.getElementById('product-expansion').textContent=product?.expansion??'';
    const tier=document.getElementById('product-tier');
    tier.hidden=!product;
    tier.textContent=product?'方案级别 · '+product.paidTier:'';
    get('product-details').hidden=!product;
    showHousePrice();
  }

  function showHousePrice(now=Date.now()) {
    const upgrade=action('house-upgrade');
    const sell=action('house-sell');
    const repair=action('house-repair');
    const buyUsed=action('buy-used-house');
    const cancel=action('house-cancel-sale');
    const isCurrent=quotedHouse===house;
    const quote=livestock.houseQuote(quotedHouse.id,now);
    const construction=livestock.construction;
    const remaining=construction?Math.max(0,Math.ceil((construction.readyAt-now)/1000)):0;
    const progress=construction?houseById.get(construction.id).name+'施工中 · '+remaining+' 秒'
      : house?'当前入住 · '+house.name:'尚未建造住宅';
    const progressLabel=get('house-progress');
    if(progressLabel.textContent!==progress)progressLabel.textContent=progress;
    let text;
    if(quote.owned){
      text=(isCurrent?'当前住宅':'已拥有')+' · 屋况 '+quote.condition+'%';
      if(quote.saleValue)text+=' · 集市估价 '+quote.saleValue+' 安币';
    }else{
      text='建造 '+quote.price+' 安币 · 工期 '+quote.seconds+' 秒';
      if(quote.structureCredit)text+=' · 已抵扣旧屋 '+quote.structureCredit+' 安币';
      if(quote.landPrice)text+=' · 首次购宅地 '+quote.landPrice+' 安币 · 合计 '+quote.total+' 安币';
      if(quote.usedPrice)text+=' · 现房屋况 '+quote.usedCondition+'%';
    }
    const priceLabel=get('house-price');
    if(quote.upgradeBlocked&&!isCurrent)text=quote.upgradeBlocked;
    if(priceLabel.textContent!==text)priceLabel.textContent=text;
    upgrade.hidden=!trading()||isCurrent||Boolean(construction)||Boolean(quote.upgradeBlocked);
    upgrade.disabled=upgrade.hidden||livestock.coins<quote.total;
    upgrade.textContent=house?'开工升级':'开工建造';
    const estate=livestock.estateListing;
    sell.hidden=!trading()||!house||!livestock.houseQuote(house.id,now).canList;
    sell.disabled=sell.hidden;
    sell.textContent=confirmEstate?'确认挂牌整院':'挂牌出售整院';
    cancel.hidden=!confirmEstate||sell.hidden;
    get('estate-confirm').hidden=cancel.hidden;
    const listing=confirmEstate?livestock.listingQuote(now):null;
    get('estate-confirm').textContent=listing
      ?'挂牌价 '+listing.price+' 安币 · 含宅地、'+listing.plotCount+' 块田及田里作物、'+listing.animalCount+' 只牲畜。成交款计入城主账本。':'';
    repair.hidden=!trading()||!isCurrent||!quote.repairCost;
    repair.disabled=livestock.coins<quote.repairCost;
    repair.textContent='维修 · '+quote.repairCost+' 安币';
    get('estate-summary').textContent=estate
      ?'闲置待售 · '+houseById.get(estate.homeId).name+' · '+estate.plots.length+' 块田 · '+estate.animals.length+' 只牲畜 · '+estate.price+' 安币'
      :livestock.cityEstate?.status==='occupied'?'宅院已有住户。':'集市暂无闲置宅院。';
    buyUsed.hidden=!trading()||!estate;
    buyUsed.disabled=buyUsed.hidden||!livestock.canBuyEstate||livestock.coins<estate?.price;
    buyUsed.textContent=estate?'买下宅院 · '+estate.price+' 安币':'购买闲置宅院';
  }

  function syncConstruction() {
    const id=(livestock.construction??livestock.cityEstate?.construction)?.id??null;
    if(id===visibleProjectId)return;
    visibleProjectId=id;
    const choice=houseById.get(id);
    view.setConstruction?.(choice?{site:houseAnchor(choice,houseSite),width:choice.width,depth:choice.depth}:null);
  }

  function setHouse(choice) {
    const ownerChanged=house!==choice;
    house=choice;
    const visible=choice??houseById.get(livestock.cityEstate?.homeId)??null;
    if(sceneHouse!==visible){
      sceneHouse=visible;
      site=visible?houseAnchor(visible,houseSite):houseSite;
      houseVolumes=view.setHouse(visible?.id??null,site);
      if(visible&&blocked(player.x,player.z)){
        leaveFishing();
        clearPath();
        player.x=site.x+visible.approach.x;
        player.z=site.z+visible.approach.z;
      }
    }
    if(!ownerChanged)return;
    quotedHouse=choice??quotedHouse;
    select('house',quotedHouse.id);
    showProduct(quotedHouse);
  }

  function quoteHouse(choice){
    confirmEstate=false;
    quotedHouse=choice;
    select('house',choice.id);
    showProduct(choice);
    if(quotedHouse!==house)action('house-upgrade').scrollIntoView({block:'nearest'});
  }

  function acquireHouse(acquire){
    if(!trading())return;
    const anchor=houseAnchor(quotedHouse,houseSite);
    if([...livestock.plots,...livestock.otherPlots].some(plot=>overlaps(plot,anchor.x,anchor.z,quotedHouse.width+.34,quotedHouse.depth+.34))){
      feedback('这间住宅的占地和已有田地重叠。');
      return;
    }
    const result=acquire(quotedHouse.id);
    setHouse(houseById.get(livestock.homeId)??null);
    syncConstruction();
    feedback(result);
    updateMarket();
  }
  action('house-upgrade').addEventListener('click',()=>acquireHouse(livestock.buyHome));
  action('buy-used-house').addEventListener('click',()=>{
    if(!trading()||!livestock.estateListing)return;
    feedback(livestock.buyEstate(livestock.estateListing.id));
    setHouse(houseById.get(livestock.homeId)??null);
    selectPlot(livestock.plots[0]?.id??null);
    updateMarket();
  });
  action('house-sell').addEventListener('click',()=>{
    if(!trading()||!house)return;
    if(!confirmEstate){confirmEstate=true;showHousePrice();return;}
    confirmEstate=false;
    if(player.mountedId!==null&&player.mountedId!==loanHorse.id)ride();
    const previousHorses=livestock.animals.filter(animal=>animal.species==='horse');
    const result=livestock.listEstate();
    if(livestock.estateListing)for(const horse of previousHorses)parkedHorses.delete(horse.id);
    setHouse(houseById.get(livestock.homeId)??null);
    selectPlot(livestock.plots[0]?.id??null);
    feedback(result);
    updateMarket();
  });
  action('house-cancel-sale').addEventListener('click',()=>{confirmEstate=false;showHousePrice();});
  action('house-repair').addEventListener('click',()=>{
    const result=marketTrade(()=>livestock.repairHome(quotedHouse.id));
    feedback(result);
    updateMarket();
  });
  action('switch-player').addEventListener('click',()=>{
    if(!trading())return;
    if(player.mountedId!==null)ride();
    leaveFishing();
    clearPath();
    survey(false);
    confirmEstate=false;
    const result=livestock.switchResident(livestock.residentId==='resident'?'buyer':'resident');
    setHouse(houseById.get(livestock.homeId)??null);
    selectPlot(livestock.plots[0]?.id??null);
    feedback(result);
    updateMarket();
  });
  const houseMenu=document.getElementById('houses');
  const heritageMenu=document.getElementById('heritage-houses');
  for(const choice of primaryHouses){
    addChoice(houseMenu,'house',choice.id,choice.role,view.houseCard,()=>quoteHouse(choice),choice.name);
  }
  for(const choice of heritageHouses){
    addChoice(heritageMenu,'house',choice.id,choice.name,view.houseCard,()=>quoteHouse(choice));
  }
  setHouse(house);
  syncConstruction();
  select('house',quotedHouse.id);
  showProduct(quotedHouse);
  selectPlot(livestock.plots[0]?.id??null);
  updateMarket();
  const avatarMenu=document.getElementById('avatars');
  for(const person of people){
    addChoice(avatarMenu,'avatar',person.id,person.name,view.portrait,()=>{
      player.avatar=person.id;
      select('avatar',person.id);
      message.textContent='已换成'+person.name+'。';
    });
  }
  select('avatar',player.avatar);

  function walkTo(event) {
    if(movementX||movementY)return;
    const box=canvas.getBoundingClientRect();
    const x=event.clientX-box.left,y=event.clientY-box.top;
    const target=view.pickGround(x,y);
    if(fishingSpot||fishingRoute)leaveFishing();
    if(surveying){
      if(!target)return;
      const spot={x:Math.round(target.x*2)/2,z:Math.round(target.z*2)/2};
      const reason=landReason(spot);
      selectedSpot={...spot,reason,valid:!reason};
      view.fields.select(spot,!reason);
      feedback(reason||'这块空地可以购买。');
      refreshFarm();
      return;
    }
    const horse=view.hitHorse(x,y);
    if(horse!==null&&player.mountedId===null&&stockAt().some(record=>record.id===horse&&!record.visiting)){
      ride(horse);
      return;
    }
    const hit=view.hitSheep(x,y,box.width);
    clearPath();
    if(hit){
      const inPen=player.x>4.52&&player.x<11.43&&player.z>1.77&&player.z<7.43;
      if(inPen&&animals.interact(player,time,hit)){
        const sheep=animals.describe().find(animal=>animal.id===hit);
        message.textContent=sheep.name+'蹭了蹭你的手。';
      }else{
        animalTarget=hit;
        animalRoute=inPen?[]:[gate,inside];
        message.textContent='向小羊走过去。';
      }
      return;
    }
    if(!target)return;
    target.x=clamp(target.x,bounds.minX,bounds.maxX);
    target.z=clamp(target.z,bounds.minZ,bounds.maxZ);
    const plot=livestock.plots.find(plot=>Math.abs(plot.x-target.x)<plotSize/2&&Math.abs(plot.z-target.z)<plotSize/2);
    if(plot)selectPlot(plot.id);
    if(pondBlocks(target.x,target.z)){
      message.textContent='沿湖边的碎石小路走。';
      return;
    }
    if(blocked(target.x,target.z)){
      message.textContent='点石板路或空地，人物会走过去。';
      return;
    }
    if(inMarket(target.x,target.z)&&!openMarket){
      if(inMarket(player.x,player.z))setMarket(true);
      else {goToPublicPlace(marketCenter);return;}
    }
    const waypoints=routeThroughYard(player,target,bounds,blocked);
    if(waypoints.length)publicRoute={target,waypoints};
  }

  function pointerDown(event){
    if(gesture||event.button!==0)return;
    canvas.setPointerCapture?.(event.pointerId);
    gesture={id:event.pointerId,x:event.clientX,y:event.clientY,dragged:false};
  }
  function pointerMove(event){
    if(gesture?.id!==event.pointerId)return;
    const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;
    if(!gesture.dragged&&Math.hypot(dx,dy)<5)return;
    if(!movementX&&!movementY)clearPath();
    gesture={id:gesture.id,x:event.clientX,y:event.clientY,dragged:true};
    view.orbit(dx,dy);
  }
  function pointerUp(event){
    if(gesture?.id!==event.pointerId)return;
    const clicked=!gesture.dragged;
    gesture=null;
    if(clicked)walkTo(event);
  }
  function keyDown(event){
    if(event.ctrlKey||event.metaKey||event.altKey)return;
    if(event.key==='Escape'&&(surveying||fishingSpot||fishingRoute||publicRoute||openMarket)){
      if(surveying)survey(false);
      if(openMarket)setMarket(false);
      leaveFishing();
      clearPath();
      return;
    }
    if(event.target?.matches?.('select,input,textarea,[contenteditable]'))return;
    const key=event.key.toLowerCase();
    if(directions.has(key)){
      event.preventDefault();
      keys.add(key);
    }else if(!event.repeat&&key==='e'&&nearPen())pet();
    else if(!event.repeat&&key==='f')water();
    else if(!event.repeat&&key==='r'&&!rideButton.hidden)ride();
  }
  function keyUp(event){keys.delete(event.key.toLowerCase());}
  function setMovement(x,y){
    if(!Number.isFinite(x)||!Number.isFinite(y))return;
    const strength=Math.max(1,Math.hypot(x,y));
    movementX=x/strength;
    movementY=y/strength;
  }
  function cancelInput(){gesture=null;keys.clear();setMovement(0,0);last=0;}
  document.querySelector('[data-action=interact]').addEventListener('click',()=>{
    if(!nearPen())return;
    const sheep=animals.describe().reduce((best,entry)=>!best||distance(player,entry)<distance(player,best)?entry:best,null);
    if(pet(sheep?.id)||!sheep)return;
    const waypoints=routeThroughYard(player,sheep,bounds,blocked);
    if(waypoints.length){clearPath();animalTarget=sheep.id;animalRoute=waypoints;}
  });
  rideButton.addEventListener('click',()=>ride());
  document.querySelector('[data-action=livestock]').addEventListener('click',()=>{
    if(nearPen()||trading()){
      market.open=!market.open;
      if(market.open)market.scrollIntoView({block:'nearest'});
    }
  });

  function resize(ratio) {
    const box=canvas.getBoundingClientRect();
    view.resize(Math.max(1,Math.round(box.width)),Math.max(1,Math.round(box.height)),player,ratio);
  }
  resize();
  draw(0);
  return {
    resize,step,pointerDown,pointerMove,pointerUp,keyDown,keyUp,setMovement,cancelInput,dispose:view.dispose,
    project:view.project,
    snapshot:()=>({
      house:house&&{...house,site:{...site}},
      houseBounds:view.getHouseBounds(),
      player:{...player,mounted:player.mountedId!==null,screen:view.project(player.x,player.z)},
      livestock:{coins:livestock.coins,animals:livestock.animals.map(animal=>({...animal})),
        mountedId:player.mountedId,stock:stockAt()},
      economy:{...livestock.snapshot(),selectedSpot:selectedSpot&&{...selectedSpot},selectedPlotId},
      market:{open:openMarket,near:inMarket(player.x,player.z),approaching:publicRoute?.target===marketCenter,center:marketCenter},
      clock:clock.read(Date.now()),
      fishing:fishState(Date.now()),
      context:{kind:get('yard-context').dataset.kind,plotId:nearbyPlot()?.id??null,fishBasket:livestock.fishBasket},
      animals:animals.describe(),
      garden:courtyard.describe(),
      camera:view.getCamera(),
      stats:{...view.getStats(),averageFrameMs:frameTime.lastAverage,peakFrameMs:frameTime.lastPeak},
    }),
  };
}
