import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import * as ModernThree from "three";
import Roads from "../wechat/vendor/preview-roads.cjs";
import Economy from "../wechat/vendor/preview-economy.cjs";
import Village from "../wechat/vendor/shared-village.cjs";
import DamWorld from "../wechat/vendor/dam-world.cjs";
import Ruili from "../wechat/vendor/ruili-scene.cjs";

const p = (x, z) => ({ x, z });
const road = (ax, az, bx, bz) => ({ a: p(ax, az), b: p(bx, bz) });
const publicRoad = (points, width = 4) => ({ points, width });
const environment = () => ({ bounds: { rx: 200, rz: 200 }, waters: [], solids: [], plots: [], protected: [], areas: [] });
const base = [publicRoad([p(-60, 0), p(60, 0)])];
const network = () => Roads.connectedNetwork(base, [], [p(-60, 0)]);
const clone = value => JSON.parse(JSON.stringify(value));

function worldFixture(legacy = false) {
  if (!legacy) return Ruili.createRuiliScene(ModernThree, DamWorld);
  const vendor = new URL("../wechat/vendor/", import.meta.url);
  const context = vm.createContext({ exports: {}, console, require(name) {
    if (name.includes("preview-roads")) return Roads;
    if (name.includes("shared-village")) return Village;
    return Economy;
  } });
  vm.runInContext(fs.readFileSync(new URL("threejs-miniprogram.cjs", vendor), "utf8"), context);
  vm.runInContext("class Canvas {}; this.THREE = exports.createScopedThreejs(new Canvas()); this.module = { exports: {} };", context);
  vm.runInContext(fs.readFileSync(new URL("dam-world.cjs", vendor), "utf8"), context);
  vm.runInContext("this.DamWorld = module.exports; this.module = { exports: {} };", context);
  vm.runInContext(fs.readFileSync(new URL("ruili-scene.cjs", vendor), "utf8"), context);
  return context.module.exports.createRuiliScene(context.THREE, context.DamWorld);
}

test("road save validation is strict, bounded and shares the displayed cost calculation", () => {
  assert.equal(Roads.WIDTH, 4);
  assert.equal(Roads.roadLength(road(0, 0, 3, 4)), 5);
  assert.equal(Roads.roadCost(road(0, 0, 3, 4)), 10);
  assert.equal(Roads.roadCost(road(0, 0, 3.1, 4)), 12);
  assert.equal(Roads.validateRoads([]), true);
  assert.equal(Roads.validateRoads([road(0, 0, 2, 0), road(0, 0, 80, 0)]), true);
  assert.equal(Roads.validateRoads(Array.from({ length: 128 }, () => road(0, 0, 2, 0))), true);
  for (const roads of [null, {}, [road(0, 0, 1.999, 0)], [road(0, 0, 80.001, 0)],
    [road(0, 0, Infinity, 3)], [{ ...road(0, 0, 3, 0), price: 0 }],
    [{ a: { ...p(0, 0), y: 0 }, b: p(3, 0) }], Array.from({ length: 129 }, () => road(0, 0, 2, 0))]) {
    assert.equal(Roads.validateRoads(roads), false);
  }
  const sparse = Array(1); sparse.extra = road(0, 0, 3, 0);
  assert.equal(Roads.validateRoads(sparse), false);
  let reads = 0;
  const accessor = { b: p(3, 0) };
  Object.defineProperty(accessor, "a", { enumerable: true, get() { reads++; return p(0, 0); } });
  assert.equal(Roads.validateRoads([accessor]), false);
  assert.equal(reads, 0);
});

test("network reaches intersecting and overlapping segments but excludes isolated lanes", () => {
  const roads = [...base,
    publicRoad([p(0, -10), p(0, 10)]), publicRoad([p(0, 10), p(20, 10)]),
    publicRoad([p(20, 10), p(35, 10)]), publicRoad([p(-10, 40), p(10, 40)])];
  const connected = Roads.connectedNetwork(roads, [], [p(-60, 0)]);
  assert.equal(connected.length, 4);
  assert.equal(connected.some(segment => segment.a.z === 40), false);
  const bridge = road(0, 10, 0, 40);
  assert.equal(Roads.connectedNetwork(roads, [bridge], [p(-60, 0)]).length, 6);
  assert.equal(Roads.connectedNetwork(roads, [], []).length, 0, "no implied root for an isolated lane");
});

test("quoting snaps the start, checks limits and never changes a saved route", () => {
  const old = [], env = environment();
  const quote = Roads.quoteRoad(p(10, 7), p(10, 30), network(), old, env);
  assert.deepEqual(quote, { ok: true, road: road(10, 0, 10, 30), length: 30 });
  assert.deepEqual(old, []);
  assert.equal(Roads.quoteRoad(p(10, 8.01), p(10, 30), network(), [], env).reason, "road-disconnected");
  assert.equal(Roads.quoteRoad(p(0, 0), p(0, 1), network(), [], env).reason, "road-too-short");
  assert.equal(Roads.quoteRoad(p(0, 0), p(0, 81), network(), [], env).reason, "road-too-long");
  assert.equal(Roads.quoteRoad(p(0, 0), p(30, 0), network(), [], env).reason, "road-duplicate");
  assert.equal(Roads.quoteRoad(p(NaN, 0), p(0, 30), network(), [], env).reason, "invalid");
  assert.equal(Roads.quoteRoad(p(0, 0), p(0, 30), network(), Array(128), env).reason, "road-limit");
});

test("the complete road corridor rejects water, solids, reserved plots and sacred areas", () => {
  const route = road(0, 0, 0, 40);
  for (const [field, value, reason] of [
    ["waters", [{ x: 0, z: 20, r: 4 }], "water"],
    ["waters", [{ x: 5.4, z: 20, r: 3 }], "water"],
    ["solids", [{ x: 0, z: 20, r: 2 }], "solid"],
    ["areas", [{ x: 0, z: 20, radius: 8 }], "site"],
    ["plots", [[p(-5, 18), p(5, 18), p(5, 22), p(-5, 22)]], "taken"],
    ["protected", [[p(-5, 18), p(5, 18), p(5, 22), p(-5, 22)]], "site"],
  ]) {
    const env = { ...environment(), [field]: value };
    assert.equal(Roads.checkCorridor(route, env).reason, reason, field);
  }
  assert.equal(Roads.checkCorridor(route, environment()).ok, true);
  assert.equal(Roads.checkCorridor(road(195, 0, 199, 0), environment()).reason, "bounds");
  assert.equal(Roads.checkCorridor(road(194, 0, 197, 0), environment()).ok, true);
});

test("home access measures the footprint against connected road edges", () => {
  const footprint = [p(-3, 21), p(3, 21), p(3, 27), p(-3, 27)];
  assert.deepEqual(Roads.homeRoadAccess(footprint, network()), { ok: true, distance: 19 });
  const far = footprint.map(value => ({ x: value.x, z: value.z + 2 }));
  assert.equal(Roads.homeRoadAccess(far, network()).reason, "road-access");
  assert.equal(Roads.homeRoadAccess(footprint, []).reason, "road-access");
});

test("Ruili road interfaces render and restore in modern and WeChat r108 engines", () => {
  for (const legacy of [false, true]) {
    const world = worldFixture(legacy);
    const initialNetwork = clone(world.getRoadNetwork());
    const externalNetwork = world.getRoadNetwork();
    externalNetwork[0].a.x = 999;
    assert.deepEqual(clone(world.getRoadNetwork()), initialNetwork, "external consumers cannot move the cached road network");
    assert.ok(initialNetwork.length > 0);
    assert.equal(initialNetwork.some(segment => segment.a.z === 84.5), false, "isolated village lanes cannot seed roads");
    const quoted = world.quotePlayerRoad(p(-150, 35), p(-150, 5));
    assert.equal(quoted.ok, true);
    assert.equal(quoted.length, 30);
    const before = clone(world.getMapFeatures());
    assert.equal(world.setRoadPreview(quoted.road.a, quoted.road.b, true), true);
    const preview = world.scene.getObjectByName("roads:preview"), previewGeometry = preview.geometry, previewMaterial = preview.material;
    assert.equal(preview.material.color.getHex(), 0x4ba56d);
    for (let i = 0; i < 20; i++) world.setRoadPreview(quoted.road.a, p(-150 + i, 5), false);
    assert.equal(preview.material.color.getHex(), 0xcc5050);
    assert.equal(preview.geometry, previewGeometry);
    assert.equal(preview.material, previewMaterial);
    assert.deepEqual(clone(world.getRoadNetwork()), initialNetwork, "ghost road is excluded from connectivity");
    assert.deepEqual(clone(world.getMapFeatures()), before, "ghost road is absent from the minimap");
    world.clearRoadPreview(); assert.equal(preview.visible, false);
    assert.equal(world.setRoadPreview(null), false); assert.equal(preview.visible, false);
    assert.equal(world.restorePlayerRoads([quoted.road]).ok, true);
    const group = world.scene.getObjectByName("roads:player");
    assert.equal(group.children.length, 3);
    assert.equal(group.children[0].geometry.parameters.width, 4);
    assert.equal(world.getMapFeatures().roads.length, before.roads.length + 1);
    assert.equal(world.getRoadNetwork().filter(segment => segment.source === "player").length, 1);
    assert.equal(world.checkPlotSpot(-150, 5).ok, false, "new homes cannot cover a player road");
    assert.equal(world.checkHomeRoadAccess(-136, 5).ok, true);
    assert.equal(world.checkPlotSpot(-136, 5).ok, true, "the reachable roadside home remains buildable");
    assert.equal(world.restorePlayerRoads([quoted.road]).changed, false);
    assert.equal(world.scene.getObjectByName("roads:player"), group, "unchanged saves reuse meshes");
    assert.equal(world.quotePlayerRoad(p(-150, 5), p(-150, -15)).ok, true, "extension attaches to the saved segment");
    assert.equal(world.restorePlayerRoads([road(0, 0, 999, 999)]).ok, false);
    assert.equal(world.scene.getObjectByName("roads:player"), group);
    assert.equal(world.restoreCustomPlot(-150, 5)?.claimed, true, "legacy homes remain restorable even over a new road");
    let disposed = 0;
    group.children.forEach(mesh => mesh.geometry.addEventListener("dispose", () => disposed++));
    assert.equal(world.restorePlayerRoads([]).ok, true);
    assert.equal(disposed, 3);
    assert.deepEqual(clone(world.getRoadNetwork()), initialNetwork);
    assert.equal(world.getMapFeatures().roads.length, before.roads.length);
  }
});
