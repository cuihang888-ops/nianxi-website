import {fishCatalog} from './fishing.js';
import {cropFertilizer,crops,fishBasketCapacity,fishMarket,livestockTypes} from './economy-config.js';
import {gameDayMilliseconds} from './yard-clock.js';
import {listYardEstate,purchaseYardEstate,residentIds} from './yard-estate-market.js';
export {crops,livestockTypes};

export const loanHorse = Object.freeze({id:'loan-horse', species:'horse', x:14.55, z:8.9});
export const livestockLimit=9;
export const plotSize=3;
export const plotPrice=160;
export const plotResale=120;
export const homePrices=Object.freeze({
  lumber_cabin:0, simple_shed:0, dai_stilt:650, brick_dai:900, myanmar_villa:1250,
  merchant:1500, official:2400, landlord:2800, grand_estate:4500,
});
export const survivalHomePrices=Object.freeze({...homePrices,lumber_cabin:420,simple_shed:180});
export const homesteadPrice=300;
export const homeBuildSeconds=Object.freeze({
  simple_shed:9, lumber_cabin:18, dai_stilt:25, brick_dai:31, myanmar_villa:43,
  merchant:52, official:68, landlord:80, grand_estate:110,
});
const homeWearMilliseconds=3*gameDayMilliseconds;
const minimumCondition=50;
const homeRepairRate=.008;
const homeResaleRate=.68;
const usedHomeAskingRate=.81;
const known=id=>Object.hasOwn(livestockTypes,id);
const knownCrop=id=>Object.hasOwn(crops,id);
const knownFish=id=>Object.hasOwn(fishCatalog,id);
const fishMarketOrder=Object.keys(fishCatalog).sort((first,second)=>fishCatalog[second].value-fishCatalog[first].value);
const knownHome=id=>Object.hasOwn(homePrices,id);
const counter=number=>Number.isSafeInteger(number)&&number>=0;
const stapleCrops=['rice','corn'];
const cheapestSeedPrice=Math.min(...Object.values(crops).map(crop=>crop.price));
const paddockSlots=[
  [13.30,3.1],[13.30,4.75],[13.30,6.13],[14.62,4.75],[14.62,6.13],
  [15.93,4.75],[15.93,6.35],[17.05,4.86],[17.05,6.22],
];

export function livestockPosition(animal,time) {
  const [x,z]=paddockSlots[animal.slot];
  const phase=time*.46+animal.slot*2.39;
  return {x:x+Math.sin(phase)*.22,z:z+Math.cos(phase)*.25,heading:Math.atan2(.22*Math.cos(phase),-.25*Math.sin(phase))};
}

export function stableBlocks(x,z) {
  return (z>1.8&&z<2.20&&x>12.25&&x<17.9) ||
    (z>1.8&&z<8.30&&(Math.abs(x-12.45)<.21||Math.abs(x-17.7)<.21)) ||
    (Math.abs(z-8.10)<.21&&((x>12.24&&x<13.65)||(x>15.35&&x<17.91))) ||
    (x>14.04&&x<17.24&&z>2.12&&z<4);
}

export function cropStage(plot,now=Date.now()) {
  if(!plot||!knownCrop(plot.crop))return 'empty';
  if(plot.wateredAt===null)return 'dry';
  const growthTimeMultiplier=plot.fertilized===true?cropFertilizer.growthTimeMultiplier:1;
  return now-plot.wateredAt>=crops[plot.crop].seconds*1000*growthTimeMultiplier?'ready':'growing';
}

function plotsOverlap(first,second) {
  return Math.abs(first.x-second.x)<plotSize&&Math.abs(first.z-second.z)<plotSize;
}

export function createLivestock(storage,{survival=false,cityMarket=false,clock=Date.now}={}) {
  const legacyKey=survival?'anheli-independent-yard-survival-v1':'anheli-independent-yard-livestock-v1';
  const saveKey=cityMarket?legacyKey+'-city-v1':legacyKey;
  const prices=survival?survivalHomePrices:homePrices;
  const openedAt=clock();
  const stockedSpecies=Object.keys(livestockTypes).filter(id=>livestockTypes[id].product);
  const cropIds=Object.keys(crops);
  const inventory=(keys,source)=>Object.fromEntries(keys.map(id=>[id,counter(source?.[id])?source[id]:0]));
  function initialProfile(openYard){
    const defaultHomes=openYard?Object.keys(homePrices).filter(id=>homePrices[id]===0):[];
    return {
    coins:survival?10000:1000, nextId:1, animals:[], nextPlotId:1, plots:[],
    crops:inventory(cropIds), fish:inventory(Object.keys(fishCatalog)),
    seeds:inventory(cropIds), feed:inventory(stockedSpecies), goods:inventory(stockedSpecies),
    fishSales:null,
    homeId:openYard?'lumber_cabin':null, ownedHomes:defaultHomes, energy:100,
    homesteadOwned:openYard, homeRecords:Object.fromEntries(defaultHomes.map(id=>[id,{maintainedAt:openedAt}])),
    construction:null, usedHomes:{},
    };
  }
  let temporary=!storage;
  function restoreProfile(saved,initial){
      const ids=new Set(),slots=new Set();
      if(counter(saved?.coins)&&counter(saved.nextId)&&saved.nextId>0&&Array.isArray(saved.animals)&&
        saved.animals.length<=livestockLimit&&saved.animals.every(animal=>{
          if(!animal||!counter(animal.id)||animal.id>=saved.nextId||ids.has(animal.id)||
            !Number.isInteger(animal.slot)||animal.slot<0||animal.slot>=paddockSlots.length||
            slots.has(animal.slot)||!known(animal.species)||!counter(animal.fedAt))return false;
          ids.add(animal.id);
          slots.add(animal.slot);
          return true;
        })){
        const plotIds=new Set();
        const validPlots=counter(saved.nextPlotId)&&saved.nextPlotId>0&&Array.isArray(saved.plots)&&
          saved.plots.every(plot=>{
            if(!plot||!counter(plot.id)||plot.id===0||plot.id>=saved.nextPlotId||plotIds.has(plot.id)||
              !Number.isFinite(plot.x)||!Number.isFinite(plot.z))return false;
            const validPlant=plot.crop===null
              ? plot.plantedAt===null&&plot.wateredAt===null
              : knownCrop(plot.crop)&&counter(plot.plantedAt)&&
                (plot.wateredAt===null||counter(plot.wateredAt)&&plot.wateredAt>=plot.plantedAt);
            plotIds.add(plot.id);
            return validPlant;
          });
        const ownedHomes=new Set(initial.ownedHomes);
        if(Array.isArray(saved.ownedHomes))saved.ownedHomes.filter(knownHome).forEach(id=>ownedHomes.add(id));
        const homeRecords=Object.fromEntries([...ownedHomes].map(id=>{
          const maintainedAt=saved.homeRecords?.[id]?.maintainedAt;
          return [id,{maintainedAt:counter(maintainedAt)?maintainedAt:openedAt}];
        }));
        const project=saved.construction;
        const validProject=project&&knownHome(project.id)&&(cityMarket||!ownedHomes.has(project.id))&&
          counter(project.startedAt)&&counter(project.readyAt)&&
          project.readyAt-project.startedAt===homeBuildSeconds[project.id]*1000;
        const usedHomes=Object.fromEntries(Object.entries(saved.usedHomes??{}).filter(([id,record])=>
          knownHome(id)&&prices[id]>0&&counter(record?.maintainedAt)).map(([id,record])=>
          [id,{maintainedAt:record.maintainedAt}]));
        return {
          ...initial, coins:saved.coins, nextId:saved.nextId, animals:saved.animals,
          nextPlotId:validPlots?saved.nextPlotId:initial.nextPlotId,
          plots:validPlots?saved.plots.map(plot=>({...plot,
            fertilized:plot.crop!==null&&plot.wateredAt!==null&&plot.fertilized===true,
          })):initial.plots,
          crops:inventory(cropIds,saved.crops), fish:inventory(Object.keys(fishCatalog),saved.fish),
          seeds:inventory(cropIds,saved.seeds), feed:inventory(stockedSpecies,saved.feed), goods:inventory(stockedSpecies,saved.goods),
          fishSales:counter(saved.fishSales?.day)&&counter(saved.fishSales?.fullPriceSold)
            ?{day:saved.fishSales.day,fullPriceSold:Math.min(fishMarket.fullPriceCount,saved.fishSales.fullPriceSold)}:null,
          homeId:ownedHomes.has(saved.homeId)?saved.homeId:initial.homeId,
          ownedHomes:[...ownedHomes], energy:counter(saved.energy)?Math.min(100,saved.energy):100,
          homesteadOwned:initial.homesteadOwned||saved.homesteadOwned===true||ownedHomes.size>0||Boolean(validProject),
          homeRecords,usedHomes,
          construction:validProject?{id:project.id,startedAt:project.startedAt,readyAt:project.readyAt}:null,
        };
      }
      return initial;
  }
  const first=initialProfile(!survival);
  const second=initialProfile(false);
  let state=first;
  let savedVersion=null,blockedSave=false,city=null;
  function restoreCity(saved){
    if(!residentIds.includes(saved?.residentId)||!Array.isArray(saved.receipts)||
      !counter(saved.nextListingId)||!saved.nextListingId||!counter(saved.nextId)||!saved.nextId||
      !counter(saved.nextPlotId)||!saved.nextPlotId||!saved.residents)return null;
    const residents=Object.fromEntries(residentIds.map(id=>[id,restoreProfile(saved.residents[id],second)]));
    const occupied=residentIds.filter(id=>residents[id].homesteadOwned);
    if(occupied.length>1||(occupied.length&&saved.listing))return null;
    let listing=saved.listing;
    if(listing&&(!residentIds.includes(listing.sellerId)||!knownHome(listing.homeId)||!counter(listing.price)||
      !listing.price||!counter(listing.listedAt)||!Array.isArray(listing.ownedHomes)||
      !Array.isArray(listing.animals)||!Array.isArray(listing.plots)||!listing.homeRecords||
      listing.id!=='estate-'+(saved.nextListingId-1)))return null;
    if(listing){
      const assets=restoreProfile({...listing,coins:0,nextId:saved.nextId,nextPlotId:saved.nextPlotId},second);
      if(assets.homeId!==listing.homeId||assets.animals.length!==listing.animals.length||
        assets.plots.length!==listing.plots.length)return null;
      const {homeId,homeRecords,ownedHomes,plots,animals}=assets;
      const {id,sellerId,price,listedAt}=listing;
      listing={id,sellerId,price,listedAt,homeId,homeRecords,ownedHomes,plots,animals};
    }
    const assetSets=[...Object.values(residents),...(listing?[listing]:[])];
    const animals=assetSets.flatMap(profile=>profile.animals);
    const plots=assetSets.flatMap(profile=>profile.plots);
    if(animals.some(animal=>animal.id>=saved.nextId)||
      new Set(animals.map(animal=>animal.id)).size!==animals.length||
      new Set(animals.map(animal=>animal.slot)).size!==animals.length||
      plots.some(plot=>plot.id>=saved.nextPlotId)||
      new Set(plots.map(plot=>plot.id)).size!==plots.length)return null;
    const receipts=saved.receipts;
    if(receipts.some((receipt,index)=>!residentIds.includes(receipt?.buyerId)||
      !residentIds.includes(receipt.sellerId)||receipt.sellerId===receipt.buyerId||
      !counter(receipt.amount)||!receipt.amount||!counter(receipt.settledAt)||
      receipt.listingId!=='estate-'+(index+1))||
      receipts.length!==saved.nextListingId-(listing?2:1)||
      !counter(receipts.reduce((sum,receipt)=>sum+receipt.amount,0)))return null;
    return {...saved,residents,receipts,listing:listing??null};
  }
  try {
    savedVersion=storage?.getItem(saveKey)??null;
    if(cityMarket){
      city=savedVersion?restoreCity(JSON.parse(savedVersion)):null;
      blockedSave=Boolean(savedVersion&&!city);
      if(!city){
        const previous=storage?.getItem(legacyKey);
        state=restoreProfile(previous?JSON.parse(previous):null,first);
        city={
          residentId:'resident',residents:{resident:state,buyer:second},listing:null,receipts:[],
          nextListingId:1,nextId:state.nextId,nextPlotId:state.nextPlotId,
        };
      }
      state=city.residents[city.residentId];
    }else if(savedVersion){
      state=restoreProfile(JSON.parse(savedVersion),first);
    }
  } catch {
    temporary=true;
    blockedSave=Boolean(savedVersion);
    if(cityMarket&&!city)city={residentId:'resident',residents:{resident:state,buyer:second},
      listing:null,receipts:[],nextListingId:1,nextId:state.nextId,nextPlotId:state.nextPlotId};
  }

  function commitCity(next,message){
    if(blockedSave)return '暂时无法写入城镇存档。';
    try{
      if(storage){
        if((storage.getItem(saveKey)??null)!==savedVersion)return '城镇存档已更新，请重新进入后再交易。';
        const version=JSON.stringify(next);
        storage.setItem(saveKey,version);
        savedVersion=version;
      }
    }catch{
      temporary=true;
      return '暂时无法保存城镇交易，请重试。';
    }
    city=next;
    state=city.residents[city.residentId];
    return message;
  }

  function commit(next,message) {
    if(city)return commitCity({...city,nextId:Math.max(city.nextId,next.nextId),
      nextPlotId:Math.max(city.nextPlotId,next.nextPlotId),residents:{...city.residents,[city.residentId]:next}},message);
    state=next;
    try {
      if(!storage)temporary=true;
      else storage.setItem(saveKey,JSON.stringify(next));
    } catch {
      temporary=true;
    }
    return message;
  }

  function completedProfile(profile,now) {
    const project=profile.construction;
    if(!project||!counter(now)||now<project.readyAt)return null;
    const {id,readyAt}=project;
    const oldHome=city?profile.homeId:null;
    const ownedHomes=[...new Set([...profile.ownedHomes.filter(home=>home!==oldHome),id])];
    const homeRecords={...profile.homeRecords,[id]:{maintainedAt:readyAt}};
    if(oldHome)delete homeRecords[oldHome];
    return {...profile,homeId:id,ownedHomes,homeRecords,construction:null};
  }

  function settle(now=clock()) {
    const finished=completedProfile(state,now);
    if(!city){
      if(finished)commit(finished);
      return finished?.homeId??null;
    }
    const otherId=inactiveResidentId();
    const finishedOther=completedProfile(city.residents[otherId],now);
    if(finished||finishedOther){
      const residents={
        ...city.residents,
        [city.residentId]:finished??state,
        [otherId]:finishedOther??city.residents[otherId],
      };
      commitCity({...city,residents});
    }
    return finished&&!state.construction?finished.homeId:null;
  }

  const emptyAssets=Object.freeze([]);
  const visibleAssets={animals:{},plots:{}};
  function inactiveResidentId(){
    return city.residentId==='resident'?'buyer':'resident';
  }
  function inactiveProfile(){
    return city?.residents[inactiveResidentId()];
  }
  function otherAssets(key){
    if(!city)return emptyAssets;
    const owned=inactiveProfile()[key];
    const listed=city.listing?.[key]??emptyAssets;
    const cache=visibleAssets[key];
    if(owned!==cache.owned||listed!==cache.listed){
      cache.owned=owned;
      cache.listed=listed;
      cache.copy=Object.freeze([...owned,...listed].map(item=>Object.freeze({...item})));
    }
    return cache.copy;
  }
  function otherAnimals(){
    return otherAssets('animals');
  }
  function otherPlots(){
    return otherAssets('plots');
  }
  function animalSlotsAvailable(){
    return livestockLimit-state.animals.length-otherAnimals().length;
  }
  function buy(species) {
    if(!known(species))return '';
    const type=livestockTypes[species];
    if(animalSlotsAvailable()<=0)return '围栏里的位置都已占用。';
    if(state.coins<type.price)return '安币还不够。';
    const slots=new Set([...state.animals,...otherAnimals()].map(animal=>animal.slot));
    const slot=paddockSlots.findIndex((_,index)=>!slots.has(index));
    const id=city?.nextId??state.nextId;
    return commit({...state,coins:state.coins-type.price,nextId:id+1,
      animals:[...state.animals,{id,slot,species,fedAt:0}]},type.name+'已来到右侧围栏。');
  }

  function sell(species,mountedId) {
    if(!known(species))return '';
    const type=livestockTypes[species];
    const animal=state.animals.find(record=>record.species===species&&record.id!==mountedId);
    if(!animal)return state.animals.some(record=>record.species===species)
      ? '先下马，再卖出正在骑的马。' : '围场里还没有这种动物。';
    return commit({...state,coins:state.coins+type.resale,animals:state.animals.filter(record=>record!==animal)},
      '卖出'+type.name+'，收到 '+type.resale+' 安币。');
  }

  function care(species,now=Date.now()) {
    if(!known(species))return '';
    const type=livestockTypes[species];
    const mine=state.animals.filter(animal=>animal.species===species);
    if(!mine.length)return '先领养一只动物。';
    if(!type.product)return '马已经吃过草，可以带它去散步。';
    const ready=mine.filter(animal=>animal.fedAt&&now-animal.fedAt>=type.seconds*1000);
    if(ready.length){
      const animals=state.animals.map(animal=>ready.includes(animal)?{...animal,fedAt:0}:animal);
      if(city){
        const goods={...state.goods,[species]:state.goods[species]+ready.length};
        return commit({...state,animals,goods},'已收取 '+ready.length+' 份'+type.product+'，可以带去集市卖出。');
      }
      const payout=ready.length*type.value;
      return commit({...state,coins:state.coins+payout,animals},
        '卖出'+ready.length+'份'+type.product+'，收到 '+payout+' 安币。');
    }
    const hungry=mine.filter(animal=>animal.fedAt===0);
    if(!hungry.length)return type.product+'还在准备，稍等一会儿。';
    if(state.energy<2)return '有点累了，先吃点东西。';
    const feedAvailable=city?state.feed[species]:Math.floor(state.coins/type.feedPrice);
    const portions=Math.min(hungry.length,Math.floor(state.energy/2),feedAvailable);
    if(!portions)return city?'先在集市买'+type.name+'的饲料。':'每只动物的饲料需要 '+type.feedPrice+' 安币。';
    const fed=new Set(hungry.slice(0,portions).map(animal=>animal.id));
    const feedCost=portions*type.feedPrice;
    const animals=state.animals.map(animal=>fed.has(animal.id)?{...animal,fedAt:now}:animal);
    const operation=city?{feed:{...state.feed,[species]:state.feed[species]-portions}}:{coins:state.coins-feedCost};
    const cost=city?'用了 '+portions+' 份饲料':'饲料花费 '+feedCost+' 安币';
    return commit({...state,...operation,energy:state.energy-portions*2,animals},
      '已喂 '+portions+' 只，'+cost+'，约 '+type.seconds+' 秒后可收'+type.product+'。');
  }

  function buySupply(inventoryName,id,name,price){
    if(!city||!price)return '集市目前没有这种货物。';
    if(state.coins<price)return '购买'+name+'需要 '+price+' 安币。';
    const items={...state[inventoryName],[id]:state[inventoryName][id]+1};
    return commit({...state,[inventoryName]:items,coins:state.coins-price},'买入一份'+name+'，花费 '+price+' 安币。');
  }
  function buySeed(id){
    const crop=knownCrop(id)?crops[id]:null;
    return buySupply('seeds',id,(crop?.name??'')+'种子',crop?.price);
  }
  function buyFeed(species){
    const type=known(species)?livestockTypes[species]:null;
    return buySupply('feed',species,(type?.name??'')+'的饲料',type?.feedPrice);
  }
  function sellGoods(){
    const value=stockedSpecies.reduce((sum,id)=>sum+state.goods[id]*livestockTypes[id].value,0);
    if(!value)return '背篓里还没有可以出售的畜产。';
    if(!counter(state.coins+value))return '暂时无法结算畜产。';
    return commit({...state,coins:state.coins+value,goods:inventory(stockedSpecies)},'卖出畜产，收到 '+value+' 安币。');
  }

  function buyPlot(point,validate) {
    if(!Number.isFinite(point?.x)||!Number.isFinite(point?.z))return '先在地面上选一块空地。';
    const id=city?.nextPlotId??state.nextPlotId;
    const plot={id,x:point.x,z:point.z,crop:null,plantedAt:null,wateredAt:null,fertilized:false};
    if([...state.plots,...otherPlots()].some(owned=>plotsOverlap(plot,owned)))return '这块地和已有田地重叠了。';
    const validation=validate?.(plot);
    if(typeof validation==='string'&&validation)return validation;
    if(validation===false)return '这块地现在不能出售。';
    if(state.coins<plotPrice)return '买地需要 '+plotPrice+' 安币。';
    return commit({...state,coins:state.coins-plotPrice,nextPlotId:id+1,plots:[...state.plots,plot]},
      '买下第 '+plot.id+' 块田，花费 '+plotPrice+' 安币。');
  }

  function updatePlot(plot,changes,updates,message) {
    const plots=state.plots.map(record=>record===plot?{...record,...changes}:record);
    return commit({...state,...updates,plots},message);
  }

  function sellPlot(plotId) {
    const plot=state.plots.find(record=>record.id===plotId);
    if(!plot||plot.crop!==null)return '只能退回空田。';
    return commit({...state,coins:state.coins+plotResale,plots:state.plots.filter(record=>record.id!==plotId)},
      '已退回第 '+plot.id+' 块空田，收到 '+plotResale+' 安币。');
  }

  function plant(plotId,cropId,now=Date.now()) {
    const plot=state.plots.find(record=>record.id===plotId);
    if(!plot)return '先选自己的一块田。';
    if(plot.crop!==null)return '这块田已经种了作物。';
    if(!knownCrop(cropId))return '先选一种作物。';
    const crop=crops[cropId];
    if(city&&!state.seeds[cropId])return '先在集市买'+crop.name+'种子。';
    if(!city&&state.coins<crop.price)return '种子需要 '+crop.price+' 安币。';
    if(state.energy<4)return '有点累了，先吃点东西。';
    const cost=city?{seeds:{...state.seeds,[cropId]:state.seeds[cropId]-1}}:{coins:state.coins-crop.price};
    return updatePlot(plot,{crop:cropId,plantedAt:now},{...cost,energy:state.energy-4},
      crop.name+'种下了，浇水后就会生长。');
  }

  function waterPlot(plotId,now=Date.now()) {
    const plot=state.plots.find(record=>record.id===plotId);
    const stage=cropStage(plot,now);
    if(stage==='empty')return '先在这块田播种。';
    if(stage==='ready')return '作物已经熟了，可以收获。';
    if(stage==='growing')return '已经浇过了，再等一会儿。';
    if(state.energy<2)return '有点累了，先吃点东西。';
    const crop=crops[plot.crop];
    return updatePlot(plot,{wateredAt:Math.max(now,plot.plantedAt)},{energy:state.energy-2},
      crop.name+'浇好水了，约 '+crop.seconds+' 秒后成熟。');
  }

  function fertilizePlot(plotId,now=clock()) {
    const plot=state.plots.find(record=>record.id===plotId);
    if(!plot?.crop)return '先在自己的田里播种。';
    if(plot.wateredAt===null)return '作物需要先浇水。';
    if(!counter(now)||now<plot.wateredAt)return '等作物开始生长后再施肥。';
    if(cropStage(plot,now)==='ready')return '作物已经熟了，可以收获。';
    if(plot.fertilized)return '这茬作物已经施过肥了。';
    if(state.energy<cropFertilizer.energy)return '有点累了，先吃点东西。';
    const nextPlot={...plot,fertilized:true};
    const message=cropStage(nextPlot,now)==='ready'
      ?'施肥完成，作物已经可以收获。':'施肥完成，作物会长得更快。';
    return updatePlot(plot,{fertilized:true},{energy:state.energy-cropFertilizer.energy},message);
  }

  function harvest(plotId,now=Date.now()) {
    const plot=state.plots.find(record=>record.id===plotId);
    const stage=cropStage(plot,now);
    if(stage==='empty')return '这块田还是空的。';
    if(stage==='dry')return '作物需要先浇水。';
    if(stage==='growing')return '作物正在生长，再等一会儿。';
    const crop=crops[plot.crop];
    const inventory={...state.crops,[plot.crop]:state.crops[plot.crop]+crop.yield};
    return updatePlot(plot,{crop:null,plantedAt:null,wateredAt:null,fertilized:false},{crops:inventory},
      '收获 '+crop.yield+' 份'+crop.product+'，已经放进背篓。');
  }

  function sellCrops(cropId) {
    const ids=cropId===undefined?Object.keys(crops):[cropId];
    if(ids.some(id=>!knownCrop(id)))return '先选一种要卖的作物。';
    const value=ids.reduce((total,id)=>total+state.crops[id]*crops[id].value,0);
    if(!value)return '背篓里还没有可以卖的作物。';
    const inventory={...state.crops};
    ids.forEach(id=>inventory[id]=0);
    return commit({...state,coins:state.coins+value,crops:inventory},'卖出作物，收到 '+value+' 安币。');
  }

  function fishBasket() {
    const count=Object.values(state.fish).reduce((total,quantity)=>total+quantity,0);
    return {count,capacity:fishBasketCapacity,full:count>=fishBasketCapacity};
  }

  function catchFish(id) {
    if(!knownFish(id))return '还没有钓到鱼。';
    if(fishBasket().full)return '鱼篓满了，先卖掉一些鱼再继续钓。';
    const fish={...state.fish,[id]:state.fish[id]+1};
    return commit({...state,fish},'钓到一条'+fishCatalog[id].name+'，放进了鱼篓。');
  }

  function fishQuote(id,now=clock()) {
    if((id!==undefined&&!knownFish(id))||!counter(now))return null;
    const day=Math.max(state.fishSales?.day??0,Math.floor(now/gameDayMilliseconds));
    const sold=state.fishSales?.day===day?state.fishSales.fullPriceSold:0;
    const allowance=fishMarket.fullPriceCount-sold;
    let count=0,fullPriceCount=0,value=0;
    const ids=id===undefined?fishMarketOrder:[id];
    for(const fishId of ids){
      const caught=state.fish[fishId];
      const price=fishCatalog[fishId].value;
      const fullPrice=Math.min(caught,allowance-fullPriceCount);
      const surplus=caught-fullPrice;
      count+=caught;
      fullPriceCount+=fullPrice;
      value+=fullPrice*price+surplus*Math.max(1,Math.floor(price*fishMarket.surplusRate));
    }
    return Number.isSafeInteger(value)&&Number.isSafeInteger(state.coins+value)
      ?{day,count,value,allowance,fullPriceCount,surplusCount:count-fullPriceCount}:null;
  }

  function sellFish(id,now=clock()) {
    const quote=fishQuote(id,now);
    if(!quote)return '暂时无法结算鱼获。';
    if(!quote.count)return '鱼篓里还没有可以卖的鱼。';
    const ids=id===undefined?fishMarketOrder:[id];
    const fish={...state.fish};
    ids.forEach(fishId=>fish[fishId]=0);
    const {day,count,value,allowance,fullPriceCount}=quote;
    const fishSales={day,fullPriceSold:fishMarket.fullPriceCount-allowance+fullPriceCount};
    return commit({...state,coins:state.coins+value,fish,fishSales},'卖出 '+count+' 条鱼，收到 '+value+' 安币。');
  }

  function eat() {
    if(state.energy===100)return '体力已经满了。';
    const foodId=stapleCrops.find(id=>state.crops[id]>0);
    const food=crops[foodId];
    const energy=Math.min(100,state.energy+(food?.energy??12));
    const restored=energy-state.energy;
    if(!food)return commit({...state,energy},'喝了一碗免费杂粮粥，恢复 '+restored+' 点体力。');
    return commit({...state,energy,crops:{...state.crops,[foodId]:state.crops[foodId]-1}},
      '吃了一份'+food.product+'，恢复 '+restored+' 点体力。');
  }

  function homeCondition(record,now) {
    const wear=record?Math.max(0,Math.floor((now-record.maintainedAt)/homeWearMilliseconds)):0;
    return Math.max(minimumCondition,100-wear);
  }

  function houseQuote(id,now=clock()) {
    if(!knownHome(id))return null;
    const price=prices[id];
    const record=state.homeRecords[id];
    const landPrice=state.homesteadOwned?0:homesteadPrice;
    const condition=homeCondition(record,now);
    const repairCost=record&&price?Math.ceil(price*(100-condition)*homeRepairRate):0;
    if(city){
      const canList=state.homeId===id&&!state.construction&&!city.listing;
      const upgradeBlocked=city.listing||inactiveProfile().homesteadOwned?'这处宅地已有其他归属。':
        state.homeId&&survivalHomePrices[id]<=survivalHomePrices[state.homeId]?'住宅只能升级为价格更高的房型。':'';
      const structureCredit=state.homeId?Math.floor(prices[state.homeId]*homeCondition(state.homeRecords[state.homeId],now)*homeResaleRate/100):0;
      const buildPrice=Math.max(0,price-structureCredit);
      return {price:buildPrice,structureCredit,landPrice,total:buildPrice+landPrice,seconds:homeBuildSeconds[id],
        owned:Boolean(record),condition,saleValue:0,repairCost,canList,upgradeBlocked,
        usedCondition:null,usedPrice:0,usedTotal:0};
    }
    const saleValue=record&&price?Math.floor(price*condition*homeResaleRate/100):0;
    const listing=state.usedHomes[id];
    const usedCondition=listing?homeCondition(listing,now):null;
    const usedPrice=listing&&!record?Math.ceil(price*usedCondition*usedHomeAskingRate/100):0;
    return {price,landPrice,total:price+landPrice,seconds:price?homeBuildSeconds[id]:0,
      owned:Boolean(record),condition,saleValue,repairCost,usedCondition,usedPrice,
      usedTotal:usedPrice?usedPrice+landPrice:0};
  }

  function buyHome(id,now=clock()) {
    if(!knownHome(id))return '先选一种住宅。';
    if(!counter(now)||!counter(now+homeBuildSeconds[id]*1000))return '暂时无法开始建造。';
    settle(now);
    if(state.construction){
      const remain=Math.max(0,Math.ceil((state.construction.readyAt-now)/1000));
      return '正在建造住宅，还需要约 '+remain+' 秒。';
    }
    if(id===state.homeId)return '现在住的就是这间房。';
    const {total,seconds,upgradeBlocked}=houseQuote(id,now);
    if(upgradeBlocked)return upgradeBlocked;
    if(!city&&state.ownedHomes.includes(id))return commit({...state,homeId:id},'已换到选中的住宅。');
    if(state.coins<total)return '建造这间住宅共需 '+total+' 安币。';
    return commit({...state,coins:state.coins-total,homesteadOwned:true,
      construction:{id,startedAt:now,readyAt:now+seconds*1000}},
      '已付 '+total+' 安币开工，预计 '+seconds+' 秒后完工。');
  }

  function sellHome(id=state.homeId,now=clock()){
    if(city)return id===state.homeId?listEstate(now):'请选择整院挂牌。';
    if(!counter(now))return '暂时无法出售住宅。';
    settle(now);
    if(state.construction)return '房屋建造完成后才能交易。';
    const value=houseQuote(id,now)?.saleValue;
    if(!value)return '这间住宅还不能交易。';
    const homeRecords={...state.homeRecords};
    delete homeRecords[id];
    const homeId=id===state.homeId?(survival?null:'lumber_cabin'):state.homeId;
    return commit({...state,coins:state.coins+value,homeId,homeRecords,usedHomes:{...state.usedHomes,[id]:state.homeRecords[id]},
      ownedHomes:state.ownedHomes.filter(home=>home!==id)},
      '集市已收购住宅，收到 '+value+' 安币。宅地仍归你。');
  }

  function buyUsedHome(id,now=clock()){
    if(city)return '请选择待售整院。';
    if(!counter(now))return '暂时无法购买住宅。';
    settle(now);
    if(state.construction)return '房屋完工后可以购买现房。';
    const total=houseQuote(id,now)?.usedTotal;
    if(!total)return '集市目前没有可买的这类住宅。';
    if(state.coins<total)return '购买现房共需 '+total+' 安币。';
    const usedHomes={...state.usedHomes};
    const record=usedHomes[id];
    delete usedHomes[id];
    return commit({...state,coins:state.coins-total,homeId:id,homesteadOwned:true,
      ownedHomes:[...state.ownedHomes,id],homeRecords:{...state.homeRecords,[id]:record},usedHomes},
      '买下集市现房，支付 '+total+' 安币。');
  }

  function repairHome(id=state.homeId,now=clock()){
    if(!counter(now))return '暂时无法维修住宅。';
    settle(now);
    if(city&&id!==state.homeId)return '只能维修当前使用的住宅。';
    const cost=houseQuote(id,now)?.repairCost;
    if(!cost)return '这间住宅暂时无需付费维修。';
    if(state.coins<cost)return '维修这间住宅需要 '+cost+' 安币。';
    return commit({...state,coins:state.coins-cost,
      homeRecords:{...state.homeRecords,[id]:{maintainedAt:now}}},'已付 '+cost+' 安币维修，屋况恢复到 100%。');
  }

  function copyEstate(data){
    return {...data,
      plots:data.plots.map(plot=>({...plot})),animals:data.animals.map(animal=>({...animal})),
    };
  }
  function estateListing(now=clock()){
    if(!city?.listing)return null;
    const {id,sellerId,price,listedAt,homeId,homeRecords,plots,animals}=city.listing;
    return copyEstate({id,sellerId,price,listedAt,homeId,status:'vacant',construction:null,
      condition:homeCondition(homeRecords[homeId],now),plots,animals});
  }
  function otherEstate(){
    if(!city)return null;
    const profile=inactiveProfile();
    if(!profile.homesteadOwned)return estateListing();
    const ownerId=city.residentId==='resident'?'buyer':'resident';
    return copyEstate({id:'estate-site',ownerId,status:'occupied',homeId:profile.homeId,
      condition:homeCondition(profile.homeRecords[profile.homeId],clock()),
      construction:profile.construction&&{...profile.construction},plots:profile.plots,animals:profile.animals});
  }
  function listingQuote(now=clock()){
    if(!city||!state.homeId||state.construction||city.listing)return null;
    const condition=homeCondition(state.homeRecords[state.homeId],now);
    const structure=Math.ceil(prices[state.homeId]*condition*usedHomeAskingRate/100);
    const land=homesteadPrice+state.plots.length*plotResale;
    const plants=state.plots.reduce((total,plot)=>total+(plot.crop?crops[plot.crop].price:0),0);
    const animals=state.animals.reduce((total,animal)=>total+livestockTypes[animal.species].resale,0);
    const price=structure+land+plants+animals;
    if(!counter(price)||!counter(city.nextListingId+1))return null;
    return {price,structure,land,plants,animals,
      plotCount:state.plots.length,animalCount:state.animals.length};
  }
  function listEstate(now=clock()){
    if(!city||!counter(now))return '暂时无法挂牌。';
    settle(now);
    const quote=listingQuote(now);
    if(!quote)return '只有已完工的自有整院可以挂牌。';
    return commitCity(listYardEstate(city,quote.price,now),
      '整院已挂牌，售价 '+quote.price+' 安币。宅地、作物和自有牲畜由集市托管。');
  }
  function canBuyEstate(){
    const listing=city?.listing;
    return Boolean(listing&&listing.sellerId!==city.residentId&&!state.homesteadOwned&&state.coins>=listing.price&&
      counter(cityRevenue()+listing.price));
  }
  function buyEstate(id,now=clock()){
    if(!counter(now)||!city?.listing||city.listing.id!==id)return '这处整院已下架。';
    if(city.listing.sellerId===city.residentId)return '挂牌人不能购买这处整院。';
    if(!canBuyEstate())return '购买这处整院需要 '+city.listing.price+' 安币。';
    const next=purchaseYardEstate(city,id,now);
    if(!next)return '暂时无法购买这处整院。';
    return commitCity(next,'已买下整院，宅地、作物和牲畜已交接。');
  }
  function switchResident(id){
    if(!city||!residentIds.includes(id))return '请选择一个本地试玩身份。';
    if(id===city.residentId)return '当前已使用这个身份。';
    settle();
    return commitCity({...city,residentId:id},id==='buyer'?'已切换到本地试购居民。':'已切换回经营居民。');
  }
  function cityRevenue(){
    return city?.receipts.reduce((total,receipt)=>total+receipt.amount,0)??0;
  }
  function cityReceipts(){
    return city?.receipts.map(receipt=>({...receipt}))??[];
  }

  function marketHelpAmount() {
    if(state.animals.some(animal=>{
      const type=livestockTypes[animal.species];
      return type.product&&(animal.fedAt>0||(city?state.feed[animal.species]>0:state.coins>=type.feedPrice));
    })||
      state.plots.some(plot=>plot.crop!==null)||Object.values(state.crops).some(Boolean)||
      Object.values(state.fish).some(Boolean)||Object.values(state.goods).some(Boolean))return 0;
    const seedCost=Object.values(state.seeds).some(Boolean)?0:cheapestSeedPrice;
    const reserve=seedCost+(state.plots.length?0:plotPrice);
    return Math.max(0,reserve-state.coins);
  }

  function marketHelp() {
    const amount=marketHelpAmount();
    if(!amount)return '还有资金或产出可以继续经营。';
    return commit({...state,coins:state.coins+amount},'领到 '+amount+' 安币开荒补助，可以继续种田了。');
  }

  function snapshot() {
    return {
      ...state, animals:state.animals.map(animal=>({...animal})), plots:state.plots.map(plot=>({...plot})),
      crops:{...state.crops}, fish:{...state.fish}, fishSales:state.fishSales&&{...state.fishSales},
      seeds:{...state.seeds},feed:{...state.feed},goods:{...state.goods},
      ownedHomes:[...state.ownedHomes],
      homeRecords:Object.fromEntries(Object.entries(state.homeRecords).map(([id,record])=>[id,{...record}])),
      usedHomes:Object.fromEntries(Object.entries(state.usedHomes).map(([id,record])=>[id,{...record}])),
      construction:state.construction&&{...state.construction},
      ...(city?{residentId:city.residentId,estateListing:estateListing(),cityEstate:otherEstate(),
        cityRevenue:cityRevenue(),cityReceipts:cityReceipts()}:{}),
    };
  }

  return {
    buy,sell,care,buyPlot,sellPlot,plant,waterPlot,fertilizePlot,harvest,sellCrops,catchFish,fishQuote,sellFish,eat,buySeed,buyFeed,sellGoods,
    buyHome,buyUsedHome,sellHome,repairHome,houseQuote,marketHelp,snapshot,settle,
    listEstate,listingQuote,buyEstate,switchResident,
    get coins(){return state.coins;},
    get animals(){return state.animals;},
    get plots(){return state.plots;},
    get crops(){return state.crops;},
    get fish(){return state.fish;},
    get fishBasket(){return fishBasket();},
    get seeds(){return state.seeds;},
    get feed(){return state.feed;},
    get goods(){return state.goods;},
    get otherPlots(){return otherPlots();},
    get otherAnimals(){return otherAnimals();},
    get animalSlotsAvailable(){return animalSlotsAvailable();},
    get homeId(){return state.homeId;},
    get ownedHomes(){return state.ownedHomes;},
    get construction(){return state.construction&&{...state.construction};},
    get energy(){return state.energy;},
    get marketHelpAmount(){return marketHelpAmount();},
    get temporary(){return temporary;},
    get estateListing(){return estateListing();},
    get cityEstate(){return otherEstate();},
    get cityRevenue(){return cityRevenue();},
    get cityReceipts(){return cityReceipts();},
    get residentId(){return city?.residentId??'resident';},
    get canBuyEstate(){return canBuyEstate();},
  };
}
