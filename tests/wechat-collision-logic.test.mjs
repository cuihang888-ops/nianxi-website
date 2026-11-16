// 逻辑修复轮回归（2026-11-16）：实体碰撞与动物边界 + 房子可进出。
// 用户点名：羊穿房、房子不像房子。断言口径——
// ① 家养动物多 tick 漫游轨迹永不进房子占地、永不进田块、永不出动物区；
// ② 玩家向墙体/架空层移动被挡停；③ 玩家可由门洞进草棚、可拾级进竹楼（地面高度跟随）；
// ④ 样例羊不穿草棚柱/食槽/草料垛、不出牧场围栏；⑤ 牧场围栏挡玩家、园门可进。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Economy = require("../wechat/vendor/preview-economy.cjs");
const Village = require("../wechat/vendor/shared-village.cjs");

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

const HOME_BACK = 1.9;
function plotOf(world, idx) { return world.getPlots().find(p => p.site === 0 && p.idx === idx); }
function houseCenter(plot) {
  return { x: plot.x - Math.sin(plot.face) * HOME_BACK, z: plot.z - Math.cos(plot.face) * HOME_BACK };
}
// 地块/房子局部系（lat=局部 X，along=局部 Z，+along 为户门朝向）互转
function toLocal(plot, origin, x, z) {
  const dx = x - origin.x, dz = z - origin.z, cos = Math.cos(plot.face), sin = Math.sin(plot.face);
  return { lat: dx * cos - dz * sin, along: dx * sin + dz * cos };
}
function toWorld(plot, origin, lat, along) {
  const cos = Math.cos(plot.face), sin = Math.sin(plot.face);
  return { x: origin.x + lat * cos + along * sin, z: origin.z - lat * sin + along * cos };
}
function aimYaw(world, yaw) { // 相机 yaw 初值 0，助手内记账以便重复调用
  const current = world.__testYaw || 0;
  world.handleDrag((current - yaw) / 0.0052, 0);
  world.__testYaw = yaw;
}
function walk(world, ticks, track) {
  world.setMoveInput(0, 1);
  for (let i = 0; i < ticks; i++) { world.update(0.05, i * 0.05); if (track) track(); }
  world.setMoveInput(0, 0);
}

test("home animals roam only inside the animal zone — never the house, never the field", () => {
  const world = ruiliWorld();
  world.markClaimed(0, 0);
  world.buildHut(0, 0);
  world.addAnimal(0, 0, "sheep");
  world.addAnimal(0, 0, "chicken");
  world.addAnimal(0, 0, "rabbit");
  const plot = plotOf(world, 0);
  const layout = world.getHomeLayout();
  const zone = layout.animalZone;
  const house = houseCenter(plot);
  let sheepTravel = 0, lastSheep = null, samples = 0;
  for (let i = 0; i < 3000; i++) {
    world.update(0.05, i * 0.05);
    if (i % 5) continue;
    samples++;
    for (const a of world.getAnimalsDebug()) {
      const local = toLocal(plot, plot, a.x, a.z);
      assert.ok(local.lat >= zone.minLat - 1e-6 && local.lat <= zone.maxLat + 1e-6,
        `${a.kind} 越出动物区横界 lat=${local.lat.toFixed(2)}（tick ${i}）`);
      assert.ok(local.along >= zone.minAlong - 1e-6 && local.along <= zone.maxAlong + 1e-6,
        `${a.kind} 越出动物区纵界 along=${local.along.toFixed(2)}（tick ${i}）`);
      const atHouse = toLocal(plot, house, a.x, a.z);
      assert.ok(!(Math.abs(atHouse.lat) <= 2.95 && atHouse.along >= -2.95 && atHouse.along <= 2.95),
        `${a.kind} 进了房子占地（tick ${i}）`);
      assert.ok(!(Math.abs(local.lat) <= layout.bedsLat[1] && local.along >= layout.bedsAlong[0] && local.along <= layout.bedsAlong[1]),
        `${a.kind} 进了田块（tick ${i}）`);
      if (a.kind === "sheep") {
        if (lastSheep) sheepTravel += Math.hypot(a.x - lastSheep.x, a.z - lastSheep.z);
        lastSheep = { x: a.x, z: a.z };
      }
    }
  }
  assert.ok(samples > 500, "采样充分");
  assert.ok(sheepTravel > 20, `羊确实在漫游（累计位移 ${sheepTravel.toFixed(1)}），断言不是空转`);
});

test("player is stopped by the hut side wall, never inside the wall", () => {
  const world = ruiliWorld();
  world.markClaimed(0, 0);
  world.buildHut(0, 0);
  const plot = plotOf(world, 0);
  const start = toWorld(plot, plot, 3.2, 0); // 墙与栅栏之间的走道、房墙中段旁（房子占 along [-4.85, 1.05]）
  world.debugSetPlayer(start.x, start.z);
  aimYaw(world, -Math.PI / 2); // 朝 -lat 方向（走向房墙）
  walk(world, 240);
  const end = toLocal(plot, plot, world.getPlayerPos().x, world.getPlayerPos().z);
  assert.ok(end.lat > 2.95 && end.lat < 3.5, `玩家被房墙挡停在 lat=${end.lat.toFixed(2)}（墙外表面 2.82+身位 0.35≈3.17）`);
});

test("yard fence blocks the player off-gate and lets them through the gate", () => {
  const world = ruiliWorld();
  world.markClaimed(0, 0);
  world.buildHut(0, 0);
  const plot = plotOf(world, 0);
  // 非门位置（along 0）：从墙与栅栏之间的走道走向栅栏，被内侧栅栏挡停
  const offGate = toWorld(plot, plot, 3.2, 0);
  world.debugSetPlayer(offGate.x, offGate.z);
  aimYaw(world, Math.PI / 2); // 朝 +lat（走向栅栏）
  walk(world, 200);
  const blocked = toLocal(plot, plot, world.getPlayerPos().x, world.getPlayerPos().z);
  assert.ok(blocked.lat > 2.9 && blocked.lat < 3.35, `玩家被栅栏挡停 lat=${blocked.lat.toFixed(2)}（栏线 3.55-0.09-0.35≈3.11）`);
  // 门位置（along 2.4，在 1.6..3.2 缺口内）：穿门而入，被外侧栅栏挡停
  const atGate = toWorld(plot, plot, 3.2, 2.4);
  world.debugSetPlayer(atGate.x, atGate.z);
  walk(world, 240);
  const entered = toLocal(plot, plot, world.getPlayerPos().x, world.getPlayerPos().z);
  assert.ok(entered.lat > 7.2 && entered.lat < 7.85, `玩家穿园门入区、被外侧栅栏挡停 lat=${entered.lat.toFixed(2)}（栏线 7.95-0.09-0.35≈7.51）`);
});

test("player walks through the hut doorway into the room and is stopped by the back wall", () => {
  const world = ruiliWorld();
  world.markClaimed(0, 0);
  world.buildHut(0, 0);
  const plot = plotOf(world, 0);
  const house = houseCenter(plot);
  const start = toWorld(plot, house, 0, 6.0); // 门前（田畦以远）
  world.debugSetPlayer(start.x, start.z);
  aimYaw(world, plot.face); // 朝 -along（向房门）
  let entered = false;
  walk(world, 240, () => {
    const local = toLocal(plot, house, world.getPlayerPos().x, world.getPlayerPos().z);
    if (Math.abs(local.lat) < 2.5 && local.along > -2.5 && local.along < 2.5) entered = true;
  });
  const end = toLocal(plot, house, world.getPlayerPos().x, world.getPlayerPos().z);
  assert.ok(entered, "玩家确实由门洞进了屋内");
  assert.ok(end.along > -2.4 && end.along < -1.9, `玩家被后墙挡停 along=${end.along.toFixed(2)}（后墙内表面 -2.5+身位 0.35≈-2.15）`);
  assert.ok(world.getPlayerFloorY() > 0.4, `屋内脚下是平台高度 ${world.getPlayerFloorY().toFixed(2)}（≈0.52）`);
});

test("bamboo house: ground approach is stopped by the undercroft; steps + doorway lead inside", () => {
  const world = ruiliWorld();
  world.markClaimed(0, 1);
  world.buildHut(0, 1);
  world.upgradeBamboo(0, 1);
  const plot = plotOf(world, 1);
  const house = houseCenter(plot);
  // 侧面地面接近：从墙外走道走向竹楼（along 0 为楼体中段），架空层是围合实体，地面高度进不去
  const side = toWorld(plot, plot, 3.2, 0);
  world.debugSetPlayer(side.x, side.z);
  aimYaw(world, -Math.PI / 2);
  walk(world, 240);
  const sideEnd = toLocal(plot, plot, world.getPlayerPos().x, world.getPlayerPos().z);
  assert.ok(sideEnd.lat > 2.7 && sideEnd.lat < 3.15, `地面接近被架空层挡停 lat=${sideEnd.lat.toFixed(2)}（裙边 2.55+身位 0.35≈2.9）`);
  assert.ok(world.getPlayerFloorY() < 0.1, "地面接近时脚下仍是地面（没有凭空登楼）");
  // 正门：拾级而上、由门洞进屋、被后墙挡停
  const front = toWorld(plot, house, 0, 7.0);
  world.debugSetPlayer(front.x, front.z);
  aimYaw(world, plot.face);
  let maxFloor = 0, entered = false;
  walk(world, 300, () => {
    maxFloor = Math.max(maxFloor, world.getPlayerFloorY());
    const local = toLocal(plot, house, world.getPlayerPos().x, world.getPlayerPos().z);
    if (Math.abs(local.lat) < 2.4 && local.along > -2.4 && local.along < 2.4) entered = true;
  });
  const end = toLocal(plot, house, world.getPlayerPos().x, world.getPlayerPos().z);
  assert.ok(maxFloor > 2.0, `玩家确实登上了台阶（最高脚下高度 ${maxFloor.toFixed(2)}）`);
  assert.ok(entered, "玩家由门洞进了竹楼室内");
  assert.ok(end.along > -2.3 && end.along < -1.7, `玩家被竹楼后墙挡停 along=${end.along.toFixed(2)}（后墙内表面 -2.36+身位 0.35≈-2.01）`);
  assert.ok(world.getPlayerFloorY() > 2.0, `室内脚下是楼板高度 ${world.getPlayerFloorY().toFixed(2)}（≈2.3）`);
});

test("sample sheep stays inside the pasture fence and never overlaps shelter posts, trough or haystack", () => {
  const world = ruiliWorld();
  const sheep = world.getDecorationApi().sampleSheep;
  const obstacles = [
    { x: -18.1, z: 82.7, r: 0.3 }, { x: -14.9, z: 82.7, r: 0.3 }, { x: -18.1, z: 85.3, r: 0.3 }, { x: -14.9, z: 85.3, r: 0.3 },
    { x: -16, z: 95, r: 1.15 }, { x: -5, z: 84, r: 0.95 },
  ];
  let travel = 0, last = null;
  for (let i = 0; i < 2400; i++) {
    world.update(0.05, i * 0.05);
    if (i % 10) continue;
    const s = sheep.getState();
    assert.ok(s.x >= -17.5 - 1e-6 && s.x <= -2.5 + 1e-6 && s.z >= 82.5 - 1e-6 && s.z <= 97.5 + 1e-6,
      `样例羊出牧场钳制区 (${s.x.toFixed(1)}, ${s.z.toFixed(1)})`);
    for (const o of obstacles) {
      assert.ok(Math.hypot(s.x - o.x, s.z - o.z) >= o.r + 0.85 - 0.02,
        `样例羊与实体重叠 (${s.x.toFixed(1)}, ${s.z.toFixed(1)}) vs (${o.x}, ${o.z})`);
    }
    if (last) travel += Math.hypot(s.x - last.x, s.z - last.z);
    last = { x: s.x, z: s.z };
  }
  assert.ok(travel > 8, `样例羊确实在活动（累计位移 ${travel.toFixed(1)}）`);
});

test("pasture fence blocks the player on the rails and lets them in through the gate", () => {
  const world = ruiliWorld();
  world.debugSetPlayer(-24, 84); // 西侧栅栏段（z=84 在整段围栏上）
  aimYaw(world, -Math.PI / 2); // 朝 +X（向栅栏）
  walk(world, 200);
  const blocked = world.getPlayerPos();
  assert.ok(blocked.x > -23 && blocked.x < -19.2, `玩家被牧场围栏挡停 x=${blocked.x.toFixed(2)}（栏线 -19-0.14-0.35≈-19.49）`);
  world.debugSetPlayer(-24, 90); // 园门缺口（z 87..93）
  walk(world, 200);
  const entered = world.getPlayerPos();
  assert.ok(entered.x > -17, `玩家由园门进入牧场 x=${entered.x.toFixed(2)}`);
});
