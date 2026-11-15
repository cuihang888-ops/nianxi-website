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

const vendor = new URL("../wechat/vendor/", import.meta.url);
const adapterSource = fs.readFileSync(new URL("threejs-miniprogram.cjs", vendor), "utf8");
const damSource = fs.readFileSync(new URL("dam-world.cjs", vendor), "utf8");
const ruiliSource = fs.readFileSync(new URL("ruili-scene.cjs", vendor), "utf8");

function ruiliWorld() {
  // 与 wechat-scenes 夹具同一装载方式，但 require 按名解析：
  // shared-village 契约给真实模块，其余回退（dam-world 已先行装载并捕获 Economy）。
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

test("ruili site0 follows the shared-village contract: 8 plots with stable plotIds in enable order", () => {
  const world = ruiliWorld();
  const plots = world.getPlots();
  const site0 = plots.filter(p => p.site === 0);
  assert.equal(site0.length, 8);
  assert.equal(site0.map(p => p.id).join(","), Village.ALL_PLOTS.map(p => p.id).join(","));
  site0.forEach((p, i) => {
    const dam = Village.toDamCoords(Village.ALL_PLOTS[i].origin);
    assert.equal(p.x, dam.x);
    assert.equal(p.z, dam.z);
    assert.equal(p.reserved, i >= Village.SAMPLE_PLOTS.length, "样板 A/B 可认领，C–H 为预留");
    assert.equal(p.claimed, false, "初始不得有任何已入住状态");
  });
  const site1 = plots.filter(p => p.site === 1);
  assert.equal(site1.length, 8);
  assert.ok(site1.every(p => p.id === null && !p.reserved), "site1 保持原环形地块");
});

test("shared-village pads stay clear of the ruili spec waters", () => {
  const world = ruiliWorld();
  const { waters } = world.getSpec();
  for (const plot of Village.ALL_PLOTS) {
    const polygonDam = Village.plotPolygon(plot).map(pt => Village.toDamCoords(pt));
    for (const w of waters) {
      assert.ok(Village.distancePointToPolygon({ x: w.x, z: w.z }, polygonDam) >= w.r - 1e-9,
        `${plot.id} 不压水面 (${w.x},${w.z},r${w.r})`);
    }
  }
});

test("nearestInteractable exposes plotId anchors and reserved state", () => {
  const world = ruiliWorld();
  const a = Village.toDamCoords(Village.ALL_PLOTS[0].origin);
  world.debugSetPlayer(a.x, a.z);
  let target = world.nearestInteractable();
  assert.equal(target.type, "plot");
  assert.equal(target.id, "plot_ruili_river_0001_a");
  assert.equal(target.reserved, false);
  const h = Village.toDamCoords(Village.ALL_PLOTS[7].origin);
  world.debugSetPlayer(h.x, h.z);
  target = world.nearestInteractable();
  assert.equal(target.id, "plot_ruili_river_0001_h");
  assert.equal(target.reserved, true);
});

test("claiming a sample plot removes its layout-outline decor (one ring per sample plot)", () => {
  const world = ruiliWorld();
  const countRings = () => {
    let n = 0;
    world.scene.traverse(o => { if (o.geometry?.type === "RingGeometry") n++; });
    return n;
  };
  assert.equal(countRings(), Village.SAMPLE_PLOTS.length);
  world.markClaimed(0, 0);
  assert.equal(world.getPlots().find(p => p.id === "plot_ruili_river_0001_a").claimed, true);
  assert.equal(countRings(), Village.SAMPLE_PLOTS.length - 1);
  world.markClaimed(0, 1);
  assert.equal(countRings(), 0);
});

test("pagoda prayer site anchors derive from the contract PAGODA and the spot is standable", () => {
  const world = ruiliWorld();
  const site = world.getPrayerSite();
  assert.ok(site, "瑞丽世界应提供祈福点");
  const centerDam = Village.toDamCoords(Village.PAGODA.center);
  const offset = Village.PAGODA.entry.localOffset;
  const distance = Village.PAGODA.hillRadius + 8.5 + 6.4;
  assert.equal(site.entry.x, centerDam.x + offset.x / Math.hypot(offset.x, offset.z) * distance);
  assert.equal(site.entry.z, centerDam.z + offset.z / Math.hypot(offset.x, offset.z) * distance);
  assert.equal(site.entry.r, Village.PAGODA.entry.radius);
  assert.equal(world.getMapFeatures().pagoda.entry.x, site.entry.x);
  assert.equal(world.getMapFeatures().pagoda.entry.z, site.entry.z);
  assert.equal(site.ring.x, centerDam.x);
  assert.equal(site.ring.z, centerDam.z);
  const resolved = world.resolveLandPosition(site.spot.x, site.spot.z);
  assert.ok(Math.hypot(resolved.x - site.spot.x, resolved.z - site.spot.z) < 0.01, "礼拜位可实际站立（不被碰撞推离）");
  assert.equal(world.isGuideRingVisible(), false);
  world.setGuideRingVisible(true);
  assert.equal(world.isGuideRingVisible(), true);
  world.setGuideRingVisible(false);
  assert.equal(world.isGuideRingVisible(), false);
  world.setPrayerPose(1);
  assert.equal(world.getPrayerPose(), 1);
  world.update(0.016, 1);
  world.setPrayerPose(0);
  assert.equal(world.getPrayerPose(), 0);
});

test("map features expose same-source bounds, plots, roads, landmarks and actual exits", () => {
  const world = ruiliWorld();
  const features = world.getMapFeatures();
  assert.equal(features.villageId, Village.VILLAGE_ID);
  assert.equal(features.boundsPolygon.length, Village.BOUNDS_POLYGON.length);
  assert.equal(features.plots.map(p => p.id).join(","), Village.ALL_PLOTS.map(p => p.id).join(","));
  assert.equal(features.pagoda.prayer, true);
  const centerDam = Village.toDamCoords(Village.PAGODA.center);
  assert.equal(features.pagoda.center.x, centerDam.x);
  assert.equal(features.pagoda.center.z, centerDam.z);
  assert.equal(features.market.x, Village.toDamCoords(Village.MARKET_SELL_POINT).x);
  assert.equal(features.market.z, Village.toDamCoords(Village.MARKET_SELL_POINT).z);
  assert.equal(features.hall.x, world.getHallPos().x);
  assert.equal(features.hall.z, world.getHallPos().z);
  assert.equal(features.roads[0].points[0].x, Village.toDamCoords(Village.ROAD_APPROACH_WEST).x);
  assert.equal(features.roads[0].points.length, Village.ROAD_POINTS.length + 1);
  assert.equal(features.exits[0].to.x, Village.toDamCoords(Village.ROAD_APPROACH_WEST).x);
  assert.equal(features.exits[1].id, Village.TEMPLE_ID);
  assert.equal(features.exits[1].to.x, Village.toDamCoords(Village.TEMPLE_EXIT.milestone).x);
  assert.equal(features.temple, undefined, "总佛寺只标方向，不能虚构本场景已有寺院");
});

test("minimap forward follows actual avatar or mount rotation and stays independent of camera orbit", () => {
  const world = ruiliWorld();
  for (const [yaw, expected] of [[0, { x: 0, z: 1 }], [Math.PI / 2, { x: 1, z: 0 }], [Math.PI, { x: 0, z: -1 }], [-Math.PI / 2, { x: -1, z: 0 }]]) {
    world.setPlayerYaw(yaw);
    const forward = world.getPlayerForward();
    assert.ok(Math.abs(forward.x - expected.x) < 1e-10);
    assert.ok(Math.abs(forward.z - expected.z) < 1e-10);
    world.handleDrag(120, -40);
    assert.equal(world.getPlayerForward().x, forward.x);
    assert.equal(world.getPlayerForward().z, forward.z);
  }
  const position = world.getPlayerPos();
  world.showHorse(position.x, position.z);
  world.setMounted(true);
  world.setMoveInput(1, 0);
  world.update(0.016, 1);
  world.setMoveInput(0, 0);
  const mountedForward = world.getPlayerForward();
  world.setPlayerYaw(Math.PI / 7);
  assert.equal(world.getPlayerForward().x, mountedForward.x, "骑乘读取坐骑方向，不读独立角色旋转");
  assert.equal(world.getPlayerForward().z, mountedForward.z);
  world.handleDrag(-90, 25);
  assert.equal(world.getPlayerForward().x, mountedForward.x);
  assert.equal(world.getPlayerForward().z, mountedForward.z);
});

// —— home-controller 祈福流程（假世界，沿用 wechat-home-controller 测试的假件风格）——

function prayerFixture() {
  const state = Daily.defaultState();
  let time = Date.parse("2026-11-15T00:00:00.000Z");
  const toasts = [];
  let actionLabel = "", actionFn = null, target = null;
  const ui = {
    markDirty() {}, toast: m => toasts.push(m),
    setAction(label, fn) { actionLabel = label || ""; actionFn = fn || null; },
    setBasket() {}, setExtraRow() {}, isPanelOpen: () => false,
    closePanel() {}, closeTeleport() {},
  };
  const site = { entry: { x: 141, z: -109, r: 6 }, spot: { x: 133.8, z: -103.1, yaw: 2.26 }, ring: { x: 152, z: -118, r: 20 } };
  let player = { x: site.entry.x, z: site.entry.z };
  let resting = false, mounted = false;
  const calls = { teleports: [], poses: [], ring: [] };
  const world = {
    setCrystalLit() {},
    isDancing: () => false,
    isResting: () => resting,
    setResting(v) { resting = !!v; },
    isMounted: () => mounted,
    setMounted(v) { mounted = !!v; },
    nearestInteractable: () => target,
    getPlayerPos: () => ({ ...player }),
    getPrayerSite: () => site,
    teleportPlayerTo(x, z) { calls.teleports.push({ x, z }); player = { x, z }; },
    setPlayerYaw() {},
    setPrayerPose(v) { calls.poses.push(v); },
    setGuideRingVisible(v) { calls.ring.push(v); },
    setMoveInput() {},
    checkPlotSpot: () => ({ ok: false, reason: "invalid" }),
    getPlots: () => [],
    getSites: () => [{ x: -64, z: 66 }],
    getHallPos: () => ({ x: -27, z: -8 }),
    debugPlayer(x, z) { player = { x, z }; },
    debugMounted(v) { mounted = v; },
    debugTarget(t) { target = t; },
  };
  const controller = createHomeController({
    state,
    transact: fn => { const draft = structuredClone(state); const r = fn(draft); if (r?.ok === false) return r; Object.assign(state, draft); return { ok: true, result: r }; },
    ui,
    getDamWorld: () => world,
    setScene() {},
    now: () => time,
    today: () => "2026-11-15",
  });
  return {
    controller, world, state, toasts, calls, site,
    advance(ms) { time += ms; },
    action: () => ({ label: actionLabel, fn: actionFn }),
  };
}

test("pagoda prayer runs join -> bow -> sit -> circumambulate -> exit without touching coins or home", () => {
  const f = prayerFixture();
  const coins = f.state.coins;
  f.controller.update(3, f.world);
  assert.equal(f.action().label, "入塔祈福");
  assert.equal(f.action().fn(), true);
  assert.deepEqual(f.calls.teleports, [{ x: f.site.spot.x, z: f.site.spot.z }]);
  assert.deepEqual(f.calls.poses, [1], "先合掌");
  f.advance(1700);
  f.controller.update(3, f.world);
  assert.deepEqual(f.calls.poses, [1, 2], "再礼拜");
  f.advance(1900);
  f.controller.update(3, f.world);
  assert.equal(f.world.isResting(), true, "静坐祈福复用静坐姿势");
  f.advance(Daily.ECONOMY.meditationMilliseconds + 100);
  f.controller.update(3, f.world);
  assert.equal(f.world.isResting(), false);
  assert.deepEqual(f.calls.ring, [true], "绕塔光环亮起");
  for (let i = 1; i <= 64; i++) {
    const a = i / 64 * Math.PI * 2;
    f.world.debugPlayer(f.site.ring.x + Math.cos(a) * f.site.ring.r, f.site.ring.z + Math.sin(a) * f.site.ring.r);
    f.controller.update(3, f.world);
  }
  assert.deepEqual(f.calls.ring, [true, false], "绕满一圈光环熄灭");
  assert.ok(f.toasts.some(t => t.includes("绕塔一周了")));
  assert.equal(f.action().label, "出塔 · 慢慢回村");
  assert.equal(f.action().fn(), true);
  f.world.debugPlayer(0, 40);
  f.controller.update(3, f.world);
  assert.notEqual(f.action().label, "出塔 · 慢慢回村");
  assert.equal(f.state.coins, coins, "祈福全程不发币不扣币");
  assert.equal(f.state.home, null, "祈福不写家园状态");
});

test("mounted players are offered dismount before entering the pagoda", () => {
  const f = prayerFixture();
  f.world.debugMounted(true);
  f.controller.update(3, f.world);
  assert.equal(f.action().label, "下马");
});

test("reserved contract plots cannot be claimed from the action button", () => {
  const f = prayerFixture();
  f.world.debugPlayer(-44, 136);
  f.world.debugTarget({ type: "plot", site: 0, idx: 7, id: "plot_ruili_river_0001_h", reserved: true, claimed: false, hut: false });
  f.controller.update(3, f.world);
  assert.equal(f.action().label, "预留地 · 尚未开放");
  const coins = f.state.coins;
  assert.equal(f.action().fn(), true);
  assert.equal(f.state.coins, coins);
  assert.equal(f.state.home, null);
});
