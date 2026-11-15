import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Economy = require("../wechat/vendor/preview-economy.cjs");
const Village = require("../wechat/vendor/shared-village.cjs");
const Daily = require("../wechat/vendor/daily-state.cjs");
const { createHomeController } = await import("../wechat/home-controller.js");

const DAY = "2026-11-15";
const T0 = Date.parse("2026-11-15T00:00:00.000Z");
const T0SEC = T0 / 1000;
const ID = "local-test-land-1";

// —— 分档纯函数：边界两侧 ——

test("land bands: price steps down as distance from the crystal grows, boundaries included in the nearer band", () => {
  const cases = [
    [0, "core", 600], [59.9, "core", 600], [60, "core", 600],
    [60.1, "near", 400], [105.13, "near", 400], [150, "near", 400],
    [150.1, "far", 250], [260, "far", 250],
    [260.1, "edge", 150], [5000, "edge", 150],
  ];
  for (const [distance, key, price] of cases) {
    assert.equal(Economy.landBandForDistance(distance)?.key, key, `distance ${distance}`);
    assert.equal(Economy.landPriceForDistance(distance), price, `distance ${distance}`);
    assert.equal(Daily.landPriceForDistance(distance), price, "状态层导出与经济模块同源");
  }
  for (const bad of [-1, NaN, Infinity, -Infinity, "60", null, undefined]) {
    assert.equal(Economy.landBandForDistance(bad), null);
    assert.equal(Economy.landPriceForDistance(bad), null);
  }
  assert.equal(Economy.plotPrice, 400, "标准地价仍是近郊档 400（由分档表导出）");
  assert.equal(Economy.LAND_BANDS.length, 4);
});

// —— 各坝水晶锚点：经济表与各场景实测一致，防漂移 ——

const vendor = new URL("../wechat/vendor/", import.meta.url);
const adapterSource = fs.readFileSync(new URL("threejs-miniprogram.cjs", vendor), "utf8");
const damSource = fs.readFileSync(new URL("dam-world.cjs", vendor), "utf8");
const sceneSources = Object.fromEntries(["mangshi", "yingjiang", "longchuan", "lianghe"].map(name => [
  name, fs.readFileSync(new URL(`${name}-scene.cjs`, vendor), "utf8"),
]));
const ruiliSource = fs.readFileSync(new URL("ruili-scene.cjs", vendor), "utf8");

function damWorld(name) {
  const context = vm.createContext({ exports: {}, console, require: () => Economy });
  vm.runInContext(adapterSource, context);
  vm.runInContext("class Canvas {}; this.THREE = exports.createScopedThreejs(new Canvas()); this.module = { exports: {} };", context);
  vm.runInContext(damSource, context);
  vm.runInContext("this.DamWorld = module.exports; this.require = () => DamWorld; this.module = { exports: {} };", context);
  vm.runInContext(sceneSources[name], context);
  const factoryName = "create" + name[0].toUpperCase() + name.slice(1) + "Scene";
  const world = context.module.exports[factoryName](context.THREE, context.DamWorld);
  world.resize(390, 844);
  return world;
}

function ruiliWorld() {
  const context = vm.createContext({ exports: {}, console, require: () => Economy });
  vm.runInContext(adapterSource, context);
  vm.runInContext("class Canvas {}; this.THREE = exports.createScopedThreejs(new Canvas()); this.module = { exports: {} };", context);
  vm.runInContext(damSource, context);
  vm.runInContext("this.DamWorld = module.exports; this.module = { exports: {} };", context);
  context.require = name => name.includes("shared-village") ? Village : context.DamWorld;
  vm.runInContext(ruiliSource, context);
  const world = context.module.exports.createRuiliScene(context.THREE, context.DamWorld);
  world.resize(390, 844);
  return world;
}

test("crystal anchors in the economy table match every scene's real crystal position", () => {
  const ruiliCrystal = ruiliWorld().getCrystalPos();
  assert.equal(ruiliCrystal.x, Economy.DAMS.ruili.crystal.x);
  assert.equal(ruiliCrystal.z, Economy.DAMS.ruili.crystal.z);
  for (const dam of ["mangshi", "yingjiang", "longchuan", "lianghe"]) {
    const pos = damWorld(dam).getCrystalPos();
    assert.equal(pos.x, Economy.DAMS[dam].crystal.x, dam);
    assert.equal(pos.z, Economy.DAMS[dam].crystal.z, dam);
  }
});

// —— 瑞丽样板地 A/B 实测：仍是近郊 400 ——

test("ruili sample plots A and B measure into the near band and still cost 400", () => {
  const world = ruiliWorld();
  const crystal = world.getCrystalPos();
  assert.equal(crystal.x, 6.5);
  assert.equal(crystal.z, 10.5);
  const plots = world.getPlots().filter(p => p.site === 0);
  const expected = [
    { idx: 0, id: "plot_ruili_river_0001_a", distance: 105.13 },
    { idx: 1, id: "plot_ruili_river_0001_b", distance: 73.57 },
  ];
  for (const { idx, id, distance } of expected) {
    const plot = plots.find(p => p.idx === idx);
    assert.equal(plot.id, id);
    // 世界侧地块中心与契约模块换算逐字一致
    const dam = Village.toDamCoords(Village.ALL_PLOTS[idx].origin);
    assert.equal(plot.x, dam.x);
    assert.equal(plot.z, dam.z);
    const quote = Daily.landQuoteForDam("ruili", plot.x, plot.z);
    assert.ok(Math.abs(quote.distance - distance) < 0.6, `${id} 距水晶实测 ${quote.distance}`);
    assert.equal(quote.band, "near");
    assert.equal(quote.label, "近郊地");
    assert.equal(quote.price, 400, `${id} 价格不变`);
  }
});

// —— 玩家闭环恒等式：带真实坐标认领 A，全程余额仍收在 569 ——

test("full loop with the real plot-A centre still balances to exactly 569", () => {
  const state = Daily.newPlayerState();
  Daily.refreshDaily(state, DAY);
  assert.equal(Daily.registerPlayer(state, "松岚", { at: T0, id: ID }).ok, true);
  assert.equal(state.coins, 1000);

  const claimed = Daily.claimHome(state, 0, 0, "ruili", { x: -84, z: 64 });
  assert.equal(claimed.ok, true);
  assert.equal(claimed.price, 400);
  assert.equal(claimed.landBand, "near");
  assert.equal(state.coins, 600);

  assert.equal(Daily.buildHomeHut(state).ok, true);
  assert.equal(Daily.openHomeField(state).ok, true);
  assert.equal(Daily.plantCarrots(state, T0SEC).ok, true);
  assert.equal(state.coins, 528);
  assert.equal(Daily.harvestCarrots(state, T0SEC + 61, DAY).ok, true);
  assert.equal(Daily.sellBasket(state).gain, 120);
  assert.equal(state.coins, 648);
  assert.equal(Daily.buyHomeAnimal(state, "chicken", T0SEC + 61).ok, true);
  assert.equal(state.coins, 508);
  assert.equal(Daily.collectHomeProduce(state, T0SEC + 61 + 45).ok, true);
  assert.equal(Daily.sellBasket(state).gain, 16);
  assert.equal(state.coins, 524);
  assert.equal(Daily.doSignin(state, DAY).ok, true);
  assert.equal(state.coins, 529);
  Daily.markQuest(state, DAY, "fed");
  Daily.doJingxin(state, DAY);
  assert.equal(Daily.claimQuest(state, DAY).ok, true);
  assert.equal(state.coins, 569, "1000 −400 −72 +120 −140 +16 +5 +40 = 569，分档后不变");
  assert.equal(Daily.validateState(state), true);
});

// —— 固定地块：其余档位与余额不足 ——

test("fixed plots price by band: core 600, far 250, edge 150; insufficient balance still refused cleanly", () => {
  const core = Daily.defaultState();
  const coreClaim = Daily.claimHome(core, 0, 0, "mangshi", { x: -0.5 + 30, z: 35.5 });
  assert.equal(coreClaim.price, 600);
  assert.equal(coreClaim.landLabel, "主城区");
  assert.equal(core.coins, 1200 - 600);

  const far = Daily.defaultState();
  const farClaim = Daily.claimHome(far, 0, 0, "lianghe", { x: -11 + 200, z: 19 });
  assert.equal(farClaim.price, 250);
  assert.equal(far.coins, 1200 - 250);

  const edge = Daily.defaultState();
  const edgeClaim = Daily.claimHome(edge, 0, 0, "yingjiang", { x: -9.5, z: -3.5 + 300 });
  assert.equal(edgeClaim.price, 150);
  assert.equal(edge.coins, 1200 - 150);

  const poor = Daily.newPlayerState();
  Daily.registerPlayer(poor, "望舒", { at: T0, id: ID });
  poor.coins = 500;
  const refused = Daily.claimHome(poor, 0, 0, "mangshi", { x: -0.5, z: 35.5 });
  assert.equal(refused.ok, false);
  assert.equal(refused.error.code, "INSUFFICIENT_COINS");
  assert.equal(refused.error.message, "安币不够，还差 100 安币");
  assert.equal(poor.home, null);
  assert.equal(poor.coins, 500);
});

// —— 自选地：按落点分档（近水晶 600 / 远郊 250 / 边地 150）——

test("custom plots price by where they land: near the crystal 600, far out 250, at the edge 150", () => {
  const near = Daily.defaultState();
  const nearClaim = Daily.claimCustomHome(near, 6.5 + 10, 10.5, "ruili");
  assert.equal(nearClaim.ok, true);
  assert.equal(nearClaim.price, 600);
  assert.equal(nearClaim.landBand, "core");
  assert.equal(near.coins, 1200 - 600);

  const far = Daily.defaultState();
  const farClaim = Daily.claimCustomHome(far, 6.5 + 200, 10.5, "ruili");
  assert.equal(farClaim.ok, true);
  assert.equal(farClaim.price, 250);
  assert.equal(far.coins, 1200 - 250);

  const edge = Daily.defaultState();
  const edgeClaim = Daily.claimCustomHome(edge, -235, 60, "longchuan");
  assert.equal(edgeClaim.ok, true);
  assert.equal(edgeClaim.price, 150, "陇川 (-235,60) 距水晶 (99,-46) 约 350，边地档");
  assert.equal(edge.coins, 1200 - 150);

  const poor = Daily.defaultState();
  poor.coins = 200;
  const refused = Daily.claimCustomHome(poor, 6.5 + 200, 10.5, "ruili");
  assert.equal(refused.ok, false);
  assert.equal(refused.error.code, "INSUFFICIENT_COINS");
  assert.equal(poor.home, null);
  assert.equal(poor.coins, 200);
});

// —— 老存档：价格规则变化不影响已认领的家 ——

test("legacy saves with homes claimed under the old flat prices still validate and load", () => {
  // 旧定值 600 时代认领的自选地存档（存档里没有任何价格字段，重估价不得发生）
  const legacyCustom = Daily.defaultState();
  legacyCustom.home = { ...Daily.createHome(-1, -1, "瑞丽坝 · 自选之地", "ruili"), custom: { x: 100.125, z: 24.75 } };
  legacyCustom.coins = 600;
  assert.equal(Daily.validateState(legacyCustom), true);
  const restored = Daily.normalizeLegacyState(legacyCustom);
  assert.equal(restored.ok, true);
  assert.equal(restored.state.coins, 600, "不补差价、不退款");
  assert.deepEqual(restored.state.home.custom, { x: 100.125, z: 24.75 });

  // 旧定值 400 时代认领的固定地存档（新规则下该位置若重估会是别的价，也不得改动）
  const legacyFixed = Daily.defaultState();
  legacyFixed.home = Daily.createHome(0, 0, "芒市坝 · 西基址 1 号地", "mangshi");
  legacyFixed.coins = 800;
  assert.equal(Daily.validateState(legacyFixed), true);
  assert.equal(Daily.normalizeLegacyState(legacyFixed).ok, true);

  // 经会话仓库往返加载同样通过
  let stored = JSON.stringify(legacyCustom);
  const repository = {
    load: () => ({ ok: true, state: JSON.parse(stored), revision: 1, source: "test" }),
    save: state => { stored = JSON.stringify(state); return { ok: true, revision: 2 }; },
  };
  const session = Daily.createStateSession(repository);
  assert.equal(session.ok, true);
  assert.equal(session.state.home.custom.x, 100.125);
  assert.equal(session.state.coins, 600);
});

// —— 控制器：付款前按钮亮明档位与价格 ——

function controllerFixture(state, world) {
  let actionLabel = "", actionFn = null;
  const ui = {
    markDirty() {}, toast() {},
    setAction(label, fn) { actionLabel = label || ""; actionFn = fn || null; },
    setBasket() {}, setExtraRow() {}, isPanelOpen: () => false,
    closePanel() {}, closeTeleport() {},
  };
  const controller = createHomeController({
    state,
    transact: fn => { const draft = structuredClone(state); const r = fn(draft); if (r?.ok === false) return r; Object.assign(state, draft); return { ok: true, result: r }; },
    ui,
    getDamWorld: () => world,
    setScene() {},
    now: () => T0,
    today: () => DAY,
  });
  return { controller, action: () => ({ label: actionLabel, fn: actionFn }) };
}

function ruiliStubWorld({ target, player }) {
  return {
    setCrystalLit() {}, isDancing: () => false, isResting: () => false, setResting() {},
    isMounted: () => false, setMounted() {}, setMoveInput() {},
    nearestInteractable: () => target,
    getPlayerPos: () => ({ ...player }),
    getPrayerSite: () => null,
    teleportPlayerTo() {}, setPlayerYaw() {}, setPrayerPose() {}, setGuideRingVisible() {},
    checkPlotSpot: () => ({ ok: true }),
    markClaimed() {}, buildHut() {}, upgradeBamboo() {}, openField() {}, setFieldStage() {}, addAnimal() {},
    claimCustomPlot(x, z) { return { site: -1, idx: -1, x, z, claimed: true }; },
    showHorse() {}, hideHorse() {}, setHorseBond() {}, setCrystalLit() {}, showStall() {},
    getPlots: () => [{ site: 0, idx: 0, x: -84, z: 64, claimed: false, hut: false, house: 0, field: false, fieldStage: 0, animals: { chicken: 0, rabbit: 0, sheep: 0 } }],
    getSites: () => [{ x: -64, z: 66 }],
    getHallPos: () => ({ x: -27, z: -8 }),
  };
}

test("controller shows the band and price before paying: plot A reads 近郊地 400 and charges 400", () => {
  const state = Daily.newPlayerState();
  Daily.refreshDaily(state, DAY);
  Daily.registerPlayer(state, "松岚", { at: T0, id: ID });
  const world = ruiliStubWorld({
    target: { type: "plot", site: 0, idx: 0, id: "plot_ruili_river_0001_a", reserved: false, claimed: false },
    player: { x: -84, z: 64 },
  });
  const f = controllerFixture(state, world);
  f.controller.update(3, world);
  assert.equal(f.action().label, "在此安家 · 近郊地 400 安币");
  assert.equal(f.action().fn().ok, true);
  assert.equal(state.coins, 600);
  assert.equal(state.home.site, 0);
});

test("controller shows the band and price for a custom spot next to the crystal: 主城区 600（自选）", () => {
  const state = Daily.newPlayerState();
  Daily.refreshDaily(state, DAY);
  Daily.registerPlayer(state, "松岚", { at: T0, id: ID });
  const world = ruiliStubWorld({ target: null, player: { x: 16.5, z: 10.5 } });
  const f = controllerFixture(state, world);
  f.controller.update(3, world);
  assert.equal(f.action().label, "在此安家 · 主城区 600 安币（自选）");
  assert.equal(f.action().fn().ok, true);
  assert.equal(state.coins, 400);
  assert.deepEqual(state.home.custom, { x: 16.5, z: 10.5 });
});
