import test from "node:test";
import assert from "node:assert/strict";
import { applyFarmAction, createFarm, loadFarm, normalizeFarm, saveFarm } from "../src/farm-state.js";
import { createWorld, getRegion, getSettlement, HORSE_PRICE, normalizeWorld, planRoute, TEMPLE, WORLD_REGIONS, WORLD_ROUTES } from "../src/world-state.js";

const NOW = new Date("2026-11-13T12:00:00+08:00").getTime();
const step = (state, action) => {
  const result = applyFarmAction(state, action, NOW);
  assert.equal(result.ok, true, result.messageEn);
  return result.state;
};
const withFarm = () => {
  let state = step(createFarm(NOW), { type: "buyPlot", plotId: "meadow-west" });
  state = step(state, { type: "buyAnimal", plotId: "meadow-west", animalType: "sheep" });
  return step(state, { type: "renameAnimal", animalId: "animal-1", name: "云朵" });
};

test("legacy farm save gains world defaults without losing any existing property", () => {
  const legacy = withFarm();
  delete legacy.world;
  const snapshot = structuredClone(legacy);
  const migrated = normalizeFarm(legacy, NOW);
  assert.deepEqual(migrated.world, createWorld());
  const { world, ...retained } = migrated;
  assert.deepEqual(retained, snapshot);
  assert.deepEqual(legacy, snapshot);
  assert.equal(migrated.version, 1);
});

test("all five regions allow a home and free relocation preserves farm assets", () => {
  let state = withFarm();
  const { world, ...originalAssets } = structuredClone(state);
  const homeIds = new Set();
  for (const region of WORLD_REGIONS) {
    assert.equal(region.settlements.length, 2);
    for (const settlement of region.settlements) {
      homeIds.add(settlement.id);
      const before = structuredClone(state);
      state = step(state, { type: "settleHome", regionId: region.id, settlementId: settlement.id });
      assert.deepEqual(state.world.home, { regionId: region.id, settlementId: settlement.id });
      const { world: changedWorld, ...assets } = state;
      assert.deepEqual(assets, originalAssets);
      assert.deepEqual(before.animals, state.animals);
    }
  }
  assert.equal(homeIds.size, 10);
  assert.equal(WORLD_REGIONS.length, 5);
  assert.equal(TEMPLE.regionId, "ruili");
  assert.equal(TEMPLE.name, "瑞丽总佛寺");
});

test("invalid homes and caller supplied balance or prices are rejected", () => {
  const state = withFarm();
  const actions = [
    { type: "settleHome", regionId: "missing", settlementId: "ruili-river" },
    { type: "settleHome", regionId: "ruili", settlementId: "mangshi-bamboo" },
    { type: "settleHome", regionId: "ruili", settlementId: "ruili-river", coins: 999999 },
    { type: "buyHorse", price: 0 },
    { type: "setTransport", transport: "car" },
    { type: "setTransport", transport: "horse", horseOwned: true },
    { type: "recharge", amount: 1000 },
  ];
  for (const action of actions) {
    const result = applyFarmAction(state, action, NOW);
    assert.equal(result.ok, false);
    assert.deepEqual(result.state, state);
  }
});

test("horse ownership is purchased once and switching transport is free", () => {
  const state = withFarm();
  assert.equal(applyFarmAction(state, { type: "setTransport", transport: "horse" }, NOW).ok, false);
  const adopted = step(state, { type: "buyHorse" });
  assert.equal(adopted.coins, state.coins - HORSE_PRICE);
  assert.equal(adopted.world.horseOwned, true);
  assert.equal(adopted.world.transport, "walk");
  const duplicate = applyFarmAction(adopted, { type: "buyHorse" }, NOW);
  assert.equal(duplicate.ok, false);
  assert.deepEqual(duplicate.state, adopted);
  const riding = step(adopted, { type: "setTransport", transport: "horse" });
  assert.equal(riding.world.transport, "horse");
  assert.equal(riding.coins, adopted.coins);
  assert.deepEqual(step(riding, { type: "setTransport", transport: "walk" }), adopted);
  assert.equal(state.world.horseOwned, false);
});

test("horse purchase respects exact balance and rejects missing funds", () => {
  for (const balance of [0, HORSE_PRICE - 1]) {
    const state = { ...createFarm(NOW), coins: balance };
    const result = applyFarmAction(state, { type: "buyHorse" }, NOW);
    assert.equal(result.ok, false);
    assert.equal(result.state.coins, balance);
    assert.equal(result.state.world.horseOwned, false);
  }
  const exact = step({ ...createFarm(NOW), coins: HORSE_PRICE }, { type: "buyHorse" });
  assert.equal(exact.coins, 0);
  assert.equal(exact.world.horseOwned, true);
});

test("world save normalization rejects invalid regions, forged transport and non-boolean ownership", () => {
  for (const raw of [null, [], "bad", undefined]) assert.deepEqual(normalizeWorld(raw), createWorld());
  const malformed = { home: { regionId: "mangshi", settlementId: "ruili-river" }, transport: "horse", horseOwned: "true", balance: 2000 };
  assert.deepEqual(normalizeWorld(malformed), createWorld());
  assert.deepEqual(normalizeWorld({ home: null, transport: "horse", horseOwned: false }), createWorld());
  assert.deepEqual(normalizeWorld({ home: { regionId: "ruili", settlementId: "ruili-grove", extra: "drop" }, transport: "car", horseOwned: true }), {
    home: { regionId: "ruili", settlementId: "ruili-grove" }, transport: "walk", horseOwned: true,
  });
});

test("home and horse survive save/load while preserving companion names and assets", () => {
  let state = step(withFarm(), { type: "settleHome", regionId: "ruili", settlementId: "ruili-grove" });
  state = step(state, { type: "buyHorse" });
  state = step(state, { type: "setTransport", transport: "horse" });
  const data = new Map();
  const storage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) };
  assert.equal(saveFarm(storage, state), true);
  assert.deepEqual(loadFarm(storage, NOW), state);
  assert.equal(loadFarm(storage, NOW).animals[0].name, "云朵");
});

test("route planner finds connected shortest paths with game minutes for every region pair", () => {
  for (const from of WORLD_REGIONS) {
    for (const to of WORLD_REGIONS) {
      const walk = planRoute(from.id, to.id);
      const horse = planRoute(from.id, to.id, "horse");
      assert.equal(walk.regions[0], from.id);
      assert.equal(walk.regions.at(-1), to.id);
      assert.deepEqual(horse.regions, walk.regions);
      assert.equal(horse.gameMinutes, Math.ceil(walk.gameMinutes / 2));
      let accumulated = 0;
      for (let index = 1; index < walk.regions.length; index++) {
        const first = walk.regions[index - 1], second = walk.regions[index];
        const edge = WORLD_ROUTES.find(item => item.from === first && item.to === second || item.from === second && item.to === first);
        assert.ok(edge);
        accumulated += edge.walkMinutes;
      }
      assert.equal(walk.gameMinutes, accumulated);
      assert.deepEqual(planRoute(from.id, to.id), walk);
    }
  }
  assert.deepEqual(planRoute("ruili", "yingjiang"), { regions: ["ruili", "longchuan", "yingjiang"], transport: "walk", gameMinutes: 18 });
  assert.deepEqual(planRoute("ruili", "ruili"), { regions: ["ruili"], transport: "walk", gameMinutes: 0 });
  for (const args of [["missing", "ruili"], ["ruili", null], ["ruili", "mangshi", "car"], ["ruili", "mangshi", "__proto__"], ["ruili", "mangshi", {}]]) assert.equal(planRoute(...args), null);
  assert.equal(getRegion("__proto__"), null);
  assert.equal(getSettlement("ruili", "mangshi-bamboo"), null);
});
