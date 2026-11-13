import test from "node:test";
import assert from "node:assert/strict";
import Daily from "../wechat/vendor/daily-state.cjs";
import { createPreviewSave } from "../wechat/platform/preview-save.js";
import { createWechatAdapter } from "../wechat/platform/wechat-adapter.js";

function storage(legacy) {
  const entries = new Map(legacy === undefined ? [] : [["anheli-minigame-v1", legacy]]);
  return { entries, getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) };
}
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
