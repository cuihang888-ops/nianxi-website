import assert from 'node:assert/strict';
import test from 'node:test';
import {bounds} from '../demos/anheli-module-yard/yard.js';
import {homeSites} from '../demos/anheli-module-yard/yard-home-sites.js';
import {routeThroughYard} from '../demos/anheli-module-yard/yard-navigation.js';
import {fieldTerrainBlock,groundHeight,lakeArrival,pondBlocks,shoreApproach,shoreFishingSpot} from '../demos/anheli-module-yard/woodland.js';

const terrainBlocked=(x,z)=>x<bounds.minX||x>bounds.maxX||z<bounds.minZ||z>bounds.maxZ||pondBlocks(x,z);

test('casting is available along separate dry banks and places the float in the lake',()=>{
  const banks=[lakeArrival,{x:-19.4,z:-.1},{x:-25.3,z:-5.9},{x:-31.2,z:-14},{x:-15.5,z:-20},{x:-4.2,z:-13}];
  for(const bank of banks){
    const spot=shoreFishingSpot(bank.x,bank.z);
    assert.ok(spot,JSON.stringify(bank));
    assert.deepEqual({x:spot.x,z:spot.z},bank);
    assert.ok(!terrainBlocked(bank.x,bank.z));
    assert.ok(pondBlocks(spot.bobber.x,spot.bobber.z));
    assert.ok(routeThroughYard(lakeArrival,bank,bounds,terrainBlocked).length);
  }
  assert.equal(shoreFishingSpot(-15.5,-5.9),null);
  assert.equal(shoreFishingSpot(-1.8,4),null);
});

test('a shallow-water tap can guide the player to dry bank but deep and obstructed targets are rejected',()=>{
  const {bobber}=shoreFishingSpot(lakeArrival.x,lakeArrival.z);
  const bank=shoreApproach(bobber.x,bobber.z,terrainBlocked);
  assert.ok(bank);
  assert.ok(shoreFishingSpot(bank.x,bank.z));
  assert.equal(shoreApproach(bobber.x,bobber.z,()=>true),null);
  assert.equal(shoreApproach(-15.5,-5.9,terrainBlocked),null);
});

test('roadside home sites are flat, outside water, and reachable from the existing yard',()=>{
  for(const site of homeSites.filter(home=>home.width)){
    assert.ok(!terrainBlocked(site.front.x,site.front.z));
    assert.ok(routeThroughYard(lakeArrival,site.front,bounds,terrainBlocked).length);
    for(const dx of [-1,1])for(const dz of [-1,1]){
      const x=site.x+dx*site.width/2,z=site.z+dz*site.depth/2;
      assert.ok(!terrainBlocked(x,z));
      assert.equal(groundHeight(x,z),groundHeight(site.x,site.z));
      assert.ok(fieldTerrainBlock(x,z));
    }
  }
});
