// 安和里 · 梁河（第 16 轮起建在通用坝引擎 dam-world 上：可走、可安家，最安静的一坝）
// 真实格局：大盈江上游自北穿坝；勐底大金塔在坝东山上、旁有金塔温泉；南甸宣抚司署在坝心（大厅在署前）；
// 九保古镇在江畔；回龙茶山在西山（层层茶垄）；帮盖村是葫芦丝的源头。
(function (global, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else global.AnheliLianghe = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function createLiangheScene(THREE, DamWorld) {
    const DW = DamWorld || (typeof globalThis !== "undefined" ? globalThis.AnheliDamWorld : null);
    return DW.createDamScene(THREE, {
      seed: 99,
      spawn: { x: -8, z: 30 },
      hallPos: { x: -6, z: 8 },
      crystalPos: { x: -11, z: 19 },
      sites: [{ x: -66, z: 96 }, { x: 62, z: -58 }],
      bounds: { rx: 248, rz: 203 },
      waters: [
        { x: -10, z: -160, r: 8 }, { x: -3, z: -80, r: 8 }, { x: 2, z: 0, r: 8 }, { x: 2, z: 80, r: 8 }, { x: -3, z: 170, r: 8 },
        { x: 128, z: -168, r: 5 }, { x: 92, z: -128, r: 5 }, { x: 66, z: -96, r: 5 },
        { x: 104, z: -34, r: 5 }, { x: 114, z: -26, r: 4 }, { x: 98, z: -22, r: 3.5 },
      ],
      decorate(root, M, H) {
        const { box, rnd, disc } = H;
        const colliders = [];
        const groundBig = disc(M.meadow, 255, 0, 0, 0);
        groundBig.scale.set(1.12, 0.95, 1);
        root.add(groundBig);
        for (const [gx, gz, gr] of [[-60, -60, 54], [70, 30, 50], [-30, 90, 48], [40, -110, 46]]) root.add(disc(M.meadow2, gr, gx, gz, 0.02));
        const hillDefs = [
          [-215, -80, 62, 44, M.hill2], [-120, -195, 70, 46, M.hill1], [40, -222, 74, 42, M.hill2],
          [175, -150, 62, 48, M.hill3], [228, -20, 56, 34, M.hill1], [230, 110, 54, 30, M.hill3],
          [-232, 30, 58, 36, M.hill1], [-40, 226, 70, 32, M.hill2], [130, 210, 58, 28, M.hill3],
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
        riverRun([[-14, -215], [-6, -130], [0, -50], [4, 40], [0, 130], [-6, 215]], 9);
        riverRun([[150, -190], [105, -140], [66, -96]], 5.5);
        // 回龙茶山
        const teaHill = new THREE.Mesh(new THREE.ConeGeometry(52, 30, 11), M.hill1);
        teaHill.position.set(-142, 13, -30);
        root.add(teaHill);
        colliders.push({ x: -142, z: -30, r: 27 });
        for (let i = 0; i < 6; i++) {
          const ring = new THREE.Mesh(new THREE.CylinderGeometry(40 - i * 5.6, 40.6 - i * 5.6, 1.1, 18), M.tea);
          ring.position.set(-142, 6.5 + i * 3.9, -30);
          root.add(ring);
        }
        // 勐底大金塔 + 金塔温泉
        const jtHill = new THREE.Mesh(new THREE.ConeGeometry(30, 15, 10), M.hill3);
        jtHill.position.set(128, 5.5, -64);
        root.add(jtHill);
        const jt = new THREE.Group();
        jt.position.set(128, 13, -64);
        jt.add(box(11, 1.4, 11, M.stone, 0, 0.7, 0));
        const tiers = [[4.4, 3.2], [3.6, 2.7], [2.8, 2.3], [2.1, 2], [1.5, 1.7]];
        let ty = 1.4;
        for (const [r, h] of tiers) {
          const c = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.82, r, h, 10), M.gold);
          c.position.y = ty + h / 2; jt.add(c); ty += h;
        }
        const jtip = new THREE.Mesh(new THREE.ConeGeometry(0.75, 3, 8), M.gold);
        jtip.position.y = ty + 1.5; jt.add(jtip);
        root.add(jt);
        colliders.push({ x: 128, z: -64, r: 15.6 });
        const springs = [];
        for (const [sx, sz, sr] of [[104, -34, 5.5], [114, -26, 4.2], [98, -22, 3.6]]) {
          const pool = new THREE.Mesh(new THREE.CircleGeometry(sr, 13), M.water.clone());
          pool.rotation.x = -Math.PI / 2; pool.position.set(sx, 0.06, sz);
          root.add(pool); waters.push(pool);
          const rim = new THREE.Mesh(new THREE.CylinderGeometry(sr + 0.7, sr + 0.9, 0.5, 13), M.stone);
          rim.position.set(sx, 0.1, sz);
          root.add(rim);
          for (let k = 0; k < 3; k++) {
            const puff = new THREE.Mesh(new THREE.SphereGeometry(1 + k * 0.5, 7, 6), M.steam);
            puff.position.set(sx + (k - 1) * 1.4, 1.6 + k * 1.3, sz);
            puff.scale.y = 0.6;
            root.add(puff);
            springs.push({ puff, baseY: 1.6 + k * 1.3, off: k * 1.7 + sx });
          }
        }
        // 南甸宣抚司署 + 大厅（署前）
        const yamen = new THREE.Group();
        yamen.name = "landmark:yamen";
        yamen.position.set(-20, 0, -18);
        yamen.add(box(26, 0.5, 18, M.stone, 0, 0.25, 0));
        yamen.add(box(15, 4.4, 7.5, M.cream, 0, 2.7, -3.5));
        yamen.add(box(18, 0.45, 10, M.roofD, 0, 5.4, -3.5));
        yamen.add(box(13, 0.4, 8, M.roofD, 0, 6.9, -3.6));
        yamen.add(box(6.5, 3.2, 5, M.cream, -8.5, 2.1, 3.5));
        yamen.add(box(6.5, 3.2, 5, M.cream, 8.5, 2.1, 3.5));
        yamen.add(box(8.2, 0.35, 6.4, M.roofD, -8.5, 4, 3.5));
        yamen.add(box(8.2, 0.35, 6.4, M.roofD, 8.5, 4, 3.5));
        yamen.add(box(3.2, 2.6, 0.4, M.woodDark, 0, 1.8, 0.4));
        root.add(yamen);
        colliders.push({ x: -20, z: -18, r: 12.5 });
        const hallP = new THREE.Group();
        hallP.position.set(-6, 0, 8);
        const hb = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 5, 0.5, 10), M.stone);
        hb.position.y = 0.25; hallP.add(hb);
        for (const [px, pz] of [[-3.2, -3.2], [3.2, -3.2], [-3.2, 3.2], [3.2, 3.2]]) hallP.add(box(0.4, 4.4, 0.4, M.wood, px, 2.7, pz));
        hallP.add(box(8.6, 0.4, 8.6, M.roofD, 0, 5.3, 0));
        hallP.add(box(0.95, 0.95, 0.95, M.gold, 0, 4.2, 5.6));
        hallP.add(box(0.3, 3.4, 0.3, M.woodDark, 0, 2.2, 5.6));
        root.add(hallP);
        colliders.push({ x: -6, z: 8, r: 4.5 });
        // 九保古镇石板街口
        const jiubao = new THREE.Group();
        jiubao.position.set(26, 0, 66);
        for (let i = 0; i < 5; i++) jiubao.add(box(3.4, 0.18, 5.2, M.stone, -8 + i * 4.1, 0.09, 0));
        jiubao.add(box(1.2, 3.4, 1.2, M.stoneD, -11, 1.7, -3.4));
        jiubao.add(box(1.2, 3.4, 1.2, M.stoneD, 11, 1.7, -3.4));
        jiubao.add(box(25, 0.9, 1.4, M.stoneD, 0, 3.8, -3.4));
        root.add(jiubao);
        // 古道
        const roadPts = [[-4, -180], [-6, -100], [-6, -30], [-4, 40], [-2, 120], [0, 195]];
        for (let i = 0; i < roadPts.length - 1; i++) {
          const [ax, az] = roadPts[i], [bx, bz] = roadPts[i + 1];
          for (let s = 0; s < 3; s++) {
            const t0 = s / 3;
            const seg = new THREE.Mesh(new THREE.CircleGeometry(4.3, 10), M.road);
            seg.rotation.x = -Math.PI / 2;
            seg.position.set(ax + (bx - ax) * t0, 0.04, az + (bz - az) * t0);
            seg.scale.set(1, 1.5, 1);
            root.add(seg);
          }
        }
        // 帮盖村口金葫芦（葫芦丝之源的意象）
        const gourd = new THREE.Group();
        gourd.position.set(-59, 0, 89);
        const gBase = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.6, 1, 10), M.stone);
        gBase.position.y = 0.5; gourd.add(gBase);
        const gLow = new THREE.Mesh(new THREE.SphereGeometry(1.7, 10, 8), M.gold);
        gLow.position.y = 2.6; gLow.scale.y = 1.1; gourd.add(gLow);
        const gUp = new THREE.Mesh(new THREE.SphereGeometry(1.05, 9, 7), M.gold);
        gUp.position.y = 4.9; gourd.add(gUp);
        gourd.add(box(0.3, 0.7, 0.3, M.woodDark, 0, 6.1, 0));
        root.add(gourd);
        colliders.push({ x: -59, z: 89, r: 2.8 });
        // 茶山脚下一排茶丛
        for (let i = 0; i < 7; i++) {
          const bush = new THREE.Mesh(new THREE.SphereGeometry(1.05, 8, 6), M.tea);
          bush.position.set(-104 + i * 3.4, 0.7, 4 + (i % 2) * 2.6);
          bush.scale.y = 0.75;
          root.add(bush);
          colliders.push({ x: -104 + i * 3.4, z: 4 + (i % 2) * 2.6, r: 1.1 });
        }
        const lamps = new THREE.Group();
        for (let i = 0; i < 9; i++) {
          const a = i / 9 * Math.PI * 2;
          const sp = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 6), M.gold);
          sp.position.set(-6 + Math.cos(a) * (5.5 + (i % 3) * 1.8), 2, 8 + Math.sin(a) * (5.5 + (i % 3) * 1.8));
          lamps.add(sp);
        }
        lamps.visible = false;
        root.add(lamps);
        // 林木
        const trunkGeo = new THREE.CylinderGeometry(0.24, 0.34, 1.9, 5);
        const canGeo = new THREE.ConeGeometry(2.1, 5.2, 6);
        const canGeo2 = new THREE.SphereGeometry(2.3, 7, 6);
        for (let i = 0; i < 110; i++) {
          const a = rnd() * Math.PI * 2, r = 26 + rnd() * 168;
          const x = Math.cos(a) * r * 1.1, z = Math.sin(a) * r * 0.94;
          if (Math.abs(x) < 14) continue;
          if (Math.hypot(x + 142, z + 30) < 52) continue;
          if (Math.hypot(x - 128, z + 64) < 34) continue;
          if (Math.hypot(x + 6, z + 18) < 24 || Math.hypot(x - 26, z - 66) < 17) continue;
          if (Math.hypot(x + 66, z - 96) < 16 || Math.hypot(x - 62, z + 58) < 16) continue;
          if (Math.hypot(x - 105, z + 30) < 15) continue;
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
          cl.position.set(-175 + i * 108, 60 + (i % 3) * 9, -115 + (i % 4) * 68);
          root.add(cl);
          clouds.push(cl);
        }
        return { colliders, festivalGroups: { dengdeng: lamps }, animate(dt, t) {
          if (lamps.visible) lamps.children.forEach((sp, i) => { sp.position.y = 1.6 + ((t * 0.45 + i * 0.77) % 5.5); });
          waters.forEach((w, i) => { w.material.color.setHSL(0.53, 0.35, 0.64 + Math.sin(t * 0.6 + i * 0.8) * 0.026); });
          for (const s of springs) {
            s.puff.position.y = s.baseY + Math.sin(t * 0.7 + s.off) * 0.5;
            const sc = 1 + Math.sin(t * 0.5 + s.off) * 0.15;
            s.puff.scale.set(sc, 0.6 * sc, sc);
          }
          for (const cl of clouds) {
            cl.position.x += dt * 1.05;
            if (cl.position.x > 250) cl.position.x = -250;
          }
        } };
      },
    });
  }

  return { createLiangheScene };
});
