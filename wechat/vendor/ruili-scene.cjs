// 安和里 · 瑞丽坝（第 16 轮起建在通用坝引擎 dam-world 上：可走、可安家）
// 真实格局：瑞丽江为南界大江；南宛河自东北汇入；弄莫湖（牛轭湖）在城西；
// 姐勒金塔在东北山丘；莫里瀑布在西北山里（雨林）；独树成林在东边芒令；集市与大厅亭在坝心。
(function (global, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else global.AnheliRuili = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function createRuiliScene(THREE, DamWorld) {
    const DW = DamWorld || (typeof globalThis !== "undefined" ? globalThis.AnheliDamWorld : null);
    return DW.createDamScene(THREE, {
      seed: 77,
      spawn: { x: 10, z: 24 },
      hallPos: { x: -27, z: -8 },
      crystalPos: { x: 6.5, z: 10.5 },
      sites: [{ x: -64, z: 66 }, { x: 66, z: -52 }],
      bounds: { rx: 250, rz: 205 },
      waters: [
        { x: -190, z: 174, r: 19 }, { x: -110, z: 179, r: 19 }, { x: -20, z: 181, r: 19 },
        { x: 80, z: 179, r: 19 }, { x: 170, z: 174, r: 19 }, { x: 232, z: 167, r: 17 },
        { x: 50, z: -96, r: 8 }, { x: 38, z: -36, r: 8 }, { x: 24, z: 20, r: 8 }, { x: 14, z: 86, r: 8 },
        { x: -152, z: 58, r: 12.5 }, { x: -136, z: 68, r: 9 }, { x: -163, z: 74, r: 8 }, { x: -140, z: 45, r: 8 }, { x: -126, z: 56, r: 7 },
      ],
      decorate(root, M, H) {
        const { box, rnd, disc } = H;
        const colliders = [];
        const groundBig = disc(M.meadow, 258, 0, 0, 0);
        groundBig.scale.set(1.14, 0.95, 1);
        root.add(groundBig);
        for (const [gx, gz, gr] of [[-90, -40, 58], [80, 70, 52], [-30, 100, 48], [110, -80, 44]]) {
          root.add(disc(M.meadow2, gr, gx, gz, 0.02));
        }
        const hillDefs = [
          [-220, -80, 60, 42, M.hill2], [-150, -180, 68, 40, M.hill1], [30, -215, 70, 38, M.hill2],
          [175, -165, 58, 42, M.hill3], [228, -30, 55, 32, M.hill1], [232, 95, 52, 26, M.hill3],
          [-228, 30, 56, 32, M.hill1], [-40, 218, 70, 28, M.hill2], [140, 205, 55, 24, M.hill3],
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
              w.scale.set(0.9, 1.35, 1);
              root.add(w); waters.push(w);
            }
          }
        }
        riverRun([[-245, 168], [-160, 176], [-60, 182], [50, 181], [160, 175], [248, 164]], 14);
        riverRun([[58, -140], [42, -70], [27, -10], [16, 60], [9, 130], [4, 168]], 6.5);
        for (const [lx, lz, lr] of [[-152, 58, 14], [-136, 68, 10.5], [-163, 74, 9.5], [-140, 45, 9.5], [-126, 56, 8.5]]) {
          const w = new THREE.Mesh(new THREE.CircleGeometry(lr, 14), M.water.clone());
          w.rotation.x = -Math.PI / 2;
          w.position.set(lx, 0.05, lz);
          root.add(w); waters.push(w);
        }
        // 姐勒金塔（东北山丘）
        const jtHill = new THREE.Mesh(new THREE.ConeGeometry(30, 15, 10), M.hill3);
        jtHill.position.set(152, 5.5, -118);
        root.add(jtHill);
        const jt = new THREE.Group();
        jt.position.set(152, 13, -118);
        jt.add(box(11, 1.4, 11, M.stone, 0, 0.7, 0));
        const tiers = [[4.4, 3.1], [3.6, 2.6], [2.8, 2.2], [2.1, 1.9], [1.5, 1.6]];
        let ty = 1.4;
        for (const [r, h] of tiers) {
          const c = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.82, r, h, 10), M.gold);
          c.position.y = ty + h / 2; jt.add(c); ty += h;
        }
        const jtip = new THREE.Mesh(new THREE.ConeGeometry(0.75, 3, 8), M.gold);
        jtip.position.y = ty + 1.5; jt.add(jtip);
        root.add(jt);
        colliders.push({ x: 152, z: -118, r: 16 });
        // 莫里瀑布（西北）
        root.add(box(26, 17, 6, M.stoneD, -158, 8.5, -118));
        colliders.push({ x: -158, z: -118, r: 13 });
        const fallMat = M.water.clone();
        const fall = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 15), fallMat);
        fall.position.set(-158, 8.6, -114.6);
        root.add(fall);
        const pool = new THREE.Mesh(new THREE.CircleGeometry(8.5, 13), M.water.clone());
        pool.rotation.x = -Math.PI / 2; pool.position.set(-158, 0.06, -108);
        root.add(pool); waters.push(pool);
        // 独树成林（东）
        const banyan = new THREE.Group();
        banyan.position.set(128, 0, 26);
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 3.4, 7, 8), M.trunk);
        trunk.position.y = 3.5; banyan.add(trunk);
        for (const [cx, cy, cz, r] of [[0, 10.5, 0, 10.5], [-7, 9.2, 3, 7], [7, 9.6, -3, 7.4], [0, 9, 7.5, 6.6]]) {
          const c = new THREE.Mesh(new THREE.SphereGeometry(r, 9, 7), M.leaf2);
          c.position.set(cx, cy, cz); c.scale.y = 0.55; banyan.add(c);
        }
        for (const [rx, rz] of [[-8, 5], [8.5, 4], [-5, -7.5], [6, -7], [0, 9.5]]) {
          const rt = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 6.4, 5), M.trunk);
          rt.position.set(rx, 3.2, rz);
          banyan.add(rt);
        }
        root.add(banyan);
        colliders.push({ x: 128, z: 26, r: 4 });
        // 集市空地 + 大厅亭
        const market = new THREE.Group();
        market.position.set(0, 0, 6);
        market.add(disc(M.earth, 15, 0, 0, 0.03));
        market.add(box(1.7, 2.6, 0.4, M.stoneD, -6, 1.3, -5));
        for (const [lx, lz] of [[9, -7], [-9, 7], [10, 8]]) {
          market.add(box(0.24, 2.6, 0.24, M.wood, lx, 1.3, lz));
          market.add(box(0.55, 0.55, 0.55, M.gold, lx, 2.9, lz));
        }
        root.add(market);
        const hallP = new THREE.Group();
        hallP.position.set(-27, 0, -8);
        const hb = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 5, 0.5, 10), M.stone);
        hb.position.y = 0.25; hallP.add(hb);
        for (const [px, pz] of [[-3.2, -3.2], [3.2, -3.2], [-3.2, 3.2], [3.2, 3.2]]) hallP.add(box(0.4, 4.4, 0.4, M.wood, px, 2.7, pz));
        hallP.add(box(8.6, 0.4, 8.6, M.roofD, 0, 5.3, 0));
        hallP.add(box(0.95, 0.95, 0.95, M.gold, 0, 4.2, 5.6));
        hallP.add(box(0.3, 3.4, 0.3, M.woodDark, 0, 2.2, 5.6));
        root.add(hallP);
        colliders.push({ x: -27, z: -8, r: 4.5 });
        // 古道：西（弄岛）→ 集市 → 东（畹町）
        const roadPts = [[-190, 44], [-110, 26], [-40, 12], [0, 6], [70, 16], [140, 24], [200, 30]];
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
        // 渡口竹筏（江边泊着，摆渡的意象）
        const raft = new THREE.Group();
        raft.position.set(8, 0, 152);
        raft.rotation.y = 0.4;
        for (let i = 0; i < 5; i++) raft.add(box(0.85, 0.28, 6.4, M.bamboo, -1.8 + i * 0.9, 0.35, 0));
        raft.add(box(0.18, 3.4, 0.18, M.wood, 0, 1.9, -1.5));
        raft.add(box(4.6, 0.14, 0.14, M.woodDark, 0, 0.62, 2.6));
        root.add(raft);
        root.add(box(0.26, 2.4, 0.26, M.wood, 2, 1.2, 144));
        root.add(box(0.26, 2.4, 0.26, M.wood, 11, 1.2, 146));
        // —— 节日布景 ——
        const splash = new THREE.Group();
        splash.position.set(2, 0, 18);
        const dropGeo = new THREE.SphereGeometry(0.17, 6, 5);
        const drops = [];
        for (let i = 0; i < 34; i++) {
          const d = new THREE.Mesh(dropGeo, M.water);
          d.userData = { a: (i / 34) * Math.PI * 2 + rnd() * 0.4, ph: rnd(), sp: 0.55 + rnd() * 0.5 };
          splash.add(d); drops.push(d);
        }
        const cols = [M.red, M.gold, M.leaf, M.cream];
        [[-9, -9], [9, -9], [-9, 9], [9, 9]].forEach(([bx, bz], i) => {
          splash.add(box(0.18, 3.6, 0.18, M.wood, bx, 1.8, bz));
          splash.add(box(1.7, 0.85, 0.08, cols[i % 4], bx, 3.3, bz));
        });
        splash.visible = false;
        root.add(splash);
        const lamps = new THREE.Group();
        for (let i = 0; i < 9; i++) {
          const a = i / 9 * Math.PI * 2;
          const sp = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 6), M.gold);
          sp.position.set(-27 + Math.cos(a) * (5.5 + (i % 3) * 1.8), 2, -8 + Math.sin(a) * (5.5 + (i % 3) * 1.8));
          lamps.add(sp);
        }
        lamps.visible = false;
        root.add(lamps);
        // 绿孔雀 ×2（只看不抓）
        const peacockMat = new THREE.MeshLambertMaterial({ color: 0x2e7d5b });
        const peacockMat2 = new THREE.MeshLambertMaterial({ color: 0x2a6ea8 });
        function buildPeacock(x, z) {
          const g = new THREE.Group();
          const b = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), peacockMat2);
          b.position.y = 0.55; b.scale.set(0.9, 0.85, 1.25); g.add(b);
          const n = box(0.14, 0.55, 0.14, peacockMat2, 0, 0.95, 0.42); n.rotation.x = -0.3; g.add(n);
          const hd = new THREE.Mesh(new THREE.SphereGeometry(0.16, 7, 6), peacockMat2);
          hd.position.set(0, 1.28, 0.52); g.add(hd);
          const fan = new THREE.Group();
          for (let i = -2; i <= 2; i++) {
            const f = box(0.16, 2.1, 0.05, peacockMat, i * 0.3, 1.05, 0);
            f.rotation.z = i * 0.38;
            fan.add(f);
            const eye = new THREE.Mesh(new THREE.SphereGeometry(0.13, 6, 5), peacockMat2);
            eye.position.set(i * 0.72, 2.05, 0.03);
            fan.add(eye);
          }
          fan.position.set(0, 0.35, -0.52);
          fan.rotation.x = -0.25;
          g.add(fan);
          g.position.set(x, 0, z);
          root.add(g);
          return { g, cx: x, cz: z, tx: x, tz: z, wait: 2, phase: rnd() * 6 };
        }
        const peacocks = [buildPeacock(-118, 44), buildPeacock(112, 40)];
        // 林木
        const trunkGeo = new THREE.CylinderGeometry(0.24, 0.34, 1.9, 5);
        const canGeo = new THREE.ConeGeometry(2.1, 5.2, 6);
        const canGeo2 = new THREE.SphereGeometry(2.3, 7, 6);
        for (let i = 0; i < 115; i++) {
          const a = rnd() * Math.PI * 2, r = 26 + rnd() * 168;
          const x = Math.cos(a) * r * 1.12, z = Math.sin(a) * r * 0.94;
          if (z > 138) continue;
          if (Math.hypot(x - 152, z + 118) < 34) continue;
          if (Math.hypot(x + 158, z + 112) < 26) continue;
          if (Math.hypot(x - 128, z - 26) < 24) continue;
          if (Math.hypot(x, z - 6) < 21) continue;
          if (Math.hypot(x + 64, z - 66) < 17 || Math.hypot(x - 66, z + 52) < 17) continue;
          if (Math.hypot(x + 145, z - 58) < 22) continue;
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
          cl.position.set(-180 + i * 115, 62 + (i % 3) * 9, -110 + (i % 4) * 70);
          root.add(cl);
          clouds.push(cl);
        }
        return { colliders, festivalGroups: { songkran: splash, dengdeng: lamps }, animate(dt, t) {
          if (splash.visible) for (const d of drops) {
            const p = (t * d.userData.sp + d.userData.ph) % 1;
            const r = 2 + p * 8.5;
            d.position.set(Math.cos(d.userData.a) * r, 0.4 + Math.sin(p * Math.PI) * 3.4, Math.sin(d.userData.a) * r);
          }
          if (lamps.visible) lamps.children.forEach((sp, i) => { sp.position.y = 1.6 + ((t * 0.45 + i * 0.77) % 5.5); });
          waters.forEach((w, i) => { w.material.color.setHSL(0.54, 0.34, 0.63 + Math.sin(t * 0.6 + i * 0.8) * 0.028); });
          fall.position.y = 8.6 + Math.sin(t * 2.2) * 0.22;
          fallMat.color.setHSL(0.53, 0.32, 0.66 + Math.sin(t * 3) * 0.04);
          for (const pk of peacocks) {
            pk.wait -= dt;
            const dx = pk.tx - pk.g.position.x, dz = pk.tz - pk.g.position.z;
            const d = Math.hypot(dx, dz);
            if (pk.wait <= 0) {
              if (d < 0.5) {
                const ang = rnd() * Math.PI * 2, rr = 3 + rnd() * 7;
                pk.tx = pk.cx + Math.cos(ang) * rr;
                pk.tz = pk.cz + Math.sin(ang) * rr;
                pk.wait = 2 + rnd() * 4;
              } else {
                pk.g.position.x += dx / d * 1.15 * dt;
                pk.g.position.z += dz / d * 1.15 * dt;
                pk.g.rotation.y = Math.atan2(dx, dz);
                pk.wait = 0.1;
              }
            }
          }
          for (const cl of clouds) {
            cl.position.x += dt * 1.15;
            if (cl.position.x > 250) cl.position.x = -250;
          }
        } };
      },
    });
  }

  return { createRuiliScene };
});
