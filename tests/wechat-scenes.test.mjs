import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import Economy from "../wechat/vendor/preview-economy.cjs";

const vendor = new URL("../wechat/vendor/", import.meta.url);
const adapterSource = fs.readFileSync(new URL("threejs-miniprogram.cjs", vendor), "utf8");
const damSource = fs.readFileSync(new URL("dam-world.cjs", vendor), "utf8");
const sources = Object.fromEntries(["anheli", "pasture", "mangshi", "ruili", "yingjiang", "longchuan", "lianghe"].map(name => [
  name, fs.readFileSync(new URL(`${name}-scene.cjs`, vendor), "utf8"),
]));

function fixture(name, events) {
  // The adapter patches canvas and Object prototypes; contain those patches in a VM.
  const context = vm.createContext({ exports: {}, console, require: () => Economy });
  vm.runInContext(adapterSource, context);
  vm.runInContext("class Canvas {}; this.THREE = exports.createScopedThreejs(new Canvas()); this.module = { exports: {} };", context);
  vm.runInContext(damSource, context);
  vm.runInContext("this.DamWorld = module.exports; this.require = () => DamWorld; this.module = { exports: {} };", context);
  vm.runInContext(sources[name], context);
  const factoryName = "create" + name[0].toUpperCase() + name.slice(1) + "Scene";
  const world = context.module.exports[factoryName](context.THREE, name === "pasture" ? events : context.DamWorld);
  assert.equal(context.THREE.REVISION, "108");
  world.resize(390, 844);
  return world;
}

function tapCrop(world, crop) {
  const point = world.debugTapPoints(390, 844).find(item => item.type === "bed" && item.crop === crop);
  assert.ok(point, `${crop} is mature`);
  assert.equal(world.handleTap(point.x, point.y, 390, 844), true);
}

test("pasture uses r108-compatible crop rebuilding, frees geometry and regrows after 18 seconds", () => {
  const harvests = [];
  const world = fixture("pasture", { onHarvest: crop => harvests.push(crop) });
  const root = world.scene.children.find(child => child.isGroup);
  const field = root.children.find(child => child.isGroup && child.position.x === 7 && child.position.z === 7);
  const carrotBed = field.children[0];
  let disposed = 0, materialDisposed = 0;
  const originals = carrotBed.children.map(child => child.geometry);
  originals.forEach(geometry => geometry.addEventListener("dispose", () => disposed++));
  const materials = new Set(carrotBed.children.map(child => child.material));
  materials.forEach(material => material.addEventListener("dispose", () => materialDisposed++));

  tapCrop(world, "carrot");
  assert.deepEqual(harvests, ["carrot"]);
  assert.equal(disposed, originals.length);
  assert.equal(materialDisposed, 0, "shared crop materials remain usable");
  assert.equal(world.debugTapPoints(390, 844).some(point => point.crop === "carrot"), false);
  world.update(0.016, 10);
  world.update(0.016, 27.99);
  assert.equal(world.debugTapPoints(390, 844).some(point => point.crop === "carrot"), false);
  world.update(0.016, 28);
  assert.equal(world.debugTapPoints(390, 844).some(point => point.crop === "carrot"), true);
  tapCrop(world, "carrot");
  assert.deepEqual(harvests, ["carrot", "carrot"]);
});

test("failed harvest persistence leaves the crop available and does not start its cooldown", () => {
  let allowed = false, attempts = 0;
  const world = fixture("pasture", { onHarvest() { attempts++; return allowed; } });
  tapCrop(world, "carrot");
  assert.equal(attempts, 1);
  assert.equal(world.debugTapPoints(390, 844).some(point => point.crop === "carrot"), true);
  allowed = true;
  tapCrop(world, "carrot");
  assert.equal(attempts, 2);
  assert.equal(world.debugTapPoints(390, 844).some(point => point.crop === "carrot"), false);
});

test("pasture animals can be petted and move independently while crops remain selectable", () => {
  const pets = [], harvests = [];
  const world = fixture("pasture", { onPet: kind => pets.push(kind), onHarvest: crop => harvests.push(crop) });
  const first = world.debugTapPoints(390, 844).filter(point => point.type === "animal");
  const sheep = first.find(point => point.kind === "sheep");
  world.handleTap(sheep.x, sheep.y, 390, 844);
  assert.deepEqual(pets, ["sheep"]);
  tapCrop(world, "grass");
  assert.deepEqual(harvests, ["grass"]);
  for (let frame = 1; frame <= 180; frame++) world.update(1 / 60, frame / 60);
  const moved = world.debugTapPoints(390, 844).filter(point => point.type === "animal");
  assert.ok(first.some((point, i) => Math.hypot(point.x - moved[i].x, point.y - moved[i].y) > 2));
});

test("mangshi movement respects speed, stop, bounds and finite input", () => {
  const world = fixture("mangshi");
  world.teleportPlayerTo(-100, 0);
  const start = world.getPlayerPos();
  world.setMoveInput(1, 1);
  world.update(1, 1);
  const moved = world.getPlayerPos();
  assert.ok(Math.abs(Math.hypot(moved.x - start.x, moved.z - start.z) - 13) < 1e-8);
  world.setMoveInput(0, 0);
  world.update(1, 2);
  assert.deepEqual(world.getPlayerPos(), moved);
  world.setMoveInput(NaN, Infinity);
  world.update(1, 3);
  assert.deepEqual(world.getPlayerPos(), moved);
  world.teleportPlayerTo(264, 0);
  world.setMoveInput(1, 0);
  world.update(1, 4);
  const edge = world.getPlayerPos();
  assert.ok(Math.hypot(edge.x / 265, edge.z / 215) <= 1 + 1e-10);
  world.teleportPlayerTo(-60, 66);
  world.update(1, 5);
  assert.equal(world.getPlayerPos().x, -60, "teleport clears old movement");
});

test("mangshi home visuals restore idempotently and interaction finds a plot or hall", () => {
  const world = fixture("mangshi");
  const plots = world.getPlots();
  assert.equal(plots.length, 16);
  const chosen = plots.find(plot => plot.site === 1 && plot.idx === 3);
  const root = world.scene.children.find(child => child.isGroup);
  const initialChildren = root.children.length;
  world.buildHut(chosen.site, chosen.idx);
  assert.equal(root.children.length, initialChildren, "a hut needs a claimed plot");
  world.markClaimed(chosen.site, chosen.idx);
  world.markClaimed(chosen.site, chosen.idx);
  assert.equal(root.children.length, initialChildren + 1);
  world.buildHut(chosen.site, chosen.idx);
  world.buildHut(chosen.site, chosen.idx);
  assert.equal(root.children.length, initialChildren + 2);
  const owned = world.getPlots().find(plot => plot.site === chosen.site && plot.idx === chosen.idx);
  assert.equal(owned.claimed, true);
  assert.equal(owned.hut, true);
  world.teleportPlayerTo(owned.x, owned.z);
  const target = world.nearestInteractable();
  assert.equal(target.type, "plot");
  assert.equal(target.site, chosen.site);
  assert.equal(target.idx, chosen.idx);
  assert.equal(target.hut, true);
  const hall = world.getHallPos();
  world.teleportPlayerTo(hall.x, hall.z);
  assert.equal(world.nearestInteractable().type, "hall");
  const crystal = world.getCrystalPos();
  world.teleportPlayerTo(crystal.x, crystal.z);
  assert.equal(world.nearestInteractable().type, "crystal");
  assert.equal(world.nearestInteractable().destination, "ruili");
});

test("mangshi field growth and house upgrades release replaced geometries exactly once", () => {
  const world = fixture("mangshi");
  const snapshot = () => world.getPlots().find(plot => plot.site === 0 && plot.idx === 0);
  const geometries = () => {
    const values = new Set();
    world.scene.traverse(object => { if (object.geometry) values.add(object.geometry); });
    return values;
  };
  world.markClaimed(0, 0);
  world.buildHut(0, 0);
  world.openField(0, 0, 1);
  assert.equal(snapshot().fieldStage, 1);
  const initial = geometries();
  const counts = new Map();
  for (const geometry of initial) geometry.addEventListener("dispose", () => counts.set(geometry, (counts.get(geometry) || 0) + 1));
  world.setFieldStage(0, 0, 2);
  assert.equal(snapshot().fieldStage, 2);
  const mature = geometries();
  const replacedSprouts = [...initial].filter(geometry => !mature.has(geometry));
  assert.equal(replacedSprouts.length, 12);
  assert.ok(replacedSprouts.every(geometry => counts.get(geometry) === 1));
  world.setFieldStage(0, 0, 2);
  assert.deepEqual(geometries(), mature, "repeated mature sync reuses existing crop meshes");

  world.upgradeBamboo(0, 0);
  assert.equal(snapshot().house, 2);
  const upgraded = geometries();
  const replacedHut = [...mature].filter(geometry => !upgraded.has(geometry));
  assert.ok(replacedHut.length > 0);
  assert.ok(replacedHut.every(geometry => counts.get(geometry) === 1));
  world.upgradeBamboo(0, 0);
  world.buildHut(0, 0);
  world.openField(0, 0, 1);
  assert.deepEqual(geometries(), upgraded, "restoration calls do not replace a finished home");
  for (const geometry of upgraded) {
    if (!initial.has(geometry)) geometry.addEventListener("dispose", () => counts.set(geometry, (counts.get(geometry) || 0) + 1));
  }
  world.setFieldStage(0, 0, 0);
  assert.equal(snapshot().fieldStage, 0);
  const empty = geometries();
  const harvested = [...upgraded].filter(geometry => !empty.has(geometry));
  assert.equal(harvested.length, 24);
  assert.ok(harvested.every(geometry => counts.get(geometry) === 1));
});

test("mangshi home animals restore counts and animate inside their yard", () => {
  const world = fixture("mangshi");
  const root = world.scene.children.find(child => child.isGroup);
  world.markClaimed(1, 4);
  world.buildHut(1, 4);
  const initial = new Set(root.children);
  for (const kind of ["chicken", "sheep", "rabbit"]) world.addAnimal(1, 4, kind);
  world.addAnimal(1, 4, "invalid");
  const animals = root.children.filter(child => !initial.has(child));
  assert.equal(animals.length, 3);
  const plot = world.getPlots().find(item => item.site === 1 && item.idx === 4);
  assert.equal(plot.animals.chicken, 1);
  assert.equal(plot.animals.sheep, 1);
  assert.equal(plot.animals.rabbit, 1);
  const starts = animals.map(animal => animal.position.clone());
  for (let frame = 1; frame <= 360; frame++) world.update(1 / 60, frame / 60);
  assert.ok(animals.every((animal, i) => animal.position.distanceTo(starts[i]) > 0.1));
  assert.ok(animals.every(animal => Math.hypot(animal.position.x - plot.x, animal.position.z - plot.z) <= 4.3));
  const snapshot = world.getPlots().find(item => item.site === 1 && item.idx === 4);
  snapshot.animals.chicken = 99;
  assert.equal(world.getPlots().find(item => item.site === 1 && item.idx === 4).animals.chicken, 1);
});

test("ruili scene builds on r108 and responds to orbit, zoom and animation", () => {
  const world = fixture("ruili");
  const cameraStart = world.camera.position.clone();
  world.handleDrag(80, 20);
  assert.ok(world.camera.position.distanceTo(cameraStart) > 1);
  const beforeZoom = world.camera.position.clone();
  world.handlePinch(1.3);
  assert.ok(world.camera.position.distanceTo(beforeZoom) > 1);
  world.resize(1280, 720);
  assert.equal(world.camera.aspect, 1280 / 720);
  const startPositions = new Map();
  world.scene.traverse(object => startPositions.set(object, object.position.clone()));
  for (let frame = 1; frame <= 360; frame++) world.update(1 / 60, frame / 60);
  let moved = 0, meshes = 0;
  world.scene.traverse(object => {
    if (object.isMesh) meshes++;
    assert.ok([object.position.x, object.position.y, object.position.z].every(Number.isFinite));
    if (object.position.distanceTo(startPositions.get(object)) > 0.1) moved++;
  });
  assert.ok(meshes > 200);
  assert.ok(moved >= 5, "clouds, crystal, waterfall or peacocks visibly animate");
});

test("three additional dams build on r108 with responsive cameras and animated meshes", () => {
  for (const name of ["yingjiang", "longchuan", "lianghe"]) {
    const world = fixture(name);
    const before = world.camera.position.clone();
    world.handleDrag(80, 20);
    world.handlePinch(1.2);
    assert.ok(world.camera.position.distanceTo(before) > 1);
    world.resize(667, 375);
    assert.equal(world.camera.aspect, 667 / 375);
    const positions = new Map();
    world.scene.traverse(object => positions.set(object, object.position.clone()));
    for (let frame = 1; frame <= 120; frame++) world.update(1 / 60, frame / 60);
    let meshes = 0, moving = 0;
    world.scene.traverse(object => {
      if (object.isMesh) meshes++;
      assert.ok([object.position.x, object.position.y, object.position.z].every(Number.isFinite));
      if (object.position.distanceTo(positions.get(object)) > 0.01) moving++;
    });
    assert.ok(meshes > 200, name + " renders a complete scene");
    assert.ok(moving > 0, name + " animates");
  }
});

test("mangshi horse reuses geometry, rides faster and stays put when dismounted", () => {
  const world = fixture("mangshi");
  assert.equal(world.getHorsePos(), null);
  world.setMounted(true);
  assert.equal(world.isMounted(), false);
  const geometrySet = () => {
    const result = new Set();
    world.scene.traverse(object => { if (object.geometry) result.add(object.geometry); });
    return result;
  };
  const before = geometrySet();
  world.showHorse(-100, 0);
  world.showHorse(-100, 0);
  assert.deepEqual(geometrySet(), before);
  world.teleportPlayerTo(-100, 0);
  assert.equal(world.nearestInteractable().type, "horse");
  world.setMounted(true);
  const start = world.getHorsePos();
  world.setMoveInput(0, 1);
  world.update(1, 1);
  const end = world.getHorsePos();
  assert.ok(Math.abs(Math.hypot(end.x - start.x, end.z - start.z) - 30) < 1e-8);
  assert.deepEqual(world.getPlayerPos(), end);
  world.showHorse(-100, 0);
  assert.deepEqual(world.getHorsePos(), end, "restoration must not reset a moving horse");
  world.setMounted(false);
  world.update(1, 2);
  assert.equal(world.isMounted(), false);
  assert.deepEqual(world.getHorsePos(), end);
  assert.ok(Math.hypot(world.getPlayerPos().x - end.x, world.getPlayerPos().z - end.z) > 1);
  world.showHorse(NaN, Infinity);
  assert.deepEqual(world.getHorsePos(), end);
  assert.deepEqual(geometrySet(), before, "mount changes never allocate replacement meshes");
});

test("each dam supports idempotent full home restoration and releases replaced geometry", () => {
  for (const name of ["mangshi", "ruili", "yingjiang", "longchuan", "lianghe"]) {
    const world = fixture(name);
    const geometries = () => {
      const values = new Set();
      world.scene.traverse(object => { if (object.geometry) values.add(object.geometry); });
      return values;
    };
    const initial = geometries();
    world.buildHut(0, 0); world.openField(0, 0, 1); world.addAnimal(0, 0, "chicken");
    assert.deepEqual(geometries(), initial, name + " requires claimed home");
    world.markClaimed(0, 0); world.buildHut(0, 0); world.openField(0, 0, 1);
    for (const kind of ["chicken", "sheep", "rabbit"]) world.addAnimal(0, 0, kind);
    const before = geometries(), disposed = new Map();
    for (const geometry of before) geometry.addEventListener("dispose", () => disposed.set(geometry, (disposed.get(geometry) || 0) + 1));
    world.setFieldStage(0, 0, 2); world.upgradeBamboo(0, 0);
    const after = geometries();
    const replaced = [...before].filter(geometry => !after.has(geometry));
    assert.ok(replaced.length > 12);
    assert.ok(replaced.every(geometry => disposed.get(geometry) === 1), name + " disposes old meshes once");
    world.markClaimed(0, 0); world.buildHut(0, 0); world.upgradeBamboo(0, 0); world.openField(0, 0, 1); world.setFieldStage(0, 0, 2);
    assert.deepEqual(geometries(), after, name + " restoration is idempotent");
    const plot = world.getPlots()[0];
    assert.equal(plot.house, 2); assert.equal(plot.field, true); assert.equal(plot.fieldStage, 2);
    assert.deepEqual({ ...plot.animals }, { chicken: 1, sheep: 1, rabbit: 1 });
    plot.animals.chicken = 99;
    assert.equal(world.getPlots()[0].animals.chicken, 1);
    const crystal = world.getCrystalPos();
    world.debugSetPlayer(crystal.x, crystal.z);
    assert.equal(world.nearestInteractable().type, "crystal");
    world.showHorse(crystal.x, crystal.z);
    const horse = world.getHorsePos();
    world.debugSetPlayer(horse.x, horse.z);
    assert.equal(world.nearestInteractable().type, "horse", name + " horse takes interaction priority");
  }
});

test("water collision resolves circle centers, overlaps and land boundary with bounded fallback", () => {
  const context = vm.createContext({ module: { exports: {} }, require: () => Economy });
  vm.runInContext(damSource, context);
  const { createLandResolver } = context.module.exports;
  for (const spec of [
    { spawn: { x: -8, z: 0 }, bounds: { rx: 10, rz: 10 }, waters: [{ x: 0, z: 0, r: 3 }] },
    { spawn: { x: -8, z: 0 }, bounds: { rx: 10, rz: 10 }, waters: [{ x: -1, z: 0, r: 4 }, { x: 1, z: 0, r: 4 }] },
    { spawn: { x: -8, z: 0 }, bounds: { rx: 10, rz: 10 }, waters: [{ x: 10, z: 0, r: 4 }] },
  ]) {
    const resolver = createLandResolver(spec);
    for (const point of [...spec.waters, { x: 1000, z: 2000 }, { x: 0, z: 0 }]) {
      const resolved = resolver.resolve(point.x, point.z, spec.spawn);
      assert.equal(resolver.valid(resolved), true);
    }
  }
});

test("five dam movement and teleports remain finite, on land and inside bounds", () => {
  for (const name of ["mangshi", "ruili", "yingjiang", "longchuan", "lianghe"]) {
    const world = fixture(name), spec = world.getSpec();
    const circles = spec.waters.concat(spec.colliders || []);
    const isLand = p => Math.hypot(p.x / spec.bounds.rx, p.z / spec.bounds.rz) <= 1 + 1e-8
      && circles.every(w => Math.hypot(p.x - w.x, p.z - w.z) >= w.r - 1e-6);
    for (const water of circles) {
      world.teleportPlayerTo(water.x, water.z);
      assert.equal(isLand(world.getPlayerPos()), true, name + " teleport resolves water center");
    }
    world.teleportPlayerTo(-100, 0);
    for (let frame = 0; frame < 180; frame++) {
      world.setMoveInput(Math.sin(frame * 0.1), Math.cos(frame * 0.1));
      world.update(1 / 60, frame / 60);
      assert.equal(isLand(world.getPlayerPos()), true, name + " movement stays on safe land");
    }
    world.setMoveInput(NaN, Infinity); world.update(1, 5);
    const before = world.getPlayerPos();
    world.handleDrag(NaN, Infinity); world.handlePinch(0); world.update(NaN, Infinity);
    world.teleportPlayerTo(NaN, Infinity);
    assert.deepEqual(world.getPlayerPos(), before);
  }
});

test("solid landmark circles block both walking and mounted movement", () => {
  for (const name of ["mangshi", "ruili", "yingjiang", "longchuan", "lianghe"]) {
    const world = fixture(name), spec = world.getSpec();
    const circle = spec.colliders.find(value => value.r >= 8);
    assert.ok(circle, name + " has solid landmarks");
    for (const mounted of [false, true]) {
      const start = { x: circle.x + circle.r + 3, z: circle.z };
      world.teleportPlayerTo(start.x, start.z);
      if (mounted) {
        const actual = world.getPlayerPos();
        world.showHorse(actual.x, actual.z); world.setMounted(true);
      }
      world.setMoveInput(-1, 0);
      for (let frame = 1; frame <= 240; frame++) {
        world.update(1 / 60, frame / 60);
        const point = world.getPlayerPos();
        assert.ok(Math.hypot(point.x - circle.x, point.z - circle.z) >= circle.r - 1e-6, name + " blocks " + (mounted ? "riding" : "walking"));
      }
      world.setMounted(false);
    }
  }
});

test("festival scenery starts hidden, switches by ID and animates without allocating meshes", () => {
  for (const [name, ids] of [["mangshi", ["songkran", "dengdeng"]], ["ruili", ["songkran", "dengdeng"]], ["yingjiang", ["dengdeng"]], ["longchuan", ["munao", "dengdeng"]], ["lianghe", ["dengdeng"]]]) {
    const world = fixture(name);
    const groups = [], geometries = new Set();
    world.scene.traverse(object => {
      if (["festival:songkran", "festival:munao", "festival:dengdeng"].includes(object.name)) groups.push(object);
      if (object.geometry) geometries.add(object.geometry);
    });
    assert.equal(groups.length, ids.length);
    assert.ok(groups.every(group => !group.visible));
    for (const id of ids) {
      world.setFestivalVisible(id);
      const group = groups.find(value => value.name === "festival:" + id);
      assert.equal(group.visible, true);
      assert.ok(groups.filter(value => value !== group).every(value => !value.visible));
      const before = group.children.map(child => child.position.clone());
      for (let frame = 1; frame <= 60; frame++) world.update(1 / 60, frame / 60);
      assert.ok(group.children.some((child, index) => child.position.distanceTo(before[index]) > 0.01), name + " " + id + " animates");
      world.setFestivalVisible(id);
      const current = new Set();
      world.scene.traverse(object => { if (object.geometry) current.add(object.geometry); });
      assert.deepEqual(current, geometries);
    }
    world.setFestivalVisible(null);
    assert.ok(groups.every(group => !group.visible));
  }
});

test("custom home claims reject invalid footprint and restore once in every dam", () => {
  for (const name of ["mangshi", "ruili", "yingjiang", "longchuan", "lianghe"]) {
    const world = fixture(name), spec = world.getSpec();
    const geometries = () => {
      const values = new Set(); world.scene.traverse(object => { if (object.geometry) values.add(object.geometry); }); return values;
    };
    const before = geometries();
    for (const [x, z] of [[NaN, 0], [0, Infinity], [spec.bounds.rx + 20, 0], [spec.bounds.rx - 1, 0]]) {
      assert.equal(world.checkPlotSpot(x, z).ok, false);
      assert.equal(world.claimCustomPlot(x, z), null);
    }
    for (const circle of [...spec.waters, ...spec.colliders]) assert.equal(world.checkPlotSpot(circle.x, circle.z).ok, false);
    assert.deepEqual(geometries(), before, "invalid placement creates no geometry");
    let chosen = null;
    for (let x = -140; x < 140 && !chosen; x += 10) for (let z = -130; z < 130 && !chosen; z += 10) {
      if (world.checkPlotSpot(x, z).ok) chosen = { x, z };
    }
    assert.ok(chosen, name + " has buildable land");
    const claim = world.claimCustomPlot(chosen.x, chosen.z);
    assert.equal(claim.site, -1); assert.equal(claim.idx, -1);
    assert.equal(world.getPlots().length, 17);
    const claimed = geometries();
    world.claimCustomPlot(chosen.x, chosen.z);
    assert.equal(world.claimCustomPlot(chosen.x + 20, chosen.z), null);
    assert.deepEqual(geometries(), claimed);
    world.buildHut(-1, -1); world.openField(-1, -1, 1); world.addAnimal(-1, -1, "chicken"); world.upgradeBamboo(-1, -1);
    const home = world.getPlots().find(plot => plot.site === -1);
    assert.equal(home.house, 2); assert.equal(home.field, true); assert.equal(home.animals.chicken, 1);
    claim.x = 9999;
    assert.equal(world.getPlots().find(plot => plot.site === -1).x, chosen.x);
  }
});

test("custom placement checks its entire footprint at bounds and near solids", () => {
  const context = vm.createContext({ module: { exports: {} }, require: () => Economy });
  vm.runInContext(damSource, context);
  const check = context.module.exports.checkCustomPlotSpot;
  const spec = { bounds: { rx: 100, rz: 100 }, sites: [{ x: -60, z: -60 }], hallPos: { x: -60, z: 0 }, crystalPos: { x: -60, z: 40 }, waters: [], colliders: [{ x: 30, z: 0, r: 2 }] };
  assert.equal(check(spec, [], 94, 0).reason, "bounds");
  assert.equal(check(spec, [], 22, 0).reason, "solid");
  assert.equal(check(spec, [], 0, 0).ok, true);
});

test("horse bond care follow and hide stay finite and reuse existing meshes", () => {
  for (const name of ["mangshi", "ruili", "yingjiang", "longchuan", "lianghe"]) {
    const world = fixture(name), spec = world.getSpec();
    world.showHorse(-100, 0);
    const horseStart = world.getHorsePos();
    world.teleportPlayerTo(horseStart.x, horseStart.z - 40);
    world.setHorseBond(49); world.update(0.1, 1);
    assert.deepEqual(world.getHorsePos(), horseStart, name + " bond below fifty does not follow");
    world.setHorseBond(55);
    for (let frame = 1; frame <= 120; frame++) world.update(1 / 60, frame / 60);
    const followed = world.getHorsePos();
    assert.ok(Math.hypot(followed.x - horseStart.x, followed.z - horseStart.z) > 1, name + " horse follows");
    assert.ok(Math.hypot(followed.x / spec.bounds.rx, followed.z / spec.bounds.rz) <= 1 + 1e-8);
    assert.ok([...spec.waters, ...spec.colliders].every(circle => Math.hypot(followed.x - circle.x, followed.z - circle.z) >= circle.r - 1e-6));
    const geometries = new Set(); world.scene.traverse(object => { if (object.geometry) geometries.add(object.geometry); });
    world.horseCare(); world.update(0.5, 3); world.update(0.5, 3.5);
    const afterCare = new Set(); world.scene.traverse(object => { if (object.geometry) afterCare.add(object.geometry); });
    assert.deepEqual(afterCare, geometries);
    world.setHorseBond(Infinity); world.setHorseBond(999);
    world.setMounted(true); world.setMoveInput(1, 0); world.update(0.1, 4);
    world.hideHorse();
    assert.equal(world.isMounted(), false); assert.equal(world.getHorsePos(), null);
    const position = world.getPlayerPos(); world.update(0.1, 4.1);
    assert.deepEqual(world.getPlayerPos(), position, "hide stops old movement");
    assert.equal(world.resolveLandPosition(NaN, 0), null);
    const land = world.resolveLandPosition(spec.waters[0].x, spec.waters[0].z);
    assert.ok([...spec.waters, ...spec.colliders].every(circle => Math.hypot(land.x - circle.x, land.z - circle.z) >= circle.r - 1e-6));
    assert.deepEqual(world.getPlayerPos(), position, "position resolution is read only");
  }
});

test("all seven scenes apply day and night lighting without hiding the world", () => {
  const day = { bg: 0xc2dbee, fog: 0xd6e5ee, hemi: 0.95, sun: 0.9, sunColor: 0xffe3b3, night: 0, rain: false };
  const night = { bg: 0x1c2a3e, fog: 0x22334a, hemi: 0.34, sun: 0.14, sunColor: 0x93a7cc, night: 1, rain: false };
  for (const name of Object.keys(sources)) {
    const world = fixture(name);
    const hemi = world.scene.children.find(object => object.isHemisphereLight);
    const sun = world.scene.children.find(object => object.isDirectionalLight);
    for (const sky of [night, day]) {
      world.setSky(sky);
      assert.equal(world.scene.background.getHex(), sky.bg, name);
      assert.equal(world.scene.fog.color.getHex(), sky.fog, name);
      assert.equal(hemi.intensity, sky.hemi, name);
      assert.equal(sun.intensity, sky.sun, name);
      assert.equal(sun.color.getHex(), sky.sunColor, name);
      assert.ok(hemi.intensity >= 0.3 && sun.intensity > 0);
    }
  }
});

test("five dams render initialized r108 fireflies and rain with stable reusable geometry", () => {
  const nightRain = { bg: 0x1c2a3e, fog: 0x22334a, hemi: 0.34, sun: 0.14, sunColor: 0x93a7cc, night: 1, rain: true };
  for (const name of ["mangshi", "ruili", "yingjiang", "longchuan", "lianghe"]) {
    const world = fixture(name);
    const flies = world.scene.getObjectByName("sky:fireflies");
    const rain = world.scene.getObjectByName("sky:rain");
    assert.equal(flies.visible, false); assert.equal(rain.visible, false);
    const flyMesh = flies.children[0], lines = rain.children[0];
    const flyPositions = flyMesh.geometry.attributes.position;
    const rainPositions = lines.geometry.attributes.position;
    assert.equal(flies.children.length, 1); assert.equal(rain.children.length, 1);
    assert.equal(flyMesh.geometry.isBufferGeometry, true);
    assert.equal(flyPositions.count, 42 * 20 * 3);
    assert.ok(Array.from(flyPositions.array).every(Number.isFinite));
    assert.equal(lines.isLineSegments, true); assert.equal(rainPositions.count, 150 * 2);
    assert.equal(lines.frustumCulled, false);
    const assertRainShape = () => {
      for (let i = 0; i < rainPositions.count; i += 2) {
        assert.ok(rainPositions.getY(i) >= 0 && rainPositions.getY(i) <= 26);
        assert.ok(Math.abs(rainPositions.getY(i + 1) - rainPositions.getY(i) - 1.3) < 0.00001);
        assert.ok(Math.abs(rainPositions.getX(i + 1) - rainPositions.getX(i) - 0.25) < 0.00001);
      }
    };
    assertRainShape();
    const initialRain = Array.from(rainPositions.array);
    const geometries = new Set(); world.scene.traverse(object => { if (object.geometry) geometries.add(object.geometry); });
    world.setSky(nightRain);
    assert.equal(flies.visible, true); assert.equal(rain.visible, true);
    assert.ok(flyMesh.material.opacity > 0);
    const oldOpacity = flyMesh.material.opacity;
    world.update(100, 100);
    assertRainShape();
    assert.notDeepEqual(Array.from(rainPositions.array), initialRain);
    assert.notEqual(flyMesh.material.opacity, oldOpacity);
    assert.ok(rainPositions.version > 0);
    const position = world.getPlayerPos();
    assert.equal(rain.position.x, position.x); assert.equal(rain.position.z, position.z);
    assert.equal(flies.position.x, position.x); assert.equal(flies.position.z, position.z);
    for (let i = 0; i < 10; i++) {
      world.setSky({ ...nightRain, night: 0, rain: false });
      world.setSky(nightRain);
    }
    const after = new Set(); world.scene.traverse(object => { if (object.geometry) after.add(object.geometry); });
    assert.deepEqual(after, geometries);
    world.setSky({ ...nightRain, night: 0, rain: false });
    assert.equal(flies.visible, false); assert.equal(rain.visible, false);
  }
});

test("five dams reuse market stalls and harvest baskets and hide the stall after leaving", () => {
  for (const name of ["mangshi", "ruili", "yingjiang", "longchuan", "lianghe"]) {
    const world = fixture(name), start = world.getPlayerPos();
    const stall = world.scene.getObjectByName("market:stall"), basket = world.scene.getObjectByName("home:harvest-basket");
    assert.equal(stall.visible, false); assert.equal(basket.visible, false);
    assert.equal(world.showHarvestBasket(0, 0), false, "unowned plot has no produce basket");
    world.markClaimed(0, 0); world.buildHut(0, 0);
    const geometry = new Set(); world.scene.traverse(object => { if (object.geometry) geometry.add(object.geometry); });
    for (let i = 0; i < 10; i++) {
      assert.equal(world.showHarvestBasket(0, 0), true);
      assert.equal(basket.visible, true);
      assert.ok([basket.position.x, basket.position.y, basket.position.z].every(Number.isFinite));
      world.hideHarvestBasket(); assert.equal(basket.visible, false);
      assert.equal(world.showStall(start.x, start.z, 0.3), true);
    }
    assert.equal(world.showStall(NaN, 0, 0), false);
    assert.equal(world.showStall(0, 0, Infinity), false);
    world.update(0.1, 1); assert.equal(stall.visible, true);
    world.teleportPlayerTo(start.x + 30, start.z + 30); world.update(0.1, 2);
    assert.equal(stall.visible, false, name + " stall is put away at distance");
    const after = new Set(); world.scene.traverse(object => { if (object.geometry) after.add(object.geometry); });
    assert.deepEqual(after, geometry);
    stall.traverse(object => { if (object.isMesh) assert.ok(object.material, name + " stall has complete materials"); });
  }
});

test("rest poses exit on movement or teleport, preserve riding height and never compound camera zoom", () => {
  for (const name of ["mangshi", "ruili", "yingjiang", "longchuan", "lianghe"]) {
    const world = fixture(name), player = world.scene.getObjectByName("player");
    world.update(1, 1);
    const start = world.getPlayerPos(), standingCamera = world.camera.position.clone();
    const geometry = new Set(); world.scene.traverse(object => { if (object.geometry) geometry.add(object.geometry); });
    for (let i = 0; i < 6; i++) {
      world.setResting(true); world.update(1, i + 2);
      assert.equal(world.isResting(), true); assert.equal(player.position.y, -0.42);
      const restingCamera = world.camera.position.clone();
      world.update(1, i + 2.5);
      assert.ok(world.camera.position.distanceTo(restingCamera) < 1e-8, "rest zoom settles without compounding");
      world.setResting(false); world.update(1, i + 3);
      assert.equal(player.position.y, 0);
      assert.ok(world.camera.position.distanceTo(standingCamera) < 1e-8, name + " standing camera restores");
    }
    world.setResting(true); world.update(1, 10);
    world.setMoveInput(1, 0); assert.equal(world.isResting(), false);
    world.update(0.1, 11); world.setMoveInput(0, 0);
    world.setResting(true); world.update(1, 12);
    world.teleportPlayerTo(start.x, start.z);
    assert.equal(world.isResting(), false); assert.equal(player.position.y, 0);
    world.setResting(true); world.update(1, 13);
    world.showHorse(start.x, start.z); world.setMounted(true); world.update(1, 14);
    assert.equal(world.isResting(), false); assert.equal(player.position.y, 1.52);
    assert.equal(world.setResting(true), false); world.update(1, 15);
    assert.equal(world.isResting(), false); assert.equal(player.position.y, 1.52);
    world.setMounted(false); world.update(1, 16); assert.equal(player.position.y, 0);
    const after = new Set(); world.scene.traverse(object => { if (object.geometry) after.add(object.geometry); });
    assert.deepEqual(after, geometry);
  }
});

test("crystals start unlit and repeated lighting reuses their existing material", () => {
  for (const name of ["mangshi", "ruili", "yingjiang", "longchuan", "lianghe"]) {
    const world = fixture(name), crystal = world.scene.getObjectByName("travel:crystal");
    assert.equal(crystal.material.color.getHex(), 0x8a8f96);
    const material = crystal.material;
    for (let i = 0; i < 10; i++) {
      world.setCrystalLit(true); assert.equal(crystal.material.color.getHex(), 0x9a6ee8);
      world.setCrystalLit(false); assert.equal(crystal.material.color.getHex(), 0x8a8f96);
      assert.equal(crystal.material, material);
    }
  }
});

test("festival player effects animate on r108 with bounded reusable splash and lantern pools", () => {
  for (const name of ["mangshi", "ruili", "yingjiang", "longchuan", "lianghe"]) {
    const world = fixture(name), start = world.getPlayerPos();
    const splash = world.scene.getObjectByName("festival:player-splash"), lanterns = world.scene.getObjectByName("festival:player-lanterns");
    assert.equal(splash.visible, false); assert.equal(lanterns.children.length, 5);
    assert.equal(splash.geometry.attributes.position.count, 24 * 20 * 3);
    assert.equal(splash.frustumCulled, false);
    const geometry = new Set(); world.scene.traverse(object => { if (object.geometry) geometry.add(object.geometry); });
    world.playSplash(); assert.equal(splash.visible, true);
    const before = Array.from(splash.geometry.attributes.position.array);
    world.update(0.2, 1);
    assert.notDeepEqual(Array.from(splash.geometry.attributes.position.array), before);
    assert.ok(Array.from(splash.geometry.attributes.position.array).every(Number.isFinite));
    assert.equal(splash.position.x, start.x); assert.equal(splash.position.z, start.z);
    world.update(1, 2); assert.equal(splash.visible, false);
    for (let i = 0; i < 12; i++) { world.playSplash(); world.releaseLantern(); world.update(0.01, 2 + i / 100); }
    assert.equal(lanterns.children.filter(mesh => mesh.visible).length, 5);
    const initialHeight = lanterns.children[0].position.y;
    world.update(1, 3); assert.ok(lanterns.children[0].position.y > initialHeight);
    world.update(7, 10);
    assert.equal(lanterns.children.some(mesh => mesh.visible), false); assert.equal(splash.visible, false);
    const after = new Set(); world.scene.traverse(object => { if (object.geometry) after.add(object.geometry); });
    assert.deepEqual(after, geometry);
  }
});

test("longchuan dance completes once, is repeatable, and stops safely for movement and riding", () => {
  const world = fixture("longchuan"), player = world.scene.getObjectByName("player");
  world.teleportPlayerTo(-52 + 9.5, 26);
  world.setResting(true); world.update(1, 1);
  assert.equal(world.joinDance(), true); assert.equal(world.isResting(), false);
  world.update(1, 2);
  assert.equal(world.isDancing(), true); assert.ok(player.position.y >= 0);
  assert.ok(Math.abs(Math.hypot(player.position.x + 52, player.position.z - 26) - 9.5) < 1e-6);
  world.joinDance(); world.update(21, 23);
  assert.equal(world.isDancing(), false); assert.equal(player.position.y, 0);
  assert.equal(world.consumeDanceDone(), true); assert.equal(world.consumeDanceDone(), false);
  world.joinDance(); world.update(1, 24); world.setMoveInput(1, 0);
  assert.equal(world.isDancing(), false); assert.equal(world.consumeDanceDone(), false);
  world.setMoveInput(0, 0); world.joinDance(); world.update(1, 25);
  world.teleportPlayerTo(-42.5, 26); assert.equal(world.isDancing(), false);
  world.joinDance(); world.update(22, 47); world.stopDance(); assert.equal(world.consumeDanceDone(), false);
  world.joinDance(); world.showHorse(-42.5, 26); world.setMounted(true); world.update(1, 48);
  assert.equal(world.isDancing(), false); assert.equal(player.position.y, 1.52);
  assert.equal(world.joinDance(), false); assert.equal(world.consumeDanceDone(), false);
  for (const name of ["ruili", "yingjiang", "lianghe"]) assert.equal(fixture(name).joinDance(), false);
});

test("mangshi market and west-side crystal are reachable on foot after the river shift", () => {
  const world = fixture("mangshi"), spec = world.getSpec();
  assert.deepEqual({ ...world.getCrystalPos() }, { x: -0.5, z: 35.5 });
  const valid = point => [...spec.waters, ...spec.colliders].every(circle => Math.hypot(point.x - circle.x, point.z - circle.z) >= circle.r - 1e-6);
  assert.equal(valid(world.getCrystalPos()), true);
  world.setMoveInput(0, 1);
  let marketReached = false, crystalReached = false;
  for (let frame = 1; frame <= 90; frame++) {
    world.update(1 / 60, frame / 60);
    const position = world.getPlayerPos();
    assert.equal(valid(position), true, "walking stays outside river collision circles");
    if (Math.hypot(position.x - 4, position.z - 34) < 13) marketReached = true;
    if (world.nearestInteractable()?.type === "crystal") crystalReached = true;
  }
  assert.equal(marketReached, true); assert.equal(crystalReached, true);
});

test("round26 landmark geometry matches shifted colliders, translucent steam and night lamps", () => {
  const lianghe = fixture("lianghe"), yamen = lianghe.scene.getObjectByName("landmark:yamen");
  assert.equal(yamen.position.x, -20); assert.equal(yamen.position.z, -18);
  assert.ok(lianghe.getSpec().colliders.some(circle => circle.x === -20 && circle.z === -18 && circle.r === 12.5));
  const steam = [];
  lianghe.scene.traverse(object => { if (object.material?.color?.getHex() === 0xf4f9fa) steam.push(object.material); });
  assert.ok(steam.length > 0);
  for (const material of steam) { assert.equal(material.transparent, true); assert.equal(material.opacity, 0.38); assert.equal(material.depthWrite, false); }
  const longchuan = fixture("longchuan"), lamps = [];
  longchuan.scene.traverse(object => { if (object.name === "landmark:dance-lamp") lamps.push(object); });
  assert.equal(lamps.length, 2);
  for (const lamp of lamps) { assert.equal(lamp.material.isMeshBasicMaterial, true); assert.equal(lamp.position.z, 42); }
});
