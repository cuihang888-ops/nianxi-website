import test from "node:test";
import assert from "node:assert/strict";
import Village from "../wechat/vendor/shared-village.cjs";

const [plotA, plotB] = Village.SAMPLE_PLOTS;
const polyA = Village.plotPolygon(plotA);
const polyB = Village.plotPolygon(plotB);

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

test("sample plots are adjacent but do not overlap", () => {
  assert.equal(polygonsOverlap(polyA, polyB), false);
  // A 东界 x=-4，B 西界 x=4：中间是 8 宽村心空地（含基址圆台 r3.2，两侧各余 0.8 以上）。
  const aEast = Math.max(...polyA.map(p => p.x));
  const bWest = Math.min(...polyB.map(p => p.x));
  assert.equal(aEast, -4);
  assert.equal(bWest, 4);
  assert.equal(bWest - aEast, 8);
  assert.ok(Math.abs(aEast) > 3.2 && Math.abs(bWest) > 3.2, "plots keep clear of the rest platform");
});

test("sample plot area matches the layout contract (552)", () => {
  for (const poly of [polyA, polyB]) {
    const area = Village.polygonArea(poly);
    assert.ok(area >= 545 && area <= 560, `area ${area} within contract band`);
    assert.equal(area, 552); // 23 x 24
  }
});

test("sample plots are clear of the road with the contracted clearance", () => {
  assert.equal(Village.ROAD_CLEARANCE, 8); // 半宽 5 + 余量 3
  for (const poly of [polyA, polyB]) {
    assert.equal(Village.isClearOfRoad(poly), true);
    const d = Village.distancePolygonToRoad(poly);
    assert.ok(d >= Village.ROAD_CLEARANCE, `distance ${d} >= ${Village.ROAD_CLEARANCE}`);
  }
  // 反例：把 A 向北（-Z）推到路边应判定压路。
  const shifted = polyA.map(p => ({ x: p.x, z: p.z - 24 }));
  assert.equal(Village.isClearOfRoad(shifted), false);
});

test("plotAt hits sample plots and misses lanes, road and public points", () => {
  assert.equal(Village.plotAt({ x: -15.5, z: -4 })?.id, "plot_ruili_river_0001_a");
  assert.equal(Village.plotAt({ x: 15.5, z: -4 })?.id, "plot_ruili_river_0001_b");
  assert.equal(Village.plotAt({ x: 0, z: -4 }), null); // 村心空地
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
  for (const p of [{ x: 0, z: 0 }, { x: -15.5, z: -4 }, { x: 44, z: -57 }, { x: 64, z: -60 }, { x: -46, z: 54 }]) {
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

test("sample plots sit inside the village walkable bounds", () => {
  const { minX, maxX, minZ, maxZ } = Village.BOUNDS;
  for (const poly of [polyA, polyB]) {
    for (const p of poly) {
      assert.ok(p.x >= minX && p.x <= maxX && p.z >= minZ && p.z <= maxZ, `${JSON.stringify(p)} inside bounds`);
    }
  }
  for (const p of Village.ROAD_POINTS) {
    assert.ok(p.x >= minX && p.x <= maxX && p.z >= minZ && p.z <= maxZ, "road inside bounds");
  }
});

test("plot layout anchors stay inside the plot bounds (HomeProjection local frame)", () => {
  for (const plot of Village.SAMPLE_PLOTS) {
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
