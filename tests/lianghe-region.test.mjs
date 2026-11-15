import test from "node:test";
import assert from "node:assert/strict";
import Region from "../wechat/vendor/lianghe-region.cjs";
import Discovery from "../wechat/vendor/preview-discovery.cjs";

const hall = Region.landmarkById("lianghe-hall");
const MP = Region.MASTER_PLAN;
const PN = Region.PLAYABLE_NOW;

// 现有梁河场景 spec.waters 逐字抄录，用于村落基址不压水校验。
const SPEC_WATERS = [
  [-10, -160, 8], [-3, -80, 8], [2, 0, 8], [2, 80, 8], [-3, 170, 8],
  [128, -168, 5], [92, -128, 5], [66, -96, 5],
  [104, -34, 5], [114, -26, 4], [98, -22, 3.5],
];
// 现有场景碰撞圈（hillDefs 的 r*0.52 + 茶山 27 + 金塔丘 15.6 + 宣抚司署 12.5 + 大厅 4.5 + 金葫芦 2.8），基址不压丘陵/本体的粗筛。
const SPEC_HILL_COLLIDERS = [
  [-215, -80, 32.24], [-120, -195, 36.4], [40, -222, 38.44], [175, -150, 32.24], [228, -20, 29.12],
  [230, 110, 28.08], [-232, 30, 30.16], [-40, 226, 36.4], [130, 210, 30.16],
  [-142, -30, 27], [128, -64, 15.6], [-20, -18, 12.5], [-6, 8, 4.5], [-59, 89, 2.8],
];

test("region bounds: master plan is as large as the small dam allows and contains the playable scene", () => {
  assert.equal(MP.maxX - MP.minX, 1080); // 东西 ≥1000（梁河坝子小，总图把河谷走廊与山间安家带计入）
  assert.equal(MP.maxZ - MP.minZ, 860);  // 南北 ≥800
  // playableNow = 现有场景 spec bounds 椭圆 rx248/rz203 的包围盒
  assert.deepEqual({ minX: PN.minX, maxX: PN.maxX, minZ: PN.minZ, maxZ: PN.maxZ }, { minX: -248, maxX: 248, minZ: -203, maxZ: 203 });
  assert.deepEqual(PN.ellipse, { cx: 0, cz: 0, rx: 248, rz: 203 });
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
  const yamen = Region.landmarkById("lianghe-yamen");
  const pagoda = Region.landmarkById("mengdi-pagoda");
  assert.ok(pagoda.position.x > yamen.position.x && pagoda.position.z < yamen.position.z, "勐底大金塔在宣抚司署东北的山上");
  const spring = Region.landmarkById("jinta-hotspring");
  assert.ok(spring.position.x < pagoda.position.x && spring.position.z > pagoda.position.z, "金塔温泉在金塔塔下西南");
  const tea = Region.landmarkById("huilong-tea-mountain");
  assert.ok(tea.position.x < yamen.position.x, "回龙茶山在宣抚司署以西的西山");
  const banggai = Region.landmarkById("banggai");
  assert.ok(banggai.position.z > yamen.position.z, "帮盖村在宣抚司署以南");
  const marketLm = Region.landmarkById("lianghe-market");
  assert.ok(marketLm.position.x > hall.position.x, "遮岛集市在大厅以东");
  const diyang = Region.landmarkById("diyang-hotspring");
  assert.ok(diyang.position.x > banggai.position.x && diyang.position.z > banggai.position.z, "底养温泉在帮盖东南（勐养一带）");
});

test("cross-consistency with the existing lianghe scene anchors", () => {
  // 逐字对现有场景 spec 与 decorate 落位
  assert.deepEqual(hall.position, { x: -6, z: 8 }); // spec hallPos
  assert.deepEqual(Region.landmarkById("lianghe-crystal").position, { x: -11, z: 19 }); // spec crystalPos
  assert.deepEqual(Region.landmarkById("lianghe-yamen").position, { x: -20, z: -18 });
  assert.deepEqual(Region.landmarkById("mengdi-pagoda").position, { x: 128, z: -64 });
  assert.deepEqual(Region.landmarkById("jinta-hotspring").position, { x: 104, z: -34 });
  assert.deepEqual(Region.landmarkById("banggai").position, { x: -59, z: 89 });
  assert.deepEqual(Region.landmarkById("huilong-tea-mountain").position, { x: -142, z: -30 });
  // 集市标位与 preview-discovery 的 MARKET_POS 一致（同一份锚点）
  assert.deepEqual(Discovery.MARKET_POS.lianghe, Region.landmarkById("lianghe-market").position);
  // 两个现有基址与 spec sites 落位一致
  assert.deepEqual(Region.villageSiteById("lianghe-river-0001").position, { x: -66, z: 96 });
  assert.deepEqual(Region.villageSiteById("lianghe-river-0002").position, { x: 62, z: -58 });
});

test("daying river flows north to south and the luoboba river joins it", () => {
  const river = Region.RIVERS.find(r => r.id === "daying-river");
  const built = river.segments.find(s => s.status === "built");
  assert.equal(built.points[0].z, -215); // 北端入境
  assert.equal(built.points[built.points.length - 1].z, 215); // 南端出坝
  for (let i = 1; i < built.points.length; i++) assert.ok(built.points[i].z > built.points[i - 1].z, "built polyline runs north to south");
  const luoboba = Region.RIVERS.find(r => r.id === "luoboba-river");
  const joinSeg = luoboba.segments[luoboba.segments.length - 1];
  const joinPoint = joinSeg.points[joinSeg.points.length - 1];
  const d = Region.distanceToPolyline(joinPoint, built.points);
  assert.ok(d < 10, `luoboba joins the daying river (distance ${d.toFixed(1)})`);
});

test("built segments reproduce the existing scene polylines exactly", () => {
  const avenue = Region.ROADS.find(r => r.id === "zhedao-avenue");
  const builtRoad = avenue.segments.find(s => s.status === "built");
  assert.deepEqual(builtRoad.points, [
    { x: -4, z: -180 }, { x: -6, z: -100 }, { x: -6, z: -30 },
    { x: -4, z: 40 }, { x: -2, z: 120 }, { x: 0, z: 195 },
  ]); // = lianghe-scene roadPts
  const river = Region.RIVERS.find(r => r.id === "daying-river");
  const builtRiver = river.segments.find(s => s.status === "built");
  assert.deepEqual(builtRiver.points, [
    { x: -14, z: -215 }, { x: -6, z: -130 }, { x: 0, z: -50 },
    { x: 4, z: 40 }, { x: 0, z: 130 }, { x: -6, z: 215 },
  ]); // = lianghe-scene riverRun（大盈江，r9）
  const luoboba = Region.RIVERS.find(r => r.id === "luoboba-river");
  const builtBranch = luoboba.segments.find(s => s.status === "built");
  assert.deepEqual(builtBranch.points, [
    { x: 150, z: -190 }, { x: 105, z: -140 }, { x: 66, z: -96 },
  ]); // = lianghe-scene riverRun（萝卜坝河，r5.5）
});

test("worldToMap and mapToWorld are exact inverses at region scale, north is up", () => {
  for (const p of [{ x: -6, z: 8 }, { x: -520, z: -430 }, { x: 560, z: 430 }, { x: 128, z: -64 }, { x: 26, z: 66 }]) {
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
  assert.ok(cap.plotsCapacity >= 300, `Lianghe capacity ${cap.plotsCapacity} is in the several-hundred range`);
});

test("village sites keep clear of water, hills, the trunk avenue and each other", () => {
  const avenue = Region.ROADS.filter(r => r.id === "zhedao-avenue");
  for (const site of Region.VILLAGE_SITES) {
    const p = site.position;
    // 不压现有场景水面（点到水圆距离 ≥ 半径 + 岸线余量 6）
    for (const [wx, wz, wr] of SPEC_WATERS) {
      assert.ok(Math.hypot(p.x - wx, p.z - wz) >= wr + 6, `${site.id} clear of spec water at ${wx},${wz}`);
    }
    // 不压规划河道：到全部水系折线 ≥ 13（江宽 9 + 余量）
    assert.ok(Region.distanceToRiver(p) >= 13, `${site.id} clear of river polylines (${Region.distanceToRiver(p).toFixed(1)})`);
    // 不压丘陵/建筑碰撞圈
    for (const [hx, hz, hr] of SPEC_HILL_COLLIDERS) {
      assert.ok(Math.hypot(p.x - hx, p.z - hz) >= hr + 4, `${site.id} clear of hill collider at ${hx},${hz}`);
    }
    // 不压主干路：到振兴大道 ≥ 契约余量 8
    assert.ok(Region.distanceToRoad(p, avenue) >= 8, `${site.id} clear of Zhedao Avenue (${Region.distanceToRoad(p, avenue).toFixed(1)})`);
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
  assert.ok(referenced.length >= 3, "at least the existing sites + a reserved site appear in LANDMARKS via the sites table");
});

test("distanceToRoad is zero on the avenue and grows away from it", () => {
  assert.ok(Region.distanceToRoad({ x: -6, z: 8 }) < 3); // 大厅点紧邻大道 built 段（署前）
  assert.ok(Region.distanceToRoad({ x: 400, z: 300 }) > 50);
});
