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
        // —— 纠偏样板（2026-11-15）：瑞丽总佛寺（坝内落位，村路/集市经古道东行可达）与样板牧场 ——
        temple: { id: "ruili-zongfosi", name: "总佛寺", x: 105, z: -25, area: { x: 105, z: -25, radius: 17 } },
        pasture: { id: "sample-pasture", name: "样板牧场", x: -10, z: 90, area: { x: -10, z: 90, radius: 13 } },
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
      // —— 瑞丽总佛寺（纠偏样板）：外院在坝内 (105,-25)，大殿内景是远置独立小世界 (600,0)，
      // 经引擎 spec.interior 进出（记原位、出寺还原、殿内不落档、骑马先下马由控制器把关）。
      templeSite: {
        center: { x: 105, z: -25 },
        gate: { x: 105, z: -11.5 },
        hallSeat: { x: 105, z: -38 },
        entryAnchor: { x: 105, z: -31, r: 4.5 },
        dismount: { x: 105, z: -6 },
        knots: [
          { id: "ruili-temple-knot-rack-01", x: 96, z: -20 },
          { id: "ruili-temple-knot-rack-02", x: 114, z: -20 },
          { id: "ruili-temple-knot-rack-03", interior: true, x: 610.8, z: 3.4 },
        ],
      },
      interior: {
        rect: { minX: 587, maxX: 613, minZ: -9, maxZ: 9 },
        entry: { x: 600, z: 6.2, yaw: Math.PI },
        gate: { x: 105, z: -6 },
        maxRadius: 11,
        colliders: [
          { x: 600, z: -6.8, r: 3.4 }, { x: 600, z: -4.9, r: 2.0 }, { x: 605.3, z: -3.8, r: 0.95 },
          { x: 591.5, z: -1, r: 1.1 }, { x: 608.5, z: -1, r: 1.1 },
          { x: 591.5, z: 4.5, r: 1.1 }, { x: 608.5, z: 4.5, r: 1.1 },
          { x: 610.8, z: 3.4, r: 1.2 },
        ],
        anchors: {
          worship: { x: 600, z: -2.0 }, pray: { x: 602.7, z: -2.0 }, sit: { x: 597.3, z: -2.0 },
          beads: { x: 595.6, z: -3.2 }, fish: { x: 604.4, z: -3.2 }, exit: { x: 600, z: 6.9 },
        },
      },
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
        // —— 碎花草地（样板口径：清亮草地上撒小花，牧场与寺院周边成片、别处不铺）——
        const flowerMats = [0xffffff, 0xf6c6d8, 0xf9e08a].map(color => new THREE.MeshBasicMaterial({ color }));
        function flowerPatch(cx, cz, r, count) {
          for (let i = 0; i < count; i++) {
            const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * r;
            const f = new THREE.Mesh(new THREE.CircleGeometry(0.13 + rnd() * 0.08, 6), flowerMats[i % 3]);
            f.rotation.x = -Math.PI / 2;
            f.position.set(cx + Math.cos(a) * rr, 0.065, cz + Math.sin(a) * rr);
            root.add(f);
          }
        }
        // —— 夜光灯点（Sansa 配方：深蓝夜底 + 暖黄点光只布在有人心的地方；
        //    白天灯点熄着，入夜由引擎 setNightFactor(夜幕系数) 点亮）——
        const lampGlowMat = new THREE.MeshBasicMaterial({ color: 0xffc37a, transparent: true, opacity: 0 });
        const nightLights = [];
        function stoneLantern(x, z) {
          const g = new THREE.Group();
          g.position.set(x, 0, z);
          g.add(box(0.34, 1.15, 0.34, M.stone, 0, 0.57, 0));
          const glow = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.46, 0.52), lampGlowMat);
          glow.position.y = 1.42; g.add(glow);
          g.add(box(0.72, 0.12, 0.72, M.stoneD, 0, 1.74, 0));
          root.add(g);
          return g;
        }
        function nightLight(x, y, z) {
          const light = new THREE.PointLight(0xffbe78, 0, 30);
          light.position.set(x, y, z);
          root.add(light);
          nightLights.push(light);
        }
        stoneLantern(8.5, -1.5); stoneLantern(-8.5, 13.5); // 集市两角
        nightLight(0, 3.4, 6);
        stoneLantern(-76.2, 40.8); // 村心井台旁
        nightLight(-78, 3.4, 38);
        stoneLantern(-22.5, -3.5); // 大厅前
        if (villagePlots) for (const plot of villagePlots.slice(0, 2)) stoneLantern(plot.x + 4.8, plot.z - plot.d / 2 - 0.6); // 样板 A/B 家门口
        // —— 红结架（固定锚点：只做造型与站位；红结记录/共享归 Codex 接口，本轮不落记录）——
        function knotRack(x, z, rotY, parent) {
          const g = new THREE.Group();
          g.position.set(x, 0, z); g.rotation.y = rotY || 0;
          g.add(box(0.16, 2.3, 0.16, M.wood, -1.5, 1.15, 0));
          g.add(box(0.16, 2.3, 0.16, M.wood, 1.5, 1.15, 0));
          g.add(box(3.4, 0.16, 0.16, M.woodDark, 0, 2.25, 0));
          g.add(box(3.4, 0.12, 0.12, M.woodDark, 0, 1.55, 0));
          for (let i = 0; i < 7; i++) {
            const kx = -1.3 + i * 0.43, drop = (i % 2) * 0.35;
            const knot = new THREE.Mesh(new THREE.SphereGeometry(0.13, 6, 5), M.red);
            knot.position.set(kx, 1.92 - drop, 0); knot.scale.y = 1.35; g.add(knot);
            g.add(box(0.05, 0.3, 0.05, M.red, kx, 2.08 - drop, 0));
          }
          (parent || root).add(g);
          return g;
        }
        // ══ 瑞丽总佛寺 · 外院（坝内 105,-25：古道东行支路可达，村路/集市生活路线上）══
        root.add(disc(M.stone, 13.5, 105, -25, 0.03));
        root.add(disc(M.earth, 11.5, 105, -25, 0.045));
        for (let i = 0; i < 6; i++) root.add(disc(M.stone, 2.6, 105, 19 - i * 5.5, 0.04)); // 支路踏石：古道 → 寺门
        for (const pz of [-16, -21, -26, -31]) root.add(disc(M.stone, 1.6, 105, pz, 0.055)); // 院内中道
        const templeGate = new THREE.Group();
        templeGate.position.set(105, 0, -11.5);
        templeGate.add(box(0.36, 3.6, 0.36, M.stoneD, -2.6, 1.8, 0));
        templeGate.add(box(0.36, 3.6, 0.36, M.stoneD, 2.6, 1.8, 0));
        templeGate.add(box(6.2, 0.42, 0.7, M.roofD, 0, 3.8, 0));
        templeGate.add(box(4.6, 0.34, 0.55, M.roofD, 0, 4.35, 0));
        const gateFinial = new THREE.Mesh(new THREE.SphereGeometry(0.3, 7, 6), M.gold);
        gateFinial.position.y = 4.75; templeGate.add(gateFinial);
        root.add(templeGate);
        colliders.push({ x: 102.4, z: -11.5, r: 0.55 }, { x: 107.6, z: -11.5, r: 0.55 });
        for (const s of [-1, 1]) { // 门侧石灯
          root.add(box(0.3, 1.1, 0.3, M.stone, 105 + 3.6 * s, 0.55, -10.6));
          root.add(box(0.52, 0.52, 0.52, M.gold, 105 + 3.6 * s, 1.35, -10.6));
        }
        // 大殿外观（殿门朝南；入殿走引擎 interior 传送，不从此门穿行）
        const hallOut = new THREE.Group();
        hallOut.add(box(15, 0.8, 9.5, M.stone, 105, 0.4, -38));
        hallOut.add(box(13, 4.2, 7, M.cream, 105, 2.9, -38));
        hallOut.add(box(3.4, 3.0, 0.3, M.dark, 105, 2.3, -34.4));
        for (const px of [99.6, 102.4, 107.6, 110.4]) {
          const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 4.2, 7), M.roofD);
          pillar.position.set(px, 2.9, -34.6); hallOut.add(pillar);
        }
        hallOut.add(box(15.5, 0.5, 9.5, M.roofD, 105, 5.35, -38));
        hallOut.add(box(10.5, 0.45, 6.5, M.roofD, 105, 6.35, -38));
        hallOut.add(box(3.2, 0.4, 0.5, M.gold, 105, 6.85, -38));
        root.add(hallOut);
        colliders.push({ x: 99.5, z: -38, r: 3.2 }, { x: 105, z: -38, r: 3.2 }, { x: 110.5, z: -38, r: 3.2 });
        // 院中香炉 + 两株圆冠菩提
        const censer = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.65, 1.0, 9), M.stoneD);
        censer.position.set(105, 0.5, -27); root.add(censer);
        root.add(box(1.5, 0.18, 1.5, M.gold, 105, 1.05, -27));
        colliders.push({ x: 105, z: -27, r: 1.1 });
        for (const [tx, tz] of [[94, -30], [116, -31]]) {
          const tree = new THREE.Group();
          const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.55, 2.6, 7), M.trunk);
          trunk.position.y = 1.3; tree.add(trunk);
          for (const [cx, cy, cz, r] of [[0, 4.6, 0, 3.4], [-2.2, 3.9, 1, 2.4], [2.2, 4.0, -1, 2.5]]) {
            const c = new THREE.Mesh(new THREE.SphereGeometry(r, 9, 7), M.leaf2);
            c.position.set(cx, cy, cz); c.scale.y = 0.72; tree.add(c);
          }
          tree.position.set(tx, 0, tz);
          root.add(tree);
          colliders.push({ x: tx, z: tz, r: 0.9 });
        }
        knotRack(96, -20, 0.5);
        knotRack(114, -20, -0.5);
        colliders.push({ x: 96, z: -20, r: 1.2 }, { x: 114, z: -20, r: 1.2 });
        stoneLantern(102.6, 8); stoneLantern(107.4, -4); // 寺前支路两侧
        stoneLantern(102.5, -21); stoneLantern(107.5, -21); // 庭院中道两侧
        nightLight(105, 3.6, -22); // 庭院暖光
        flowerPatch(105, -25, 12.5, 26);
        // ══ 总佛寺 · 大殿内景（远置独立小世界 (600,0)，与 17e23f0 内景同构图、同锚点口径）══
        const hallIn = new THREE.Group();
        root.add(hallIn);
        const pillarMat = new THREE.MeshLambertMaterial({ color: 0x7a3b2e });
        hallIn.add(box(27, 0.2, 19, M.wood, 600, -0.1, 0));
        hallIn.add(box(27, 6.4, 0.6, M.cream, 600, 3.2, -9.2));
        hallIn.add(box(0.6, 6.4, 19, M.cream, 586.8, 3.2, 0));
        hallIn.add(box(0.6, 6.4, 19, M.cream, 613.2, 3.2, 0));
        hallIn.add(box(9.5, 6.4, 0.6, M.cream, 592, 3.2, 9.2));
        hallIn.add(box(9.5, 6.4, 0.6, M.cream, 608, 3.2, 9.2));
        hallIn.add(box(7, 2.4, 0.6, M.cream, 600, 5.2, 9.2));
        for (const bz of [-6, 0, 6]) hallIn.add(box(26, 0.4, 0.5, M.woodDark, 600, 6.3, bz));
        for (const [px, pz] of [[591.5, -1], [608.5, -1], [591.5, 4.5], [608.5, 4.5]]) {
          const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.62, 6.2, 8), pillarMat);
          pillar.position.set(px, 3.1, pz); hallIn.add(pillar);
        }
        // 佛台 + 金身 + 背光
        hallIn.add(box(9, 1.0, 4.6, M.stone, 600, 0.5, -6.8));
        const halo = new THREE.Mesh(new THREE.CircleGeometry(2.5, 20), M.gold);
        halo.position.set(600, 3.6, -8.75); hallIn.add(halo);
        const buddhaBase = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.3, 0.5, 10), M.gold);
        buddhaBase.position.set(600, 1.25, -6.8); hallIn.add(buddhaBase);
        const buddhaBodyIn = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.15, 1.9, 10), M.gold);
        buddhaBodyIn.position.set(600, 2.45, -6.8); hallIn.add(buddhaBodyIn);
        const buddhaHeadIn = new THREE.Mesh(new THREE.SphereGeometry(0.62, 10, 8), M.gold);
        buddhaHeadIn.position.set(600, 3.85, -6.8); hallIn.add(buddhaHeadIn);
        const buddhaTipIn = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.65, 8), M.gold);
        buddhaTipIn.position.set(600, 4.65, -6.8); hallIn.add(buddhaTipIn);
        // 供桌 + 烛火 + 香炉
        hallIn.add(box(5.4, 1.05, 1.4, M.woodDark, 600, 0.52, -4.7));
        const flames = [];
        for (const s of [-1, 1]) {
          hallIn.add(box(0.14, 0.65, 0.14, M.cream, 600 + 2.2 * s, 1.35, -4.7));
          const flame = new THREE.Mesh(new THREE.SphereGeometry(0.13, 7, 6), M.gold);
          flame.position.set(600 + 2.2 * s, 1.85, -4.7); flame.scale.y = 1.5;
          hallIn.add(flame); flames.push(flame);
        }
        const incense = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.3, 0.35, 9), M.stoneD);
        incense.position.set(600, 1.2, -4.7); hallIn.add(incense);
        // 蒲团（五动作站位与 spec.interior.anchors 一一对应）
        for (const [ax, az] of [[600, -2.0], [602.7, -2.0], [597.3, -2.0], [595.6, -3.2]]) hallIn.add(disc(M.saddle, 0.95, ax, az, 0.06));
        hallIn.add(disc(M.saddle, 0.95, 600, 6.9, 0.06)); // 出殿站位
        // 静坐蒲团边光圈：随呼吸同节律微亮/微暗（引擎 setBreathGlow 驱动，节律 t*1.6 与胸廓起伏同周期）
        const sitGlow = new THREE.Mesh(new THREE.RingGeometry(1.05, 1.52, 24),
          new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
        sitGlow.rotation.x = -Math.PI / 2;
        sitGlow.position.set(597.3, 0.07, -2.0);
        hallIn.add(sitGlow);
        // 木鱼台 + 木鱼 + 敲击槌（templeFx 驱动槌的敲击摆动）
        hallIn.add(box(1.5, 0.75, 1.1, M.wood, 605.3, 0.37, -3.8));
        const fishBody = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), M.woodDark);
        fishBody.position.set(605.3, 1.05, -3.8); fishBody.scale.set(1, 0.78, 0.92); hallIn.add(fishBody);
        hallIn.add(box(0.5, 0.07, 0.12, M.dark, 605.3, 1.42, -3.8));
        const fishLamp = new THREE.Mesh(new THREE.SphereGeometry(0.14, 7, 6), M.gold);
        fishLamp.position.set(604.6, 0.95, -4.35); hallIn.add(fishLamp);
        const striker = new THREE.Group();
        striker.position.set(604.55, 1.3, -3.25);
        const mallet = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.85, 6), M.wood);
        mallet.position.y = -0.32; striker.add(mallet);
        const malletTip = new THREE.Mesh(new THREE.SphereGeometry(0.1, 7, 6), M.woodDark);
        malletTip.position.y = -0.72; striker.add(malletTip);
        striker.rotation.x = -0.5;
        hallIn.add(striker);
        knotRack(610.8, 3.4, -Math.PI / 2, hallIn);
        const hallLight = new THREE.PointLight(0xffc37a, 1.05, 30);
        hallLight.position.set(600, 5.2, -1);
        hallIn.add(hallLight);
        const lampOrb = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 7), M.gold);
        lampOrb.position.set(600, 4.6, 2); hallIn.add(lampOrb);
        // ══ 样板牧场（村东贴 B/E/H 列，围栏 + 草棚 + 食槽 + 南侧小溪汀步）══
        root.add(disc(M.meadow2, 13.5, -10, 90, 0.02));
        flowerPatch(-10, 90, 12, 44);
        const fenceMat = M.wood;
        function fenceRun(x0, z0, x1, z1) {
          const len = Math.hypot(x1 - x0, z1 - z0), steps = Math.max(1, Math.round(len / 3));
          for (let i = 0; i <= steps; i++) root.add(box(0.14, 1.05, 0.14, fenceMat, x0 + (x1 - x0) * i / steps, 0.52, z0 + (z1 - z0) * i / steps));
          const midX = (x0 + x1) / 2, midZ = (z0 + z1) / 2, ang = Math.atan2(x1 - x0, z1 - z0);
          for (const ry of [0.55, 0.92]) {
            const rail = box(Math.abs(x1 - x0) > Math.abs(z1 - z0) ? len : 0.09, 0.09, Math.abs(x1 - x0) > Math.abs(z1 - z0) ? 0.09 : len, fenceMat, midX, ry, midZ);
            rail.rotation.y = 0; root.add(rail);
          }
        }
        fenceRun(-19, 81, -1, 81);
        fenceRun(-19, 99, -1, 99);
        fenceRun(-1, 81, -1, 99);
        fenceRun(-19, 81, -19, 87); // 西侧留 6 宽缺口作牧场门（朝村落）
        fenceRun(-19, 93, -19, 99);
        // —— 逻辑修复轮：牧场围栏登记为实体（与视觉同界，西侧门洞留空），玩家不再穿栏；
        // 草棚/食槽/草料垛登记圆碰撞（玩家）；样例羊另有自己的避障表（可钻草棚下躲雨，不穿柱/槽/垛）。——
        const pastureSolidRects = [
          { x: -10, z: 81, cos: 1, sin: 0, hx: 9.1, hz: 0.14, y0: 0, y1: 1.05 },
          { x: -10, z: 99, cos: 1, sin: 0, hx: 9.1, hz: 0.14, y0: 0, y1: 1.05 },
          { x: -1, z: 90, cos: 1, sin: 0, hx: 0.14, hz: 9.1, y0: 0, y1: 1.05 },
          { x: -19, z: 84, cos: 1, sin: 0, hx: 0.14, hz: 3.1, y0: 0, y1: 1.05 },
          { x: -19, z: 96, cos: 1, sin: 0, hx: 0.14, hz: 3.1, y0: 0, y1: 1.05 },
        ];
        colliders.push({ x: -16.5, z: 84, r: 2.1 }, { x: -16, z: 95, r: 1.25 }, { x: -5, z: 84, r: 1.0 });
        const sheepObstacles = [
          { x: -18.1, z: 82.7, r: 0.3 }, { x: -14.9, z: 82.7, r: 0.3 }, { x: -18.1, z: 85.3, r: 0.3 }, { x: -14.9, z: 85.3, r: 0.3 },
          { x: -16, z: 95, r: 1.15 }, { x: -5, z: 84, r: 0.95 },
        ];
        const shelter = new THREE.Group();
        shelter.position.set(-16.5, 0, 84);
        for (const [px, pz] of [[-1.6, -1.3], [1.6, -1.3], [-1.6, 1.3], [1.6, 1.3]]) shelter.add(box(0.16, 2.0, 0.16, M.wood, px, 1.0, pz));
        shelter.add(box(4.2, 0.16, 3.6, M.roofD, 0, 2.15, 0));
        root.add(shelter);
        root.add(box(2.2, 0.5, 0.7, M.woodDark, -16, 0.25, 95)); // 食槽
        root.add(box(1.4, 0.6, 1.0, M.cream, -5, 0.3, 84)); // 草料垛
        for (const [bx, bz] of [[-22, 103], [-14, 104], [-6, 103.5], [2, 101], [8, 97]]) { // 南侧小溪（浅滩，可踏石过）
          const w = new THREE.Mesh(new THREE.CircleGeometry(2.8, 10), M.water.clone());
          w.rotation.x = -Math.PI / 2; w.position.set(bx, 0.05, bz);
          root.add(w); waters.push(w);
        }
        root.add(disc(M.stone, 0.9, -10, 102.5, 0.07));
        root.add(disc(M.stone, 0.9, 0, 100, 0.07));
        // ══ 样例羊（开发样例预览：独立存在于样板牧场，不接 home.animals/产出时钟；
        //    animalId 与外观字段冻结后由 Codex 接口接持久化——见 docs/MUSE_REALIGNMENT_SAMPLE_20261115.md）══
        const woolPalette = { white: 0xf7f2e4, pink: 0xf3cfd8, gray: 0xb9bcc0, brown: 0x8a6a4e };
        const woolMat = new THREE.MeshLambertMaterial({ color: woolPalette.pink });
        const darkMat = new THREE.MeshLambertMaterial({ color: 0x4a4038 });
        function sPuff(r, x, y, z, mat) {
          const m = new THREE.Mesh(new THREE.SphereGeometry(r, 9, 7), mat || woolMat);
          m.position.set(x, y, z);
          return m;
        }
        const sheep = new THREE.Group();
        const sheepBody = new THREE.Group();
        sheep.add(sheepBody);
        const sheepWool = [[0, 0.84, 0, 0.6], [0.36, 0.94, 0.26, 0.42], [-0.37, 0.92, -0.18, 0.44], [0.08, 1.06, -0.36, 0.4],
          [-0.16, 1.04, 0.36, 0.38], [0.44, 0.78, -0.36, 0.35], [-0.45, 0.76, 0.3, 0.35], [0, 0.66, 0.5, 0.34], [0.02, 0.68, -0.56, 0.36]];
        for (const [x, y, z, r] of sheepWool) sheepBody.add(sPuff(r, x, y, z));
        const sheepHead = new THREE.Group();
        sheepHead.position.set(0, 0.98, 0.62);
        const sheepFace = sPuff(0.27, 0, 0, 0.1, darkMat); sheepFace.scale.set(0.92, 1, 1.15); sheepHead.add(sheepFace);
        sheepHead.add(sPuff(0.19, 0, 0.24, -0.02));
        for (const s of [-1, 1]) { const ear = sPuff(0.1, 0.26 * s, 0.05, 0.02, darkMat); ear.scale.set(1.3, 0.55, 0.8); sheepHead.add(ear); }
        sheepBody.add(sheepHead);
        const sheepTail = sPuff(0.2, 0, 0.98, -0.78);
        sheepBody.add(sheepTail);
        const sheepLegs = [];
        for (const [lx, lz] of [[-0.3, 0.38], [0.3, 0.38], [-0.3, -0.42], [0.3, -0.42]]) {
          const leg = box(0.13, 0.55, 0.13, darkMat, lx, 0.27, lz);
          sheep.add(leg); sheepLegs.push(leg);
        }
        const hatGroup = new THREE.Group();
        {
          const strawMat = new THREE.MeshLambertMaterial({ color: 0xd9b96a });
          const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.05, 10), strawMat);
          hatGroup.add(brim);
          const top = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 0.22, 9), strawMat);
          top.position.y = 0.12; hatGroup.add(top);
          hatGroup.position.set(0, 0.3, -0.02);
          hatGroup.rotation.x = 0.14;
          hatGroup.visible = false;
          sheepHead.add(hatGroup);
        }
        const bellGroup = new THREE.Group();
        {
          bellGroup.add(box(0.2, 0.09, 0.06, M.red, 0, 0.78, 0.72));
          const bell = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 7), M.gold);
          bell.position.set(0, 0.62, 0.78); bellGroup.add(bell);
          sheepBody.add(bellGroup);
        }
        const sheepShadow = new THREE.Mesh(new THREE.CircleGeometry(0.95, 14),
          new THREE.MeshBasicMaterial({ color: 0x22301e, transparent: true, opacity: 0.15, depthWrite: false }));
        sheepShadow.rotation.x = -Math.PI / 2;
        root.add(sheepShadow);
        sheep.scale.setScalar(1.3);
        sheep.position.set(-12, 0, 88);
        sheep.rotation.y = 0.8;
        root.add(sheep);
        // 名字牌（画布纹理；无 Canvas 环境时跳过，不影响玩法）
        let nameSprite = null, nameCanvas = null, nameCtx = null, nameTexture = null;
        function drawSheepName() {
          if (!nameCtx) return;
          const c = nameCanvas, g = nameCtx;
          g.clearRect(0, 0, c.width, c.height);
          g.fillStyle = "rgba(246,241,224,0.92)";
          if (g.roundRect) { g.beginPath(); g.roundRect(6, 6, c.width - 12, c.height - 12, 26); g.fill(); }
          else g.fillRect(6, 6, c.width - 12, c.height - 12);
          g.fillStyle = "#4c4436";
          g.font = "bold 54px sans-serif";
          g.textAlign = "center";
          g.fillText(sheepState.name, c.width / 2, 66);
          g.fillStyle = "#8a7c5c";
          g.font = "27px sans-serif";
          g.fillText("开发样例 · 样板牧场", c.width / 2, 106);
          if (nameTexture) nameTexture.needsUpdate = true;
        }
        try {
          if (typeof document !== "undefined" && document.createElement && THREE.CanvasTexture && THREE.Sprite) {
            nameCanvas = document.createElement("canvas");
            nameCanvas.width = 512; nameCanvas.height = 128;
            nameCtx = nameCanvas.getContext("2d");
            nameTexture = new THREE.CanvasTexture(nameCanvas);
            nameSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: nameTexture, transparent: true, depthWrite: false }));
            nameSprite.scale.set(3.6, 0.9, 1);
            nameSprite.position.y = 2.35;
            sheep.add(nameSprite);
          }
        } catch (error) { nameSprite = null; }
        const sheepState = { name: "小满", color: "pink", accessory: "bell", mode: "graze", timer: 2.5, tx: -12, tz: 88, headTarget: 0.72 };
        drawSheepName();
        let sheepPlayer = null, fishT = 0, beadT = 0, breathGlow = 0;
        function updateSampleSheep(dt, t) {
          const dx = sheepPlayer ? sheepPlayer.x - sheep.position.x : 99;
          const dz = sheepPlayer ? sheepPlayer.z - sheep.position.z : 99;
          const pd = Math.hypot(dx, dz);
          let moving = false;
          if (pd < 2.4) {
            // 亲近反馈：凑在身边、抬头看人、轻轻蹭头、尾巴摇
            sheepState.mode = "nuzzle";
            sheepState.headTarget = 0.34 + Math.sin(t * 2.4) * 0.13;
            const want = Math.atan2(dx, dz);
            sheep.rotation.y += (((want - sheep.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * Math.min(1, dt * 5);
            sheepTail.rotation.y = Math.sin(t * 9) * 0.5;
          } else if (pd < 6.5) {
            sheepState.mode = "approach";
            sheepState.headTarget = 0.04;
            const want = Math.atan2(dx, dz);
            sheep.rotation.y += (((want - sheep.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * Math.min(1, dt * 4);
            sheep.position.x += Math.sin(sheep.rotation.y) * 1.6 * dt;
            sheep.position.z += Math.cos(sheep.rotation.y) * 1.6 * dt;
            moving = true;
            sheepTail.rotation.y = Math.sin(t * 6) * 0.3;
          } else {
            sheepState.timer -= dt;
            if (sheepState.timer <= 0) {
              if (sheepState.mode === "graze") { sheepState.mode = "look"; sheepState.timer = 1.6 + rnd() * 1.4; }
              else if (sheepState.mode === "look") {
                sheepState.mode = "walk";
                sheepState.tx = -17 + rnd() * 14;
                sheepState.tz = 83 + rnd() * 14;
                sheepState.timer = 6;
              } else { sheepState.mode = "graze"; sheepState.timer = 2.6 + rnd() * 2.4; }
            }
            if (sheepState.mode === "walk") {
              const wx = sheepState.tx - sheep.position.x, wz = sheepState.tz - sheep.position.z;
              const wd = Math.hypot(wx, wz);
              if (wd < 0.5) { sheepState.mode = "graze"; sheepState.timer = 2.6 + rnd() * 2.4; }
              else {
                const want = Math.atan2(wx, wz);
                sheep.rotation.y += (((want - sheep.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * Math.min(1, dt * 3.5);
                sheep.position.x += Math.sin(sheep.rotation.y) * 1.25 * dt;
                sheep.position.z += Math.cos(sheep.rotation.y) * 1.25 * dt;
                moving = true;
              }
            }
            sheepState.headTarget = sheepState.mode === "graze" ? 0.72 : 0.05;
            sheepTail.rotation.y = Math.sin(t * 2.2) * 0.15;
          }
          sheep.position.x = Math.max(-17.5, Math.min(-2.5, sheep.position.x));
          sheep.position.z = Math.max(82.5, Math.min(97.5, sheep.position.z));
          // 逻辑修复轮：样例羊避障——草棚柱/食槽/草料垛都是实体，推出后重新钳回牧场围栏内
          for (const o of sheepObstacles) {
            const odx = sheep.position.x - o.x, odz = sheep.position.z - o.z;
            const orr = o.r + 0.85, od = Math.hypot(odx, odz);
            if (od < orr && od > 1e-6) { sheep.position.x = o.x + odx / od * orr; sheep.position.z = o.z + odz / od * orr; }
          }
          sheep.position.x = Math.max(-17.5, Math.min(-2.5, sheep.position.x));
          sheep.position.z = Math.max(82.5, Math.min(97.5, sheep.position.z));
          sheepHead.rotation.x += (sheepState.headTarget - sheepHead.rotation.x) * Math.min(1, dt * 4);
          sheepBody.scale.y = 1 + Math.sin(t * 1.8) * 0.015;
          sheepBody.position.y = moving ? Math.abs(Math.sin(t * 7)) * 0.04 : 0;
          sheepLegs.forEach((leg, i) => { leg.rotation.x = moving ? Math.sin(t * 7 + (i % 2) * Math.PI) * 0.4 : 0; });
          sheepShadow.position.set(sheep.position.x, 0.06, sheep.position.z);
        }
        let autoStrikeStop = null;
        const templeFx = {
          // 木鱼敲击触发点：每敲一次调用一次，连敲即重触发（槌摆从头起，声音不糊）；
          // 不绑点击——控制器、自动节律、共在同步都可调。微信音频接通归 Codex
          // （素材 wechat/audio/wooden-fish.wav，短促快衰减、为连敲而备）。
          strikeFish() { fishT = 0.0001; },
          // 念珠轻敲触发点：每过一颗调用一次；声音归 Codex（与木鱼同族、更轻更短，规格见样板文档）。
          rollBead() { if (beadT <= 0) beadT = 0.0001; },
          // 自动节律（Sansa 木鱼自动档口径）：以固定间隔自动敲击，返回停止函数，随时可停；
          // onStrike 在每敲之后回调（Codex 可在此排音频）。无计时器环境返回 null。
          startAutoStrike(intervalMs = 900, onStrike) {
            if (autoStrikeStop) return autoStrikeStop;
            if (typeof setInterval !== "function" || typeof clearInterval !== "function") return null;
            const timer = setInterval(() => {
              templeFx.strikeFish();
              if (typeof onStrike === "function") onStrike();
            }, Math.max(120, Number.isFinite(intervalMs) ? intervalMs : 900));
            autoStrikeStop = () => { clearInterval(timer); autoStrikeStop = null; };
            return autoStrikeStop;
          },
          stopAutoStrike() { if (autoStrikeStop) autoStrikeStop(); },
          isAutoStriking: () => !!autoStrikeStop,
        };
        const sampleApi = {
          setPlayerPosition(x, z) { sheepPlayer = { x, z }; },
          templeFx,
          // 夜光配方入口（引擎随天空逐次喂入夜幕系数 0..1）：灯晕亮起、三处暖光点亮，仅样板段。
          setNightFactor(value) {
            const night = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
            lampGlowMat.opacity = night * 0.95;
            for (const light of nightLights) light.intensity = night * 1.15;
          },
          // 静坐呼吸光（引擎逐帧喂入 0..1，与呼吸同节律）：长明灯与蒲团光圈随吸气微亮、呼气微暗。
          setBreathGlow(value) { breathGlow = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0; },
          sampleSheep: {
            setName(name) { sheepState.name = String(name || "小满").slice(0, 6) || "小满"; drawSheepName(); },
            setColor(id) { if (woolPalette[id]) { sheepState.color = id; woolMat.color.setHex(woolPalette[id]); } },
            setAccessory(id) {
              sheepState.accessory = id;
              hatGroup.visible = id === "hat";
              bellGroup.visible = id === "bell";
            },
            getState: () => ({ ...sheepState, x: sheep.position.x, z: sheep.position.z }),
          },
        };
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
          if (Math.hypot(x - 105, z + 25) < 27) continue; // 总佛寺庭院留空
          if (Math.hypot(x + 10, z - 90) < 19) continue; // 样板牧场留空
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
        return { colliders, placement, solidRects: pastureSolidRects, festivalGroups: { songkran: splash, dengdeng: lamps }, api: sampleApi, animate(dt, t) {
          updateSampleSheep(dt, t);
          if (fishT > 0) {
            fishT += dt;
            const k = Math.min(fishT / 0.32, 1);
            striker.rotation.x = -0.5 - Math.sin(k * Math.PI) * 0.62;
            fishLamp.scale.setScalar(1 + 0.3 * Math.sin(Math.min(fishT / 0.5, 1) * Math.PI));
            if (fishT > 0.6) { fishT = 0; striker.rotation.x = -0.5; fishLamp.scale.setScalar(1); }
          }
          if (beadT > 0) {
            beadT += dt;
            if (fishT <= 0) fishLamp.scale.setScalar(1 + 0.12 * Math.sin(Math.min(beadT / 0.35, 1) * Math.PI));
            if (beadT > 0.35) { beadT = 0; if (fishT <= 0) fishLamp.scale.setScalar(1); }
          }
          // 呼吸光：长明灯亮度/灯晕大小/蒲团光圈透明度同节律起伏（breathGlow=0 时回到常态）
          hallLight.intensity = 1.05 + breathGlow * 0.55;
          lampOrb.scale.setScalar(1 + breathGlow * 0.3);
          sitGlow.material.opacity = breathGlow * 0.45;
          flames.forEach((flame, i) => { flame.scale.y = 1.5 + Math.sin(t * 9 + i * 2.1) * 0.22; });
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
