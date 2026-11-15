import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import * as ModernThree from "three";
import Economy from "../wechat/vendor/preview-economy.cjs";
import Roads from "../wechat/vendor/preview-roads.cjs";
import DamWorld from "../wechat/vendor/dam-world.cjs";
import Yingjiang from "../wechat/vendor/yingjiang-scene.cjs";

function runtime(legacy) {
  if (!legacy) return { THREE: ModernThree, DamWorld, Yingjiang };
  const vendor = new URL("../wechat/vendor/", import.meta.url);
  const context = vm.createContext({ exports: {}, console, require(name) {
    return name.includes("preview-roads") ? Roads : Economy;
  } });
  vm.runInContext(fs.readFileSync(new URL("threejs-miniprogram.cjs", vendor), "utf8"), context);
  vm.runInContext("class Canvas {}; this.THREE = exports.createScopedThreejs(new Canvas()); this.module = { exports: {} };", context);
  vm.runInContext(fs.readFileSync(new URL("dam-world.cjs", vendor), "utf8"), context);
  vm.runInContext("this.DamWorld = module.exports; this.module = { exports: {} };", context);
  vm.runInContext(fs.readFileSync(new URL("yingjiang-scene.cjs", vendor), "utf8"), context);
  return { THREE: context.THREE, DamWorld: context.DamWorld, Yingjiang: context.module.exports };
}

function fixture(engine) {
  const { THREE, DamWorld } = engine;
  const objects = {};
  let leaf;
  const world = DamWorld.createDamScene(THREE, {
    spawn: { x: 0, z: 0 }, hallPos: { x: -40, z: 0 }, crystalPos: { x: 40, z: 0 },
    sites: [], bounds: { rx: 200, rz: 200 }, waters: [],
    decorate(root, M) {
      leaf = M.leaf;
      function add(name, geometry, x, y, z, parent = root) {
        const mesh = new THREE.Mesh(geometry, leaf);
        mesh.name = name; mesh.position.set(x, y, z); parent.add(mesh); objects[name] = mesh;
        return mesh;
      }
      add("blocking", new THREE.SphereGeometry(2.4, 10, 8), 0, 6, 7);
      add("inside", new THREE.SphereGeometry(3, 10, 8), 0, 1.7 + 17 * Math.cos(1.06), 17 * Math.sin(1.06)).scale.y = 0.6;
      add("offSight", new THREE.SphereGeometry(2.4, 10, 8), 3, 6, 7).scale.set(0.1, 3, 3);
      add("flag", new THREE.BoxGeometry(4, 4, 1), 0, 6, 8);
      add("skirt", new THREE.ConeGeometry(0.55, 4, 8), 0, 6, 8);
      add("originallyHidden", new THREE.SphereGeometry(3, 10, 8), 0, 6, 7).visible = false;
      const hiddenGroup = new THREE.Group();
      hiddenGroup.visible = false; root.add(hiddenGroup);
      add("hiddenAncestor", new THREE.SphereGeometry(3, 10, 8), 0, 6, 7, hiddenGroup);
    },
  });
  return { world, objects, leaf };
}

for (const legacy of [false, true]) {
  const label = legacy ? "WeChat r108" : "modern Three";
  test(`${label}: camera hides only obstructing crowns and restores them after moving`, () => {
    const { world, objects, leaf } = fixture(runtime(legacy));
    assert.equal(objects.blocking.visible, false, "crown between camera and player is hidden immediately");
    assert.equal(objects.inside.visible, false, "camera inside a front-sided crown is covered");
    assert.equal(objects.offSight.visible, true, "loose world bounds do not hide an off-axis crown");
    assert.equal(objects.flag.visible, true, "non-tree shared material remains visible");
    assert.equal(objects.skirt.visible, true, "small festival cones remain visible");
    assert.equal(objects.originallyHidden.visible, false);
    assert.equal(objects.hiddenAncestor.visible, true, "hidden ancestors are left alone");
    assert.equal(leaf.transparent, false);
    assert.equal(leaf.opacity, 1);
    assert.equal(objects.blocking.material, objects.flag.material);
    world.teleportPlayerTo(40, 40);
    assert.equal(objects.blocking.visible, true);
    assert.equal(objects.inside.visible, true);
    assert.equal(objects.originallyHidden.visible, false);
    world.teleportPlayerTo(0, 0);
    assert.equal(objects.blocking.visible, false);
    assert.equal(objects.inside.visible, false);
    world.handleDrag(Math.PI / 0.0052, 0);
    assert.equal(objects.blocking.visible, true, "orbiting away restores the view");
    assert.equal(objects.inside.visible, true);
  });

  test(`${label}: camera updates reuse cached foliage instead of traversing the scene`, () => {
    const { world, objects } = fixture(runtime(legacy));
    world.scene.traverse(() => {});
    world.scene.traverse = () => { throw new Error("per-frame scene traversal"); };
    for (const child of world.scene.children) child.traverse = world.scene.traverse;
    world.update(1 / 60, 1);
    assert.equal(objects.blocking.visible, false);
    world.handlePinch(0.8);
    world.teleportPlayerTo(40, 40);
    world.update(1 / 60, 2);
    assert.equal(objects.blocking.visible, true);
  });

  test(`${label}: restored Yingjiang home keeps the player visible under banyan crowns`, () => {
    const engine = runtime(legacy);
    for (let reload = 0; reload < 2; reload++) {
      const world = engine.Yingjiang.createYingjiangScene(engine.THREE, engine.DamWorld);
      const crowns = [];
      world.scene.traverse(mesh => {
        if (mesh.geometry?.type.startsWith("Sphere") && mesh.geometry.parameters.radius >= 6
          && mesh.material?.color?.getHex() === 0x74a75e) crowns.push(mesh);
      });
      assert.equal(crowns.length, 3);
      const home = { x: -140, z: -100 }, hall = world.getHallPos();
      const length = Math.hypot(home.x - hall.x, home.z - hall.z);
      const x = home.x - (home.x - hall.x) / length * 5.5;
      const z = home.z - (home.z - hall.z) / length * 5.5;
      world.teleportPlayerTo(x, z);
      assert.ok(crowns.some(mesh => !mesh.visible), "the crown covering the camera is hidden");
      assert.equal(world.getPlayerPos().x, x, "occlusion does not move the player or home");
      assert.equal(world.getPlayerPos().z, z);
      const spawn = world.getSpawn();
      world.teleportPlayerTo(spawn.x, spawn.z);
      assert.ok(crowns.every(mesh => mesh.visible), "returning to town restores the landmark");
    }
  });
}
