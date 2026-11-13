import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createFarmScene, farmBlocked } from "../src/farm-scene.js";
import { createFarm, applyFarmAction, LAND_PLOTS } from "../src/farm-state.js";

const EPOCH = 1_800_000_000_000;

function fixture(t) {
  const scene = new THREE.Scene();
  const resources = new Set();
  const clickables = [];
  const materials = new Map();
  const mat = (color, extras = {}) => {
    const key = `${color}:${JSON.stringify(extras)}`;
    if (!materials.has(key)) {
      const material = new THREE.MeshStandardMaterial({ color, ...extras });
      materials.set(key, material);
      resources.add(material);
    }
    return materials.get(key);
  };
  const mesh = (geometry, material, parent = scene, position = [0, 0, 0], shadow = true) => {
    resources.add(geometry);
    const value = new THREE.Mesh(geometry, material);
    value.position.set(...position);
    value.castShadow = shadow;
    value.receiveShadow = true;
    parent.add(value);
    return value;
  };
  const box = (parent, x, y, z, w, h, d, color, options) => mesh(new THREE.BoxGeometry(w, h, d), mat(color, options), parent, [x, y, z]);
  const cylinder = (parent, x, y, z, top, bottom, h, color, sides = 12, options) => mesh(new THREE.CylinderGeometry(top, bottom, h, sides), mat(color, options), parent, [x, y, z]);
  const sphere = (parent, x, y, z, radius, color, scale = [1, 1, 1], options) => {
    const value = mesh(new THREE.SphereGeometry(radius, 10, 7), mat(color, options), parent, [x, y, z]);
    value.scale.set(...scale);
    return value;
  };
  const textSprite = () => {
    const material = new THREE.SpriteMaterial();
    resources.add(material);
    return new THREE.Sprite(material);
  };
  const farm = createFarmScene({ scene, resources, clickables, mat, mesh, box, cylinder, sphere, textSprite, chinese: true });
  let time = 0;
  const step = (player, reducedMotion = false) => {
    time += .05;
    farm.animate(.05, time, reducedMotion, player);
    return farm.getWorld();
  };
  const advance = (seconds, player, reducedMotion = false, observe = () => {}) => {
    for (let frame = 0; frame < Math.ceil(seconds / .05); frame++) observe(step(player, reducedMotion), frame);
    return farm.getWorld();
  };
  t.after(() => { for (const resource of resources) resource.dispose(); });
  return { scene, resources, clickables, farm, step, advance };
}

function populatedFarm(plotCount = 4, types = ["sheep", "rabbit", "chicken"]) {
  let state = createFarm(EPOCH);
  state.coins = 100_000;
  for (const plot of LAND_PLOTS.slice(0, plotCount)) {
    for (const action of [
      { type: "buyPlot", plotId: plot.id },
      ...types.map(animalType => ({ type: "buyAnimal", plotId: plot.id, animalType })),
    ]) {
      const result = applyFarmAction(state, action, EPOCH);
      assert.equal(result.ok, true);
      state = result.state;
    }
  }
  return state;
}

function insideFence(animal) {
  const plot = LAND_PLOTS.find(item => item.id === animal.plotId);
  assert.ok(Number.isFinite(animal.x) && Number.isFinite(animal.z));
  assert.ok(Math.abs(animal.x - plot.x) < 11.3, `${animal.id} crossed the side fence`);
  assert.ok(Math.abs(animal.z - plot.z) < 6.3, `${animal.id} crossed the end fence`);
  assert.equal(farmBlocked(animal.x, animal.z), false, `${animal.id} entered a blocked fence`);
}

test("farm animals stay inside their own fences when a visitor circles outside", t => {
  const { farm, advance } = fixture(t);
  farm.setState(populatedFarm());
  const activities = new Set();
  for (const plot of LAND_PLOTS) {
    for (const player of [
      { x: plot.x + 13, z: plot.z }, { x: plot.x - 13, z: plot.z },
      { x: plot.x, z: plot.z + 8 }, { x: plot.x, z: plot.z - 8 },
    ]) advance(3, player, false, world => {
      assert.equal(world.animalCount, 12);
      world.animals.forEach(animal => {
        insideFence(animal);
        assert.notEqual(animal.motion, "approaching", "a visitor outside the fences must not trigger a greeting");
        activities.add(animal.motion);
      });
    });
  }
  assert.ok(activities.has("walking"));
  assert.ok(activities.has("grazing"));
  assert.ok(activities.has("watching"));
});

test("an entering visitor gets a brief greeting before animals resume their own routine", t => {
  const { farm, advance } = fixture(t);
  farm.setState(populatedFarm(1, ["sheep"]));
  const plot = LAND_PLOTS[0];
  advance(2);
  const player = { x: plot.x - Math.sign(plot.x) * 4, z: plot.z };
  const distance = animal => Math.hypot(animal.x - player.x, animal.z - player.z);
  const before = distance(farm.getWorld().animals[0]);
  let nearest = before;
  advance(5, player, false, world => {
    const animal = world.animals[0];
    insideFence(animal);
    nearest = Math.min(nearest, distance(animal));
  });
  assert.ok(nearest < before - .3, "the companion should approach the arriving visitor");
  const resumed = new Set();
  advance(30, player, false, world => {
    insideFence(world.animals[0]);
    resumed.add(world.animals[0].motion);
  });
  for (const activity of ["walking", "grazing", "watching"]) assert.ok(resumed.has(activity), `missing resumed activity: ${activity}`);
});

test("care turns the companion toward the visitor and reduced motion freezes the scene", t => {
  const { farm, scene, advance, step } = fixture(t);
  const state = populatedFarm(1, ["sheep"]);
  farm.setState(state);
  const plot = LAND_PLOTS[0];
  const player = { x: plot.x + 4, z: plot.z };
  advance(8, player);
  const cared = applyFarmAction(state, { type: "pet", animalId: state.animals[0].id }, EPOCH + 8000);
  assert.equal(cared.ok, true);
  farm.setState(cared.state);
  const world = advance(1, player);
  const animal = world.animals[0];
  assert.equal(animal.motion, "responding");
  const targetHeading = Math.atan2(player.x - animal.x, player.z - animal.z);
  const angle = Math.atan2(Math.sin(animal.heading - targetHeading), Math.cos(animal.heading - targetHeading));
  assert.ok(Math.abs(angle) < .25, "care should face the nearby visitor");

  step(player, true);
  const positions = farm.getWorld().animals.map(({ x, z, heading, headTilt }) => ({ x, z, heading, headTilt }));
  const instances = [];
  scene.traverse(object => { if (object.isInstancedMesh) instances.push(object); });
  const matrices = instances.map(object => Array.from(object.instanceMatrix.array));
  advance(.5, { x: player.x + 1, z: player.z + 1 }, true);
  assert.deepEqual(farm.getWorld().animals.map(({ x, z, heading, headTilt }) => ({ x, z, heading, headTilt })), positions);
  instances.forEach((object, index) => assert.deepEqual(Array.from(object.instanceMatrix.array), matrices[index], "reduced motion should freeze instance positions, including care effects"));
});

test("repeated farm updates retain instance identity and do not accumulate resources", t => {
  const { farm, scene, resources, advance } = fixture(t);
  const state = populatedFarm();
  farm.setState(state);
  advance(1);
  const count = resources.size;
  const original = new Map();
  scene.traverse(object => { if (object.userData.farmAnimalType) original.set(object.userData.farmAnimalType, object); });
  for (let iteration = 0; iteration < 30; iteration++) {
    const next = structuredClone(state);
    next.animals = iteration % 2 ? next.animals.slice(1) : next.animals;
    next.animals.forEach(animal => { animal.name = `Companion ${iteration}`; });
    farm.setState(next);
    advance(.2);
    for (const [type, mesh] of original) {
      const expected = next.animals.filter(animal => animal.type === type);
      assert.equal(mesh.count, expected.length);
      expected.forEach((animal, index) => assert.equal(farm.resolveAnimal(type, index), animal.id));
      assert.equal(farm.resolveAnimal(type, expected.length), undefined);
      assert.equal(scene.getObjectById(mesh.id), mesh);
    }
    assert.equal(resources.size, count);
  }
});
