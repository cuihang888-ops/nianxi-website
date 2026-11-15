import test from "node:test";
import assert from "node:assert/strict";
import Village from "../wechat/vendor/shared-village.cjs";

const [plotA, plotB] = Village.SAMPLE_PLOTS;
const polyA = Village.plotPolygon(plotA);
const polyB = Village.plotPolygon(plotB);
const allPolys = Village.ALL_PLOTS.map(p => Village.plotPolygon(p));

// 现有瑞丽场景 spec 的水面（坝内坐标 → 村落坐标，村落 = 坝内 - (-64,66)）
const SPEC_WATERS_DAM = [
  [-190, 174, 19], [-110, 179, 19], [-20, 181, 19], [80, 179, 19], [170, 174, 19], [232, 167, 17],
  [50, -96, 8], [38, -36, 8], [24, 20, 8], [14, 86, 8],
  [-152, 58, 12.5], [-136, 68, 9], [-163, 74, 8], [-140, 45, 8], [-126, 56, 7],
];
const SPEC_WATERS = SPEC_WATERS_DAM.map(([x, z, r]) => ({ ...Village.toVillageCoords({ x, z }), r }));
// 现有场景 decorate 的丘陵碰撞圈（坝内坐标 → 村落坐标，半径为圆锥 r 的 0.52，姐勒金塔另记 r16）
const HILL_COLLIDERS_DAM = [
  [-220, -80, 60 * 0.52], [-150, -180, 68 * 0.52], [30, -215, 70 * 0.52], [175, -165, 58 * 0.52],
  [228, -30, 55 * 0.52], [232, 95, 52 * 0.52], [-228, 30, 56 * 0.52], [-40, 218, 70 * 0.52],
  [140, 205, 55 * 0.52], [152, -118, 16], [-158, -118, 13],
];
const HILL_COLLIDERS = HILL_COLLIDERS_DAM.map(([x, z, r]) => ({ ...Village.toVillageCoords({ x, z }), r }));

function polygonsOverlap(p, q) {
  // 任一顶点落在对方内部，或任一边相交，即视为重叠（共边不算重叠不在本用例出现）。
  for (const v of p) if (Village.pointInPolygon(v, q)) return true;
  for (const v of q) if (Village.pointInPolygon(v, p)) return true;
  for (let i = 0; i < p.length; i++) {
    for (let j = 0; j < q.length; j++) {
      if (Village.segmentsDistance(p[i], p[(i + 1) % p.length], q[j], q[(j + 1) % q.length]) === 0) return true;
    }
  }
  return false;
}

test("village bounds polygon is about twice the v1 rectangle (22784 vs 10800)", () => {
  const area = Village.polygonArea(Village.BOUNDS_POLYGON);
  assert.equal(area, 22784);
  assert.ok(area >= 21600 && area / 10800 >= 2, `bounds area ${area} is >= 2x v1`);
  // 关键地形/锚点不在可走范围内：弄莫湖、集市、水晶；大厅在北界内（村落北缘保留点）。
  assert.equal(Village.pointInBounds({ x: -62, z: -10 }), false, "lake stays outside bounds");
  assert.equal(Village.pointInBounds(Village.MARKET), false, "market stays outside bounds");
  assert.equal(Village.pointInBounds(Village.CRYSTAL_POS), false, "crystal stays outside bounds");
  assert.equal(Village.pointInBounds({ x: 0, z: 100 }), false, "south river bank stays outside bounds");
  assert.equal(Village.pointInBounds(Village.HALL_POS), true, "hall sits at the north edge inside bounds");
  assert.equal(Village.pointInBounds(Village.REST_POINT), true, "rest point inside bounds");
});

test("bounds polygon keeps clear of every spec water and hill collider", () => {
  for (const w of SPEC_WATERS) {
    assert.ok(Village.distancePointToPolygon(w, Village.BOUNDS_POLYGON) >= w.r - 1e-9 || !Village.pointInBounds(w),
      `bounds do not press spec water at ${JSON.stringify(w)}`);
    // 水面圆心不得落在范围内（圆心在内即范围压水）
    assert.equal(Village.pointInBounds(w), false, `water centre outside bounds ${JSON.stringify(w)}`);
  }
  for (const h of HILL_COLLIDERS) {
    assert.equal(Village.pointInBounds(h), false, `hill collider centre outside bounds ${JSON.stringify(h)}`);
  }
});

test("sample plots are adjacent but do not overlap, with a wider commons between them", () => {
  assert.equal(polygonsOverlap(polyA, polyB), false);
  // A 东界 x=-5，B 西界 x=5：中间是 10 宽村心空地（含基址圆台 r3.2，两侧各余 1.8）。
  const aEast = Math.max(...polyA.map(p => p.x));
  const bWest = Math.min(...polyB.map(p => p.x));
  assert.equal(aEast, -5);
  assert.equal(bWest, 5);
  assert.equal(bWest - aEast, 10);
  assert.ok(Math.abs(aEast) - 3.2 > 1.79 && Math.abs(bWest) - 3.2 > 1.79, "plots keep clear of the rest platform");
});

test("every plot (samples + expansion slots) is 30x32 with area 960", () => {
  assert.equal(Village.ALL_PLOTS.length, 8);
  assert.equal(Village.SAMPLE_PLOTS.length, 2);
  assert.equal(Village.EXPANSION_PLOTS.length, 6);
  for (const poly of allPolys) {
    const area = Village.polygonArea(poly);
    assert.ok(area >= 900 && area <= 1000, `area ${area} within v2 band`);
    assert.equal(area, 960); // 30 x 32
  }
  // 编号/启用顺序：a、b 为样板，c..h 按先近路排、同排西→东、再向南逐排
  assert.deepEqual(Village.EXPANSION.enableOrder, Village.ALL_PLOTS.map(p => p.id));
  assert.deepEqual(Village.ALL_PLOTS.map(p => p.id), [
    "plot_ruili_river_0001_a", "plot_ruili_river_0001_b",
    "plot_ruili_river_0001_c", "plot_ruili_river_0001_d", "plot_ruili_river_0001_e",
    "plot_ruili_river_0001_f", "plot_ruili_river_0001_g", "plot_ruili_river_0001_h",
  ]);
});

test("no two plots overlap, and none presses the commons strip or the well/banyan point", () => {
  for (let i = 0; i < allPolys.length; i++) {
    for (let j = i + 1; j < allPolys.length; j++) {
      assert.equal(polygonsOverlap(allPolys[i], allPolys[j]), false, `plots ${i} and ${j} do not overlap`);
    }
  }
  const c = Village.VILLAGE_COMMONS;
  const commonsPoly = [
    { x: c.minX, z: c.minZ }, { x: c.maxX, z: c.minZ }, { x: c.maxX, z: c.maxZ }, { x: c.minX, z: c.maxZ },
  ];
  for (const poly of allPolys) {
    // 与村心空地只许相邻（共边），不许侵入内部：用缩小 0.01 的空地判重叠近似
    const inner = commonsPoly.map(p => ({ x: p.x + Math.sign(0 - p.x) * 0.01, z: p.z }));
    assert.equal(polygonsOverlap(poly, inner), false, "plot does not intrude into the commons strip");
    // 井/榕树公共点：圆心到地块距离 >= 保留半径 8
    const d = Village.distancePointToPolygon(Village.COMMON_POINT.position, poly);
    assert.ok(d >= Village.COMMON_POINT.radius, `plot keeps well/banyan clear (${d} >= 8)`);
  }
  assert.equal(Village.COMMON_POINT.radius, 8); // v2 由 6 放大为 8
});

test("every plot is clear of the road with the contracted clearance", () => {
  assert.equal(Village.ROAD_CLEARANCE, 8); // 半宽 5 + 余量 3
  for (const poly of allPolys) {
    assert.equal(Village.isClearOfRoad(poly), true);
    const d = Village.distancePolygonToRoad(poly);
    assert.ok(d >= Village.ROAD_CLEARANCE, `distance ${d} >= ${Village.ROAD_CLEARANCE}`);
  }
  // 反例：把 A 向北（-Z）推到路边应判定压路。
  const shifted = polyA.map(p => ({ x: p.x, z: p.z - 24 }));
  assert.equal(Village.isClearOfRoad(shifted), false);
});

test("every plot sits inside the village bounds and presses no water or hill", () => {
  for (const poly of allPolys) {
    for (const v of poly) {
      assert.ok(Village.pointInBounds(v), `plot vertex inside bounds ${JSON.stringify(v)}`);
    }
    for (const w of SPEC_WATERS) {
      const d = Village.distancePointToPolygon(w, poly);
      assert.ok(d >= w.r, `plot keeps spec water clear at ${JSON.stringify(w)} (d=${d.toFixed(2)} >= ${w.r})`);
    }
    for (const h of HILL_COLLIDERS) {
      const d = Village.distancePointToPolygon(h, poly);
      assert.ok(d >= h.r, `plot keeps hill collider clear at ${JSON.stringify(h)} (d=${d.toFixed(2)} >= ${h.r})`);
    }
  }
  for (const p of Village.ROAD_POINTS) {
    assert.ok(Village.pointInBounds(p), "road inside bounds");
  }
});

test("plotAt hits all eight plots and misses lanes, road and public points", () => {
  for (const plot of Village.ALL_PLOTS) {
    assert.equal(Village.plotAt(plot.origin)?.id, plot.id);
  }
  assert.equal(Village.plotAt({ x: 0, z: -2 }), null); // 村心空地
  assert.equal(Village.plotAt({ x: 0, z: 70 }), null); // 村心空地南段
  assert.equal(Village.plotAt(Village.REST_POINT), null); // 出生歇脚处不在地块内
  assert.equal(Village.plotAt(Village.COMMON_POINT.position), null); // 公共点不在地块内
  assert.equal(Village.plotAt({ x: 0, z: -48 }), null); // 路面附近
  assert.equal(Village.plotAt({ x: 200, z: 200 }), null); // 村外
});

test("distanceToRoad is zero on the centreline and grows away from it", () => {
  assert.ok(Village.distanceToRoad({ x: -46, z: -40 }) < 1e-9);
  assert.ok(Village.distanceToRoad({ x: 24, z: -54 }) < 1e-9);
  const d = Village.distanceToRoad(Village.REST_POINT);
  assert.ok(d > 40, `rest point is well clear of the road (${d})`);
});

test("worldToMap and mapToWorld are exact inverses", () => {
  for (const p of [{ x: 0, z: 0 }, { x: -20, z: -2 }, { x: 44, z: -57 }, { x: 64, z: -60 }, { x: -54, z: 70 }, { x: 216, z: -184 }]) {
    const back = Village.mapToWorld(Village.worldToMap(p));
    assert.ok(Math.abs(back.x - p.x) < 1e-9 && Math.abs(back.z - p.z) < 1e-9);
  }
  // 北（-Z）在地图上为负 y（朝上），东（+X）为正 x。
  const north = Village.worldToMap({ x: 0, z: -10 });
  assert.ok(north.y < 0);
  const east = Village.worldToMap({ x: 10, z: 0 });
  assert.ok(east.x > 0);
});

test("village <-> dam coordinate conversion reproduces the existing Ruili anchors", () => {
  // 集市（坝内 0,6）、大厅（坝内 -27,-8）、水晶（坝内 6.5,10.5）均来自现有场景 spec/discovery。
  assert.deepEqual(Village.toDamCoords(Village.MARKET), { x: 0, z: 6 });
  assert.deepEqual(Village.toDamCoords(Village.HALL_POS), { x: -27, z: -8 });
  assert.deepEqual(Village.toDamCoords(Village.CRYSTAL_POS), { x: 6.5, z: 10.5 });
  assert.deepEqual(Village.toVillageCoords({ x: -64, z: 66 }), { x: 0, z: 0 }); // 基址 site0 = 村落原点
  assert.deepEqual(Village.toVillageCoords({ x: -110, z: 26 }), Village.ROAD_POINTS[0]);
  assert.deepEqual(Village.toVillageCoords({ x: -40, z: 12 }), Village.ROAD_POINTS[1]);
});

test("pagoda anchors come from the existing scene and stay reachable and clear", () => {
  const P = Village.PAGODA;
  // 来源锚点：现有场景姐勒金塔在坝内 (152,-118)，碰撞 r16。
  assert.deepEqual(Village.toDamCoords(P.center), { x: 152, z: -118 });
  assert.equal(P.colliderRadius, 16);
  assert.equal(P.hillRadius, 30);
  // 可达范围：金塔不在村落多边形内（坝内地标），但落在坝界椭圆（rx250/rz205）内，沿古道东行可达。
  assert.equal(Village.pointInBounds(P.center), false, "pagoda is a dam landmark outside the village polygon");
  const dam = Village.toDamCoords(P.center);
  assert.ok((dam.x / 250) ** 2 + (dam.z / 205) ** 2 < 1, "pagoda inside the dam walkable ellipse");
  // 入口锚点：在塔基范围内（距中心 <= 碰撞圈 r16）、朝村落一侧（中心以西、以南）
  const entry = P.entry.position;
  const dEntry = Math.hypot(entry.x - P.center.x, entry.z - P.center.z);
  assert.ok(dEntry <= P.colliderRadius, `entry within tower base (${dEntry.toFixed(2)} <= 16)`);
  assert.ok(entry.x < P.center.x && entry.z > P.center.z, "entry faces the village/ancient-road side (southwest)");
  assert.deepEqual({ x: entry.x - P.center.x, z: entry.z - P.center.z }, P.entry.localOffset);
  // 入口不压路、不压地块
  assert.ok(Village.distanceToRoad(entry) >= Village.ROAD_CLEARANCE, "entry clear of the village road");
  assert.equal(Village.plotAt(entry), null, "entry not inside any plot");
  // 祈福位在塔基范围内（局部点距中心 < 塔基台面半宽量级）
  const ps = P.prayerSpot.localOffset;
  assert.ok(Math.hypot(ps.x, ps.z) < 5.5, "prayer spot within the tower base platform");
  assert.ok(P.circumambulationRadius > 5.5 && P.circumambulationRadius < P.colliderRadius,
    "circumambulation ring fits between tower base and collider edge");
});

test("plot layout anchors stay inside the plot bounds (HomeProjection local frame)", () => {
  for (const plot of Village.ALL_PLOTS) {
    const xs = plot.bounds.map(p => p.x), zs = plot.bounds.map(p => p.z);
    const inside = (x, z, pad = 0) => x >= Math.min(...xs) + pad && x <= Math.max(...xs) - pad && z >= Math.min(...zs) + pad && z <= Math.max(...zs) - pad;
    const { house, beds, animalZone, gate } = plot.layout;
    assert.ok(inside(house.position.x, house.position.z), "house inside plot");
    for (const bed of beds) {
      assert.ok(inside(bed.position.x, bed.position.z, Math.max(bed.size.x, bed.size.z) / 2), "bed inside plot");
    }
    assert.ok(inside(animalZone.center.x, animalZone.center.z, animalZone.radius), "animal zone inside plot");
    assert.equal(gate.position.z, Math.min(...zs), "gate sits on the north edge facing the road");
    assert.equal(house.yaw, Math.PI, "house faces north (-Z) toward the road");
  }
});
