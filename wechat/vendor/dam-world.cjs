// 安和里 · 通用坝世界引擎（第 16 轮）
// 一台引擎跑所有坝：玩家（原始居民）+ 跟随镜头 + 基址地块 + 家园建造视觉 + 坐骑 + 水域碰撞。
// 每坝只提供 spec：{ seed, spawn, hallPos, crystalPos, sites:[{x,z}], waters:[{x,z,r}], bounds:{rx,rz},
//                    decorate(root, M, H) -> animate(dt,t)|null }
// 芒市坝仍用自己的 mangshi-scene.js（同接口鸭子类型），本引擎供瑞丽/盈江/陇川/梁河共用。
(function (global, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./preview-economy.cjs"));
  else global.AnheliDamWorld = factory(global.AnheliPreviewEconomy);
})(typeof self !== "undefined" ? self : this, function (Economy) {
  "use strict";

  const BOND = Economy.BOND;

  function createLandResolver(spec) {
    const bounds = spec.bounds || { rx: 250, rz: 205 };
    const waters = (spec.waters || []).concat(spec.colliders || []);
    const valid = p => Number.isFinite(p?.x) && Number.isFinite(p?.z)
      && Math.hypot(p.x / bounds.rx, p.z / bounds.rz) <= 1 + 1e-9
      && waters.every(w => Math.hypot(p.x - w.x, p.z - w.z) >= w.r - 1e-7);
    function clamp(p) {
      const edge = Math.hypot(p.x / bounds.rx, p.z / bounds.rz);
      if (edge > 1) { p.x /= edge; p.z /= edge; }
    }
    function resolve(x, z, previous = spec.spawn) {
      if (!Number.isFinite(x) || !Number.isFinite(z)) return { ...previous };
      const p = { x, z };
      clamp(p);
      // Overlapping circles can push into one another; bound convergence work.
      for (let pass = 0; pass < 24; pass++) {
        for (const w of waters) {
          let dx = p.x - w.x, dz = p.z - w.z, distance = Math.hypot(dx, dz);
          if (distance >= w.r) continue;
          if (distance < 1e-9) {
            dx = (previous?.x ?? 1) - w.x; dz = (previous?.z ?? 0) - w.z;
            distance = Math.hypot(dx, dz);
            if (distance < 1e-9) { dx = 1; dz = 0; distance = 1; }
          }
          p.x = w.x + dx / distance * (w.r + 1e-6);
          p.z = w.z + dz / distance * (w.r + 1e-6);
        }
        clamp(p);
        if (valid(p)) return p;
      }
      if (valid(previous)) return { x: previous.x, z: previous.z };
      if (valid(spec.spawn)) return { ...spec.spawn };
      for (let step = 0; step < 64; step++) {
        const angle = step / 64 * Math.PI * 2;
        const candidate = { x: bounds.rx * 0.95 * Math.cos(angle), z: bounds.rz * 0.95 * Math.sin(angle) };
        if (valid(candidate)) return candidate;
      }
      throw new Error("World has no valid land position");
    }
    return { resolve, valid };
  }

  function checkCustomPlotSpot(spec, plots, x, z) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return { ok: false, reason: "invalid" };
    const bounds = spec.bounds || { rx: 250, rz: 205 };
    const dx = spec.hallPos.x - x, dz = spec.hallPos.z - z;
    const angle = Math.atan2(dx, dz);
    // Includes the upgraded roof, stairs, field and the original square pad.
    const footprint = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      footprint.push({ x: x + sx * 3.8, z: z + sz * 3.8 });
      for (const reach of [6.2, 5.4]) footprint.push({
        x: x + sx * 4.5 * Math.cos(angle) + sz * reach * Math.sin(angle),
        z: z - sx * 4.5 * Math.sin(angle) + sz * reach * Math.cos(angle),
      });
    }
    if (Math.hypot(x / bounds.rx, z / bounds.rz) > 1 || footprint.some(p => Math.hypot(p.x / bounds.rx, p.z / bounds.rz) > 1)) return { ok: false, reason: "bounds" };
    for (const site of spec.sites) if (Math.hypot(x - site.x, z - site.z) < 16) return { ok: false, reason: "site" };
    if (Math.hypot(x - spec.hallPos.x, z - spec.hallPos.z) < 15) return { ok: false, reason: "hall" };
    if (Math.hypot(x - spec.crystalPos.x, z - spec.crystalPos.z) < 11) return { ok: false, reason: "crystal" };
    const clearance = 8.5;
    for (const circle of spec.waters || []) if (Math.hypot(x - circle.x, z - circle.z) < circle.r + clearance) return { ok: false, reason: "water" };
    for (const circle of spec.colliders || []) if (Math.hypot(x - circle.x, z - circle.z) < circle.r + clearance) return { ok: false, reason: "solid" };
    for (const plot of plots) if (Math.hypot(x - plot.x, z - plot.z) < 12) return { ok: false, reason: "taken" };
    return { ok: true };
  }

  function createSkyEffects(THREE, scene, player) {
    let seed = 41;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const flies = new THREE.Group();
    flies.name = "sky:fireflies";
    // r108 exposes the buffer and legacy geometry constructors separately.
    const BaseGeometry = THREE.IcosahedronBufferGeometry || THREE.IcosahedronGeometry;
    const base = new BaseGeometry(0.15, 0);
    const vertices = base.attributes.position;
    const count = base.index ? base.index.count : vertices.count;
    const positions = new Float32Array(42 * count * 3);
    for (let i = 0; i < 42; i++) {
      const x = (rnd() - 0.5) * 70, y = 0.6 + rnd() * 4.6, z = (rnd() - 0.5) * 70;
      for (let j = 0; j < count; j++) {
        const source = base.index ? base.index.getX(j) : j;
        const offset = (i * count + j) * 3;
        positions[offset] = vertices.getX(source) + x;
        positions[offset + 1] = vertices.getY(source) + y;
        positions[offset + 2] = vertices.getZ(source) + z;
      }
    }
    base.dispose();
    const flyGeometry = new THREE.BufferGeometry();
    (flyGeometry.setAttribute || flyGeometry.addAttribute).call(flyGeometry, "position", new THREE.BufferAttribute(positions, 3));
    flyGeometry.computeBoundingSphere();
    const flyMaterial = new THREE.MeshBasicMaterial({ color: 0xd8f79a, transparent: true, opacity: 0, depthWrite: false });
    flies.add(new THREE.Mesh(flyGeometry, flyMaterial));
    flies.visible = false;
    scene.add(flies);

    const rain = new THREE.Group();
    rain.name = "sky:rain";
    const drops = Array.from({ length: 150 }, () => ({ x: (rnd() - 0.5) * 64, y: rnd() * 26, z: (rnd() - 0.5) * 64, speed: 25 + rnd() * 9 }));
    const rainPositions = new Float32Array(drops.length * 6);
    function fillRainPositions(dt) {
      for (let i = 0; i < drops.length; i++) {
        const drop = drops[i], offset = i * 6;
        drop.y = ((drop.y - drop.speed * dt) % 26 + 26) % 26;
        rainPositions[offset] = drop.x; rainPositions[offset + 1] = drop.y; rainPositions[offset + 2] = drop.z;
        rainPositions[offset + 3] = drop.x + 0.25; rainPositions[offset + 4] = drop.y + 1.3; rainPositions[offset + 5] = drop.z;
      }
    }
    fillRainPositions(0);
    const rainGeometry = new THREE.BufferGeometry();
    (rainGeometry.setAttribute || rainGeometry.addAttribute).call(rainGeometry, "position", new THREE.BufferAttribute(rainPositions, 3));
    rainGeometry.computeBoundingSphere();
    const lines = new THREE.LineSegments(rainGeometry, new THREE.LineBasicMaterial({ color: 0xa9c8dd, transparent: true, opacity: 0.55 }));
    // Falling vertices move beyond their initial bounds; keep this one draw visible.
    lines.frustumCulled = false;
    rain.add(lines);
    rain.visible = false;
    scene.add(rain);
    let night = 0;
    function followPlayer() {
      flies.position.set(player.position.x, 0, player.position.z);
      rain.position.set(player.position.x, 0, player.position.z);
    }
    return {
      setSky(sky) {
        night = Number.isFinite(sky.night) ? Math.max(0, Math.min(1, sky.night)) : 0;
        flies.visible = night > 0.3;
        flyMaterial.opacity = night * 0.6;
        rain.visible = !!sky.rain;
        followPlayer();
      },
      update(dt, t) {
        followPlayer();
        if (flies.visible) {
          flies.rotation.y = t * 0.02;
          flyMaterial.opacity = night * (0.6 + 0.4 * Math.sin(t * 2.3));
        }
        if (rain.visible) {
          fillRainPositions(dt);
          rainGeometry.attributes.position.needsUpdate = true;
        }
      },
    };
  }

  function createFestivalEffects(THREE, scene, player) {
    const BaseGeometry = THREE.IcosahedronBufferGeometry || THREE.IcosahedronGeometry;
    const base = new BaseGeometry(0.09, 0), vertices = base.attributes.position;
    const vertexCount = base.index ? base.index.count : vertices.count;
    const original = new Float32Array(vertexCount * 3);
    for (let j = 0; j < vertexCount; j++) {
      const source = base.index ? base.index.getX(j) : j;
      original[j * 3] = vertices.getX(source); original[j * 3 + 1] = vertices.getY(source); original[j * 3 + 2] = vertices.getZ(source);
    }
    base.dispose();
    const drops = Array.from({ length: 24 }, () => ({ vx: 0, vy: 0, vz: 0 }));
    const positions = new Float32Array(drops.length * original.length);
    const geometry = new THREE.BufferGeometry();
    (geometry.setAttribute || geometry.addAttribute).call(geometry, "position", new THREE.BufferAttribute(positions, 3));
    const splash = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0xbfe0f2, transparent: true, opacity: 0.95, depthWrite: false }));
    splash.name = "festival:player-splash"; splash.frustumCulled = false; splash.visible = false;
    scene.add(splash);
    const lanternGroup = new THREE.Group(); lanternGroup.name = "festival:player-lanterns"; scene.add(lanternGroup);
    const lanternGeometry = new THREE.BoxGeometry(0.36, 0.44, 0.36);
    const lanterns = Array.from({ length: 5 }, (_, index) => {
      const mesh = new THREE.Mesh(lanternGeometry, new THREE.MeshBasicMaterial({ color: 0xffca6a, transparent: true, opacity: 1 }));
      mesh.visible = false; lanternGroup.add(mesh);
      return { mesh, time: -1, seed: index * 1.7 };
    });
    let splashTime = -1;
    function updateSplash() {
      for (let i = 0; i < drops.length; i++) {
        const drop = drops[i], x = drop.vx * splashTime, y = Math.max(0.05, 1.05 + drop.vy * splashTime - 6.5 * splashTime * splashTime), z = drop.vz * splashTime;
        for (let j = 0; j < vertexCount; j++) {
          const offset = i * original.length + j * 3;
          positions[offset] = original[j * 3] + x; positions[offset + 1] = original[j * 3 + 1] + y; positions[offset + 2] = original[j * 3 + 2] + z;
        }
      }
      geometry.attributes.position.needsUpdate = true;
      splash.material.opacity = 0.95 * (1 - splashTime / 0.85);
    }
    return {
      playSplash() {
        splashTime = 0; splash.position.set(player.position.x, 0, player.position.z);
        for (const drop of drops) {
          const angle = player.rotation.y + (Math.random() - 0.5) * 1.15, speed = 3.2 + Math.random() * 3.6;
          drop.vx = Math.sin(angle) * speed; drop.vz = Math.cos(angle) * speed; drop.vy = 4 + Math.random() * 2.6;
        }
        updateSplash(); splash.visible = true;
      },
      releaseLantern() {
        const lantern = lanterns.find(item => item.time < 0) || lanterns.reduce((oldest, item) => item.time > oldest.time ? item : oldest);
        lantern.time = 0; lantern.mesh.position.set(player.position.x + 0.5, 1.2, player.position.z + 0.3);
        lantern.mesh.material.opacity = 1; lantern.mesh.visible = true;
      },
      update(dt) {
        if (splashTime >= 0) {
          splashTime += dt;
          if (splashTime > 0.85) { splashTime = -1; splash.visible = false; }
          else updateSplash();
        }
        for (const lantern of lanterns) {
          if (lantern.time < 0) continue;
          lantern.time += dt;
          if (lantern.time > 6.5) { lantern.time = -1; lantern.mesh.visible = false; continue; }
          lantern.mesh.position.y = 1.2 + lantern.time * 0.85;
          lantern.mesh.position.x += Math.sin(lantern.time * 1.3 + lantern.seed) * dt * 0.35;
          lantern.mesh.material.opacity = lantern.time > 5 ? Math.max(0, 1 - (lantern.time - 5) / 1.5) : 1;
        }
      },
    };
  }

  function createHomeProps(THREE, M, box) {
    const stall = new THREE.Group();
    stall.name = "market:stall";
    stall.add(box(2.6, 0.14, 1.2, M.wood, 0, 0.78, 0));
    for (const [x, z] of [[-1.15, -0.45], [1.15, -0.45], [-1.15, 0.45], [1.15, 0.45]]) stall.add(box(0.12, 0.78, 0.12, M.woodDark, x, 0.39, z));
    stall.add(box(2.8, 0.07, 1.4, M.saddle, 0, 0.88, 0));
    stall.add(box(0.09, 2.1, 0.09, M.woodDark, -1.3, 1.05, -0.55));
    stall.add(box(0.09, 2.1, 0.09, M.woodDark, 1.3, 1.05, -0.55));
    const canopy = box(3, 0.06, 1.7, M.hemp || M.tunic, 0, 2.12, -0.2);
    canopy.rotation.x = 0.16; stall.add(canopy);
    const produceMaterial = new THREE.MeshLambertMaterial({ color: 0xe08a3c });
    for (const [radius, material, x, y, z] of [[0.2, produceMaterial, -0.7, 1.05, 0.1], [0.22, M.cream, 0.1, 1.06, -0.05], [0.19, M.woodDark, 0.8, 1.04, 0.12]]) {
      const item = new THREE.Mesh(new THREE.SphereGeometry(radius, 8, 6), material);
      item.position.set(x, y, z); stall.add(item);
    }
    stall.visible = false;
    const basket = new THREE.Group();
    basket.name = "home:harvest-basket";
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.42, 0.62, 9), new THREE.MeshLambertMaterial({ color: 0xa9834f }));
    body.position.y = 0.31; basket.add(body);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.06, 6, 12), M.woodDark);
    rim.rotation.x = Math.PI / 2; rim.position.y = 0.62; basket.add(rim);
    for (const [radius, material, x, y, z] of [[0.17, M.cream, -0.18, 0.72, 0.05], [0.16, produceMaterial, 0.16, 0.71, -0.1], [0.15, M.woodDark, 0.02, 0.74, 0.2]]) {
      const item = new THREE.Mesh(new THREE.SphereGeometry(radius, 8, 6), material);
      item.position.set(x, y, z); basket.add(item);
    }
    basket.visible = false;
    return { stall, basket };
  }

  function createDamScene(THREE, spec) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xc2dbee);
    scene.fog = new THREE.Fog(0xd6e5ee, 170, 430);
    const camera = new THREE.PerspectiveCamera(46, 16 / 9, 0.1, 900);
    const hemi = new THREE.HemisphereLight(0xd8ecff, 0x8a9a6a, 0.95);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffe3b3, 0.9);
    sun.position.set(55, 105, -35);
    scene.add(sun);

    const M = {
      meadow: new THREE.MeshLambertMaterial({ color: 0xaac982 }),
      meadow2: new THREE.MeshLambertMaterial({ color: 0x9dbc72 }),
      tea: new THREE.MeshLambertMaterial({ color: 0x6f9a52 }),
      earth: new THREE.MeshLambertMaterial({ color: 0xcdbb92 }),
      road: new THREE.MeshLambertMaterial({ color: 0xd8c49a }),
      stone: new THREE.MeshLambertMaterial({ color: 0xb9b0a0 }),
      stoneD: new THREE.MeshLambertMaterial({ color: 0x9a917f }),
      cream: new THREE.MeshLambertMaterial({ color: 0xf0e6cc }),
      wood: new THREE.MeshLambertMaterial({ color: 0x8a6844 }),
      woodDark: new THREE.MeshLambertMaterial({ color: 0x6b4e30 }),
      bamboo: new THREE.MeshLambertMaterial({ color: 0xc2a165 }),
      roof: new THREE.MeshLambertMaterial({ color: 0x9c7a4a }),
      roofD: new THREE.MeshLambertMaterial({ color: 0x5f4a3a }),
      gold: new THREE.MeshLambertMaterial({ color: 0xd9a441 }),
      red: new THREE.MeshLambertMaterial({ color: 0xb44a38 }),
      trunk: new THREE.MeshLambertMaterial({ color: 0x7a5f3d }),
      leaf: new THREE.MeshLambertMaterial({ color: 0x5f8f4e }),
      leaf2: new THREE.MeshLambertMaterial({ color: 0x74a75e }),
      water: new THREE.MeshLambertMaterial({ color: 0x7fb6c9 }),
      steam: new THREE.MeshLambertMaterial({ color: 0xf4f9fa, transparent: true, opacity: 0.38, depthWrite: false }),
      hill1: new THREE.MeshLambertMaterial({ color: 0x87ab72 }),
      hill2: new THREE.MeshLambertMaterial({ color: 0x74975f }),
      hill3: new THREE.MeshLambertMaterial({ color: 0x9dbb8a }),
      plot: new THREE.MeshLambertMaterial({ color: 0xdcc9a0 }),
      warm: new THREE.MeshLambertMaterial({ color: 0xb98d5f }),
      crystal: new THREE.MeshLambertMaterial({ color: 0x9a6ee8 }),
      skin: new THREE.MeshLambertMaterial({ color: 0xd9a37e }),
      tunic: new THREE.MeshLambertMaterial({ color: 0xc9b18a }),
      dark: new THREE.MeshLambertMaterial({ color: 0x3a3128 }),
      horse: new THREE.MeshLambertMaterial({ color: 0x8a5f3d }),
      horse2: new THREE.MeshLambertMaterial({ color: 0x6e4e30 }),
      saddle: new THREE.MeshLambertMaterial({ color: 0xa83f32 }),
      wool: new THREE.MeshLambertMaterial({ color: 0xf2ead8 }),
      soil: new THREE.MeshLambertMaterial({ color: 0x8a6a48 }),
      sprout: new THREE.MeshLambertMaterial({ color: 0x86b95e }),
      orange: new THREE.MeshLambertMaterial({ color: 0xe08b3a }),
      pink: new THREE.MeshLambertMaterial({ color: 0xd98a94 }),
      cloud: new THREE.MeshLambertMaterial({ color: 0xf7fafc }),
    };
    const box = (w, h, d, mat, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      return m;
    };
    const root = new THREE.Group();
    scene.add(root);
    function removeOwnedGeometry(parent, group) {
      if (!group) return;
      const geometries = new Set();
      group.traverse(object => { if (object.geometry) geometries.add(object.geometry); });
      geometries.forEach(geometry => geometry.dispose());
      parent.remove(group);
    }
    let seed = spec.seed || 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const H = {
      box,
      rnd,
      disc(mat, r, x, z, y) {
        const m = new THREE.Mesh(new THREE.CircleGeometry(r, 20), mat);
        m.rotation.x = -Math.PI / 2;
        m.position.set(x, y || 0.03, z);
        return m;
      },
    };

    // —— 本坝的静态世界（地貌/江河/地标/集市/大厅由各坝 decorate 画）——
    const decoration = spec.decorate(root, M, H);
    const animate = typeof decoration === "function" ? decoration : decoration?.animate || null;
    const colliders = (spec.colliders || []).concat(decoration?.colliders || []);
    const festivalGroups = decoration?.festivalGroups || {};
    for (const [id, group] of Object.entries(festivalGroups)) {
      group.name = "festival:" + id;
      group.visible = false;
    }

    // —— 传送水晶（引擎统一，经 spec.crystalPos 落位）——
    const crystal = new THREE.Mesh(new THREE.ConeGeometry(1.15, 3.6, 6), M.crystal);
    crystal.name = "travel:crystal";
    crystal.material.color.set(0x8a8f96);
    crystal.position.set(spec.crystalPos.x, 3.4, spec.crystalPos.z);
    root.add(crystal);
    root.add(box(1.6, 0.5, 1.6, M.stoneD, spec.crystalPos.x, 0.25, spec.crystalPos.z));

    // —— 基址地块（引擎统一：中心圆台 + 8 块环地）——
    const plotList = [];
    spec.sites.forEach((site, si) => {
      const g = new THREE.Group();
      g.position.set(site.x, 0, site.z);
      const c = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.4, 0.3, 10), M.stone);
      c.position.y = 0.15;
      g.add(c);
      root.add(g);
      for (let idx = 0; idx < 8; idx++) {
        const a = idx / 8 * Math.PI * 2;
        const px = site.x + Math.cos(a) * 11.5;
        const pz = site.z + Math.sin(a) * 11.5;
        const mesh = box(7.6, 0.22, 7.6, M.plot, px, 0.11, pz);
        root.add(mesh);
        plotList.push({
          site: si, idx, x: px, z: pz, mesh,
          claimed: false, hut: false, hutGroup: null,
          fieldGroup: null, fieldSprouts: null, fieldStage: 0, house: 0, animals: [],
          face: Math.atan2(site.x - px, site.z - pz),
          dirX: (site.x - px) / 11.5, dirZ: (site.z - pz) / 11.5,
        });
      }
    });
    function findPlot(site, idx) { return plotList.find(p => p.site === site && p.idx === idx); }
    function claimCustomPlot(x, z) {
      const existing = findPlot(-1, -1);
      if (existing) return existing.x === x && existing.z === z ? { site: -1, idx: -1, x, z, claimed: true } : null;
      if (!checkCustomPlotSpot({ ...spec, colliders }, plotList, x, z).ok) return null;
      const mesh = box(7.6, 0.22, 7.6, M.plot, x, 0.11, z);
      const dx = spec.hallPos.x - x, dz = spec.hallPos.z - z, distance = Math.hypot(dx, dz) || 1;
      const plot = { site: -1, idx: -1, x, z, mesh, claimed: false, hut: false, house: 0, hutGroup: null,
        fieldGroup: null, fieldSprouts: null, fieldStage: 0, animals: [], face: Math.atan2(dx, dz), dirX: dx / distance, dirZ: dz / distance };
      root.add(mesh); plotList.push(plot); markClaimedVisual(plot);
      return { site: -1, idx: -1, x, z, claimed: true };
    }

    function markClaimedVisual(plot) {
      plot.claimed = true;
      plot.mesh.material = M.warm;
      const f = new THREE.Group();
      f.position.set(plot.x - plot.dirX * 1.7, 0, plot.z - plot.dirZ * 1.7);
      f.rotation.y = plot.face;
      f.add(box(5.9, 0.35, 5.9, M.wood, 0, 0.35, 0));
      f.add(box(0.28, 2.2, 0.28, M.woodDark, 3.2, 1.3, 3.2));
      f.add(box(1.5, 0.9, 0.12, M.cream, 3.2, 2.2, 3.2));
      root.add(f);
    }
    function buildHutVisual(plot) {
      plot.hut = true; plot.house = 1;
      const g = new THREE.Group();
      g.position.set(plot.x - plot.dirX * 1.7, 0, plot.z - plot.dirZ * 1.7);
      g.rotation.y = plot.face;
      const y0 = 0.52;
      g.add(box(5.6, 2.5, 0.28, M.tunic, 0, y0 + 1.25, -2.66));
      g.add(box(0.28, 2.5, 5.6, M.tunic, -2.66, y0 + 1.25, 0));
      g.add(box(0.28, 2.5, 5.6, M.tunic, 2.66, y0 + 1.25, 0));
      g.add(box(5.6, 0.85, 0.28, M.tunic, 0, y0 + 2.1, 2.66));
      const roofL = box(3.6, 0.16, 6.6, M.roof, 0, y0 + 3.35, -1.5); roofL.rotation.x = 0.5; g.add(roofL);
      const roofR = box(3.6, 0.16, 6.6, M.roof, 0, y0 + 3.35, 1.5); roofR.rotation.x = -0.5; g.add(roofR);
      g.add(box(0.35, 0.3, 6.9, M.woodDark, 0, y0 + 4.06, 0));
      root.add(g);
      plot.hutGroup = g;
    }
    function buildBambooVisual(plot) {
      plot.hut = true; plot.house = 2;
      const g = new THREE.Group();
      g.position.set(plot.x - plot.dirX * 1.7, 0, plot.z - plot.dirZ * 1.7);
      g.rotation.y = plot.face;
      for (const [px, pz] of [[-2.3, -2.3], [2.3, -2.3], [-2.3, 2.3], [2.3, 2.3], [-2.3, 0], [2.3, 0]]) {
        g.add(box(0.3, 2.1, 0.3, M.bamboo, px, 1.05, pz));
      }
      g.add(box(5.6, 0.3, 5.6, M.bamboo, 0, 2.15, 0));
      const wy = 3.35;
      g.add(box(5.3, 2.3, 0.24, M.bamboo, 0, wy, -2.5));
      g.add(box(0.24, 2.3, 5.3, M.bamboo, -2.5, wy, 0));
      g.add(box(0.24, 2.3, 5.3, M.bamboo, 2.5, wy, 0));
      g.add(box(1.7, 2.3, 0.24, M.bamboo, -1.75, wy, 2.5));
      g.add(box(1.7, 2.3, 0.24, M.bamboo, 1.75, wy, 2.5));
      const rL = box(3.9, 0.16, 7.2, M.roof, 0, 5.15, -1.62); rL.rotation.x = 0.52; g.add(rL);
      const rR = box(3.9, 0.16, 7.2, M.roof, 0, 5.15, 1.62); rR.rotation.x = -0.52; g.add(rR);
      g.add(box(0.4, 0.32, 7.5, M.woodDark, 0, 5.95, 0));
      for (let s = 0; s < 4; s++) g.add(box(1.5, 0.14, 0.5, M.bamboo, 0, 0.45 + s * 0.48, 3.6 - s * 0.42));
      g.add(box(0.18, 1.1, 0.18, M.bamboo, -1.9, 2.75, 3.1));
      g.add(box(0.18, 1.1, 0.18, M.bamboo, 1.9, 2.75, 3.1));
      g.add(box(4, 0.16, 0.16, M.bamboo, 0, 3.3, 3.1));
      root.add(g);
      plot.hutGroup = g;
    }
    function setFieldStageVisual(plot, stage) {
      if (!plot.fieldGroup || ![0, 1, 2].includes(stage) || stage === plot.fieldStage) return;
      if (plot.fieldSprouts) { removeOwnedGeometry(plot.fieldGroup, plot.fieldSprouts); plot.fieldSprouts = null; }
      plot.fieldStage = stage;
      if (stage === 0) return;
      const sg = new THREE.Group();
      const mature = stage === 2;
      for (const [bx, bz] of [[-0.82, -0.82], [0.82, -0.82], [-0.82, 0.82], [0.82, 0.82]]) {
        for (const [ox, oz] of [[-0.35, -0.3], [0.3, 0.35], [0.05, -0.45]]) {
          const cone = new THREE.Mesh(new THREE.ConeGeometry(mature ? 0.21 : 0.13, mature ? 0.62 : 0.34, 5), mature ? M.orange : M.sprout);
          cone.position.set(bx + ox, mature ? 0.55 : 0.42, bz + oz);
          sg.add(cone);
          if (mature) {
            const top = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 5), M.sprout);
            top.position.set(bx + ox, 0.92, bz + oz);
            sg.add(top);
          }
        }
      }
      plot.fieldGroup.add(sg);
      plot.fieldSprouts = sg;
    }
    function openFieldVisual(plot, stage) {
      const g = new THREE.Group();
      g.position.set(plot.x + plot.dirX * 2.6, 0, plot.z + plot.dirZ * 2.6);
      g.rotation.y = plot.face;
      for (const [bx, bz] of [[-0.82, -0.82], [0.82, -0.82], [-0.82, 0.82], [0.82, 0.82]]) {
        g.add(box(1.5, 0.26, 1.5, M.soil, bx, 0.13, bz));
      }
      root.add(g);
      plot.fieldGroup = g;
      setFieldStageVisual(plot, stage || 0);
    }
    function miniChicken() {
      const g = new THREE.Group();
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 6), M.wool);
      b.position.y = 0.42; b.scale.set(1, 0.9, 1.2); g.add(b);
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.17, 7, 6), M.wool);
      h.position.set(0, 0.72, 0.34); g.add(h);
      const beak = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 4), M.orange);
      beak.position.set(0, 0.7, 0.55); beak.rotation.x = 1.4; g.add(beak);
      const comb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), M.pink);
      comb.position.set(0, 0.88, 0.32); g.add(comb);
      return g;
    }
    function miniSheep() {
      const g = new THREE.Group();
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.62, 9, 7), M.wool);
      b.position.y = 0.78; b.scale.set(1, 0.85, 1.25); g.add(b);
      const h = box(0.34, 0.4, 0.5, M.dark, 0, 0.95, 0.78); g.add(h);
      for (const [lx, lz] of [[-0.3, 0.4], [0.3, 0.4], [-0.3, -0.45], [0.3, -0.45]]) g.add(box(0.13, 0.55, 0.13, M.dark, lx, 0.27, lz));
      return g;
    }
    function miniRabbit() {
      const g = new THREE.Group();
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), M.wool);
      b.position.y = 0.3; b.scale.set(1, 0.9, 1.25); g.add(b);
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.19, 7, 6), M.wool);
      h.position.set(0, 0.55, 0.3); g.add(h);
      for (const s of [-1, 1]) {
        const ear = box(0.08, 0.42, 0.05, M.wool, 0.09 * s, 0.85, 0.28);
        ear.rotation.x = -0.15; g.add(ear);
      }
      return g;
    }
    function addAnimalVisual(plot, kind) {
      const g = kind === "chicken" ? miniChicken() : kind === "sheep" ? miniSheep() : miniRabbit();
      const a = rnd() * Math.PI * 2;
      g.position.set(plot.x + Math.cos(a) * 2.4, 0, plot.z + Math.sin(a) * 2.4);
      root.add(g);
      plot.animals.push({
        g, kind, cx: plot.x, cz: plot.z,
        tx: g.position.x, tz: g.position.z,
        wait: 1 + rnd() * 3, phase: rnd() * 6,
      });
    }

    // —— 玩家：原始居民 ——
    const player = new THREE.Group();
    player.name = "player";
    const pBody = box(0.78, 1.05, 0.46, M.tunic, 0, 1.28, 0); player.add(pBody);
    player.add(box(0.84, 0.55, 0.5, M.horse2, 0, 0.62, 0));
    const pHead = new THREE.Mesh(new THREE.SphereGeometry(0.31, 10, 8), M.skin);
    pHead.position.y = 2.05; player.add(pHead);
    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.16, 7, 6), M.dark);
    bun.position.set(0, 2.32, -0.06); player.add(bun);
    player.add(box(0.5, 0.62, 0.2, M.bamboo, 0, 1.42, -0.36));
    function limb(mat, x, y, w, h) {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, 0);
      pivot.add(box(w, h, w, mat, 0, -h / 2 + 0.06, 0));
      player.add(pivot);
      return pivot;
    }
    const armL = limb(M.skin, -0.52, 1.72, 0.17, 0.82);
    const armR = limb(M.skin, 0.52, 1.72, 0.17, 0.82);
    const legL = limb(M.skin, -0.2, 0.92, 0.19, 0.9);
    const legR = limb(M.skin, 0.2, 0.92, 0.19, 0.9);
    player.position.set(spec.spawn.x, 0, spec.spawn.z);
    root.add(player);

    // —— 坐骑（本坝的马，领养后由宿主 showHorse）——
    const horse = new THREE.Group();
    const hBody = new THREE.Mesh(new THREE.SphereGeometry(0.85, 10, 8), M.horse);
    hBody.scale.set(0.82, 0.78, 1.5); hBody.position.y = 1.62; horse.add(hBody);
    const hNeck = box(0.42, 1.05, 0.55, M.horse, 0, 2.15, 1.15); hNeck.rotation.x = -0.6; horse.add(hNeck);
    const hHead = box(0.4, 0.45, 0.85, M.horse, 0, 2.62, 1.62); hHead.rotation.x = 0.35; horse.add(hHead);
    horse.add(box(0.44, 0.55, 0.14, M.woodDark, 0, 2.5, 0.92));
    for (const s of [-1, 1]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.3, 4), M.horse); ear.position.set(0.14 * s, 2.92, 1.38); horse.add(ear); }
    const hTail = box(0.16, 1.0, 0.16, M.woodDark, 0, 1.7, -1.32); hTail.rotation.x = 0.4; horse.add(hTail);
    horse.add(box(0.95, 0.18, 0.95, M.saddle, 0, 2.12, -0.1));
    const hLegs = [];
    for (const [lx, lz] of [[-0.38, 0.72], [0.38, 0.72], [-0.38, -0.78], [0.38, -0.78]]) {
      const pivot = new THREE.Group();
      pivot.position.set(lx, 1.25, lz);
      pivot.add(box(0.17, 1.25, 0.17, M.horse, 0, -0.62, 0));
      horse.add(pivot);
      hLegs.push(pivot);
    }
    horse.visible = false;
    root.add(horse);
    const { stall, basket: harvestBasket } = createHomeProps(THREE, M, box);
    root.add(stall, harvestBasket);
    let resting = false, restBlend = 0;
    const restAnchor = { x: 0, z: 0 };
    let horseShown = false, mounted = false;
    let bondLevel = 0, careT = 0, followPhase = 0;

    // —— 跟随镜头 ——
    let yaw = 0, polar = 1.06, radius = 17;
    const camPos = new THREE.Vector3();
    function applyCamera(k) {
      const tx = player.position.x, ty = player.position.y + 1.7, tz = player.position.z;
      const sp = Math.sin(polar);
      const cameraRadius = radius * (1 - 0.22 * restBlend);
      const dx = tx + cameraRadius * sp * Math.sin(yaw);
      const dy = ty + cameraRadius * Math.cos(polar);
      const dz = tz + cameraRadius * sp * Math.cos(yaw);
      if (k === 0 || camPos.lengthSq() === 0) camPos.set(dx, dy, dz);
      else camPos.x += (dx - camPos.x) * k, camPos.y += (dy - camPos.y) * k, camPos.z += (dz - camPos.z) * k;
      camera.position.copy(camPos);
      camera.lookAt(tx, ty, tz);
    }
    applyCamera(0);

    const moveIn = { x: 0, z: 0 };
    let walkPhase = 0, moving = false;
    const land = createLandResolver({ ...spec, colliders });
    const skyEffects = createSkyEffects(THREE, scene, player);
    const festivalEffects = createFestivalEffects(THREE, scene, player);
    let dancing = false, danceAngle = 0, danceAcc = 0, danceDone = false;
    function stopDance() {
      dancing = false; danceDone = false; danceAcc = 0;
      if (!mounted) player.position.y = 0;
      armL.rotation.x = 0; armR.rotation.x = 0; legL.rotation.x = 0; legR.rotation.x = 0;
    }

    return {
      scene,
      camera,
      setCrystalLit(value) { crystal.material.color.set(value ? 0x9a6ee8 : 0x8a8f96); },
      setSky(sky) {
        scene.background.set(sky.bg);
        if (scene.fog) scene.fog.color.set(sky.fog);
        hemi.intensity = sky.hemi;
        sun.intensity = sky.sun;
        sun.color.set(sky.sunColor);
        skyEffects.setSky(sky);
      },
      resize(w, h) { camera.aspect = w / h; camera.updateProjectionMatrix(); },
      handleDrag(dx, dy) {
        if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
        yaw -= dx * 0.0052;
        polar = Math.max(0.62, Math.min(1.38, polar - dy * 0.004));
        applyCamera(0);
      },
      handlePinch(scale) {
        if (!Number.isFinite(scale) || scale <= 0) return;
        radius = Math.max(9, Math.min(58, radius / scale));
        applyCamera(0);
      },
      update(dt, t) {
        if (!Number.isFinite(dt) || dt < 0 || !Number.isFinite(t)) return;
        if (animate) animate(dt, t);
        crystal.position.y = 3.4 + Math.sin(t * 1.1) * 0.35;
        crystal.rotation.y = t * 0.7;
        for (const plot of plotList) {
          for (const a of plot.animals) {
            a.wait -= dt;
            const dx = a.tx - a.g.position.x, dz = a.tz - a.g.position.z;
            const d = Math.hypot(dx, dz);
            if (a.wait <= 0) {
              if (d < 0.4) {
                const ang = rnd() * Math.PI * 2, rr = 1 + rnd() * 3.2;
                a.tx = a.cx + Math.cos(ang) * rr;
                a.tz = a.cz + Math.sin(ang) * rr;
                a.wait = 1.5 + rnd() * 3.5;
              } else {
                const sp = a.kind === "rabbit" ? 2.6 : 1.1;
                a.g.position.x += dx / d * sp * dt;
                a.g.position.z += dz / d * sp * dt;
                a.g.rotation.y = Math.atan2(dx, dz);
                a.wait = 0.1;
              }
            }
            if (a.kind === "rabbit" && d >= 0.4 && a.wait <= 0.1) a.g.position.y = Math.abs(Math.sin(t * 9 + a.phase)) * 0.3;
            else if (a.kind === "chicken") a.g.rotation.x = Math.max(0, Math.sin(t * 2.2 + a.phase)) * 0.28;
            else a.g.position.y = 0;
          }
        }
        const mag = Math.hypot(moveIn.x, moveIn.z);
        moving = mag > 0.12;
        if (dancing && (moving || mounted)) stopDance();
        if (dancing) {
          const step = Math.min(dt * 0.3, Math.PI * 2 - danceAcc);
          danceAngle += step; danceAcc += step;
          const position = land.resolve(spec.dance.x + Math.cos(danceAngle) * spec.dance.r, spec.dance.z + Math.sin(danceAngle) * spec.dance.r, player.position);
          player.position.x = position.x; player.position.z = position.z;
          player.position.y = Math.abs(Math.sin(t * 7)) * 0.16;
          player.rotation.y = Math.atan2(-Math.sin(danceAngle), Math.cos(danceAngle));
          if (danceAcc >= Math.PI * 2) { stopDance(); danceDone = true; }
        }
        const mover = mounted ? horse : player;
        if (moving) {
          const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
          const rx = -fz, rz = fx;
          const mx = fx * moveIn.z + rx * moveIn.x;
          const mz = fz * moveIn.z + rz * moveIn.x;
          const mm = Math.hypot(mx, mz) || 1;
          const sp = (mounted ? BOND.BASE_SPEED + bondLevel * BOND.SPEED_PER_BOND : 13) * Math.min(1, mag);
          const next = land.resolve(mover.position.x + mx / mm * sp * dt, mover.position.z + mz / mm * sp * dt, mover.position);
          mover.position.x = next.x; mover.position.z = next.z;
          mover.rotation.y = Math.atan2(mx, mz);
          walkPhase += dt * (mounted ? 13 : 9.5);
        }
        if (mounted) {
          player.position.set(horse.position.x, 1.52, horse.position.z);
          player.rotation.y = horse.rotation.y;
          const trot = moving ? Math.sin(walkPhase) * 0.5 : 0;
          hLegs[0].rotation.x = trot; hLegs[3].rotation.x = trot;
          hLegs[1].rotation.x = -trot; hLegs[2].rotation.x = -trot;
          legL.rotation.x = -0.55; legR.rotation.x = -0.55;
          armL.rotation.x = -0.45; armR.rotation.x = -0.45;
        } else {
          const sw = moving ? Math.sin(walkPhase) * 0.55 : dancing ? Math.sin(t * 7) * 0.5 : 0;
          armL.rotation.x = sw; armR.rotation.x = -sw;
          legL.rotation.x = -sw * 0.8; legR.rotation.x = sw * 0.8;
          if (horseShown) {
            hTail.rotation.z = Math.sin(t * 1.3) * 0.18;
            if (careT > 0) {
              careT = Math.max(0, careT - dt);
              const care = Math.sin((1 - careT) * Math.PI);
              hHead.position.y = 2.62 - care * 0.38;
              hNeck.rotation.x = -0.6 - care * 0.25;
            }
            const dx = player.position.x - horse.position.x, dz = player.position.z - horse.position.z;
            const distance = Math.hypot(dx, dz);
            if (bondLevel >= BOND.FOLLOW_AT && distance > 15) {
              const step = Math.min(distance - 15, (distance > 45 ? 19 : 10.5) * dt);
              const next = land.resolve(horse.position.x + dx / distance * step, horse.position.z + dz / distance * step, horse.position);
              horse.position.x = next.x; horse.position.z = next.z;
              horse.rotation.y = Math.atan2(dx, dz); followPhase += dt * 9;
              const trot = Math.sin(followPhase) * 0.4;
              hLegs[0].rotation.x = trot; hLegs[3].rotation.x = trot;
              hLegs[1].rotation.x = -trot; hLegs[2].rotation.x = -trot;
            } else hLegs.forEach(leg => { leg.rotation.x = 0; });
          }
        }
        if (stall.visible && Math.hypot(player.position.x - stall.position.x, player.position.z - stall.position.z) > 14) stall.visible = false;
        if (resting && (moving || Math.hypot(player.position.x - restAnchor.x, player.position.z - restAnchor.z) > 0.9)) resting = false;
        restBlend += ((resting ? 1 : 0) - restBlend) * Math.min(1, dt * 5);
        if (!resting && restBlend < 0.02) restBlend = 0;
        if (!mounted && !dancing) {
          player.position.y = restBlend ? -0.42 * restBlend : 0;
          pBody.rotation.x = 0.1 * restBlend;
          if (restBlend > 0.01) { legL.rotation.x = -1.35 * restBlend; legR.rotation.x = -1.35 * restBlend; }
        }
        pBody.scale.y = moving ? 1 : 1 + Math.sin(t * 1.6) * 0.012;
        skyEffects.update(dt, t);
        festivalEffects.update(dt);
        applyCamera(Math.min(1, dt * 5));
      },
      setMoveInput(x, z) {
        moveIn.x = Number.isFinite(x) ? x : 0; moveIn.z = Number.isFinite(z) ? z : 0;
        if (Math.hypot(moveIn.x, moveIn.z) > 0.12) { resting = false; if (dancing) stopDance(); }
      },
      getPlayerPos: () => mounted
        ? { x: horse.position.x, z: horse.position.z }
        : { x: player.position.x, z: player.position.z },
      showHorse(x, z) {
        if (!Number.isFinite(x) || !Number.isFinite(z)) return;
        horseShown = true; horse.visible = true;
        if (!mounted) { const p = land.resolve(x, z, horse.position); horse.position.set(p.x, 0, p.z); }
      },
      hideHorse() {
        stopDance();
        resting = false; restBlend = 0; pBody.rotation.x = 0;
        player.position.y = 0;
        if (mounted) {
          const p = land.resolve(horse.position.x + 2.2, horse.position.z + 0.6, horse.position);
          player.position.set(p.x, 0, p.z);
        }
        horseShown = false; mounted = false; horse.visible = false; careT = 0;
        moveIn.x = 0; moveIn.z = 0; applyCamera(0);
      },
      showStall(x, z, rotY = 0) {
        if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(rotY)) return false;
        stall.position.set(x, 0, z); stall.rotation.y = rotY; stall.visible = true;
        return true;
      },
      showHarvestBasket(site, idx) {
        const plot = findPlot(site, idx);
        if (!plot || !plot.claimed || !plot.hut) return false;
        harvestBasket.position.set(plot.x + plot.dirX * 3.1 - plot.dirZ * 1.7, 0, plot.z + plot.dirZ * 3.1 + plot.dirX * 1.7);
        harvestBasket.visible = true;
        return true;
      },
      hideHarvestBasket() { harvestBasket.visible = false; },
      setResting(value) {
        if (value && mounted) return false;
        if (value) stopDance();
        resting = !!value;
        if (resting) { restAnchor.x = player.position.x; restAnchor.z = player.position.z; moveIn.x = 0; moveIn.z = 0; }
        return true;
      },
      isResting: () => resting,
      playSplash: festivalEffects.playSplash,
      releaseLantern: festivalEffects.releaseLantern,
      joinDance() {
        if (!spec.dance || mounted) return false;
        if (dancing) return true;
        resting = false; restBlend = 0; pBody.rotation.x = 0;
        moveIn.x = 0; moveIn.z = 0; dancing = true; danceAcc = 0; danceDone = false;
        danceAngle = Math.atan2(player.position.z - spec.dance.z, player.position.x - spec.dance.x);
        return true;
      },
      stopDance,
      isDancing: () => dancing,
      consumeDanceDone() { const done = danceDone; danceDone = false; return done; },
      setHorseBond(value) { bondLevel = Number.isFinite(value) ? Math.max(0, Math.min(BOND.MAX, value)) : 0; },
      horseCare() { if (horseShown) careT = 1; },
      claimCustomPlot,
      checkPlotSpot(x, z) { return checkCustomPlotSpot({ ...spec, colliders }, plotList, x, z); },
      setMounted(b) {
        if (!horseShown || mounted === !!b) return;
        stopDance();
        resting = false; restBlend = 0; pBody.rotation.x = 0;
        mounted = !!b; moveIn.x = 0; moveIn.z = 0;
        if (mounted) {
          player.position.set(horse.position.x, 1.52, horse.position.z);
          player.rotation.y = horse.rotation.y;
        } else {
          const p = land.resolve(horse.position.x + 2.2, horse.position.z + 0.6, horse.position);
          player.position.set(p.x, 0, p.z);
          hLegs.forEach(leg => { leg.rotation.x = 0; });
        }
        applyCamera(0);
      },
      isMounted: () => mounted,
      getHorsePos: () => horseShown ? { x: horse.position.x, z: horse.position.z } : null,
      debugSetHorse(x, z) { if (Number.isFinite(x) && Number.isFinite(z)) horse.position.set(x, 0, z); },
      getPlots: () => plotList.map(p => ({ site: p.site, idx: p.idx, x: p.x, z: p.z, claimed: p.claimed, hut: p.hut,
        house: p.house, field: !!p.fieldGroup, fieldStage: p.fieldStage,
        animals: { chicken: p.animals.filter(a => a.kind === "chicken").length, sheep: p.animals.filter(a => a.kind === "sheep").length, rabbit: p.animals.filter(a => a.kind === "rabbit").length } })),
      getSites: () => spec.sites.map(s => ({ x: s.x, z: s.z })),
      getHallPos: () => ({ ...spec.hallPos }),
      getCrystalPos: () => ({ ...spec.crystalPos }),
      getSpawn: () => ({ ...spec.spawn }),
      resolveLandPosition(x, z) {
        if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
        return land.resolve(x, z, player.position);
      },
      getSpec: () => ({ bounds: { ...spec.bounds }, waters: (spec.waters || []).map(w => ({ ...w })), colliders: colliders.map(w => ({ ...w })), spawn: { ...spec.spawn } }),
      setFestivalVisible(id) {
        for (const [key, group] of Object.entries(festivalGroups)) group.visible = key === id;
      },
      nearestInteractable() {
        if (horseShown && !mounted && Math.hypot(player.position.x - horse.position.x, player.position.z - horse.position.z) < 6.5) return { type: "horse" };
        if (Math.hypot(player.position.x - spec.crystalPos.x, player.position.z - spec.crystalPos.z) < 9.5) return { type: "crystal" };
        if (Math.hypot(player.position.x - spec.hallPos.x, player.position.z - spec.hallPos.z) < 12.5) return { type: "hall" };
        let best = null, bd = 10.5;
        for (const p of plotList) {
          const d = Math.hypot(player.position.x - p.x, player.position.z - p.z);
          if (d < bd) { bd = d; best = p; }
        }
        return best ? { type: "plot", site: best.site, idx: best.idx, claimed: best.claimed, hut: best.hut } : null;
      },
      markClaimed(site, idx) { const p = findPlot(site, idx); if (p && !p.claimed) markClaimedVisual(p); },
      buildHut(site, idx) { const p = findPlot(site, idx); if (p && p.claimed && !p.hut) buildHutVisual(p); },
      upgradeBamboo(site, idx) {
        const p = findPlot(site, idx);
        if (!p || !p.claimed || !p.hut || p.house >= 2) return;
        if (p.hutGroup) { removeOwnedGeometry(root, p.hutGroup); p.hutGroup = null; }
        buildBambooVisual(p);
      },
      openField(site, idx, stage) { const p = findPlot(site, idx); if (p && p.claimed && p.hut && !p.fieldGroup) openFieldVisual(p, stage); },
      setFieldStage(site, idx, stage) { const p = findPlot(site, idx); if (p) setFieldStageVisual(p, stage); },
      addAnimal(site, idx, kind) { const p = findPlot(site, idx); if (p && p.claimed && p.hut && ["chicken", "sheep", "rabbit"].includes(kind)) addAnimalVisual(p, kind); },
      teleportPlayerTo(x, z) {
        if (!Number.isFinite(x) || !Number.isFinite(z)) return;
        stopDance();
        resting = false; restBlend = 0; pBody.rotation.x = 0;
        moveIn.x = 0; moveIn.z = 0;
        const p = land.resolve(x, z, player.position);
        if (mounted) horse.position.set(p.x, 0, p.z);
        player.position.set(p.x, mounted ? 1.52 : 0, p.z);
        camPos.set(p.x + radius * Math.sin(polar) * Math.sin(yaw), 14, p.z + radius * Math.sin(polar) * Math.cos(yaw));
        applyCamera(0);
      },
      debugSetPlayer(x, z) {
        if (!Number.isFinite(x) || !Number.isFinite(z)) return;
        player.position.set(x, 0, z);
        camPos.set(x + radius * Math.sin(polar) * Math.sin(yaw), 14, z + radius * Math.sin(polar) * Math.cos(yaw));
        applyCamera(0);
      },
    };
  }

  return { createDamScene, createLandResolver, checkCustomPlotSpot, createSkyEffects, createHomeProps, createFestivalEffects, BOND };
});
