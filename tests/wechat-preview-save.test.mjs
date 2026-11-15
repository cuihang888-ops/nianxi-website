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
