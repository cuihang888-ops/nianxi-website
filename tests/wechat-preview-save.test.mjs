import test from "node:test";
import assert from "node:assert/strict";
import Daily from "../wechat/vendor/daily-state.cjs";
import { createPreviewSave } from "../wechat/platform/preview-save.js";
import { createWechatAdapter } from "../wechat/platform/wechat-adapter.js";
import { createLocalSaveRepository } from "../wechat/platform/save-repository.js";

function storage(legacy) {
  const entries = new Map(legacy === undefined ? [] : [["anheli-minigame-v1", legacy]]);
  return { entries, getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) };
}

function establishedHome(dam = "mangshi", custom = false) {
  const state = Daily.defaultState();
  state.home = Daily.createHome(custom ? -1 : 0, custom ? -1 : 0, "Original home", dam);
  if (custom) state.home.custom = { x: -120, z: -35 };
  Object.assign(state.home, {
    hut: true, house: 2, field: true, beds: { crop: "carrot", readyAt: 5000 }, harvests: 7,
    animals: { chicken: 1, rabbit: 1, sheep: 1 }, produce: { egg: 2, wool: 1, fur: 3 },
    basket: { carrot: 16, egg: 7, wool: 2, fur: 4 }, produceNext: { chicken: 5001, rabbit: 5002, sheep: 5003 },
  });
  state.coins = 0.5;
  state.horse = { owned: true, dam: "longchuan", x: 20, z: 35, bond: 80, careDate: "", careCount: 0 };
  state.playerRoads = { ruili: [{ a: { x: -150, z: 35 }, b: { x: -150, z: 5 } }] };
  return state;
}

const homeAssets = home => {
  const { site, plot, label, dam, custom, ...assets } = home;
  return assets;
};

test("fixed and custom homes can relocate across dams and within a dam without losing saved assets", () => {
  for (const custom of [false, true]) {
    const original = establishedHome("mangshi", custom), raw = JSON.stringify(original), store = storage(raw);
    let session = createPreviewSave(store, () => 100);
    const assets = structuredClone(homeAssets(session.state.home)), horse = structuredClone(session.state.horse);
    const roads = structuredClone(session.state.playerRoads);
    const destinations = [
      { site: 0, plot: 1, dam: "ruili" },
      { site: -1, plot: -1, dam: "ruili", custom: { x: -136, z: 5 } },
      { site: -1, plot: -1, dam: "ruili", custom: { x: -136, z: -10 } },
      { site: 1, plot: 2, dam: "lianghe" },
    ];
    for (const destination of destinations) {
      assert.equal(session.transact(state => Daily.relocateHome(state, destination)).ok, true);
      assert.equal(session.state.coins, 0.5, "relocation is free even without enough money to buy a new plot");
      assert.deepEqual(homeAssets(session.state.home), assets);
      assert.deepEqual(session.state.horse, horse);
      assert.deepEqual(session.state.playerRoads, roads);
      assert.equal(session.state.home.dam, destination.dam);
      assert.equal(session.state.home.site, destination.site);
      assert.equal(session.state.home.plot, destination.plot);
      if (destination.custom) assert.deepEqual(session.state.home.custom, destination.custom);
      else assert.equal(Object.hasOwn(session.state.home, "custom"), false);
      const committed = structuredClone(session.state);
      session = createPreviewSave(store, () => 200);
      assert.deepEqual(session.state, committed, "reopening restores the destination and all production clocks");
      assert.equal(store.entries.get("anheli-minigame-v1"), raw, "original legacy save remains intact");
    }
  }
});

test("failed relocation saves preserve old coordinates and assets and permit a clean retry", () => {
  const store = storage(JSON.stringify(establishedHome("mangshi", true)));
  const session = createPreviewSave(store, () => 100), before = structuredClone(session.state);
  const saved = store.entries.get("anheli-minigame-v2:save");
  let failWrites = true;
  store.setItem = (key, value) => { if (failWrites) throw new Error("quota"); store.entries.set(key, value); };
  const destination = { site: 0, plot: 0, dam: "ruili" };
  assert.equal(session.transact(state => Daily.relocateHome(state, destination)).ok, false);
  assert.deepEqual(session.state, before);
  assert.equal(store.entries.get("anheli-minigame-v2:save"), saved);
  assert.deepEqual(createPreviewSave(store, () => 200).state, before);
  failWrites = false;
  assert.equal(session.transact(state => Daily.relocateHome(state, destination)).ok, true);
  const relocated = createPreviewSave(store, () => 300).state;
  assert.equal(relocated.home.dam, "ruili");
  assert.equal(relocated.coins, before.coins);
  assert.deepEqual(homeAssets(relocated.home), homeAssets(before.home));
});

test("same-place and invalid relocation requests leave the persisted home unchanged", () => {
  for (const custom of [false, true]) {
    const store = storage(JSON.stringify(establishedHome("ruili", custom))), session = createPreviewSave(store, () => 100);
    const before = structuredClone(session.state), saved = store.entries.get("anheli-minigame-v2:save");
    const same = { site: before.home.site, plot: before.home.plot, dam: "ruili" };
    if (custom) same.custom = structuredClone(before.home.custom);
    assert.equal(session.transact(state => Daily.relocateHome(state, same)).error.code, "HOME_SAME_PLOT");
    for (const destination of [
      { site: 0, plot: 0, dam: "missing" }, { site: 0, plot: 8, dam: "ruili" },
      { site: -1, plot: -1, dam: "ruili", custom: { x: Infinity, z: 5 } },
      { site: -1, plot: -1, dam: "ruili", custom: { x: 500, z: 500 } },
    ]) assert.equal(session.transact(state => Daily.relocateHome(state, destination)).ok, false);
    assert.deepEqual(session.state, before);
    assert.equal(store.entries.get("anheli-minigame-v2:save"), saved);
  }
});

test("a fresh local preview starts with 1000 and reopening never grants again", () => {
  const store = storage();
  const session = createPreviewSave(store, () => 100);
  assert.equal(session.ok, true);
  assert.equal(session.cloudSynced, false);
  assert.equal(session.state.coins, 1000);
  assert.equal(session.save().ok, true);
  assert.equal(createPreviewSave(store, () => 200).state.coins, 1000);
  assert.equal(session.transact(state => Daily.claimHome(state, 0, 0, "ruili")).ok, true);
  assert.equal(session.transact(Daily.buildHomeHut).ok, true);
  assert.equal(session.transact(Daily.openHomeField).ok, true);
  assert.equal(session.transact(state => Daily.plantCarrots(state, 100)).ok, true);
  assert.equal(session.transact(state => Daily.buyHomeAnimal(state, "chicken", 100)).ok, true);
  const reopened = createPreviewSave(store, () => 300);
  assert.equal(reopened.state.coins, 388);
  assert.equal(reopened.state.home.dam, "ruili");
  assert.equal(reopened.state.home.hut, true);
  assert.equal(reopened.state.home.field, true);
  assert.equal(reopened.state.home.animals.chicken, 1);
  assert.equal(reopened.state.home.beds.crop, "carrot");
  assert.equal(reopened.save().ok, true);
  assert.equal(createPreviewSave(store, () => 400).state.coins, 388);
});

test("existing and migrated balances are never replaced or topped up by the new grant", () => {
  for (const coins of [1200, 1000, 799.5, 0, 12345.5]) {
    const old = Daily.defaultState();
    old.coins = coins;
    delete old.lit;
    const raw = JSON.stringify(old), store = storage(raw);
    const migrated = createPreviewSave(store, () => 100);
    assert.equal(migrated.ok, true);
    assert.equal(migrated.state.coins, coins);
    assert.deepEqual(migrated.state.lit, coins === 1200 ? {} : { mangshi: true });
    assert.equal(store.entries.get("anheli-minigame-v1"), raw);
    const reopened = createPreviewSave(store, () => 200);
    assert.equal(reopened.state.coins, coins);
    assert.equal(reopened.save().ok, true);
    assert.equal(createPreviewSave(store, () => 300).state.coins, coins);
    // A v2 save takes precedence over an old v1 copy, including a higher balance.
    store.entries.set("anheli-minigame-v1", JSON.stringify({ ...old, coins: 50000 }));
    assert.equal(createPreviewSave(store, () => 400).state.coins, coins);
  }
});

test("already saved v2 balances survive loading and future saves without a new-player award", () => {
  for (const coins of [1200, 799.5, 0, 12345.5]) {
    const old = Daily.defaultState();
    old.coins = coins;
    const store = storage();
    const repository = createLocalSaveRepository(store, {
      namespace: "anheli-minigame-v2", validate: Daily.validateState, now: () => 100,
    });
    assert.equal(repository.save(old, { expectedRevision: 0 }).ok, true);
    const raw = store.entries.get("anheli-minigame-v2:save");
    const session = createPreviewSave(store, () => 200);
    assert.equal(session.state.coins, coins);
    assert.equal(store.entries.get("anheli-minigame-v2:save"), raw);
    assert.equal(session.save().ok, true);
    assert.equal(createPreviewSave(store, () => 300).state.coins, coins);
  }
});

test("an explicit free trial supply is saved once without resetting old homes or balances", () => {
  const old = Daily.defaultState();
  Daily.claimHome(old, 0, 0, "ruili");
  Daily.buildHomeHut(old);
  old.coins = 0;
  const home = structuredClone(old.home);
  const store = storage(JSON.stringify(old));
  const session = createPreviewSave(store, () => 100);
  assert.equal(session.state.coins, 0);
  assert.equal(session.transact(Daily.claimTrialSupply).ok, true);
  assert.equal(session.state.coins, Daily.ECONOMY.trialSupplyCoins);
  assert.deepEqual(session.state.home, home);
  const restored = createPreviewSave(store, () => 200);
  assert.equal(restored.state.trialSupplyClaimed, true);
  assert.equal(restored.transact(Daily.claimTrialSupply).error.code, "TRIAL_SUPPLY_CLAIMED");
  assert.equal(restored.state.coins, Daily.ECONOMY.trialSupplyCoins);
  assert.deepEqual(restored.state.home, home);
});

test("supply and road transactions cannot award or charge when persistence fails", () => {
  const store = storage();
  const session = createPreviewSave(store, () => 100);
  assert.equal(session.save().ok, true);
  const write = store.setItem;
  store.setItem = () => { throw new Error("quota"); };
  assert.equal(session.transact(Daily.claimTrialSupply).ok, false);
  assert.equal(session.state.coins, 1000);
  assert.equal(session.state.trialSupplyClaimed, undefined);
  const road = { a: { x: -150, z: 35 }, b: { x: -150, z: 5 } };
  assert.equal(session.transact(state => Daily.buildPlayerRoad(state, road)).ok, false);
  assert.equal(session.state.playerRoads, undefined);
  assert.equal(session.state.coins, 1000);
  store.setItem = write;
  assert.equal(session.transact(Daily.claimTrialSupply).ok, true);
  assert.equal(session.transact(state => Daily.buildPlayerRoad(state, road)).ok, true);
  assert.equal(session.state.coins, 3940);
  const restored = createPreviewSave(store, () => 200);
  assert.deepEqual(restored.state.playerRoads, { ruili: [road] });
  assert.equal(restored.state.coins, 3940);
});

test("preview copies a validated legacy save once and preserves the original", () => {
  const original = Daily.defaultState();
  original.coins = 987;
  delete original.latestDay;
  const raw = JSON.stringify(original), store = storage(raw);
  const session = createPreviewSave(store, () => 100);
  assert.equal(session.ok, true);
  assert.equal(session.state.coins, 987);
  assert.equal(store.entries.get("anheli-minigame-v1"), raw);
  assert.equal(session.transact(state => { state.coins = 654; }).ok, true);
  assert.equal(createPreviewSave(store, () => 100).state.coins, 654);
});
test("invalid legacy progress stays intact and blocks replacement", () => {
  const store = storage("broken save");
  const session = createPreviewSave(store, () => 100);
  assert.equal(session.ok, false);
  assert.equal(session.transact(state => { state.coins = 999; }).ok, false);
  assert.equal(store.entries.size, 1);
  assert.equal(store.entries.get("anheli-minigame-v1"), "broken save");
});
test("migration write failure preserves the old save and allows a later retry", () => {
  const store = storage(JSON.stringify(Daily.defaultState()));
  let failing = true;
  store.setItem = (key, value) => { if (failing) throw new Error("quota"); store.entries.set(key, value); };
  assert.equal(createPreviewSave(store, () => 100).ok, false);
  assert.equal(store.entries.size, 1);
  failing = false;
  assert.equal(createPreviewSave(store, () => 100).ok, true);
});

test("raw wx object progress migrates once while regular storage and the original stay unchanged", () => {
  const original = Daily.defaultState();
  original.coins = 987.5;
  delete original.latestDay;
  delete original.horse;
  const entries = new Map([["anheli-minigame-v1", original]]);
  let reads = 0;
  const api = {
    getStorageSync(key) { if (key === "anheli-minigame-v1") reads++; return entries.get(key) ?? ""; },
    setStorageSync(key, value) { entries.set(key, value); },
  };
  const { storage: adapterStorage } = createWechatAdapter(api, { backendBaseUrl: "" });
  assert.throws(() => adapterStorage.getItem("anheli-minigame-v1"), TypeError);
  reads = 0;
  const session = createPreviewSave(adapterStorage, () => 100);
  assert.equal(session.ok, true);
  assert.equal(session.state.coins, 987.5);
  assert.equal(session.state.horse, null);
  assert.equal(entries.get("anheli-minigame-v1"), original);
  assert.equal(Object.hasOwn(original, "latestDay"), false);
  assert.equal(reads, 1);
  assert.equal(session.transact(state => { state.coins = 800; }).ok, true);
  assert.equal(createPreviewSave(adapterStorage, () => 100).state.coins, 800);
  assert.equal(reads, 1);
  assert.equal(original.coins, 987.5);
});
