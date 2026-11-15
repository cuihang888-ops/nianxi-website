import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Economy = require("../wechat/vendor/preview-economy.cjs");
const Village = require("../wechat/vendor/shared-village.cjs");
const Daily = require("../wechat/vendor/daily-state.cjs");
import { createLocalSaveRepository } from "../wechat/platform/save-repository.js";

// —— 开放式安家 + 玩家自费修路（用户 2026-11-15 拍板；规则口径 21:29 修订：少规则）——
// 设计原则：只拦物理上不可能与侵犯他人之地的事，其余全开放。本文件锁定的正是这条
// 「少规则」口径：修路只剩三条硬性（不压已划地块、不压地标建筑本体、余额够），
// 通路判定只剩一条距离（ACCESS_RANGE = 30），费用只剩一个数（2 安币/单位，round 取整）。

const AT = Date.parse("2026-11-15T04:00:00Z");
const clone = value => JSON.parse(JSON.stringify(value));

function saveFixture() {
  const entries = new Map();
  const storage = {
    getItem: key => entries.get(key) ?? null,
    setItem(key, value) { entries.set(key, value); },
  };
  const repository = createLocalSaveRepository(storage, {
    namespace: "roads-test", validate: Daily.validateState, now: () => AT,
  });
  return { entries, repository };
}

const vendor = new URL("../wechat/vendor/", import.meta.url);
const adapterSource = fs.readFileSync(new URL("threejs-miniprogram.cjs", vendor), "utf8");
const damSource = fs.readFileSync(new URL("dam-world.cjs", vendor), "utf8");
const ruiliSource = fs.readFileSync(new URL("ruili-scene.cjs", vendor), "utf8");

function ruiliWorld() {
  // 与 wechat-m1-village 夹具同一装载方式（require 按名解析 shared-village 契约）。
  const context = vm.createContext({ exports: {}, console, require: () => Economy });
  vm.runInContext(adapterSource, context);
  vm.runInContext("class Canvas {}; this.THREE = exports.createScopedThreejs(new Canvas()); this.module = { exports: {} };", context);
  vm.runInContext(damSource, context);
  vm.runInContext("this.DamWorld = module.exports; this.module = { exports: {} };", context);
  context.require = name => name.includes("shared-village") ? Village : context.DamWorld;
  vm.runInContext(ruiliSource, context);
  const world = context.module.exports.createRuiliScene(context.THREE, context.DamWorld);
  world.resize(390, 844);
  return { world, DamWorld: context.DamWorld };
}

function findGroup(object, name) {
  if (object.name === name) return object;
  for (const child of object.children || []) {
    const found = findGroup(child, name);
    if (found) return found;
  }
  return null;
}

// —— 报价与常量：费用只留一个数 ——

test("road pricing is a single per-unit rate with round() quoting and no minimums", () => {
  assert.equal(Economy.ROADS.ACCESS_RANGE, 30);
  assert.equal(Economy.ROADS.COST_PER_UNIT, 2);
  // 少规则口径锁定：最短段、最低收费、起点接路这三条已按用户口径删除，不许悄悄加回。
  assert.equal(Economy.ROADS.MIN_LENGTH, undefined);
  assert.equal(Economy.ROADS.MIN_COST, undefined);
  assert.equal(Economy.ROADS.CONNECT_RANGE, undefined);
  assert.equal(Economy.roadCostForLength(40), 80);
  assert.equal(Economy.roadCostForLength(100), 200);
  assert.equal(Economy.roadCostForLength(15), 30);
  assert.equal(Economy.roadCostForLength(9.9), 20, "round(9.9 × 2) = 20，没有最低收费托底");
  assert.equal(Economy.roadCostForLength(3), 6, "短短一段也修得起，没有最短段");
  assert.equal(Economy.roadCostForLength(12.3), 25, "round(24.6) = 25，四舍五入唯一口径");
  assert.equal(Economy.roadCostForLength(0.5), null, "两点几乎重合不是一条路");
  assert.equal(Economy.roadCostForLength(0), null);
  assert.equal(Economy.roadCostForLength(NaN), null);
  assert.equal(Economy.roadCostForLength("40"), null);
});

// —— 状态层：记账、记名、三条硬性里的余额 ——

test("buildRoad charges by length, records the builder name and keeps the state valid", () => {
  const state = Daily.defaultState();
  const result = Daily.buildRoad(state, "ruili", { x: 150, z: 120 }, { x: 150, z: 160 }, { at: AT, by: "望舒" });
  assert.equal(result.ok, true);
  assert.equal(result.cost, 80);
  assert.equal(state.coins, 1200 - 80);
  assert.deepEqual(state.roads, { ruili: [{ a: { x: 150, z: 120 }, b: { x: 150, z: 160 }, by: "望舒", at: AT }] });
  assert.equal(Daily.validateState(state), true);
});

test("buildRoad allows a short hop and rejects only degenerate or unaffordable segments", () => {
  const state = Daily.defaultState();
  const hop = Daily.buildRoad(state, "ruili", { x: 10, z: 10 }, { x: 13, z: 10 }, { at: AT, by: "望舒" });
  assert.equal(hop.ok, true, "3 单位的小段照样修（无最短段）");
  assert.equal(hop.cost, 6);
  const degenerate = Daily.buildRoad(state, "ruili", { x: 20, z: 20 }, { x: 20.4, z: 20 }, { at: AT, by: "望舒" });
  assert.equal(degenerate.ok, false);
  assert.equal(degenerate.error.code, "INVALID_ROAD");
  const badDam = Daily.buildRoad(state, "nowhere", { x: 0, z: 0 }, { x: 5, z: 0 }, { at: AT, by: "望舒" });
  assert.equal(badDam.error.code, "INVALID_DAM");

  const poor = Daily.defaultState();
  poor.coins = 50;
  const denied = Daily.buildRoad(poor, "ruili", { x: 150, z: 120 }, { x: 150, z: 160 }, { at: AT, by: "望舒" });
  assert.equal(denied.ok, false);
  assert.equal(denied.error.code, "INSUFFICIENT_COINS", "余额够是三条硬性之一");
  assert.equal(poor.coins, 50, "拒绝不扣费");
  assert.deepEqual(poor.roads, {}, "拒绝不落路");
});

test("roads persist across a save round-trip and legacy saves without roads still load", () => {
  const f = saveFixture();
  const session = Daily.createStateSession(f.repository);
  const built = session.transact(state => Daily.buildRoad(state, "ruili", { x: 150, z: 120 }, { x: 150, z: 160 }, { at: AT, by: "望舒" }));
  assert.equal(built.ok, true);
  const reopened = Daily.createStateSession(f.repository);
  assert.deepEqual(reopened.state.roads.ruili, [{ a: { x: 150, z: 120 }, b: { x: 150, z: 160 }, by: "望舒", at: AT }]);
  assert.equal(Daily.validateState(reopened.state), true);

  const legacy = Daily.defaultState();
  delete legacy.roads;
  assert.equal(Daily.validateState(legacy), true, "无 roads 字段的老存档照常校验通过");
  const normalizedResult = Daily.normalizeLegacyState(clone(legacy));
  assert.equal(normalizedResult.ok, true);
  const normalized = normalizedResult.state;
  assert.deepEqual(normalized.roads, {}, "加载时补空对象，不追溯、不收费");
  const after = Daily.buildRoad(normalized, "ruili", { x: 10, z: 10 }, { x: 13, z: 10 }, { at: AT, by: "老住户" });
  assert.equal(after.ok, true, "老存档补齐后照样能修路");
});

// —— 世界层：通路判定只剩一条距离 ——

test("custom plots need road access within 30 units of the network edge — and nothing else", () => {
  const { world } = ruiliWorld();
  // 世界对象来自 VM 上下文，逐字段断言（跨 realm 不能 deepStrictEqual）。
  assert.equal(world.checkPlotSpot(-20, 30).ok, true, "古道边（边缘距离约 8）可安家");
  assert.equal(world.checkPlotSpot(70, 16).ok, true, "正贴着古道也可安家（已无压路拒绝）");
  const far = world.checkPlotSpot(150, 120);
  assert.equal(far.ok, false);
  assert.equal(far.reason, "road", "远离路网只被「还没通路」一条拒绝");
});

test("an isolated player road counts as network the moment it exists and opens its surroundings", () => {
  const { world } = ruiliWorld();
  assert.equal(world.checkPlotSpot(168, 120).reason, "road");
  // 这段路不与任何既有路相连——孤立路段按新口径照样成立、照样算路网。
  assert.equal(world.validateRoadSegment({ x: 150, z: 120 }, { x: 150, z: 160 }).ok, true);
  world.setPlayerRoads([{ a: { x: 150, z: 120 }, b: { x: 150, z: 160 } }]);
  assert.deepEqual(clone(world.getPlayerRoads()), [{ a: { x: 150, z: 120 }, b: { x: 150, z: 160 } }]);
  assert.equal(world.checkPlotSpot(168, 120).ok, true, "路一建成，周边随即开放安家");
  const group = findGroup(world.scene, "roads:player");
  assert.ok(group && group.children.length > 0, "自建路被渲染进场景（roads:player）");
});

// —— 世界层：修路校验只剩地块与地标两条几何硬性 ——

test("roads may cross water and ignore hills, but never plots or landmark buildings", () => {
  const { world, DamWorld } = ruiliWorld();
  assert.equal(world.validateRoadSegment({ x: 0, z: 150 }, { x: 0, z: 195 }).ok, true,
    "横穿瑞丽江照样修（过水段渲染成木栈道，同价）");
  assert.equal(world.validateRoadSegment({ x: 40, z: 20 }, { x: 0, z: 20 }).ok, true,
    "横穿南宛河照样修");
  assert.equal(DamWorld.validateRoadSegment({ x: -300, z: -300 }, { x: -260, z: -300 }, { plots: [] }).ok, true,
    "纯函数层也没有接路网要求：孤立路段合法");

  const throughA = world.validateRoadSegment({ x: -110, z: 64 }, { x: -58, z: 64 });
  assert.equal(throughA.ok, false);
  assert.equal(throughA.reason, "taken", "不压已划地块（样板 A）");
  const throughC = world.validateRoadSegment({ x: -140, z: 101 }, { x: -96, z: 101 });
  assert.equal(throughC.reason, "taken", "不压契约基址地块（预留 C）");
  assert.equal(world.validateRoadSegment({ x: -120, z: 64 }, { x: -102, z: 64 }).ok, true,
    "离 A 地边缘 3 单位外通过没问题");

  const pagoda = world.validateRoadSegment({ x: 140, z: -118 }, { x: 164, z: -118 });
  assert.equal(pagoda.ok, false);
  assert.equal(pagoda.reason, "landmark", "不压地标建筑本体（姐勒金塔）");
  assert.equal(world.validateRoadSegment({ x: -40, z: -8 }, { x: -14, z: -8 }).reason, "landmark", "不压大厅");
  assert.equal(world.validateRoadSegment({ x: 0, z: 10 }, { x: 13, z: 11 }).reason, "landmark", "不压水晶/集市");
  assert.equal(world.validateRoadSegment({ x: 10, z: 10 }, { x: 10.4, z: 10 }).reason, "invalid", "两点几乎重合不是路");
});

// —— 固定基址不受通路判定影响 ——

test("fixed village plots ignore the road rule entirely (starter villages are pre-connected)", () => {
  const state = Daily.newPlayerState();
  assert.equal(Daily.registerPlayer(state, "松岚", { at: AT, id: "local-mtest1-abcd" }).ok, true);
  assert.equal(state.coins, 1000);
  const claim = Daily.claimHome(state, 0, 0, "ruili");
  assert.equal(claim.ok, true, "固定地块 A 走 claimHome，不经 checkPlotSpot");
  assert.equal(state.coins, 600, "仍是 1000 − 400，开局经济与闭环恒等式不受修路模型影响");
  assert.equal(Daily.validateState(state), true);
});
