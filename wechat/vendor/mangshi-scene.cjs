// 安和里 · 第三个微信场景：芒市坝（德宏大世界的第一块拼图）
// 按真实芒市坝格局缩绘：总佛寺在西北、集市空地居中、芒市河穿坝而过、孔雀湖在东、雷牙让山在东沿。
// 守「原始底色」：除寺与大厅外不预置房屋农田，基址是空地块格，等玩家来填。
// 同一约定：纯 Three.js、无 DOM、无 wx，宿主注入 THREE 并转发输入。
(function (global, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./dam-world.cjs"));
  else global.AnheliMangshi = factory(global.AnheliDamWorld);
})(typeof self !== "undefined" ? self : this, function (DamWorld) {
  "use strict";

  function createMangshiScene(THREE) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xc2dcee);
    scene.fog = new THREE.Fog(0xd6e4ec, 190, 460);
    const camera = new THREE.PerspectiveCamera(44, 16 / 9, 0.1, 900);
    const hemi = new THREE.HemisphereLight(0xd8ecff, 0x8a9a6a, 0.95);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffe3b3, 0.9);
    sun.position.set(80, 110, 40);
    scene.add(sun);

    const M = {
      meadow: new THREE.MeshLambertMaterial({ color: 0xa4c47e }),
      meadow2: new THREE.MeshLambertMaterial({ color: 0x97b96f }),
      earth: new THREE.MeshLambertMaterial({ color: 0xcdbb92 }),
      road: new THREE.MeshLambertMaterial({ color: 0xd8c49a }),
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
      plot: new THREE.MeshLambertMaterial({ color: 0xdcc9a0 }),
      crystal: new THREE.MeshLambertMaterial({ color: 0x9a6ee8 }),
      teal: new THREE.MeshLambertMaterial({ color: 0x1f8a70 }),
      tealD: new THREE.MeshLambertMaterial({ color: 0x14665a }),
      cloud: new THREE.MeshLambertMaterial({ color: 0xf7fafc }),
      skin: new THREE.MeshLambertMaterial({ color: 0xe8b98d }),
      hemp: new THREE.MeshLambertMaterial({ color: 0xc9b18a }),
      hide: new THREE.MeshLambertMaterial({ color: 0x8a6844 }),
      warm: new THREE.MeshLambertMaterial({ color: 0xb98d5f }),
      bamboo: new THREE.MeshLambertMaterial({ color: 0xc2a165 }),
      wool: new THREE.MeshLambertMaterial({ color: 0xf2ede2 }),
      horse: new THREE.MeshLambertMaterial({ color: 0x8a5f3d }),
      saddle: new THREE.MeshLambertMaterial({ color: 0xa83f32 }),
      soil: new THREE.MeshLambertMaterial({ color: 0x8a6a48 }),
      sprout: new THREE.MeshLambertMaterial({ color: 0x7fae56 }),
      orange: new THREE.MeshLambertMaterial({ color: 0xe07b39 }),
      pink: new THREE.MeshLambertMaterial({ color: 0xe8a0a8 }),
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
    let seed = 1234;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

    // —— 坝体：两层草甸色块（只作地貌，不作农田）——
    const ground = new THREE.Mesh(new THREE.CircleGeometry(260, 44), M.meadow);
    ground.rotation.x = -Math.PI / 2; ground.scale.set(1.2, 0.95, 1);
    root.add(ground);
    for (const [gx, gz, gr] of [[-70, 90, 60], [80, 110, 55], [-20, -120, 66], [110, -90, 48]]) {
      const patch = new THREE.Mesh(new THREE.CircleGeometry(gr, 22), M.meadow2);
      patch.rotation.x = -Math.PI / 2; patch.position.set(gx, 0.02, gz);
      root.add(patch);
    }

    // —— 山环：东沿雷牙让山更高 ——
    const hillDefs = [
      [215, -60, 62, 52, M.hill2], [225, 40, 58, 46, M.hill1], [200, 130, 55, 40, M.hill3],
      [-215, -80, 60, 36, M.hill1], [-225, 60, 64, 32, M.hill3], [-60, -215, 72, 38, M.hill2],
      [80, -220, 66, 34, M.hill1], [-40, 225, 70, 30, M.hill3], [150, 215, 58, 28, M.hill2],
    ];
    for (const [hx, hz, r, h, mat] of hillDefs) {
      const hill = new THREE.Mesh(new THREE.ConeGeometry(r, h, 9), mat);
      hill.position.set(hx, h / 2 - 2, hz);
      root.add(hill);
    }

    // —— 芒市河：穿坝 S 形水带 ——
    const riverPts = [[-38, -205], [-24, -140], [-12, -75], [11, -10], [21, 55], [2, 120], [-22, 175], [-38, 215]];
    const riverWaters = [];
    for (let i = 0; i < riverPts.length - 1; i++) {
      const [ax, az] = riverPts[i], [bx, bz] = riverPts[i + 1];
      const steps = Math.max(4, Math.ceil(Math.hypot(bx - ax, bz - az) / 12));
      for (let s = 0; s < steps; s++) {
        const t0 = s / steps;
        const x = ax + (bx - ax) * t0, z = az + (bz - az) * t0;
        const w = new THREE.Mesh(new THREE.CircleGeometry(11.5, 13), M.water.clone());
        w.rotation.x = -Math.PI / 2;
        w.position.set(x, 0.05, z);
        w.scale.set(0.85, 1.3, 1);
        root.add(w); riverWaters.push(w);
      }
    }

    // —— 孔雀湖（城东，狭长南北向）——
    const lake = new THREE.Group();
    lake.position.set(112, 0, -18);
    const lakeWater = new THREE.Mesh(new THREE.CircleGeometry(27, 22), M.water.clone());
    lakeWater.rotation.x = -Math.PI / 2; lakeWater.position.y = 0.05;
    lakeWater.scale.set(0.52, 1.65, 1);
    lake.add(lakeWater);
    const lakeRim = new THREE.Mesh(new THREE.CircleGeometry(29.5, 22), M.earth);
    lakeRim.rotation.x = -Math.PI / 2; lakeRim.position.y = 0.02;
    lakeRim.scale.set(0.54, 1.68, 1);
    lake.add(lakeRim);
    lakeWater.position.y = 0.06;
    root.add(lake);

    // —— 总佛寺（简化地标版，西北）+ 安和里大厅亭 ——
    const temple = new THREE.Group();
    temple.position.set(-58, 0, -58);
    temple.rotation.y = 0.35;
    for (let i = 0; i < 3; i++) temple.add(box(26 - i * 3.5, 0.55, 15 - i * 2, M.stone, 0, 0.28 + i * 0.55, 1.5 - i * 0.6));
    temple.add(box(19, 4.6, 9.5, M.cream, 0, 3.9, -1));
    temple.add(box(3.4, 3.4, 0.5, M.woodDark, 0, 3.4, 3.8));
    temple.add(box(22.5, 0.5, 12.5, M.roof, 0, 6.6, -1));
    temple.add(box(15.5, 0.45, 9, M.roof, 0, 8.3, -1.1));
    const ttip = new THREE.Mesh(new THREE.ConeGeometry(0.85, 2.4, 6), M.gold);
    ttip.position.set(0, 10.2, -1.1); temple.add(ttip);
    root.add(temple);
    const hallP = new THREE.Group();
    hallP.position.set(-38, 0, -44);
    const hb = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 5, 0.5, 10), M.stone);
    hb.position.y = 0.25; hallP.add(hb);
    for (const [px, pz] of [[-3.2, -3.2], [3.2, -3.2], [-3.2, 3.2], [3.2, 3.2]]) hallP.add(box(0.4, 4.4, 0.4, M.wood, px, 2.7, pz));
    hallP.add(box(8.6, 0.4, 8.6, M.roof, 0, 5.3, 0));
    hallP.add(box(0.95, 0.95, 0.95, M.gold, 0, 4.2, 5.6));
    hallP.add(box(0.3, 3.4, 0.3, M.woodDark, 0, 2.2, 5.6));
    root.add(hallP);

    // —— 集市空地（居中，只有空地、碑与灯柱，不预置摊位）+ 传送水晶 ——
    const market = new THREE.Group();
    market.position.set(4, 0, 34);
    const mDisc = new THREE.Mesh(new THREE.CircleGeometry(15, 22), M.earth);
    mDisc.rotation.x = -Math.PI / 2; mDisc.position.y = 0.03; market.add(mDisc);
    market.add(box(1.7, 2.6, 0.4, M.stoneD, -6, 1.3, -5));
    for (const [lx, lz] of [[9, -7], [-9, 7], [10, 8]]) {
      market.add(box(0.24, 2.6, 0.24, M.wood, lx, 1.3, lz));
      market.add(box(0.55, 0.55, 0.55, M.gold, lx, 2.9, lz));
    }
    const crystal = new THREE.Mesh(new THREE.ConeGeometry(1.15, 3.6, 6), M.crystal);
    crystal.name = "travel:crystal";
    crystal.material.color.set(0x8a8f96);
    crystal.position.set(-4.5, 3.4, 1.5);
    market.add(crystal);
    root.add(market);

    // —— 古道：寺前 → 集市 → 南去（路点连成的土带）——
    const roadPts = [[-44, -42], [-24, -14], [-6, 12], [4, 34], [-2, 80], [-10, 130], [-16, 185], [-20, 215]];
    for (let i = 0; i < roadPts.length - 1; i++) {
      const [ax, az] = roadPts[i], [bx, bz] = roadPts[i + 1];
      const steps = 3;
      for (let s = 0; s < steps; s++) {
        const t0 = s / steps;
        const seg = new THREE.Mesh(new THREE.CircleGeometry(4.6, 10), M.road);
        seg.rotation.x = -Math.PI / 2;
        seg.position.set(ax + (bx - ax) * t0, 0.04, az + (bz - az) * t0);
        seg.scale.set(1, 1.5, 1);
        root.add(seg);
      }
    }

    // —— 村落基址 ×2（空地块格：中心 + 8 块地；地块可被认领安家）——
    const plotList = []; // { site, idx, x, z, mesh, claimed, hut, hutGroup }
    function buildSite(siteIdx, x, z) {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      const c = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.4, 0.3, 10), M.stone);
      c.position.y = 0.15; g.add(c);
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * Math.PI * 2;
        const pad = box(7.6, 0.22, 7.6, M.plot, Math.cos(a) * 11.5, 0.11, Math.sin(a) * 11.5);
        g.add(pad);
        const px = x + Math.cos(a) * 11.5, pz = z + Math.sin(a) * 11.5;
        const dx = x - px, dz = z - pz, dl = Math.hypot(dx, dz) || 1;
        plotList.push({
          site: siteIdx, idx: i, x: px, z: pz, mesh: pad, claimed: false, hut: false, hutGroup: null,
          face: Math.atan2(dx / dl, dz / dl), dirX: dx / dl, dirZ: dz / dl, // 朝向基址中心
          fieldGroup: null, sproutGroup: null, fieldStage: 0, house: 0,
          animals: { chicken: 0, rabbit: 0, sheep: 0 },
        });
      }
      root.add(g);
    }
    buildSite(0, -78, 66);
    buildSite(1, 58, 96);
    const HALL_POS = { x: -38, z: -44 };
    const CRYSTAL_POS = { x: market.position.x + crystal.position.x, z: market.position.z + crystal.position.z };
    function claimCustomPlot(x, z) {
      const existing = plotList.find(p => p.site === -1 && p.idx === -1);
      if (existing) return existing.x === x && existing.z === z ? { site: -1, idx: -1, x, z, claimed: true } : null;
      if (!DamWorld.checkCustomPlotSpot(landSpec, plotList, x, z).ok) return null;
      const mesh = box(7.6, 0.22, 7.6, M.plot, x, 0.11, z);
      const dx = HALL_POS.x - x, dz = HALL_POS.z - z, distance = Math.hypot(dx, dz) || 1;
      const plot = { site: -1, idx: -1, x, z, mesh, claimed: false, hut: false, house: 0, hutGroup: null,
        fieldGroup: null, sproutGroup: null, fieldStage: 0, animals: { chicken: 0, sheep: 0, rabbit: 0 },
        face: Math.atan2(dx, dz), dirX: dx / distance, dirZ: dz / distance };
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
      plot.hut = true;
      plot.house = 1;
      const g = new THREE.Group();
      g.position.set(plot.x - plot.dirX * 1.7, 0, plot.z - plot.dirZ * 1.7);
      g.rotation.y = plot.face;
      for (const [px, pz] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]]) g.add(box(0.26, 2.6, 0.26, M.wood, px, 1.65, pz));
      g.add(box(5.6, 0.3, 5.6, M.wood, 0, 2.9, 0));
      g.add(box(5.2, 1.7, 0.25, M.hemp, 0, 3.9, -2.5));
      g.add(box(0.25, 1.7, 5.2, M.hemp, -2.5, 3.9, 0));
      g.add(box(0.25, 1.7, 5.2, M.hemp, 2.5, 3.9, 0));
      g.add(box(6.5, 0.22, 0.34, M.woodDark, 0, 5.52, 0));
      const roofL = box(6.6, 0.16, 3.4, M.roof, 0, 5.02, -1.38); roofL.rotation.x = 0.52; g.add(roofL);
      const roofR = box(6.6, 0.16, 3.4, M.roof, 0, 5.02, 1.38); roofR.rotation.x = -0.52; g.add(roofR);
      root.add(g);
      plot.hutGroup = g;
    }
    function buildBambooVisual(plot) {
      if (plot.hutGroup) { removeOwnedGeometry(root, plot.hutGroup); plot.hutGroup = null; }
      plot.hut = true;
      plot.house = 2;
      const g = new THREE.Group();
      g.position.set(plot.x - plot.dirX * 1.7, 0, plot.z - plot.dirZ * 1.7);
      g.rotation.y = plot.face;
      for (const [px, pz] of [[-2.5, -2.3], [2.5, -2.3], [-2.5, 2.3], [2.5, 2.3], [-2.5, 0], [2.5, 0]]) g.add(box(0.3, 3.6, 0.3, M.bamboo, px, 1.8, pz));
      g.add(box(6.1, 0.3, 5.5, M.bamboo, 0, 3.65, 0));
      g.add(box(5.7, 1.9, 0.22, M.bamboo, 0, 4.75, -2.55));
      g.add(box(0.22, 1.9, 5.3, M.bamboo, -2.75, 4.75, 0));
      g.add(box(0.22, 1.9, 5.3, M.bamboo, 2.75, 4.75, 0));
      g.add(box(1.9, 1.9, 0.22, M.bamboo, -1.9, 4.75, 2.55));
      g.add(box(1.9, 1.9, 0.22, M.bamboo, 1.9, 4.75, 2.55));
      g.add(box(7.2, 0.24, 0.36, M.woodDark, 0, 6.6, 0));
      const rL = box(7.4, 0.17, 3.9, M.roof, 0, 5.95, -1.55); rL.rotation.x = 0.5; g.add(rL);
      const rR = box(7.4, 0.17, 3.9, M.roof, 0, 5.95, 1.55); rR.rotation.x = -0.5; g.add(rR);
      for (let s = 0; s < 4; s++) g.add(box(1.1, 0.14, 0.5, M.bamboo, 0, 0.35 + s * 0.85, 3.6 - s * 0.28));
      root.add(g);
      plot.hutGroup = g;
    }
    // —— 田（地块前缘 2×2 畦）与生长阶段 ——
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
    function setFieldStageVisual(plot, stage) {
      if (!plot.fieldGroup) return;
      if (![0, 1, 2].includes(stage) || stage === plot.fieldStage) return;
      if (plot.sproutGroup) { removeOwnedGeometry(plot.fieldGroup, plot.sproutGroup); plot.sproutGroup = null; }
      plot.fieldStage = stage;
      if (!stage) return;
      const sg = new THREE.Group();
      const mature = stage === 2;
      for (const [bx, bz] of [[-0.82, -0.82], [0.82, -0.82], [-0.82, 0.82], [0.82, 0.82]]) {
        for (let k = 0; k < 3; k++) {
          const h = mature ? 0.9 : 0.42;
          const s = new THREE.Mesh(new THREE.ConeGeometry(mature ? 0.21 : 0.14, h, 5), mature ? M.gold : M.sprout);
          s.position.set(bx + (k - 1) * 0.4, 0.26 + h / 2, bz + ((k % 2) - 0.5) * 0.42);
          sg.add(s);
          if (mature) {
            const c = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.4, 5), M.orange);
            c.rotation.x = Math.PI;
            c.position.set(bx + (k - 1) * 0.4, 0.3, bz + ((k % 2) - 0.5) * 0.42);
            sg.add(c);
          }
        }
      }
      plot.fieldGroup.add(sg);
      plot.sproutGroup = sg;
    }
    // —— 院里的小动物（在自家地块范围内游走）——
    const yardAnimals = [];
    function miniChicken() {
      const g = new THREE.Group();
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 7), M.wool); b.position.y = 0.42; b.scale.set(1, 0.9, 1.15); g.add(b);
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.17, 7, 6), M.wool); h.position.set(0, 0.72, 0.3); g.add(h);
      g.add(box(0.16, 0.1, 0.05, M.orange, 0, 0.7, 0.47));
      const comb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), new THREE.MeshLambertMaterial({ color: 0xd94f4f })); comb.position.set(0, 0.88, 0.3); g.add(comb);
      const tail = box(0.3, 0.3, 0.08, M.tealD); tail.position.set(0, 0.55, -0.36); tail.rotation.x = -0.5; g.add(tail);
      return g;
    }
    function miniSheep() {
      const g = new THREE.Group();
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 7), M.wool); b.position.y = 0.72; b.scale.set(1, 0.92, 1.25); g.add(b);
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.26, 7, 6), M.hide); h.position.set(0, 0.88, 0.66); g.add(h);
      g.add(box(0.12, 0.12, 0.2, M.pink, 0, 0.8, 0.88));
      for (const [lx, lz] of [[-0.3, 0.35], [0.3, 0.35], [-0.3, -0.4], [0.3, -0.4]]) g.add(box(0.11, 0.5, 0.11, M.hide, lx, 0.25, lz));
      return g;
    }
    function miniRabbit() {
      const g = new THREE.Group();
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 7), M.wool); b.position.y = 0.34; b.scale.set(1, 0.9, 1.2); g.add(b);
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.19, 7, 6), M.wool); h.position.set(0, 0.56, 0.3); g.add(h);
      for (const s of [-1, 1]) { const e = box(0.09, 0.42, 0.04, M.wool, 0.09 * s, 0.86, 0.28); e.rotation.z = 0.15 * s; g.add(e); }
      return g;
    }
    function addAnimalVisual(plot, kind) {
      const g = kind === "sheep" ? miniSheep() : kind === "rabbit" ? miniRabbit() : miniChicken();
      g.position.set(plot.x + (rnd() * 4 - 2), 0, plot.z + (rnd() * 4 - 2));
      root.add(g);
      yardAnimals.push({ obj: g, kind, cx: plot.x, cz: plot.z, tx: g.position.x, tz: g.position.z, wait: rnd() * 2 });
      plot.animals[kind] += 1;
    }

    // —— 主角：原始居民（束发、原麻衣、兽皮裙、背竹篓；摆臂走路、站立呼吸）——
    const player = new THREE.Group();
    player.name = "player";
    const pBody = box(0.78, 1.05, 0.46, M.hemp, 0, 1.28, 0); player.add(pBody);
    const pSkirt = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.55, 0.55, 8), M.hide);
    pSkirt.position.y = 0.72; player.add(pSkirt);
    const pHead = new THREE.Mesh(new THREE.SphereGeometry(0.31, 9, 8), M.skin);
    pHead.position.y = 2.08; player.add(pHead);
    const pBun = new THREE.Mesh(new THREE.SphereGeometry(0.15, 7, 6), M.woodDark);
    pBun.position.y = 2.38; player.add(pBun);
    player.add(box(0.55, 0.62, 0.3, M.wood, 0, 1.45, -0.42)); // 竹篓
    function limb(w, h, mat, x, y, z) {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, z);
      const m = box(w, h, w, mat, 0, -h / 2, 0);
      pivot.add(m);
      player.add(pivot);
      return pivot;
    }
    const armL = limb(0.17, 0.78, M.skin, -0.52, 1.72, 0);
    const armR = limb(0.17, 0.78, M.skin, 0.52, 1.72, 0);
    const legL = limb(0.2, 0.72, M.skin, -0.2, 0.62, 0);
    const legR = limb(0.2, 0.72, M.skin, 0.2, 0.62, 0);
    player.position.set(4, 0, 52);
    root.add(player);

    const horse = new THREE.Group();
    const hBody = new THREE.Mesh(new THREE.SphereGeometry(0.85, 10, 8), M.horse);
    hBody.scale.set(0.82, 0.78, 1.5); hBody.position.y = 1.62; horse.add(hBody);
    const hNeck = box(0.42, 1.05, 0.55, M.horse, 0, 2.15, 1.15); hNeck.rotation.x = -0.6; horse.add(hNeck);
    const hHead = box(0.4, 0.45, 0.85, M.horse, 0, 2.62, 1.62); hHead.rotation.x = 0.35; horse.add(hHead);
    horse.add(box(0.44, 0.55, 0.14, M.woodDark, 0, 2.5, 0.92));
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.3, 4), M.horse);
      ear.position.set(0.14 * side, 2.92, 1.38); horse.add(ear);
    }
    const hTail = box(0.16, 1.0, 0.16, M.woodDark, 0, 1.7, -1.32); hTail.rotation.x = 0.4; horse.add(hTail);
    horse.add(box(0.95, 0.18, 0.95, M.saddle, 0, 2.12, -0.1));
    const hLegs = [];
    for (const [lx, lz] of [[-0.38, 0.72], [0.38, 0.72], [-0.38, -0.78], [0.38, -0.78]]) {
      const pivot = new THREE.Group();
      pivot.position.set(lx, 1.25, lz);
      pivot.add(box(0.17, 1.25, 0.17, M.horse, 0, -0.62, 0));
      horse.add(pivot); hLegs.push(pivot);
    }
    horse.visible = false;
    root.add(horse);
    const { stall, basket: harvestBasket } = DamWorld.createHomeProps(THREE, M, box);
    root.add(stall, harvestBasket);
    let resting = false, restBlend = 0;
    const restAnchor = { x: 0, z: 0 };
    let horseShown = false, mounted = false;
    let bondLevel = 0, careT = 0, followPhase = 0;

    // —— 绿孔雀 ×2（湖西岸与寺前园，德宏的灵物：只看不捉）——
    function buildPeacock() {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.62, 9, 8), M.teal);
      body.scale.set(1, 0.95, 1.45); body.position.y = 0.95; g.add(body);
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.18, 0.85, 6), M.tealD);
      neck.position.set(0, 1.55, 0.62); neck.rotation.x = 0.25; g.add(neck);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 7, 6), M.tealD);
      head.position.set(0, 2.0, 0.74); g.add(head);
      for (let i = -1; i <= 1; i++) {
        const crest = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 4), M.gold);
        crest.position.set(0.09 * i, 2.28, 0.74); g.add(crest);
      }
      const tail = new THREE.Group();
      const t1 = box(0.85, 0.07, 3.4, M.teal, 0, 0, -1.9); tail.add(t1);
      const t2 = box(0.7, 0.07, 1.6, M.gold, 0, 0.02, -3.6); tail.add(t2);
      for (const dz of [-2.6, -3.3, -4.0]) {
        const eye = new THREE.Mesh(new THREE.CircleGeometry(0.16, 8), M.tealD);
        eye.rotation.x = -Math.PI / 2; eye.position.set(0, 0.06, dz + 0.9);
        tail.add(eye);
      }
      tail.position.set(0, 0.78, -0.7);
      tail.rotation.x = 0.16;
      g.add(tail);
      for (const [lx, lz] of [[-0.25, 0.2], [0.25, 0.2], [-0.25, -0.35], [0.25, -0.35]]) g.add(box(0.07, 0.6, 0.07, M.dark || M.woodDark, lx, 0.3, lz));
      g.userData.tail = tail;
      return g;
    }
    const peacocks = [];
    for (const [px, pz, ax, az] of [[84, 6, 84, 6], [-40, -34, -40, -34]]) {
      const p = buildPeacock();
      p.position.set(px, 0, pz);
      root.add(p);
      peacocks.push({ obj: p, ax, az, tx: px, tz: pz, wait: 1 + rnd() * 2 });
    }

    // —— 林木 ——
    const trunkGeo = new THREE.CylinderGeometry(0.24, 0.34, 1.9, 5);
    const canGeo = new THREE.ConeGeometry(2.1, 5.2, 6);
    const canGeo2 = new THREE.SphereGeometry(2.3, 7, 6);
    const riverLine = riverPts;
    function nearRiver(x, z) {
      for (const [rx, rz] of riverLine) if (Math.hypot(x - rx, z - rz) < 17) return true;
      return false;
    }
    for (let i = 0; i < 130; i++) {
      const a = rnd() * Math.PI * 2, r = 30 + rnd() * 165;
      const x = Math.cos(a) * r * 1.15, z = Math.sin(a) * r * 0.92;
      if (nearRiver(x, z)) continue;
      if (Math.hypot(x - 112, (z + 18) * 0.6) < 26) continue;      // 孔雀湖
      if (Math.hypot(x + 58, z + 58) < 24) continue;                // 寺
      if (Math.hypot(x - 4, z - 34) < 19) continue;                 // 集市
      if (Math.hypot(x + 78, z - 66) < 17 || Math.hypot(x - 58, z - 96) < 17) continue; // 基址
      const tree = new THREE.Group();
      const tr = new THREE.Mesh(trunkGeo, M.trunk); tr.position.y = 0.95; tree.add(tr);
      const cn = new THREE.Mesh(rnd() > 0.45 ? canGeo : canGeo2, rnd() > 0.4 ? M.leaf : M.leaf2);
      cn.position.y = rnd() > 0.45 ? 4.1 : 3.6; tree.add(cn);
      const s = 0.85 + rnd() * 1.25;
      tree.scale.set(s, s * (0.9 + rnd() * 0.35), s);
      tree.position.set(x, 0, z);
      tree.rotation.y = rnd() * 3;
      root.add(tree);
    }

    // —— 云（慢慢飘）——
    const clouds = [];
    for (let i = 0; i < 4; i++) {
      const cl = new THREE.Group();
      for (const [cx, cy, cz, r] of [[0, 0, 0, 9], [8, 1.5, 2, 6.5], [-8, 1, -1, 7], [2, 3, -2, 5]]) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), M.cloud);
        s.position.set(cx, cy, cz); s.scale.y = 0.42; cl.add(s);
      }
      cl.position.set(-190 + i * 110, 62 + (i % 3) * 9, -120 + (i % 4) * 70);
      root.add(cl);
      clouds.push(cl);
    }

    // —— 跟随镜头 + 行走（摇杆驱动主角，拖动转镜头）——
    let yaw = 0, polar = 1.08, radius = 30;
    const waterZones = [];
    const riverPoints = riverPts;
    for (let index = 0; index < riverPoints.length - 1; index++) {
      const [ax, az] = riverPoints[index], [bx, bz] = riverPoints[index + 1];
      const count = Math.max(2, Math.round(Math.hypot(bx - ax, bz - az) / 20));
      for (let step = 0; step < count; step++) waterZones.push({ x: ax + (bx - ax) * step / count, z: az + (bz - az) * step / count, r: 10.5 });
    }
    waterZones.push({ x: 112, z: -48, r: 13 }, { x: 112, z: -18, r: 14 }, { x: 112, z: 12, r: 13 });
    const festivalGroups = {};
    {
      const splash = new THREE.Group();
      splash.position.set(0, 0, 40);
      const dropGeometry = new THREE.SphereGeometry(0.17, 6, 5);
      for (let index = 0; index < 34; index++) {
        const drop = new THREE.Mesh(dropGeometry, M.water);
        drop.userData = { a: index / 34 * Math.PI * 2 + rnd() * 0.4, ph: rnd(), sp: 0.55 + rnd() * 0.5 };
        splash.add(drop);
      }
      const colors = [M.red, M.gold, M.leaf, M.cream];
      [[-9, -9], [9, -9], [-9, 9], [9, 9]].forEach(([x, z], index) => {
        splash.add(box(0.18, 3.6, 0.18, M.wood, x, 1.8, z));
        splash.add(box(1.7, 0.85, 0.08, colors[index], x, 3.3, z));
      });
      splash.name = "festival:songkran"; splash.visible = false;
      scene.add(splash); festivalGroups.songkran = splash;
    }
    {
      const lamps = new THREE.Group();
      for (let index = 0; index < 9; index++) {
        const angle = index / 9 * Math.PI * 2;
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 6), M.gold);
        lamp.position.set(HALL_POS.x + Math.cos(angle) * (5.5 + index % 3 * 1.8), 2, HALL_POS.z + Math.sin(angle) * (5.5 + index % 3 * 1.8));
        lamps.add(lamp);
      }
      lamps.name = "festival:dengdeng"; lamps.visible = false;
      scene.add(lamps); festivalGroups.dengdeng = lamps;
    }
    const solidZones = hillDefs.map(([x, z, r]) => ({ x, z, r: r * 0.52 })).concat([
      { x: -58, z: -58, r: 15 }, { x: HALL_POS.x, z: HALL_POS.z, r: 4.5 },
    ]);
    const landSpec = { bounds: { rx: 265, rz: 215 }, waters: waterZones, colliders: solidZones, spawn: { x: 4, z: 52 },
      sites: [{ x: -78, z: 66 }, { x: 58, z: 96 }], hallPos: HALL_POS, crystalPos: CRYSTAL_POS };
    const land = DamWorld.createLandResolver(landSpec);
    const moveIn = { x: 0, z: 0 };
    let walkPhase = 0, moving = false;
    const camPos = new THREE.Vector3(player.position.x, 16, player.position.z + 28);
    function applyCamera(dt) {
      const sp = Math.sin(polar);
      const cameraRadius = radius * (1 - 0.22 * restBlend);
      const tx = player.position.x + cameraRadius * sp * Math.sin(yaw);
      const ty = player.position.y + cameraRadius * Math.cos(polar) + 1.6;
      const tz = player.position.z + cameraRadius * sp * Math.cos(yaw);
      const k = dt ? Math.min(1, dt * 5) : 1;
      camPos.x += (tx - camPos.x) * k;
      camPos.y += (ty - camPos.y) * k;
      camPos.z += (tz - camPos.z) * k;
      camera.position.copy(camPos);
      camera.lookAt(player.position.x, player.position.y + 1.7, player.position.z);
    }
    applyCamera(0);

    const skyEffects = DamWorld.createSkyEffects(THREE, scene, player);
    const festivalEffects = DamWorld.createFestivalEffects(THREE, scene, player);
    return {
      scene,
      camera,
      playSplash: festivalEffects.playSplash,
      releaseLantern: festivalEffects.releaseLantern,
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
        polar = Math.max(0.85, Math.min(1.35, polar - dy * 0.0032));
      },
      handlePinch(scale) {
        if (!Number.isFinite(scale) || scale <= 0) return;
        radius = Math.max(15, Math.min(58, radius / scale));
      },
      setMoveInput(x, z) {
        moveIn.x = Number.isFinite(x) ? x : 0;
        moveIn.z = Number.isFinite(z) ? z : 0;
        if (Math.hypot(moveIn.x, moveIn.z) > 0.12) resting = false;
      },
      getPlayerPos: () => mounted ? { x: horse.position.x, z: horse.position.z } : { x: player.position.x, z: player.position.z },
      showHorse(x, z) {
        if (!Number.isFinite(x) || !Number.isFinite(z)) return;
        horseShown = true; horse.visible = true;
        if (!mounted) { const p = land.resolve(x, z, horse.position); horse.position.set(p.x, 0, p.z); }
      },
      hideHorse() {
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
        const plot = plotList.find(item => item.site === site && item.idx === idx);
        if (!plot || !plot.claimed || !plot.hut) return false;
        harvestBasket.position.set(plot.x + plot.dirX * 3.1 - plot.dirZ * 1.7, 0, plot.z + plot.dirZ * 3.1 + plot.dirX * 1.7);
        harvestBasket.visible = true;
        return true;
      },
      hideHarvestBasket() { harvestBasket.visible = false; },
      setResting(value) {
        if (value && mounted) return false;
        resting = !!value;
        if (resting) { restAnchor.x = player.position.x; restAnchor.z = player.position.z; moveIn.x = 0; moveIn.z = 0; }
        return true;
      },
      isResting: () => resting,
      setHorseBond(value) { bondLevel = Number.isFinite(value) ? Math.max(0, Math.min(DamWorld.BOND.MAX, value)) : 0; },
      horseCare() { if (horseShown) careT = 1; },
      claimCustomPlot,
      checkPlotSpot(x, z) { return DamWorld.checkCustomPlotSpot(landSpec, plotList, x, z); },
      setMounted(value) {
        const next = !!value;
        if (!horseShown || mounted === next) return;
        resting = false; restBlend = 0; pBody.rotation.x = 0;
        mounted = next;
        moveIn.x = 0; moveIn.z = 0;
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
      getPlots: () => plotList.map(p => ({
        site: p.site, idx: p.idx, x: p.x, z: p.z, claimed: p.claimed, hut: p.hut,
        house: p.house, field: !!p.fieldGroup, fieldStage: p.fieldStage, animals: { ...p.animals },
      })),
      getSites: () => [{ x: -78, z: 66 }, { x: 58, z: 96 }],
      getHallPos: () => ({ x: HALL_POS.x, z: HALL_POS.z }),
      getCrystalPos: () => ({ x: CRYSTAL_POS.x, z: CRYSTAL_POS.z }),
      getSpawn: () => ({ ...landSpec.spawn }),
      resolveLandPosition(x, z) {
        if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
        return land.resolve(x, z, player.position);
      },
      getSpec: () => ({ bounds: { ...landSpec.bounds }, waters: waterZones.map(w => ({ ...w })), colliders: solidZones.map(w => ({ ...w })), spawn: { ...landSpec.spawn } }),
      setFestivalVisible(id) {
        for (const [key, group] of Object.entries(festivalGroups)) group.visible = key === id;
      },
      nearestInteractable() {
        if (horseShown && !mounted && Math.hypot(player.position.x - horse.position.x, player.position.z - horse.position.z) < 6.5) return { type: "horse" };
        if (Math.hypot(player.position.x - CRYSTAL_POS.x, player.position.z - CRYSTAL_POS.z) < 9.5) return { type: "crystal", destination: "ruili" };
        if (Math.hypot(player.position.x - HALL_POS.x, player.position.z - HALL_POS.z) < 12.5) return { type: "hall" };
        let best = null, bd = 10.5;
        for (const p of plotList) {
          const d = Math.hypot(player.position.x - p.x, player.position.z - p.z);
          if (d < bd) { bd = d; best = p; }
        }
        if (best) return { type: "plot", site: best.site, idx: best.idx, claimed: best.claimed, hut: best.hut };
        return null;
      },
      markClaimed(site, idx) {
        const p = plotList.find(q => q.site === site && q.idx === idx);
        if (p && !p.claimed) markClaimedVisual(p);
      },
      buildHut(site, idx) {
        const p = plotList.find(q => q.site === site && q.idx === idx);
        if (p && p.claimed && !p.hut) buildHutVisual(p);
      },
      upgradeBamboo(site, idx) {
        const p = plotList.find(q => q.site === site && q.idx === idx);
        if (p && p.claimed && p.hut && p.house < 2) buildBambooVisual(p);
      },
      openField(site, idx, stage) {
        const p = plotList.find(q => q.site === site && q.idx === idx);
        if (p && p.claimed && p.hut && !p.fieldGroup) openFieldVisual(p, stage);
      },
      setFieldStage(site, idx, stage) {
        const p = plotList.find(q => q.site === site && q.idx === idx);
        if (p) setFieldStageVisual(p, stage);
      },
      addAnimal(site, idx, kind) {
        const p = plotList.find(q => q.site === site && q.idx === idx);
        if (p && p.claimed && p.hut && ["chicken", "rabbit", "sheep"].includes(kind)) addAnimalVisual(p, kind);
      },
      teleportPlayerTo(x, z) {
        if (!Number.isFinite(x) || !Number.isFinite(z)) return;
        resting = false; restBlend = 0; pBody.rotation.x = 0;
        moveIn.x = 0; moveIn.z = 0;
        const p = land.resolve(x, z, player.position);
        if (mounted) horse.position.set(p.x, 0, p.z);
        player.position.set(p.x, mounted ? 1.52 : 0, p.z);
        camPos.set(p.x + radius * Math.sin(polar) * Math.sin(yaw), 14, p.z + radius * Math.sin(polar) * Math.cos(yaw));
        applyCamera(0);
      },
      debugSetPlayer(x, z) { if (Number.isFinite(x) && Number.isFinite(z)) { player.position.set(x, 0, z); applyCamera(0); } },
      update(dt, t) {
        if (!Number.isFinite(dt) || dt < 0 || !Number.isFinite(t)) return;
        if (festivalGroups.songkran.visible) {
          for (const drop of festivalGroups.songkran.children) {
            if (drop.userData?.a === undefined) continue;
            const phase = (t * drop.userData.sp + drop.userData.ph) % 1;
            const radius = 2 + phase * 8.5;
            drop.position.set(Math.cos(drop.userData.a) * radius, 0.4 + Math.sin(phase * Math.PI) * 3.4, Math.sin(drop.userData.a) * radius);
          }
        }
        if (festivalGroups.dengdeng.visible) {
          festivalGroups.dengdeng.children.forEach((lamp, index) => { lamp.position.y = 1.6 + (t * 0.45 + index * 0.77) % 5.5; });
        }
        // 行走：输入是镜头相对方向（z 向前、x 向右）
        const mag = Math.hypot(moveIn.x, moveIn.z);
        moving = mag > 0.12;
        const mover = mounted ? horse : player;
        if (moving) {
          const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
          const rx = -fz, rz = fx;
          const mx = fx * moveIn.z + rx * moveIn.x;
          const mz = fz * moveIn.z + rz * moveIn.x;
          const mm = Math.hypot(mx, mz) || 1;
          const sp = (mounted ? DamWorld.BOND.BASE_SPEED + bondLevel * DamWorld.BOND.SPEED_PER_BOND : 13) * Math.min(1, mag);
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
          const sw = moving ? Math.sin(walkPhase) * 0.55 : 0;
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
            if (bondLevel >= DamWorld.BOND.FOLLOW_AT && distance > 15) {
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
        if (!mounted) {
          player.position.y = restBlend ? -0.42 * restBlend : 0;
          pBody.rotation.x = 0.1 * restBlend;
          if (restBlend > 0.01) { legL.rotation.x = -1.35 * restBlend; legR.rotation.x = -1.35 * restBlend; }
        }
        pBody.scale.y = moving ? 1 : 1 + Math.sin(t * 1.6) * 0.012;
        skyEffects.update(dt, t);
        festivalEffects.update(dt);
        applyCamera(dt);
        riverWaters.forEach((w, i) => { w.material.color.setHSL(0.54, 0.34, 0.63 + Math.sin(t * 0.6 + i * 0.9) * 0.028); });
        lakeWater.material.color.setHSL(0.54, 0.34, 0.65 + Math.sin(t * 0.45) * 0.025);
        crystal.position.y = 3.4 + Math.sin(t * 1.1) * 0.35;
        crystal.rotation.y = t * 0.7;
        for (const cl of clouds) {
          cl.position.x += dt * 1.1;
          if (cl.position.x > 250) cl.position.x = -250;
        }
        for (const a of yardAnimals) {
          a.wait -= dt;
          const dx = a.tx - a.obj.position.x, dz = a.tz - a.obj.position.z;
          const d = Math.hypot(dx, dz);
          if (d < 0.3 && a.wait <= 0) {
            const ang = rnd() * Math.PI * 2, rr2 = rnd() * 4.2;
            a.tx = a.cx + Math.cos(ang) * rr2;
            a.tz = a.cz + Math.sin(ang) * rr2;
            a.wait = 1.5 + rnd() * 3;
          } else if (d >= 0.3) {
            const sp = a.kind === "sheep" ? 0.85 : a.kind === "rabbit" ? 1.6 : 1.1;
            a.obj.position.x += dx / d * sp * dt;
            a.obj.position.z += dz / d * sp * dt;
            a.obj.rotation.y = Math.atan2(dx / d, dz / d);
            if (a.kind === "rabbit") a.obj.position.y = Math.abs(Math.sin(t * 9 + a.cx)) * 0.22;
            else if (a.kind === "chicken") a.obj.rotation.x = Math.sin(t * 7 + a.cz) * 0.08;
          }
        }
        for (const p of peacocks) {
          p.wait -= dt;
          const dx = p.tx - p.obj.position.x, dz = p.tz - p.obj.position.z;
          const d = Math.hypot(dx, dz);
          if (d < 0.4 && p.wait <= 0) {
            p.tx = p.ax + (rnd() * 10 - 5);
            p.tz = p.az + (rnd() * 10 - 5);
            p.wait = 2 + rnd() * 3;
          } else if (d >= 0.4) {
            p.obj.position.x += dx / d * 0.55 * dt;
            p.obj.position.z += dz / d * 0.55 * dt;
            p.obj.rotation.y = Math.atan2(dx / d, dz / d);
          }
          p.obj.userData.tail.rotation.x = 0.16 + Math.sin(t * 0.8 + p.ax) * 0.045;
        }
      },
    };
  }

  return { createMangshiScene };
});
