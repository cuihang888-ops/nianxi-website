import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  createLivestock,crops,cropYieldForPlot,homeBuildSeconds,homesteadPrice,livestockPosition,livestockTypes,
  plotPrice,plotResale,survivalHomePrices,
} from '../demos/anheli-module-yard/livestock.js';
import {gameDayMilliseconds} from '../demos/anheli-module-yard/yard-clock.js';
import {pointInPlot,plotResaleValue,plotWidth} from '../demos/anheli-module-yard/yard-land.js';
import {homeSites} from '../demos/anheli-module-yard/yard-home-sites.js';

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
  const oldProfile=JSON.parse(time.storage.getItem(legacyKey));
  delete oldProfile.homeSiteId;
  delete oldProfile.homeSitePrice;
  delete oldProfile.playerName;
  const raw=JSON.stringify(oldProfile);
  time.storage.setItem(legacyKey,raw);
  const resident=time.open();
  assert.equal(resident.coins,before.coins);
  assert.equal(resident.homeId,before.homeId);
  assert.equal(resident.homeSiteId,'yard');
  assert.equal(resident.homeSiteQuote('yard').price,homesteadPrice);
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

test('resident names survive reload and a listed home only bears its current owner’s name',()=>{
  const time=fixture();
  let economy=time.open();
  assert.equal(economy.playerName,'安和里村民');
  assert.equal(economy.homeSignName,'');
  assert.match(economy.renamePlayer('  石桥小满  '),/石桥小满/);
  assert.match(economy.renamePlayer('名字\n换行'),/可见字符/);
  assert.match(economy.renamePlayer('山'.repeat(13)),/可见字符/);
  build(economy,time);
  economy=time.open();
  assert.equal(economy.playerName,'石桥小满');
  assert.equal(economy.homeSignName,'石桥小满家');
  economy.switchResident('buyer');
  economy.renamePlayer('青湖');
  assert.equal(economy.homeSignName,'石桥小满家');
  economy.switchResident('resident');
  assert.equal(economy.playerName,'石桥小满');
  economy.listEstate();
  assert.equal(economy.homeSignName,'');
  economy.switchResident('buyer');
  economy.buyEstate(economy.estateListing.id);
  assert.equal(economy.playerName,'青湖');
  assert.equal(economy.homeSignName,'青湖家');
  assert.equal(time.open().homeSignName,'青湖家');
});

test('the lakefront has a higher price and refund, while a second resident can build at a different address',()=>{
  const time=fixture();
  const lakeside=homeSites.find(site=>site.price>homesteadPrice);
  assert.ok(lakeside);
  const economy=time.open();
  const startingCoins=economy.coins;
  const yard=economy.homeSiteQuote('yard');
  const lake=economy.homeSiteQuote(lakeside.id);
  assert.ok(lake.price>yard.price&&lake.resale>yard.resale);
  assert.match(economy.buyHomestead(lakeside.id),/现在可以建房/);
  assert.equal(economy.coins,startingCoins-lake.price);
  assert.equal(economy.homeSiteQuote(lakeside.id).owned,true);
  assert.equal(economy.homeSiteQuote('yard').available,false);
  assert.match(economy.buyHome('grand_estate'),/放不下/);
  assert.equal(economy.coins,startingCoins-lake.price);
  assert.match(economy.sellHomestead(),/回收宅地/);
  assert.equal(economy.coins,startingCoins-lake.price+lake.resale);
  economy.buyHomestead(lakeside.id);
  assert.equal(economy.houseQuote('simple_shed').total,survivalHomePrices.simple_shed);
  build(economy,time);
  assert.match(economy.sellHomestead(),/整院/);
  economy.switchResident('buyer');
  assert.match(economy.buyHomestead(lakeside.id),/其他归属/);
  assert.equal(economy.houseQuote('simple_shed',time.now,'yard').total,survivalHomePrices.simple_shed+yard.price);
  build(economy,time);
  const reopened=time.open();
  assert.equal(reopened.homeSiteId,'yard');
  assert.equal(reopened.cityEstate.homeSiteId,lakeside.id);
  assert.equal(reopened.cityEstate.homeId,'simple_shed');
});

test('a lakefront whole-home listing cannot be built on and preserves the buyer’s address after reload',()=>{
  const time=fixture();
  const site=homeSites.find(site=>site.price>homesteadPrice);
  let economy=time.open();
  const balance=economy.coins;
  economy.buyHome('lumber_cabin',time.now,site.id);
  assert.equal(economy.coins,balance-survivalHomePrices.lumber_cabin-site.price);
  time.advance(homeBuildSeconds.lumber_cabin*1000);
  economy.settle();
  assert.equal(economy.listingQuote().land,site.price);
  economy.listEstate();
  economy=time.open();
  assert.equal(economy.homeSiteQuote(site.id).available,false);
  assert.equal(economy.estateListing.homeSiteId,site.id);
  economy.switchResident('buyer');
  assert.match(economy.buyHomestead(site.id),/待售/);
  assert.match(economy.buyEstate(economy.estateListing.id),/已买下整院/);
  assert.equal(time.open().homeSiteId,site.id);
  assert.equal(time.open().homeSiteQuote(site.id).owned,true);
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

test('parcel quotes go up near the avenue and market and with area, retaining historical purchase terms',()=>{
  const time=fixture();
  let economy=time.open();
  const remote=economy.landQuote({x:-28,z:-10,size:3});
  const avenue=economy.landQuote({x:-28,z:6,size:3});
  const market=economy.landQuote({x:34,z:23,size:3});
  const marketFarther=economy.landQuote({x:4,z:23,size:3});
  assert.ok(avenue.price>remote.price&&avenue.resale>remote.resale);
  assert.ok(market.price>marketFarther.price&&market.resale>marketFarther.resale);
  const small=economy.landQuote({...remote,size:2});
  const large=economy.landQuote({...remote,size:5});
  assert.ok(small.price<remote.price&&remote.price<large.price&&large.resale<large.price);
  for(const crop of Object.values(crops)){
    const smallYield=cropYieldForPlot(small,crop);
    assert.ok(smallYield*crop.value>crop.price);
    assert.ok(smallYield<crop.yield);
  }
  assert.match(economy.buyPlot({...large,size:3.5}),/尺寸/);
  let balance=economy.coins;
  assert.equal(economy.landQuote(large,plot=>plot.size===5?'整块地不能跨过道路。':'').reason,'整块地不能跨过道路。');
  assert.match(economy.buyPlot(large,()=>false),/不能出售/);
  assert.equal(economy.coins,balance);
  economy.buyPlot({...large,price:1,resale:10000});
  assert.equal(economy.coins,balance-large.price);
  assert.equal(economy.plots[0].size,5);
  assert.equal(economy.plots[0].resale,large.resale);
  assert.match(economy.landQuote({x:large.x+3,z:large.z,size:2}).reason,/重叠/);
  assert.equal(economy.landQuote({x:large.x+3.5,z:large.z,size:2}).reason,'');
  economy.buyPlot({x:4,z:20});
  economy=time.open();
  assert.equal(plotWidth(economy.plots[1]),3);
  assert.equal(plotResaleValue(economy.plots[1]),120);
  assert.equal(cropYieldForPlot(economy.plots[1],crops.rice),crops.rice.yield);
  economy.buySeed('rice');
  economy.plant(1,'rice',time.now);
  economy.waterPlot(1,time.now);
  time.advance(crops.rice.seconds*1000);
  economy.harvest(1,time.now);
  assert.equal(economy.crops.rice,8);
  balance=economy.coins;
  economy.sellPlot(1);
  economy.sellPlot(2);
  assert.equal(economy.coins,balance+large.resale+120);
  assert.deepEqual(time.open().plots,[]);
});

test('private paddocks store their animals, respect their own capacity and transfer with the estate',()=>{
  const time=fixture();
  let economy=time.open();
  build(economy,time);
  economy.buy('sheep');
  const quote=economy.landQuote({x:4,z:8,size:2,purpose:'paddock'});
  assert.equal(quote.capacity,1);
  assert.ok(quote.price>economy.landQuote({...quote,purpose:'field'}).price);
  economy.buyPlot(quote);
  const paddock=economy.plots[0];
  const balance=economy.coins;
  assert.match(economy.plant(paddock.id,'rice',time.now),/自己的一块田/);
  economy.buy('sheep',paddock.id);
  assert.equal(economy.coins,balance-livestockTypes.sheep.price);
  const animal=economy.animals[1];
  assert.equal(animal.paddockId,paddock.id);
  assert.equal(animal.slot,economy.animals[0].slot);
  assert.ok(pointInPlot(livestockPosition(animal,999,economy.plots),paddock));
  assert.match(economy.buy('chicken',paddock.id),/占用/);
  assert.match(economy.sellPlot(paddock.id),/还有动物/);
  economy.buyFeed('sheep');
  economy.care('sheep',time.now,paddock.id);
  assert.equal(economy.animals[0].fedAt,0);
  assert.equal(economy.animals[1].fedAt,time.now);
  assert.equal(economy.listingQuote().land,homesteadPrice+quote.resale);
  economy.listEstate();
  economy=time.open();
  economy.switchResident('buyer');
  assert.match(economy.buy('horse',paddock.id),/自有围栏/);
  assert.match(economy.landQuote({...quote,purpose:'field'}).reason,/已有归属/);
  economy.buyEstate(economy.estateListing.id);
  economy=time.open();
  assert.equal(economy.plots[0].purpose,'paddock');
  assert.equal(economy.animals[1].paddockId,paddock.id);
  economy.sell('sheep',null,paddock.id);
  assert.equal(economy.animals.length,1);
  assert.equal(economy.animals[0].paddockId,undefined);
  assert.equal(economy.paddockSlotsAvailable(paddock.id),1);
  assert.match(economy.sellPlot(paddock.id),/已卖出围栏/);
  assert.deepEqual(time.open().plots,[]);
});

test('a stale parcel quote or failed write cannot change the ownership or the account',()=>{
  const time=fixture();
  const economy=time.open();
  const stale=time.open();
  const quote=economy.landQuote({x:12,z:8,size:3,purpose:'paddock'});
  economy.buyPlot(quote);
  assert.match(stale.buyPlot(quote),/存档已更新/);
  assert.equal(stale.coins,10000);
  assert.equal(stale.plots.length,0);
  time.failWrites();
  assert.match(economy.sellPlot(economy.plots[0].id),/无法保存/);
  assert.equal(economy.coins,10000-quote.price);
  assert.equal(economy.plots.length,1);
  assert.deepEqual(time.open().plots,economy.plots);
});
