"use strict";

// 安和里 · 芒市全域大地图布局（坝区层总图契约，2026-11-15）
// 纯数据 + 纯函数：无 DOM、无随机、无时间依赖。
// 坐标系：坝内坐标 —— 与现有芒市场景 wechat/vendor/mangshi-scene.cjs 的 landSpec 完全一致
//（右手系、Y 向上、地面 X/Z，北为 -Z、东为 +X，yaw = atan2(dx, dz)，单位为游戏单位）。
// 芒市场景是独立模块（不走 dam-world 的 createDamScene），锚点全部抄自该文件本体：
// 总佛寺 (-58,-58)、大厅 HALL_POS (-38,-44)、集市 (4,34)、水晶 CRYSTAL_POS (-0.5,35.5)、
// 出生落点 spawn (4,52)、基址 sites [(-78,66),(58,96)]、bounds { rx:265, rz:215 }。
// 两层口径：playableNow = 现有场景已覆盖范围（landSpec bounds 椭圆 rx265/rz215）；
// masterPlan = 全域总图规划范围（东西 1340 × 南北 960），现有锚点一律不挪位、范围只向外扩。
// status 说明：built = 现有场景已有实物/已定稿契约；planned = 总图规划落位，尚未建模。
// 本模块的数值是芒市全域布局的唯一来源，docs/MUSE_MANGSHI_FULLMAP_LAYOUT_20261115.md 从此处抄录。
// 「大概位置」是设计落位（对齐真实芒市大概地理与地方图设计稿），不是测绘坐标。
// 这里的 region/village/landmark ID 均为场景侧建议名，最终以服务端目录（C1）为准。

const WORLD_ID = "dehong";
const REGION_ID = "mangshi";
const TEMPLE_ID = "ruili-temple"; // 共享世界寺院目录 id（交接文档）：总佛寺本体在本坝（见 LANDMARKS 的 mangshi-temple），红结/祈福锚点以交接文档为准

// —— 全域范围（坝内坐标）——
const PLAYABLE_NOW = Object.freeze({
  minX: -265, maxX: 265, minZ: -215, maxZ: 215, // landSpec bounds 椭圆的包围盒
  ellipse: Object.freeze({ cx: 0, cz: 0, rx: 265, rz: 215 }), // mangshi-scene landSpec.bounds 原值
});
const MASTER_PLAN = Object.freeze({
  minX: -660, maxX: 680, minZ: -480, maxZ: 480, // 东西 1340 × 南北 960
});
const REGION_BOUNDS = Object.freeze({ playableNow: PLAYABLE_NOW, masterPlan: MASTER_PLAN });

function pt(x, z) { return Object.freeze({ x, z }); }

// —— 水系（坝内坐标，折线按水流方向排列）——
// built 段点列逐字抄自 mangshi-scene.cjs 的 riverPts（芒市河穿坝 S 形水带，渲染圆半径 11.5），不许挪位。
const RIVERS = Object.freeze([
  Object.freeze({
    id: "mangshi-river", name: "芒市河", // 自东北入境、穿坝而过、向西南出坝去遮放
    segments: Object.freeze([
      Object.freeze({ status: "planned", width: 11.5, points: Object.freeze([pt(-6, -460), pt(-20, -320), pt(-38, -205)]) }), // 北延入境段（轩岗方向来水）
      Object.freeze({ status: "built", width: 11.5, points: Object.freeze([pt(-38, -205), pt(-24, -140), pt(-12, -75), pt(11, -10), pt(21, 55), pt(2, 120), pt(-22, 175), pt(-38, 215)]) }), // 现有 riverPts 原序（北→南即流向）
      Object.freeze({ status: "planned", width: 11.5, points: Object.freeze([pt(-38, 215), pt(-110, 320), pt(-210, 410), pt(-300, 455)]) }), // 南延出境段（去遮放，汇入瑞丽江水系）
    ]),
  }),
  Object.freeze({
    id: "kongque-outflow", name: "孔雀湖坝下溪", // 孔雀湖坝下泄流，向西南汇入芒市河（地方图设计稿有湖坝，现有场景未建溪）
    segments: Object.freeze([
      Object.freeze({ status: "planned", width: 3, points: Object.freeze([pt(112, 30), pt(80, 105), pt(24, 168), pt(-16, 196)]) }),
    ]),
  }),
]);

// —— 主干路网（坝内坐标）——
// 芒市大道 built 段逐字抄自 mangshi-scene.cjs 的 roadPts（寺前 → 集市 → 南去的古道土带）。
// 原始社会底色下城内大道就是大道古道：土路、驿站、马帮走的这条线，数据命名保留用户定的「芒市大道」。
const ROADS = Object.freeze([
  Object.freeze({
    id: "mangshi-avenue", name: "芒市大道（古道主干）", // 全域主轴：总佛寺前 → 集市 → 南下走廊去遮放
    halfWidth: 5,
    segments: Object.freeze([
      Object.freeze({ status: "built", points: Object.freeze([pt(-44, -42), pt(-24, -14), pt(-6, 12), pt(4, 34), pt(-2, 80), pt(-10, 130), pt(-16, 185), pt(-20, 215)]) }), // 现有古道
      Object.freeze({ status: "planned", points: Object.freeze([pt(-20, 215), pt(-110, 300), pt(-230, 380), pt(-360, 440)]) }), // 南延：坝心 → 遮放走廊
    ]),
    exits: Object.freeze([
      Object.freeze({ id: "zhefang-exit", point: pt(-360, 440), yaw: -1.139, toward: "遮放 · 陇川 · 瑞丽方向" }),
    ]),
  }),
  Object.freeze({
    id: "menghuan-avenue", name: "勐焕大道", // 东西横贯坝心的城内大道（地方图设计稿的城内大道原始化；现有场景未铺路，全线 planned）
    halfWidth: 4.5,
    segments: Object.freeze([
      Object.freeze({ status: "planned", points: Object.freeze([pt(-300, 58), pt(-160, 44), pt(4, 34), pt(150, 28), pt(300, 14), pt(470, -16), pt(650, -52)]) }),
    ]),
    exits: Object.freeze([
      Object.freeze({ id: "fengping-exit", point: pt(-300, 58), yaw: -1.471, toward: "风平方向" }),
      Object.freeze({ id: "longling-exit", point: pt(650, -52), yaw: 1.768, toward: "龙陵方向（出州）" }),
    ]),
  }),
  Object.freeze({
    id: "jinta-avenue", name: "金塔大道", // 勐焕大道东段北折上雷牙让山：勐焕大金塔的登塔道（全线 planned）
    halfWidth: 4,
    segments: Object.freeze([
      Object.freeze({ status: "planned", points: Object.freeze([pt(300, 14), pt(330, -60), pt(350, -160)]) }),
    ]),
    exits: Object.freeze([
      Object.freeze({ id: "menghuan-pagoda-exit", point: pt(350, -160), yaw: 2.944, toward: "勐焕大金塔" }),
    ]),
  }),
  Object.freeze({
    id: "north-road", name: "北线古道", // 总佛寺北上出坝 → 梁河方向（全线 planned）
    halfWidth: 4,
    segments: Object.freeze([
      Object.freeze({ status: "planned", points: Object.freeze([pt(-52, -52), pt(-44, -200), pt(-36, -340), pt(-30, -462)]) }),
    ]),
    exits: Object.freeze([
      Object.freeze({ id: "lianghe-exit", point: pt(-30, -462), yaw: 3.092, toward: "梁河 · 盈江方向" }),
    ]),
  }),
  Object.freeze({
    id: "xuangang-road", name: "轩岗道", // 坝心东北上行 → 轩岗方向出口（全线 planned）
    halfWidth: 4,
    segments: Object.freeze([
      Object.freeze({ status: "planned", points: Object.freeze([pt(40, 30), pt(90, -70), pt(170, -190), pt(260, -320), pt(340, -430), pt(390, -462)]) }),
    ]),
    exits: Object.freeze([
      Object.freeze({ id: "xuangang-exit", point: pt(390, -462), yaw: 2.139, toward: "轩岗方向" }),
    ]),
  }),
  Object.freeze({
    id: "mengga-road", name: "勐戛道", // 芒市大道南段东折 → 勐戛 · 三台山方向（全线 planned）
    halfWidth: 4,
    segments: Object.freeze([
      Object.freeze({ status: "planned", points: Object.freeze([pt(-14, 150), pt(-2, 240), pt(30, 330), pt(80, 420), pt(110, 462)]) }),
    ]),
    exits: Object.freeze([
      Object.freeze({ id: "mengga-exit", point: pt(110, 462), yaw: 0.620, toward: "勐戛 · 三台山方向" }),
    ]),
  }),
]);

// —— 村落基址（安家容量体系）——
// 每村首期 8 块（与村落契约的定稿排布同口径），上限按平均占地估算：
// 地块 30×32=960，连同土巷、土径、公共保留与地形损耗，平均每户占地约 1700–2200；
// 单村可安家地带约 7–10 万单位 → 上限 32–48 块（逐村按地形给值，坝田最开阔给 48、轩岗道旁谷地最窄给 32）。
// 基址落位规则：不压水（离现有场景水面与河道留岸线余量）、不压主干路（中心到芒市大道 ≥ 8 的契约余量外加村域展开空间）、
// 不压地标本体、彼此间距 ≥ 60。status：built = 基址已建于现有场景（spec sites）；planned = 总图预留基址。
const PLOTS_PER_VILLAGE_INITIAL = 8;
const VILLAGE_SITES = Object.freeze([
  Object.freeze({ id: "mangshi-river-0001", name: "河畔", position: pt(-78, 66), status: "built", plotsInitial: 8, plotsCapacity: 40, note: "现有基址（mangshi-scene buildSite 0）：芒市河西岸、集市西南" }),
  Object.freeze({ id: "mangshi-river-0002", name: "坝心", position: pt(58, 96), status: "built", plotsInitial: 8, plotsCapacity: 40, note: "现有基址（mangshi-scene buildSite 1）：集市东南坝心" }),
  Object.freeze({ id: "mangshi-river-0003", name: "湖畔", position: pt(150, 60), status: "planned", plotsInitial: 8, plotsCapacity: 40, note: "孔雀湖南端东岸草地，勐焕大道南侧" }),
  Object.freeze({ id: "mangshi-river-0004", name: "湖西", position: pt(66, -70), status: "planned", plotsInitial: 8, plotsCapacity: 36, note: "孔雀湖西岸北段，湖与河之间" }),
  Object.freeze({ id: "mangshi-river-0005", name: "塔下", position: pt(250, -120), status: "planned", plotsInitial: 8, plotsCapacity: 36, note: "雷牙让山西麓，金塔大道旁" }),
  Object.freeze({ id: "mangshi-river-0006", name: "山脚", position: pt(240, 170), status: "planned", plotsInitial: 8, plotsCapacity: 36, note: "坝东南山脚，勐焕大道以南" }),
  Object.freeze({ id: "mangshi-river-0007", name: "坝田", position: pt(-160, 150), status: "planned", plotsInitial: 8, plotsCapacity: 48, note: "西南坝田最开阔，芒市大道西侧" }),
  Object.freeze({ id: "mangshi-river-0008", name: "坝南", position: pt(-190, 270), status: "planned", plotsInitial: 8, plotsCapacity: 40, note: "坝南田野，遮放走廊西侧" }),
  Object.freeze({ id: "mangshi-river-0009", name: "河东", position: pt(90, 180), status: "planned", plotsInitial: 8, plotsCapacity: 40, note: "芒市河南段东岸，孔雀湖以南" }),
  Object.freeze({ id: "mangshi-river-0010", name: "北坝", position: pt(-120, -160), status: "planned", plotsInitial: 8, plotsCapacity: 36, note: "坝北田野，北线古道西侧" }),
  Object.freeze({ id: "mangshi-river-0011", name: "轩岗道旁", position: pt(180, -260), status: "planned", plotsInitial: 8, plotsCapacity: 32, note: "东北谷地，轩岗道旁，谷地较窄" }),
  Object.freeze({ id: "mangshi-river-0012", name: "寺后", position: pt(-150, -40), status: "planned", plotsInitial: 8, plotsCapacity: 36, note: "总佛寺以西坝缘，芒市河西岸" }),
]);

// 芒市一区容量账（由 VILLAGE_SITES 求和，文档抄录这两个数，不另算一份）
const REGION_CAPACITY = Object.freeze({
  villageSites: VILLAGE_SITES.length,
  plotsInitial: VILLAGE_SITES.reduce((s, v) => s + v.plotsInitial, 0),
  plotsCapacity: VILLAGE_SITES.reduce((s, v) => s + v.plotsCapacity, 0),
});

// —— 地标表（坝内坐标）——
// built 的落位全部来自现有场景本体（独立模块的建模点位与 landSpec）；planned 按真实芒市大概地理与地方图设计稿落位。
// 村落类地标不另抄坐标：直接引用 VILLAGE_SITES 的对象位置（同一份数，改一处即全改）。
function villageLandmark(site, kind) {
  return Object.freeze({ id: site.id, name: `芒市村落 · ${site.name}`, position: site.position, kind, status: site.status });
}
const LANDMARKS = Object.freeze([
  Object.freeze({ id: "mangshi-temple", name: "总佛寺", position: pt(-58, -58), kind: "temple", status: "built" }), // 现有场景寺体落位（简化地标版）；共享世界寺院目录 id = ruili-temple
  Object.freeze({ id: "mangshi-hall", name: "大厅（总佛寺前）", position: pt(-38, -44), kind: "hall", status: "built" }), // HALL_POS，安和里大厅亭
  Object.freeze({ id: "mangshi-courtyard", name: "安和里庭院（出生地）", position: pt(4, 52), kind: "courtyard", status: "built" }), // 庭院本体为独立场景 anheli-scene，本坝以出生落点 spawn (4,52) 标位
  Object.freeze({ id: "mangshi-market", name: "主集市", position: pt(4, 34), kind: "market", status: "built" }), // 现有场景集市空地圆盘中心；preview-discovery MARKET_POS 同点
  Object.freeze({ id: "mangshi-crystal", name: "传送水晶", position: pt(-0.5, 35.5), kind: "crystal", status: "built" }), // CRYSTAL_POS = 集市组位 + 水晶组内偏移
  Object.freeze({ id: "kongque-lake", name: "孔雀湖", position: pt(112, -18), kind: "lake", status: "built" }), // 现有场景湖体落位（南北长条水库，绿孔雀栖息地）
  Object.freeze({ id: "peacock-habitat", name: "绿孔雀栖息地", position: pt(84, 6), kind: "wildlife", status: "built" }), // 现有场景孔雀落位（湖西岸；另一只在寺前园）
  villageLandmark(VILLAGE_SITES[0], "village"), // mangshi-river-0001 河畔（现有基址）
  villageLandmark(VILLAGE_SITES[1], "village"), // mangshi-river-0002 坝心（现有基址）
  villageLandmark(VILLAGE_SITES[2], "village-site"), // 湖畔预留基址（引用 VILLAGE_SITES）
  villageLandmark(VILLAGE_SITES[6], "village-site"), // 坝田预留基址（引用 VILLAGE_SITES）
  Object.freeze({ id: "menghuan-gold-pagoda", name: "勐焕大金塔", position: pt(350, -160), kind: "pagoda", status: "planned" }), // 雷牙让山上，真实方位在坝东山巅；现有场景只有山体、无塔体
  Object.freeze({ id: "menghuan-silver-pagoda", name: "勐焕银塔", position: pt(330, 90), kind: "pagoda", status: "planned" }), // 与金塔对峰，金塔以南的山头
  Object.freeze({ id: "puti-temple", name: "菩提寺", position: pt(190, -140), kind: "temple", status: "planned" }), // 坝东雷牙让山麓
  Object.freeze({ id: "shubao-pagoda", name: "树包塔", position: pt(-36, 8), kind: "pagoda", status: "planned" }), // 芒市河东岸近坝心，地方图设计稿落位
  Object.freeze({ id: "mengbanaxi", name: "勐巴娜西珍奇园", position: pt(150, 150), kind: "garden", status: "planned" }), // 坝东南
  Object.freeze({ id: "sankeshu", name: "三棵树", position: pt(-48, 196), kind: "landmark", status: "planned" }), // 南入坝口标志，芒市大道南段旁
  Object.freeze({ id: "zhefang", name: "遮放", position: pt(-330, 425), kind: "district", status: "planned" }), // 西南走廊第一站（坝外片区落位，去瑞丽途中）
]);

// —— 全域小地图投影 ——
// 与村落版/瑞丽版同朝向定义：map.x 东为正，map.y 向下为正（+Z/南在下、-Z/北在上，指北向上）。
// 投影中心取 masterPlan 几何中心，scale = 0.5 地图单位/游戏单位（总图 1340×960 → 670×480 地图单位）。
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

// 点到主干路网（默认全部 ROADS，可传入子集如只算芒市大道）的最短距离。
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
  WORLD_ID, REGION_ID, TEMPLE_ID,
  REGION_BOUNDS, PLAYABLE_NOW, MASTER_PLAN,
  RIVERS, ROADS, LANDMARKS, VILLAGE_SITES, REGION_CAPACITY, PLOTS_PER_VILLAGE_INITIAL,
  MAP_PROJECTION,
  landmarkById, villageSiteById,
  pointInBounds, landmarksInBounds, villageSitesInBounds,
  distancePointToSegment, distanceToPolyline, distanceToRoad, distanceToRiver,
  worldToMap, mapToWorld,
};
