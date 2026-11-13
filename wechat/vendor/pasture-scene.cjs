// 安和里 · 第二个微信场景：溪山牧场 · 家园（竹楼、田畦、鸡羊兔、溪流柳树）
// 与 anheli-scene.js 同一约定：纯 Three.js、无 DOM、无 wx，宿主注入 THREE 并转发输入。
(function (global, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else global.AnheliPasture = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function createPastureScene(THREE, events) {
    events = events || {};
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xc4ddef);
    scene.fog = new THREE.Fog(0xd2e2ec, 110, 280);
    const camera = new THREE.PerspectiveCamera(46, 16 / 9, 0.1, 600);
    const hemi = new THREE.HemisphereLight(0xd8ecff, 0x8a9a6a, 0.95);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffe9c0, 0.9);
    sun.position.set(-35, 60, 40);
    scene.add(sun);

    const M = {
      meadow: new THREE.MeshLambertMaterial({ color: 0xa4c47e }),
      earth: new THREE.MeshLambertMaterial({ color: 0xcdbb92 }),
      soil: new THREE.MeshLambertMaterial({ color: 0x6e5136 }),
      wood: new THREE.MeshLambertMaterial({ color: 0x8a6844 }),
      woodDark: new THREE.MeshLambertMaterial({ color: 0x6b4e30 }),
      bamboo: new THREE.MeshLambertMaterial({ color: 0x7d9b52 }),
      floor: new THREE.MeshLambertMaterial({ color: 0xa8895a }),
      wall: new THREE.MeshLambertMaterial({ color: 0xcdb87e }),
      roof: new THREE.MeshLambertMaterial({ color: 0x977950 }),
      stone: new THREE.MeshLambertMaterial({ color: 0xb9b0a0 }),
      trunk: new THREE.MeshLambertMaterial({ color: 0x7a5f3d }),
      leaf: new THREE.MeshLambertMaterial({ color: 0x5f8f4e }),
      leaf2: new THREE.MeshLambertMaterial({ color: 0x86b364 }),
      willow: new THREE.MeshLambertMaterial({ color: 0x8fbf74 }),
      water: new THREE.MeshLambertMaterial({ color: 0x86bfd4 }),
      sprout: new THREE.MeshLambertMaterial({ color: 0x74a75e }),
      gold: new THREE.MeshLambertMaterial({ color: 0xd9a441 }),
      orange: new THREE.MeshLambertMaterial({ color: 0xe07b39 }),
      white: new THREE.MeshLambertMaterial({ color: 0xfbf7ec }),
      wool: new THREE.MeshLambertMaterial({ color: 0xefe9da }),
      dark: new THREE.MeshLambertMaterial({ color: 0x4a4038 }),
      red: new THREE.MeshLambertMaterial({ color: 0xc94f43 }),
      grey: new THREE.MeshLambertMaterial({ color: 0xd9d4cc }),
      hill1: new THREE.MeshLambertMaterial({ color: 0x87ab72 }),
      hill2: new THREE.MeshLambertMaterial({ color: 0x74975f }),
    };
    const box = (w, h, d, mat, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      return m;
    };
    const root = new THREE.Group();
    scene.add(root);

    // —— 草甸 + 院坝 ——
    const meadow = new THREE.Mesh(new THREE.CircleGeometry(230, 40), M.meadow);
    meadow.rotation.x = -Math.PI / 2;
    root.add(meadow);
    const yardDisc = new THREE.Mesh(new THREE.CircleGeometry(17, 24), M.earth);
    yardDisc.rotation.x = -Math.PI / 2; yardDisc.position.set(-3, 0.03, 2);
    root.add(yardDisc);

    // —— 傣家竹楼（干栏式）——
    const house = new THREE.Group();
    house.position.set(-8, 0, -5);
    house.rotation.y = 0.5;
    for (const [px, pz] of [[-2.2, -1.6], [0, -1.6], [2.2, -1.6], [-2.2, 1.6], [0, 1.6], [2.2, 1.6]]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, 1.8, 6), M.bamboo);
      p.position.set(px, 0.9, pz); house.add(p);
    }
    house.add(box(5.6, 0.24, 4.4, M.floor, 0, 1.9, 0));
    house.add(box(4.7, 1.9, 3.5, M.wall, 0, 3.0, -0.3));
    house.add(box(1.0, 1.7, 0.1, M.woodDark, -0.9, 2.85, 1.48));
    house.add(box(0.9, 0.7, 0.1, M.woodDark, 1.1, 3.3, 1.48));
    const hr1 = box(3.4, 0.16, 3.4, M.roof, -1.45, 4.6, 0); hr1.rotation.z = 0.62; house.add(hr1);
    const hr2 = box(3.4, 0.16, 3.4, M.roof, 1.45, 4.6, 0); hr2.rotation.z = -0.62; house.add(hr2);
    house.add(box(0.5, 0.3, 3.6, M.roof, 0, 5.42, 0));
    for (let i = 0; i < 4; i++) house.add(box(1.0, 0.16, 0.7, M.floor, -1.7, 1.5 - i * 0.42, 2.6 + i * 0.55));
    house.add(box(5.6, 0.12, 0.12, M.bamboo, 0, 2.75, 2.14));
    root.add(house);

    // —— 田：4 畦（成熟萝卜 / 芽 / 成熟草料 / 空畦）；点成熟畦可收获，收后会自己再长 ——
    const field = new THREE.Group();
    field.position.set(7, 0, 7);
    const bedSpots = [[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1]];
    const beds = [
      { stage: 2, crop: "carrot" }, { stage: 1, crop: "grass" },
      { stage: 2, crop: "grass" }, { stage: 0, crop: null },
    ].map((def, idx) => {
      const g = new THREE.Group();
      g.position.set(bedSpots[idx][0], 0, bedSpots[idx][1]);
      field.add(g);
      return { group: g, stage: def.stage, crop: def.crop, regrowAt: 0, wx: 7 + bedSpots[idx][0], wz: 7 + bedSpots[idx][1] };
    });
    function buildBed(bed) {
      // Three r108 has no Object3D.clear; crop meshes own their geometry only.
      for (const child of bed.group.children.slice()) {
        child.traverse(object => { if (object.geometry) object.geometry.dispose(); });
        bed.group.remove(child);
      }
      bed.group.add(box(1.7, 0.28, 1.7, M.soil, 0, 0.14, 0));
      if (!bed.stage) return;
      const mature = bed.stage === 2;
      for (let k = 0; k < 3; k++) {
        const h = mature ? 0.95 : 0.45;
        const s = new THREE.Mesh(new THREE.ConeGeometry(mature ? 0.22 : 0.15, h, 5),
          bed.crop === "grass" ? M.sprout : (mature ? M.gold : M.sprout));
        s.position.set((k - 1) * 0.42, 0.28 + h / 2, ((k % 2) - 0.5) * 0.45);
        bed.group.add(s);
        if (mature && bed.crop === "carrot") {
          const c = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.42, 5), M.orange);
          c.rotation.x = Math.PI;
          c.position.set((k - 1) * 0.42, 0.32, ((k % 2) - 0.5) * 0.45);
          bed.group.add(c);
        }
      }
    }
    beds.forEach(buildBed);
    root.add(field);

    // —— 鸡蛋篮（竹楼边的小日子）——
    const basket = new THREE.Group();
    basket.position.set(-3.4, 0, 0.5);
    const bk = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.4, 0.45, 8), M.floor);
    bk.position.y = 0.22; basket.add(bk);
    for (let i = 0; i < 3; i++) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.17, 7, 6), M.white);
      e.scale.y = 1.25; e.position.set((i - 1) * 0.26, 0.55, (i % 2 - 0.5) * 0.2);
      basket.add(e);
    }
    root.add(basket);

    // —— 篱笆（半圈，留个口）——
    const fence = new THREE.Group();
    for (let i = 0; i < 9; i++) {
      const a = -0.4 + i * 0.34;
      const x = Math.cos(a) * 13.5, z = Math.sin(a) * 13.5 + 2;
      fence.add(box(0.16, 1.15, 0.16, M.wood, x, 0.57, z));
      if (i < 8) {
        const a2 = -0.4 + (i + 0.5) * 0.34;
        const rail = box(4.4, 0.12, 0.12, M.wood, Math.cos(a2) * 13.5, 0.82, Math.sin(a2) * 13.5 + 2);
        rail.rotation.y = -a2 + Math.PI / 2 + 0.17;
        fence.add(rail);
      }
    }
    root.add(fence);

    // —— 小动物（鸡 ×2、羊、兔）：院里游走 ——
    function buildChicken() {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 7), M.white);
      body.scale.set(1, 0.95, 1.2); body.position.y = 0.62; g.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 7, 6), M.white);
      head.position.set(0, 1.12, 0.5); g.add(head);
      g.add(box(0.2, 0.16, 0.06, M.red, 0, 1.36, 0.5));
      const tail = box(0.4, 0.5, 0.12, M.grey, 0, 0.95, -0.55); tail.rotation.x = -0.6; g.add(tail);
      return g;
    }
    function buildSheep() {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.85, 9, 8), M.wool);
      body.scale.set(1, 0.92, 1.3); body.position.y = 1.15; g.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.38, 8, 7), M.dark);
      head.position.set(0, 1.45, 1.05); g.add(head);
      for (const [lx, lz] of [[-0.4, -0.5], [0.4, -0.5], [-0.4, 0.55], [0.4, 0.55]]) g.add(box(0.16, 0.75, 0.16, M.dark, lx, 0.38, lz));
      return g;
    }
    function buildRabbit() {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 7), M.grey);
      body.scale.set(1, 0.9, 1.25); body.position.y = 0.45; g.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 7), M.grey);
      head.position.set(0, 0.72, 0.42); g.add(head);
      for (const s of [-1, 1]) {
        const ear = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.55, 5), M.grey);
        ear.position.set(0.13 * s, 1.15, 0.36); ear.rotation.z = -0.15 * s; g.add(ear);
      }
      return g;
    }
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const animals = [];
    const animalDefs = [
      { kind: "chicken", build: buildChicken, x: 2, z: 4, speed: 1.6 },
      { kind: "chicken", build: buildChicken, x: -1, z: -2, speed: 1.5 },
      { kind: "sheep", build: buildSheep, x: 4.5, z: -3.5, speed: 0.95 },
      { kind: "rabbit", build: buildRabbit, x: -4, z: 6, speed: 2.2 },
    ];
    for (const def of animalDefs) {
      const obj = def.build();
      obj.position.set(def.x, 0, def.z);
      root.add(obj);
      animals.push({ obj, kind: def.kind, speed: def.speed, tx: def.x, tz: def.z, wait: rnd() * 2, hop: def.kind === "rabbit", petT: 0 });
    }

    // —— 溪流 + 柳树（东边）——
    const stream = new THREE.Group();
    const waters = [];
    for (let i = 0; i < 7; i++) {
      const w = new THREE.Mesh(new THREE.CircleGeometry(7.5 + (i % 3) * 2, 12), M.water.clone());
      w.rotation.x = -Math.PI / 2;
      w.position.set(26 + Math.sin(i * 1.3) * 3.5, 0.04, -26 + i * 10.5);
      w.scale.set(0.72, 1.25, 1);
      stream.add(w); waters.push(w);
      const bank = new THREE.Mesh(new THREE.SphereGeometry(0.7, 6, 5), M.stone);
      bank.position.set(20.5 + Math.sin(i * 1.3) * 3.5, 0.2, -26 + i * 10.5);
      bank.scale.y = 0.55; stream.add(bank);
    }
    root.add(stream);
    const willows = [];
    for (const [wx, wz] of [[21, -18], [30, 2], [22, 20]]) {
      const wil = new THREE.Group();
      wil.position.set(wx, 0, wz);
      const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.6, 3.6, 7), M.trunk);
      tr.position.y = 1.8; tr.rotation.z = 0.12; wil.add(tr);
      const can = new THREE.Mesh(new THREE.SphereGeometry(3.6, 9, 7), M.willow);
      can.position.y = 4.6; can.scale.y = 0.72; wil.add(can);
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2;
        const strand = box(0.14, 2.6, 0.14, M.willow, Math.cos(a) * 2.9, 3.1, Math.sin(a) * 2.9);
        wil.add(strand);
      }
      root.add(wil);
      willows.push(wil);
    }

    // —— 花丛点 + 石板路 ——
    const flowerCols = [0xe88ca0, 0xf2d06b, 0xfbf7ec, 0xb48ce8];
    for (let i = 0; i < 26; i++) {
      const a = rnd() * Math.PI * 2, r = 19 + rnd() * 26;
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.26, 6, 5),
        new THREE.MeshLambertMaterial({ color: flowerCols[i % 4] }));
      f.position.set(Math.cos(a) * r, 0.35, Math.sin(a) * r);
      root.add(f);
    }
    for (let i = 0; i < 5; i++) root.add(box(1.5, 0.09, 1.1, M.stone, -5.5 + i * 1.35, 0.05, 1.8 + i * 0.95));

    // —— 远山 + 林木 ——
    const hillDefs = [
      [-110, -110, 60, 27, M.hill1], [40, -140, 78, 34, M.hill2], [135, -80, 56, 24, M.hill1],
      [-150, 20, 54, 22, M.hill2], [150, 60, 62, 24, M.hill1], [-80, 125, 56, 20, M.hill2], [90, 128, 66, 22, M.hill1],
    ];
    for (const [hx, hz, r, h, mat] of hillDefs) {
      const hill = new THREE.Mesh(new THREE.ConeGeometry(r, h, 9), mat);
      hill.position.set(hx, h / 2 - 1.5, hz);
      root.add(hill);
    }
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.3, 1.7, 5);
    const canGeo = new THREE.ConeGeometry(1.9, 4.6, 6);
    for (let i = 0; i < 60; i++) {
      const a = rnd() * Math.PI * 2, r = 42 + rnd() * 85;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (x > 12 && Math.abs(z) < 40) continue;            // 让开溪流
      const tree = new THREE.Group();
      const tr = new THREE.Mesh(trunkGeo, M.trunk); tr.position.y = 0.85; tree.add(tr);
      const cn = new THREE.Mesh(canGeo, rnd() > 0.4 ? M.leaf : M.leaf2);
      cn.position.y = 3.6; tree.add(cn);
      const s = 0.85 + rnd() * 1.1;
      tree.scale.set(s, s, s);
      tree.position.set(x, 0, z);
      root.add(tree);
    }

    // —— 轨道相机（与庭院场景同一套手感）——
    let azimuth = 0.5, polar = 1.1, radius = 40;
    let idleTime = 0;
    const target = new THREE.Vector3(0, 2.2, 0);
    function applyCamera() {
      const sp = Math.sin(polar);
      camera.position.set(
        target.x + radius * sp * Math.sin(azimuth),
        target.y + radius * Math.cos(polar),
        target.z + radius * sp * Math.cos(azimuth)
      );
      camera.lookAt(target);
    }
    applyCamera();

    const projV = new THREE.Vector3();
    function projectPoint(wx, wy, wz, w, h) {
      camera.updateMatrixWorld();
      projV.set(wx, wy, wz).project(camera);
      if (projV.z < -1 || projV.z > 1) return null;
      return { x: (projV.x * 0.5 + 0.5) * w, y: (0.5 - projV.y * 0.5) * h };
    }

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
        radius = Math.max(18, Math.min(80, radius / scale));
        idleTime = 0;
        applyCamera();
      },
      // 点一点：摸摸动物（喂食）/ 收成熟的菜畦 —— 命中返回 true
      handleTap(x, y, w, h) {
        let bestA = null, bestBed = null, bestD = Infinity;
        for (const a of animals) {
          const p = projectPoint(a.obj.position.x, 0.9, a.obj.position.z, w, h);
          if (!p) continue;
          const d = Math.hypot(p.x - x, p.y - y);
          if (d < 70 && d < bestD) { bestD = d; bestA = a; }
        }
        for (const bed of beds) {
          if (bed.stage !== 2) continue;
          const p = projectPoint(bed.wx, 0.6, bed.wz, w, h);
          if (!p) continue;
          const d = Math.hypot(p.x - x, p.y - y);
          if (d < 58 && d < bestD) {
            bestD = d; bestA = null; bestBed = bed;
          }
        }
        if (bestA) {
          if (!events.onPet || events.onPet(bestA.kind) !== false) bestA.petT = 1;
          return true;
        }
        if (bestBed) {
          // Let the host commit the reward before consuming the crop.
          if (events.onHarvest && events.onHarvest(bestBed.crop) === false) return true;
          bestBed.stage = 0;
          bestBed.regrowAt = 1e9; // update 里按当前时间重设
          buildBed(bestBed);
          return true;
        }
        return false;
      },
      // 调试/测试用：当前可点目标的屏幕坐标
      debugTapPoints(w, h) {
        const out = [];
        for (const a of animals) {
          const p = projectPoint(a.obj.position.x, 0.9, a.obj.position.z, w, h);
          if (p) out.push({ type: "animal", kind: a.kind, x: p.x, y: p.y });
        }
        for (const bed of beds) {
          if (bed.stage !== 2) continue;
          const p = projectPoint(bed.wx, 0.6, bed.wz, w, h);
          if (p) out.push({ type: "bed", crop: bed.crop, x: p.x, y: p.y });
        }
        return out;
      },
      update(dt, t) {
        idleTime += dt;
        if (idleTime > 4) { azimuth += dt * 0.016; applyCamera(); }
        // 动物游走：走到点上就停一停（鸡啄食、兔蹦跳、羊踱步）
        for (const a of animals) {
          a.wait -= dt;
          const dx = a.tx - a.obj.position.x, dz = a.tz - a.obj.position.z;
          const d = Math.hypot(dx, dz);
          if (d < 0.3 && a.wait <= 0) {
            a.tx = (rnd() * 16 - 8);
            a.tz = (rnd() * 14 - 5);
            a.wait = 1 + rnd() * 2.4;
          } else if (d >= 0.3) {
            a.obj.position.x += dx / d * a.speed * dt;
            a.obj.position.z += dz / d * a.speed * dt;
            a.obj.rotation.y = Math.atan2(dx / d, dz / d);
            a.obj.rotation.x = 0;
            a.obj.position.y = a.hop ? Math.abs(Math.sin(t * 9)) * 0.3 : (a.kind === "chicken" ? Math.abs(Math.sin(t * 10)) * 0.04 : 0);
          } else {
            a.obj.rotation.x = a.kind === "chicken" ? Math.max(0, Math.sin(t * 5)) * 0.16 : 0;
            a.obj.position.y = 0;
          }
        }
        // 被摸到的动物开心地弹一下；收过的菜畦过一阵自己再长出来
        for (const a of animals) {
          if (a.petT > 0) {
            a.petT = Math.max(0, a.petT - dt * 1.8);
            const s = 1 + 0.16 * a.petT * Math.sin(a.petT * 9);
            a.obj.scale.set(s, 1 + 0.1 * a.petT, s);
          }
        }
        for (const bed of beds) {
          if (bed.stage === 0 && bed.regrowAt === 1e9) bed.regrowAt = t + (events.cropRegrowthSeconds || 18);
          if (bed.stage === 0 && bed.regrowAt && t >= bed.regrowAt) {
            bed.stage = 2; bed.regrowAt = 0;
            buildBed(bed);
          }
        }
        waters.forEach((w, i) => { w.material.color.setHSL(0.53, 0.36, 0.64 + Math.sin(t * 0.8 + i * 1.7) * 0.03); });
        willows.forEach((w, i) => { w.rotation.z = Math.sin(t * 0.6 + i * 2.1) * 0.012; });
      },
    };
  }

  return { createPastureScene: createPastureScene };
});
