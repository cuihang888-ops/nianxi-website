import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  createLivestock,crops,homeBuildSeconds,homesteadPrice,livestockTypes,plotPrice,plotResale,survivalHomePrices,
} from '../demos/anheli-module-yard/livestock.js';
import {gameDayMilliseconds} from '../demos/anheli-module-yard/yard-clock.js';

const legacyKey='anheli-independent-yard-survival-v1';
const cityKey=legacyKey+'-city-v1';

function fixture(){
  const records=new Map();
  let now=10_000;
  let writeError=false;
  const storage={
    getItem:key=>records.get(key)??null,
    setItem(key,value){
      if(writeError)throw new Error('storage quota');
      records.set(key,value);
    },
  };
  function open(options={}){
    return createLivestock(storage,{survival:true,cityMarket:true,clock:()=>now,...options});
  }
  return {open,storage,advance(ms){now+=ms;},get now(){return now;},failWrites(){writeError=true;}};
}

function build(economy,time,id='simple_shed'){
  economy.buyHome(id);
  assert.equal(economy.construction.id,id);
  time.advance(homeBuildSeconds[id]*1000);
  assert.equal(economy.settle(),id);
}

test('city migration keeps the existing resident and loads independent buyer funds',()=>{
  const time=fixture();
  const legacy=time.open({cityMarket:false});
  legacy.buy('rabbit');
  legacy.buyPlot({x:2.4,z:3.1});
  build(legacy,time,'lumber_cabin');
  const before=legacy.snapshot();
  const raw=time.storage.getItem(legacyKey);
  const resident=time.open();
  assert.equal(resident.coins,before.coins);
  assert.equal(resident.homeId,before.homeId);
  assert.deepEqual(resident.plots,before.plots);
  assert.deepEqual(resident.animals,before.animals);
  resident.switchResident('buyer');
  assert.equal(resident.coins,10000);
  assert.equal(resident.homeId,null);
  assert.equal(resident.cityEstate.ownerId,'resident');
  assert.equal(resident.cityEstate.homeId,'lumber_cabin');
  assert.match(resident.buyHome('simple_shed'),/其他归属/);
  assert.equal(time.storage.getItem(legacyKey),raw);
  assert.equal(time.open().residentId,'buyer');
});

test('moving to a smaller home is blocked and construction replaces the current structure',()=>{
  const time=fixture();
  const economy=time.open();
  build(economy,time,'lumber_cabin');
  const before=economy.coins;
  assert.match(economy.buyHome('simple_shed'),/只能升级/);
  assert.equal(economy.coins,before);
  const quote=economy.houseQuote('dai_stilt');
  assert.equal(quote.structureCredit,Math.floor(survivalHomePrices.lumber_cabin*.68));
  assert.equal(quote.total,survivalHomePrices.dai_stilt-quote.structureCredit);
  economy.buyHome('dai_stilt');
  assert.equal(economy.coins,before-quote.total);
  assert.match(economy.listEstate(),/完工/);
  assert.equal(economy.homeId,'lumber_cabin');
  economy.switchResident('buyer');
  assert.equal(economy.cityEstate.construction.id,'dai_stilt');
  time.advance(homeBuildSeconds.dai_stilt*1000);
  const reopened=time.open();
  assert.equal(reopened.settle(),null);
  assert.equal(reopened.cityEstate.homeId,'dai_stilt');
  assert.equal(reopened.cityEstate.construction,null);
  reopened.switchResident('resident');
  assert.equal(reopened.homeId,'dai_stilt');
  assert.deepEqual(reopened.ownedHomes,['dai_stilt']);
  assert.match(reopened.buyHome('lumber_cabin'),/只能升级/);
});

test('listing freezes ownership while crops and animals remain ready for the next resident',()=>{
  const time=fixture();
  let economy=time.open();
  build(economy,time,'simple_shed');
  economy.buyPlot({x:3,z:9});
  economy.buySeed('rice');
  economy.plant(1,'rice',time.now);
  economy.waterPlot(1,time.now);
  economy.buy('sheep');
  economy.buyFeed('sheep');
  economy.care('sheep',time.now);
  economy.buySeed('corn');
  economy.catchFish('carp');
  const before=economy.snapshot();
  const price=economy.listingQuote().price;
  assert.equal(price,Math.ceil(survivalHomePrices.simple_shed*.81)+homesteadPrice+plotResale+
    crops.rice.price+livestockTypes.sheep.resale);
  economy.listEstate();
  assert.equal(economy.coins,before.coins);
  assert.equal(economy.homeId,null);
  assert.equal(economy.cityRevenue,0);
  assert.equal(economy.estateListing.status,'vacant');
  assert.equal(economy.otherPlots,economy.otherPlots);
  assert.equal(economy.otherAnimals,economy.otherAnimals);
  assert.deepEqual(economy.estateListing.plots,before.plots);
  assert.deepEqual(economy.estateListing.animals,before.animals);
  assert.equal(economy.fish.carp,1);
  assert.equal(economy.seeds.corn,1);
  assert.equal(economy.plots.length,0);
  assert.equal(economy.animals.length,0);
  assert.match(economy.harvest(1,time.now),/空/);
  assert.match(economy.buyEstate(economy.estateListing.id),/挂牌人/);
  assert.equal(economy.cityRevenue,0);

  economy=time.open();
  const listingId=economy.estateListing.id;
  assert.equal(economy.estateListing.price,price);
  economy.switchResident('buyer');
  assert.equal(economy.canBuyEstate,true);
  assert.match(economy.buyPlot({x:3,z:9}),/重叠/);
  economy.buy('horse');
  economy.buyPlot({x:9,z:9});
  const buyerBalance=economy.coins;
  assert.equal(economy.animals[0].slot,1);
  assert.equal(economy.plots[0].id,2);
  time.advance(3*gameDayMilliseconds);
  economy.buyEstate(listingId,time.now);
  assert.equal(economy.estateListing,null);
  assert.equal(economy.homeId,'simple_shed');
  assert.deepEqual(economy.plots.map(plot=>plot.id),[2,1]);
  assert.deepEqual(economy.animals.map(animal=>animal.species),['horse','sheep']);
  assert.equal(economy.houseQuote('simple_shed').condition,99);
  assert.equal(economy.coins,buyerBalance-price);
  assert.equal(economy.cityRevenue,price);
  economy.buyEstate(listingId,time.now);
  assert.equal(economy.cityRevenue,price);
  assert.equal(economy.cityReceipts.length,1);
  assert.equal(economy.cityReceipts[0].buyerId,'buyer');
  assert.equal(time.open().cityRevenue,price);
  economy.switchResident('resident');
  assert.equal(economy.coins,before.coins);
  assert.equal(economy.cityEstate.ownerId,'buyer');
  assert.deepEqual(economy.cityEstate.plots.map(plot=>plot.id),[2,1]);
});

test('stale and failed purchase attempts cannot debit or credit the estate payment',()=>{
  const time=fixture();
  let economy=time.open();
  build(economy,time);
  economy.listEstate();
  economy.switchResident('buyer');
  const listingId=economy.estateListing.id;
  const stale=time.open();
  economy.buySeed('corn');
  const balance=economy.coins;
  assert.match(stale.buyEstate(listingId),/存档已更新/);
  assert.equal(stale.cityRevenue,0);
  economy=time.open();
  time.failWrites();
  assert.match(economy.buyEstate(listingId),/无法保存/);
  assert.equal(economy.coins,balance);
  assert.equal(economy.cityRevenue,0);
  assert.equal(time.open().estateListing.id,listingId);
  assert.equal(time.open().cityRevenue,0);
});

test('city planting and feeding consume purchased supplies and produce is sold at the market',()=>{
  const time=fixture();
  const economy=time.open();
  economy.buyPlot({x:3,z:9});
  assert.equal(economy.coins,10000-plotPrice);
  assert.match(economy.plant(1,'rice',time.now),/集市买/);
  economy.buySeed('rice');
  const afterSeed=economy.coins;
  economy.plant(1,'rice',time.now);
  assert.equal(economy.seeds.rice,0);
  assert.equal(economy.coins,afterSeed);
  economy.buy('sheep');
  assert.match(economy.care('sheep',time.now),/集市买/);
  economy.buyFeed('sheep');
  const afterFeed=economy.coins;
  economy.care('sheep',time.now);
  assert.equal(economy.feed.sheep,0);
  assert.equal(economy.coins,afterFeed);
  time.advance(livestockTypes.sheep.seconds*1000);
  economy.care('sheep',time.now);
  assert.equal(economy.goods.sheep,1);
  assert.equal(economy.coins,afterFeed);
  economy.sellGoods();
  economy.sellGoods();
  assert.equal(economy.coins,afterFeed+livestockTypes.sheep.value);
  assert.equal(time.open().goods.sheep,0);
});

test('an unreadable city record cannot overwrite the last persisted city save',()=>{
  const time=fixture();
  time.storage.setItem(cityKey,'{"listing":');
  const economy=time.open();
  assert.match(economy.buySeed('rice'),/无法写入/);
  assert.equal(time.storage.getItem(cityKey),'{"listing":');
  assert.equal(economy.coins,10000);
});
