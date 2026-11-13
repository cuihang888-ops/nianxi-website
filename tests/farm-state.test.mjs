import test from "node:test";
import assert from "node:assert/strict";
import { ECONOMY_CONFIG, PRODUCT_VALUES, validateEconomyConfig } from "../src/economy-config.js";
import {
  ANIMAL_TYPES, CROPS, FARM_KEY, HUNT_COOLDOWN_MS, LAND_PLOTS, advanceFarm, applyFarmAction,
  createFarm, loadFarm, normalizeFarm, saveFarm,
} from "../src/farm-state.js";

const START = new Date(2026, 10, 13, 12).getTime();
const PLOT = "meadow-west";
const BED = `${PLOT}-bed-1`;
const step = (state, action, now = START) => {
  const outcome = applyFarmAction(state, action, now);
  assert.equal(outcome.ok, true, outcome.messageEn);
  return outcome.state;
};
const withLand = () => step(createFarm(START), { type: "buyPlot", plotId: PLOT });
const withSheep = () => step(withLand(), { type: "buyAnimal", plotId: PLOT, animalType: "sheep" });
const fedSheep = () => step(withSheep(), { type: "feed", animalId: "animal-1", feed: "grass" });

test("free economy keeps the shipped prices, production timing, supplies and limits", () => {
  assert.equal(ECONOMY_CONFIG.version, "free-v1");
  assert.equal(ECONOMY_CONFIG.startingCoins, 1200);
  assert.deepEqual(LAND_PLOTS.map(plot => [plot.price, plot.capacity]), [[400, 6], [600, 6], [800, 6], [1100, 6]]);
  assert.deepEqual(Object.values(ANIMAL_TYPES).map(spec => [spec.price, spec.productionMs, spec.productValue]), [[260, 30_000, 32], [180, 24_000, 22], [140, 18_000, 16]]);
  assert.deepEqual(Object.values(CROPS).map(spec => [spec.cost, spec.growMs, spec.yield]), [[12, 20_000, 3], [18, 30_000, 2]]);
  assert.deepEqual(PRODUCT_VALUES, { wool: 32, fur: 22, egg: 16, game: 45 });
  assert.deepEqual(ECONOMY_CONFIG.dailyGift, { coins: 120, inventory: { grass: 2, carrot: 1 } });
  assert.deepEqual(ECONOMY_CONFIG.limits, { maxCoins: 9_999_999, maxItems: 9999, maxReadyProduct: 12 });
  assert.equal(ECONOMY_CONFIG.horse.price, 480);
  assert.equal(validateEconomyConfig(ECONOMY_CONFIG), true);
});

test("economy tables reject invalid values and cannot be changed at runtime", () => {
  const invalidCases = [
    config => { config.animals.sheep.productionMs = 0; },
    config => { config.crops.grass.yield = 0.5; },
    config => { config.products.wool = -1; },
    config => { config.startingCoins = Number.MAX_SAFE_INTEGER + 1; },
    config => { delete config.dailyGift; },
    config => { config.payments = true; },
    config => { config.startingCoins = config.limits.maxCoins + 1; },
    config => { config.care.maxFedCycles = config.care.feedCycles; },
  ];
  for (const mutate of invalidCases) {
    const config = structuredClone(ECONOMY_CONFIG);
    mutate(config);
    assert.throws(() => validateEconomyConfig(config), TypeError);
  }
  assert.throws(() => { ECONOMY_CONFIG.dailyGift.inventory.grass = 999; }, TypeError);
  assert.throws(() => { PRODUCT_VALUES.wool = 999; }, TypeError);
});

test("save files and actions cannot inject economy configuration", () => {
  const state = createFarm(START);
  state.economyConfig = { startingCoins: 999999, land: { meadowWest: 0 } };
  const normalized = normalizeFarm(state, START);
  assert.equal(normalized.economyConfig, undefined);
  const bought = step(state, { type: "buyPlot", plotId: PLOT, price: 0, economyConfig: state.economyConfig });
  assert.equal(bought.coins, 800);
  state.inventory.grass = 100;
  assert.equal(createFarm(START).inventory.grass, 4);
});

test("new farm starts with virtual funds and four independent unowned plots", () => {
  const state = createFarm(START);
  assert.equal(state.coins, 1200);
  assert.equal(state.plots.every(plot => !plot.owned), true);
  assert.deepEqual(LAND_PLOTS.map(({ id, x, z }) => ({ id, x, z })), [
    { id: "meadow-west", x: -19, z: 39 },
    { id: "meadow-east", x: 19, z: 39 },
    { id: "river-west", x: -19, z: 57 },
    { id: "river-east", x: 19, z: 57 },
  ]);
  assert.equal(state.beds.length, 8);
});

test("buying land unlocks its existing beds without double charging", () => {
  const state = withLand();
  assert.equal(state.coins, 800);
  assert.equal(state.beds.find(bed => bed.id === BED).plotId, PLOT);
  const duplicate = applyFarmAction(state, { type: "buyPlot", plotId: PLOT }, START);
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.state.coins, 800);
  const planted = step(state, { type: "plant", bedId: BED, crop: "grass" });
  assert.equal(planted.beds.find(bed => bed.id === BED).crop, "grass");
});

test("unowned land and insufficient balance reject purchases", () => {
  assert.equal(applyFarmAction(createFarm(START), { type: "buyAnimal", plotId: PLOT, animalType: "sheep" }, START).ok, false);
  assert.equal(applyFarmAction(createFarm(START), { type: "plant", bedId: BED, crop: "grass" }, START).ok, false);
  const state = withLand();
  state.coins = 10;
  assert.equal(applyFarmAction(state, { type: "buyPlot", plotId: "meadow-east" }, START).ok, false);
  assert.equal(applyFarmAction(state, { type: "buyAnimal", plotId: PLOT, animalType: "sheep" }, START).ok, false);
});

test("land capacity allows six animals and rejects a seventh", () => {
  let state = withLand();
  state.coins = 10_000;
  for (let index = 0; index < 6; index += 1) {
    state = step(state, { type: "buyAnimal", plotId: PLOT, animalType: "chicken" });
  }
  const rejected = applyFarmAction(state, { type: "buyAnimal", plotId: PLOT, animalType: "rabbit" }, START);
  assert.equal(rejected.ok, false);
  assert.equal(rejected.state.animals.length, 6);
  assert.equal(rejected.state.coins, state.coins);
});

test("renaming a companion is free, normalizes spaces, and changes only its name", () => {
  const state = fedSheep();
  const original = structuredClone(state);
  const renamed = step(state, { type: "renameAnimal", animalId: "animal-1", name: "  小团子\u3000  云朵  " });
  assert.equal(renamed.animals[0].name, "小团子 云朵");
  const expected = structuredClone(original);
  expected.animals[0].name = "小团子 云朵";
  assert.deepEqual(renamed, expected);
  assert.deepEqual(state, original);
});

test("companion names count Unicode code points without splitting emoji", () => {
  const state = withSheep();
  for (const name of ["云", "小羊🐑", "🐑".repeat(12), "👩‍🌾的小羊"]) {
    assert.equal(step(state, { type: "renameAnimal", animalId: "animal-1", name }).animals[0].name, name);
  }
  for (const name of ["云".repeat(13), "🐑".repeat(13)]) {
    const outcome = applyFarmAction(state, { type: "renameAnimal", animalId: "animal-1", name }, START);
    assert.equal(outcome.ok, false);
    assert.deepEqual(outcome.state, state);
  }
});

test("invalid names and missing animals leave the farm unchanged", () => {
  const state = fedSheep();
  const original = structuredClone(state);
  for (const name of [undefined, null, 12, {}, "", "   ", "\u3000", "小\n羊", "小\t羊", "\u0000羊", "\u007f羊", "\u0085羊", "\u202e羊", "\u2066羊", "\u061c羊", "\u200b羊", "\ufeff羊", "\ud800", "\u200d\ufe0f"]) {
    const outcome = applyFarmAction(state, { type: "renameAnimal", animalId: "animal-1", name }, START);
    assert.equal(outcome.ok, false);
    assert.deepEqual(outcome.state, original);
  }
  const missing = applyFarmAction(state, { type: "renameAnimal", animalId: "missing", name: "云朵" }, START);
  assert.equal(missing.ok, false);
  assert.deepEqual(missing.state, original);
  assert.deepEqual(state, original);
});

test("renamed companions survive save/load and legacy names normalize safely", () => {
  const data = new Map();
  const storage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) };
  const state = step(withSheep(), { type: "renameAnimal", animalId: "animal-1", name: "云朵🐑" });
  assert.equal(saveFarm(storage, state), true);
  assert.deepEqual(loadFarm(storage, START), state);
  assert.equal(loadFarm(storage, START + 60_000).animals[0].name, "云朵🐑");
  assert.equal(state.version, 1);
  for (const [legacyName, expected] of [
    ["小羊", "小羊"], ["  云  朵  ", "云 朵"], ["🐑".repeat(13), "🐑".repeat(12)],
    [undefined, "小羊"], ["\u202e小羊", "小羊"], ["\ud800", "小羊"],
  ]) {
    const legacy = structuredClone(state);
    legacy.animals[0].name = legacyName;
    const normalized = normalizeFarm(legacy, START);
    assert.equal(normalized.animals[0].name, expected);
    assert.equal(normalized.coins, state.coins);
    assert.deepEqual(normalized.inventory, state.inventory);
    assert.equal(legacy.animals[0].name, legacyName);
  }
});

test("crop needs watering and full growth; a harvest cannot be replayed", () => {
  let state = step(withLand(), { type: "plant", bedId: BED, crop: "grass" });
  const ready = START + CROPS.grass.growMs;
  assert.equal(applyFarmAction(state, { type: "harvest", bedId: BED }, ready).ok, false);
  state = step(state, { type: "water", bedId: BED });
  assert.equal(applyFarmAction(state, { type: "water", bedId: BED }, START).ok, false);
  assert.equal(applyFarmAction(state, { type: "harvest", bedId: BED }, ready - 1).ok, false);
  state = step(state, { type: "harvest", bedId: BED }, ready);
  assert.equal(state.inventory.grass, 7);
  assert.equal(state.beds.find(bed => bed.id === BED).crop, "");
  assert.equal(applyFarmAction(state, { type: "harvest", bedId: BED }, ready).ok, false);
});

test("hungry animals do not produce and first feeding starts a fresh cycle", () => {
  const later = START + 100_000;
  let state = advanceFarm(withSheep(), later);
  assert.equal(state.animals[0].readyProduct, 0);
  state = step(state, { type: "feed", animalId: "animal-1", feed: "grass" }, later);
  assert.equal(advanceFarm(state, later + 29_999).animals[0].readyProduct, 0);
  assert.equal(advanceFarm(state, later + 30_000).animals[0].readyProduct, 1);
});

test("offline production is limited to fed cycles and cannot be collected twice", () => {
  const later = START + 8 * 60 * 60 * 1000;
  let state = advanceFarm(fedSheep(), later);
  assert.equal(state.animals[0].readyProduct, 2);
  state = step(state, { type: "collect", animalId: "animal-1" }, later);
  assert.equal(state.inventory.wool, 2);
  assert.equal(applyFarmAction(state, { type: "collect", animalId: "animal-1" }, later + 60_000).ok, false);
  assert.equal(advanceFarm(state, later + 60_000).animals[0].readyProduct, 0);
});

test("refeeding after hunger restarts production without retroactive rewards", () => {
  const later = START + 100_000;
  let state = step(fedSheep(), { type: "collect", animalId: "animal-1" }, later);
  state = step(state, { type: "feed", animalId: "animal-1", feed: "carrot" }, later);
  assert.equal(state.animals[0].readyProduct, 0);
  assert.equal(advanceFarm(state, later + 29_999).animals[0].readyProduct, 0);
  assert.equal(advanceFarm(state, later + 30_000).animals[0].readyProduct, 1);
});

test("feeding is capped at four cycles and rejects unknown feed", () => {
  let state = fedSheep();
  state = step(state, { type: "feed", animalId: "animal-1", feed: "grass" });
  const grass = state.inventory.grass;
  const full = applyFarmAction(state, { type: "feed", animalId: "animal-1", feed: "grass" }, START);
  assert.equal(full.ok, false);
  assert.equal(full.state.inventory.grass, grass);
  assert.equal(applyFarmAction(state, { type: "feed", animalId: "animal-1", feed: "stone" }, START).ok, false);
});

test("petting has a cooldown and high comfort doubles future product", () => {
  let state = fedSheep();
  state = step(state, { type: "pet", animalId: "animal-1" });
  assert.equal(state.animals[0].comfort, 75);
  assert.equal(applyFarmAction(state, { type: "pet", animalId: "animal-1" }, START + 4999).ok, false);
  state = step(state, { type: "pet", animalId: "animal-1" }, START + 5000);
  assert.equal(state.animals[0].comfort, 87);
  assert.equal(advanceFarm(state, START + 30_000).animals[0].readyProduct, 2);
  assert.equal(advanceFarm(state, START + 60_000).animals[0].readyProduct, 4);
});

test("full product storage consumes elapsed cycles rather than replaying them", () => {
  let state = fedSheep();
  state.animals[0].readyProduct = 12;
  state = step(state, { type: "collect", animalId: "animal-1" }, START + 60_000);
  assert.equal(state.inventory.wool, 12);
  assert.equal(advanceFarm(state, START + 60_000).animals[0].readyProduct, 0);
});

test("sales deduct only available stock and reject invalid quantities", () => {
  let state = withLand();
  state.inventory.wool = 3;
  state = step(state, { type: "sell", item: "wool", quantity: 2 });
  assert.equal(state.coins, 864);
  assert.equal(state.inventory.wool, 1);
  for (const quantity of [-1, 0, 0.5, NaN, Infinity, 2]) {
    assert.equal(applyFarmAction(state, { type: "sell", item: "wool", quantity }, START).ok, false);
  }
});

test("prototype names cannot be used as animals, crops, or sellable items", () => {
  const state = withLand();
  assert.equal(applyFarmAction(state, { type: "buyAnimal", plotId: PLOT, animalType: "constructor" }, START).ok, false);
  assert.equal(applyFarmAction(state, { type: "plant", bedId: BED, crop: "toString" }, START).ok, false);
  assert.equal(applyFarmAction(state, { type: "sell", item: "__proto__", quantity: 1 }, START).ok, false);
});

test("normalization validates ownership, capacity, IDs and numeric ranges", () => {
  const raw = withSheep();
  raw.coins = NaN;
  raw.inventory.grass = -100;
  raw.inventory.carrot = Infinity;
  raw.animals = Array.from({ length: 9 }, (_, index) => ({ ...raw.animals[0], id: `animal-${index + 1}`, comfort: 999, fedUntil: undefined }));
  raw.animals.unshift({ ...raw.animals[0], id: "bad-type", type: "constructor" });
  raw.animals.unshift({ ...raw.animals[1], id: "wrong-land", plotId: "meadow-east" });
  raw.animals.push({ ...raw.animals[2] });
  raw.beds.find(bed => bed.plotId === "meadow-east").crop = "grass";
  const normalized = normalizeFarm(raw, START);
  assert.equal(normalized.coins, 0);
  assert.equal(normalized.inventory.grass, 0);
  assert.equal(normalized.inventory.carrot, 0);
  assert.equal(normalized.animals.length, 6);
  assert.equal(new Set(normalized.animals.map(animal => animal.id)).size, 6);
  assert.equal(normalized.animals.every(animal => animal.comfort === 100 && animal.fedUntil === 0), true);
  assert.equal(normalized.beds.find(bed => bed.plotId === "meadow-east").crop, "");
});

test("new animal IDs do not collide with loaded IDs", () => {
  const state = withSheep();
  state.nextAnimalNumber = 1;
  const next = step(state, { type: "buyAnimal", plotId: PLOT, animalType: "rabbit" });
  assert.deepEqual(next.animals.map(animal => animal.id), ["animal-1", "animal-2"]);
});

test("daily supply is granted once per local calendar day", () => {
  const late = new Date(2026, 10, 13, 23, 59, 50).getTime();
  const nextDay = new Date(2026, 10, 14, 0, 0, 5).getTime();
  let state = step(createFarm(late), { type: "dailyGift" }, late);
  assert.equal(state.lastDailyGift, "2026-11-13");
  assert.equal(state.coins, 1320);
  assert.equal(applyFarmAction(state, { type: "dailyGift" }, late + 1000).ok, false);
  state = step(state, { type: "dailyGift" }, nextDay);
  assert.equal(state.lastDailyGift, "2026-11-14");
  assert.equal(state.coins, 1440);
});

test("save/load preserves progress and safely catches unavailable storage", () => {
  const data = new Map();
  const storage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) };
  const state = fedSheep();
  assert.equal(saveFarm(storage, state), true);
  assert.ok(data.has(FARM_KEY));
  assert.deepEqual(loadFarm(storage, START), state);
  assert.equal(loadFarm(storage, START + 60_000).animals[0].readyProduct, 2);
  const blocked = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("quota"); } };
  assert.deepEqual(loadFarm(blocked, START), createFarm(START));
  assert.equal(saveFarm(blocked, state), false);
  data.set(FARM_KEY, "broken json");
  assert.deepEqual(loadFarm(storage, START), createFarm(START));
});

test("unknown versions fall back without mutating saved source data", () => {
  const state = withSheep();
  state.version = 999;
  assert.deepEqual(normalizeFarm(state, START), createFarm(START));
  assert.equal(state.version, 999);
});

test("actions and time advancement do not mutate their inputs", () => {
  const state = fedSheep();
  const original = structuredClone(state);
  advanceFarm(state, START + ANIMAL_TYPES.sheep.productionMs);
  applyFarmAction(state, { type: "pet", animalId: "animal-1" }, START);
  assert.deepEqual(state, original);
});

test("inventory caps never silently destroy products or crops", () => {
  let state = fedSheep();
  state.inventory.wool = 9999;
  assert.equal(applyFarmAction(state, { type: "collect", animalId: "animal-1" }, START + 60_000).ok, false);
  state = step(state, { type: "plant", bedId: BED, crop: "grass" });
  state = step(state, { type: "water", bedId: BED });
  state.inventory.grass = 9999;
  const result = applyFarmAction(state, { type: "harvest", bedId: BED }, START + CROPS.grass.growMs);
  assert.equal(result.ok, false);
  assert.equal(result.state.beds.find(bed => bed.id === BED).crop, "grass");
});

test("hunt attempts share a cooldown, count misses and grant only successful rewards", () => {
  let state = step(createFarm(START), { type: "hunt", success: false });
  assert.deepEqual(state.huntStats, { attempts: 1, successes: 0 });
  assert.equal(state.inventory.game, 0);
  assert.equal(state.coins, 1200);
  assert.equal(applyFarmAction(state, { type: "hunt", success: true }, START + HUNT_COOLDOWN_MS - 1).ok, false);
  state = step(state, { type: "hunt", success: true }, START + HUNT_COOLDOWN_MS);
  assert.deepEqual(state.huntStats, { attempts: 2, successes: 1 });
  assert.equal(state.inventory.game, 1);
  state = step(state, { type: "sell", item: "game", quantity: 1 }, START + HUNT_COOLDOWN_MS);
  assert.equal(state.inventory.game, 0);
  assert.equal(state.coins, 1245);
});

test("hunt normalization supports existing saves and rejects invalid results", () => {
  const old = createFarm(START);
  delete old.inventory.game;
  delete old.lastHuntAt;
  delete old.huntStats;
  const state = normalizeFarm(old, START);
  assert.equal(state.inventory.game, 0);
  assert.equal(state.lastHuntAt, 0);
  assert.deepEqual(state.huntStats, { attempts: 0, successes: 0 });
  assert.equal(applyFarmAction(state, { type: "hunt", success: "true" }, START).ok, false);
  state.huntStats = { attempts: 2, successes: 999 };
  assert.deepEqual(normalizeFarm(state, START).huntStats, { attempts: 2, successes: 2 });
});
