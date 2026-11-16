// 安和里 · 通用坝世界引擎（第 16 轮）
// 一台引擎跑所有坝：玩家（原始居民）+ 跟随镜头 + 基址地块 + 家园建造视觉 + 坐骑 + 水域碰撞。
// 每坝只提供 spec：{ seed, spawn, hallPos, crystalPos, sites:[{x,z}], waters:[{x,z,r}], bounds:{rx,rz},
//                    decorate(root, M, H) -> animate(dt,t)|null }
// 芒市坝仍用自己的 mangshi-scene.js（同接口鸭子类型），本引擎供瑞丽/盈江/陇川/梁河共用。
(function (global, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./preview-economy.cjs"), require("./preview-roads.cjs"));
  else global.AnheliDamWorld = factory(global.AnheliPreviewEconomy, global.AnheliPreviewRoads);
})(typeof self !== "undefined" ? self : this, function (Economy, RoadModule) {
  "use strict";

  const BOND = Economy.BOND;
  const Roads = typeof RoadModule?.connectedNetwork === "function" ? RoadModule : null;

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

  function landBoundsContain(spec, x, z) {
    const bounds = spec.bounds || { rx: 250, rz: 205 };
    return Number.isFinite(x) && Number.isFinite(z) && Math.hypot(x / bounds.rx, z / bounds.rz) <= 1 + 1e-10;
  }

  function rectangle(x, z, minX, maxX, minZ, maxZ, angle = 0) {
    const cos = Math.cos(angle), sin = Math.sin(angle);
    return [[minX, minZ], [maxX, minZ], [maxX, maxZ], [minX, maxZ]].map(([px, pz]) => ({
      x: x + px * cos + pz * sin, z: z - px * sin + pz * cos,
    }));
  }

  function homeFootprint(x, z, angle) {
    // Covers the upgraded roof, field, unrotated pad and animal paths plus their bodies.
    return rectangle(x, z, -5.5, 5.5, -6.6, 5.5, angle);
  }

  function polygonsOverlap(a, b) {
    for (const polygon of [a, b]) for (let i = 0; i < polygon.length; i++) {
      const p = polygon[i], q = polygon[(i + 1) % polygon.length];
      const nx = q.z - p.z, nz = p.x - q.x;
      const project = points => points.map(point => point.x * nx + point.z * nz);
      const left = project(a), right = project(b);
      if (Math.max(...left) < Math.min(...right) - 1e-9 || Math.max(...right) < Math.min(...left) - 1e-9) return false;
    }
    return true;
  }

  function pointSegmentDistance(point, a, b) {
    const dx = b.x - a.x, dz = b.z - a.z, length = dx * dx + dz * dz;
    const t = length ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / length)) : 0;
    return Math.hypot(point.x - a.x - t * dx, point.z - a.z - t * dz);
  }

  function pointPolygonDistance(point, polygon) {
    if (polygonsOverlap(polygon, [point])) return 0;
    return Math.min(...polygon.map((p, index) => pointSegmentDistance(point, p, polygon[(index + 1) % polygon.length])));
  }

  // —— 实体碰撞（逻辑修复轮 2026-11-16）：圆（移动者）vs 定向矩形（OBB）——
  // solid = { x, z（世界中心）, cos, sin（局部系旋转）, hx, hz（半宽）, y0, y1（竖直跨度）, minR? }
  // 局部→世界：wx = x + lx*cos + lz*sin；wz = z - lx*sin + lz*cos（与 rectangle()/Group.rotation.y 同口径）。
  // 把圆心推出矩形（矩形按圆半径外扩）；返回是否发生了位移。竖直跨度由调用方先行判定。
  function pushCircleOutOfObb(p, radius, s) {
    const dx = p.x - s.x, dz = p.z - s.z;
    let lx = dx * s.cos - dz * s.sin, lz = dx * s.sin + dz * s.cos;
    const cx = Math.max(-s.hx, Math.min(s.hx, lx)), cz = Math.max(-s.hz, Math.min(s.hz, lz));
    if (cx === lx && cz === lz) {
      // 圆心已在矩形内：沿穿透最浅的轴整段推出
      const px = s.hx - Math.abs(lx), pz = s.hz - Math.abs(lz);
      if (px < pz) lx = (lx >= 0 ? 1 : -1) * (s.hx + radius);
      else lz = (lz >= 0 ? 1 : -1) * (s.hz + radius);
    } else {
      const ex = lx - cx, ez = lz - cz, d = Math.hypot(ex, ez);
      if (d >= radius) return false;
      if (d < 1e-9) {
        const px = s.hx - Math.abs(lx), pz = s.hz - Math.abs(lz);
        if (px < pz) lx = (lx >= 0 ? 1 : -1) * (s.hx + radius);
        else lz = (lz >= 0 ? 1 : -1) * (s.hz + radius);
      } else { lx = cx + ex / d * radius; lz = cz + ez / d * radius; }
    }
    p.x = s.x + lx * s.cos + lz * s.sin;
    p.z = s.z - lx * s.sin + lz * s.cos;
    return true;
  }

  function polygonRoadDistance(polygon, points) {
    let distance = Infinity;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      if (polygonsOverlap(polygon, [a, b])) return 0;
      distance = Math.min(distance, pointPolygonDistance(a, polygon), pointPolygonDistance(b, polygon),
        ...polygon.map(point => pointSegmentDistance(point, a, b)));
    }
    return distance;
  }

  function checkCustomPlotSpot(spec, plots, x, z) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return { ok: false, reason: "invalid" };
    const angle = Math.atan2(spec.hallPos.x - x, spec.hallPos.z - z);
    const footprint = homeFootprint(x, z, angle);
    if (!landBoundsContain(spec, x, z) || footprint.some(p => !landBoundsContain(spec, p.x, p.z))) return { ok: false, reason: "bounds" };
    for (const site of spec.sites) if (Math.hypot(x - site.x, z - site.z) < 16) return { ok: false, reason: "site" };
    if (Math.hypot(x - spec.hallPos.x, z - spec.hallPos.z) < 15) return { ok: false, reason: "hall" };
    if (Math.hypot(x - spec.crystalPos.x, z - spec.crystalPos.z) < 11) return { ok: false, reason: "crystal" };
    for (const circle of (spec.waters || []).concat(spec.placement?.waters || [])) if (pointPolygonDistance(circle, footprint) <= circle.r + 0.5) return { ok: false, reason: "water" };
    for (const circle of (spec.colliders || []).concat(spec.placement?.solids || [])) if (pointPolygonDistance(circle, footprint) <= circle.r + 0.5) return { ok: false, reason: "solid" };
    const features = spec.mapFeatures;
    for (const plot of plots.concat(features?.plots || [])) {
      const width = plot.w || 7.6, depth = plot.d || 7.6;
      if (polygonsOverlap(footprint, rectangle(plot.x, plot.z, -width / 2, width / 2, -depth / 2, depth / 2))
        || polygonsOverlap(footprint, homeFootprint(plot.x, plot.z, plot.face || 0))) return { ok: false, reason: "taken" };
    }
    for (const road of (features?.roads || []).concat(spec.placement?.roads || [])) {
      if (polygonRoadDistance(footprint, road.points) < road.width / 2 + 3) return { ok: false, reason: "site" };
    }
    const commons = features?.commons;
    if (commons && polygonsOverlap(footprint, rectangle(0, 0, commons.minX, commons.maxX, commons.minZ, commons.maxZ))) return { ok: false, reason: "site" };
    const ring = spec.prayerSite?.ring;
    for (const area of [features?.commonPoint, features?.market?.area, features?.pagoda?.court, features?.temple?.area, features?.pasture?.area, spec.prayerSite?.entry,
      ring && { x: ring.x, z: ring.z, radius: ring.r + 3 }].filter(Boolean)) {
      if (pointPolygonDistance(area, footprint) <= (area.radius ?? area.r)) return { ok: false, reason: "site" };
    }
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

    // —— 家园布局（纠偏复查 2026-11-15）：房子占地与田块沿朝向轴（dir）一前一后排布，
    // 平台前缘与最近一畦田后缘之间留 0.38 单位空隙，零重叠；数值是唯一来源，
    // getHomeLayout() 把同一组数算成矩形供回归测试断言。——
    const HOME_BACK = 1.9;        // 房子组中心相对地块中心向后（-dir）的偏移
    const FIELD_FORWARD = 3.0;    // 田组中心相对地块中心向前（+dir）的偏移
    const PLATFORM_HALF = 2.95;   // 认领平台（房子最大地面占地）半宽
    const BED_EXTENT = 1.57;      // 田组四畦的外接半宽（畦心 ±0.82 + 畦半宽 0.75）
    // —— 动物区（逻辑修复轮）：地块局部系（lat=局部 X，along=局部 Z），位于房子/田块的东侧空地，
    // 不与房（|lat|≤2.95）、田（|lat|≤1.57）重叠；四周有栅栏（视觉 + 玩家碰撞），动物以此为硬边界。——
    const ANIMAL_ZONE = { minLat: 3.55, maxLat: 7.95, minAlong: -4.85, maxAlong: 4.85 };
    const ANIMAL_DEFS = { chicken: { radius: 0.3, height: 0.85 }, sheep: { radius: 0.62, height: 1.35 }, rabbit: { radius: 0.34, height: 0.75 } };

    // —— 本坝的静态世界（地貌/江河/地标/集市/大厅由各坝 decorate 画）——
    const decoration = spec.decorate(root, M, H);
    const animate = typeof decoration === "function" ? decoration : decoration?.animate || null;
    // 场景侧可选接口（样板羊、寺院动效等）：引擎只透传并逐帧喂玩家位置，不预设形状。
    const decorationApi = decoration?.api || null;
    const colliders = (spec.colliders || []).concat(decoration?.colliders || []);
    const publicRoads = [...(spec.mapFeatures?.roads || []), ...(decoration?.placement?.roads || [])];
    const rootRoad = decoration?.placement?.roads?.[0];
    const roadRoots = rootRoad?.points?.length ? [rootRoad.points[0]]
      : (spec.mapFeatures?.exits || []).filter(exit => exit.id === "west-road").map(exit => exit.from);
    let playerRoads = [], playerRoadGroup = null, roadPreview = null;
    let roadNetwork = Roads ? Roads.connectedNetwork(publicRoads, [], roadRoots) : [];
    const placementSpec = { ...spec, colliders, placement: { ...decoration?.placement, roads: [...(decoration?.placement?.roads || [])] } };
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

    // —— 基址地块（引擎统一：中心圆台 + 8 块环地；spec.siteLayouts 可按契约坐标改排某一基址）——
    const plotList = [];
    spec.sites.forEach((site, si) => {
      const g = new THREE.Group();
      g.position.set(site.x, 0, site.z);
      const c = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.4, 0.3, 10), M.stone);
      c.position.y = 0.15;
      g.add(c);
      root.add(g);
      const layout = spec.siteLayouts?.[si];
      if (layout?.plots?.length) {
        // 契约排布（共享村落）：地块位/尺寸/朝向/plotId 全由 spec 给定，idx 与启用顺序一一对应；
        // reserved 地块只作预留视觉与交互锚点，不能被新认领（存量恢复不受此限）。
        layout.plots.forEach((lp, idx) => {
          const w = Number.isFinite(lp.w) ? lp.w : 7.6, d = Number.isFinite(lp.d) ? lp.d : 7.6;
          const mesh = box(w, 0.22, d, M.plot, lp.x, 0.11, lp.z);
          root.add(mesh);
          const plot = {
            site: si, idx, id: lp.id || null, x: lp.x, z: lp.z, w, d, mesh,
            claimed: false, hut: false, hutGroup: null,
            fieldGroup: null, fieldSprouts: null, fieldStage: 0, house: 0, animals: [],
            face: Number.isFinite(lp.face) ? lp.face : Math.atan2(site.x - lp.x, site.z - lp.z),
            reserved: !!lp.reserved,
            interactR: Number.isFinite(lp.interactR) ? lp.interactR : 10.5,
            decorGroup: null,
          };
          plot.dirX = Math.sin(plot.face); plot.dirZ = Math.cos(plot.face);
          plotList.push(plot);
          if (typeof spec.decoratePlot === "function") {
            const decor = spec.decoratePlot({ ...lp, site: si, idx, x: lp.x, z: lp.z, w, d, face: plot.face }, M, H);
            if (decor) { plot.decorGroup = decor; root.add(decor); }
          }
        });
        return;
      }
      for (let idx = 0; idx < 8; idx++) {
        const a = idx / 8 * Math.PI * 2;
        const px = site.x + Math.cos(a) * 11.5;
        const pz = site.z + Math.sin(a) * 11.5;
        const mesh = box(7.6, 0.22, 7.6, M.plot, px, 0.11, pz);
        root.add(mesh);
        plotList.push({
          site: si, idx, x: px, z: pz, w: 7.6, d: 7.6, mesh,
          claimed: false, hut: false, hutGroup: null,
          fieldGroup: null, fieldSprouts: null, fieldStage: 0, house: 0, animals: [],
          face: Math.atan2(site.x - px, site.z - pz),
          dirX: (site.x - px) / 11.5, dirZ: (site.z - pz) / 11.5,
        });
      }
    });
    function findPlot(site, idx) { return plotList.find(p => p.site === site && p.idx === idx); }
    function getRoadNetwork() { return roadNetwork.map(road => ({ ...road, a: { ...road.a }, b: { ...road.b } })); }

    function restorePlayerRoads(roads) {
      if (!Roads || !Roads.validatePlayerRoads(roads)) return { ok: false, reason: "invalid" };
      if (JSON.stringify(roads) === JSON.stringify(playerRoads)) return { ok: true, changed: false };
      const next = roads.map(road => ({ a: { ...road.a }, b: { ...road.b } }));
      if (playerRoadGroup) removeOwnedGeometry(root, playerRoadGroup);
      playerRoadGroup = new THREE.Group();
      playerRoadGroup.name = "roads:player";
      for (const road of next) {
        const segment = box(Roads.WIDTH, 0.06, Roads.length(road), M.road,
          (road.a.x + road.b.x) / 2, 0.12, (road.a.z + road.b.z) / 2);
        segment.rotation.y = Math.atan2(road.b.x - road.a.x, road.b.z - road.a.z);
        playerRoadGroup.add(segment);
        for (const p of [road.a, road.b]) playerRoadGroup.add(H.disc(M.road, Roads.WIDTH / 2, p.x, p.z, 0.155));
      }
      root.add(playerRoadGroup);
      playerRoads = next;
      roadNetwork = Roads.connectedNetwork(publicRoads, playerRoads, roadRoots);
      placementSpec.placement.roads = [...(decoration?.placement?.roads || []),
        ...next.map(road => ({ points: [road.a, road.b], width: Roads.WIDTH }))];
      return { ok: true, changed: true };
    }

    function roadEnvironment() {
      const features = spec.mapFeatures, commons = features?.commons, ring = spec.prayerSite?.ring;
      const plots = [];
      for (const plot of plotList.concat(features?.plots || [])) {
        const width = plot.w || 7.6, depth = plot.d || 7.6;
        plots.push(rectangle(plot.x, plot.z, -width / 2, width / 2, -depth / 2, depth / 2));
        plots.push(homeFootprint(plot.x, plot.z, plot.face || 0));
      }
      return {
        bounds: spec.bounds || { rx: 250, rz: 205 },
        waters: [...(spec.waters || []), ...(decoration?.placement?.waters || [])],
        solids: [...colliders, ...(decoration?.placement?.solids || [])],
        plots,
        protected: commons ? [rectangle(0, 0, commons.minX, commons.maxX, commons.minZ, commons.maxZ)] : [],
        areas: [
          ...spec.sites.map(site => ({ ...site, r: 3.4 })), { ...spec.hallPos, r: 8 }, { ...spec.crystalPos, r: 3 },
          features?.commonPoint, features?.market?.area, features?.pagoda?.court, features?.temple?.area, features?.pasture?.area, spec.prayerSite?.entry,
          ring && { x: ring.x, z: ring.z, r: ring.r + 3 },
        ].filter(Boolean),
      };
    }

    function quotePlayerRoad(start, end) {
      return Roads ? Roads.quoteRoad(start, end, roadNetwork, playerRoads, roadEnvironment()) : { ok: false, reason: "invalid" };
    }

    function clearRoadPreview() {
      if (roadPreview) roadPreview.visible = false;
    }

    function setRoadPreview(start, end, valid = false) {
      if (!Roads || ![start, end].every(p => Number.isFinite(p?.x) && Number.isFinite(p?.z))) { clearRoadPreview(); return false; }
      const length = Math.hypot(end.x - start.x, end.z - start.z);
      if (!Number.isFinite(length) || length < 1e-7) { clearRoadPreview(); return false; }
      if (!roadPreview) {
        roadPreview = new THREE.Mesh(new THREE.BoxGeometry(1, 0.06, 1),
          new THREE.MeshBasicMaterial({ color: 0x4ba56d, transparent: true, opacity: 0.5, depthWrite: false }));
        roadPreview.name = "roads:preview";
        root.add(roadPreview);
      }
      roadPreview.position.set((start.x + end.x) / 2, 0.25, (start.z + end.z) / 2);
      roadPreview.rotation.y = Math.atan2(end.x - start.x, end.z - start.z);
      roadPreview.scale.set(Roads.WIDTH, 1, length);
      roadPreview.material.color.set(valid ? 0x4ba56d : 0xcc5050);
      roadPreview.visible = true;
      return true;
    }

    function checkHomeRoadAccess(x, z) {
      if (!Roads || !Number.isFinite(x) || !Number.isFinite(z)) return { ok: false, reason: "invalid" };
      const angle = Math.atan2(spec.hallPos.x - x, spec.hallPos.z - z);
      return Roads.homeRoadAccess(homeFootprint(x, z, angle), roadNetwork);
    }

    function getMapFeatures() {
      if (!spec.mapFeatures) return null;
      return { ...spec.mapFeatures, roads: [...publicRoads,
        ...playerRoads.map(road => ({ points: [{ ...road.a }, { ...road.b }], width: Roads.WIDTH, source: "player" }))] };
    }

    function addCustomPlot(x, z, restoring) {
      if (!landBoundsContain(spec, x, z)) return null;
      const existing = findPlot(-1, -1);
      if (existing) return existing.x === x && existing.z === z ? { site: -1, idx: -1, x, z, claimed: true } : null;
      if (!restoring && !checkCustomPlotSpot(placementSpec, plotList, x, z).ok) return null;
      const mesh = box(7.6, 0.22, 7.6, M.plot, x, 0.11, z);
      const dx = spec.hallPos.x - x, dz = spec.hallPos.z - z, distance = Math.hypot(dx, dz) || 1;
      const plot = { site: -1, idx: -1, x, z, mesh, claimed: false, hut: false, house: 0, hutGroup: null,
        fieldGroup: null, fieldSprouts: null, fieldStage: 0, animals: [], face: Math.atan2(dx, dz), dirX: dx / distance, dirZ: dz / distance };
      root.add(mesh); plotList.push(plot); markClaimedVisual(plot);
      return { site: -1, idx: -1, x, z, claimed: true };
    }
    function claimCustomPlot(x, z) { return addCustomPlot(x, z, false); }
    function restoreCustomPlot(x, z) { return addCustomPlot(x, z, true); }

    // ══ 实体碰撞登记（逻辑修复轮 2026-11-16）══
    // 根因（修复前）：玩家移动只过 land.resolve，其障碍集只有 spec.waters + 装饰 colliders（水/山/树）；
    // 运行时在地块上建起的房子、栅栏从未登记为碰撞体，玩家径直穿墙。动物移动则完全不走任何碰撞，
    // 目标点在地块中心半径 4.2 的圆盘内随机取——圆盘与房子占地大面积重叠，羊必然穿房。
    // 现行口径：房子墙体/架空层/栅栏按新占地登记为 OBB 实体（带竖直跨度与门洞），平台/室内/台阶登记为
    // 地面高度区；玩家、坐骑、家养动物移动统一过 resolveMover / resolveAnimalPosition。
    let worldSolids = [], worldFloors = [];
    function frameOf(x, z, face) { return { x, z, cos: Math.cos(face), sin: Math.sin(face) }; }
    function makeSolid(frame, ox, oz, hx, hz, y0, y1, minR) {
      return {
        x: frame.x + ox * frame.cos + oz * frame.sin, z: frame.z - ox * frame.sin + oz * frame.cos,
        cos: frame.cos, sin: frame.sin, hx, hz, y0, y1, minR: minR || 0,
      };
    }
    function makeFloor(frame, ox, oz, hx, hz, h, rampZ) {
      return {
        fx: frame.x, fz: frame.z,
        x: frame.x + ox * frame.cos + oz * frame.sin, z: frame.z - ox * frame.sin + oz * frame.cos,
        cos: frame.cos, sin: frame.sin, hx, hz, h, rampZ: rampZ || null,
      };
    }
    function refreshWorldCollision() {
      worldSolids = [...(decoration?.solidRects || [])];
      worldFloors = [];
      for (const p of plotList) {
        if (p._solids) worldSolids.push(...p._solids);
        if (p._floors) worldFloors.push(...p._floors);
      }
    }
    function yardFenceSolids(plotFrame) {
      const Z = ANIMAL_ZONE, latC = (Z.minLat + Z.maxLat) / 2, latH = (Z.maxLat - Z.minLat) / 2, alongH = (Z.maxAlong - Z.minAlong) / 2;
      return [
        makeSolid(plotFrame, Z.maxLat, 0, 0.09, alongH + 0.09, 0, 1.05),
        makeSolid(plotFrame, latC, Z.maxAlong, latH + 0.09, 0.09, 0, 1.05),
        makeSolid(plotFrame, latC, Z.minAlong, latH + 0.09, 0.09, 0, 1.05),
        makeSolid(plotFrame, Z.minLat, (Z.minAlong + 1.6) / 2, 0.09, (1.6 - Z.minAlong) / 2, 0, 1.05), // 内侧留门（along 1.6..3.2）
        makeSolid(plotFrame, Z.minLat, (3.2 + Z.maxAlong) / 2, 0.09, (Z.maxAlong - 3.2) / 2, 0, 1.05),
      ];
    }
    function refreshPlotCollision(plot) {
      const solids = [], floors = [];
      if (plot.claimed) {
        const houseFrame = frameOf(plot.x - plot.dirX * HOME_BACK, plot.z - plot.dirZ * HOME_BACK, plot.face);
        floors.push(makeFloor(houseFrame, 0, 0, PLATFORM_HALF, PLATFORM_HALF, 0.52)); // 认领平台顶面
        if (plot.house >= 1) solids.push(...yardFenceSolids(frameOf(plot.x, plot.z, plot.face)));
        if (plot.house === 1) {
          // 草棚墙体（与 buildHutVisual 同占地）：后/左/右整墙，前墙两段，门洞 |x|<0.9
          solids.push(makeSolid(houseFrame, 0, -2.66, 2.82, 0.16, 0.52, 3.05));
          solids.push(makeSolid(houseFrame, -2.66, 0, 0.16, 2.82, 0.52, 3.05));
          solids.push(makeSolid(houseFrame, 2.66, 0, 0.16, 2.82, 0.52, 3.05));
          solids.push(makeSolid(houseFrame, -1.86, 2.66, 0.96, 0.16, 0.52, 3.05));
          solids.push(makeSolid(houseFrame, 1.86, 2.66, 0.96, 0.16, 0.52, 3.05));
          solids.push(makeSolid(houseFrame, 0, 2.66, 0.9, 0.16, 0.52, 3.05, 0.6)); // 门洞只挡大体型（坐骑）
        } else if (plot.house === 2) {
          // 竹楼：架空层整幅实体（裙边围合）+ 楼层墙体（门洞 |x|<0.9）；地面高度改由台阶斜面与楼板给出
          floors.length = 0;
          floors.push(makeFloor(houseFrame, 0, 0, 2.8, 2.8, 2.3));
          floors.push(makeFloor(houseFrame, 0, 3.75, 0.85, 0.95, 0, { z0: 4.7, z1: 2.8, h0: 0, h1: 2.3 }));
          solids.push(makeSolid(houseFrame, 0, 0, 2.55, 2.55, 0, 2.0));
          solids.push(makeSolid(houseFrame, 0, -2.5, 2.62, 0.14, 2.15, 4.55));
          solids.push(makeSolid(houseFrame, -2.5, 0, 0.14, 2.62, 2.15, 4.55));
          solids.push(makeSolid(houseFrame, 2.5, 0, 0.14, 2.62, 2.15, 4.55));
          solids.push(makeSolid(houseFrame, -1.76, 2.5, 0.86, 0.14, 2.15, 4.55));
          solids.push(makeSolid(houseFrame, 1.76, 2.5, 0.86, 0.14, 2.15, 4.55));
          solids.push(makeSolid(houseFrame, 0, 2.5, 0.88, 0.14, 2.15, 4.55, 0.6));
        }
      }
      plot._solids = solids; plot._floors = floors;
      refreshWorldCollision();
    }
    function floorHeightAt(x, z) {
      let best = 0;
      for (const f of worldFloors) {
        const dx = x - f.x, dz = z - f.z;
        const lx = dx * f.cos - dz * f.sin, lz = dx * f.sin + dz * f.cos;
        if (Math.abs(lx) > f.hx || Math.abs(lz) > f.hz) continue;
        let h = f.h;
        if (f.rampZ) {
          const fdx = x - f.fx, fdz = z - f.fz;
          const flz = fdx * f.sin + fdz * f.cos;
          const t = Math.max(0, Math.min(1, (flz - f.rampZ.z0) / (f.rampZ.z1 - f.rampZ.z0)));
          h = f.rampZ.h0 + (f.rampZ.h1 - f.rampZ.h0) * t;
        }
        if (h > best) best = h;
      }
      return best;
    }
    // 玩家/坐骑移动解算：先过地形（水面/山树/坝界），再按竖直跨度逐个推出实体矩形。
    // 近距离移动分步推进（单步 ≤0.15 < 最薄墙体 0.28）：逐段从上一段解算结果续推，
    // 圆心不会跨过矩形中线被推到墙的另一侧（大步长直推会穿透，实测过）。
    function resolveMover(x, z, prev, radius, height, useFloors) {
      let p = land.resolve(x, z, prev);
      const feetY = useFloors ? floorHeightAt(p.x, p.z) : 0;
      const top = feetY + height;
      const pushAll = q => {
        let moved = false;
        for (const s of worldSolids) {
          if (radius < s.minR || top <= s.y0 || feetY >= s.y1) continue;
          if (pushCircleOutOfObb(q, radius, s)) moved = true;
        }
        return moved;
      };
      const dist = Math.hypot(p.x - prev.x, p.z - prev.z);
      if (dist > 1e-6 && dist <= 3) {
        const steps = Math.max(1, Math.ceil(dist / 0.15));
        const cur = { x: prev.x, z: prev.z };
        for (let pass = 0; pass < 3 && pushAll(cur); pass++); // 起点若已陷在实体内，先弹到最近面再起步
        const stepX = (p.x - cur.x) / steps, stepZ = (p.z - cur.z) / steps;
        for (let i = 0; i < steps; i++) {
          cur.x += stepX; cur.z += stepZ;
          for (let pass = 0; pass < 3 && pushAll(cur); pass++);
        }
        p = cur;
      } else {
        for (let pass = 0; pass < 3 && pushAll(p); pass++);
      }
      if (!land.valid(p)) { p = land.resolve(p.x, p.z, prev); pushAll(p); }
      return { x: p.x, z: p.z, feetY: useFloors ? floorHeightAt(p.x, p.z) : 0 };
    }
    // 家养动物位置解算：推出实体与树干圆，最后钳回动物区（硬边界，含身体半径内缩）。
    function resolveAnimalPosition(a) {
      const p = a.g.position;
      for (let pass = 0; pass < 2; pass++) {
        for (const s of worldSolids) {
          if (a.radius < s.minR || a.height <= s.y0) continue;
          pushCircleOutOfObb(p, a.radius, s);
        }
        for (const c of colliders) {
          const dx = p.x - c.x, dz = p.z - c.z, rr = c.r + a.radius, d = Math.hypot(dx, dz);
          if (d < rr && d > 1e-6) { p.x = c.x + dx / d * rr; p.z = c.z + dz / d * rr; }
        }
        const dx = p.x - a.px, dz = p.z - a.pz;
        let lx = dx * a.cosF - dz * a.sinF, lz = dx * a.sinF + dz * a.cosF;
        lx = Math.max(ANIMAL_ZONE.minLat + a.radius, Math.min(ANIMAL_ZONE.maxLat - a.radius, lx));
        lz = Math.max(ANIMAL_ZONE.minAlong + a.radius, Math.min(ANIMAL_ZONE.maxAlong - a.radius, lz));
        p.x = a.px + lx * a.cosF + lz * a.sinF;
        p.z = a.pz - lx * a.sinF + lz * a.cosF;
      }
    }
    function pickAnimalTarget(a) {
      const lx = ANIMAL_ZONE.minLat + a.radius + rnd() * (ANIMAL_ZONE.maxLat - ANIMAL_ZONE.minLat - a.radius * 2);
      const lz = ANIMAL_ZONE.minAlong + a.radius + rnd() * (ANIMAL_ZONE.maxAlong - ANIMAL_ZONE.minAlong - a.radius * 2);
      a.tx = a.px + lx * a.cosF + lz * a.sinF;
      a.tz = a.pz - lx * a.sinF + lz * a.cosF;
    }
    refreshWorldCollision(); // 初始登记场景侧静态实体（如样板牧场围栏）

    function markClaimedVisual(plot) {
      plot.claimed = true;
      plot.mesh.material = M.warm;
      if (plot.decorGroup) { removeOwnedGeometry(root, plot.decorGroup); plot.decorGroup = null; }
      const f = new THREE.Group();
      f.position.set(plot.x - plot.dirX * HOME_BACK, 0, plot.z - plot.dirZ * HOME_BACK);
      f.rotation.y = plot.face;
      f.add(box(5.9, 0.35, 5.9, M.wood, 0, 0.35, 0));
      f.add(box(0.28, 2.2, 0.28, M.woodDark, 3.2, 1.3, 3.2));
      f.add(box(1.5, 0.9, 0.12, M.cream, 3.2, 2.2, 3.2));
      root.add(f);
      refreshPlotCollision(plot);
    }
    // —— 动物区栅栏（逻辑修复轮）：与 yardFenceSolids 同界，内侧留门供玩家进出 ——
    function buildYardFenceVisual(plot) {
      if (plot.yardGroup) return;
      const g = new THREE.Group();
      g.position.set(plot.x, 0, plot.z);
      g.rotation.y = plot.face;
      const run = (x0, z0, x1, z1) => {
        const len = Math.hypot(x1 - x0, z1 - z0), steps = Math.max(1, Math.round(len / 1.6));
        for (let i = 0; i <= steps; i++) g.add(box(0.15, 1.05, 0.15, M.wood, x0 + (x1 - x0) * i / steps, 0.52, z0 + (z1 - z0) * i / steps));
        for (const ry of [0.55, 0.92]) {
          g.add(Math.abs(x1 - x0) > Math.abs(z1 - z0)
            ? box(len, 0.09, 0.09, M.wood, (x0 + x1) / 2, ry, (z0 + z1) / 2)
            : box(0.09, 0.09, len, M.wood, (x0 + x1) / 2, ry, (z0 + z1) / 2));
        }
      };
      const Z = ANIMAL_ZONE;
      run(Z.maxLat, Z.minAlong, Z.maxLat, Z.maxAlong);
      run(Z.minLat, Z.maxAlong, Z.maxLat, Z.maxAlong);
      run(Z.minLat, Z.minAlong, Z.maxLat, Z.minAlong);
      run(Z.minLat, Z.minAlong, Z.minLat, 1.6);
      run(Z.minLat, 3.2, Z.minLat, Z.maxAlong);
      g.add(box(0.2, 1.25, 0.2, M.woodDark, Z.minLat, 0.62, 1.6));
      g.add(box(0.2, 1.25, 0.2, M.woodDark, Z.minLat, 0.62, 3.2));
      root.add(g);
      plot.yardGroup = g;
    }
    // —— 草棚（逻辑修复轮重做）：米白墙身 + 木角柱、四面真墙、前墙真门洞（门板开着贴墙）、
    // 两侧窗框、双坡茅草顶（脊沿前后向、出檐）+ 山墙，室内有床铺/低桌/凳/背篓轮廓；
    // 占地与 refreshPlotCollision 的草棚实体逐项对应，门洞可进出、墙体不可穿。——
    function buildHutVisual(plot) {
      plot.hut = true; plot.house = 1;
      const g = new THREE.Group();
      g.position.set(plot.x - plot.dirX * HOME_BACK, 0, plot.z - plot.dirZ * HOME_BACK);
      g.rotation.y = plot.face;
      const y0 = 0.52; // 平台顶面
      g.add(box(4.7, 0.07, 4.7, M.earth, 0, y0 + 0.035, 0)); // 室内地席
      g.add(box(5.6, 2.48, 0.24, M.cream, 0, y0 + 1.24, -2.66)); // 后墙
      g.add(box(0.24, 2.48, 5.6, M.cream, -2.66, y0 + 1.24, 0)); // 左墙
      g.add(box(0.24, 2.48, 5.6, M.cream, 2.66, y0 + 1.24, 0)); // 右墙
      g.add(box(1.85, 2.48, 0.24, M.cream, -1.875, y0 + 1.24, 2.66)); // 前墙左段
      g.add(box(1.85, 2.48, 0.24, M.cream, 1.875, y0 + 1.24, 2.66)); // 前墙右段
      g.add(box(1.9, 0.48, 0.24, M.cream, 0, y0 + 2.24, 2.66)); // 门楣（门洞宽 1.9、高 2.0）
      for (const [px, pz] of [[-2.66, -2.66], [2.66, -2.66], [-2.66, 2.66], [2.66, 2.66]]) {
        g.add(box(0.32, 2.6, 0.32, M.woodDark, px, y0 + 1.3, pz)); // 木角柱
      }
      g.add(box(0.18, 2.05, 0.3, M.woodDark, -0.95, y0 + 1.02, 2.66)); // 门框
      g.add(box(0.18, 2.05, 0.3, M.woodDark, 0.95, y0 + 1.02, 2.66));
      const doorHinge = new THREE.Group(); // 门板开着，平贴前墙外侧，不堵门洞
      doorHinge.position.set(0.95, y0, 2.95); doorHinge.rotation.y = Math.PI - 0.12;
      doorHinge.add(box(1.7, 1.98, 0.07, M.wood, 0.85, 1.0, 0));
      g.add(doorHinge);
      for (const s of [-1, 1]) { // 两侧窗：深色窗芯 + 木框与十字棂
        g.add(box(0.08, 1.05, 1.25, M.roofD, 2.79 * s, y0 + 1.55, 0));
        g.add(box(0.1, 1.2, 0.12, M.woodDark, 2.8 * s, y0 + 1.55, -0.68));
        g.add(box(0.1, 1.2, 0.12, M.woodDark, 2.8 * s, y0 + 1.55, 0.68));
        g.add(box(0.1, 0.12, 1.44, M.woodDark, 2.8 * s, y0 + 2.18, 0));
        g.add(box(0.1, 0.12, 1.44, M.woodDark, 2.8 * s, y0 + 0.92, 0));
        g.add(box(0.1, 1.05, 0.09, M.woodDark, 2.8 * s, y0 + 1.55, 0));
        g.add(box(0.1, 0.09, 1.25, M.woodDark, 2.8 * s, y0 + 1.55, 0));
      }
      const roofL = box(3.6, 0.18, 7.8, M.roof, -1.65, y0 + 3.35, 0); roofL.rotation.z = 0.415; g.add(roofL);
      const roofR = box(3.6, 0.18, 7.8, M.roof, 1.65, y0 + 3.35, 0); roofR.rotation.z = -0.415; g.add(roofR);
      g.add(box(0.3, 0.26, 8.1, M.woodDark, 0, y0 + 4.12, 0)); // 屋脊
      for (const s of [-1, 1]) { // 山墙（菱形截面沉入屋面，只露上三角）
        const gable = box(3.96, 3.96, 0.2, M.cream, 0, y0 + 1.28, 2.58 * s);
        gable.rotation.z = Math.PI / 4; g.add(gable);
      }
      // 室内陈设轮廓：床铺、低桌、凳、背篓
      g.add(box(1.1, 0.22, 2.2, M.tunic, -1.7, y0 + 0.18, -1.2));
      g.add(box(0.7, 0.16, 0.5, M.cream, -1.7, y0 + 0.32, -2.0));
      g.add(box(1.3, 0.1, 0.8, M.wood, 1.2, y0 + 0.5, -0.6));
      for (const [lx, lz] of [[-0.55, -0.3], [0.55, -0.3], [-0.55, 0.3], [0.55, 0.3]]) g.add(box(0.09, 0.45, 0.09, M.woodDark, 1.2 + lx, y0 + 0.22, -0.6 + lz));
      g.add(box(0.5, 0.42, 0.5, M.wood, 0.7, y0 + 0.21, 1.0));
      const hutBasket = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.26, 0.5, 8), M.bamboo);
      hutBasket.position.set(1.95, y0 + 0.25, 1.5); g.add(hutBasket);
      g.add(box(1.9, 0.16, 0.8, M.stone, 0, 0.3, 3.35)); // 门前踏石
      root.add(g);
      plot.hutGroup = g;
      buildYardFenceVisual(plot);
      refreshPlotCollision(plot);
    }
    // —— 竹楼（逻辑修复轮重做）：高脚柱 + 架空层竹篱裙边（围合实体）、楼板、四面竹墙（深色横带）、
    // 前墙真门洞（门板开着贴墙）、两侧窗框、对正门洞的台阶与扶手、双坡深色茅草顶 + 山墙 + 屋脊，
    // 室内有地席/床铺/低桌轮廓。占地与 refreshPlotCollision 的竹楼实体/地面区逐项对应：
    // 台阶斜面可拾级而上、由门洞进屋，架空层与墙体不可穿。——
    function buildBambooVisual(plot) {
      plot.hut = true; plot.house = 2;
      const g = new THREE.Group();
      g.position.set(plot.x - plot.dirX * HOME_BACK, 0, plot.z - plot.dirZ * HOME_BACK);
      g.rotation.y = plot.face;
      for (const [px, pz] of [[-2.3, -2.3], [2.3, -2.3], [-2.3, 2.3], [2.3, 2.3], [-2.3, 0], [2.3, 0]]) {
        g.add(box(0.3, 2.15, 0.3, M.bamboo, px, 1.07, pz)); // 高脚柱
      }
      g.add(box(5.3, 1.7, 0.08, M.bamboo, 0, 1.0, -2.45)); // 架空层裙边（四面围合）
      g.add(box(5.3, 1.7, 0.08, M.bamboo, 0, 1.0, 2.45));
      g.add(box(0.08, 1.7, 5.3, M.bamboo, -2.45, 1.0, 0));
      g.add(box(0.08, 1.7, 5.3, M.bamboo, 2.45, 1.0, 0));
      g.add(box(5.6, 0.3, 5.6, M.bamboo, 0, 2.15, 0)); // 楼板（顶面 2.3）
      g.add(box(5.85, 0.2, 5.85, M.woodDark, 0, 1.98, 0)); // 板边梁
      const wy = 3.42; // 墙心高（墙 2.3..4.55）
      g.add(box(5.3, 2.25, 0.22, M.bamboo, 0, wy, -2.5)); // 后墙
      g.add(box(0.22, 2.25, 5.3, M.bamboo, -2.5, wy, 0)); // 左墙
      g.add(box(0.22, 2.25, 5.3, M.bamboo, 2.5, wy, 0)); // 右墙
      g.add(box(1.7, 2.25, 0.22, M.bamboo, -1.75, wy, 2.5)); // 前墙左段
      g.add(box(1.7, 2.25, 0.22, M.bamboo, 1.75, wy, 2.5)); // 前墙右段
      g.add(box(1.8, 0.45, 0.22, M.bamboo, 0, 4.32, 2.5)); // 门楣（门洞宽 1.8、高 1.8）
      for (const zz of [-2.5, 2.5]) { g.add(box(5.34, 0.13, 0.26, M.woodDark, 0, 2.62, zz)); g.add(box(5.34, 0.13, 0.26, M.woodDark, 0, 4.22, zz)); }
      for (const xx of [-2.5, 2.5]) { g.add(box(0.26, 0.13, 5.34, M.woodDark, xx, 2.62, 0)); g.add(box(0.26, 0.13, 5.34, M.woodDark, xx, 4.22, 0)); }
      for (const s of [-1, 1]) { // 两侧窗：深色窗芯 + 木框与十字棂
        g.add(box(0.08, 1.0, 1.2, M.roofD, 2.62 * s, 3.6, 0));
        g.add(box(0.1, 1.14, 0.1, M.woodDark, 2.63 * s, 3.6, -0.62));
        g.add(box(0.1, 1.14, 0.1, M.woodDark, 2.63 * s, 3.6, 0.62));
        g.add(box(0.1, 0.1, 1.3, M.woodDark, 2.63 * s, 4.12, 0));
        g.add(box(0.1, 0.1, 1.3, M.woodDark, 2.63 * s, 3.08, 0));
        g.add(box(0.1, 1.0, 0.08, M.woodDark, 2.63 * s, 3.6, 0));
        g.add(box(0.1, 0.08, 1.2, M.woodDark, 2.63 * s, 3.6, 0));
      }
      g.add(box(0.16, 1.85, 0.28, M.woodDark, -0.9, 3.22, 2.5)); // 门框
      g.add(box(0.16, 1.85, 0.28, M.woodDark, 0.9, 3.22, 2.5));
      const doorHinge = new THREE.Group(); // 门板开着，平贴前墙外侧
      doorHinge.position.set(0.9, 2.3, 2.78); doorHinge.rotation.y = Math.PI - 0.12;
      doorHinge.add(box(1.65, 1.8, 0.07, M.wood, 0.82, 0.92, 0));
      g.add(doorHinge);
      for (let s = 0; s < 5; s++) g.add(box(1.7, 0.16, 0.52, M.bamboo, 0, 0.28 + s * 0.46, 4.55 - s * 0.44)); // 台阶
      for (const s of [-1, 1]) { // 扶手：立柱 + 斜栏
        g.add(box(0.14, 1.5, 0.14, M.bamboo, 0.95 * s, 0.75, 4.55));
        g.add(box(0.14, 2.4, 0.14, M.bamboo, 0.95 * s, 1.2, 3.6));
        g.add(box(0.14, 3.1, 0.14, M.bamboo, 0.95 * s, 1.55, 2.85));
        const rail = box(0.1, 0.1, 2.4, M.woodDark, 0.95 * s, 2.3, 3.7); rail.rotation.x = 0.81; g.add(rail);
      }
      const rL = box(3.9, 0.18, 8.3, M.roofD, -1.78, 5.5, 0); rL.rotation.z = 0.412; g.add(rL);
      const rR = box(3.9, 0.18, 8.3, M.roofD, 1.78, 5.5, 0); rR.rotation.z = -0.412; g.add(rR);
      g.add(box(0.32, 0.28, 8.6, M.woodDark, 0, 6.28, 0)); // 屋脊
      for (const s of [-1, 1]) { // 山墙
        const gable = box(3.54, 3.54, 0.2, M.bamboo, 0, 3.62, 2.42 * s);
        gable.rotation.z = Math.PI / 4; g.add(gable);
      }
      // 室内陈设轮廓：地席、床铺、低桌
      g.add(box(4.2, 0.06, 4.2, M.earth, 0, 2.33, 0));
      g.add(box(1.1, 0.22, 2.2, M.tunic, -1.7, 2.41, -1.2));
      g.add(box(0.7, 0.16, 0.5, M.cream, -1.7, 2.55, -2.0));
      g.add(box(1.3, 0.1, 0.8, M.wood, 1.2, 2.73, -0.6));
      for (const [lx, lz] of [[-0.55, -0.3], [0.55, -0.3], [-0.55, 0.3], [0.55, 0.3]]) g.add(box(0.09, 0.45, 0.09, M.woodDark, 1.2 + lx, 2.45, -0.6 + lz));
      root.add(g);
      plot.hutGroup = g;
      buildYardFenceVisual(plot);
      refreshPlotCollision(plot);
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
      g.position.set(plot.x + plot.dirX * FIELD_FORWARD, 0, plot.z + plot.dirZ * FIELD_FORWARD);
      g.rotation.y = plot.face;
      for (const [bx, bz] of [[-0.82, -0.82], [0.82, -0.82], [-0.82, 0.82], [0.82, 0.82]]) {
        g.add(box(1.5, 0.26, 1.5, M.soil, bx, 0.13, bz));
      }
      root.add(g);
      plot.fieldGroup = g;
      setFieldStageVisual(plot, stage || 0);
    }
    // —— 柔和接地阴影（纠偏样板：动物与人物脚下不再悬空）——
    const shadowMaterial = new THREE.MeshBasicMaterial({ color: 0x22301e, transparent: true, opacity: 0.15, depthWrite: false });
    function softShadow(r) {
      const m = new THREE.Mesh(new THREE.CircleGeometry(r, 14), shadowMaterial);
      m.rotation.x = -Math.PI / 2;
      m.position.y = 0.055;
      return m;
    }
    function puff(r, mat, x, y, z) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 9, 7), mat);
      m.position.set(x, y, z);
      return m;
    }
    function miniChicken() {
      const g = new THREE.Group();
      const b = puff(0.34, M.wool, 0, 0.42, 0);
      b.scale.set(1, 0.9, 1.2); g.add(b);
      for (const s of [-1, 1]) { const w = puff(0.17, M.wool, 0.3 * s, 0.45, -0.05); w.scale.set(0.5, 0.8, 1.1); g.add(w); }
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.42, 5), M.wool);
      tail.position.set(0, 0.62, -0.42); tail.rotation.x = -0.7; g.add(tail);
      const h = puff(0.17, M.wool, 0, 0.72, 0.34); g.add(h);
      const beak = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 4), M.orange);
      beak.position.set(0, 0.7, 0.55); beak.rotation.x = 1.4; g.add(beak);
      const comb = puff(0.09, M.pink, 0, 0.88, 0.32); g.add(comb);
      return g;
    }
    function miniSheep() {
      const g = new THREE.Group();
      // 云朵状羊毛：多团柔和球体叠出蓬松层次（纠偏样板口径，取代旧单球体）
      const wool = [[0, 0.84, 0, 0.6], [0.36, 0.94, 0.26, 0.42], [-0.37, 0.92, -0.18, 0.44], [0.08, 1.06, -0.36, 0.4],
        [-0.16, 1.04, 0.36, 0.38], [0.44, 0.78, -0.36, 0.35], [-0.45, 0.76, 0.3, 0.35], [0, 0.66, 0.5, 0.34], [0.02, 0.68, -0.56, 0.36]];
      for (const [x, y, z, r] of wool) g.add(puff(r, M.wool, x, y, z));
      const head = new THREE.Group();
      head.position.set(0, 0.98, 0.62);
      const face = puff(0.27, M.dark, 0, 0, 0.1); face.scale.set(0.92, 1, 1.15); head.add(face);
      head.add(puff(0.19, M.wool, 0, 0.24, -0.02));
      for (const s of [-1, 1]) { const ear = puff(0.1, M.dark, 0.26 * s, 0.05, 0.02); ear.scale.set(1.3, 0.55, 0.8); head.add(ear); }
      g.add(head);
      g.userData.head = head;
      for (const [lx, lz] of [[-0.3, 0.38], [0.3, 0.38], [-0.3, -0.42], [0.3, -0.42]]) g.add(box(0.13, 0.55, 0.13, M.dark, lx, 0.27, lz));
      g.add(puff(0.2, M.wool, 0, 0.98, -0.78));
      return g;
    }
    function miniRabbit() {
      const g = new THREE.Group();
      const b = puff(0.3, M.wool, 0, 0.3, 0);
      b.scale.set(1, 0.9, 1.25); g.add(b);
      const h = puff(0.19, M.wool, 0, 0.55, 0.3); g.add(h);
      g.add(puff(0.13, M.wool, 0, 0.42, -0.36));
      for (const s of [-1, 1]) {
        const ear = box(0.08, 0.42, 0.05, M.wool, 0.09 * s, 0.85, 0.28);
        ear.rotation.x = -0.15; g.add(ear);
      }
      return g;
    }
    function addAnimalVisual(plot, kind) {
      const g = kind === "chicken" ? miniChicken() : kind === "sheep" ? miniSheep() : miniRabbit();
      const shadow = softShadow(kind === "sheep" ? 0.72 : 0.36);
      g.add(shadow);
      const def = ANIMAL_DEFS[kind];
      const animal = {
        g, kind, head: g.userData.head || null, shadow,
        px: plot.x, pz: plot.z, cosF: Math.cos(plot.face), sinF: Math.sin(plot.face),
        radius: def.radius, height: def.height,
        tx: plot.x, tz: plot.z,
        wait: 1 + rnd() * 3, phase: rnd() * 6,
      };
      pickAnimalTarget(animal); // 出生点直接取区内一点，不再落在地块中心（旧口径与房子占地重叠）
      g.position.set(animal.tx, 0, animal.tz);
      pickAnimalTarget(animal);
      root.add(g);
      plot.animals.push(animal);
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
    // —— 佛珠串（总佛寺盘佛珠用；平时收起，setBeadsHeld 后虚持身前缓缓滚动）——
    const beadGroup = new THREE.Group();
    beadGroup.name = "player:beads";
    {
      const beadMat = new THREE.MeshLambertMaterial({ color: 0x6e4e30 });
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * Math.PI * 2;
        const bead = new THREE.Mesh(new THREE.SphereGeometry(i % 4 === 0 ? 0.062 : 0.052, 7, 6), i === 0 ? M.gold : beadMat);
        bead.position.set(Math.cos(a) * 0.19, Math.sin(a) * 0.23, 0);
        beadGroup.add(bead);
      }
    }
    beadGroup.position.set(0, 1.24, 0.5);
    beadGroup.visible = false;
    player.add(beadGroup);
    player.position.set(spec.spawn.x, 0, spec.spawn.z);
    root.add(player);
    const playerShadow = softShadow(0.55);
    root.add(playerShadow);

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
    const horseShadow = softShadow(1.35);
    horseShadow.visible = false;
    root.add(horseShadow);
    const { stall, basket: harvestBasket } = createHomeProps(THREE, M, box);
    root.add(stall, harvestBasket);
    let resting = false, restBlend = 0;
    // 地面高度（逻辑修复轮）：平台/楼板/台阶斜面给出的脚下高度，逐帧缓动跟随；姿态下沉在其上叠加。
    let floorY = 0, targetFloorY = 0;
    // —— 寺院姿态与室内状态（纠偏样板）：跪姿/叩首缓动、持珠、spec.interior 室内模式 ——
    let kneelTarget = 0, kneelBlend = 0, bowTarget = 0, bowBlend = 0, beadsHeld = false;
    let beadAngle = 0, beadShown = 0, beadPulse = 0; // 念珠逐颗步进：rollBead() 推进一颗，缓动跟上
    let interiorActive = false, interiorReturn = null, lastSky = null;
    const restAnchor = { x: 0, z: 0 };
    let horseShown = false, mounted = false;
    let bondLevel = 0, careT = 0, followPhase = 0;

    // —— 跟随镜头 ——
    let yaw = 0, polar = 1.06, radius = 17;
    const camPos = new THREE.Vector3();
    const canopies = [];
    root.updateMatrixWorld(true);
    root.traverse(mesh => {
      const geometry = mesh.geometry, parameters = geometry?.parameters;
      if (!mesh.isMesh || !mesh.visible || (mesh.material !== M.leaf && mesh.material !== M.leaf2)
        || !/^(Sphere|Cone)(Buffer)?Geometry$/.test(geometry?.type || "") || !(parameters?.radius >= 2)) return;
      if (!geometry.boundingSphere) geometry.computeBoundingSphere();
      const inverse = new THREE.Matrix4();
      if (inverse.invert) inverse.copy(mesh.matrixWorld).invert();
      else inverse.getInverse(mesh.matrixWorld);
      canopies.push({ mesh, inverse, sphere: geometry.boundingSphere.clone().applyMatrix4(mesh.matrixWorld), hidden: false });
    });
    const sightTarget = new THREE.Vector3(), sightDirection = new THREE.Vector3(), localCamera = new THREE.Vector3();
    const sightRay = new THREE.Raycaster(), sightHits = [];
    function clearCameraCanopies(tx, ty, tz) {
      sightTarget.set(tx, ty, tz);
      const distance = sightDirection.subVectors(sightTarget, camera.position).length();
      if (distance < 1e-6) return;
      sightDirection.multiplyScalar(1 / distance);
      sightRay.set(camera.position, sightDirection);
      sightRay.far = distance;
      for (const canopy of canopies) {
        const { mesh, sphere } = canopy;
        if (canopy.hidden) { mesh.visible = true; canopy.hidden = false; }
        if (!mesh.visible) continue;
        let ancestor = mesh.parent;
        while (ancestor && ancestor.visible) ancestor = ancestor.parent;
        if (ancestor) continue;
        const dx = sphere.center.x - camera.position.x, dy = sphere.center.y - camera.position.y, dz = sphere.center.z - camera.position.z;
        const along = Math.max(0, Math.min(distance, dx * sightDirection.x + dy * sightDirection.y + dz * sightDirection.z));
        if ((dx - along * sightDirection.x) ** 2 + (dy - along * sightDirection.y) ** 2
          + (dz - along * sightDirection.z) ** 2 > sphere.radius * sphere.radius) continue;
        // Front-sided foliage raycasts miss when the camera starts inside a crown.
        localCamera.copy(camera.position).applyMatrix4(canopy.inverse);
        const parameters = mesh.geometry.parameters;
        const inside = mesh.geometry.type.startsWith("Sphere")
          ? localCamera.lengthSq() < parameters.radius * parameters.radius
          : Math.abs(localCamera.y) < parameters.height / 2
            && Math.hypot(localCamera.x, localCamera.z) < parameters.radius * (0.5 - localCamera.y / parameters.height);
        sightHits.length = 0;
        if (!inside) mesh.raycast(sightRay, sightHits);
        if (inside || sightHits.length) { mesh.visible = false; canopy.hidden = true; }
      }
    }
    function applyCamera(k) {
      const tx = player.position.x, ty = player.position.y + 1.7, tz = player.position.z;
      const sp = Math.sin(polar);
      const cappedRadius = interiorActive && spec.interior ? Math.min(radius, spec.interior.maxRadius || 11) : radius;
      const cameraRadius = cappedRadius * (1 - 0.22 * restBlend);
      const dx = tx + cameraRadius * sp * Math.sin(yaw);
      const dy = ty + cameraRadius * Math.cos(polar);
      const dz = tz + cameraRadius * sp * Math.cos(yaw);
      if (k === 0 || camPos.lengthSq() === 0) camPos.set(dx, dy, dz);
      else camPos.x += (dx - camPos.x) * k, camPos.y += (dy - camPos.y) * k, camPos.z += (dz - camPos.z) * k;
      if (interiorActive && spec.interior) {
        const rect = spec.interior.rect;
        camPos.x = Math.max(rect.minX - 2.5, Math.min(rect.maxX + 2.5, camPos.x));
        camPos.z = Math.max(rect.minZ - 2.5, Math.min(rect.maxZ + 2.5, camPos.z));
        camPos.y = Math.min(camPos.y, 10.5);
      }
      camera.position.copy(camPos);
      camera.lookAt(tx, ty, tz);
      clearCameraCanopies(tx, ty, tz);
    }
    applyCamera(0);

    const moveIn = { x: 0, z: 0 };
    let walkPhase = 0, moving = false;
    const land = createLandResolver({ ...spec, colliders });
    // —— 室内模式（spec.interior）：独立矩形小世界，墙内钳制 + 室内碰撞圆，与坝面椭圆互不干扰 ——
    function resolveInterior(x, z, previous) {
      const rect = spec.interior.rect, solids = spec.interior.colliders || [];
      const clampRect = p => {
        p.x = Math.max(rect.minX + 0.7, Math.min(rect.maxX - 0.7, p.x));
        p.z = Math.max(rect.minZ + 0.7, Math.min(rect.maxZ - 0.7, p.z));
      };
      const p = { x, z };
      clampRect(p);
      for (let pass = 0; pass < 12; pass++) {
        let settled = true;
        for (const w of solids) {
          let dx = p.x - w.x, dz = p.z - w.z, distance = Math.hypot(dx, dz);
          if (distance >= w.r) continue;
          settled = false;
          if (distance < 1e-9) {
            dx = (previous?.x ?? p.x) - w.x; dz = (previous?.z ?? p.z) - w.z;
            distance = Math.hypot(dx, dz) || 1;
          }
          p.x = w.x + dx / distance * (w.r + 1e-6);
          p.z = w.z + dz / distance * (w.r + 1e-6);
        }
        clampRect(p);
        if (settled) break;
      }
      return p;
    }
    function insideInteriorRect(x, z) {
      if (!spec.interior) return false;
      const rect = spec.interior.rect;
      return x >= rect.minX - 0.5 && x <= rect.maxX + 0.5 && z >= rect.minZ - 0.5 && z <= rect.maxZ + 0.5;
    }
    function applySkyState(sky) {
      lastSky = sky;
      scene.background.set(sky.bg);
      if (scene.fog) scene.fog.color.set(sky.fog);
      // 殿内由暖色点光接管：环境/日光压暗（与 17e23f0 内景口径一致），出殿自动恢复。
      hemi.intensity = interiorActive ? sky.hemi * 0.5 : sky.hemi;
      sun.intensity = interiorActive ? sky.sun * 0.3 : sky.sun;
      sun.color.set(sky.sunColor);
      skyEffects.setSky(sky);
      // 夜光配方：把夜幕系数递给场景，灯点（石灯/灯晕）只在夜里亮起
      decorationApi?.setNightFactor?.(Number.isFinite(sky.night) ? sky.night : 0);
    }
    const skyEffects = createSkyEffects(THREE, scene, player);
    const festivalEffects = createFestivalEffects(THREE, scene, player);
    // —— 引导光环（spec.guideRing：绕行类动作的地面光点环，默认隐藏）——
    let guideRing = null, guideRingMaterial = null;
    if (spec.guideRing) {
      guideRingMaterial = new THREE.MeshBasicMaterial({ color: 0xffca6a, transparent: true, opacity: 0.85, depthWrite: false });
      guideRing = new THREE.Group();
      guideRing.name = "guide:ring";
      const dotGeometry = new THREE.SphereGeometry(0.17, 6, 5);
      for (let i = 0; i < 28; i++) {
        const a = i / 28 * Math.PI * 2;
        const dot = new THREE.Mesh(dotGeometry, guideRingMaterial);
        dot.position.set(spec.guideRing.x + Math.cos(a) * spec.guideRing.r, 0.35, spec.guideRing.z + Math.sin(a) * spec.guideRing.r);
        guideRing.add(dot);
      }
      guideRing.visible = false;
      scene.add(guideRing);
    }
    // 祈福姿势：0 无 / 1 合掌 / 2 礼拜（通用姿势开关，场景侧流程驱动）
    let prayerPose = 0;
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
      setSky: applySkyState,
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
                pickAnimalTarget(a); // 目标只取动物区内（修复前是在地块中心圆盘内取，与房子占地重叠）
                a.wait = 1.5 + rnd() * 3.5;
              } else {
                const sp = a.kind === "rabbit" ? 2.6 : 1.1;
                const stepX = dx / d * sp * dt, stepZ = dz / d * sp * dt;
                const ox = a.g.position.x, oz = a.g.position.z;
                a.g.position.x += stepX;
                a.g.position.z += stepZ;
                resolveAnimalPosition(a); // 实体推离 + 动物区硬边界钳制（修复前无任何解算，径直穿房）
                a.g.rotation.y = Math.atan2(dx, dz);
                // 被挡住且几乎没动：放弃当前目标，停一停再换向（挡停，不穿模、不叠进实体）
                if (Math.hypot(a.g.position.x - ox, a.g.position.z - oz) < Math.hypot(stepX, stepZ) * 0.25) {
                  a.tx = a.g.position.x; a.tz = a.g.position.z;
                  a.wait = 0.6 + rnd();
                } else a.wait = 0.1;
              }
            }
            if (a.kind === "rabbit" && d >= 0.4 && a.wait <= 0.1) a.g.position.y = Math.abs(Math.sin(t * 9 + a.phase)) * 0.3;
            else if (a.kind === "chicken") a.g.rotation.x = Math.max(0, Math.sin(t * 2.2 + a.phase)) * 0.28;
            else a.g.position.y = 0;
            // 接地阴影抵消啄食俯身/兔跳离地，始终平贴地面
            if (a.shadow) {
              a.shadow.rotation.x = -Math.PI / 2 - a.g.rotation.x;
              a.shadow.position.y = 0.055 - a.g.position.y;
            }
            // 羊吃草：停留或慢走时低头啃草，周期末抬头张望
            if (a.kind === "sheep" && a.head) {
              const cycle = (t * 0.45 + a.phase) % 3.4;
              const target = (d < 0.4 || a.wait > 0.15) && cycle < 2 ? 0.72 : 0.05;
              a.head.rotation.x += (target - a.head.rotation.x) * Math.min(1, dt * 3.5);
            }
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
          const rawX = mover.position.x + mx / mm * sp * dt, rawZ = mover.position.z + mz / mm * sp * dt;
          const next = interiorActive && mover === player
            ? resolveInterior(rawX, rawZ, mover.position)
            : resolveMover(rawX, rawZ, mover.position, mounted ? 0.85 : 0.35, mounted ? 2.9 : 2.3, !mounted);
          mover.position.x = next.x; mover.position.z = next.z;
          if (!mounted && !interiorActive) targetFloorY = next.feetY;
          mover.rotation.y = Math.atan2(mx, mz);
          walkPhase += dt * (mounted ? 13 : 9.5);
        }
        if (!mounted) {
          floorY += (targetFloorY - floorY) * Math.min(1, dt * 9);
          if (Math.abs(targetFloorY - floorY) < 0.01) floorY = targetFloorY;
        }
        if (mounted) {
          player.position.set(horse.position.x, 1.52, horse.position.z);
          player.rotation.y = horse.rotation.y;
          const trot = moving ? Math.sin(walkPhase) * 0.5 : 0;
          hLegs[0].rotation.x = trot; hLegs[3].rotation.x = trot;
          hLegs[1].rotation.x = -trot; hLegs[2].rotation.x = -trot;
          legL.rotation.x = -0.55; legR.rotation.x = -0.55;
          armL.rotation.x = -0.45; armR.rotation.x = -0.45;
        } else if (prayerPose === 1) {
          // 合掌：双臂向前上方收拢，静立
          armL.rotation.x = -1.22; armR.rotation.x = -1.22;
          armL.rotation.z = 0.16; armR.rotation.z = -0.16;
          legL.rotation.x = 0; legR.rotation.x = 0;
        } else if (prayerPose === 2) {
          // 礼拜：双臂微伸、上身前俯（俯角在下方 pBody 处叠加）
          armL.rotation.x = -0.4; armR.rotation.x = -0.4;
          armL.rotation.z = 0.08; armR.rotation.z = -0.08;
          legL.rotation.x = 0; legR.rotation.x = 0;
        } else {
          const sw = moving ? Math.sin(walkPhase) * 0.55 : dancing ? Math.sin(t * 7) * 0.5 : 0;
          armL.rotation.x = sw; armR.rotation.x = -sw;
          armL.rotation.z = 0; armR.rotation.z = 0;
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
              const next = resolveMover(horse.position.x + dx / distance * step, horse.position.z + dz / distance * step, horse.position, 0.85, 2.9, false);
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
        // 跪姿/叩首缓动（寺院动作驱动，与坐姿互斥：setter 侧进入任一姿态即清掉其他）
        kneelBlend += (kneelTarget - kneelBlend) * Math.min(1, dt * 4);
        if (Math.abs(kneelTarget - kneelBlend) < 0.002) kneelBlend = kneelTarget;
        bowBlend += (bowTarget - bowBlend) * Math.min(1, dt * 3.2);
        if (Math.abs(bowTarget - bowBlend) < 0.002) bowBlend = bowTarget;
        if (!mounted && !dancing) {
          const sink = 0.42 * restBlend + 0.52 * kneelBlend + 0.08 * bowBlend;
          player.position.y = floorY - sink; // 地面高度（平台/楼板/台阶）托底，姿态下沉叠加其上
          pBody.rotation.x = prayerPose === 2 ? 0.55 : 0.62 * bowBlend + 0.1 * restBlend;
          if (restBlend > 0.01 && !prayerPose) { legL.rotation.x = -1.35 * restBlend; legR.rotation.x = -1.35 * restBlend; }
          if (kneelBlend > 0.01 && !moving) { legL.rotation.x = -1.45 * kneelBlend; legR.rotation.x = -1.32 * kneelBlend; }
          if (kneelBlend > 0.5 && !prayerPose && !beadsHeld) { armL.rotation.x = -0.55 * kneelBlend; armR.rotation.x = -0.55 * kneelBlend; }
          if (beadsHeld) {
            armL.rotation.x = -0.92; armR.rotation.x = -0.92;
            armL.rotation.z = 0.26; armR.rotation.z = -0.26;
            // 逐颗步进：珠串向目标角缓动，过一颗时轻微一胀（逐颗反馈的位移部分）
            beadShown += (beadAngle - beadShown) * Math.min(1, dt * 9);
            beadGroup.rotation.z = beadShown;
            beadPulse = Math.max(0, beadPulse - dt * 3);
            const beadScale = 1 + 0.07 * beadPulse;
            beadGroup.scale.set(beadScale, beadScale, beadScale);
          }
        }
        // 呼吸：站立极轻，坐下后放大到看得见的胸廓起伏（头部同相位微浮）
        const breathAmp = 0.012 + 0.038 * restBlend;
        pBody.scale.y = moving ? 1 : 1 + Math.sin(t * 1.6) * breathAmp;
        pHead.position.y = 2.05 + (moving ? 0 : Math.sin(t * 1.6) * 0.03 * restBlend);
        playerShadow.position.set(player.position.x, 0.055, player.position.z);
        playerShadow.visible = !mounted;
        horseShadow.visible = horseShown;
        if (horseShown) horseShadow.position.set(horse.position.x, 0.055, horse.position.z);
        decorationApi?.setPlayerPosition?.(player.position.x, player.position.z);
        // 静坐呼吸光：与呼吸同周期（t*1.6），仅室内且坐姿混合时发光，其余时刻为 0
        decorationApi?.setBreathGlow?.(interiorActive ? restBlend * (0.55 + 0.45 * Math.sin(t * 1.6)) : 0);
        skyEffects.update(dt, t);
        festivalEffects.update(dt);
        if (guideRing?.visible) guideRingMaterial.opacity = 0.6 + 0.3 * Math.sin(t * 2.4);
        applyCamera(Math.min(1, dt * 5));
      },
      setMoveInput(x, z) {
        moveIn.x = Number.isFinite(x) ? x : 0; moveIn.z = Number.isFinite(z) ? z : 0;
        if (Math.hypot(moveIn.x, moveIn.z) > 0.12) { resting = false; if (dancing) stopDance(); }
      },
      getPlayerPos: () => mounted
        ? { x: horse.position.x, z: horse.position.z }
        : { x: player.position.x, z: player.position.z },
      getPlayerForward() {
        const rotation = mounted ? horse.rotation.y : player.rotation.y;
        return { x: Math.sin(rotation), z: Math.cos(rotation) };
      },
      showHorse(x, z) {
        if (!Number.isFinite(x) || !Number.isFinite(z)) return;
        horseShown = true; horse.visible = true;
        if (!mounted) { const p = resolveMover(x, z, horse.position, 0.85, 2.9, false); horse.position.set(p.x, 0, p.z); }
      },
      hideHorse() {
        stopDance();
        prayerPose = 0;
        kneelTarget = 0; kneelBlend = 0; bowTarget = 0; bowBlend = 0;
        if (beadsHeld) { beadsHeld = false; beadGroup.visible = false; }
        if (interiorActive) { interiorActive = false; interiorReturn = null; if (lastSky) applySkyState(lastSky); }
        resting = false; restBlend = 0; pBody.rotation.x = 0;
        if (mounted) {
          const p = resolveMover(horse.position.x + 2.2, horse.position.z + 0.6, horse.position, 0.35, 2.3, true);
          floorY = targetFloorY = p.feetY;
          player.position.set(p.x, floorY, p.z);
        } else player.position.y = floorY;
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
        if (value) { kneelTarget = 0; bowTarget = 0; if (beadsHeld) { beadsHeld = false; beadGroup.visible = false; } }
        resting = !!value;
        if (resting) prayerPose = 0;
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
        floorY = 0; targetFloorY = 0; // 纵歌场是开阔地面，脚下高度归零
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
      restoreCustomPlot,
      checkPlotSpot(x, z) { return checkCustomPlotSpot(placementSpec, plotList, x, z); },
      getRoadNetwork,
      restorePlayerRoads,
      quotePlayerRoad,
      checkHomeRoadAccess,
      setRoadPreview,
      clearRoadPreview,
      setMounted(b) {
        if (!horseShown || mounted === !!b) return;
        if (interiorActive && b) return; // 殿内不上马（进寺前已在门外下马）
        stopDance();
        prayerPose = 0;
        resting = false; restBlend = 0; pBody.rotation.x = 0;
        mounted = !!b; moveIn.x = 0; moveIn.z = 0;
        if (mounted) {
          player.position.set(horse.position.x, 1.52, horse.position.z);
          player.rotation.y = horse.rotation.y;
        } else {
          const p = resolveMover(horse.position.x + 2.2, horse.position.z + 0.6, horse.position, 0.35, 2.3, true);
          floorY = targetFloorY = p.feetY;
          player.position.set(p.x, floorY, p.z);
          hLegs.forEach(leg => { leg.rotation.x = 0; });
        }
        applyCamera(0);
      },
      isMounted: () => mounted,
      getHorsePos: () => horseShown ? { x: horse.position.x, z: horse.position.z } : null,
      debugSetHorse(x, z) { if (Number.isFinite(x) && Number.isFinite(z)) horse.position.set(x, 0, z); },
      getPlots: () => plotList.map(p => ({ site: p.site, idx: p.idx, id: p.id || null, reserved: !!p.reserved, x: p.x, z: p.z, face: p.face, claimed: p.claimed, hut: p.hut,
        house: p.house, field: !!p.fieldGroup, fieldStage: p.fieldStage,
        animals: { chicken: p.animals.filter(a => a.kind === "chicken").length, sheep: p.animals.filter(a => a.kind === "sheep").length, rabbit: p.animals.filter(a => a.kind === "rabbit").length } })),
      getAnimalsDebug: () => plotList.flatMap(p => p.animals.map(a => ({ site: p.site, idx: p.idx, kind: a.kind, x: a.g.position.x, z: a.g.position.z }))),
      getPlayerFloorY: () => floorY,
      getSites: () => spec.sites.map(s => ({ x: s.x, z: s.z })),
      getHallPos: () => ({ ...spec.hallPos }),
      getCrystalPos: () => ({ ...spec.crystalPos }),
      getSpawn: () => ({ ...spec.spawn }),
      resolveLandPosition(x, z) {
        if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
        return land.resolve(x, z, player.position);
      },
      getSpec: () => ({ bounds: { ...spec.bounds }, waters: (spec.waters || []).map(w => ({ ...w })), colliders: colliders.map(w => ({ ...w })), spawn: { ...spec.spawn } }),
      setPlayerYaw(yaw) { if (Number.isFinite(yaw)) player.rotation.y = yaw; },
      setPrayerPose(value) {
        prayerPose = [0, 1, 2].includes(value) ? value : 0;
        if (prayerPose) { stopDance(); resting = false; }
      },
      getPrayerPose: () => prayerPose,
      setGuideRingVisible(value) { if (guideRing) guideRing.visible = !!value; },
      isGuideRingVisible: () => !!guideRing?.visible,
      getPrayerSite: () => spec.prayerSite ? {
        entry: { ...spec.prayerSite.entry }, spot: { ...spec.prayerSite.spot }, ring: { ...spec.prayerSite.ring },
      } : null,
      // —— 总佛寺（纠偏样板）：姿态与室内接口 ——
      setKneeling(value) {
        kneelTarget = value ? 1 : 0;
        if (value) { resting = false; if (dancing) stopDance(); }
      },
      isKneeling: () => kneelTarget > 0,
      setBow(value) { bowTarget = value ? 1 : 0; },
      setBeadsHeld(value) {
        beadsHeld = !!value;
        beadGroup.visible = beadsHeld;
        if (beadsHeld) resting = false;
      },
      isBeadsHeld: () => beadsHeld,
      // 念珠过一颗：目标角步进一颗（2π/12），update 里缓动到位；声音触发点在场景 templeFx.rollBead。
      rollBead() { beadAngle -= Math.PI * 2 / 12; beadPulse = 1; },
      enterInterior() {
        if (!spec.interior || mounted || interiorActive) return false;
        stopDance();
        prayerPose = 0; resting = false; restBlend = 0; pBody.rotation.x = 0;
        moveIn.x = 0; moveIn.z = 0;
        interiorReturn = { x: player.position.x, z: player.position.z };
        interiorActive = true;
        floorY = targetFloorY = 0; // 殿内地面高度由内景系统单独管理
        player.position.set(spec.interior.entry.x, 0, spec.interior.entry.z);
        if (Number.isFinite(spec.interior.entry.yaw)) player.rotation.y = spec.interior.entry.yaw;
        if (lastSky) applySkyState(lastSky);
        camPos.set(player.position.x + radius * Math.sin(polar) * Math.sin(yaw), 14, player.position.z + radius * Math.sin(polar) * Math.cos(yaw));
        applyCamera(0);
        return true;
      },
      exitInterior() {
        if (!interiorActive) return false;
        interiorActive = false;
        prayerPose = 0;
        kneelTarget = 0; kneelBlend = 0; bowTarget = 0; bowBlend = 0;
        if (beadsHeld) { beadsHeld = false; beadGroup.visible = false; }
        resting = false; restBlend = 0; pBody.rotation.x = 0;
        moveIn.x = 0; moveIn.z = 0;
        const back = interiorReturn || spec.interior.gate;
        interiorReturn = null;
        const p = resolveMover(back.x, back.z, player.position, 0.35, 2.3, true);
        floorY = targetFloorY = p.feetY;
        player.position.set(p.x, floorY, p.z);
        if (lastSky) applySkyState(lastSky);
        camPos.set(p.x + radius * Math.sin(polar) * Math.sin(yaw), 14, p.z + radius * Math.sin(polar) * Math.cos(yaw));
        applyCamera(0);
        return true;
      },
      isInteriorActive: () => interiorActive,
      getInterior: () => spec.interior || null,
      getTempleSite: () => spec.templeSite || null,
      getDecorationApi: () => decorationApi,
      getHomeLayout: () => ({
        houseAlong: [-HOME_BACK - PLATFORM_HALF, -HOME_BACK + PLATFORM_HALF],
        bedsAlong: [FIELD_FORWARD - BED_EXTENT, FIELD_FORWARD + BED_EXTENT],
        houseLat: [-PLATFORM_HALF, PLATFORM_HALF],
        bedsLat: [-BED_EXTENT, BED_EXTENT],
        // 逻辑修复轮：动物区（地块局部系）与房门信息，供回归测试断言边界/可进出
        animalZone: { ...ANIMAL_ZONE },
        houseCenterAlong: -HOME_BACK,
        doorHalfWidth: 0.9,
      }),
      getMapFeatures,
      setFestivalVisible(id) {
        for (const [key, group] of Object.entries(festivalGroups)) group.visible = key === id;
      },
      nearestInteractable() {
        if (horseShown && !mounted && Math.hypot(player.position.x - horse.position.x, player.position.z - horse.position.z) < 6.5) return { type: "horse" };
        if (Math.hypot(player.position.x - spec.crystalPos.x, player.position.z - spec.crystalPos.z) < 9.5) return { type: "crystal" };
        if (Math.hypot(player.position.x - spec.hallPos.x, player.position.z - spec.hallPos.z) < 12.5) return { type: "hall" };
        let best = null, bd = Infinity;
        for (const p of plotList) {
          const d = Math.hypot(player.position.x - p.x, player.position.z - p.z);
          if (d < (p.interactR || 10.5) && d < bd) { bd = d; best = p; }
        }
        return best ? { type: "plot", site: best.site, idx: best.idx, id: best.id || null, reserved: !!best.reserved, claimed: best.claimed, hut: best.hut } : null;
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
        prayerPose = 0;
        kneelTarget = 0; kneelBlend = 0; bowTarget = 0; bowBlend = 0;
        if (beadsHeld) { beadsHeld = false; beadGroup.visible = false; }
        if (guideRing) guideRing.visible = false;
        resting = false; restBlend = 0; pBody.rotation.x = 0;
        moveIn.x = 0; moveIn.z = 0;
        if (interiorActive && insideInteriorRect(x, z)) {
          const inner = resolveInterior(x, z, player.position);
          floorY = targetFloorY = 0;
          player.position.set(inner.x, 0, inner.z);
          camPos.set(inner.x + radius * Math.sin(polar) * Math.sin(yaw), 14, inner.z + radius * Math.sin(polar) * Math.cos(yaw));
          applyCamera(0);
          return;
        }
        if (interiorActive) { interiorActive = false; interiorReturn = null; if (lastSky) applySkyState(lastSky); }
        const p = resolveMover(x, z, player.position, mounted ? 0.85 : 0.35, mounted ? 2.9 : 2.3, !mounted);
        if (mounted) horse.position.set(p.x, 0, p.z);
        else floorY = targetFloorY = p.feetY;
        player.position.set(p.x, mounted ? 1.52 : floorY, p.z);
        camPos.set(p.x + radius * Math.sin(polar) * Math.sin(yaw), 14, p.z + radius * Math.sin(polar) * Math.cos(yaw));
        applyCamera(0);
      },
      debugSetPlayer(x, z) {
        if (!Number.isFinite(x) || !Number.isFinite(z)) return;
        if (interiorActive && !insideInteriorRect(x, z)) { interiorActive = false; interiorReturn = null; if (lastSky) applySkyState(lastSky); }
        floorY = targetFloorY = interiorActive ? 0 : floorHeightAt(x, z);
        player.position.set(x, floorY, z);
        camPos.set(x + radius * Math.sin(polar) * Math.sin(yaw), 14, z + radius * Math.sin(polar) * Math.cos(yaw));
        applyCamera(0);
      },
    };
  }

  return { createDamScene, createLandResolver, checkCustomPlotSpot, createSkyEffects, createHomeProps, createFestivalEffects, BOND };
});
