import assert from 'node:assert/strict';
import test from 'node:test';
import {createLivestock,homeBuildSeconds,homesteadPrice,survivalHomePrices} from '../demos/anheli-module-yard/livestock.js';
import {gameDayMilliseconds} from '../demos/anheli-module-yard/yard-clock.js';

const start=1_000_000;

function memoryStorage() {
  const records=new Map();
  return {
    getItem:key=>records.get(key)??null,
    setItem:(key,value)=>records.set(key,value),
  };
}

test('the survival start carries only 10000 coins in its own save',()=>{
  const storage=memoryStorage(),clock=()=>start;
  const legacy=createLivestock(storage,{clock});
  legacy.buy('horse');
  const survival=createLivestock(storage,{clock,survival:true});
  assert.equal(survival.coins,10000);
  assert.equal(survival.homeId,null);
  assert.equal(survival.snapshot().homesteadOwned,false);
  assert.equal(survival.animals.length,0);
  assert.equal(survival.plots.length,0);
  assert.deepEqual(survival.ownedHomes,[]);
  assert.equal(createLivestock(storage,{clock}).coins,240);
  assert.equal(createLivestock(storage,{clock}).animals[0].species,'horse');
});

test('prices order construction times and the homestead is paid once',()=>{
  let now=start;
  const storage=memoryStorage();
  const open=()=>createLivestock(storage,{clock:()=>now,survival:true});
  let economy=open();
  const sorted=Object.keys(survivalHomePrices).sort((left,right)=>survivalHomePrices[left]-survivalHomePrices[right]);
  for(let index=1;index<sorted.length;index++){
    assert.ok(homeBuildSeconds[sorted[index]]>homeBuildSeconds[sorted[index-1]]);
  }
  assert.equal(economy.houseQuote('simple_shed').total,180+homesteadPrice);
  economy.buyHome('simple_shed');
  assert.equal(economy.coins,9520);
  assert.equal(economy.homeId,null);
  assert.equal(economy.snapshot().homesteadOwned,true);
  economy.buyHome('grand_estate');
  assert.equal(economy.coins,9520);
  assert.equal(economy.construction.id,'simple_shed');
  now+=homeBuildSeconds.simple_shed*1000-1;
  economy=open();
  assert.equal(economy.settle(),null);
  now+=1;
  assert.equal(economy.settle(),'simple_shed');
  assert.equal(economy.settle(),null);
  assert.equal(economy.homeId,'simple_shed');
  assert.equal(economy.houseQuote('grand_estate').total,4500);
  economy.buyHome('grand_estate');
  assert.equal(economy.coins,5020);
  assert.equal(economy.homeId,'simple_shed');
  now+=homeBuildSeconds.grand_estate*1000;
  economy=open();
  assert.equal(economy.settle(),'grand_estate');
  assert.equal(economy.homeId,'grand_estate');
  assert.deepEqual(economy.ownedHomes,['simple_shed','grand_estate']);
});

test('house condition follows each property and repairs never create resale profit',()=>{
  let now=start;
  const economy=createLivestock(memoryStorage(),{clock:()=>now,survival:true});
  economy.buyHome('lumber_cabin');
  now+=homeBuildSeconds.lumber_cabin*1000;
  economy.settle();
  economy.buyHome('simple_shed');
  now+=homeBuildSeconds.simple_shed*1000;
  economy.settle();
  const balance=economy.coins;
  now=start+homeBuildSeconds.lumber_cabin*1000+gameDayMilliseconds*3;
  assert.equal(economy.houseQuote('lumber_cabin').condition,99);
  assert.equal(economy.houseQuote('simple_shed').condition,100);
  assert.equal(economy.coins,balance);
  assert.equal(economy.homeId,'simple_shed');
  const before=economy.houseQuote('lumber_cabin');
  economy.repairHome('lumber_cabin');
  const after=economy.houseQuote('lumber_cabin');
  assert.equal(after.condition,100);
  assert.equal(economy.coins,balance-before.repairCost);
  assert.ok(after.saleValue-before.saleValue<before.repairCost);
  now+=365*24*60*60*1000;
  assert.equal(economy.houseQuote('lumber_cabin').condition,50);
  assert.equal(economy.coins,balance-before.repairCost);
});

test('system trade preserves condition, stock and the homestead across reloads',()=>{
  let now=start;
  const storage=memoryStorage();
  const open=()=>createLivestock(storage,{clock:()=>now,survival:true});
  let economy=open();
  economy.buyHome('simple_shed');
  now+=homeBuildSeconds.simple_shed*1000+gameDayMilliseconds*3*8;
  economy.settle();
  const quote=economy.houseQuote('simple_shed');
  const before=economy.coins;
  assert.equal(quote.condition,92);
  economy.sellHome('simple_shed');
  economy.sellHome('simple_shed');
  economy=open();
  assert.equal(economy.coins,before+quote.saleValue);
  assert.equal(economy.homeId,null);
  assert.equal(economy.snapshot().homesteadOwned,true);
  const listing=economy.houseQuote('simple_shed');
  assert.equal(listing.usedCondition,92);
  assert.ok(listing.usedPrice>quote.saleValue);
  economy.buyUsedHome('simple_shed');
  economy.buyUsedHome('simple_shed');
  economy=open();
  assert.equal(economy.coins,before+quote.saleValue-listing.usedPrice);
  assert.equal(economy.homeId,'simple_shed');
  assert.equal(economy.houseQuote('simple_shed').condition,92);
  assert.equal(economy.houseQuote('simple_shed').usedPrice,0);
});

test('legacy owned houses restore intact and gifted houses have no sale payout',()=>{
  const storage=memoryStorage();
  storage.setItem('anheli-independent-yard-livestock-v1',JSON.stringify({
    coins:123,nextId:1,animals:[],nextPlotId:1,plots:[],homeId:'merchant',ownedHomes:['merchant'],
  }));
  const economy=createLivestock(storage,{clock:()=>start});
  assert.equal(economy.homeId,'merchant');
  assert.equal(economy.houseQuote('merchant').condition,100);
  economy.sellHome('simple_shed');
  assert.equal(economy.coins,123);
  economy.sellHome('merchant');
  assert.equal(economy.homeId,'lumber_cabin');
  assert.equal(economy.coins,123+1020);
});
