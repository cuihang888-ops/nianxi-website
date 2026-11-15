"use strict";

// 安和里 · 梁河全域大地图布局（坝区层总图契约，2026-11-15）
// 纯数据 + 纯函数：无 DOM、无随机、无时间依赖。
// 坐标系：坝内坐标 —— 与现有梁河场景 wechat/vendor/lianghe-scene.cjs 的 spec 完全一致
//（右手系、Y 向上、地面 X/Z，北为 -Z、东为 +X，yaw = atan2(dx, dz)，单位为游戏单位）。
// 梁河走通用坝引擎 dam-world：spec 锚点为 hallPos (-6,8)、crystalPos (-11,19)、spawn (-8,30)、
// sites [(-66,96),(62,-58)]、bounds { rx:248, rz:203 }；集市卖货点以 preview-discovery.cjs 的
// MARKET_POS.lianghe (26,66) 为准（与九保古镇石板街口同位）。
// 两层口径：playableNow = 现有场景已覆盖范围（spec bounds 椭圆 rx248/rz203）；
// masterPlan = 全域总图规划范围（东西 1080 × 南北 860）。梁河坝子本体小、四周环山，
// 总图已按「能做多大做多大」把河谷走廊与山间安家带计入，仍小于瑞丽/芒市量级（如实，见布局文档 §9）。
// status 说明：built = 现有场景已有实物/已定稿契约；planned = 总图规划落位，尚未建模。
// 本模块的数值是梁河全域布局的唯一来源，docs/MUSE_LIANGHE_FULLMAP_LAYOUT_20261115.md 从此处抄录。
// 「大概位置」是设计落位（对齐真实梁河大概地理与地方图设计稿），不是测绘坐标。
// 这里的 region/village/landmark ID 均为场景侧建议名，最终以服务端目录（C1）为准。

const WORLD_ID = "dehong";
const REGION_ID = "lianghe";

// —— 全域范围（坝内坐标）——
const PLAYABLE_NOW = Object.freeze({
  minX: -248, maxX: 248, minZ: -203, maxZ: 203, // spec bounds 椭圆的包围盒
  ellipse: Object.freeze({ cx: 0, cz: 0, rx: 248, rz: 203 }), // lianghe-scene spec.bounds 原值
});
const MASTER_PLAN = Object.freeze({
  minX: -520, maxX: 560, minZ: -430, maxZ: 430, // 东西 1080 × 南北 860
});
const REGION_BOUNDS = Object.freeze({ playableNow: PLAYABLE_NOW, masterPlan: MASTER_PLAN });

function pt(x, z) { return Object.freeze({ x, z }); }

// —— 水系（坝内坐标，折线按水流方向排列）——
// built 段点列逐字抄自 lianghe-scene.cjs decorate 的 riverRun 调用，不许挪位。
const RIVERS = Object.freeze([
  Object.freeze({
    id: "daying-river", name: "大盈江（上游）", // 自北入境穿坝、向南出坝去盈江
    segments: Object.freeze([
      Object.freeze({ status: "planned", width: 9, points: Object.freeze([pt(-34, -425), pt(-22, -320), pt(-14, -215)]) }), // 北延入境段
      Object.freeze({ status: "built", width: 9, points: Object.freeze([pt(-14, -215), pt(-6, -130), pt(0, -50), pt(4, 40), pt(0, 130), pt(-6, 215)]) }), // 现有 riverRun（r9），原序北→南即流向
      Object.freeze({ status: "planned", width: 9, points: Object.freeze([pt(-6, 215), pt(-52, 300), pt(-120, 385), pt(-190, 425)]) }), // 南延出境段（去盈江）
    ]),
  }),
  Object.freeze({
    id: "luoboba-river", name: "萝卜坝河", // 自东北山间来、经勐底金塔山西麓、向西南汇入大盈江
    segments: Object.freeze([
      Object.freeze({ status: "planned", width: 5.5, points: Object.freeze([pt(215, -300), pt(182, -245), pt(150, -190)]) }), // 东北山间来水段
      Object.freeze({ status: "built", width: 5.5, points: Object.freeze([pt(150, -190), pt(105, -140), pt(66, -96)]) }), // 现有 riverRun（r5.5）
      Object.freeze({ status: "planned", width: 5.5, points: Object.freeze([pt(66, -96), pt(42, -62), pt(18, -28), pt(6, -6)]) }), // 汇流段，末点汇入大盈江水面
    ]),
  }),
  Object.freeze({
    id: "longjiang-source", name: "龙江源", // 坝南山间源头溪，南下出坝（龙江自梁河南部发源）
    segments: Object.freeze([
      Object.freeze({ status: "planned", width: 4, points: Object.freeze([pt(96, 150), pt(72, 250), pt(58, 340), pt(50, 425)]) }),
    ]),
  }),
  Object.freeze({
    id: "mengyang-river", name: "勐养江", // 坝东南溪流，向东南出坝去勐养
    segments: Object.freeze([
      Object.freeze({ status: "planned", width: 4, points: Object.freeze([pt(168, 96), pt(205, 180), pt(252, 275), pt(305, 370), pt(345, 425)]) }),
    ]),
  }),
]);

// —— 主干路网（坝内坐标）——
// 振兴大道 built 段逐字抄自 lianghe-scene.cjs 的 roadPts（沿江西岸穿坝心的古道）。
// 原始社会底色下城镇大道就是大道古道：土路、驿站、马帮走的这条线，数据命名保留设计稿的「振兴大道」。
const ROADS = Object.freeze([
  Object.freeze({
    id: "zhedao-avenue", name: "振兴大道（古道主干）", // 全域主轴：北口 → 署前/大厅 → 南下走廊去芒市
    halfWidth: 4.5,
    segments: Object.freeze([
      Object.freeze({ status: "planned", points: Object.freeze([pt(-4, -180), pt(-2, -290), pt(6, -425)]) }), // 北延：坝心 → 腾冲方向出口
      Object.freeze({ status: "built", points: Object.freeze([pt(-4, -180), pt(-6, -100), pt(-6, -30), pt(-4, 40), pt(-2, 120), pt(0, 195)]) }), // 现有古道
      Object.freeze({ status: "planned", points: Object.freeze([pt(0, 195), pt(8, 300), pt(18, 425)]) }), // 南延：坝心 → 芒市方向（经芒东）
    ]),
    exits: Object.freeze([
      Object.freeze({ id: "tengchong-exit", point: pt(6, -425), yaw: 3.082, toward: "腾冲方向（出州）" }),
      Object.freeze({ id: "mangshi-exit", point: pt(18, 425), yaw: 0.080, toward: "芒市方向（经芒东）" }),
    ]),
  }),
  Object.freeze({
    id: "nandian-street", name: "南甸坊古街", // 遮岛镇东西向老街，过宣抚司署门前（现有场景未铺路，全线 planned）
    halfWidth: 3.5,
    segments: Object.freeze([
      Object.freeze({ status: "planned", points: Object.freeze([pt(-140, -26), pt(-70, -21), pt(-20, -18), pt(40, -13), pt(120, -6)]) }),
    ]),
    exits: Object.freeze([]),
  }),
  Object.freeze({
    id: "west-riverside", name: "西线江畔道", // 署前西出、沿大盈江西岸北上 → 盈江 · 旧城方向（全线 planned）
    halfWidth: 4,
    segments: Object.freeze([
      Object.freeze({ status: "planned", points: Object.freeze([pt(-6, -8), pt(-90, -38), pt(-210, -66), pt(-350, -92), pt(-505, -112)]) }),
    ]),
    exits: Object.freeze([
      Object.freeze({ id: "yingjiang-exit", point: pt(-505, -112), yaw: -1.698, toward: "盈江 · 旧城方向" }),
    ]),
  }),
  Object.freeze({
    id: "mengyang-road", name: "勐养道", // 坝心南下东折 → 帮盖以东、勐养方向（全线 planned）
    halfWidth: 4,
    segments: Object.freeze([
      Object.freeze({ status: "planned", points: Object.freeze([pt(2, 120), pt(80, 200), pt(170, 290), pt(255, 385), pt(300, 425)]) }),
    ]),
    exits: Object.freeze([
      Object.freeze({ id: "mengyang-exit", point: pt(300, 425), yaw: 0.844, toward: "勐养方向" }),
    ]),
  }),
]);

// —— 村落基址（安家容量体系）——
// 每村首期 8 块（与村落契约的定稿排布同口径），上限按平均占地估算：
// 地块 30×32=960，连同土巷、土径、公共保留与地形损耗，平均每户占地约 1700–2200；
// 单村可安家地带约 7–10 万单位 → 上限 32–48 块（梁河谷地多、开阔地少，逐村给 32–40，坝田/南田最开阔给 40）。
// 基址落位规则：不压水（离现有场景水面与河道留岸线余量）、不压主干路（中心到振兴大道 ≥ 8 的契约余量外加村域展开空间）、
// 不压地标本体、彼此间距 ≥ 60。status：built = 基址已建于现有场景（spec sites）；planned = 总图预留基址。
const PLOTS_PER_VILLAGE_INITIAL = 8;
const VILLAGE_SITES = Object.freeze([
  Object.freeze({ id: "lianghe-river-0001", name: "帮盖", position: pt(-66, 96), status: "built", plotsInitial: 8, plotsCapacity: 36, note: "现有基址（spec sites[0]）：帮盖金葫芦旁，葫芦丝之源" }),
  Object.freeze({ id: "lianghe-river-0002", name: "塔麓", position: pt(62, -58), status: "built", plotsInitial: 8, plotsCapacity: 36, note: "现有基址（spec sites[1]）：勐底大金塔山西麓、萝卜坝河东岸" }),
  Object.freeze({ id: "lianghe-river-0003", name: "江畔", position: pt(-70, -120), status: "planned", plotsInitial: 8, plotsCapacity: 36, note: "大盈江西岸北段，振兴大道西侧" }),
  Object.freeze({ id: "lianghe-river-0004", name: "江北", position: pt(-40, -260), status: "planned", plotsInitial: 8, plotsCapacity: 32, note: "坝北江畔谷地，北延古道旁，谷地较窄" }),
  Object.freeze({ id: "lianghe-river-0005", name: "坝田", position: pt(80, 60), status: "planned", plotsInitial: 8, plotsCapacity: 40, note: "遮岛坝田畴东片，坝心以东最开阔" }),
  Object.freeze({ id: "lianghe-river-0006", name: "署西", position: pt(-110, 30), status: "planned", plotsInitial: 8, plotsCapacity: 32, note: "宣抚司署以西、回龙茶山东麓" }),
  Object.freeze({ id: "lianghe-river-0007", name: "茶山脚", position: pt(-185, -130), status: "planned", plotsInitial: 8, plotsCapacity: 32, note: "西山脚下，茶山安家带西缘" }),
  Object.freeze({ id: "lianghe-river-0008", name: "河谷", position: pt(110, -180), status: "planned", plotsInitial: 8, plotsCapacity: 32, note: "萝卜坝河谷地东岸，谷地较窄" }),
  Object.freeze({ id: "lianghe-river-0009", name: "温泉畔", position: pt(170, -10), status: "planned", plotsInitial: 8, plotsCapacity: 36, note: "金塔温泉以东山脚平地" }),
  Object.freeze({ id: "lianghe-river-0010", name: "南田", position: pt(-60, 180), status: "planned", plotsInitial: 8, plotsCapacity: 40, note: "坝南田畴，振兴大道西侧" }),
  Object.freeze({ id: "lianghe-river-0011", name: "勐养道旁", position: pt(180, 190), status: "planned", plotsInitial: 8, plotsCapacity: 36, note: "坝东南，勐养道与勐养江之间" }),
  Object.freeze({ id: "lianghe-river-0012", name: "北岭", position: pt(150, -300), status: "planned", plotsInitial: 8, plotsCapacity: 32, note: "坝北山岭台地，萝卜坝河南源以东" }),
]);

// 梁河一区容量账（由 VILLAGE_SITES 求和，文档抄录这两个数，不另算一份）
const REGION_CAPACITY = Object.freeze({
  villageSites: VILLAGE_SITES.length,
  plotsInitial: VILLAGE_SITES.reduce((s, v) => s + v.plotsInitial, 0),
  plotsCapacity: VILLAGE_SITES.reduce((s, v) => s + v.plotsCapacity, 0),
});

// —— 地标表（坝内坐标）——
// built 的落位全部来自现有场景 spec/decorate 或 preview-discovery 的既有标位；planned 按真实梁河大概地理与地方图设计稿落位。
// 村落类地标不另抄坐标：直接引用 VILLAGE_SITES 的对象位置（同一份数，改一处即全改）。
function villageLandmark(site, kind) {
  return Object.freeze({ id: site.id, name: `梁河村落 · ${site.name}`, position: site.position, kind, status: site.status });
}
const LANDMARKS = Object.freeze([
  Object.freeze({ id: "lianghe-yamen", name: "南甸宣抚司署", position: pt(-20, -18), kind: "yamen", status: "built" }), // 现有场景署体落位（decorate landmark:yamen）
  Object.freeze({ id: "lianghe-hall", name: "大厅（署前）", position: pt(-6, 8), kind: "hall", status: "built" }), // spec hallPos，署前大厅亭
  Object.freeze({ id: "lianghe-crystal", name: "传送水晶", position: pt(-11, 19), kind: "crystal", status: "built" }), // spec crystalPos
  Object.freeze({ id: "lianghe-market", name: "遮岛集市", position: pt(26, 66), kind: "market", status: "built" }), // preview-discovery MARKET_POS.lianghe，与九保古镇石板街口同位
  Object.freeze({ id: "jiubao", name: "九保古镇", position: pt(26, 66), kind: "town", status: "built" }), // 现有场景石板街口落位（与集市同点，见布局文档 §9 的方位说明）
  Object.freeze({ id: "mengdi-pagoda", name: "勐底大金塔", position: pt(128, -64), kind: "pagoda", status: "built" }), // 现有场景塔体落位（坝东山上）
  Object.freeze({ id: "jinta-hotspring", name: "金塔温泉", position: pt(104, -34), kind: "hotspring", status: "built" }), // 现有场景温泉主池落位（塔下西南）
  Object.freeze({ id: "banggai", name: "帮盖村 · 金葫芦", position: pt(-59, 89), kind: "village", status: "built" }), // 现有场景金葫芦落位（村口意象，紧邻基址 0001）
  Object.freeze({ id: "huilong-tea-mountain", name: "回龙茶山", position: pt(-142, -30), kind: "tea-mountain", status: "built" }), // 现有场景茶山落位（层层茶垄）
  villageLandmark(VILLAGE_SITES[0], "village"), // lianghe-river-0001 帮盖（现有基址）
  villageLandmark(VILLAGE_SITES[1], "village"), // lianghe-river-0002 塔麓（现有基址）
  villageLandmark(VILLAGE_SITES[4], "village-site"), // 坝田预留基址（引用 VILLAGE_SITES）
  Object.freeze({ id: "diyang-hotspring", name: "底养温泉", position: pt(330, 355), kind: "hotspring", status: "planned" }), // 坝东南勐养一带，地方图设计稿落位
  Object.freeze({ id: "mangdong-station", name: "芒东古道驿", position: pt(12, 300), kind: "station", status: "planned" }), // 振兴大道南延段旁，去芒市途中的驿站落位
  Object.freeze({ id: "luoboba", name: "萝卜坝", position: pt(24, -345), kind: "basin", status: "planned" }), // 坝北山间小坝，萝卜坝河上游
]);

// —— 全域小地图投影 ——
// 与村落版/瑞丽版同朝向定义：map.x 东为正，map.y 向下为正（+Z/南在下、-Z/北在上，指北向上）。
// 投影中心取 masterPlan 几何中心，scale = 0.5 地图单位/游戏单位（总图 1080×860 → 540×430 地图单位）。
const MAP_PROJECTION = Object.freeze({
  center: Object.freeze({ x: (MASTER_PLAN.minX + MASTER_PLAN.maxX) / 2, z: (MASTER_PLAN.minZ + MASTER_PLAN.maxZ) / 2 }),
  scale: 0.5,
});

// —— 纯函数 ——

function landmarkById(id) {
  return LANDMARKS.find(l => l.id === id) || null;
}

function villageSiteById(id) {
  return VILLAGE_SITES.find(v => v.id === id) || null;
}

function pointInBounds(point, bounds) {
  return point.x >= bounds.minX && point.x <= bounds.maxX && point.z >= bounds.minZ && point.z <= bounds.maxZ;
}

function landmarksInBounds(bounds) {
  return LANDMARKS.filter(l => pointInBounds(l.position, bounds));
}

function villageSitesInBounds(bounds) {
  return VILLAGE_SITES.filter(v => pointInBounds(v.position, bounds));
}

function distancePointToSegment(point, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  let t = len2 === 0 ? 0 : ((point.x - a.x) * dx + (point.z - a.z) * dz) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(point.x - (a.x + dx * t), point.z - (a.z + dz * t));
}

function distanceToPolyline(point, points) {
  let min = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    min = Math.min(min, distancePointToSegment(point, points[i], points[i + 1]));
  }
  return min;
}

// 点到主干路网（默认全部 ROADS，可传入子集如只算振兴大道）的最短距离。
function distanceToRoad(point, roads = ROADS) {
  let min = Infinity;
  for (const road of roads) {
    for (const seg of road.segments) min = Math.min(min, distanceToPolyline(point, seg.points));
  }
  return min;
}

// 点到水系（默认全部 RIVERS）的最短距离。
function distanceToRiver(point, rivers = RIVERS) {
  let min = Infinity;
  for (const river of rivers) {
    for (const seg of river.segments) min = Math.min(min, distanceToPolyline(point, seg.points));
  }
  return min;
}

function worldToMap(point, projection = MAP_PROJECTION) {
  return {
    x: (point.x - projection.center.x) * projection.scale,
    y: (point.z - projection.center.z) * projection.scale,
  };
}

function mapToWorld(mapPoint, projection = MAP_PROJECTION) {
  return {
    x: mapPoint.x / projection.scale + projection.center.x,
    z: mapPoint.y / projection.scale + projection.center.z,
  };
}

module.exports = {
  WORLD_ID, REGION_ID,
  REGION_BOUNDS, PLAYABLE_NOW, MASTER_PLAN,
  RIVERS, ROADS, LANDMARKS, VILLAGE_SITES, REGION_CAPACITY, PLOTS_PER_VILLAGE_INITIAL,
  MAP_PROJECTION,
  landmarkById, villageSiteById,
  pointInBounds, landmarksInBounds, villageSitesInBounds,
  distancePointToSegment, distanceToPolyline, distanceToRoad, distanceToRiver,
  worldToMap, mapToWorld,
};
