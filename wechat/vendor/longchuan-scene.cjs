// 安和里 · 陇川坝（第 16 轮起建在通用坝引擎 dam-world 上：可走、可安家）
// 真实格局：南宛河纵贯坝心过章凤南下；龙川江在东、户撒河在西；麻栗坝水库在南宛河中游；
// 目瑙纵歌场在镇西；陇川马场在镇东北（马源，传送水晶在此）；王子山在西北；户撒刀坊、护国古关在西线。
(function (global, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else global.AnheliLongchuan = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function createLongchuanScene(THREE, DamWorld) {
    const DW = DamWorld || (typeof globalThis !== "undefined" ? globalThis.AnheliDamWorld : null);
    return DW.createDamScene(THREE, {
      dance: { x: -52, z: 26, r: 9.5 },
      seed: 55,
      spawn: { x: 95, z: -40 },
      hallPos: { x: -8, z: 30 },
      crystalPos: { x: 99, z: -46 },
      sites: [{ x: 52, z: 66 }, { x: -72, z: -52 }],
      bounds: { rx: 250, rz: 205 },
      waters: [
        { x: -24, z: -160, r: 9 }, { x: -14, z: -75, r: 9 }, { x: -4, z: 0, r: 9 }, { x: 2, z: 80, r: 9 }, { x: 5, z: 160, r: 9 },
        { x: 126, z: -140, r: 10 }, { x: 131, z: -50, r: 10 }, { x: 135, z: 40, r: 10 }, { x: 139, z: 130, r: 10 },
        { x: -136, z: -130, r: 7 }, { x: -130, z: -40, r: 7 }, { x: -125, z: 50, r: 7 }, { x: -121, z: 140, r: 7 },
        { x: -52, z: -96, r: 19 },
      ],
      decorate(root, M, H) {
        const { box, rnd, disc } = H;
        const colliders = [];
        const groundBig = disc(M.meadow, 260, 0, 0, 0);
        groundBig.scale.set(1.15, 0.95, 1);
        root.add(groundBig);
        for (const [gx, gz, gr] of [[-70, 60, 56], [70, -60, 52], [-20, -110, 54], [90, 80, 44]]) root.add(disc(M.meadow2, gr, gx, gz, 0.02));
        const hillDefs = [
          [-225, -70, 62, 44, M.hill2], [-150, -190, 68, 48, M.hill1], [30, -225, 72, 38, M.hill2],
          [180, -160, 60, 40, M.hill3], [232, -20, 56, 32, M.hill1], [238, 100, 54, 28, M.hill3],
          [-238, 40, 58, 34, M.hill1], [-60, 228, 68, 30, M.hill2], [120, 218, 58, 26, M.hill3],
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
        riverRun([[-30, -215], [-18, -130], [-8, -50], [-2, 30], [2, 110], [6, 200]], 9.5);
        riverRun([[120, -190], [128, -100], [132, -10], [136, 80], [140, 170]], 11);
        riverRun([[-140, -180], [-132, -90], [-128, 0], [-124, 90], [-120, 180]], 7);
        const reservoir = new THREE.Mesh(new THREE.CircleGeometry(21, 18), M.water.clone());
        reservoir.rotation.x = -Math.PI / 2; reservoir.position.set(-52, 0.05, -96);
        reservoir.scale.set(1.2, 0.85, 1);
        root.add(reservoir); waters.push(reservoir);
        // 章凤镇心：集市 + 大厅
        const market = new THREE.Group();
        market.position.set(16, 0, 18);
        market.add(disc(M.earth, 14, 0, 0, 0.03));
        market.add(box(1.7, 2.6, 0.4, M.stoneD, -6, 1.3, -5));
        for (const [lx, lz] of [[9, -7], [-9, 7]]) {
          market.add(box(0.24, 2.6, 0.24, M.wood, lx, 1.3, lz));
          market.add(box(0.55, 0.55, 0.55, M.gold, lx, 2.9, lz));
        }
        root.add(market);
        const hallP = new THREE.Group();
        hallP.position.set(-8, 0, 30);
        const hb = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 5, 0.5, 10), M.stone);
        hb.position.y = 0.25; hallP.add(hb);
        for (const [px, pz] of [[-3.2, -3.2], [3.2, -3.2], [-3.2, 3.2], [3.2, 3.2]]) hallP.add(box(0.4, 4.4, 0.4, M.wood, px, 2.7, pz));
        hallP.add(box(8.6, 0.4, 8.6, M.roofD, 0, 5.3, 0));
        hallP.add(box(0.95, 0.95, 0.95, M.gold, 0, 4.2, 5.6));
        hallP.add(box(0.3, 3.4, 0.3, M.woodDark, 0, 2.2, 5.6));
        root.add(hallP);
        colliders.push({ x: -8, z: 30, r: 4.5 });
        // 目瑙纵歌场
        const zongge = new THREE.Group();
        zongge.position.set(-52, 0, 26);
        const zgDisc = new THREE.Mesh(new THREE.CylinderGeometry(13, 13.5, 0.35, 24), M.earth);
        zgDisc.position.y = 0.17; zongge.add(zgDisc);
        const zgRing = new THREE.Mesh(new THREE.CylinderGeometry(10.6, 10.6, 0.42, 24), M.road);
        zgRing.position.y = 0.19; zongge.add(zgRing);
        zongge.add(box(0.8, 9.5, 0.8, M.woodDark, 0, 4.75, 0));
        for (const [ty2, tw] of [[3.2, 3.6], [5.6, 2.8], [8, 2]]) zongge.add(box(tw, 0.5, tw, M.red, 0, ty2, 0));
        const zgTip = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.8, 6), M.gold);
        zgTip.position.y = 10.2; zongge.add(zgTip);
        root.add(zongge);
        colliders.push({ x: -52, z: 26, r: 2.6 });
        for (const x of [-40, -64]) {
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 3.4, 6), M.woodDark);
          post.position.set(x, 1.7, 42); root.add(post);
          const glow = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd9a0 }));
          glow.name = "landmark:dance-lamp";
          glow.position.set(x, 3.65, 42); root.add(glow);
          const cap = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.5, 6), M.roofD);
          cap.position.set(x, 4.15, 42); root.add(cap);
        }
        // 纵歌场门楼（南口）与场边大鼓
        const zgGate = new THREE.Group();
        zgGate.position.set(-52, 0, 41.5);
        zgGate.add(box(0.5, 5.6, 0.5, M.woodDark, -3.4, 2.8, 0));
        zgGate.add(box(0.5, 5.6, 0.5, M.woodDark, 3.4, 2.8, 0));
        zgGate.add(box(8.6, 0.7, 0.8, M.woodDark, 0, 5.4, 0));
        zgGate.add(box(5.6, 0.5, 0.6, M.red, 0, 6.2, 0));
        root.add(zgGate);
        colliders.push({ x: -55.4, z: 41.5, r: 0.9 }, { x: -48.6, z: 41.5, r: 0.9 });
        for (const dx of [-7.5, 7.5]) {
          const drum = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 1.5, 10), M.red);
          drum.position.set(-52 + dx, 0.75, 30);
          root.add(drum);
          const drumTop = new THREE.Mesh(new THREE.CylinderGeometry(1.16, 1.16, 0.12, 10), M.cream);
          drumTop.position.set(-52 + dx, 1.55, 30);
          root.add(drumTop);
          colliders.push({ x: -52 + dx, z: 30, r: 1.5 });
        }
        // 陇川马场（水晶由引擎落在场边）
        const farm = new THREE.Group();
        farm.position.set(86, 0, -58);
        farm.add(disc(M.earth, 19, 0, 0, 0.03));
        for (let i = 0; i < 14; i++) {
          const a = i / 14 * Math.PI * 2;
          farm.add(box(0.22, 1.5, 0.22, M.wood, Math.cos(a) * 17.5, 0.75, Math.sin(a) * 17.5));
          const rail = box(7.6, 0.16, 0.16, M.wood, Math.cos(a + 0.22) * 17.5, 1.15, Math.sin(a + 0.22) * 17.5);
          rail.rotation.y = -a - 0.22 + Math.PI / 2;
          farm.add(rail);
        }
        farm.add(box(10, 3, 5, M.wood, -8, 1.5, -12));
        farm.add(box(11.5, 0.3, 6.5, M.roofD, -8, 3.6, -12));
        function farmHorse(mat, x, z, ry) {
          const g = new THREE.Group();
          const b = new THREE.Mesh(new THREE.SphereGeometry(0.85, 9, 7), mat);
          b.scale.set(0.82, 0.78, 1.5); b.position.y = 1.62; g.add(b);
          const n = box(0.42, 1.05, 0.55, mat, 0, 2.15, 1.15); n.rotation.x = -0.6; g.add(n);
          const hd = box(0.4, 0.45, 0.85, mat, 0, 2.62, 1.62); hd.rotation.x = 0.35; g.add(hd);
          g.add(box(0.44, 0.55, 0.14, M.woodDark, 0, 2.5, 0.92));
          const t = box(0.16, 1.0, 0.16, M.woodDark, 0, 1.7, -1.32); t.rotation.x = 0.4; g.add(t);
          for (const [lx, lz] of [[-0.38, 0.72], [0.38, 0.72], [-0.38, -0.78], [0.38, -0.78]]) g.add(box(0.17, 1.25, 0.17, mat, lx, 0.62, lz));
          g.position.set(x, 0, z);
          g.rotation.y = ry;
          g.scale.setScalar(1.35);
          return g;
        }
        const farmHorses = [
          farmHorse(M.horse, -3, 2, 0.6), farmHorse(M.horse2, 5, -4, -0.9),
          farmHorse(M.horse, 8, 6, 2.4), farmHorse(M.horse2, -8, -6, 1.8),
          farmHorse(M.horse, 1, 10, -2.2),
        ];
        farmHorses.forEach(h => farm.add(h));
        colliders.push({ x: 78, z: -70, r: 5.5 });
        root.add(farm);
        // 户撒刀坊 + 护国古关
        const forge = new THREE.Group();
        forge.position.set(-96, 0, -30);
        forge.add(box(5.5, 2.6, 4.5, M.stoneD, 0, 1.3, 0));
        forge.add(box(6.5, 0.3, 5.5, M.roofD, 0, 3.1, 0));
        forge.add(box(0.8, 3.4, 0.8, M.stoneD, 1.8, 3.4, -1));
        root.add(forge);
        colliders.push({ x: -96, z: -30, r: 3.5 });
        const gate = new THREE.Group();
        gate.position.set(-150, 0, 96);
        gate.rotation.y = 0.5;
        gate.add(box(1.4, 6.5, 1.4, M.stoneD, -3.4, 3.25, 0));
        gate.add(box(1.4, 6.5, 1.4, M.stoneD, 3.4, 3.25, 0));
        gate.add(box(9.5, 1.3, 1.8, M.stoneD, 0, 6.6, 0));
        gate.add(box(7, 1, 1.5, M.roofD, 0, 7.7, 0));
        root.add(gate);
        colliders.push({ x: -150, z: 96, r: 4.5 });
        // 王子山
        const wzHill = new THREE.Mesh(new THREE.ConeGeometry(38, 24, 10), M.hill2);
        wzHill.position.set(-128, 10, -128);
        root.add(wzHill);
        colliders.push({ x: -128, z: -128, r: 20 });
        // 古道
        const roadPts = [[-24, -160], [-12, -80], [4, -20], [16, 18], [10, 80], [8, 150]];
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
        // —— 节日布景：目瑙纵歌环舞（围着高柱转圈的人们）——
        const dancers = new THREE.Group();
        dancers.position.set(-52, 0, 26);
        const dCols = [M.red, M.gold, M.leaf, M.cream, M.roofD];
        for (let i = 0; i < 10; i++) {
          const fg = new THREE.Group();
          const a = i / 10 * Math.PI * 2;
          fg.position.set(Math.cos(a) * 9.5, 0, Math.sin(a) * 9.5);
          const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1, 7), dCols[i % 5]);
          skirt.position.y = 0.5; fg.add(skirt);
          fg.add(box(0.5, 0.6, 0.3, M.cream, 0, 1.25, 0));
          const hd = new THREE.Mesh(new THREE.SphereGeometry(0.26, 7, 6), M.skin);
          hd.position.y = 1.85; fg.add(hd);
          fg.scale.setScalar(1.35);
          dancers.add(fg);
        }
        dancers.visible = false;
        root.add(dancers);
        const lamps = new THREE.Group();
        for (let i = 0; i < 9; i++) {
          const a = i / 9 * Math.PI * 2;
          const sp = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 6), M.gold);
          sp.position.set(-8 + Math.cos(a) * (5.5 + (i % 3) * 1.8), 2, 30 + Math.sin(a) * (5.5 + (i % 3) * 1.8));
          lamps.add(sp);
        }
        lamps.visible = false;
        root.add(lamps);
        // 林木（王子山上密）
        const trunkGeo = new THREE.CylinderGeometry(0.24, 0.34, 1.9, 5);
        const canGeo = new THREE.ConeGeometry(2.1, 5.2, 6);
        const canGeo2 = new THREE.SphereGeometry(2.3, 7, 6);
        function plantTree(x, z, s) {
          const tree = new THREE.Group();
          const tr = new THREE.Mesh(trunkGeo, M.trunk); tr.position.y = 0.95; tree.add(tr);
          const cn = new THREE.Mesh(rnd() > 0.45 ? canGeo : canGeo2, rnd() > 0.4 ? M.leaf : M.leaf2);
          cn.position.y = rnd() > 0.45 ? 4.1 : 3.6; tree.add(cn);
          tree.scale.set(s, s * (0.9 + rnd() * 0.35), s);
          tree.position.set(x, 0, z);
          tree.rotation.y = rnd() * 3;
          root.add(tree);
          colliders.push({ x, z, r: 0.55 });
        }
        for (let i = 0; i < 105; i++) {
          const a = rnd() * Math.PI * 2, r = 28 + rnd() * 172;
          const x = Math.cos(a) * r * 1.12, z = Math.sin(a) * r * 0.94;
          if (Math.abs(x + 8) < 15 || Math.abs(x - 132) < 16 || Math.abs(x + 128) < 14) continue;
          if (Math.hypot(x + 52, z + 96) < 24) continue;
          if (Math.hypot(x - 16, z - 18) < 20 || Math.hypot(x + 52, z - 26) < 19) continue;
          if (Math.hypot(x - 86, z + 58) < 24) continue;
          if (Math.hypot(x + 128, z + 128) < 30) continue;
          if (Math.hypot(x - 52, z - 66) < 16 || Math.hypot(x + 72, z + 52) < 16) continue;
          plantTree(x, z, 0.85 + rnd() * 1.25);
        }
        for (let i = 0; i < 16; i++) {
          const a = rnd() * Math.PI * 2, r = 8 + rnd() * 22;
          plantTree(-128 + Math.cos(a) * r, -128 + Math.sin(a) * r, 0.9 + rnd());
        }
        // 云
        const clouds = [];
        for (let i = 0; i < 4; i++) {
          const cl = new THREE.Group();
          for (const [cx, cy, cz, r] of [[0, 0, 0, 9], [8, 1.5, 2, 6.5], [-8, 1, -1, 7], [2, 3, -2, 5]]) {
            const s = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), M.cloud);
            s.position.set(cx, cy, cz); s.scale.y = 0.42; cl.add(s);
          }
          cl.position.set(-180 + i * 110, 62 + (i % 3) * 9, -110 + (i % 4) * 70);
          root.add(cl);
          clouds.push(cl);
        }
        return { colliders, festivalGroups: { munao: dancers, dengdeng: lamps }, animate(dt, t) {
          if (dancers.visible) {
            dancers.rotation.y += dt * 0.22;
            dancers.children.forEach((fg, i) => { fg.position.y = Math.abs(Math.sin(t * 2.2 + i * 1.3)) * 0.35; });
          }
          if (lamps.visible) lamps.children.forEach((sp, i) => { sp.position.y = 1.6 + ((t * 0.45 + i * 0.77) % 5.5); });
          waters.forEach((w, i) => { w.material.color.setHSL(0.54, 0.34, 0.63 + Math.sin(t * 0.6 + i * 0.8) * 0.028); });
          farmHorses.forEach((h, i) => { h.rotation.y += Math.sin(t * 0.24 + i * 2.1) * dt * 0.14; });
          for (const cl of clouds) {
            cl.position.x += dt * 1.1;
            if (cl.position.x > 250) cl.position.x = -250;
          }
        } };
      },
    });
  }

  return { createLongchuanScene };
});
