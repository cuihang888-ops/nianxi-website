import test from "node:test";
import assert from "node:assert/strict";
import Region from "../wechat/vendor/longchuan-region.cjs";

const market = Region.landmarkById("longchuan-market");
const MP = Region.MASTER_PLAN;
const PN = Region.PLAYABLE_NOW;

// 现有陇川场景 spec 的水面圆（longchuan-scene.cjs spec.waters 逐字抄录），用于村落基址不压水校验。
const SPEC_WATERS = [
  [-24, -160, 9], [-14, -75, 9], [-4, 0, 9], [2, 80, 9], [5, 160, 9],
  [126, -140, 10], [131, -50, 10], [135, 40, 10], [139, 130, 10],
  [-136, -130, 7], [-130, -40, 7], [-125, 50, 7], [-121, 140, 7],
  [-52, -96, 19],
];
// 现有场景丘陵碰撞圈（decorate hillDefs 的 r*0.52 + 王子山独立碰撞圈，抄录），基址不压丘陵本体的粗筛。
const SPEC_HILL_COLLIDERS = [
  [-225, -70, 32.24], [-150, -190, 35.36], [30, -225, 37.44], [180, -160, 31.2],
  [232, -20, 29.12], [238, 100, 28.08], [-238, 40, 30.16], [-60, 228, 35.36], [120, 218, 30.16],
  [-128, -128, 20],
];

test("region bounds: master plan is at full-map scale and contains the playable scene", () => {
  assert.equal(MP.maxX - MP.minX, 1280); // 东西 ≥1200
  assert.equal(MP.maxZ - MP.minZ, 960);  // 南北 ≥900
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
  const longchuanRiver = Region.RIVERS.find(r => r.id === "longchuan-river");
  const husaRiver = Region.RIVERS.find(r => r.id === "husa-river");
  // 三江格局：龙川江在坝东、户撒河在坝西（以章凤集市为原点看 built 段）
  const lcBuilt = longchuanRiver.segments.find(s => s.status === "built");
  assert.ok(lcBuilt.points.every(p => p.x > market.position.x + 100), "龙川江在集市以东");
  const hsBuilt = husaRiver.segments.find(s => s.status === "built");
  assert.ok(hsBuilt.points.every(p => p.x < market.position.x - 100), "户撒河在集市以西");
  const reservoir = Region.landmarkById("longchuan-reservoir");
  assert.ok(reservoir.position.x < market.position.x && reservoir.position.z < market.position.z, "麻栗坝水库在集市西北（南宛河中游）");
  const farm = Region.landmarkById("longchuan-horse-farm");
  assert.ok(farm.position.x > market.position.x && farm.position.z < market.position.z, "陇川马场在集市东北");
  const crystal = Region.landmarkById("longchuan-crystal");
  assert.ok(Math.hypot(crystal.position.x - farm.position.x, crystal.position.z - farm.position.z) < 25, "传送水晶在马场旁");
  const dance = Region.landmarkById("longchuan-dance");
  assert.ok(dance.position.x < market.position.x, "目瑙纵歌场在集市以西（镇西）");
  const wangzishan = Region.landmarkById("longchuan-wangzishan");
  assert.ok(wangzishan.position.x < market.position.x && wangzishan.position.z < market.position.z, "王子山在坝西北");
  const chengzi = Region.landmarkById("chengzi");
  assert.ok(chengzi.position.x > market.position.x, "城子古镇在集市以东");
  const jinghan = Region.landmarkById("jinghan");
  assert.ok(jinghan.position.z > market.position.z, "景罕在集市以南");
});

test("built segments reproduce the existing scene polylines exactly", () => {
  const avenue = Region.ROADS.find(r => r.id === "zhangfeng-avenue");
  const builtRoad = avenue.segments.find(s => s.status === "built");
  assert.deepEqual(builtRoad.points, [
    { x: -24, z: -160 }, { x: -12, z: -80 }, { x: 4, z: -20 },
    { x: 16, z: 18 }, { x: 10, z: 80 }, { x: 8, z: 150 },
  ]); // = longchuan-scene decorate roadPts
  const nanwan = Region.RIVERS.find(r => r.id === "nanwan-river");
  assert.deepEqual(nanwan.segments.find(s => s.status === "built").points, [
    { x: -30, z: -215 }, { x: -18, z: -130 }, { x: -8, z: -50 },
    { x: -2, z: 30 }, { x: 2, z: 110 }, { x: 6, z: 200 },
  ]); // = longchuan-scene riverRun（南宛河）
  const longchuan = Region.RIVERS.find(r => r.id === "longchuan-river");
  assert.deepEqual(longchuan.segments.find(s => s.status === "built").points, [
    { x: 120, z: -190 }, { x: 128, z: -100 }, { x: 132, z: -10 }, { x: 136, z: 80 }, { x: 140, z: 170 },
  ]); // = longchuan-scene riverRun（龙川江）
  const husa = Region.RIVERS.find(r => r.id === "husa-river");
  assert.deepEqual(husa.segments.find(s => s.status === "built").points, [
    { x: -140, z: -180 }, { x: -132, z: -90 }, { x: -128, z: 0 }, { x: -124, z: 90 }, { x: -120, z: 180 },
  ]); // = longchuan-scene riverRun（户撒河）
});

test("nanwan river runs north to south through the dam and past the market", () => {
  const nanwan = Region.RIVERS.find(r => r.id === "nanwan-river");
  const allPts = nanwan.segments.flatMap(s => s.points);
  assert.ok(allPts[0].z < -400, "river polyline starts in the north (source valley)");
  assert.ok(allPts[allPts.length - 1].z > 400, "river polyline ends in the south (out toward Ruili)");
  for (let i = 1; i < allPts.length; i++) assert.ok(allPts[i].z >= allPts[i - 1].z, "flows monotonically southward (segment joints share a point)");
  // 集市贴南宛河东岸：到 built 段折线距离在河宽量级内
  const built = nanwan.segments.find(s => s.status === "built");
  const d = Region.distanceToPolyline(market.position, built.points);
  assert.ok(d < 25, `market sits by the nanwan river (distance ${d.toFixed(1)})`);
});

test("worldToMap and mapToWorld are exact inverses at region scale, north is up", () => {
  for (const p of [{ x: 16, z: 18 }, { x: -620, z: -480 }, { x: 660, z: 480 }, { x: -52, z: -96 }, { x: 86, z: -58 }]) {
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
  assert.ok(cap.plotsCapacity >= 300, `Longchuan capacity ${cap.plotsCapacity} is in the several-hundred range`);
});

test("village sites keep clear of water, hills, the trunk avenue and each other", () => {
  const avenue = Region.ROADS.filter(r => r.id === "zhangfeng-avenue");
  for (const site of Region.VILLAGE_SITES) {
    const p = site.position;
    // 不压现有场景水面（点到水圆距离 ≥ 半径 + 岸线余量 6）
    for (const [wx, wz, wr] of SPEC_WATERS) {
      assert.ok(Math.hypot(p.x - wx, p.z - wz) >= wr + 6, `${site.id} clear of spec water at ${wx},${wz}`);
    }
    // 不压规划河道：到全部水系折线 ≥ 18（江面半宽 11 + 余量）
    assert.ok(Region.distanceToRiver(p) >= 18, `${site.id} clear of river polylines (${Region.distanceToRiver(p).toFixed(1)})`);
    // 不压丘陵碰撞圈
    for (const [hx, hz, hr] of SPEC_HILL_COLLIDERS) {
      assert.ok(Math.hypot(p.x - hx, p.z - hz) >= hr + 4, `${site.id} clear of hill collider at ${hx},${hz}`);
    }
    // 不压主干路：到章凤大街 ≥ 契约余量 8（村落中心另有村域展开，不贴路心）
    assert.ok(Region.distanceToRoad(p, avenue) >= 8, `${site.id} clear of Zhangfeng Avenue (${Region.distanceToRoad(p, avenue).toFixed(1)})`);
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
  assert.ok(Region.distanceToRoad(market.position) < 1e-9); // 集市点正在章凤大街 built 段上
  assert.ok(Region.distanceToRoad({ x: -500, z: 300 }) > 50);
});

test("exits point the right way: Ruili south-west, Yingjiang north-west, Mangshi east, Lianghe north-east", () => {
  const avenue = Region.ROADS.find(r => r.id === "zhangfeng-avenue");
  const ruili = avenue.exits.find(e => e.id === "ruili-exit");
  assert.ok(ruili.point.x < market.position.x && ruili.point.z > 400, "Ruili exit leaves the dam to the south-west along the river");
  const lianghe = avenue.exits.find(e => e.id === "lianghe-exit");
  assert.ok(lianghe.point.z < -400, "Lianghe exit leaves to the north");
  const west = Region.ROADS.find(r => r.id === "west-road");
  const tb = west.exits.find(e => e.id === "tongbiguan-exit");
  assert.ok(tb.point.x < -400 && tb.point.z < -400, "Tongbiguan exit is the north-west corner");
  const east = Region.ROADS.find(r => r.id === "east-road");
  const zf = east.exits.find(e => e.id === "zhefang-exit");
  assert.ok(zf.point.x > 600, "Zhefang/Mangshi exit is the east end");
});
