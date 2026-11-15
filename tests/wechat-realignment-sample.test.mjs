// 纠偏样板回归（2026-11-15）：瑞丽总佛寺落位/进出、静坐无时限、木鱼触发点、样例羊边界、
// 家园田房不重叠、夜晚提亮、祈福 done 离场、金塔祈福与寺院流程（假世界）。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Economy = require("../wechat/vendor/preview-economy.cjs");
const Village = require("../wechat/vendor/shared-village.cjs");
const Daily = require("../wechat/vendor/daily-state.cjs");
const Sky = require("../wechat/vendor/preview-sky.cjs");
const { createHomeController } = await import("../wechat/home-controller.js");

const vendor = new URL("../wechat/vendor/", import.meta.url);
const adapterSource = fs.readFileSync(new URL("threejs-miniprogram.cjs", vendor), "utf8");
const damSource = fs.readFileSync(new URL("dam-world.cjs", vendor), "utf8");
const ruiliSource = fs.readFileSync(new URL("ruili-scene.cjs", vendor), "utf8");

function ruiliWorld() {
  const context = vm.createContext({ exports: {}, console, require: () => Economy, setInterval, clearInterval });
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

// —— 昼夜：夜晚提亮、正午不动 ——
test("night sky keeps a deep-blue base with a moderate lift; noon keys unchanged", () => {
  const byHour = new Map(Sky.SKY_KEYS.map(key => [key[0], key]));
  for (const hour of [0, 4.8, 21.2, 24]) {
    // Sansa 配方：环境光只适度抬底（0.34→0.44）保证辨路，暖意交给场景灯点，不整体洗白
    assert.ok(byHour.get(hour)[3] >= 0.42 && byHour.get(hour)[3] <= 0.46, `night hemi at ${hour}`);
    assert.ok(byHour.get(hour)[4] >= 0.18 && byHour.get(hour)[4] <= 0.22, `night sun at ${hour}`);
  }
  for (const hour of [9, 16.5]) {
    assert.deepEqual([...byHour.get(hour)], [hour, 0xc2dbee, 0xd6e5ee, 0.95, 0.9, 0xffe3b3, 0], "正午关键帧一字未动");
  }
  const night = Sky.computeSky(new Date("2026-11-16T22:30:00+08:00").getTime());
  assert.equal(night.weather, "sunny", "断言前提：该日为晴天（雨夜另有天气系数，见样板文档）");
  assert.ok(night.hemi >= 0.42 && night.hemi <= 0.46, "22:30 环境光适度抬底可辨路");
  const noon = Sky.computeSky(new Date("2026-11-16T12:00:00+08:00").getTime());
  assert.ok(Math.abs(noon.hemi - 0.95) < 0.01, "正午仍是原亮度");
});

test("warm lantern lights along the sample route wake up only at night", () => {
  const world = ruiliWorld();
  const outdoorLights = [];
  world.scene.traverse(object => { if (object.isPointLight && object.position.x < 400) outdoorLights.push(object); });
  assert.ok(outdoorLights.length >= 3, "集市/村心/寺院三处真实暖光");
  world.setSky(Sky.computeSky(new Date("2026-11-16T12:00:00+08:00").getTime()));
  assert.ok(outdoorLights.every(light => light.intensity === 0), "白天灯点熄着");
  world.setSky(Sky.computeSky(new Date("2026-11-16T22:30:00+08:00").getTime()));
  assert.ok(outdoorLights.every(light => light.intensity > 0.8), "入夜灯点亮起");
});

test("wooden fish auto-strike runs on a timer and stops on demand", async () => {
  const world = ruiliWorld();
  const fx = world.getDecorationApi().templeFx;
  assert.equal(fx.isAutoStriking(), false);
  let strikes = 0;
  const stop = fx.startAutoStrike(30, () => { strikes += 1; });
  assert.equal(typeof stop, "function");
  assert.equal(fx.isAutoStriking(), true);
  await new Promise(resolve => setTimeout(resolve, 130));
  assert.ok(strikes >= 2, `自动节律已敲 ${strikes} 下`);
  stop();
  assert.equal(fx.isAutoStriking(), false);
  const settled = strikes;
  await new Promise(resolve => setTimeout(resolve, 80));
  assert.equal(strikes, settled, "停后不再敲");
});

// —— 家园布局：田块不压房（用户 2026-11-15 22:55 复查项）——
test("home layout keeps a positive gap between house platform and field beds", () => {
  const world = ruiliWorld();
  const layout = world.getHomeLayout();
  const gap = layout.bedsAlong[0] - layout.houseAlong[1];
  assert.ok(gap > 0.3, `田与房间隙 ${gap.toFixed(2)} 必须为正（旧常数曾重叠约 0.22）`);
  assert.ok(Math.abs(gap - 0.38) < 0.01, "间隙与落位常数一致");
});

// —— 瑞丽总佛寺：落位与小地图 ——
test("ruili temple is sited on the living route and exposed to the minimap", () => {
  const world = ruiliWorld();
  const site = world.getTempleSite();
  assert.equal(site.center.x, 105); assert.equal(site.center.z, -25);
  assert.equal(site.entryAnchor.x, 105); assert.equal(site.entryAnchor.z, -31); assert.equal(site.entryAnchor.r, 4.5);
  assert.equal(site.knots.length, 3);
  assert.equal(site.knots.filter(knot => knot.interior).length, 1);
  const features = world.getMapFeatures();
  assert.equal(features.temple.id, "ruili-zongfosi");
  assert.equal(features.temple.x, 105);
  assert.equal(features.temple.z, -25);
  assert.equal(features.pasture.x, -10);
  assert.equal(features.pasture.z, 90);
  // 寺院庭院与样板牧场都是受保护公共空间：自选地不得压入
  assert.equal(world.checkPlotSpot(105, -25).ok, false, "寺院庭院不可安家");
  assert.equal(world.checkPlotSpot(-10, 90).ok, false, "样板牧场不可安家");
  const interior = world.getInterior();
  assert.equal(interior.entry.x, 600); assert.equal(interior.entry.z, 6.2); assert.equal(interior.entry.yaw, Math.PI);
  assert.equal(interior.anchors.worship.x, 600); assert.equal(interior.anchors.worship.z, -2);
  assert.equal(interior.anchors.fish.x, 604.4); assert.equal(interior.anchors.fish.z, -3.2);
});

// —— 进出寺：记原位、出寺还原、殿内移动钳制、跪姿下沉、持珠可见 ——
test("temple interior enter/exit restores the courtyard position and clamps movement inside", () => {
  const world = ruiliWorld();
  world.debugSetPlayer(105, -31);
  assert.equal(world.enterInterior(), true);
  assert.equal(world.isInteriorActive(), true);
  const entered = world.getPlayerPos();
  assert.equal(entered.x, 600); assert.equal(entered.z, 6.2);
  // 朝北（-Z）直走 5 秒：不得穿出殿门南墙，也不得越过佛台碰撞
  world.setMoveInput(0, 1);
  for (let i = 0; i < 100; i++) world.update(0.05, i * 0.05);
  world.setMoveInput(0, 0);
  const inside = world.getPlayerPos();
  assert.ok(inside.x >= 587.7 && inside.x <= 612.3 && inside.z >= -8.3 && inside.z <= 8.3, "殿内位置被钳制在内景矩形内");
  // 跪姿：身体下沉；持珠：佛珠串可见（珠串挂在 player 组下，父组即玩家）
  world.setKneeling(true);
  world.update(1, 200);
  const beads = (() => { let found = null; world.scene.traverse(o => { if (o.name === "player:beads") found = o; }); return found; })();
  assert.ok(beads, "佛珠串节点存在");
  assert.ok(beads.parent.position.y < -0.4, "跪姿下沉到位");
  world.setBeadsHeld(true);
  assert.equal(world.isBeadsHeld(), true);
  assert.equal(beads.visible, true, "盘佛珠时珠串可见");
  world.rollBead(); world.rollBead();
  world.update(1, 300);
  assert.ok(Math.abs(beads.rotation.z + Math.PI * 2 / 6) < 0.05, "过两颗后珠串缓动转过两颗的角度（逐颗位移）");
  world.setBeadsHeld(false);
  assert.equal(beads.visible, false);
  assert.equal(world.exitInterior(), true);
  assert.equal(world.isInteriorActive(), false);
  const restored = world.getPlayerPos();
  assert.equal(restored.x, 105); assert.equal(restored.z, -31, "出寺还原到入殿前位置");
});

// —— 静坐无时限：长时间静止不被自动结束 ——
test("resting (temple sitting) has no time limit while the player stays still", () => {
  const world = ruiliWorld();
  world.debugSetPlayer(105, -31);
  world.enterInterior();
  world.teleportPlayerTo(597.3, -2);
  assert.equal(world.setResting(true), true);
  // 模拟 30 分钟静坐（远超金塔祈福的 5 秒冥想时长）：无输入则不自动起身
  for (let i = 0; i < 180; i++) world.update(10, i * 10);
  assert.equal(world.isResting(), true, "静坐不设时限，想坐多久坐多久");
  world.setResting(false);
  assert.equal(world.isResting(), false);
});

// —— 样例羊：开发样例边界（独立 API、不动 home.animals）——
test("sample sheep is a standalone preview with name, wool colours and accessories", () => {
  const world = ruiliWorld();
  const api = world.getDecorationApi();
  assert.ok(api?.sampleSheep, "样例羊接口存在");
  const sheep = api.sampleSheep;
  const initial = sheep.getState();
  assert.equal(initial.name, "小满");
  assert.equal(initial.color, "pink");
  assert.equal(initial.accessory, "bell");
  assert.ok(Math.hypot(initial.x - -10, initial.z - 90) < 6, "样例羊在样板牧场内");
  sheep.setName("云朵");
  sheep.setColor("gray");
  sheep.setAccessory("hat");
  const changed = sheep.getState();
  assert.equal(changed.name, "云朵");
  assert.equal(changed.color, "gray");
  assert.equal(changed.accessory, "hat");
  sheep.setColor("not-a-colour");
  assert.equal(sheep.getState().color, "gray", "非法毛色被拒绝");
  assert.equal(typeof api.templeFx?.strikeFish, "function", "木鱼触发点就位（音频接通归 Codex）");
  assert.equal(typeof api.templeFx?.rollBead, "function", "念珠轻响触发点就位（每颗一次）");
  assert.equal(typeof api.setBreathGlow, "function", "静坐呼吸光钩子就位");
});

// —— 假世界：控制器流程（祈福 done 离场 + 寺院五动作 + 静坐无时限）——
function flowFixture() {
  const state = Daily.defaultState();
  let time = Date.parse("2026-11-16T04:00:00.000Z");
  const toasts = [];
  let label = "", actionFn = null, choices = null;
  const ui = {
    markDirty() {}, toast: message => toasts.push(message),
    setAction(value, fn) { label = value || ""; actionFn = fn || null; },
    setBasket() {}, setExtraRow() {}, setWorldRows() {}, isPanelOpen: () => false,
    openChoices(data, callback) { choices = { data, callback }; },
    closePanel() {},
  };
  const transact = mutator => {
    const draft = JSON.parse(JSON.stringify(state));
    const result = mutator(draft);
    if (!result?.ok) return { ok: false, error: result };
    for (const key of Object.keys(state)) delete state[key];
    Object.assign(state, draft);
    return { ok: true, result };
  };
  let player = { x: 0, z: 0 };
  let interiorActive = false, interiorReturn = null;
  let prayerPose = 0, resting = false, kneeling = false, bow = false, beads = false, ringVisible = false;
  let fishStrikes = 0, beadRolls = 0, engineBeads = 0;
  const interior = {
    rect: { minX: 587, maxX: 613, minZ: -9, maxZ: 9 },
    entry: { x: 600, z: 6.2, yaw: Math.PI }, gate: { x: 105, z: -6 }, maxRadius: 11,
    anchors: { worship: { x: 600, z: -2 }, pray: { x: 602.7, z: -2 }, sit: { x: 597.3, z: -2 }, beads: { x: 595.6, z: -3.2 }, fish: { x: 604.4, z: -3.2 }, exit: { x: 600, z: 6.9 } },
  };
  const templeSite = {
    center: { x: 105, z: -25 }, gate: { x: 105, z: -11.5 }, hallSeat: { x: 105, z: -38 },
    entryAnchor: { x: 105, z: -31, r: 4.5 }, dismount: { x: 105, z: -6 },
    knots: [{ id: "ruili-temple-knot-rack-01", x: 96, z: -20 }, { id: "ruili-temple-knot-rack-02", x: 114, z: -20 }, { id: "ruili-temple-knot-rack-03", interior: true, x: 610.8, z: 3.4 }],
  };
  const prayerSite = {
    entry: { x: 40, z: 40, r: 6 }, spot: { x: 32, z: 0, yaw: 0 }, ring: { x: 0, z: 0, r: 32 },
  };
  const world = {
    getPlayerPos: () => ({ ...player }),
    debugPlayer(x, z) { player = { x, z }; },
    teleportPlayerTo(x, z) { player = { x, z }; },
    setPlayerYaw() {}, setMoveInput() {},
    setPrayerPose(value) { prayerPose = value; }, getPrayerPose: () => prayerPose,
    setResting(value) { resting = !!value; return true; }, isResting: () => resting,
    setKneeling(value) { kneeling = !!value; }, setBow(value) { bow = !!value; }, setBeadsHeld(value) { beads = !!value; },
    rollBead() { engineBeads += 1; },
    setGuideRingVisible(value) { ringVisible = !!value; }, isGuideRingVisible: () => ringVisible,
    enterInterior() { interiorReturn = { ...player }; interiorActive = true; player = { x: interior.entry.x, z: interior.entry.z }; return true; },
    exitInterior() { interiorActive = false; if (interiorReturn) player = interiorReturn; interiorReturn = null; return true; },
    isInteriorActive: () => interiorActive,
    getInterior: () => interior,
    getTempleSite: () => templeSite,
    getPrayerSite: () => prayerSite,
    getDecorationApi: () => ({ templeFx: { strikeFish() { fishStrikes += 1; }, rollBead() { beadRolls += 1; } }, sampleSheep: null }),
    nearestInteractable: () => null,
    isMounted: () => false, isDancing: () => false,
    setCrystalLit() {}, getPlots: () => [], getSites: () => [{ x: 0, z: 0 }], getHallPos: () => ({ x: 0, z: 0 }),
    checkPlotSpot: () => ({ ok: false, reason: "bounds" }),
  };
  const controller = createHomeController({ state, transact, ui, getMangshi: () => world, setScene: () => {}, now: () => time, today: () => "2026-11-16" });
  return {
    controller, world, ui, toasts, state,
    advance: ms => { time += ms; },
    update: () => controller.update(3, world),
    label: () => label,
    act: () => actionFn && actionFn(),
    choices: () => choices,
    pose: () => ({ prayerPose, resting, kneeling, bow, beads }),
    fishStrikes: () => fishStrikes,
    beadRolls: () => beadRolls,
    engineBeads: () => engineBeads,
  };
}

test("pagoda prayer done stage exits when the player walks away (regression)", () => {
  const f = flowFixture();
  f.world.debugPlayer(40, 40);
  f.update();
  assert.match(f.label(), /入塔祈福/);
  f.act();
  f.advance(1600); f.update();
  f.advance(1800); f.update();
  assert.equal(f.pose().resting, true, "祈福第三段是静坐");
  f.advance(Daily.ECONOMY.meditationMilliseconds); f.update();
  // 绕塔一周（贴环线走满）
  for (let step = 1; step <= 60; step++) {
    const angle = step / 60 * Math.PI * 2;
    f.world.debugPlayer(Math.cos(angle) * 32, Math.sin(angle) * 32);
    f.update();
  }
  assert.match(f.label(), /出塔/);
  // 走远：done 阶段自动出祈福态，不再被「出塔」按钮卡住动作区
  f.world.debugPlayer(120, 120);
  f.update();
  assert.equal(f.pose().prayerPose, 0);
  assert.ok(f.toasts.includes("出塔了 · 愿这一路都平安"));
  f.update();
  assert.doesNotMatch(f.label(), /出塔/);
});

test("temple flow: enter, worship repeats, sitting has no limit, wooden fish strikes, exit restores", () => {
  const f = flowFixture();
  f.world.debugPlayer(105, -31);
  f.update();
  assert.match(f.label(), /进大殿/);
  f.act();
  assert.equal(f.world.isInteriorActive(), true);
  assert.deepEqual(f.world.getPlayerPos(), { x: 600, z: 6.2 });
  // 拜神：跪 + 叩首一次，随后可再拜
  f.world.debugPlayer(600, -2);
  f.update();
  assert.match(f.label(), /拜神/);
  f.act();
  assert.equal(f.pose().kneeling, true);
  assert.equal(f.pose().bow, true);
  f.advance(1200); f.update(); f.update();
  assert.match(f.label(), /再拜一次/);
  f.act(); // 再拜一次
  assert.equal(f.pose().bow, true);
  f.advance(1200); f.update(); f.update();
  // 祈祷：五心愿面板，选第一个
  f.world.debugPlayer(602.7, -2);
  f.update();
  assert.match(f.label(), /祈祷/);
  f.act();
  assert.equal(f.choices()?.data.items.length, 5);
  f.choices().callback("0");
  assert.equal(f.pose().kneeling, true);
  assert.equal(f.pose().prayerPose, 1);
  f.advance(3000); f.update();
  assert.equal(f.pose().prayerPose, 0, "祈祷定式到点自动收势");
  // 静坐：没有时限——推进 30 分钟仍在静坐，动作区是「起身」
  f.world.debugPlayer(597.3, -2);
  f.update();
  assert.match(f.label(), /静坐/);
  f.act();
  assert.equal(f.pose().resting, true);
  f.advance(30 * 60 * 1000);
  f.update();
  assert.equal(f.pose().resting, true, "静坐不设时限");
  assert.match(f.label(), /起身/);
  f.act();
  assert.equal(f.pose().resting, false);
  // 盘佛珠：逐颗推进（个人计数 + 双触发点），从第 0 颗起
  f.world.debugPlayer(595.6, -3.2);
  f.update();
  assert.match(f.label(), /盘佛珠/);
  f.act();
  assert.equal(f.pose().beads, true);
  f.update();
  assert.match(f.label(), /第 0 颗 \/ 108/);
  f.act(); f.act();
  assert.equal(f.engineBeads(), 2, "每颗一次引擎珠串步进");
  assert.equal(f.beadRolls(), 2, "每颗一次念珠轻响触发点");
  f.update();
  assert.match(f.label(), /第 2 颗 \/ 108/);
  // 敲木鱼：触发点计数
  f.world.debugPlayer(604.4, -3.2);
  f.update();
  assert.match(f.label(), /敲木鱼/);
  f.act(); f.act();
  assert.equal(f.fishStrikes(), 2);
  // 出寺：回到入殿前位置
  f.world.debugPlayer(600, 6.9);
  f.update();
  assert.match(f.label(), /出寺/);
  f.act();
  assert.equal(f.world.isInteriorActive(), false);
  assert.deepEqual(f.world.getPlayerPos(), { x: 105, z: -31 });
});
