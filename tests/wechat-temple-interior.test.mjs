import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Daily = require("../wechat/vendor/daily-state.cjs");
const Economy = require("../wechat/vendor/preview-economy.cjs");
const { createHomeController } = await import("../wechat/home-controller.js");
const { createCanvasUI } = require("../wechat/vendor/canvas-ui.cjs");

const DAY = "2026-11-15";
const T0 = Date.parse(DAY + "T00:00:00.000Z");
const T0SEC = Math.floor(T0 / 1000);
const ID = "local-m3x9k2-ab12cd";

// —— 状态层：祈祷轻标记（rites.templeAt / templeWish，与金塔 pagodaAt 同族）——

test("temple prayer mark: five fixed wishes only, paired fields, zero coins", () => {
  assert.deepEqual([...Daily.TEMPLE_WISHES], ["平安", "家人", "健康", "学业", "感谢"]);
  for (const wish of Daily.TEMPLE_WISHES) {
    const state = Daily.newPlayerState();
    Daily.registerPlayer(state, "松岚", { at: T0, id: ID });
    const coins = state.coins;
    assert.equal(Daily.markTemplePrayer(state, wish, T0 + 1000).ok, true, wish);
    assert.equal(state.rites.templeWish, wish);
    assert.equal(state.rites.templeAt, T0 + 1000);
    assert.equal(state.coins, coins, "祈祷不发币");
    assert.equal(Daily.validateState(state), true);
  }
  const state = Daily.newPlayerState();
  Daily.registerPlayer(state, "松岚", { at: T0, id: ID });
  assert.equal(Daily.markTemplePrayer(state, "发财", T0).error.code, "INVALID_WISH", "五句之外的心愿不许记");
  assert.equal(Daily.markTemplePrayer(state, "平安", -1).error.code, "INVALID_TIME");
  assert.equal(state.rites?.templeAt, undefined, "失败不落标记");
  assert.equal(Daily.validateState(state), true);
});

test("temple and pagoda marks keep each other, forged rites fail validation", () => {
  const state = Daily.newPlayerState();
  Daily.registerPlayer(state, "松岚", { at: T0, id: ID });
  Daily.markPagodaPrayer(state, T0 + 111);
  Daily.markTemplePrayer(state, "家人", T0 + 222);
  assert.equal(state.rites.pagodaAt, T0 + 111, "记寺庙标记不冲掉金塔标记");
  Daily.markPagodaPrayer(state, T0 + 333);
  assert.equal(state.rites.templeWish, "家人", "记金塔标记不冲掉寺庙标记");
  assert.equal(state.rites.templeAt, T0 + 222);
  assert.equal(Daily.validateState(state), true);

  const unpaired = Daily.newPlayerState();
  Daily.registerPlayer(unpaired, "松岚", { at: T0, id: ID });
  unpaired.rites = { templeAt: T0 };
  assert.equal(Daily.validateState(unpaired), false, "有时间无心愿 = 半套标记");
  const badWish = Daily.newPlayerState();
  Daily.registerPlayer(badWish, "松岚", { at: T0, id: ID });
  badWish.rites = { templeAt: T0, templeWish: "升官" };
  assert.equal(Daily.validateState(badWish), false, "五句之外的心愿不得出现在合法存档里");

  const legacy = Daily.defaultState();
  const coins = legacy.coins;
  assert.equal(Daily.markTemplePrayer(legacy, "感谢", T0).ok, true, "老存档也能进寺祈祷");
  assert.equal(legacy.coins, coins);
  assert.equal(Daily.validateState(legacy), true);
});

// —— 世界层：真实芒市场景（VM + r108 适配器，与 wechat-scenes 同法）——

const vendor = new URL("../wechat/vendor/", import.meta.url);
const adapterSource = fs.readFileSync(new URL("threejs-miniprogram.cjs", vendor), "utf8");
const damSource = fs.readFileSync(new URL("dam-world.cjs", vendor), "utf8");
const mangshiSource = fs.readFileSync(new URL("mangshi-scene.cjs", vendor), "utf8");
const economySource = Economy;

function mangshiWorld() {
  const context = vm.createContext({ exports: {}, console, require: () => economySource });
  vm.runInContext(adapterSource, context);
  vm.runInContext("class Canvas {}; this.THREE = exports.createScopedThreejs(new Canvas()); this.module = { exports: {} };", context);
  vm.runInContext(damSource, context);
  vm.runInContext("this.DamWorld = module.exports; this.require = () => DamWorld; this.module = { exports: {} };", context);
  vm.runInContext(mangshiSource, context);
  const world = context.module.exports.createMangshiScene(context.THREE, context.DamWorld);
  world.resize(390, 844);
  return world;
}

function assertPos(world, x, z, msg) {
  const pos = world.getPlayerPos();
  assert.equal(pos.x, x, msg);
  assert.equal(pos.z, z, msg);
}

function frames(world, seconds, startT = 0) {
  const steps = Math.max(1, Math.round(seconds * 10));
  for (let i = 1; i <= steps; i++) world.update(1 / 10, startT + i / 10);
}

test("temple entry: door anchor sits outside the temple collider, entry lands facing the shrine", () => {
  const world = mangshiWorld();
  assert.equal(world.isInTemple(), false);
  assertPos(world, 4, 52, "新世界出生在寺外（殿内退出重进不会卡在室内）");
  const site = world.getTempleSite();
  assert.ok(Math.abs(Math.hypot(site.door.x + 58, site.door.z + 58) - 16.5) < 0.01, "寺门锚点在寺体碰撞圈外缘");
  world.teleportPlayerTo(site.door.x, site.door.z);
  const before = world.getPlayerPos();
  assert.equal(world.enterTemple(), true);
  assert.equal(world.isInTemple(), true);
  assertPos(world, site.entry.x, site.entry.z, "进寺落在殿内南侧入口");
  assert.equal(world.enterTemple(), false, "已在殿内不重复进入");
  assert.equal(world.exitTemple(), true);
  assert.equal(world.isInTemple(), false);
  assertPos(world, before.x, before.z, "出寺回到进寺前的位置");
  assert.equal(world.exitTemple(), false);
});

test("temple interior: walls clamp movement and the shrine collider blocks the altar", () => {
  const world = mangshiWorld();
  const site = world.getTempleSite();
  world.teleportPlayerTo(site.door.x, site.door.z);
  world.enterTemple();
  world.setMoveInput(0, 1); // 镜头初始朝向：+z 输入朝北（佛龛方向）
  frames(world, 2);
  const north = world.getPlayerPos();
  assert.ok(north.z < 0 && north.z >= -4.01, `向北被佛龛供桌挡住（z=${north.z.toFixed(2)}）`);
  assert.equal(world.isInTemple(), true);
  world.setMoveInput(0, -1);
  frames(world, 3);
  const south = world.getPlayerPos();
  assert.ok(south.z <= 10.6 + 1e-6, "向南被殿墙/门洞内腔钳住");
  world.setMoveInput(1, 0);
  frames(world, 3);
  const east = world.getPlayerPos();
  assert.ok(Math.abs(east.x - 600) <= 14.6 + 1e-6 && Math.abs(east.z) <= 10.6 + 1e-6, "殿内移动不出大殿内腔");
  world.setMoveInput(0, 0);
  assert.equal(world.isInTemple(), true);
});

test("temple entry refuses a mounted player; teleporting out always leaves temple mode", () => {
  const world = mangshiWorld();
  const site = world.getTempleSite();
  world.showHorse(site.door.x, site.door.z);
  world.teleportPlayerTo(site.door.x, site.door.z);
  world.setMounted(true);
  assert.equal(world.isMounted(), true);
  assert.equal(world.enterTemple(), false, "骑马不能进寺");
  assert.equal(world.isInTemple(), false);
  world.setMounted(false);
  assert.equal(world.enterTemple(), true);
  world.teleportPlayerTo(4, 52);
  assert.equal(world.isInTemple(), false, "任何传到殿外的落位都自动出寺");
  assertPos(world, 4, 52);
});

test("kneel worship pose lowers the body with a bow cycle, distinct from the seated rest pose", () => {
  const world = mangshiWorld();
  const site = world.getTempleSite();
  world.teleportPlayerTo(site.door.x, site.door.z);
  world.enterTemple();
  const player = world.scene.getObjectByName("player");
  world.setPrayerPose(2);
  frames(world, 1);
  assert.equal(world.getPrayerPose(), 2);
  assert.ok(player.position.y < -0.3, `跪拜时身体明显下沉（y=${player.position.y.toFixed(2)}）`);
  const bowedY = player.position.y;
  world.setPrayerPose(0);
  frames(world, 1.2);
  assert.ok(player.position.y > bowedY + 0.3 && player.position.y > -0.1, "起身后回到站立高度");
  world.setResting(true);
  frames(world, 1);
  assert.ok(Math.abs(player.position.y + 0.42) < 0.05, "静坐是盘坐下沉 -0.42，与跪拜 -0.52 口径不同");
  world.setResting(false);
});

test("seated breathing is visible: chest scale and head height oscillate while resting", () => {
  const world = mangshiWorld();
  const site = world.getTempleSite();
  world.teleportPlayerTo(site.door.x, site.door.z);
  world.enterTemple();
  world.teleportPlayerTo(site.sit.x, site.sit.z);
  const player = world.scene.getObjectByName("player");
  const body = player.children[0], head = player.children[2];
  world.setResting(true);
  world.update(0.5, 0); // restBlend 一步到位
  world.update(0.016, 1.21); // sin(1.3t) ≈ +1：吸气顶点
  const inhale = { scale: body.scale.y, head: head.position.y };
  world.update(0.016, 2.42); // sin(1.3t) ≈ 0 回落
  const exhale = { scale: body.scale.y, head: head.position.y };
  assert.ok(inhale.scale - exhale.scale > 0.03, `胸廓起伏可测（${inhale.scale.toFixed(3)} → ${exhale.scale.toFixed(3)}）`);
  assert.ok(inhale.head - exhale.head > 0.02, "头部随呼吸有可见起伏");
  world.setResting(false);
});

test("wooden fish knock and prayer beads are visual-only poses inside the temple", () => {
  const world = mangshiWorld();
  const site = world.getTempleSite();
  assert.equal(world.knockWoodenFish(), false, "寺外敲不到木鱼");
  world.teleportPlayerTo(site.door.x, site.door.z);
  world.enterTemple();
  assert.equal(world.knockWoodenFish(), true);
  frames(world, 0.6);
  const player = world.scene.getObjectByName("player");
  const beads = player.children.find(child => child.isGroup && child.children.length === 12);
  assert.ok(beads, "手持念珠串挂在玩家身上");
  assert.equal(beads.visible, false);
  world.setBeadsPose(true);
  assert.equal(world.getBeadsPose(), true);
  assert.equal(beads.visible, true);
  world.update(0.5, 1);
  assert.ok(beads.rotation.z < -0.1, `盘佛珠时珠串缓缓滚动（rotation.z=${beads.rotation.z.toFixed(2)}）`);
  world.setBeadsPose(false);
  assert.equal(beads.visible, false);
  world.exitTemple();
  assert.equal(world.knockWoodenFish(), false);
});

// —— 控制器层：桩世界走通五动作，全程零经济 ——

function templeFixture(state) {
  Daily.refreshDaily(state, DAY);
  let time = T0;
  const toasts = [];
  let actionLabel = "", actionFn = null, namePanelConfig = null, panelOpen = false;
  const site = {
    door: { x: -52.34, z: -42.5, r: 7 },
    entry: { x: 600, z: 7.4, yaw: Math.PI },
    exit: { x: 600, z: 10.3, r: 2.6 },
    bow: { x: 600, z: -4.4, r: 2.4, yaw: Math.PI },
    pray: { x: 594.6, z: -4.4, r: 2.0, yaw: Math.PI },
    sit: { x: 605.4, z: -4.4, r: 2.0, yaw: Math.PI },
    fish: { x: 608.4, z: -2.5, r: 2.4, yaw: Math.PI / 2 },
    beads: { x: 593.2, z: -4.4, r: 2.2, yaw: -Math.PI / 2 },
  };
  let pos = { x: site.door.x, z: site.door.z }, returnPos = null;
  let inside = false, mounted = false, resting = false, pose = 0, beads = false, knocks = 0, lastYaw = null;
  const world = {
    setCrystalLit() {}, setPlayerRoads() {},
    isDancing: () => false, isResting: () => resting, setResting(v) { resting = !!v; },
    isMounted: () => mounted, setMounted(v) { mounted = !!v; }, setMoveInput() {},
    nearestInteractable: () => null,
    getPlayerPos: () => ({ ...pos }),
    teleportPlayerTo(x, z) { pos = { x, z }; },
    setPlayerYaw(v) { lastYaw = v; },
    getPrayerSite: () => null,
    checkPlotSpot: () => ({ ok: false, reason: "invalid" }),
    getPlots: () => [], getSites: () => [], getHallPos: () => ({ x: -38, z: -44 }),
    getHorsePos: () => null, showHorse() {}, hideHorse() {}, setHorseBond() {},
    getTempleSite: () => site,
    enterTemple() {
      if (inside || mounted) return false;
      returnPos = { ...pos }; inside = true; pos = { x: site.entry.x, z: site.entry.z };
      return true;
    },
    exitTemple() {
      if (!inside) return false;
      inside = false; pos = { ...returnPos };
      return true;
    },
    isInTemple: () => inside,
    setPrayerPose(v) { pose = v; }, getPrayerPose: () => pose,
    setBeadsPose(v) { beads = !!v; }, getBeadsPose: () => beads,
    knockWoodenFish() { if (!inside) return false; knocks++; return true; },
  };
  const ui = {
    markDirty() {}, toast: m => toasts.push(m),
    setAction(label, fn) { actionLabel = label || ""; actionFn = fn || null; },
    setBasket() {}, setExtraRow() {}, setRoadRow() {}, setTempleRow() {},
    isPanelOpen: () => panelOpen,
    closePanel() { panelOpen = false; }, closeTeleport() {}, openPanel() { panelOpen = true; }, openTeleport() {},
    openNamePanel(config) { namePanelConfig = config; },
  };
  const controller = createHomeController({
    state,
    transact: fn => {
      const draft = structuredClone(state);
      const result = fn(draft);
      if (result?.ok === false) return result;
      for (const key of Object.keys(state)) delete state[key];
      Object.assign(state, draft);
      return { ok: true, result };
    },
    ui, getMangshi: () => world, getDamWorld: () => world, setScene() {},
    now: () => time, today: () => DAY,
  });
  return {
    controller, world, state, toasts, site,
    advance(ms) { time += ms; },
    action: () => ({ label: actionLabel, fn: actionFn }),
    namePanel: () => namePanelConfig,
    setPos(x, z) { pos = { x, z }; },
    pos: () => ({ ...pos }),
    setMounted(v) { mounted = !!v; },
    knocks: () => knocks,
    lastYaw: () => lastYaw,
  };
}

// 先在状态层走完玩家闭环（与 wechat-player-loop 同账），余额落到 569。
function loopedState() {
  const state = Daily.newPlayerState();
  Daily.refreshDaily(state, DAY);
  Daily.registerPlayer(state, "松岚", { at: T0, id: ID });
  Daily.claimHome(state, 0, 0, "ruili");
  Daily.buildHomeHut(state);
  Daily.openHomeField(state);
  Daily.plantCarrots(state, T0SEC);
  Daily.harvestCarrots(state, T0SEC + Economy.HOME.CARROT_GROW_SEC + 1, DAY);
  Daily.sellBasket(state);
  Daily.buyHomeAnimal(state, "chicken", T0SEC + 61);
  Daily.collectHomeProduce(state, T0SEC + 61 + Economy.HOME.PRODUCE_INTERVAL.chicken);
  Daily.sellBasket(state);
  Daily.doSignin(state, DAY);
  Daily.markQuest(state, DAY, "fed");
  Daily.doJingxin(state, DAY);
  Daily.claimQuest(state, DAY);
  Daily.markPagodaPrayer(state, T0 + 9999);
  assert.equal(state.coins, 569, "闭环恒等式基线");
  return state;
}

test("controller walks all five temple actions with the balance pinned at 569", () => {
  const f = templeFixture(loopedState());
  const update = () => f.controller.update(2, f.world);

  // 寺门 → 进寺
  update();
  assert.equal(f.action().label, "进寺");
  assert.equal(f.action().fn(), true);
  assert.equal(f.world.isInTemple(), true);
  assert.deepEqual(f.pos(), { x: 600, z: 7.4 });

  // 拜神：合掌 → 跪拜 → 起身
  f.setPos(600, -4.4);
  update();
  assert.equal(f.action().label, "礼拜 · 跪拜佛前");
  f.action().fn();
  assert.equal(f.world.getPrayerPose(), 1);
  update();
  assert.equal(f.action().label, "合掌 · 把心收回来");
  f.advance(1500);
  update();
  assert.equal(f.world.getPrayerPose(), 2, "合掌后进入跪拜姿态");
  update();
  assert.equal(f.action().label, "跪拜 · 愿平安");
  f.advance(3000);
  update();
  assert.equal(f.world.getPrayerPose(), 0, "礼拜结束回到站立");
  assert.ok(f.toasts.some(m => m.includes("拜过了")));

  // 祈祷：五句小选 → 跪坐默念 5 秒 → 只记轻标记
  f.setPos(594.6, -4.4);
  update();
  assert.ok(f.action().label.startsWith("祈祷"));
  f.action().fn();
  assert.deepEqual(f.namePanel().names, ["平安", "家人", "健康", "学业", "感谢"], "心愿只能五选一，不许自由输入");
  f.namePanel().onConfirm("家人");
  assert.equal(f.world.isResting(), true, "祈祷是跪坐");
  assert.equal(f.world.getPrayerPose(), 1, "跪坐时保持合掌");
  update();
  assert.ok(f.action().label.includes("家人"));
  f.advance(5000);
  update();
  assert.equal(f.state.rites.templeWish, "家人");
  assert.equal(typeof f.state.rites.templeAt, "number");
  assert.equal(f.state.rites.pagodaAt, T0 + 9999, "金塔标记不被寺庙祈祷覆盖");
  assert.equal(f.world.isResting(), false);
  assert.equal(f.state.coins, 569, "祈祷零经济");

  // 祈祷中途起身走开：静默结束，不记新标记
  f.setPos(594.6, -4.4);
  update();
  f.action().fn();
  f.namePanel().onConfirm("平安");
  f.world.setResting(false); // 模拟玩家迈步起身
  f.advance(1000);
  update();
  assert.equal(f.state.rites.templeWish, "家人", "中途走开不写标记");
  update();
  assert.ok(f.action().label.startsWith("祈祷"), "状态已清，可以重新祈祷");

  // 静坐：坐下后通用「起身」接管，随时起身，无状态无奖励
  f.setPos(605.4, -4.4);
  update();
  assert.ok(f.action().label.startsWith("静坐"));
  f.action().fn();
  assert.equal(f.world.isResting(), true);
  assert.equal(f.lastYaw(), Math.PI, "静坐面朝佛龛");
  update();
  assert.equal(f.action().label, "起身");
  f.action().fn();
  assert.equal(f.world.isResting(), false);

  // 敲木鱼：点一次敲一下，走开即止
  f.setPos(608.4, -2.5);
  update();
  assert.equal(f.action().label, "敲木鱼");
  f.action().fn();
  update();
  assert.ok(f.action().label.startsWith("敲一下"));
  f.action().fn();
  f.action().fn();
  assert.equal(f.knocks(), 2, "点两次敲两下，不计数不打分");
  f.setPos(600, 7.4);
  update();
  update();
  assert.ok(!f.action().label.startsWith("敲一下"), "走开后敲击态结束");

  // 盘佛珠：拿起 → 珠串滚动（世界层已验）→ 点停放回
  f.setPos(593.2, -4.4);
  update();
  assert.equal(f.action().label, "盘佛珠");
  f.action().fn();
  assert.equal(f.world.getBeadsPose(), true);
  update();
  assert.ok(f.action().label.startsWith("盘佛珠"));
  f.action().fn();
  assert.equal(f.world.getBeadsPose(), false);
  assert.ok(f.toasts.some(m => m.includes("佛珠放回架上了")));

  // 出寺：回到寺门前原位
  f.setPos(600, 10.3);
  update();
  assert.equal(f.action().label, "出寺");
  f.action().fn();
  assert.equal(f.world.isInTemple(), false);
  assert.deepEqual(f.pos(), { x: f.site.door.x, z: f.site.door.z }, "出寺回到进寺前的位置");

  assert.equal(f.state.coins, 569, "五动作走完，余额恒等式 569 不受影响");
  assert.equal(Daily.validateState(f.state), true);
});

test("controller refuses temple entry while mounted and the hall row enters directly", () => {
  const f = templeFixture(loopedState());
  const update = () => f.controller.update(2, f.world);
  f.setMounted(true);
  update();
  assert.notEqual(f.action().label, "进寺", "骑马时动作区是下马，不是进寺");
  assert.equal(f.controller.handleExternal("go-temple"), true);
  assert.ok(f.toasts.some(m => m.includes("先下马")));
  assert.equal(f.world.isInTemple(), false);
  f.setMounted(false);
  f.setPos(0, 0); // 离寺门很远，大厅行是引导入口
  update();
  assert.equal(f.controller.handleExternal("go-temple"), true);
  assert.equal(f.world.isInTemple(), true, "大厅「去总佛寺里坐坐」直达殿内");
  assert.equal(f.controller.handleExternal("go-temple"), true);
  assert.ok(f.toasts.some(m => m.includes("已经在寺里了")));
  assert.equal(f.state.coins, 569);
});

// —— 界面层：大厅「去总佛寺里坐坐」一行 ——

function fakeCanvas() {
  const calls = [];
  const ctx = {
    font: "12px sans-serif", textAlign: "left", fillStyle: "",
    setTransform() {}, clearRect() { calls.length = 0; },
    beginPath() {}, closePath() {}, moveTo() {},
    fill() {}, stroke() {}, fillRect() {},
    arc(x, y, radius) { calls.push({ type: "arc", x, y, radius }); },
    arcTo(x, y) { calls.push({ type: "point", x, y }); },
    measureText(value) {
      const size = Number(this.font.match(/[\d.]+(?=px)/)?.[0] || 12);
      return { width: Array.from(String(value)).reduce((width, char) => width + size * (/[^\x00-\x7f]/.test(char) ? 1 : 0.55), 0) };
    },
    fillText(value, x, y) { calls.push({ type: "text", value: String(value) }); },
  };
  return { canvas: { width: 0, height: 0, getContext: () => ctx }, calls };
}

test("hall panel shows the temple row only when the controller enables it", () => {
  const drawing = fakeCanvas();
  const external = [];
  const ui = createCanvasUI({
    canvas: drawing.canvas, state: Daily.newPlayerState(), today: () => DAY, now: () => 0,
    save: () => ({ ok: true }), onExternal: id => external.push(id),
  });
  ui.resize(390, 844, 2);
  ui.openPanel();
  assert.ok(!ui.getHitRects().some(rect => rect.id === "go-temple"), "默认不显示寺庙行");
  ui.setTempleRow(true);
  ui.openPanel();
  const rect = ui.getHitRects().find(button => button.id === "go-temple");
  assert.ok(rect, "启用后大厅出现「去总佛寺里坐坐」");
  ui.handleTap(rect.x + rect.w / 2, rect.y + rect.h / 2);
  assert.deepEqual(external, ["go-temple"]);
  ui.setTempleRow(false);
  ui.openPanel();
  assert.ok(!ui.getHitRects().some(button => button.id === "go-temple"), "关闭后寺庙行消失");
});
