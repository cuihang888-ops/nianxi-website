// 安和里 · 第一个微信场景：总佛寺前庭院（出生地）
// 纯 Three.js 场景模块：不碰 DOM、不碰 wx API，宿主（小游戏 game.js / 网页预览）注入 THREE 并驱动。
// 兼容 three r108（threejs-miniprogram 内置版本）与新版 three：只用两代都有的 API。
(function (global, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else global.AnheliScene = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function createAnheliScene(THREE) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xbfd9e8);
    scene.fog = new THREE.Fog(0xcfe0ea, 120, 300);

    const camera = new THREE.PerspectiveCamera(46, 16 / 9, 0.1, 600);

    // —— 光 ——
    const hemi = new THREE.HemisphereLight(0xd8ecff, 0x8a9a6a, 0.95);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffe3b3, 0.9);
    sun.position.set(50, 70, 25);
    scene.add(sun);

    // —— 共享材质 ——
    const M = {
      grass: new THREE.MeshLambertMaterial({ color: 0x9db877 }),
      earth: new THREE.MeshLambertMaterial({ color: 0xcdbb92 }),
      stone: new THREE.MeshLambertMaterial({ color: 0xb9b0a0 }),
      stoneD: new THREE.MeshLambertMaterial({ color: 0x9a917f }),
      cream: new THREE.MeshLambertMaterial({ color: 0xf0e6cc }),
      wood: new THREE.MeshLambertMaterial({ color: 0x8a6844 }),
      woodDark: new THREE.MeshLambertMaterial({ color: 0x6b4e30 }),
      roof: new THREE.MeshLambertMaterial({ color: 0x9c4f38 }),
      gold: new THREE.MeshLambertMaterial({ color: 0xd9a441 }),
      trunk: new THREE.MeshLambertMaterial({ color: 0x7a5f3d }),
      leaf: new THREE.MeshLambertMaterial({ color: 0x5f8f4e }),
      leaf2: new THREE.MeshLambertMaterial({ color: 0x74a75e }),
      water: new THREE.MeshLambertMaterial({ color: 0x7fb6c9 }),
      hill1: new THREE.MeshLambertMaterial({ color: 0x87ab72 }),
      hill2: new THREE.MeshLambertMaterial({ color: 0x74975f }),
      hill3: new THREE.MeshLambertMaterial({ color: 0x9dbb8a }),
    };
    const box = (w, h, d, mat, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      return m;
    };
    const root = new THREE.Group();
    scene.add(root);

    // —— 地面：坝子草地 + 庭院土场 ——
    const ground = new THREE.Mesh(new THREE.CircleGeometry(240, 40), M.grass);
    ground.rotation.x = -Math.PI / 2;
    root.add(ground);
    const yard = new THREE.Mesh(new THREE.CircleGeometry(30, 32), M.earth);
    yard.rotation.x = -Math.PI / 2; yard.position.y = 0.03;
    root.add(yard);

    // —— 总佛寺（主殿 + 钟楼 + 金顶小塔），坐北朝南 ——
    const temple = new THREE.Group();
    temple.position.set(0, 0, -20);
    for (let i = 0; i < 3; i++) temple.add(box(26 - i * 3.5, 0.55, 15 - i * 2, M.stone, 0, 0.28 + i * 0.55, 1.5 - i * 0.6));
    temple.add(box(19, 4.6, 9.5, M.cream, 0, 3.9, -1));
    temple.add(box(3.4, 3.4, 0.5, M.woodDark, 0, 3.4, 3.8));       // 殿门
    const roof1 = box(22.5, 0.5, 12.5, M.roof, 0, 6.6, -1); roof1.rotation.x = 0.06; temple.add(roof1);
    const roof2 = box(15.5, 0.45, 9, M.roof, 0, 8.3, -1.1); temple.add(roof2);
    temple.add(box(6.5, 0.5, 1.1, M.roof, 0, 9.3, -1.1));           // 屋脊
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.85, 2.4, 6), M.gold);
    tip.position.set(0, 10.6, -1.1); temple.add(tip);
    const bell = new THREE.Group(); bell.position.set(13.5, 0, 2.5);
    bell.add(box(4.4, 0.5, 4.4, M.stone, 0, 1.9, 0));
    for (const [px, pz] of [[-1.7, -1.7], [1.7, -1.7], [-1.7, 1.7], [1.7, 1.7]]) bell.add(box(0.42, 3.8, 0.42, M.wood, px, 1.9 + 1.9, pz));
    bell.add(box(5.4, 2.6, 5.4, M.cream, 0, 5.6, 0));
    const bellRoof = box(6.8, 0.4, 6.8, M.roof, 0, 7.3, 0); bell.add(bellRoof);
    const bellTip = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.7, 6), M.gold);
    bellTip.position.set(0, 8.4, 0); bell.add(bellTip);
    temple.add(bell);
    root.add(temple);

    // —— 安和里大厅（敞亭 + 心灯柱）：每个地区的那个「点」——
    const hall = new THREE.Group();
    hall.position.set(-17, 0, 4);
    const hallBase = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 5, 0.5, 10), M.stone);
    hallBase.position.y = 0.25; hall.add(hallBase);
    for (const [px, pz] of [[-3.2, -3.2], [3.2, -3.2], [-3.2, 3.2], [3.2, 3.2]]) hall.add(box(0.4, 4.4, 0.4, M.wood, px, 2.7, pz));
    const hallRoof = box(8.6, 0.4, 8.6, M.roof, 0, 5.3, 0); hallRoof.rotation.x = 0.05; hall.add(hallRoof);
    hall.add(box(3.4, 0.4, 0.9, M.roof, 0, 6.15, 0));
    const lampPost = box(0.3, 3.4, 0.3, M.woodDark, 0, 2.2, 5.6); hall.add(lampPost);
    const lampBox = box(0.95, 0.95, 0.95, M.gold, 0, 4.2, 5.6); hall.add(lampBox);
    root.add(hall);

    // —— 放生池 + 莲 ——
    const pond = new THREE.Group();
    pond.position.set(12, 0, 10);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(6.4, 6.7, 0.5, 18), M.stone);
    rim.position.y = 0.25; pond.add(rim);
    const water = new THREE.Mesh(new THREE.CircleGeometry(5.8, 20), M.water);
    water.rotation.x = -Math.PI / 2; water.position.y = 0.52; pond.add(water);
    pond.userData.water = water;
    for (let i = 0; i < 7; i++) {
      const a = i * 2.4, r = 1.6 + (i % 3) * 1.5;
      const lotus = new THREE.Mesh(new THREE.CircleGeometry(0.55, 7), M.leaf2);
      lotus.rotation.x = -Math.PI / 2;
      lotus.position.set(Math.cos(a) * r, 0.56, Math.sin(a) * r);
      pond.add(lotus);
    }
    root.add(pond);

    // —— 大榕树（庭院的荫）——
    const banyan = new THREE.Group();
    banyan.position.set(19, 0, -7);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2.1, 5.5, 8), M.trunk);
    trunk.position.y = 2.75; banyan.add(trunk);
    const canopy = new THREE.Group();
    for (const [cx, cy, cz, r] of [[0, 7.6, 0, 6.4], [-4.4, 6.4, 1.4, 4.2], [4.4, 6.6, -1.2, 4.4], [0.8, 6.2, 4, 3.8]]) {
      const c = new THREE.Mesh(new THREE.SphereGeometry(r, 9, 7), M.leaf);
      c.position.set(cx, cy, cz); c.scale.y = 0.62; canopy.add(c);
    }
    banyan.add(canopy);
    banyan.userData.canopy = canopy;
    root.add(banyan);

    // —— 五色经幡（五根幡杆，轻轻摆）——
    const flags = new THREE.Group();
    flags.position.set(-7.5, 0, -6);
    const flagCols = [0x4a7ab5, 0xfbf7ec, 0xc94f43, 0x5f9e52, 0xf2d06b];
    const flagCloths = [];
    flagCols.forEach((col, i) => {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 8.6, 5), M.woodDark);
      pole.position.set(i * 1.35 - 2.7, 4.3, 0);
      flags.add(pole);
      const cloth = box(0.95, 1.5, 0.06, new THREE.MeshLambertMaterial({ color: col }), i * 1.35 - 2.7 + 0.55, 7.4, 0);
      flags.add(cloth);
      flagCloths.push(cloth);
    });
    root.add(flags);

    // —— 石灯笼小径 ——
    for (const [lx, lz] of [[-4.5, 6], [4.5, 6], [-4.5, -2], [4.5, -2]]) {
      const lant = new THREE.Group();
      lant.position.set(lx, 0, lz);
      lant.add(box(0.34, 1.35, 0.34, M.stoneD, 0, 0.67, 0));
      lant.add(box(0.72, 0.55, 0.72, M.gold, 0, 1.6, 0));
      lant.add(box(0.95, 0.22, 0.95, M.stoneD, 0, 1.98, 0));
      root.add(lant);
    }

    // —— 远山（层层青绿）+ 林木 ——
    const hillDefs = [
      [-120, -120, 66, 30, M.hill2], [30, -150, 84, 38, M.hill3], [140, -95, 62, 27, M.hill1],
      [-165, -10, 58, 24, M.hill3], [170, 30, 70, 26, M.hill2], [-95, 130, 60, 22, M.hill1],
      [95, 135, 74, 25, M.hill3], [0, 175, 66, 23, M.hill2],
    ];
    for (const [hx, hz, r, h, mat] of hillDefs) {
      const hill = new THREE.Mesh(new THREE.ConeGeometry(r, h, 9), mat);
      hill.position.set(hx, h / 2 - 1.5, hz);
      root.add(hill);
    }
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.3, 1.7, 5);
    const canGeo = new THREE.ConeGeometry(1.9, 4.6, 6);
    const canGeo2 = new THREE.SphereGeometry(2.1, 7, 6);
    let seed = 42;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 90; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 36 + rnd() * 95;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.abs(x) < 20 && z > 24) continue;              // 让开南边江面
      const tree = new THREE.Group();
      const tr = new THREE.Mesh(trunkGeo, M.trunk); tr.position.y = 0.85; tree.add(tr);
      const cn = new THREE.Mesh(rnd() > 0.5 ? canGeo : canGeo2, rnd() > 0.4 ? M.leaf : M.leaf2);
      cn.position.y = rnd() > 0.5 ? 3.6 : 3.1; tree.add(cn);
      const s = 0.8 + rnd() * 1.15;
      tree.scale.set(s, s * (0.9 + rnd() * 0.3), s);
      tree.position.set(x, 0, z);
      tree.rotation.y = rnd() * 3;
      root.add(tree);
    }

    // —— 南边江面（几片相叠的水光）——
    const river = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const w = new THREE.Mesh(new THREE.CircleGeometry(15 + (i % 3) * 5, 14), M.water);
      w.rotation.x = -Math.PI / 2;
      w.position.set(-68 + i * 28, 0.04, 62 + (i % 2) * 9);
      w.scale.set(1.5, 0.62, 1);
      river.add(w);
    }
    root.add(river);

    // —— 轨道相机（拖动环视 / 双指缩放 / 静置慢转）——
    let azimuth = 0.65, polar = 1.08, radius = 52;
    let idleTime = 0;
    const target = new THREE.Vector3(0, 3.5, -6);
    function applyCamera() {
      const sp = Math.sin(polar), y = Math.cos(polar);
      camera.position.set(
        target.x + radius * sp * Math.sin(azimuth),
        target.y + radius * y,
        target.z + radius * sp * Math.cos(azimuth)
      );
      camera.lookAt(target);
    }
    applyCamera();

    return {
      scene,
      camera,
      setSky(sky) {
        scene.background.set(sky.bg);
        if (scene.fog) scene.fog.color.set(sky.fog);
        hemi.intensity = sky.hemi;
        sun.intensity = sky.sun;
        sun.color.set(sky.sunColor);
      },
      resize(w, h) { camera.aspect = w / h; camera.updateProjectionMatrix(); },
      handleDrag(dx, dy) {
        azimuth -= dx * 0.0052;
        polar = Math.max(0.55, Math.min(1.42, polar - dy * 0.0042));
        idleTime = 0;
        applyCamera();
      },
      handlePinch(scale) {
        radius = Math.max(24, Math.min(95, radius / scale));
        idleTime = 0;
        applyCamera();
      },
      update(dt, t) {
        idleTime += dt;
        if (idleTime > 4) { azimuth += dt * 0.016; applyCamera(); }   // 看风景慢转
        water.material.color.setHSL(0.54, 0.32, 0.62 + Math.sin(t * 0.7) * 0.03);
        canopy.scale.setScalar(1 + Math.sin(t * 0.55) * 0.008);        // 树冠呼吸
        flagCloths.forEach((c, i) => { c.rotation.y = Math.sin(t * 1.3 + i * 0.9) * 0.32; });
      },
    };
  }

  return { createAnheliScene };
});
