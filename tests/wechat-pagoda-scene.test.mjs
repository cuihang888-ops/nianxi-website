import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { createHomeController } from "../wechat/home-controller.js";

const require = createRequire(import.meta.url);
const Economy = require("../wechat/vendor/preview-economy.cjs");
const Village = require("../wechat/vendor/shared-village.cjs");
const Daily = require("../wechat/vendor/daily-state.cjs");
const vendor = new URL("../wechat/vendor/", import.meta.url);

function createWorld() {
  const context = vm.createContext({ exports: {}, console, require: () => Economy });
  vm.runInContext(fs.readFileSync(new URL("threejs-miniprogram.cjs", vendor), "utf8"), context);
  vm.runInContext("class Canvas {}; this.THREE = exports.createScopedThreejs(new Canvas()); this.module = { exports: {} };", context);
  vm.runInContext(fs.readFileSync(new URL("dam-world.cjs", vendor), "utf8"), context);
  vm.runInContext("this.DamWorld = module.exports; this.module = { exports: {} };", context);
  context.require = name => name.includes("shared-village") ? Village : context.DamWorld;
  vm.runInContext(fs.readFileSync(new URL("ruili-scene.cjs", vendor), "utf8"), context);
  return context.module.exports.createRuiliScene(context.THREE, context.DamWorld);
}

test("the whole prayer court and shrine stand outside the visible pagoda hillside", () => {
  const world = createWorld();
  const hill = world.scene.getObjectByName("pagoda:hill");
  const tower = world.scene.getObjectByName("pagoda:tower");
  const court = world.scene.getObjectByName("pagoda:court");
  const shrine = world.scene.getObjectByName("pagoda:shrine");
  const site = world.getPrayerSite();
  const radius = hill.geometry.parameters.radius;
  assert.equal(radius, Village.PAGODA.hillRadius);
  assert.equal(tower.position.y, 13, "gold tower keeps its original hilltop elevation");
  assert.ok(Math.hypot(court.position.x - hill.position.x, court.position.z - hill.position.z)
    - court.geometry.parameters.radius > radius, "the entire stone pad clears the hill footprint");
  assert.ok(Math.hypot(shrine.position.x - hill.position.x, shrine.position.z - hill.position.z) - 3 > radius,
    "shrine walls, roof and lamps clear the hill footprint");
  assert.ok(Math.hypot(site.spot.x - hill.position.x, site.spot.z - hill.position.z) - 2.6 > radius,
    "both prayer cushions clear the hill footprint");
  const collider = world.getSpec().colliders.find(c => c.x === hill.position.x && c.z === hill.position.z);
  assert.equal(collider.r, radius, "walking cannot reenter the visible hill");
  const mapEntry = world.getMapFeatures().pagoda.entry;
  assert.equal(mapEntry.x, site.entry.x);
  assert.equal(mapEntry.z, site.entry.z);
});

test("the entire circumambulation ring clears mountains, water, trees and the world boundary", () => {
  const world = createWorld();
  const ring = world.getPrayerSite().ring;
  const spec = world.getSpec();
  const hills = [];
  world.scene.traverse(object => {
    const p = object.geometry?.parameters;
    if (object.geometry?.type === "ConeGeometry" && p.radius >= 30) hills.push(object);
  });
  assert.ok(hills.length >= 9);
  for (let i = 0; i < 720; i++) {
    const angle = i / 720 * Math.PI * 2;
    const point = { x: ring.x + Math.cos(angle) * ring.r, z: ring.z + Math.sin(angle) * ring.r };
    assert.ok(Math.hypot(point.x / spec.bounds.rx, point.z / spec.bounds.rz) < 1,
      `ring sample ${i} remains inside the world`);
    for (const hill of hills) {
      assert.ok(Math.hypot(point.x - hill.position.x, point.z - hill.position.z) > hill.geometry.parameters.radius,
        `ring sample ${i} clears the full footprint of hill ${hill.position.x},${hill.position.z}`);
    }
    const resolved = world.resolveLandPosition(point.x, point.z);
    assert.ok(Math.hypot(resolved.x - point.x, resolved.z - point.z) < 1e-8,
      `ring sample ${i} has no water/tree/building collision`);
  }
});

test("the prayer ring can be walked continuously without teleporting around colliders", () => {
  const world = createWorld();
  const ring = world.getPrayerSite().ring;
  let angle = Math.atan2(world.getPrayerSite().spot.z - ring.z, world.getPrayerSite().spot.x - ring.x);
  world.debugSetPlayer(ring.x + Math.cos(angle) * ring.r, ring.z + Math.sin(angle) * ring.r);
  let travelled = 0;
  for (let step = 1; step <= 360; step++) {
    const targetAngle = angle + step / 360 * Math.PI * 2;
    const target = { x: ring.x + Math.cos(targetAngle) * ring.r, z: ring.z + Math.sin(targetAngle) * ring.r };
    for (let tick = 0; tick < 5; tick++) {
      const before = world.getPlayerPos();
      const dx = target.x - before.x, dz = target.z - before.z, distance = Math.hypot(dx, dz);
      if (distance < 0.02) break;
      world.setMoveInput(dx / distance, -dz / distance);
      world.update(Math.min(1 / 30, distance / 13), (step * 5 + tick) / 30);
      const after = world.getPlayerPos();
      travelled += Math.hypot(after.x - before.x, after.z - before.z);
    }
    const actual = world.getPlayerPos();
    assert.ok(Math.hypot(actual.x - target.x, actual.z - target.z) < 0.03,
      `continuous walking reaches ring waypoint ${step}`);
  }
  world.setMoveInput(0, 0);
  assert.ok(travelled > Math.PI * 2 * ring.r * 0.99);
});

function prayerFixture() {
  const world = createWorld();
  const state = Daily.defaultState();
  let time = Date.parse("2026-11-15T04:00:00Z");
  let action = { label: "", fn: null };
  const toasts = [];
  const ui = {
    markDirty() {}, toast: message => toasts.push(message),
    setAction(label, fn) { action = { label, fn }; },
    setBasket() {}, setExtraRow() {}, isPanelOpen: () => false, closePanel() {}, closeTeleport() {},
  };
  const controller = createHomeController({
    state, transact: fn => ({ ok: true, result: fn(state) }), ui, getDamWorld: () => world,
    setScene() {}, now: () => time, today: () => "2026-11-15",
  });
  const site = world.getPrayerSite();
  world.debugSetPlayer(site.entry.x, site.entry.z);
  controller.update(3, world);
  assert.equal(action.label, "入塔祈福");
  assert.equal(action.fn(), true);
  return { controller, world, site, toasts, action: () => action, advance(ms) { time += ms; } };
}

test("prayer holds at the relocated cushions and cancels outside the ring-relative join radius", () => {
  const f = prayerFixture();
  f.controller.update(3, f.world);
  assert.equal(f.action().label, "合掌 · 把心收回来");
  assert.equal(f.world.getPrayerPose(), 1);
  f.world.debugSetPlayer(f.site.ring.x, f.site.ring.z + f.site.ring.r + 14.1);
  f.controller.update(3, f.world);
  assert.equal(f.world.getPrayerPose(), 0);
  assert.ok(f.toasts.includes("祈福先停下了 · 想好了再来"));
});

test("circumambulation cancels outside its ring-relative outer exit radius", () => {
  const f = prayerFixture();
  for (const duration of [1700, 1900, Daily.ECONOMY.meditationMilliseconds + 1]) {
    f.advance(duration);
    f.controller.update(3, f.world);
  }
  assert.equal(f.world.isGuideRingVisible(), true);
  f.world.debugSetPlayer(f.site.ring.x, f.site.ring.z + f.site.ring.r + 24.1);
  f.controller.update(3, f.world);
  assert.equal(f.world.isGuideRingVisible(), false);
  assert.ok(f.toasts.includes("先到这里 · 塔门一直开着"));
});
