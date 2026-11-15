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
    // 总佛寺内景状态（大殿建在远置坐标 (600, 0)，详见下方内景块）。状态声明提在这里，
    // 因为 applyCamera 在工厂执行期就会被调用，晚声明会踩 TDZ。
    const TEMPLE_CENTER = { x: 600, z: 0 };
    let insideTemple = false;
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
      sites: [{ x: -78, z: 66 }, { x: 58, z: 96 }], hallPos: HALL_POS, crystalPos: CRYSTAL_POS,
      // 路网（开放式安家）：与上方古道绘制的 roadPts 同一份数据。
      // 地标建筑本体占地圈（修路硬性②）：总佛寺；集市中心与市场组同点。
      roads: [roadPts], marketPos: { x: 4, z: 34 }, landmarks: [{ x: -58, z: -58, r: 15 }] };
    const land = DamWorld.createLandResolver(landSpec);

    // —— 玩家自建路（开放式安家）：路网 = 古道 + 存档自建路；几何函数共用 dam-world 实现 ——
    const baseRoadSegments = DamWorld.roadSegmentsFromPolylines(landSpec.roads);
    let playerRoadList = [];
    let playerRoadSegments = [];
    const playerRoadGroup = new THREE.Group();
    playerRoadGroup.name = "roads:player";
    root.add(playerRoadGroup);
    function roadNetworkSegments() { return baseRoadSegments.concat(playerRoadSegments); }
    function setPlayerRoads(list) {
      playerRoadList = (Array.isArray(list) ? list : [])
        .filter(seg => seg && Number.isFinite(seg.a?.x) && Number.isFinite(seg.a?.z) && Number.isFinite(seg.b?.x) && Number.isFinite(seg.b?.z))
        .map(seg => ({ a: { x: seg.a.x, z: seg.a.z }, b: { x: seg.b.x, z: seg.b.z } }));
      playerRoadSegments = playerRoadList.map(seg => ({ ax: seg.a.x, az: seg.a.z, bx: seg.b.x, bz: seg.b.z }));
      while (playerRoadGroup.children.length) {
        const child = playerRoadGroup.children[0];
        playerRoadGroup.remove(child);
        if (child.geometry?.dispose) child.geometry.dispose();
      }
      for (const seg of playerRoadList) {
        const dx = seg.b.x - seg.a.x, dz = seg.b.z - seg.a.z;
        const length = Math.hypot(dx, dz);
        if (length < 1e-6) continue;
        // 与 dam-world 同口径：≤6 一段分块，过水的块换木料略抬高成木栈道。
        const chunks = Math.max(1, Math.ceil(length / 6));
        for (let i = 0; i < chunks; i++) {
          const t0 = i / chunks, t1 = (i + 1) / chunks;
          const ax = seg.a.x + dx * t0, az = seg.a.z + dz * t0;
          const bx = seg.a.x + dx * t1, bz = seg.a.z + dz * t1;
          const mx = (ax + bx) / 2, mz = (az + bz) / 2;
          const overWater = waterZones.some(w => Math.hypot(mx - w.x, mz - w.z) < w.r);
          const strip = box(Math.hypot(bx - ax, bz - az), 0.07, 3, overWater ? M.wood : M.road, mx, overWater ? 0.1 : 0.05, mz);
          strip.rotation.y = Math.atan2(-dz, dx);
          playerRoadGroup.add(strip);
          if (!overWater && i > 0) {
            const cap = new THREE.Mesh(new THREE.CircleGeometry(1.65, 10), M.road);
            cap.rotation.x = -Math.PI / 2;
            cap.position.set(ax, 0.048, az);
            playerRoadGroup.add(cap);
          }
        }
        for (const p of [seg.a, seg.b]) {
          const cap = new THREE.Mesh(new THREE.CircleGeometry(1.5, 10), M.road);
          cap.rotation.x = -Math.PI / 2;
          cap.position.set(p.x, 0.05, p.z);
          playerRoadGroup.add(cap);
        }
      }
    }
    // —— 总佛寺内景（用户 2026-11-15 21:38：寺要能进人，进去拜神、祈祷、静坐）——
    // 大殿落在坝外远置坐标 (600, 0) 的独立室内区，与户外同处一个场景：进/出寺是区内
    // 位置转移；殿内位置从不落档，世界重建后玩家恒在寺外，不会卡在室内。
    // 殿内零经济：不发币、不加产量、不做交易、不放充值入口（老规矩）。
    // 姿态口径（本模块独立实现）：1 合掌 / 2 跪拜——寺内礼拜是跪在蒲团上叩拜、身体有
    // 起伏，与 dam-world 金塔礼拜庭的站姿礼拜区分；静坐沿用 setResting 坐姿，呼吸起伏
    // 在 update 里放大到看得见；敲木鱼、盘佛珠都是纯动作，不计数、不发币。
    const TEMPLE_RECT = { halfX: 14.6, halfZ: 10.6 };
    const templeColliders = [
      { x: 600, z: -7.6, r: 3.6 },   // 佛龛台 + 供桌
      { x: 591, z: -5, r: 0.85 }, { x: 609, z: -5, r: 0.85 },
      { x: 591, z: 5.5, r: 0.85 }, { x: 609, z: 5.5, r: 0.85 }, // 梁柱
      { x: 610.8, z: -2.5, r: 1.7 }, // 木鱼案
      { x: 591.4, z: -4.4, r: 1.5 }, // 佛珠架
      { x: 593.2, z: -5.8, r: 0.5 }, { x: 606.8, z: -5.8, r: 0.5 }, // 长明灯柱
    ];
    function interiorResolve(x, z, previous) {
      const fallback = previous && Number.isFinite(previous.x) && Number.isFinite(previous.z)
        ? { x: previous.x, z: previous.z } : { x: TEMPLE_CENTER.x, z: 7.4 };
      if (!Number.isFinite(x) || !Number.isFinite(z)) return fallback;
      const p = { x, z };
      const clampRect = q => {
        q.x = Math.max(TEMPLE_CENTER.x - TEMPLE_RECT.halfX, Math.min(TEMPLE_CENTER.x + TEMPLE_RECT.halfX, q.x));
        q.z = Math.max(TEMPLE_CENTER.z - TEMPLE_RECT.halfZ, Math.min(TEMPLE_CENTER.z + TEMPLE_RECT.halfZ, q.z));
      };
      clampRect(p);
      for (let pass = 0; pass < 16; pass++) {
        let ok = true;
        for (const c of templeColliders) {
          let dx = p.x - c.x, dz = p.z - c.z;
          let d = Math.hypot(dx, dz);
          if (d >= c.r) continue;
          ok = false;
          if (d < 1e-9) { dx = fallback.x - c.x; dz = fallback.z - c.z; d = Math.hypot(dx, dz) || 1; }
          p.x = c.x + dx / d * (c.r + 1e-6);
          p.z = c.z + dz / d * (c.r + 1e-6);
        }
        clampRect(p);
        if (ok) break;
      }
      return p;
    }
    const inTempleRect = (x, z) => Math.abs(x - TEMPLE_CENTER.x) <= 17 && Math.abs(z - TEMPLE_CENTER.z) <= 13;
    let templeReturn = null;
    let prayerPose = 0, kneelBlend = 0, bowClock = 0;
    let beadsPose = false, knockT = 0, rippleT = 0;
    let baseHemi = 0.95, baseSun = 0.9, lastSky = null;
    function refreshLights() {
      // 殿内光偏暖偏静：压低日光与天光、靠殿内点光源提暖；出寺即恢复。雨幕不进殿。
      hemi.intensity = baseHemi * (insideTemple ? 0.5 : 1);
      sun.intensity = baseSun * (insideTemple ? 0.3 : 1);
      if (lastSky) skyEffects.setSky(insideTemple ? { ...lastSky, rain: false } : lastSky);
    }
    const templeHall = new THREE.Group();
    templeHall.position.set(TEMPLE_CENTER.x, 0, TEMPLE_CENTER.z);
    templeHall.name = "temple:hall";
    root.add(templeHall);
    const TB = (w, h, d, mat, x, y, z) => { const m = box(w, h, d, mat, x, y, z); templeHall.add(m); return m; };
    // 殿外一小片绿地（从殿门往外看不是虚空）
    const hallGround = new THREE.Mesh(new THREE.CircleGeometry(48, 26), M.meadow2);
    hallGround.rotation.x = -Math.PI / 2;
    hallGround.position.set(TEMPLE_CENTER.x, -0.04, TEMPLE_CENTER.z);
    root.add(hallGround);
    TB(34.5, 0.5, 26.5, M.stoneD, 0, -0.27, 0);       // 基座
    TB(32, 0.3, 24, M.stone, 0, -0.12, 0);            // 地板
    TB(6.5, 0.07, 17.5, M.earth, 0, 0.045, -0.6);     // 中央拜道
    // 墙体（南墙留门洞，洞宽 4.4、高 4.2）
    TB(32, 6.4, 0.7, M.cream, 0, 3.2, -11.65);
    TB(0.7, 6.4, 24, M.cream, -15.65, 3.2, 0);
    TB(0.7, 6.4, 24, M.cream, 15.65, 3.2, 0);
    TB(13.8, 6.4, 0.7, M.cream, -9.1, 3.2, 11.65);
    TB(13.8, 6.4, 0.7, M.cream, 9.1, 3.2, 11.65);
    TB(4.4, 2.2, 0.7, M.cream, 0, 5.3, 11.65);
    TB(31.5, 3.0, 0.5, M.cream, 0, 7.7, -11.65);
    TB(31.5, 3.0, 0.5, M.cream, 0, 7.7, 11.65);
    // 屋顶（双坡）与脊梁
    const roofN = TB(34.5, 0.35, 15.8, M.roof, 0, 8.55, -6.2); roofN.rotation.x = 0.42;
    const roofS = TB(34.5, 0.35, 15.8, M.roof, 0, 8.55, 6.2); roofS.rotation.x = -0.42;
    TB(34.5, 0.5, 0.7, M.woodDark, 0, 9.85, 0);
    // 梁柱
    for (const [px, pz] of [[-9, -5], [9, -5], [-9, 5.5], [9, 5.5]]) {
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, 6.4, 8), M.wood);
      pillar.position.set(px, 3.2, pz);
      templeHall.add(pillar);
    }
    // 佛龛：台阶、背屏、光背、金身（庄重简净，不做恐怖相）
    TB(11, 0.5, 4.6, M.stone, 0, 0.25, -8.9);
    TB(9, 0.5, 3.6, M.stone, 0, 0.75, -9.3);
    TB(9.5, 5.2, 0.5, M.woodDark, 0, 3.4, -11.15);
    TB(9.9, 0.35, 0.55, M.gold, 0, 6.05, -11.15);
    const halo = new THREE.Mesh(new THREE.CircleGeometry(1.5, 20), M.gold);
    halo.position.set(0, 3.75, -10.85);
    templeHall.add(halo);
    const buddha = new THREE.Group();
    buddha.position.set(0, 1.0, -9.55);
    templeHall.add(buddha);
    const bBase = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.7, 0.45, 12), M.gold);
    bBase.position.y = 0.22; buddha.add(bBase);
    const bLap = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 9), M.gold);
    bLap.scale.set(1.5, 0.55, 1.0); bLap.position.y = 0.62; buddha.add(bLap);
    const bTorso = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 9), M.gold);
    bTorso.scale.set(0.95, 1.15, 0.7); bTorso.position.y = 1.5; buddha.add(bTorso);
    const bHead = new THREE.Mesh(new THREE.SphereGeometry(0.52, 11, 9), M.gold);
    bHead.position.y = 2.55; buddha.add(bHead);
    const bBun = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 7), M.gold);
    bBun.position.y = 3.02; buddha.add(bBun);
    buddha.add(box(0.12, 0.34, 0.08, M.gold, -0.55, 2.48, 0));
    buddha.add(box(0.12, 0.34, 0.08, M.gold, 0.55, 2.48, 0));
    // 供桌、供碗、长明灯
    TB(6.4, 0.25, 1.4, M.woodDark, 0, 1.02, -6.4);
    for (const [lx, lz] of [[-2.9, -0.5], [2.9, -0.5], [-2.9, 0.5], [2.9, 0.5]]) TB(0.22, 1.0, 0.22, M.woodDark, lx, 0.5, -6.4 + lz);
    for (const [bx, bmat] of [[-1.6, M.gold], [0, M.cream], [1.6, M.gold]]) {
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.2, 0.22, 10), bmat);
      bowl.position.set(bx, 1.26, -6.4);
      templeHall.add(bowl);
    }
    for (const sx of [-3.9, 3.9]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 2.2, 7), M.wood);
      pole.position.set(sx, 1.1, -6.4); templeHall.add(pole);
      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 7), M.gold);
      flame.position.set(sx, 2.35, -6.4); templeHall.add(flame);
    }
    // 蒲团一排（左祈祷 / 中礼拜 / 右静坐，间以素蒲团）
    for (const [cx, cmat] of [[-5.4, M.saddle], [-2.7, M.hemp], [0, M.saddle], [2.7, M.hemp], [5.4, M.saddle]]) {
      const cushion = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.95, 0.32, 12), cmat);
      cushion.position.set(cx, 0.16, -4.4);
      templeHall.add(cushion);
    }
    // 蒲团两端的长明灯柱
    for (const sx of [-6.8, 6.8]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 2.0, 7), M.wood);
      pole.position.set(sx, 1.0, -5.8); templeHall.add(pole);
      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 7), M.gold);
      flame.position.set(sx, 2.12, -5.8); templeHall.add(flame);
    }
    // 木鱼案（东侧）：案台、木鱼、敲棒、声波纹（宿主无音频通道，敲击做纯视觉）
    TB(2.4, 0.9, 1.5, M.wood, 10.8, 0.45, -2.5);
    const fishBody = new THREE.Mesh(new THREE.SphereGeometry(0.95, 12, 10), M.wood);
    fishBody.scale.set(1.05, 0.8, 0.85);
    fishBody.position.set(10.8, 1.32, -2.5);
    templeHall.add(fishBody);
    TB(1.15, 0.09, 0.28, M.woodDark, 10.8, 1.98, -2.5);
    const strikerPivot = new THREE.Group();
    strikerPivot.position.set(9.72, 1.62, -2.5);
    templeHall.add(strikerPivot);
    strikerPivot.add(box(0.85, 0.09, 0.09, M.woodDark, 0.42, 0, 0));
    const strikerKnob = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 7), M.woodDark);
    strikerKnob.position.set(0.85, 0, 0);
    strikerPivot.add(strikerKnob);
    const ripple = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.0, 24),
      new THREE.MeshBasicMaterial({ color: 0xd9a441, transparent: true, opacity: 0, depthWrite: false }));
    ripple.rotation.x = -Math.PI / 2;
    ripple.position.set(10.8, 2.2, -2.5);
    ripple.visible = false;
    templeHall.add(ripple);
    // 佛珠架（西侧）：托台、小架、垂着的一串念珠
    TB(1.2, 0.55, 1.7, M.wood, -8.6, 0.27, -4.4);
    TB(0.12, 1.0, 0.12, M.woodDark, -8.6, 1.05, -4.95);
    TB(0.12, 1.0, 0.12, M.woodDark, -8.6, 1.05, -3.85);
    TB(0.12, 0.12, 1.3, M.woodDark, -8.6, 1.58, -4.4);
    const beadLoop = new THREE.Group();
    beadLoop.position.set(-8.6, 1.08, -4.4);
    templeHall.add(beadLoop);
    for (let i = 0; i < 14; i++) {
      const a = i / 14 * Math.PI * 2;
      const bead = new THREE.Mesh(new THREE.SphereGeometry(0.085, 7, 6), M.woodDark);
      bead.position.set(0, Math.cos(a) * 0.42, Math.sin(a) * 0.42);
      beadLoop.add(bead);
    }
    templeHall.add(box(0.07, 0.34, 0.07, M.saddle, -8.6, 0.5, -4.4));
    // 殿内暖光（点光源带距离衰减，照不到户外）
    const shrineLight = new THREE.PointLight(0xffbf74, 1.15, 42, 1);
    shrineLight.position.set(0, 3.4, -7.0);
    templeHall.add(shrineLight);
    const hallLight = new THREE.PointLight(0xffd9a0, 0.5, 60, 1);
    hallLight.position.set(0, 5.2, 2);
    templeHall.add(hallLight);
    // 殿门外石台与三棵树
    root.add(box(7, 0.12, 5, M.stone, TEMPLE_CENTER.x, 0.02, TEMPLE_CENTER.z + 14.2));
    for (const [tx, tz] of [[-20, 26], [16, 30], [27, 13]]) {
      const tree = new THREE.Group();
      const tr = new THREE.Mesh(trunkGeo, M.trunk); tr.position.y = 0.95; tree.add(tr);
      const cn = new THREE.Mesh(canGeo2, M.leaf); cn.position.y = 3.6; tree.add(cn);
      tree.position.set(TEMPLE_CENTER.x + tx, 0, TEMPLE_CENTER.z + tz);
      root.add(tree);
    }
    // 玩家手里的念珠（盘佛珠时出现，珠串在 update 里缓缓滚动）
    const heldBeads = new THREE.Group();
    heldBeads.position.set(0, 1.12, 0.52);
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2;
      const bead = new THREE.Mesh(new THREE.SphereGeometry(0.075, 7, 6), M.woodDark);
      bead.position.set(Math.cos(a) * 0.3, Math.sin(a) * 0.3, 0);
      heldBeads.add(bead);
    }
    heldBeads.visible = false;
    player.add(heldBeads);
    // —— 进出寺与动作锚点 ——
    const templeSite = {
      // 寺门锚点：寺体中心 (-58,-58) 沿门向（寺体旋转 0.35）16.5 单位，恰在碰撞圈外缘。
      door: { x: -58 + Math.sin(0.35) * 16.5, z: -58 + Math.cos(0.35) * 16.5, r: 7 },
      entry: { x: TEMPLE_CENTER.x, z: TEMPLE_CENTER.z + 7.4, yaw: Math.PI },
      exit: { x: TEMPLE_CENTER.x, z: TEMPLE_CENTER.z + 10.3, r: 2.6 },
      bow: { x: TEMPLE_CENTER.x, z: TEMPLE_CENTER.z - 4.4, r: 2.4, yaw: Math.PI },
      pray: { x: TEMPLE_CENTER.x - 5.4, z: TEMPLE_CENTER.z - 4.4, r: 2.0, yaw: Math.PI },
      sit: { x: TEMPLE_CENTER.x + 5.4, z: TEMPLE_CENTER.z - 4.4, r: 2.0, yaw: Math.PI },
      fish: { x: TEMPLE_CENTER.x + 8.4, z: TEMPLE_CENTER.z - 2.5, r: 2.4, yaw: Math.PI / 2 },
      beads: { x: TEMPLE_CENTER.x - 6.8, z: TEMPLE_CENTER.z - 4.4, r: 2.2, yaw: -Math.PI / 2 },
    };
    function enterTemple() {
      if (insideTemple || mounted) return false;
      templeReturn = { x: player.position.x, z: player.position.z };
      insideTemple = true;
      resting = false; restBlend = 0; pBody.rotation.x = 0;
      prayerPose = 0; beadsPose = false; heldBeads.visible = false;
      moveIn.x = 0; moveIn.z = 0;
      player.position.set(templeSite.entry.x, 0, templeSite.entry.z);
      player.rotation.y = templeSite.entry.yaw;
      camPos.set(templeSite.entry.x + radius * Math.sin(polar) * Math.sin(yaw), 14, templeSite.entry.z + radius * Math.sin(polar) * Math.cos(yaw));
      applyCamera(0);
      refreshLights();
      return true;
    }
    function exitTemple() {
      if (!insideTemple) return false;
      insideTemple = false;
      prayerPose = 0; beadsPose = false; heldBeads.visible = false;
      resting = false; restBlend = 0; pBody.rotation.x = 0;
      moveIn.x = 0; moveIn.z = 0;
      const target = templeReturn || templeSite.door;
      const p = land.resolve(target.x, target.z, player.position);
      player.position.set(p.x, 0, p.z);
      camPos.set(p.x + radius * Math.sin(polar) * Math.sin(yaw), 14, p.z + radius * Math.sin(polar) * Math.cos(yaw));
      applyCamera(0);
      refreshLights();
      return true;
    }

    const moveIn = { x: 0, z: 0 };
    let walkPhase = 0, moving = false;
    const camPos = new THREE.Vector3(player.position.x, 16, player.position.z + 28);
    function applyCamera(dt) {
      const sp = Math.sin(polar);
      const cameraRadius = (insideTemple ? Math.min(radius, 10.5) : radius) * (1 - 0.22 * restBlend);
      const tx = player.position.x + cameraRadius * sp * Math.sin(yaw);
      const ty = player.position.y + cameraRadius * Math.cos(polar) + 1.6;
      const tz = player.position.z + cameraRadius * sp * Math.cos(yaw);
      const k = dt ? Math.min(1, dt * 5) : 1;
      camPos.x += (tx - camPos.x) * k;
      camPos.y += (ty - camPos.y) * k;
      camPos.z += (tz - camPos.z) * k;
      if (insideTemple) {
        // 殿内镜头不出墙、不穿顶：位置钳在大殿内腔里。
        camPos.x = Math.max(TEMPLE_CENTER.x - 15.1, Math.min(TEMPLE_CENTER.x + 15.1, camPos.x));
        camPos.z = Math.max(TEMPLE_CENTER.z - 11.1, Math.min(TEMPLE_CENTER.z + 11.1, camPos.z));
        camPos.y = Math.max(1.1, Math.min(6.7, camPos.y));
      }
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
        lastSky = sky;
        scene.background.set(sky.bg);
        if (scene.fog) scene.fog.color.set(sky.fog);
        baseHemi = sky.hemi;
        baseSun = sky.sun;
        sun.color.set(sky.sunColor);
        refreshLights();
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
      // —— 总佛寺内景接口（控制器驱动；姿态口径见内景块注释）——
      getTempleSite: () => ({
        door: { ...templeSite.door }, entry: { ...templeSite.entry }, exit: { ...templeSite.exit },
        bow: { ...templeSite.bow }, pray: { ...templeSite.pray }, sit: { ...templeSite.sit },
        fish: { ...templeSite.fish }, beads: { ...templeSite.beads },
      }),
      enterTemple,
      exitTemple,
      isInTemple: () => insideTemple,
      setPlayerYaw(value) { if (!mounted && Number.isFinite(value)) player.rotation.y = value; },
      setPrayerPose(value) {
        // 与 setResting 相互独立（祈祷要跪坐+合掌并存），姿态视觉在 update 里合成；
        // 这点与 dam-world 的互斥口径不同，差异在此注明。
        prayerPose = [0, 1, 2].includes(value) ? value : 0;
        if (prayerPose === 2) bowClock = 0;
      },
      getPrayerPose: () => prayerPose,
      setBeadsPose(value) {
        beadsPose = !!value;
        heldBeads.visible = beadsPose;
        if (!beadsPose) heldBeads.rotation.z = 0;
      },
      getBeadsPose: () => beadsPose,
      knockWoodenFish() {
        if (!insideTemple) return false;
        knockT = 0.28; rippleT = 0.55; ripple.visible = true;
        return true;
      },
      showHorse(x, z) {
        if (!Number.isFinite(x) || !Number.isFinite(z)) return;
        horseShown = true; horse.visible = true;
        if (!mounted) { const p = land.resolve(x, z, horse.position); horse.position.set(p.x, 0, p.z); }
      },
      hideHorse() {
        resting = false; restBlend = 0; pBody.rotation.x = 0;
        prayerPose = 0; beadsPose = false; heldBeads.visible = false;
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
      checkPlotSpot(x, z) { return DamWorld.checkCustomPlotSpot(landSpec, plotList, x, z, roadNetworkSegments()); },
      setPlayerRoads,
      getPlayerRoads: () => playerRoadList.map(seg => ({ a: { ...seg.a }, b: { ...seg.b } })),
      getRoadSegments: () => roadNetworkSegments().map(seg => ({ a: { x: seg.ax, z: seg.az }, b: { x: seg.bx, z: seg.bz } })),
      distanceToRoadNetwork(x, z) { return DamWorld.distanceToRoadSegments(x, z, roadNetworkSegments()); },
      validateRoadSegment(a, b) {
        return DamWorld.validateRoadSegment(a, b, {
          landmarks: landSpec.landmarks || [], hallPos: HALL_POS, marketPos: landSpec.marketPos,
          crystalPos: CRYSTAL_POS, plots: plotList,
        });
      },
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
        prayerPose = 0; beadsPose = false; heldBeads.visible = false;
        moveIn.x = 0; moveIn.z = 0;
        let p;
        if (inTempleRect(x, z)) {
          // 殿内落位（拜/祷/坐/敲/盘的站位转移）：走室内解算，保持殿内模式。
          p = interiorResolve(x, z, player.position);
        } else {
          // 任何一次传到殿外都算出寺：模式与灯光随之复位，不会把人卡在室内状态里。
          if (insideTemple) { insideTemple = false; refreshLights(); }
          p = land.resolve(x, z, player.position);
        }
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
          const nx = mover.position.x + mx / mm * sp * dt, nz = mover.position.z + mz / mm * sp * dt;
          const next = insideTemple && !mounted ? interiorResolve(nx, nz, mover.position) : land.resolve(nx, nz, mover.position);
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
        } else if (prayerPose === 1) {
          // 合掌：双臂向前上方收拢，静立（祈祷时与坐姿叠加，腿由下方坐姿块接管）
          armL.rotation.x = -1.22; armR.rotation.x = -1.22;
          armL.rotation.z = 0.16; armR.rotation.z = -0.16;
          legL.rotation.x = 0; legR.rotation.x = 0;
        } else if (prayerPose === 2) {
          // 跪拜：双腿折跪；上身与双臂的叩首起伏在下方 kneel 块里驱动
          armL.rotation.z = 0.1; armR.rotation.z = -0.1;
          legL.rotation.x = -1.45; legR.rotation.x = -1.45;
        } else if (beadsPose) {
          // 盘佛珠：双手在身前虚持念珠
          armL.rotation.x = -0.88; armR.rotation.x = -0.88;
          armL.rotation.z = 0.12; armR.rotation.z = -0.12;
          legL.rotation.x = 0; legR.rotation.x = 0;
        } else {
          const sw = moving ? Math.sin(walkPhase) * 0.55 : 0;
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
          // 跪拜起伏：先跪下（kneelBlend 缓动），再随 bowClock 叩首一轮（俯身→起身），
          // 双臂随俯身前伸触地意象；与静坐坐姿（restBlend 盘腿、身直）明确区分。
          kneelBlend += ((prayerPose === 2 ? 1 : 0) - kneelBlend) * Math.min(1, dt * 4);
          if (prayerPose !== 2 && kneelBlend < 0.02) kneelBlend = 0;
          bowClock = prayerPose === 2 ? bowClock + dt : 0;
          const dip = prayerPose === 2 ? Math.sin(Math.min(bowClock / 2.6, 1) * Math.PI) : 0;
          player.position.y = (restBlend ? -0.42 * restBlend : 0) - 0.52 * kneelBlend;
          pBody.rotation.x = kneelBlend > 0.03 ? kneelBlend * (0.12 + 0.55 * dip) : 0.1 * restBlend;
          if (prayerPose === 2) { const reach = -0.4 - 1.05 * dip * kneelBlend; armL.rotation.x = reach; armR.rotation.x = reach; }
          if (restBlend > 0.01 && prayerPose !== 2) { legL.rotation.x = -1.35 * restBlend; legR.rotation.x = -1.35 * restBlend; }
        }
        // 呼吸起伏：站立时几乎看不见；坐下（静坐/祈祷跪坐）时放大——胸口随呼吸缓起缓落。
        const seatedBreath = !mounted && restBlend > 0.4 && !moving;
        pBody.scale.y = moving ? 1 : 1 + Math.sin(t * (seatedBreath ? 1.3 : 1.6)) * (seatedBreath ? 0.05 : 0.012);
        pHead.position.y = 2.08 + (seatedBreath ? Math.sin(t * 1.3) * 0.025 : 0);
        skyEffects.update(dt, t);
        festivalEffects.update(dt);
        applyCamera(dt);
        riverWaters.forEach((w, i) => { w.material.color.setHSL(0.54, 0.34, 0.63 + Math.sin(t * 0.6 + i * 0.9) * 0.028); });
        lakeWater.material.color.setHSL(0.54, 0.34, 0.65 + Math.sin(t * 0.45) * 0.025);
        crystal.position.y = 3.4 + Math.sin(t * 1.1) * 0.35;
        crystal.rotation.y = t * 0.7;
        // 木鱼敲击：敲棒落下、鱼身轻颤、一圈淡声波纹散开（纯视觉，无音频通道）。
        if (knockT > 0) {
          knockT = Math.max(0, knockT - dt);
          const dipK = Math.sin((1 - knockT / 0.28) * Math.PI);
          strikerPivot.rotation.z = -0.42 * dipK;
          fishBody.scale.set(1.05 * (1 + 0.05 * dipK), 0.8 * (1 - 0.03 * dipK), 0.85 * (1 + 0.05 * dipK));
        } else strikerPivot.rotation.z = 0;
        if (rippleT > 0) {
          rippleT = Math.max(0, rippleT - dt);
          const rp = 1 - rippleT / 0.55;
          ripple.scale.setScalar(0.5 + rp * 1.9);
          ripple.material.opacity = 0.75 * (1 - rp);
          ripple.visible = rippleT > 0;
        }
        // 盘佛珠：手里的珠串缓缓滚动，一颗一颗捻过去。
        if (beadsPose) heldBeads.rotation.z -= dt * 0.55;
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
