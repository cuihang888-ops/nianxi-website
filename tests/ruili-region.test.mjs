import test from "node:test";
import assert from "node:assert/strict";
import Region from "../wechat/vendor/ruili-region.cjs";
import Village from "../wechat/vendor/shared-village.cjs";

const market = Region.landmarkById("ruili-market");
const MP = Region.MASTER_PLAN;
const PN = Region.PLAYABLE_NOW;

// 现有瑞丽场景 spec 的水面圆（ruili-scene.cjs spec.waters 逐字抄录），用于村落基址不压水校验。
const SPEC_WATERS = [
  [-190, 174, 19], [-110, 179, 19], [-20, 181, 19], [80, 179, 19], [170, 174, 19], [232, 167, 17],
  [50, -96, 8], [38, -36, 8], [24, 20, 8], [14, 86, 8],
  [-152, 58, 12.5], [-136, 68, 9], [-163, 74, 8], [-140, 45, 8], [-126, 56, 7],
];
// 现有场景丘陵碰撞圈（decorate hillDefs 的 r*0.52，抄录），基址不压丘陵本体的粗筛。
const SPEC_HILL_COLLIDERS = [
  [-220, -80, 31.2], [-150, -180, 35.4], [30, -215, 36.4], [175, -165, 30.2],
  [228, -30, 28.6], [232, 95, 27], [-228, 30, 29.1], [-40, 218, 36.4], [140, 205, 28.6],
  [152, -118, 16], [-158, -118, 13], [128, 26, 4],
];

test("region bounds: master plan is at full-map scale and contains the playable scene", () => {
  assert.equal(MP.maxX - MP.minX, 1320); // 东西 ≥1200
  assert.equal(MP.maxZ - MP.minZ, 950);  // 南北 ≥900
  // playableNow = 现有场景 spec bounds 椭圆 rx250/rz205 的包围盒
  assert.deepEqual({ minX: PN.minX, maxX: PN.maxX, minZ: PN.minZ, maxZ: PN.maxZ }, { minX: -250, maxX: 250, minZ: -205, maxZ: 205 });
  assert.deepEqual(PN.ellipse, { cx: 0, cz: 0, rx: 250, rz: 205 });
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
  const jieGao = Region.landmarkById("jie-gao");
  const river = Region.RIVERS.find(r => r.id === "ruili-river");
  // 姐告在瑞丽江南岸：其 z 必须在瑞丽江折线（同 x 处）以南（z 更大）
  assert.ok(jieGao.position.z > 220, "jie-gao is south of the river line");
  assert.ok(Region.distanceToPolyline(jieGao.position, river.segments[1].points) > 40, "jie-gao is across the river, not on its north bank");
  const lake = Region.landmarkById("nongmo-lake");
  assert.ok(lake.position.x < market.position.x, "弄莫湖在集市以西");
  const moli = Region.landmarkById("moli-falls");
  assert.ok(moli.position.x > market.position.x, "莫里瀑布在集市以东");
  const pagoda = Region.landmarkById("ruili-jiele-pagoda");
  assert.ok(pagoda.position.x > market.position.x && pagoda.position.z < market.position.z, "姐勒金塔在集市东北");
  const nongdao = Region.landmarkById("nongdao");
  assert.ok(nongdao.position.x < lake.position.x, "弄岛在弄莫湖以西（西端出口）");
  const wanding = Region.landmarkById("wanding-bridge");
  assert.ok(wanding.position.x > moli.position.x, "畹町桥在莫里以东（东出口）");
});

test("cross-consistency with shared-village: market, pagoda and village origin conversions agree", () => {
  // 集市：村落契约 MARKET（村落坐标）换算回坝内 = 全域地标位置
  assert.deepEqual(Region.fromVillageCoords(Village.MARKET), market.position);
  // 金塔：全域地标位置由村落契约 PAGODA.center 换算而来，应等于现有场景坝内 (152,-118)
  assert.deepEqual(Region.landmarkById("ruili-jiele-pagoda").position, { x: 152, z: -118 });
  assert.deepEqual(Region.toVillageCoords({ x: 152, z: -118 }), Village.PAGODA.center);
  // 村落原点：全域 village 地标 = shared-village 的 ORIGIN_IN_DAM
  const villageLm = Region.landmarkById(Village.VILLAGE_ID);
  assert.deepEqual(villageLm.position, Village.ORIGIN_IN_DAM);
  assert.deepEqual(Region.toVillageCoords(villageLm.position), { x: 0, z: 0 });
  // 大厅/水晶同样对齐
  assert.deepEqual(Region.fromVillageCoords(Village.HALL_POS), Region.landmarkById("ruili-hall").position);
  assert.deepEqual(Region.fromVillageCoords(Village.CRYSTAL_POS), Region.landmarkById("ruili-crystal").position);
});

test("ruili river runs east to west and the nanwan river joins it", () => {
  const river = Region.RIVERS.find(r => r.id === "ruili-river");
  const allPts = river.segments.flatMap(s => s.points);
  assert.ok(allPts[0].x > 600, "river polyline starts in the east");
  assert.ok(allPts[allPts.length - 1].x < -600, "river polyline ends in the west (flows east to west)");
  const nanwan = Region.RIVERS.find(r => r.id === "nanwan-river");
  const built = nanwan.segments.find(s => s.status === "built");
  const joinPoint = built.points[built.points.length - 1];
  assert.deepEqual(joinPoint, { x: 4, z: 168 }); // 现有场景南宛河 riverRun 末点
  // 汇入点落在瑞丽江 built 段水面带内（河宽 14 + 溪宽 6.5 的量级）
  const d = Region.distanceToPolyline(joinPoint, river.segments.find(s => s.status === "built").points);
  assert.ok(d < 20, `nanwan joins the ruili river (distance ${d.toFixed(1)})`);
});

test("built segments reproduce the existing scene polylines exactly", () => {
  const avenue = Region.ROADS.find(r => r.id === "ruili-avenue");
  const builtRoad = avenue.segments.find(s => s.status === "built");
  assert.deepEqual(builtRoad.points, [
    { x: -190, z: 44 }, { x: -110, z: 26 }, { x: -40, z: 12 }, { x: 0, z: 6 },
    { x: 70, z: 16 }, { x: 140, z: 24 }, { x: 200, z: 30 },
  ]); // = ruili-scene decorate roadPts
  const river = Region.RIVERS.find(r => r.id === "ruili-river");
  const builtRiver = river.segments.find(s => s.status === "built");
  assert.deepEqual(builtRiver.points, [
    { x: 248, z: 164 }, { x: 160, z: 175 }, { x: 50, z: 181 }, { x: -60, z: 182 },
    { x: -160, z: 176 }, { x: -245, z: 168 },
  ]); // = ruili-scene riverRun 点列（按流向反序）
});

test("worldToMap and mapToWorld are exact inverses at region scale, north is up", () => {
  for (const p of [{ x: 0, z: 6 }, { x: -640, z: -480 }, { x: 680, z: 470 }, { x: 152, z: -118 }, { x: 16, z: 246 }]) {
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
  assert.ok(cap.plotsCapacity >= 300, `Ruili capacity ${cap.plotsCapacity} is in the several-hundred range`);
});

test("village sites keep clear of water, hills, the trunk avenue and each other", () => {
  const avenue = Region.ROADS.filter(r => r.id === "ruili-avenue");
  for (const site of Region.VILLAGE_SITES) {
    const p = site.position;
    // 不压现有场景水面（点到水圆距离 ≥ 半径 + 岸线余量 6）
    for (const [wx, wz, wr] of SPEC_WATERS) {
      assert.ok(Math.hypot(p.x - wx, p.z - wz) >= wr + 6, `${site.id} clear of spec water at ${wx},${wz}`);
    }
    // 不压规划河道：到全部水系折线 ≥ 18（江面半宽 14 + 余量）
    assert.ok(Region.distanceToRiver(p) >= 18, `${site.id} clear of river polylines (${Region.distanceToRiver(p).toFixed(1)})`);
    // 不压丘陵碰撞圈
    for (const [hx, hz, hr] of SPEC_HILL_COLLIDERS) {
      assert.ok(Math.hypot(p.x - hx, p.z - hz) >= hr + 4, `${site.id} clear of hill collider at ${hx},${hz}`);
    }
    // 不压主干路：到瑞丽大道 ≥ 契约余量 8（村落中心另有村域展开，不贴路心）
    assert.ok(Region.distanceToRoad(p, avenue) >= 8, `${site.id} clear of Ruili Avenue (${Region.distanceToRoad(p, avenue).toFixed(1)})`);
    // 不落在任何一条路的线身上（支线可穿村而过，但基址中心不压线）
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
  assert.ok(referenced.length >= 3, "at least the active village + 2 reserved sites appear in LANDMARKS via the sites table");
});

test("distanceToRoad is zero on the avenue and grows away from it", () => {
  assert.ok(Region.distanceToRoad({ x: 0, z: 6 }) < 1e-9); // 集市点正在大道 built 段上
  assert.ok(Region.distanceToRoad({ x: 400, z: 300 }) > 50);
});
