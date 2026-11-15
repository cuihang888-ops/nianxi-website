// 安和里 · 瑞丽坝（第 16 轮起建在通用坝引擎 dam-world 上：可走、可安家）
// 真实格局：瑞丽江为南界大江；南宛河自东北汇入；弄莫湖（牛轭湖）在城西；
// 姐勒金塔在东北山丘；莫里瀑布在西北山里（雨林）；独树成林在东边芒令；集市与大厅亭在坝心。
// M1 施工（2026-11-15）：site0「湖畔」按共享村落契约（shared-village.cjs）排布 8 块地块
// （样板 A/B + 预留 C–H，plotId 与契约一一对应）、村心空地、井台榕树；姐勒金塔山脚设礼拜庭可入塔祈福。
// 契约模块不可用时（如旧测试夹具的 require 桩）回退为原环形地块，不影响其余坝与旧存档结构。
(function (global, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./shared-village.cjs"));
  else global.AnheliRuili = factory(global.AnheliSharedVillage);
})(typeof self !== "undefined" ? self : this, function (Village) {
  "use strict";

  const V = Village && Array.isArray(Village.ALL_PLOTS) && Array.isArray(Village.SAMPLE_PLOTS)
    && typeof Village.toDamCoords === "function" && typeof Village.pointInBounds === "function" ? Village : null;

  function createRuiliScene(THREE, DamWorld) {
    const DW = DamWorld || (typeof globalThis !== "undefined" ? globalThis.AnheliDamWorld : null);
    const pagodaHillRadius = V ? V.PAGODA.hillRadius : 30;
    // —— 契约数据换算到坝内坐标（数值唯一来源是 shared-village.cjs，这里只换算不另立一份）——
    let villagePlots = null, pagoda = null, prayerSite = null, mapFeatures = null;
    if (V) {
      const sampleIds = new Set(V.SAMPLE_PLOTS.map(p => p.id));
      villagePlots = V.ALL_PLOTS.map(p => {
        const center = V.toDamCoords(p.origin);
        const sample = sampleIds.has(p.id);
        return {
          id: p.id, x: center.x, z: center.z, w: V.PLOT_WIDTH, d: V.PLOT_DEPTH,
          face: Math.PI, // 户门朝北（-Z）向主路，与契约 house.yaw / gate 一致
          reserved: !sample, interactR: 13,
          layout: sample ? p.layout : null, // 样板地画格局示意线；预留地不画
        };
      });
      const center = V.toDamCoords(V.PAGODA.center);
      const off = V.PAGODA.entry.localOffset;
      const offLen = Math.hypot(off.x, off.z) || 1;
      const dir = { x: off.x / offLen, z: off.z / offLen }; // 塔中心 → 村落/古道方向（西南）
      const courtDistance = pagodaHillRadius + 8.5;
      const entry = { x: center.x + dir.x * (courtDistance + 6.4), z: center.z + dir.z * (courtDistance + 6.4) };
      pagoda = {
        center, entry, dir,
        court: { x: center.x + dir.x * courtDistance, z: center.z + dir.z * courtDistance },
        shrine: { x: center.x + dir.x * (courtDistance - 3), z: center.z + dir.z * (courtDistance - 3) },
        spot: { x: center.x + dir.x * (courtDistance + 1), z: center.z + dir.z * (courtDistance + 1) },
      };
      prayerSite = {
        entry: { x: entry.x, z: entry.z, r: V.PAGODA.entry.radius },
        spot: { x: pagoda.spot.x, z: pagoda.spot.z, yaw: Math.atan2(-dir.x, -dir.z) }, // 站定面塔
        ring: { x: center.x, z: center.z, r: pagodaHillRadius + 2 }, // 依可见山体半径留出整圈步道；契约台面不作为地面环线
      };
      mapFeatures = {
        villageId: V.VILLAGE_ID,
        boundsPolygon: V.BOUNDS_POLYGON.map(p => V.toDamCoords(p)),
        commons: (() => {
          const a = V.toDamCoords({ x: V.VILLAGE_COMMONS.minX, z: V.VILLAGE_COMMONS.minZ });
          const b = V.toDamCoords({ x: V.VILLAGE_COMMONS.maxX, z: V.VILLAGE_COMMONS.maxZ });
          return { minX: a.x, minZ: a.z, maxX: b.x, maxZ: b.z };
        })(),
        plots: villagePlots.map(p => ({ id: p.id, x: p.x, z: p.z, w: p.w, d: p.d, reserved: p.reserved })),
        commonPoint: { ...V.toDamCoords(V.COMMON_POINT.position), radius: V.COMMON_POINT.radius },
        roads: [
          { points: [V.ROAD_APPROACH_WEST, ...V.ROAD_POINTS].map(p => V.toDamCoords(p)), width: V.ROAD_HALF_WIDTH * 2 },
          { points: V.TEMPLE_ROUTE.map(p => V.toDamCoords(p)), width: V.ROAD_HALF_WIDTH * 2 },
          ...[18.5, 53.5].map(z => ({ points: [-69, 35].map(x => V.toDamCoords({ x, z })), width: 3 })),
        ],
        market: { ...V.toDamCoords(V.MARKET_SELL_POINT), name: "集市", area: { ...V.toDamCoords(V.MARKET), radius: V.MARKET.radius } },
        hall: { ...V.toDamCoords(V.HALL_POS), name: "大厅" },
        exits: [
          { id: "west-road", name: "西古道", from: V.toDamCoords(V.WEST_JUNCTION), to: V.toDamCoords(V.ROAD_APPROACH_WEST) },
          { id: V.TEMPLE_EXIT.templeId, name: "往总佛寺", from: V.toDamCoords(V.TEMPLE_EXIT.point), to: V.toDamCoords(V.TEMPLE_EXIT.milestone) },
        ],
        pagoda: { id: V.PAGODA.id, name: V.PAGODA.name, center, entry: { x: entry.x, z: entry.z }, court: { ...pagoda.court, radius: 8.2 }, prayer: true },
      };
    }
    // 样板地格局示意 + 木牌（引擎 decoratePlot 钩子；认领后引擎自动撤下本组视觉）
    function villagePlotDecor(plot, M, H) {
      const { box } = H;
      const g = new THREE.Group();
      const gateZ = plot.z - plot.d / 2; // face=π：户门在北边中点（契约 gate 局部 (0,-16)）
      const sign = new THREE.Group();
      sign.position.set(plot.x + 3.1, 0, gateZ - 0.6);
      sign.add(box(0.2, 1.6, 0.2, M.woodDark, 0, 0.8, 0));
      sign.add(box(1.6, 0.95, 0.1, M.cream, 0, 1.75, 0));
      g.add(sign);
      if (plot.reserved) {
        // 预留地：门前横一道木栏——地已划好、门还未开（不挂人名、不冒充已开放）
        g.add(box(0.18, 1.0, 0.18, M.wood, plot.x - 1.9, 0.5, gateZ - 0.4));
        g.add(box(0.18, 1.0, 0.18, M.wood, plot.x + 1.9, 0.5, gateZ - 0.4));
        g.add(box(4.0, 0.14, 0.14, M.woodDark, plot.x, 0.85, gateZ - 0.4));
      }
      if (plot.layout) {
        // 格局示意线：地基线（house 锚点）、田畦线（beds 锚点）、院落圈（animalZone 锚点），只有线、没有物件
        const line = (cx, cz, w, d) => {
          const y = 0.26, t = 0.16;
          g.add(box(w, 0.05, t, M.stoneD, plot.x + cx, y, plot.z + cz - d / 2));
          g.add(box(w, 0.05, t, M.stoneD, plot.x + cx, y, plot.z + cz + d / 2));
          g.add(box(t, 0.05, d, M.stoneD, plot.x + cx - w / 2, y, plot.z + cz));
          g.add(box(t, 0.05, d, M.stoneD, plot.x + cx + w / 2, y, plot.z + cz));
        };
        line(plot.layout.house.position.x, plot.layout.house.position.z, 5.6, 5.6);
        for (const bed of plot.layout.beds) line(bed.position.x, bed.position.z, bed.size.x, bed.size.z);
        const ring = new THREE.Mesh(new THREE.RingGeometry(plot.layout.animalZone.radius - 0.16, plot.layout.animalZone.radius, 28), M.stoneD);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(plot.x + plot.layout.animalZone.center.x, 0.26, plot.z + plot.layout.animalZone.center.z);
        g.add(ring);
      }
      return g;
    }
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
      siteLayouts: V ? [{ plots: villagePlots }, null] : undefined,
      decoratePlot: V ? villagePlotDecor : undefined,
      prayerSite: prayerSite || undefined,
      guideRing: prayerSite ? prayerSite.ring : undefined,
      mapFeatures,
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
          [190, -205, 58, 42, M.hill3], [228, -30, 55, 32, M.hill1], [232, 95, 52, 26, M.hill3],
          [-228, 30, 56, 32, M.hill1], [-40, 218, 70, 28, M.hill2], [140, 205, 55, 24, M.hill3],
        ];
        for (const [hx, hz, r, h, mat] of hillDefs) {
          const hill = new THREE.Mesh(new THREE.ConeGeometry(r, h, 9), mat);
          hill.position.set(hx, h / 2 - 2, hz);
          root.add(hill);
          colliders.push({ x: hx, z: hz, r: r * 0.52 });
        }
        const waters = [];
        const placement = { waters: [], solids: hillDefs.map(([x, z, r]) => ({ x, z, r })), roads: [] };
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
              placement.waters.push({ x: w.position.x, z: w.position.z, r: r * 1.35 });
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
          placement.waters.push({ x: lx, z: lz, r: lr });
          root.add(w); waters.push(w);
        }
        // 姐勒金塔（东北山丘）
        const jtHill = new THREE.Mesh(new THREE.ConeGeometry(pagodaHillRadius, 15, 10), M.hill3);
        jtHill.name = "pagoda:hill";
        jtHill.position.set(152, 5.5, -118);
        root.add(jtHill);
        const jt = new THREE.Group();
        jt.name = "pagoda:tower";
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
        colliders.push({ x: 152, z: -118, r: pagodaHillRadius });
        // 莫里瀑布（西北）
        root.add(box(26, 17, 6, M.stoneD, -158, 8.5, -118));
        colliders.push({ x: -158, z: -118, r: 13 });
        const fallMat = M.water.clone();
        const fall = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 15), fallMat);
        fall.position.set(-158, 8.6, -114.6);
        root.add(fall);
        const pool = new THREE.Mesh(new THREE.CircleGeometry(8.5, 13), M.water.clone());
        pool.rotation.x = -Math.PI / 2; pool.position.set(-158, 0.06, -108);
        placement.waters.push({ x: -158, z: -108, r: 8.5 });
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
        if (V) {
          // —— 共享村落公共空间（site0 湖畔；坐标全部经 shared-village 换算，不另立一份）——
          const commonsA = V.toDamCoords({ x: V.VILLAGE_COMMONS.minX, z: V.VILLAGE_COMMONS.minZ });
          const commonsB = V.toDamCoords({ x: V.VILLAGE_COMMONS.maxX, z: V.VILLAGE_COMMONS.maxZ });
          root.add(box(commonsB.x - commonsA.x, 0.06, commonsB.z - commonsA.z, M.earth,
            (commonsA.x + commonsB.x) / 2, 0.03, (commonsA.z + commonsB.z) / 2));
          for (const lz of [18.5, 53.5]) { // 排间土巷（村落 z，第 0/1 排与第 1/2 排之间）
            const a = V.toDamCoords({ x: -69, z: lz }), b = V.toDamCoords({ x: 35, z: lz });
            root.add(box(b.x - a.x, 0.05, 3, M.earth, (a.x + b.x) / 2, 0.025, a.z));
          }
          // 井台 + 榕树（COMMON_POINT，井边空地 disc 按契约保留半径画）
          const well = V.toDamCoords(V.COMMON_POINT.position);
          root.add(disc(M.earth, V.COMMON_POINT.radius, well.x, well.z, 0.04));
          const wellG = new THREE.Group();
          wellG.position.set(well.x, 0, well.z);
          const wellRing = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.25, 0.75, 10), M.stone);
          wellRing.position.y = 0.37; wellG.add(wellRing);
          const wellTop = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 0.92, 0.1, 10), M.dark);
          wellTop.position.y = 0.72; wellG.add(wellTop);
          wellG.add(box(0.16, 1.9, 0.16, M.wood, -1.15, 0.95, 0));
          wellG.add(box(0.16, 1.9, 0.16, M.wood, 1.15, 0.95, 0));
          wellG.add(box(2.7, 0.16, 0.16, M.woodDark, 0, 1.95, 0));
          wellG.add(box(0.5, 0.55, 0.5, M.wood, 0, 1.35, 0));
          root.add(wellG);
          colliders.push({ x: well.x, z: well.z, r: 1.7 });
          const ban = new THREE.Group();
          ban.position.set(well.x - 4.5, 0, well.z - 4);
          const bTrunk = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.2, 3.4, 7), M.trunk);
          bTrunk.position.y = 1.7; ban.add(bTrunk);
          for (const [cx, cy, cz, r] of [[0, 5.4, 0, 4.6], [-3, 4.6, 1.5, 3.2], [3, 4.8, -1.5, 3.4]]) {
            const c = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), M.leaf2);
            c.position.set(cx, cy, cz); c.scale.y = 0.6; ban.add(c);
          }
          root.add(ban);
          colliders.push({ x: well.x - 4.5, z: well.z - 4, r: 1.4 });
        }
        if (pagoda) {
          // —— 金塔塔基礼拜庭（塔山西南山脚地面：塔门 + 佛龛 + 蒲团；不上塔身、不造假室内）——
          const courtBase = disc(M.stone, 8.2, pagoda.court.x, pagoda.court.z, 0.03);
          courtBase.name = "pagoda:court";
          root.add(courtBase);
          root.add(disc(M.earth, 7.2, pagoda.court.x, pagoda.court.z, 0.045));
          const gate = new THREE.Group();
          gate.position.set(pagoda.court.x + pagoda.dir.x * 6.4, 0, pagoda.court.z + pagoda.dir.z * 6.4);
          gate.rotation.y = Math.atan2(pagoda.dir.x, pagoda.dir.z);
          gate.add(box(0.34, 3.4, 0.34, M.stoneD, -1.9, 1.7, 0));
          gate.add(box(0.34, 3.4, 0.34, M.stoneD, 1.9, 1.7, 0));
          gate.add(box(4.6, 0.4, 0.6, M.roofD, 0, 3.55, 0));
          const finial = new THREE.Mesh(new THREE.SphereGeometry(0.3, 7, 6), M.gold);
          finial.position.y = 4.0; gate.add(finial);
          root.add(gate);
          const shrineG = new THREE.Group();
          shrineG.name = "pagoda:shrine";
          shrineG.position.set(pagoda.shrine.x, 0, pagoda.shrine.z);
          shrineG.rotation.y = Math.atan2(pagoda.dir.x, pagoda.dir.z);
          shrineG.add(box(3.0, 2.9, 0.35, M.stone, 0, 1.45, -0.55));
          shrineG.add(box(0.35, 2.3, 1.1, M.stone, -1.3, 1.15, 0));
          shrineG.add(box(0.35, 2.3, 1.1, M.stone, 1.3, 1.15, 0));
          shrineG.add(box(3.3, 0.3, 1.5, M.roofD, 0, 2.95, 0));
          shrineG.add(box(1.0, 0.5, 0.8, M.stoneD, 0, 0.25, 0.1));
          const buddhaBody = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.44, 0.85, 8), M.gold);
          buddhaBody.position.set(0, 0.92, 0.1); shrineG.add(buddhaBody);
          const buddhaHead = new THREE.Mesh(new THREE.SphereGeometry(0.21, 8, 6), M.gold);
          buddhaHead.position.set(0, 1.52, 0.1); shrineG.add(buddhaHead);
          const buddhaTip = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.3, 6), M.gold);
          buddhaTip.position.set(0, 1.85, 0.1); shrineG.add(buddhaTip);
          for (const s of [-1, 1]) {
            const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.11, 0.14, 7), M.cream);
            bowl.position.set(0.62 * s, 0.57, 0.35); shrineG.add(bowl);
            shrineG.add(box(0.14, 1.5, 0.14, M.wood, 2.1 * s, 0.75, 0.5));
            shrineG.add(box(0.4, 0.4, 0.4, M.gold, 2.1 * s, 1.7, 0.5));
          }
          root.add(shrineG);
          colliders.push({ x: pagoda.shrine.x, z: pagoda.shrine.z, r: 1.6 });
          const perp = { x: -pagoda.dir.z, z: pagoda.dir.x };
          root.add(disc(M.saddle, 0.85, pagoda.spot.x, pagoda.spot.z, 0.06));
          root.add(disc(M.saddle, 0.85, pagoda.spot.x + perp.x * 1.7, pagoda.spot.z + perp.z * 1.7, 0.06));
          for (const rr of [50, 57]) { // 踏石：自村落方向引向塔门
            root.add(disc(M.stone, 1.5, pagoda.center.x + pagoda.dir.x * rr, pagoda.center.z + pagoda.dir.z * rr, 0.04));
          }
        }
        // 古道：西（弄岛）→ 集市 → 东（畹町）
        const roadPts = [[-190, 44], [-110, 26], [-40, 12], [0, 6], [70, 16], [140, 24], [200, 30]];
        placement.roads.push({ points: roadPts.map(([x, z]) => ({ x, z })), width: 10 });
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
          if (Math.hypot(x - 152, z + 118) < (prayerSite ? prayerSite.ring.r + 6 : 34)) continue;
          if (Math.hypot(x + 158, z + 112) < 26) continue;
          if (Math.hypot(x - 128, z - 26) < 24) continue;
          if (Math.hypot(x, z - 6) < 21) continue;
          if (Math.hypot(x + 64, z - 66) < 17 || Math.hypot(x - 66, z + 52) < 17) continue;
          if (Math.hypot(x + 145, z - 58) < 22) continue;
          if (V) {
            const vv = V.toVillageCoords({ x, z });
            if (V.pointInBounds(vv) || V.distancePointToPolygon(vv, V.BOUNDS_POLYGON) < 8) continue;
            if (pagoda && Math.hypot(x - pagoda.court.x, z - pagoda.court.z) < 13) continue;
          }
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
        return { colliders, placement, festivalGroups: { songkran: splash, dengdeng: lamps }, animate(dt, t) {
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
