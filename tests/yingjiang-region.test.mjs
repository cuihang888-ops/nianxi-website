import test from "node:test";
import assert from "node:assert/strict";
import Region from "../wechat/vendor/yingjiang-region.cjs";

const market = Region.landmarkById("yingjiang-market");
const MP = Region.MASTER_PLAN;
const PN = Region.PLAYABLE_NOW;

// 现有盈江场景 spec 的水面圆（yingjiang-scene.cjs spec.waters 逐字抄录），用于村落基址不压水校验。
const SPEC_WATERS = [
  [-100, -178, 10], [-55, -128, 10], [88, -176, 10], [44, -130, 10],
  [-20, -80, 11], [-2, -25, 12], [0, 40, 12], [-10, 110, 12], [-20, 180, 12],
  [-168, 148, 15],
];
// 现有场景丘陵碰撞圈（decorate hillDefs 的 r*0.52 + 凯邦亚山 r24 + 允燕山 r13.5，抄录），基址不压丘陵本体的粗筛。
const SPEC_HILL_COLLIDERS = [
  [-225, -90, 33.28], [-140, -205, 36.4], [20, -228, 38.48], [170, -180, 32.24],
  [235, -40, 30.16], [240, 90, 29.12], [-235, 60, 31.2], [-190, 150, 30.16], [90, 225, 34.32],
  [-168, 148, 24], [96, -30, 13.5],
];

test("region bounds: master plan is at full-map scale and contains the playable scene", () => {
  assert.equal(MP.maxX - MP.minX, 1320); // 东西 ≥1200
  assert.equal(MP.maxZ - MP.minZ, 980);  // 南北 ≥900
  // playableNow = 现有场景 spec bounds 椭圆 rx255/rz210 的包围盒
  assert.deepEqual({ minX: PN.minX, maxX: PN.maxX, minZ: PN.minZ, maxZ: PN.maxZ }, { minX: -255, maxX: 255, minZ: -210, maxZ: 210 });
  assert.deepEqual(PN.ellipse, { cx: 0, cz: 0, rx: 255, rz: 210 });
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
  const lake = Region.landmarkById("yingjiang-kaibangya-lake");
  assert.ok(lake.position.x < market.position.x && lake.position.z > market.position.z, "凯邦亚湖在集市西南高山上");
  const king = Region.landmarkById("yingjiang-banyan-king");
  assert.ok(king.position.x < market.position.x && king.position.z < market.position.z, "榕树王在集市西北（现有场景落位）");
  const pagoda = Region.landmarkById("yingjiang-yunyan-pagoda");
  assert.ok(pagoda.position.x > market.position.x, "允燕塔在集市以东");
  const wheel = Region.landmarkById("yingjiang-waterwheel");
  assert.ok(wheel.position.x > market.position.x, "水车在集市以东的江畔");
  const pass = Region.landmarkById("tongbiguan");
  assert.ok(pass.position.x < market.position.x && pass.position.z > lake.position.z, "铜壁关在凯邦亚湖以南（坝西南出口）");
  const shimowadi = Region.landmarkById("shimowadi");
  assert.ok(shimowadi.position.x < king.position.x && shimowadi.position.z < king.position.z, "诗蜜娃底在榕树王以远的西北边境");
  const rock = Region.landmarkById("yingjiang-hujiaoshi");
  const daying = Region.RIVERS.find(r => r.id === "daying-river");
  const dRock = Region.distanceToPolyline(rock.position, daying.segments.find(s => s.status === "built").points);
  assert.ok(dRock < 12.5, `虎跳石在大盈江江心 (distance ${dRock.toFixed(1)})`);
});

test("tributaries join at Jiucheng and the Daying river flows south through the dam", () => {
  const binlang = Region.RIVERS.find(r => r.id === "binlang-river");
  const nandi = Region.RIVERS.find(r => r.id === "nandi-river");
  const daying = Region.RIVERS.find(r => r.id === "daying-river");
  const dayingBuilt = daying.segments.find(s => s.status === "built");
  // 槟榔江 built 段末点 = 大盈江 built 段起点（现有场景两段 riverRun 在此相接）
  const blBuilt = binlang.segments.find(s => s.status === "built");
  assert.deepEqual(blBuilt.points[blBuilt.points.length - 1], dayingBuilt.points[0]);
  assert.deepEqual(dayingBuilt.points[0], { x: -34, z: -105 });
  // 南底河 built 段末点抵旧城汇流带：到大盈江折线在一个河宽量级内（场景以汇流水面圆相连）
  const ndBuilt = nandi.segments.find(s => s.status === "built");
  const ndEnd = ndBuilt.points[ndBuilt.points.length - 1];
  const d = Region.distanceToPolyline(ndEnd, dayingBuilt.points);
  assert.ok(d < 60, `nandi river reaches the confluence (distance ${d.toFixed(1)})`);
  // 大盈江自汇流处向南流出总图
  const allPts = daying.segments.flatMap(s => s.points);
  for (let i = 1; i < allPts.length; i++) assert.ok(allPts[i].z >= allPts[i - 1].z, "Daying river flows monotonically southward (segment joints share a point)");
  assert.ok(allPts[allPts.length - 1].z > 450, "river polyline leaves the dam in the south");
});

test("built segments reproduce the existing scene polylines exactly", () => {
  const avenue = Region.ROADS.find(r => r.id === "daying-avenue");
  assert.deepEqual(avenue.segments.find(s => s.status === "built").points, [
    { x: -6, z: -104 }, { x: -12, z: -52 }, { x: -16, z: -8 },
    { x: -14, z: 50 }, { x: -18, z: 120 }, { x: -24, z: 200 },
  ]); // = yingjiang-scene decorate roadPts
  const daying = Region.RIVERS.find(r => r.id === "daying-river");
  assert.deepEqual(daying.segments.find(s => s.status === "built").points, [
    { x: -34, z: -105 }, { x: -6, z: -52 }, { x: 4, z: 10 },
    { x: -4, z: 80 }, { x: -16, z: 150 }, { x: -24, z: 215 },
  ]); // = yingjiang-scene riverRun（大盈江）
  const binlang = Region.RIVERS.find(r => r.id === "binlang-river");
  assert.deepEqual(binlang.segments.find(s => s.status === "built").points, [
    { x: -120, z: -210 }, { x: -70, z: -150 }, { x: -34, z: -105 },
  ]); // = yingjiang-scene riverRun（槟榔江）
  const nandi = Region.RIVERS.find(r => r.id === "nandi-river");
  assert.deepEqual(nandi.segments.find(s => s.status === "built").points, [
    { x: 110, z: -205 }, { x: 62, z: -152 }, { x: 26, z: -108 },
  ]); // = yingjiang-scene riverRun（南底河）
});

test("worldToMap and mapToWorld are exact inverses at region scale, north is up", () => {
  for (const p of [{ x: -16, z: -8 }, { x: -660, z: -490 }, { x: 660, z: 490 }, { x: -168, z: 148 }, { x: 96, z: -30 }]) {
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
  assert.ok(cap.plotsCapacity >= 300, `Yingjiang capacity ${cap.plotsCapacity} is in the several-hundred range`);
});

test("village sites keep clear of water, hills, the trunk avenue and each other", () => {
  const avenue = Region.ROADS.filter(r => r.id === "daying-avenue");
  for (const site of Region.VILLAGE_SITES) {
    const p = site.position;
    // 不压现有场景水面（点到水圆距离 ≥ 半径 + 岸线余量 6）
    for (const [wx, wz, wr] of SPEC_WATERS) {
      assert.ok(Math.hypot(p.x - wx, p.z - wz) >= wr + 6, `${site.id} clear of spec water at ${wx},${wz}`);
    }
    // 不压规划河道：到全部水系折线 ≥ 18（江面半宽 12.5 + 余量）
    assert.ok(Region.distanceToRiver(p) >= 18, `${site.id} clear of river polylines (${Region.distanceToRiver(p).toFixed(1)})`);
    // 不压丘陵碰撞圈
    for (const [hx, hz, hr] of SPEC_HILL_COLLIDERS) {
      assert.ok(Math.hypot(p.x - hx, p.z - hz) >= hr + 4, `${site.id} clear of hill collider at ${hx},${hz}`);
    }
    // 不压主干路：到坝心大道 ≥ 契约余量 8（村落中心另有村域展开，不贴路心）
    assert.ok(Region.distanceToRoad(p, avenue) >= 8, `${site.id} clear of Daying Avenue (${Region.distanceToRoad(p, avenue).toFixed(1)})`);
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

test("distanceToRoad is small at the market and grows away from the network", () => {
  assert.ok(Region.distanceToRoad(market.position) < 1e-9); // 集市点正在坝心大道 built 段上
  assert.ok(Region.distanceToRoad({ x: 550, z: 400 }) > 50);
});

test("exits point the right way: Lianghe east, Tongbiguan south, Tengchong north", () => {
  const avenue = Region.ROADS.find(r => r.id === "daying-avenue");
  const tg = avenue.exits.find(e => e.id === "tengchong-exit");
  assert.ok(tg.point.z < -400, "Tengchong/Xima exit leaves to the north");
  const tb = avenue.exits.find(e => e.id === "tongbiguan-exit");
  assert.ok(tb.point.x < market.position.x && tb.point.z > 400, "Tongbiguan exit leaves to the south-west (toward Longchuan)");
  const east = Region.ROADS.find(r => r.id === "east-road");
  const lh = east.exits.find(e => e.id === "lianghe-exit");
  assert.ok(lh.point.x > 600 && lh.point.z < market.position.z, "Lianghe exit is the north-east end");
});
