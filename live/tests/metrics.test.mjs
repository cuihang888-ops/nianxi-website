import test from 'node:test';
import assert from 'node:assert/strict';
import { totals, change, decomposeSales } from '../public/metrics.js';
test('Shapley contributions reconstruct signed sales changes without order dependence', () => {
  const previous = {reach:10000,messages:100,qualified:80,orders:20,orderAmount:30000};
  const current = {reach:15000,messages:200,qualified:110,orders:22,orderAmount:38500};
  const factors = decomposeSales(current,previous);
  assert.equal(factors.length,5);
  assert.ok(Math.abs(factors.reduce((sum,x)=>sum+x.value,0)-8500)<1e-7);
  const reverse = decomposeSales(previous,current);
  factors.forEach((f,i)=>assert.ok(Math.abs(f.value+reverse[i].value)<1e-7));
  decomposeSales(previous,previous).forEach(f=>assert.equal(f.value,0));
});
test('zero chain denominators refuse to manufacture a contribution', () => {
  const value={reach:100,messages:20,qualified:10,orders:5,orderAmount:2000};
  for(const key of ['reach','messages','qualified','orders']) assert.equal(decomposeSales(value,{...value,[key]:0}),null);
  assert.equal(change(100,0),null);
});
test('actual duration sums only recorded values and preserves missing registration', () => {
  const result=totals([{actualMinutes:120,orderAmount:3000},{actualMinutes:0,orderAmount:0},{actualMinutes:null,orderAmount:1000},{}]);
  assert.equal(result.actualMinutes,120);assert.equal(result.missingDuration,2);assert.equal(result.orderAmount,4000);
});
