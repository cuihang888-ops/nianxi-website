import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createLivestock,cropStage,livestockTypes,crops,plotPrice} from '../demos/anheli-module-yard/livestock.js';
import {cropFertilizer,fishBasketCapacity,fishMarket} from '../demos/anheli-module-yard/economy-config.js';
import {createYardClock,gameDayMilliseconds} from '../demos/anheli-module-yard/yard-clock.js';

function setup({coins=10000,fish={mandarin:2,crucian:6},...legacyProfile}={}) {
  let now=gameDayMilliseconds*8;
  const saved=new Map([['anheli-independent-yard-survival-v1',JSON.stringify({
    coins,nextId:1,animals:[],fish,...legacyProfile,
  })]]);
  const storage={getItem:key=>saved.get(key)??null,setItem:(key,value)=>saved.set(key,value)};
  const reopen=()=>createLivestock(storage,{survival:true,clock:()=>now});
  return {reopen,get now(){return now;},advance(ms){now+=ms;}};
}

test('legacy fish inventory quotes a mixed catch before selling, prioritizing higher full prices',()=>{
  const time=setup();
  const market=time.reopen();
  const quote=market.fishQuote();
  assert.equal(quote.allowance,5);
  assert.equal(quote.fullPriceCount,5);
  assert.equal(quote.surplusCount,3);
  assert.equal(quote.value,2*26+3*7+3*2);
  assert.equal(market.fish.mandarin,2);
  assert.equal(market.coins,10000);
  market.sellFish();
  assert.equal(market.coins,10000+quote.value);
  assert.equal(market.fishQuote().count,0);
  market.sellFish();
  assert.equal(market.coins,10000+quote.value);
});

test('fish demand survives reloads, price previews, and a clock moving backwards',()=>{
  const time=setup();
  const market=time.reopen();
  market.sellFish('crucian');
  assert.equal(market.fishQuote('mandarin').allowance,0);
  const reopened=time.reopen();
  const visualClock=createYardClock(time.now);
  visualClock.nextSeason();
  visualClock.nextPeriod(time.now);
  assert.equal(reopened.fishQuote('mandarin').value,18);
  assert.equal(reopened.fishQuote('mandarin',time.now-1).allowance,0);
  time.advance(gameDayMilliseconds-1);
  assert.equal(reopened.fishQuote('mandarin').allowance,0);
  time.advance(1);
  assert.equal(reopened.fishQuote('mandarin').allowance,fishMarket.fullPriceCount);
  assert.equal(reopened.fishQuote('mandarin').value,52);
  reopened.sellFish('mandarin');
  assert.equal(time.reopen().fishQuote().allowance,3);
});

test('the basket limits new fish while preserving an over-capacity legacy catch',()=>{
  const time=setup({fish:{crucian:fishBasketCapacity+1,mandarin:2}});
  let market=time.reopen();
  assert.deepEqual(market.fishBasket,{count:fishBasketCapacity+3,capacity:fishBasketCapacity,full:true});
  assert.match(market.catchFish('carp'),/鱼篓满了/);
  assert.equal(market.fish.carp,0);
  market.sellFish('crucian');
  for(let count=2;count<fishBasketCapacity;count++)market.catchFish('carp');
  market=time.reopen();
  assert.deepEqual(market.fishBasket,{count:fishBasketCapacity,capacity:fishBasketCapacity,full:true});
  assert.equal(market.fish.mandarin,2);
  assert.match(market.catchFish('carp'),/鱼篓满了/);
  market.sellFish('mandarin');
  assert.equal(market.fishBasket.full,false);
  assert.match(market.catchFish('carp'),/钓到/);
});

test('fertilizing a watered legacy crop persists until harvest, then a new planting can be fertilized',()=>{
  const wateredAt=gameDayMilliseconds*8;
  const time=setup({nextPlotId:2,plots:[{id:1,x:0,z:0,crop:'rice',plantedAt:wateredAt-1,wateredAt}]});
  let market=time.reopen();
  assert.equal(market.plots[0].fertilized,false);
  assert.equal(cropStage(market.plots[0],time.now),'growing');
  assert.match(market.fertilizePlot(2),/自己的田/);
  assert.match(market.fertilizePlot(1,time.now-1),/开始生长/);
  assert.equal(market.energy,100);
  assert.match(market.fertilizePlot(1),/施肥完成/);
  market=time.reopen();
  assert.equal(market.plots[0].fertilized,true);
  assert.match(market.fertilizePlot(1),/已经施过肥/);
  assert.equal(market.energy,100-cropFertilizer.energy);
  assert.equal(market.coins,10000);
  time.advance(crops.rice.seconds*1000*cropFertilizer.growthTimeMultiplier-1);
  assert.equal(cropStage(market.plots[0],time.now),'growing');
  time.advance(1);
  assert.equal(cropStage(market.plots[0],time.now),'ready');
  assert.match(market.fertilizePlot(1),/已经熟了/);
  market.harvest(1,time.now);
  assert.equal(market.crops.rice,crops.rice.yield);
  market.plant(1,'rice',time.now);
  assert.equal(market.plots[0].fertilized,false);
  assert.match(market.fertilizePlot(1),/先浇水/);
  market.waterPlot(1,time.now);
  assert.match(market.fertilizePlot(1),/施肥完成/);
});

test('feeding costs coins and energy per animal, and mature produce is paid once',()=>{
  const time=setup({coins:2*livestockTypes.chicken.price+livestockTypes.chicken.feedPrice});
  const market=time.reopen();
  const chicken=livestockTypes.chicken;
  market.buy('chicken');
  market.buy('chicken');
  market.care('chicken',time.now);
  assert.equal(market.coins,0);
  assert.equal(market.energy,98);
  assert.deepEqual(market.animals.map(animal=>Boolean(animal.fedAt)),[true,false]);
  market.care('chicken',time.now);
  assert.equal(market.energy,98);
  time.advance(chicken.seconds*1000);
  const reopened=time.reopen();
  reopened.care('chicken',time.now);
  assert.equal(reopened.coins,chicken.value);
  assert.equal(reopened.energy,98);
  reopened.care('chicken',time.now);
  assert.equal(reopened.coins,chicken.value-chicken.feedPrice);
  assert.equal(reopened.energy,96);
});

test('fishing can fund a seed with an empty wallet and grow it into operating cash',()=>{
  const time=setup({coins:plotPrice});
  const market=time.reopen();
  market.buyPlot({x:0,z:0});
  assert.equal(market.coins,0);
  market.sellFish('mandarin');
  market.plant(1,'rice',time.now);
  assert.equal(market.coins,52-crops.rice.price);
  market.waterPlot(1,time.now);
  time.advance(crops.rice.seconds*1000);
  market.harvest(1,time.now);
  market.sellCrops();
  assert.equal(time.reopen().coins,52-crops.rice.price+crops.rice.value*crops.rice.yield);
});
