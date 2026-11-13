// 安和里 · 盈江坝（第 16 轮起建在通用坝引擎 dam-world 上：可走、可安家）
// 真实格局：全州最大的坝子；槟榔江（西北）与南底河（东北）在旧城汇成大盈江纵贯向南；
// 平原镇在坝心江畔；允燕塔在城东允燕山上；凯邦亚湖在西南高山（户宋河水库）；榕树王在西北；虎跳石在江中。
(function (global, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else global.AnheliYingjiang = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function createYingjiangScene(THREE, DamWorld) {
    const DW = DamWorld || (typeof globalThis !== "undefined" ? globalThis.AnheliDamWorld : null);
    return DW.createDamScene(THREE, {
      seed: 31,
      spawn: { x: -10, z: 10 },
      hallPos: { x: -40, z: 6 },
      crystalPos: { x: -9.5, z: -3.5 },
      sites: [{ x: -72, z: 30 }, { x: 58, z: 66 }],
      bounds: { rx: 255, rz: 210 },
      waters: [
        { x: -100, z: -178, r: 10 }, { x: -55, z: -128, r: 10 }, { x: 88, z: -176, r: 10 }, { x: 44, z: -130, r: 10 },
        { x: -20, z: -80, r: 11 }, { x: -2, z: -25, r: 12 }, { x: 0, z: 40, r: 12 },
        { x: -10, z: 110, r: 12 }, { x: -20, z: 180, r: 12 },
        { x: -168, z: 148, r: 15 },
      ],
      decorate(root, M, H) {
        const { box, rnd, disc } = H;
        const colliders = [];
        const groundBig = disc(M.meadow, 265, 0, 0, 0);
        groundBig.scale.set(1.15, 0.95, 1);
        root.add(groundBig);
        for (const [gx, gz, gr] of [[-80, 40, 60], [60, 90, 55], [-40, -90, 58], [100, -40, 46]]) root.add(disc(M.meadow2, gr, gx, gz, 0.02));
        const hillDefs = [
          [-225, -90, 64, 46, M.hill2], [-140, -205, 70, 42, M.hill1], [20, -228, 74, 40, M.hill2],
          [170, -180, 62, 44, M.hill3], [235, -40, 58, 34, M.hill1], [240, 90, 56, 30, M.hill3],
          [-235, 60, 60, 36, M.hill1], [-190, 150, 58, 48, M.hill2], [90, 225, 66, 30, M.hill3],
        ];
        for (const [hx, hz, r, h, mat] of hillDefs) {
          const hill = new THREE.Mesh(new THREE.ConeGeometry(r, h, 9), mat);
          hill.position.set(hx, h / 2 - 2, hz);
          root.add(hill);
          colliders.push({ x: hx, z: hz, r: r * 0.52 });
        }
        const waters = [];
        function riverRun(pts, r) {
          for (let i = 0; i < pts.length - 1; i++) {
            const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
            const steps = Math.max(4, Math.ceil(Math.hypot(bx - ax, bz - az) / 12));
            for (let s = 0; s < steps; s++) {
              const t0 = s / steps;
              const w = new THREE.Mesh(new THREE.CircleGeometry(r, 12), M.water.clone());
              w.rotation.x = -Math.PI / 2;
              w.position.set(ax + (bx - ax) * t0, 0.05, az + (bz - az) * t0);
              w.scale.set(0.85, 1.3, 1);
              root.add(w); waters.push(w);
            }
          }
        }
        riverRun([[-120, -210], [-70, -150], [-34, -105]], 8);
        riverRun([[110, -205], [62, -152], [26, -108]], 8);
        riverRun([[-34, -105], [-6, -52], [4, 10], [-4, 80], [-16, 150], [-24, 215]], 12.5);
        for (const [rx, rz, s] of [[-2, 42, 2.6], [5, 48, 1.9], [-6, 52, 1.6], [2, 58, 2.2]]) {
          const rock = new THREE.Mesh(new THREE.SphereGeometry(s, 7, 6), M.stoneD);
          rock.position.set(rx, 0.3, rz); rock.scale.y = 0.55;
          root.add(rock);
        }
        // 凯邦亚湖（西南高山水库）
        const kbHill = new THREE.Mesh(new THREE.ConeGeometry(46, 22, 10), M.hill2);
        kbHill.position.set(-168, 9, 148);
        root.add(kbHill);
        const kbLake = new THREE.Mesh(new THREE.CircleGeometry(17, 16), M.water.clone());
        kbLake.rotation.x = -Math.PI / 2; kbLake.position.set(-168, 17.5, 148);
        kbLake.scale.set(1.25, 0.8, 1);
        root.add(kbLake); waters.push(kbLake);
        colliders.push({ x: -168, z: 148, r: 24 });
        root.add(box(16, 4.5, 3, M.stoneD, -150, 14.5, 160));
        // 允燕塔（城东山上）
        const yyHill = new THREE.Mesh(new THREE.ConeGeometry(26, 11, 10), M.hill3);
        yyHill.position.set(96, 3.5, -30);
        root.add(yyHill);
        const yy = new THREE.Group();
        yy.position.set(96, 9, -30);
        yy.add(box(9, 1.2, 9, M.stone, 0, 0.6, 0));
        const tiers = [[3.6, 2.8], [2.9, 2.4], [2.3, 2.1], [1.8, 1.9]];
        let ty2 = 1.2;
        for (const [r, h] of tiers) {
          const c = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.85, r, h, 10), M.cream);
          c.position.y = ty2 + h / 2; yy.add(c); ty2 += h;
        }
        const ytip = new THREE.Mesh(new THREE.ConeGeometry(0.7, 2.8, 8), M.gold);
        ytip.position.y = ty2 + 1.4; yy.add(ytip);
        root.add(yy);
        colliders.push({ x: 96, z: -30, r: 13.5 });
        // 榕树王（西北）
        const king = new THREE.Group();
        king.position.set(-128, 0, -88);
        const kTrunk = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.2, 6.4, 8), M.trunk);
        kTrunk.position.y = 3.2; king.add(kTrunk);
        for (const [cx, cy, cz, r] of [[0, 9.6, 0, 9.4], [-6, 8.4, 2, 6.4], [6, 8.8, -2, 6.8]]) {
          const c = new THREE.Mesh(new THREE.SphereGeometry(r, 9, 7), M.leaf2);
          c.position.set(cx, cy, cz); c.scale.y = 0.55; king.add(c);
        }
        root.add(king);
        colliders.push({ x: -128, z: -88, r: 3.6 });
        // 平原镇心：集市 + 大厅
        const market = new THREE.Group();
        market.position.set(-16, 0, -8);
        market.add(disc(M.earth, 15, 0, 0, 0.03));
        market.add(box(1.7, 2.6, 0.4, M.stoneD, -6, 1.3, -5));
        for (const [lx, lz] of [[9, -7], [-9, 7], [10, 8]]) {
          market.add(box(0.24, 2.6, 0.24, M.wood, lx, 1.3, lz));
          market.add(box(0.55, 0.55, 0.55, M.gold, lx, 2.9, lz));
        }
        root.add(market);
        const hallP = new THREE.Group();
        hallP.position.set(-40, 0, 6);
        const hb = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 5, 0.5, 10), M.stone);
        hb.position.y = 0.25; hallP.add(hb);
        for (const [px, pz] of [[-3.2, -3.2], [3.2, -3.2], [-3.2, 3.2], [3.2, 3.2]]) hallP.add(box(0.4, 4.4, 0.4, M.wood, px, 2.7, pz));
        hallP.add(box(8.6, 0.4, 8.6, M.roofD, 0, 5.3, 0));
        hallP.add(box(0.95, 0.95, 0.95, M.gold, 0, 4.2, 5.6));
        hallP.add(box(0.3, 3.4, 0.3, M.woodDark, 0, 2.2, 5.6));
        root.add(hallP);
        colliders.push({ x: -40, z: 6, r: 4.5 });
        // 古道
        const roadPts = [[-6, -104], [-12, -52], [-16, -8], [-14, 50], [-18, 120], [-24, 200]];
        for (let i = 0; i < roadPts.length - 1; i++) {
          const [ax, az] = roadPts[i], [bx, bz] = roadPts[i + 1];
          for (let s = 0; s < 3; s++) {
            const t0 = s / 3;
            const seg = new THREE.Mesh(new THREE.CircleGeometry(4.4, 10), M.road);
            seg.rotation.x = -Math.PI / 2;
            seg.position.set(ax + (bx - ax) * t0, 0.04, az + (bz - az) * t0);
            seg.scale.set(1, 1.5, 1);
            root.add(seg);
          }
        }
        // 江畔水车（灌溉的意象，慢慢转）
        const wheel = new THREE.Group();
        wheel.position.set(15.5, 4.6, 30);
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.6, 8), M.woodDark);
        hub.rotation.x = Math.PI / 2; wheel.add(hub);
        for (let i = 0; i < 8; i++) {
          const a = i / 8 * Math.PI * 2;
          const spoke = box(0.24, 4.4, 0.24, M.wood, Math.cos(a) * 2.1, Math.sin(a) * 2.1, 0);
          spoke.rotation.z = a + Math.PI / 2;
          wheel.add(spoke);
          const paddle = box(1.5, 0.7, 0.9, M.bamboo, Math.cos(a) * 4.3, Math.sin(a) * 4.3, 0);
          paddle.rotation.z = a;
          wheel.add(paddle);
        }
        root.add(wheel);
        root.add(box(0.4, 5.4, 0.4, M.wood, 13.4, 2.7, 27.6));
        root.add(box(0.4, 5.4, 0.4, M.wood, 13.4, 2.7, 32.4));
        colliders.push({ x: 14.2, z: 30, r: 2.2 });
        const lamps = new THREE.Group();
        for (let i = 0; i < 9; i++) {
          const a = i / 9 * Math.PI * 2;
          const sp = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 6), M.gold);
          sp.position.set(-40 + Math.cos(a) * (5.5 + (i % 3) * 1.8), 2, 6 + Math.sin(a) * (5.5 + (i % 3) * 1.8));
          lamps.add(sp);
        }
        lamps.visible = false;
        root.add(lamps);
        // 林木
        const trunkGeo = new THREE.CylinderGeometry(0.24, 0.34, 1.9, 5);
        const canGeo = new THREE.ConeGeometry(2.1, 5.2, 6);
        const canGeo2 = new THREE.SphereGeometry(2.3, 7, 6);
        const riverPts = [[-120, -210], [-70, -150], [-34, -105], [110, -205], [62, -152], [26, -108], [-6, -52], [4, 10], [-4, 80], [-16, 150], [-24, 215]];
        for (let i = 0; i < 120; i++) {
          const a = rnd() * Math.PI * 2, r = 28 + rnd() * 175;
          const x = Math.cos(a) * r * 1.12, z = Math.sin(a) * r * 0.94;
          let bad = false;
          for (const [rx, rz] of riverPts) if (Math.hypot(x - rx, z - rz) < 17) { bad = true; break; }
          if (bad) continue;
          if (Math.hypot(x + 168, z - 148) < 42) continue;
          if (Math.hypot(x - 96, z + 30) < 24) continue;
          if (Math.hypot(x + 128, z + 88) < 20) continue;
          if (Math.hypot(x + 16, z + 8) < 20) continue;
          if (Math.hypot(x + 72, z - 30) < 16 || Math.hypot(x - 58, z - 66) < 16) continue;
          const tree = new THREE.Group();
          const tr = new THREE.Mesh(trunkGeo, M.trunk); tr.position.y = 0.95; tree.add(tr);
          const cn = new THREE.Mesh(rnd() > 0.45 ? canGeo : canGeo2, rnd() > 0.4 ? M.leaf : M.leaf2);
          cn.position.y = rnd() > 0.45 ? 4.1 : 3.6; tree.add(cn);
          const s = 0.85 + rnd() * 1.25;
          tree.scale.set(s, s * (0.9 + rnd() * 0.35), s);
          tree.position.set(x, 0, z);
          tree.rotation.y = rnd() * 3;
          root.add(tree);
          colliders.push({ x, z, r: 0.55 });
        }
        // 云
        const clouds = [];
        for (let i = 0; i < 4; i++) {
          const cl = new THREE.Group();
          for (const [cx, cy, cz, r] of [[0, 0, 0, 9], [8, 1.5, 2, 6.5], [-8, 1, -1, 7], [2, 3, -2, 5]]) {
            const s = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), M.cloud);
            s.position.set(cx, cy, cz); s.scale.y = 0.42; cl.add(s);
          }
          cl.position.set(-180 + i * 110, 62 + (i % 3) * 9, -120 + (i % 4) * 70);
          root.add(cl);
          clouds.push(cl);
        }
        return { colliders, festivalGroups: { dengdeng: lamps }, animate(dt, t) {
          wheel.rotation.z -= dt * 0.3;
          if (lamps.visible) lamps.children.forEach((sp, i) => { sp.position.y = 1.6 + ((t * 0.45 + i * 0.77) % 5.5); });
          waters.forEach((w, i) => { w.material.color.setHSL(0.54, 0.34, 0.63 + Math.sin(t * 0.6 + i * 0.8) * 0.028); });
          for (const cl of clouds) {
            cl.position.x += dt * 1.1;
            if (cl.position.x > 250) cl.position.x = -250;
          }
        } };
      },
    });
  }

  return { createYingjiangScene };
});
