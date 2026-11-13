import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createHomeController } from "../wechat/home-controller.js";
import { createDiscoveryController } from "../wechat/discovery-controller.js";

const require = createRequire(import.meta.url);
const Daily = require("../wechat/vendor/daily-state.cjs");
const DAY = "2026-11-13";
const START = Date.parse(DAY + "T00:00:00.000Z");
const horseState = (x, z, dam = "mangshi", cared = false) => ({ owned: true, dam, x, z, bond: cared ? 20 : 10, careDate: cared ? DAY : "", careCount: cared ? 2 : 0 });

function fixture(initial, { unlit = false } = {}) {
  let writes = 0, failed = false, time = START, revision = 0, stored = structuredClone(initial || Daily.defaultState());
  if (!unlit) for (const dam of Object.keys(Daily.ECONOMY.DAMS)) Daily.lightCrystal(stored, dam);
  Daily.refreshDaily(stored, DAY);
  const session = Daily.createStateSession({
    load: () => ({ ok: true, state: stored, revision }),
    save(value) {
      writes++;
      if (failed) return { ok: false, error: { code: "SAVE_WRITE_FAILED" } };
      assert.equal(Daily.validateState(value), true);
      stored = structuredClone(value);
      return { ok: true, revision: ++revision };
    },
  });
  let target = { type: "plot", site: 0, idx: 0, claimed: false };
  const plot = { site: 0, idx: 0, x: -70, z: 70, claimed: false, hut: false, house: 0, field: false, fieldStage: 0, animals: { chicken: 0, sheep: 0, rabbit: 0 } };
  const visuals = [], scenes = [], toasts = [], teleports = [], stalls = [];
  let mounted = false, resting = false, dancing = false, harvestBasket = false, crystalLit = false, horse = null, player = { x: 0, z: 0 }, plotCheck = { ok: true };
  const customPlots = [];
  let careAnimations = 0, hiddenHorses = 0, horseBond = 0;
  const findPlot = (site, idx) => site === -1 ? customPlots.find(value => value.idx === idx) : plot;
  const world = {
    getPlots: () => [structuredClone(plot), ...structuredClone(customPlots)],
    getSites: () => [{ x: -78, z: 66 }],
    getHallPos: () => ({ x: -30, z: -20 }),
    nearestInteractable: () => target?.type === "plot" ? { ...target, claimed: findPlot(target.site, target.idx).claimed } : target,
    markClaimed(site, idx) { findPlot(site, idx).claimed = true; visuals.push("claim"); },
    buildHut(site, idx) { findPlot(site, idx).hut = true; findPlot(site, idx).house = 1; visuals.push("hut"); },
    upgradeBamboo() { plot.house = 2; visuals.push("bamboo"); },
    openField(site, idx, stage) { plot.field = true; plot.fieldStage = stage; visuals.push("field"); },
    setFieldStage(site, idx, stage) { plot.fieldStage = stage; visuals.push("stage:" + stage); },
    addAnimal(site, idx, kind) { plot.animals[kind]++; visuals.push(kind); },
    setMoveInput() {},
    teleportPlayerTo(x, z) { teleports.push({ x, z }); },
    isMounted: () => mounted,
    setMounted(value) { mounted = value; },
    isResting: () => resting,
    setResting(value) { resting = value; },
    isDancing: () => dancing,
    debugDancing(value) { dancing = value; },
    showHarvestBasket() { harvestBasket = true; },
    hideHarvestBasket() { harvestBasket = false; },
    hasHarvestBasket: () => harvestBasket,
    setCrystalLit(value) { crystalLit = value; },
    isCrystalLit: () => crystalLit,
    getHorsePos: () => horse && ({ ...horse }),
    showHorse(x, z) { horse = { x, z }; visuals.push("horse"); },
    debugHorse(x, z) { horse = { x, z }; },
    getPlayerPos: () => ({ ...player }),
    debugPlayer(x, z) { player = { x, z }; },
    resolveLandPosition: (x, z) => ({ x, z }),
    hideHorse() { horse = null; mounted = false; hiddenHorses++; },
    setHorseBond(value) { horseBond = value; },
    horseCare() { careAnimations++; },
    showStall(x, z, rotation) { stalls.push({ x, z, rotation }); },
    checkPlotSpot() { return plotCheck; },
    debugPlotCheck(value) { plotCheck = value; },
    claimCustomPlot(x, z) {
      if (customPlots.length) return customPlots[0];
      const custom = { ...structuredClone(plot), site: -1, idx: -1, x, z, claimed: true };
      customPlots.push(custom); visuals.push("custom"); return custom;
    },
  };
  const ui = {
    label: "", action: null, panel: false, destinations: [], chooseDestination: null, portal: false,
    setAction(label, action) { this.label = label; this.action = action; },
    isPanelOpen() { return this.panel; },
    openPanel() { this.panel = true; }, closePanel() { this.panel = false; },
    openTeleport(destinations, callback) { this.destinations = destinations; this.chooseDestination = callback; this.portal = true; },
    closeTeleport() { this.portal = false; },
    setExtraRow(value) { this.extraRow = value; },
    setBasket(value) { this.basket = value; },
    markDirty() {}, toast(value) { toasts.push(value); },
  };
  const controller = createHomeController({ state: session.state, transact: session.transact, ui, getMangshi: () => world,
    setScene: value => scenes.push(value), now: () => time, today: () => DAY });
  return { controller, state: session.state, ui, world, plot, visuals, scenes, toasts, teleports, stalls, session,
    writes: () => writes, fail: value => { failed = value; }, advance: ms => { time += ms; },
    careAnimations: () => careAnimations, hiddenHorses: () => hiddenHorses, horseBond: () => horseBond,
    target: value => { target = value; }, update: (active = 2) => controller.update(active, world),
    act(prefix) { controller.update(2, world); assert.ok(ui.label.startsWith(prefix), ui.label); assert.equal(typeof ui.action, "function"); return ui.action(); },
  };
}

function multiDamFixture(initial) {
  const base = fixture(initial);
  const records = Object.fromEntries(["mangshi", "ruili", "yingjiang", "longchuan", "lianghe"].map(dam => [dam, fixture()]));
  records.mangshi = base;
  const controller = createHomeController({ state: base.state, transact: base.session.transact, ui: base.ui,
    getDamWorld: dam => records[dam || "mangshi"].world, setScene: scene => base.scenes.push(scene),
    now: () => START, today: () => DAY });
  return { ...base, records, controller,
    actIn(dam, prefix) {
      const index = ["mangshi", "ruili", "yingjiang", "longchuan", "lianghe"].indexOf(dam) + 2;
      controller.update(index, records[dam].world);
      assert.ok(base.ui.label.startsWith(prefix), base.ui.label);
      return base.ui.action();
    } };
}

test("home actions keep Muse order and restore only committed visual changes", () => {
  const f = fixture();
  f.act("在此安家");
  assert.equal(f.state.coins, 800);
  f.act("搭草棚");
  f.act("开第一块田");
  f.act("种萝卜");
  assert.equal(f.state.coins, 728);
  assert.equal(f.plot.fieldStage, 1);
  f.advance(60000);
  f.act("收获萝卜");
  assert.equal(f.state.coins, 728);
  assert.equal(f.state.home.basket.carrot, 8);
  assert.equal(f.state.quests.harvest, true);
  assert.equal(f.plot.fieldStage, 0);
  f.act("领养一只鸡");
  f.act("领养一只羊");
  f.act("领养一只兔");
  assert.equal(f.state.coins, 148);
  const before = f.visuals.length;
  f.act("升级傣家竹楼");
  assert.equal(f.state.home.house, 1);
  assert.equal(f.visuals.length, before);
  assert.ok(f.toasts.at(-1).includes("安币不够"));
  f.session.transact(state => { state.coins += 500; });
  f.act("升级傣家竹楼");
  assert.equal(f.state.home.house, 2);
  assert.equal(f.plot.house, 2);
  f.controller.restoreVisual(f.world);
  assert.deepEqual(f.plot.animals, { chicken: 1, sheep: 1, rabbit: 1 });
});

test("storage failure leaves currency, house and visual state unchanged", () => {
  const f = fixture();
  f.fail(true);
  f.act("在此安家");
  assert.equal(f.state.home, null);
  assert.equal(f.state.coins, 1200);
  assert.deepEqual(f.visuals, []);
  assert.equal(f.toasts.at(-1), "本机保存失败，请重试");
  f.fail(false);
  f.act("在此安家");
  f.fail(true);
  f.act("搭草棚");
  assert.equal(f.state.home.house, 0);
  assert.equal(f.plot.hut, false);
  assert.deepEqual(f.visuals, ["claim"]);
});

test("produce accrual checks at most once a second and saves only changes", () => {
  const f = fixture();
  f.act("在此安家"); f.act("搭草棚"); f.act("开第一块田"); f.act("种萝卜");
  f.act("领养一只鸡");
  const writes = f.writes();
  for (let index = 0; index < 100; index++) f.update();
  assert.equal(f.writes(), writes);
  f.advance(44000); f.update();
  assert.equal(f.writes(), writes);
  f.advance(1000); f.update();
  assert.equal(f.writes(), writes + 1);
  assert.equal(f.state.home.produce.egg, 1);
  for (let index = 0; index < 100; index++) f.update();
  assert.equal(f.writes(), writes + 1);
  assert.ok(f.ui.label.startsWith("把出产收进背篓"));
  f.ui.action();
  assert.equal(f.state.home.produce.egg, 0);
  f.advance(45000);
  f.fail(true);
  f.update();
  assert.equal(f.state.home.produce.egg, 0);
  const failedWrites = f.writes();
  for (let index = 0; index < 10; index++) f.update();
  assert.equal(f.writes(), failedWrites);
});

test("paid portals change scene only after a successful half-coin save", () => {
  const f = fixture();
  f.target({ type: "crystal", destination: "ruili" });
  f.update();
  assert.equal(f.ui.label, "传送 · 0.5 安币");
  f.ui.action();
  assert.equal(f.ui.portal, true);
  assert.deepEqual(f.ui.destinations.map(value => value.id), ["ruili", "yingjiang", "longchuan", "lianghe"]);
  f.fail(true);
  f.ui.chooseDestination("ruili");
  assert.equal(f.state.coins, 1200);
  assert.deepEqual(f.scenes, []);
  assert.equal(f.ui.portal, true);
  f.fail(false);
  f.ui.chooseDestination("ruili");
  assert.equal(f.state.coins, 1199.5);
  assert.deepEqual(f.scenes, [3]);
  assert.equal(f.ui.portal, false);
  f.update(3);
  assert.equal(f.ui.label, "传送 · 0.5 安币");
  f.ui.action();
  assert.deepEqual(f.ui.destinations.map(value => value.id), ["mangshi", "yingjiang", "longchuan", "lianghe"]);
  f.ui.chooseDestination("mangshi");
  assert.equal(f.state.coins, 1199);
  assert.deepEqual(f.scenes, [3, 2]);
  assert.deepEqual(f.teleports, [{ x: 4, z: 52 }, { x: 4, z: 52 }]);
});

test("crystal lighting verifies proximity and persists before changing visual state", () => {
  const f = fixture(undefined, { unlit: true });
  f.controller.restoreVisual(f.world);
  f.target({ type: "crystal" });
  f.update();
  assert.ok(f.ui.label.startsWith("点亮这座传送点"));
  const action = f.ui.action;
  f.target({ type: "hall" });
  assert.equal(action(), false);
  f.target({ type: "crystal" });
  f.world.setMounted(true);
  assert.equal(action(), false);
  assert.equal(f.writes(), 0);
  f.world.setMounted(false);
  f.fail(true);
  action();
  assert.deepEqual(f.state.lit, {});
  assert.equal(f.world.isCrystalLit(), false);
  assert.equal(f.state.coins, 1200);
  f.fail(false);
  action();
  assert.deepEqual(f.state.lit, { mangshi: true });
  assert.equal(f.world.isCrystalLit(), true);
  assert.equal(f.state.coins, 1200);
  f.update();
  assert.equal(f.ui.label, "传送 · 0.5 安币");
});

test("unlit roads are free even at zero coins and failed saves never change scenes", () => {
  const state = Daily.defaultState();
  state.coins = 0;
  Daily.lightCrystal(state, "mangshi");
  const f = fixture(state, { unlit: true });
  f.target({ type: "crystal" });
  f.act("传送");
  assert.deepEqual(f.ui.destinations.map(value => value.id), ["road:ruili", "road:yingjiang", "road:longchuan", "road:lianghe"]);
  assert.ok(f.ui.destinations.every(value => value.right === "未点亮 · 免费"));
  assert.equal(f.ui.chooseDestination("ruili").error.code, "CRYSTAL_UNLIT");
  assert.deepEqual(f.scenes, []);
  assert.equal(f.writes(), 0);
  f.fail(true);
  f.ui.chooseDestination("road:ruili");
  assert.deepEqual(f.scenes, []);
  assert.equal(f.ui.portal, true);
  assert.equal(f.state.coins, 0);
  assert.deepEqual(f.state.lit, { mangshi: true });
  f.fail(false);
  f.ui.chooseDestination("road:ruili");
  assert.deepEqual(f.scenes, [3]);
  assert.equal(f.ui.portal, false);
  assert.equal(f.state.coins, 0);
  assert.deepEqual(f.state.lit, { mangshi: true });
  assert.equal(f.teleports.length, 1);
  assert.ok(f.toasts.at(-1).includes("去点亮"));
});

test("old road selection cannot bypass a newly lit destination fare", () => {
  const state = Daily.defaultState();
  Daily.lightCrystal(state, "mangshi");
  const f = fixture(state, { unlit: true });
  f.target({ type: "crystal" });
  f.act("传送");
  f.session.transact(value => Daily.lightCrystal(value, "ruili"));
  const writes = f.writes();
  assert.equal(f.ui.chooseDestination("road:ruili").ok, false);
  assert.equal(f.writes(), writes);
  assert.deepEqual(f.scenes, []);
  assert.equal(f.state.coins, 1200);
  f.ui.chooseDestination("ruili");
  assert.deepEqual(f.scenes, [3]);
  assert.equal(f.state.coins, 1199.5);
});

test("restored homes add each animal once and go-home closes the hall without payment", () => {
  const state = Daily.defaultState();
  Daily.claimHome(state, 0, 0); Daily.buildHomeHut(state); Daily.openHomeField(state);
  Daily.buyHomeAnimal(state, "chicken", START / 1000);
  const f = fixture(state);
  f.controller.restoreVisual(f.world);
  f.controller.restoreVisual(f.world);
  assert.deepEqual(f.visuals, ["claim", "hut", "field", "chicken"]);
  f.ui.openPanel();
  const coins = f.state.coins;
  assert.equal(f.controller.goHome(), true);
  assert.equal(f.ui.panel, false);
  assert.deepEqual(f.scenes, [2]);
  assert.equal(f.teleports.length, 1);
  assert.equal(f.state.coins, coins);
  assert.equal(f.writes(), 0);
});

function horseFixture() {
  const state = Daily.defaultState();
  state.coins = 2000;
  Daily.buyHorse(state);
  const f = fixture(state);
  f.controller.restoreVisual(f.world);
  f.target({ type: "horse" });
  f.act("喂马");
  f.act("刷马");
  f.act("上马");
  assert.equal(f.world.isMounted(), true);
  return f;
}

test("horse purchase reveals the horse only after saving and does not charge twice", () => {
  const f = fixture();
  f.fail(true);
  f.controller.handleExternal("buy-horse");
  assert.equal(f.state.horse, null);
  assert.equal(f.state.coins, 1200);
  assert.deepEqual(f.visuals, []);
  f.fail(false);
  f.controller.handleExternal("buy-horse");
  assert.equal(f.state.horse.owned, true);
  assert.equal(f.state.coins, 0);
  assert.deepEqual(f.world.getHorsePos(), { x: 17, z: 51 });
  assert.deepEqual(f.visuals, ["horse"]);
  f.controller.handleExternal("buy-horse");
  assert.equal(f.state.coins, 0);
  assert.deepEqual(f.visuals, ["horse"]);
});

test("failed dismount keeps the rider mounted and successful retry saves its position", () => {
  const f = horseFixture();
  f.world.debugHorse(98.5, -15.25);
  f.fail(true);
  f.act("下马");
  assert.equal(f.world.isMounted(), true);
  assert.deepEqual(f.state.horse, horseState(17, 51, "mangshi", true));
  assert.deepEqual(f.world.getHorsePos(), { x: 98.5, z: -15.25 });
  assert.equal(f.toasts.at(-1), "本机保存失败，请重试");
  f.fail(false);
  f.act("下马");
  assert.equal(f.world.isMounted(), false);
  assert.deepEqual(f.state.horse, horseState(98.5, -15.25, "mangshi", true));
  assert.deepEqual(f.world.getHorsePos(), { x: 98.5, z: -15.25 });
});

test("paid teleport saves horse position and fare atomically before changing scene", () => {
  const f = horseFixture();
  f.world.debugHorse(40.5, 120.25);
  const before = f.state.coins;
  f.world.setMounted(false);
  f.target({ type: "crystal" });
  f.update(2);
  f.ui.action();
  // Exercise an already-open chooser with mounted horse progress to preserve.
  f.world.setMounted(true);
  f.fail(true);
  f.ui.chooseDestination("yingjiang");
  assert.equal(f.state.coins, before);
  assert.deepEqual(f.state.horse, horseState(17, 51, "mangshi", true));
  assert.equal(f.world.isMounted(), true);
  assert.equal(f.ui.portal, true);
  assert.deepEqual(f.scenes, []);
  const failedWrites = f.writes();
  f.fail(false);
  f.ui.chooseDestination("yingjiang");
  assert.equal(f.writes(), failedWrites + 1);
  assert.equal(f.state.coins, before - 0.5);
  assert.deepEqual(f.state.horse, horseState(40.5, 120.25, "mangshi", true));
  assert.equal(f.world.isMounted(), false);
  assert.equal(f.ui.portal, false);
  assert.deepEqual(f.scenes, [4]);
});

test("beforeSceneChange prevents close on failed horse save and preserves it when leaving", () => {
  const f = horseFixture();
  f.world.debugHorse(-105, 65);
  f.fail(true);
  assert.equal(f.controller.beforeSceneChange(), false);
  assert.equal(f.world.isMounted(), true);
  assert.deepEqual(f.state.horse, horseState(17, 51, "mangshi", true));
  f.fail(false);
  assert.equal(f.controller.beforeSceneChange(), true);
  assert.equal(f.world.isMounted(), false);
  assert.deepEqual(f.state.horse, horseState(-105, 65, "mangshi", true));
  const writes = f.writes();
  assert.equal(f.controller.beforeSceneChange(), true);
  assert.equal(f.writes(), writes);
});

test("a home claimed in another dam restores only there and go-home returns to its dam", () => {
  const f = multiDamFixture();
  f.fail(true);
  f.actIn("ruili", "在此安家");
  assert.equal(f.state.home, null);
  assert.equal(f.state.coins, 1200);
  assert.deepEqual(f.records.ruili.visuals, []);
  assert.deepEqual(f.records.mangshi.visuals, []);
  f.fail(false);
  f.actIn("ruili", "在此安家");
  f.actIn("ruili", "搭草棚");
  assert.equal(f.state.home.dam, "ruili");
  assert.deepEqual(f.records.ruili.visuals, ["claim", "hut"]);
  assert.deepEqual(f.records.mangshi.visuals, []);
  const restored = multiDamFixture(structuredClone(f.state));
  for (const dam of Object.keys(restored.records)) restored.controller.restoreVisual(restored.records[dam].world, dam);
  assert.deepEqual(restored.records.ruili.visuals, ["claim", "hut"]);
  for (const dam of ["mangshi", "yingjiang", "longchuan", "lianghe"]) assert.deepEqual(restored.records[dam].visuals, []);
  restored.ui.openPanel();
  assert.equal(restored.controller.goHome(), true);
  assert.equal(restored.ui.panel, false);
  assert.deepEqual(restored.scenes, [3]);
  assert.equal(restored.records.ruili.teleports.length, 1);
  assert.equal(restored.records.mangshi.teleports.length, 0);
  assert.equal(restored.state.coins, 800);
});

test("horse stays in its dam while paid travel routes the player to a different spawn", () => {
  const state = Daily.defaultState();
  state.coins = 1500;
  Daily.buyHorse(state);
  Daily.setHorsePosition(state, 20, 35, "yingjiang");
  const f = multiDamFixture(state);
  f.controller.restoreVisual(f.records.yingjiang.world, "yingjiang");
  f.controller.restoreVisual(f.records.mangshi.world, "mangshi");
  assert.deepEqual(f.records.yingjiang.visuals, ["horse"]);
  assert.deepEqual(f.records.mangshi.visuals, []);
  f.records.yingjiang.world.setMounted(true);
  f.records.yingjiang.world.debugHorse(90.5, 50.25);
  f.records.ruili.target({ type: "crystal" });
  f.actIn("ruili", "传送");
  f.fail(true);
  f.ui.chooseDestination("lianghe");
  assert.deepEqual(f.scenes, []);
  assert.equal(f.records.yingjiang.world.isMounted(), true);
  assert.equal(f.state.coins, 300);
  assert.deepEqual(f.state.horse, horseState(20, 35, "yingjiang"));
  f.fail(false);
  f.ui.chooseDestination("lianghe");
  assert.deepEqual(f.scenes, [6]);
  assert.equal(f.records.yingjiang.world.isMounted(), false);
  assert.equal(f.state.coins, 299.5);
  assert.deepEqual(f.state.horse, horseState(90.5, 50.25, "yingjiang"));
  assert.equal(f.records.lianghe.teleports.length, 1);
  assert.equal(f.records.yingjiang.teleports.length, 0);
});

test("failed horse care never animates or increases visible bond", () => {
  const f = fixture();
  f.controller.handleExternal("buy-horse");
  f.target({ type: "horse" });
  f.fail(true);
  f.act("喂马");
  assert.equal(f.careAnimations(), 0);
  assert.equal(f.horseBond(), 10);
  assert.equal(f.state.horse.bond, 10);
  f.fail(false);
  f.act("喂马");
  assert.equal(f.careAnimations(), 1);
  assert.equal(f.horseBond(), 16);
  f.act("刷马");
  assert.equal(f.careAnimations(), 2);
  assert.equal(f.horseBond(), 20);
  f.update();
  assert.equal(f.ui.label, "上马");
});

test("failed cross-dam call keeps the old horse visible until a committed move", () => {
  const state = Daily.defaultState();
  Daily.buyHorse(state);
  state.horse.bond = 80;
  const f = multiDamFixture(state);
  f.controller.restoreVisual(f.records.mangshi.world, "mangshi");
  f.records.lianghe.world.debugPlayer(30, 40);
  f.controller.update(6, f.records.lianghe.world);
  assert.equal(f.ui.extraRow.id, "call-horse");
  f.fail(true);
  f.controller.handleExternal("call-horse");
  assert.equal(f.records.mangshi.hiddenHorses(), 0);
  assert.equal(f.records.lianghe.world.getHorsePos(), null);
  assert.equal(f.state.horse.dam, "mangshi");
  f.fail(false);
  f.controller.handleExternal("call-horse");
  assert.equal(f.records.mangshi.hiddenHorses(), 1);
  assert.equal(f.records.mangshi.world.getHorsePos(), null);
  assert.deepEqual(f.records.lianghe.world.getHorsePos(), { x: 33.5, z: 42 });
  assert.equal(f.state.horse.dam, "lianghe");
  assert.equal(f.records.lianghe.horseBond(), 80);
});

test("same-dam call keeps the old position on save failure and moves the horse once on retry", () => {
  const state = Daily.defaultState();
  Daily.buyHorse(state);
  state.horse.bond = 80;
  const f = fixture(state);
  f.controller.restoreVisual(f.world);
  f.world.debugPlayer(80, 60);
  f.update();
  assert.equal(f.ui.extraRow.id, "call-horse");
  const before = structuredClone(f.state);
  f.fail(true);
  f.controller.handleExternal("call-horse");
  assert.deepEqual(f.state, before);
  assert.deepEqual(f.world.getHorsePos(), { x: 17, z: 51 });
  assert.equal(f.hiddenHorses(), 0);
  f.fail(false);
  f.controller.handleExternal("call-horse");
  assert.deepEqual(f.world.getHorsePos(), { x: 83.5, z: 62 });
  assert.equal(f.hiddenHorses(), 1);
  assert.equal(f.state.horse.x, 83.5);
  assert.equal(f.state.horse.z, 62);
  assert.equal(f.state.coins, before.coins);
  f.controller.restoreVisual(f.world);
  assert.deepEqual(f.world.getHorsePos(), { x: 83.5, z: 62 });
  f.update();
  assert.equal(f.ui.extraRow.id, "horse-owned");
});

test("following horse position is preserved on scene change even when not mounted", () => {
  const state = Daily.defaultState();
  Daily.buyHorse(state);
  state.horse.bond = 50;
  const f = fixture(state);
  f.controller.restoreVisual(f.world);
  f.world.debugHorse(70, 80);
  f.fail(true);
  assert.equal(f.controller.beforeSceneChange(), false);
  assert.equal(f.state.horse.x, 17);
  assert.deepEqual(f.world.getHorsePos(), { x: 70, z: 80 });
  f.fail(false);
  assert.equal(f.controller.beforeSceneChange(), true);
  assert.equal(f.state.horse.x, 70);
  assert.equal(f.state.horse.z, 80);
  assert.equal(f.world.isMounted(), false);
});

test("custom location is rechecked on click and failed saves leave land and balance untouched", () => {
  const f = multiDamFixture();
  const ruili = f.records.ruili;
  ruili.target(null);
  ruili.world.debugPlayer(80.25, 60.5);
  f.controller.update(3, ruili.world);
  const stale = f.ui.action;
  assert.ok(f.ui.label.includes("600"));
  ruili.world.debugPlotCheck({ ok: false, reason: "water" });
  stale();
  assert.equal(f.state.coins, 1200);
  assert.equal(f.state.home, null);
  assert.equal(f.writes(), 0);
  ruili.world.debugPlotCheck({ ok: true });
  f.fail(true);
  f.actIn("ruili", "在此安家");
  assert.equal(f.state.home, null);
  assert.equal(f.state.coins, 1200);
  assert.deepEqual(ruili.visuals, []);
  f.fail(false);
  f.actIn("ruili", "在此安家");
  assert.equal(f.state.coins, 600);
  assert.equal(f.state.home.site, -1);
  assert.deepEqual(f.state.home.custom, { x: 80.25, z: 60.5 });
  assert.deepEqual(ruili.visuals, ["custom"]);
});

test("custom home restoration recreates its plot and go-home returns to the right dam", () => {
  const state = Daily.defaultState();
  Daily.claimCustomHome(state, 70, 80, "lianghe");
  Daily.buildHomeHut(state);
  const f = multiDamFixture(state);
  const lianghe = f.records.lianghe;
  f.controller.restoreVisual(lianghe.world, "lianghe");
  f.controller.restoreVisual(lianghe.world, "lianghe");
  assert.deepEqual(lianghe.visuals, ["custom", "hut"]);
  f.ui.openPanel();
  assert.equal(f.controller.goHome(), true);
  assert.deepEqual(f.scenes, [6]);
  assert.equal(f.ui.panel, false);
  assert.equal(lianghe.teleports.length, 1);
  assert.equal(f.records.mangshi.teleports.length, 0);
  assert.equal(f.state.coins, 600);
});

test("market sale saves before clearing the basket and showing a stall", () => {
  const state = Daily.defaultState();
  Daily.claimHome(state, 0, 0);
  state.home.basket = { carrot: 8, egg: 2, wool: 1, fur: 1 };
  const f = fixture(state);
  f.world.debugPlayer(4, 34);
  f.update();
  assert.ok(f.ui.label.startsWith("摆摊卖货"));
  assert.ok(f.ui.basket.includes("12 件货"));
  const action = f.ui.action;
  f.fail(true);
  action();
  assert.equal(f.state.coins, 800);
  assert.equal(Daily.basketCount(f.state), 12);
  assert.equal(f.stalls.length, 0);
  f.fail(false);
  action();
  assert.equal(f.state.coins, 1006);
  assert.equal(Daily.basketCount(f.state), 0);
  assert.equal(f.stalls.length, 1);
  action();
  assert.equal(f.state.coins, 1006);
  assert.equal(f.stalls.length, 1);
});

test("market action rechecks distance and mounted status on the actual click", () => {
  const state = Daily.defaultState();
  Daily.claimHome(state, 0, 0);
  state.home.basket.carrot = 8;
  const f = fixture(state);
  f.world.debugPlayer(4, 34);
  f.update();
  const action = f.ui.action;
  f.world.debugPlayer(50, 50); action();
  assert.equal(f.writes(), 0);
  f.world.debugPlayer(4, 34); f.world.setMounted(true); action();
  assert.equal(f.writes(), 0);
  assert.equal(f.state.home.basket.carrot, 8);
  assert.equal(f.state.coins, 800);
  assert.equal(f.stalls.length, 0);
});

function establishedHome() {
  const state = Daily.defaultState();
  state.coins = 5000;
  Daily.claimHome(state, 0, 0);
  Daily.buildHomeHut(state);
  Daily.openHomeField(state);
  Daily.plantCarrots(state, START / 1000 - 60);
  Daily.harvestCarrots(state, START / 1000, DAY);
  for (const kind of ["chicken", "rabbit", "sheep"]) Daily.buyHomeAnimal(state, kind, START / 1000);
  Daily.upgradeHomeBamboo(state);
  Daily.plantCarrots(state, START / 1000);
  assert.equal(Daily.validateState(state), true);
  return state;
}

test("resting and standing preserve coins, crop clocks and saved state", () => {
  const f = fixture(establishedHome());
  f.controller.restoreVisual(f.world);
  f.update();
  assert.ok(f.ui.label.startsWith("在屋前歇一歇"), f.ui.label);
  const before = structuredClone(f.state);
  const writes = f.writes();
  assert.equal(f.ui.action(), true);
  assert.equal(f.world.isResting(), true);
  assert.deepEqual(f.state, before);
  assert.equal(f.writes(), writes);
  f.update();
  assert.equal(f.ui.label, "起身");
  f.ui.action();
  assert.equal(f.world.isResting(), false);
  assert.deepEqual(f.state, before);
  assert.equal(f.writes(), writes);
});

test("rest action rechecks the home plot and mounted state on click", () => {
  const f = fixture(establishedHome());
  f.update();
  const action = f.ui.action;
  f.target({ type: "hall" });
  assert.equal(action(), false);
  assert.equal(f.world.isResting(), false);
  f.target({ type: "plot", site: 0, idx: 1, claimed: true });
  assert.equal(action(), false);
  assert.equal(f.world.isResting(), false);
  f.target({ type: "plot", site: 0, idx: 0, claimed: true });
  f.world.setMounted(true);
  assert.equal(action(), false);
  assert.equal(f.world.isResting(), false);
  assert.equal(f.writes(), 0);
});

test("failed produce collection keeps the harvest basket visible until a saved retry", () => {
  const state = establishedHome();
  state.home.produce.egg = 1;
  const f = fixture(state);
  f.controller.restoreVisual(f.world);
  assert.equal(f.world.hasHarvestBasket(), true);
  f.update();
  assert.equal(f.ui.label, "把出产收进背篓");
  const before = structuredClone(f.state);
  const action = f.ui.action;
  f.fail(true);
  action();
  assert.deepEqual(f.state, before);
  assert.equal(f.world.hasHarvestBasket(), true);
  f.fail(false);
  action();
  assert.equal(f.state.home.produce.egg, 0);
  assert.equal(f.state.home.basket.egg, 1);
  assert.equal(f.state.coins, before.coins);
  assert.equal(f.world.hasHarvestBasket(), false);
});

test("dancing takes precedence over home and festival actions without saving", () => {
  const f = fixture(establishedHome());
  f.world.debugDancing(true);
  const before = structuredClone(f.state);
  f.update();
  assert.equal(f.ui.label, "纵歌中 · 迈步就停");
  assert.equal(f.ui.action, null);
  assert.equal(f.writes(), 0);
  assert.deepEqual(f.state, before);
  f.world.debugDancing(false);
  f.update();
  assert.ok(f.ui.label.startsWith("在屋前歇一歇"));
});

test("Ruili market sale takes priority over repeat festival play until the basket is empty", () => {
  const day = "2027-04-12";
  const state = Daily.defaultState();
  Daily.claimHome(state, 0, 0, "ruili");
  state.home.basket.carrot = 8;
  assert.equal(Daily.joinFestival(state, "songkran", day).ok, true);
  const f = fixture(state);
  let splashes = 0;
  f.world.playSplash = () => { splashes++; return true; };
  f.world.debugPlayer(2, 18);
  f.target({ type: "crystal" });
  const discovery = createDiscoveryController({ state: f.state, transact: f.session.transact, ui: f.ui, today: () => day });
  const controller = createHomeController({ state: f.state, transact: f.session.transact, ui: f.ui,
    getDamWorld: () => f.world, setScene: value => f.scenes.push(value), now: () => START,
    today: () => day, setFestivalAction: discovery.setAction });
  controller.update(3, f.world);
  assert.ok(f.ui.label.startsWith("摆摊卖货"), f.ui.label);
  assert.equal(f.ui.action().ok, true);
  assert.equal(f.state.coins, 950);
  assert.equal(f.state.home.basket.carrot, 0);
  assert.equal(f.stalls.length, 1);
  assert.equal(splashes, 0);
  controller.update(3, f.world);
  assert.equal(f.ui.label, "泼一捧水 · 送祝福");
  const writes = f.writes(), before = structuredClone(f.state);
  assert.equal(f.ui.action(), true);
  assert.equal(splashes, 1);
  assert.equal(f.writes(), writes);
  assert.deepEqual(f.state, before);
});
