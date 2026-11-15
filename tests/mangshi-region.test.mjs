import test from "node:test";
import assert from "node:assert/strict";
import Region from "../wechat/vendor/mangshi-region.cjs";
import Discovery from "../wechat/vendor/preview-discovery.cjs";

const market = Region.landmarkById("mangshi-market");
const MP = Region.MASTER_PLAN;
const PN = Region.PLAYABLE_NOW;

// 现有芒市场景的水面圈（mangshi-scene.cjs：沿 riverPts 每约 20 单位一圈 r10.5 + 孔雀湖三圈），用于村落基址不压水校验。
const SPEC_WATERS = [
  [-38, -205, 10.5], [-33.33, -183.33, 10.5], [-28.67, -161.67, 10.5],
  [-24, -140, 10.5], [-20, -118.33, 10.5], [-16, -96.67, 10.5],
  [-12, -75, 10.5], [-4.33, -53.33, 10.5], [3.33, -31.67, 10.5],
  [11, -10, 10.5], [14.33, 11.67, 10.5], [17.67, 33.33, 10.5],
  [21, 55, 10.5], [14.67, 76.67, 10.5], [8.33, 98.33, 10.5],
  [2, 120, 10.5], [-6, 138.33, 10.5], [-14, 156.67, 10.5],
  [-22, 175, 10.5], [-30, 195, 10.5],
  [112, -48, 13], [112, -18, 14], [112, 12, 13],
];
// 现有场景丘陵碰撞圈（hillDefs 的 r*0.52）+ 总佛寺（r15）+ 大厅（r4.5），基址不压丘陵/本体的粗筛。
const SPEC_HILL_COLLIDERS = [
  [215, -60, 32.24], [225, 40, 30.16], [200, 130, 28.6], [-215, -80, 31.2], [-225, 60, 33.28],
  [-60, -215, 37.44], [80, -220, 34.32], [-40, 225, 36.4], [150, 215, 30.16],
  [-58, -58, 15], [-38, -44, 4.5],
];

test("region bounds: master plan is at full-map scale and contains the playable scene", () => {
  assert.equal(MP.maxX - MP.minX, 1340); // 东西 ≥1200
  assert.equal(MP.maxZ - MP.minZ, 960);  // 南北 ≥900
  // playableNow = 现有场景 landSpec bounds 椭圆 rx265/rz215 的包围盒
  assert.deepEqual({ minX: PN.minX, maxX: PN.maxX, minZ: PN.minZ, maxZ: PN.maxZ }, { minX: -265, maxX: 265, minZ: -215, maxZ: 215 });
  assert.deepEqual(PN.ellipse, { cx: 0, cz: 0, rx: 265, rz: 215 });
  assert.ok(PN.minX >= MP.minX && PN.maxX <= MP.maxX && PN.minZ >= MP.minZ && PN.maxZ <= MP.maxZ);
});

test("all landmarks sit inside the master plan bounds", () => {
  for (const l of Region.LANDMARKS) {
    assert.ok(Region.pointInBounds(l.position, MP), `${l.id} inside masterPlan`);
  }
  assert.equal(Region.landmarksInBounds(MP).length, Region.LANDMARKS.length);
});

test("every river segment and landmark carries a built/planned status", () => {
  for (const river of Region.RIVERS) {
    for (const seg of river.segments) assert.ok(seg.status === "built" || seg.status === "planned", `${river.id} segment status`);
  }
  for (const road of Region.ROADS) {
    for (const seg of road.segments) assert.ok(seg.status === "built" || seg.status === "planned", `${road.id} segment status`);
    for (const exit of road.exits) assert.ok(Number.isFinite(exit.yaw), `${road.id} exit yaw`);
  }
  for (const l of Region.LANDMARKS) assert.ok(l.status === "built" || l.status === "planned", `${l.id} status`);
});

test("key landmarks keep their real-world relative bearings", () => {
  const lake = Region.landmarkById("kongque-lake");
  assert.ok(lake.position.x > market.position.x, "孔雀湖在集市以东");
  const gold = Region.landmarkById("menghuan-gold-pagoda");
  assert.ok(gold.position.x > lake.position.x && gold.position.z < market.position.z, "勐焕大金塔在集市东北、雷牙让山上");
  const silver = Region.landmarkById("menghuan-silver-pagoda");
  assert.ok(silver.position.z > gold.position.z, "勐焕银塔与金塔对峰、在金塔以南");
  const temple = Region.landmarkById("mangshi-temple");
  assert.ok(temple.position.x < market.position.x && temple.position.z < market.position.z, "总佛寺在集市西北");
  const hall = Region.landmarkById("mangshi-hall");
  assert.ok(Math.hypot(hall.position.x - temple.position.x, hall.position.z - temple.position.z) < 30, "大厅在总佛寺前（相邻）");
  const zhefang = Region.landmarkById("zhefang");
  assert.ok(zhefang.position.x < market.position.x && zhefang.position.z > market.position.z, "遮放在集市西南（去瑞丽走廊）");
  const habitat = Region.landmarkById("peacock-habitat");
  assert.ok(habitat.position.x < lake.position.x, "绿孔雀栖息地在孔雀湖西岸");
});

test("cross-consistency with the existing mangshi scene anchors", () => {
  // 全部逐字对现有独立模块 mangshi-scene.cjs 的本体落位
  assert.deepEqual(Region.landmarkById("mangshi-temple").position, { x: -58, z: -58 });
  assert.deepEqual(Region.landmarkById("mangshi-hall").position, { x: -38, z: -44 }); // HALL_POS
  assert.deepEqual(market.position, { x: 4, z: 34 });
  assert.deepEqual(Region.landmarkById("mangshi-crystal").position, { x: -0.5, z: 35.5 }); // CRYSTAL_POS = 集市组位 + 水晶组内偏移
  assert.deepEqual(Region.landmarkById("mangshi-courtyard").position, { x: 4, z: 52 }); // landSpec.spawn
  assert.deepEqual(Region.landmarkById("kongque-lake").position, { x: 112, z: -18 });
  // preview-discovery 的集市标位与本模块一致（同一份锚点）
  assert.deepEqual(Discovery.MARKET_POS.mangshi, market.position);
  // 两个现有基址与场景 buildSite 落位一致
  assert.deepEqual(Region.villageSiteById("mangshi-river-0001").position, { x: -78, z: 66 });
  assert.deepEqual(Region.villageSiteById("mangshi-river-0002").position, { x: 58, z: 96 });
});

test("mangshi river flows from the north-east in to the south-west out", () => {
  const river = Region.RIVERS.find(r => r.id === "mangshi-river");
  const built = river.segments.find(s => s.status === "built");
  assert.equal(built.points[0].z, -205); // 北端入境
  assert.equal(built.points[built.points.length - 1].z, 215); // 南端出坝
  for (let i = 1; i < built.points.length; i++) assert.ok(built.points[i].z > built.points[i - 1].z, "built polyline runs north to south");
  const allPts = river.segments.flatMap(s => s.points);
  const last = allPts[allPts.length - 1];
  assert.ok(last.x < -200 && last.z > 400, "river leaves the master plan toward the south-west (遮放)");
  // 孔雀湖坝下溪末点汇入芒市河水面带（河宽量级内）
  const outflow = Region.RIVERS.find(r => r.id === "kongque-outflow");
  const joinPoint = outflow.segments[0].points[outflow.segments[0].points.length - 1];
  const d = Region.distanceToPolyline(joinPoint, built.points);
  assert.ok(d < 20, `outflow joins the mangshi river (distance ${d.toFixed(1)})`);
});

test("built segments reproduce the existing scene polylines exactly", () => {
  const avenue = Region.ROADS.find(r => r.id === "mangshi-avenue");
  const builtRoad = avenue.segments.find(s => s.status === "built");
  assert.deepEqual(builtRoad.points, [
    { x: -44, z: -42 }, { x: -24, z: -14 }, { x: -6, z: 12 }, { x: 4, z: 34 },
    { x: -2, z: 80 }, { x: -10, z: 130 }, { x: -16, z: 185 }, { x: -20, z: 215 },
  ]); // = mangshi-scene roadPts
  const river = Region.RIVERS.find(r => r.id === "mangshi-river");
  const builtRiver = river.segments.find(s => s.status === "built");
  assert.deepEqual(builtRiver.points, [
    { x: -38, z: -205 }, { x: -24, z: -140 }, { x: -12, z: -75 }, { x: 11, z: -10 },
    { x: 21, z: 55 }, { x: 2, z: 120 }, { x: -22, z: 175 }, { x: -38, z: 215 },
  ]); // = mangshi-scene riverPts
});

test("worldToMap and mapToWorld are exact inverses at region scale, north is up", () => {
  for (const p of [{ x: 4, z: 34 }, { x: -660, z: -480 }, { x: 680, z: 480 }, { x: -58, z: -58 }, { x: 350, z: -160 }]) {
    const back = Region.mapToWorld(Region.worldToMap(p));
    assert.ok(Math.abs(back.x - p.x) < 1e-9 && Math.abs(back.z - p.z) < 1e-9);
  }
  assert.ok(Region.worldToMap({ x: 0, z: -100 }).y < Region.worldToMap({ x: 0, z: 0 }).y, "north (-Z) maps upward");
});

test("village sites: at least 10, capacity fields complete, totals match the capacity account", () => {
  assert.ok(Region.VILLAGE_SITES.length >= 10, `village sites ${Region.VILLAGE_SITES.length} >= 10`);
  for (const site of Region.VILLAGE_SITES) {
    assert.ok(site.status === "built" || site.status === "planned", `${site.id} status`);
    assert.equal(site.plotsInitial, Region.PLOTS_PER_VILLAGE_INITIAL, `${site.id} starts at 8 plots`);
    assert.ok(site.plotsCapacity >= site.plotsInitial, `${site.id} capacity >= initial`);
    assert.ok(site.plotsCapacity >= 32 && site.plotsCapacity <= 48, `${site.id} capacity in the 32-48 master-plan band`);
    assert.ok(Region.pointInBounds(site.position, MP), `${site.id} inside masterPlan`);
  }
  const cap = Region.REGION_CAPACITY;
  assert.equal(cap.villageSites, Region.VILLAGE_SITES.length);
  assert.equal(cap.plotsInitial, Region.VILLAGE_SITES.reduce((s, v) => s + v.plotsInitial, 0));
  assert.equal(cap.plotsCapacity, Region.VILLAGE_SITES.reduce((s, v) => s + v.plotsCapacity, 0));
  assert.ok(cap.plotsCapacity >= 300, `Mangshi capacity ${cap.plotsCapacity} is in the several-hundred range`);
});

test("village sites keep clear of water, hills, the trunk avenue and each other", () => {
  const avenue = Region.ROADS.filter(r => r.id === "mangshi-avenue");
  for (const site of Region.VILLAGE_SITES) {
    const p = site.position;
    // 不压现有场景水面（点到水圆距离 ≥ 半径 + 岸线余量 6）
    for (const [wx, wz, wr] of SPEC_WATERS) {
      assert.ok(Math.hypot(p.x - wx, p.z - wz) >= wr + 6, `${site.id} clear of scene water at ${wx},${wz}`);
    }
    // 不压规划河道：到全部水系折线 ≥ 15（河宽 11.5 + 余量）
    assert.ok(Region.distanceToRiver(p) >= 15, `${site.id} clear of river polylines (${Region.distanceToRiver(p).toFixed(1)})`);
    // 不压丘陵/寺/大厅碰撞圈
    for (const [hx, hz, hr] of SPEC_HILL_COLLIDERS) {
      assert.ok(Math.hypot(p.x - hx, p.z - hz) >= hr + 4, `${site.id} clear of hill collider at ${hx},${hz}`);
    }
    // 不压主干路：到芒市大道 ≥ 契约余量 8
    assert.ok(Region.distanceToRoad(p, avenue) >= 8, `${site.id} clear of Mangshi Avenue (${Region.distanceToRoad(p, avenue).toFixed(1)})`);
    // 不落在任何一条路的线身上
    assert.ok(Region.distanceToRoad(p) >= 3, `${site.id} not on a road centreline (${Region.distanceToRoad(p).toFixed(1)})`);
  }
  // 基址互不重叠：两两间距 ≥ 60
  const sites = Region.VILLAGE_SITES;
  for (let i = 0; i < sites.length; i++) {
    for (let j = i + 1; j < sites.length; j++) {
      const d = Math.hypot(sites[i].position.x - sites[j].position.x, sites[i].position.z - sites[j].position.z);
      assert.ok(d >= 60, `${sites[i].id} vs ${sites[j].id}: ${d.toFixed(1)} >= 60`);
    }
  }
});

test("village landmarks in LANDMARKS reference VILLAGE_SITES positions (single source)", () => {
  for (const l of Region.LANDMARKS) {
    const site = Region.villageSiteById(l.id);
    if (site) assert.deepEqual(l.position, site.position, `${l.id} landmark position = village site position`);
  }
  const referenced = Region.LANDMARKS.filter(l => Region.villageSiteById(l.id));
  assert.ok(referenced.length >= 3, "at least the existing sites + reserved sites appear in LANDMARKS via the sites table");
});

test("distanceToRoad is zero on the avenue and grows away from it", () => {
  assert.ok(Region.distanceToRoad({ x: 4, z: 34 }) < 1e-9); // 集市点正在大道 built 段上
  assert.ok(Region.distanceToRoad({ x: 500, z: 400 }) > 50);
});
