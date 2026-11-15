"use strict";

// 安和里 · 瑞丽全域大地图布局（坝区层总图契约，2026-11-15）
// 纯数据 + 纯函数：无 DOM、无随机、无时间依赖。
// 坐标系：坝内坐标 —— 与现有瑞丽场景 wechat/vendor/ruili-scene.cjs 的 spec 完全一致
//（右手系、Y 向上、地面 X/Z，北为 -Z、东为 +X，yaw = atan2(dx, dz)，单位为游戏单位）。
// 与村落坐标的互换经 shared-village.cjs 的平移（村落原点 = 坝内 (-64, 66)），不另设一套数。
// 两层口径：playableNow = 现有场景已覆盖范围（spec bounds 椭圆 rx250/rz205）；
// masterPlan = 全域总图规划范围（东西 1320 × 南北 950），现有锚点一律不挪位、范围只向外扩。
// status 说明：built = 现有场景已有实物/已定稿契约；planned = 总图规划落位，尚未建模。
// 本模块的数值是全域布局的唯一来源，docs/MUSE_RUILI_FULLMAP_LAYOUT_20261115.md 从此处抄录。
// 「大概位置」是设计落位（对齐真实瑞丽大概地理与地方图设计稿），不是测绘坐标。
// 这里的 region/village/landmark ID 均为场景侧建议名，最终以服务端目录（C1）为准。

const Village = require("./shared-village.cjs");

const WORLD_ID = "dehong";
const REGION_ID = "ruili";
const TEMPLE_ID = "ruili-temple"; // 总佛寺不在本坝内，仅经东线出口相连（见村落契约 §5）

// —— 全域范围（坝内坐标）——
const PLAYABLE_NOW = Object.freeze({
  minX: -250, maxX: 250, minZ: -205, maxZ: 205, // spec bounds 椭圆的包围盒
  ellipse: Object.freeze({ cx: 0, cz: 0, rx: 250, rz: 205 }), // ruili-scene spec.bounds 原值
});
const MASTER_PLAN = Object.freeze({
  minX: -640, maxX: 680, minZ: -480, maxZ: 470, // 东西 1320 × 南北 950
});
const REGION_BOUNDS = Object.freeze({ playableNow: PLAYABLE_NOW, masterPlan: MASTER_PLAN });

// —— 与村落坐标互换（平移，源头在 shared-village）——
function fromVillageCoords(villagePoint) { return Village.toDamCoords(villagePoint); }
function toVillageCoords(regionPoint) { return Village.toVillageCoords(regionPoint); }

// —— 水系（坝内坐标，折线按水流方向排列）——
// built 段点列逐字抄自 ruili-scene.cjs decorate 的 riverRun 调用与 spec waters，不许挪位。
const RIVERS = Object.freeze([
  Object.freeze({
    id: "ruili-river", name: "瑞丽江", // 南界大江，自东向西流，对岸为异域（世界南界）
    segments: Object.freeze([
      Object.freeze({ status: "planned", width: 14, points: Object.freeze([pt(660, 138), pt(420, 150), pt(248, 164)]) }), // 东延段
      Object.freeze({ status: "built", width: 14, points: Object.freeze([pt(248, 164), pt(160, 175), pt(50, 181), pt(-60, 182), pt(-160, 176), pt(-245, 168)]) }), // 现有 riverRun（原序西→东，此处按流向东→西）
      Object.freeze({ status: "planned", width: 14, points: Object.freeze([pt(-245, 168), pt(-420, 182), pt(-620, 196)]) }), // 西延出境段
    ]),
  }),
  Object.freeze({
    id: "nanwan-river", name: "南宛河", // 自北入境、绕坝东、向南汇入瑞丽江
    segments: Object.freeze([
      Object.freeze({ status: "planned", width: 6.5, points: Object.freeze([pt(120, -460), pt(88, -300), pt(58, -140)]) }), // 北延入境段
      Object.freeze({ status: "built", width: 6.5, points: Object.freeze([pt(58, -140), pt(42, -70), pt(27, -10), pt(16, 60), pt(9, 130), pt(4, 168)]) }), // 现有 riverRun，末点汇入瑞丽江水面
    ]),
  }),
  Object.freeze({
    id: "tuanjie-ditch", name: "团结大沟", // 弄莫湖向东南的排水渠（地方图设计稿有，现有场景未建）
    segments: Object.freeze([
      Object.freeze({ status: "planned", width: 3, points: Object.freeze([pt(-118, 80), pt(-78, 118), pt(-38, 146), pt(-2, 170)]) }), // 湖东南沿 → 汇入瑞丽江
    ]),
  }),
  Object.freeze({
    id: "moli-river", name: "莫里河", // 东线山溪，自莫里瀑布向南汇入瑞丽江（地方图设计稿有，现有场景未建）
    segments: Object.freeze([
      Object.freeze({ status: "planned", width: 4.5, points: Object.freeze([pt(430, -252), pt(436, -160), pt(428, -60), pt(420, 40), pt(414, 120), pt(410, 150)]) }),
    ]),
  }),
]);

function pt(x, z) { return Object.freeze({ x, z }); }

// —— 主干路网（坝内坐标）——
// 瑞丽大道 built 段逐字抄自 ruili-scene.cjs decorate 的 roadPts（古道）。
// 原始社会底色下它就是大道古道：土路、驿站、马帮走的这条线，数据命名保留用户定的「瑞丽大道」。
const ROADS = Object.freeze([
  Object.freeze({
    id: "ruili-avenue", name: "瑞丽大道（古道主干）", // 全域主轴：东西穿勐卯坝心、过集市
    halfWidth: 5,
    segments: Object.freeze([
      Object.freeze({ status: "planned", points: Object.freeze([pt(-600, 86), pt(-420, 64), pt(-190, 44)]) }), // 西延：坝心 → 弄岛方向
      Object.freeze({ status: "built", points: Object.freeze([pt(-190, 44), pt(-110, 26), pt(-40, 12), pt(0, 6), pt(70, 16), pt(140, 24), pt(200, 30)]) }), // 现有古道
      Object.freeze({ status: "planned", points: Object.freeze([pt(200, 30), pt(360, 44), pt(520, 58), pt(660, 72)]) }), // 东延：坝心 → 畹町方向
    ]),
    exits: Object.freeze([
      Object.freeze({ id: "nongdao-exit", point: pt(-600, 86), yaw: -1.449, toward: "弄岛 · 出境方向" }),
      Object.freeze({ id: "wanding-exit", point: pt(660, 72), yaw: 1.471, toward: "畹町 · 遮放 · 芒市方向" }),
    ]),
  }),
  Object.freeze({
    id: "east-trail", name: "东线古道", // 集市 → 姐勒金塔 → 独树成林 → 莫里，地标成串的游览线（现有场景未铺路，全线 planned）
    halfWidth: 4,
    segments: Object.freeze([
      Object.freeze({ status: "planned", points: Object.freeze([pt(0, 6), pt(60, -38), pt(110, -78), pt(146, -108)]) }), // 集市 → 金塔塔门外（接村落契约 PAGODA 入口）
      Object.freeze({ status: "planned", points: Object.freeze([pt(146, -108), pt(176, -52), pt(150, 6), pt(128, 26)]) }), // 金塔山麓 → 独树成林
      Object.freeze({ status: "planned", points: Object.freeze([pt(128, 26), pt(240, -40), pt(340, -140), pt(430, -260)]) }), // 独树成林 → 莫里瀑布
    ]),
    exits: Object.freeze([
      Object.freeze({ id: "moli-exit", point: pt(430, -260), yaw: 2.498, toward: "莫里山 · 雨林深处" }),
    ]),
  }),
  Object.freeze({
    id: "west-riverside", name: "西线江畔道", // 村落西门 → 弄莫湖 → 喊沙 → 一寨两国 → 大等喊 → 弄岛（现有场景未铺路，全线 planned）
    halfWidth: 4,
    segments: Object.freeze([
      Object.freeze({ status: "planned", points: Object.freeze([pt(-100, 74), pt(-118, 84), pt(-190, 104), pt(-280, 118), pt(-380, 132), pt(-470, 140), pt(-560, 150)]) }),
    ]),
    exits: Object.freeze([
      Object.freeze({ id: "nongdao-river-exit", point: pt(-560, 150), yaw: -1.460, toward: "弄岛 · 江出境处" }),
    ]),
  }),
  Object.freeze({
    id: "jie-gao-road", name: "姐告道", // 集市南下 → 瑞丽渡口（竹筏）→ 过江 → 姐告（对岸飞地）
    halfWidth: 4,
    segments: Object.freeze([
      Object.freeze({ status: "planned", points: Object.freeze([pt(0, 6), pt(4, 80), pt(8, 152), pt(12, 196), pt(16, 246)]) }), // (8,152) 为现有场景渡口竹筏落位；(12,196)→(16,246) 为过江段（藤桥/古渡）
    ]),
    exits: Object.freeze([
      Object.freeze({ id: "jie-gao-exit", point: pt(16, 246), yaw: 0.080, toward: "姐告 · 江对岸" }),
    ]),
  }),
  Object.freeze({
    id: "north-road", name: "北线古道", // 大厅北上、沿南宛河西岸谷地 → 陇川方向出口
    halfWidth: 4,
    segments: Object.freeze([
      Object.freeze({ status: "planned", points: Object.freeze([pt(0, 6), pt(-6, -80), pt(2, -190), pt(16, -310), pt(30, -460)]) }),
    ]),
    exits: Object.freeze([
      Object.freeze({ id: "longchuan-exit", point: pt(30, -460), yaw: 3.049, toward: "陇川 · 章凤方向" }),
    ]),
  }),
]);

// —— 村落基址（安家容量体系）——
// 每村首期 8 块（与村落契约的定稿排布同口径），上限按平均占地估算：
// 地块 30×32=960，连同土巷、土径、公共保留与地形损耗，平均每户占地约 1700–2200；
// 单村可安家地带约 7–10 万单位 → 上限 32–48 块（逐村按地形给值，坝田最开阔给 48、河谷最窄给 32）。
// 基址落位规则：不压水（离现有水面与河道留岸线余量）、不压主干路（中心到瑞丽大道 ≥ 8 的契约余量外加村域展开空间）、
// 不压地标本体、彼此间距 ≥ 60。status：built = 村落已按契约定稿（0001）；planned = 总图预留基址。
const PLOTS_PER_VILLAGE_INITIAL = 8;
const VILLAGE_SITES = Object.freeze([
  Object.freeze({ id: "ruili-river-0001", name: "湖畔", position: pt(-64, 66), status: "built", plotsInitial: 8, plotsCapacity: 40, note: "现有村落（M1 定稿）：基址 site0，村落契约已定 8 块坐标" }),
  Object.freeze({ id: "ruili-river-0002", name: "塔下", position: pt(66, -52), status: "planned", plotsInitial: 8, plotsCapacity: 40, note: "基址已建于现有场景（spec sites[1]），村落未开" }),
  Object.freeze({ id: "ruili-river-0003", name: "湖南", position: pt(-210, 130), status: "planned", plotsInitial: 8, plotsCapacity: 36, note: "弄莫湖南岸草地，西线江畔道旁" }),
  Object.freeze({ id: "ruili-river-0004", name: "江畔", position: pt(-336, 92), status: "planned", plotsInitial: 8, plotsCapacity: 40, note: "瑞丽江北岸、西线江畔道南侧" }),
  Object.freeze({ id: "ruili-river-0005", name: "弄岛江畔", position: pt(-500, 108), status: "planned", plotsInitial: 8, plotsCapacity: 40, note: "全域西端，近弄岛出口" }),
  Object.freeze({ id: "ruili-river-0006", name: "河谷", position: pt(-48, -140), status: "planned", plotsInitial: 8, plotsCapacity: 32, note: "南宛河西岸谷地，北线古道旁，谷地较窄" }),
  Object.freeze({ id: "ruili-river-0007", name: "上河谷", position: pt(120, -300), status: "planned", plotsInitial: 8, plotsCapacity: 32, note: "南宛河上游东岸，北线入境段" }),
  Object.freeze({ id: "ruili-river-0008", name: "坝田", position: pt(300, 60), status: "planned", plotsInitial: 8, plotsCapacity: 48, note: "东部坝田最开阔，瑞丽大道南侧" }),
  Object.freeze({ id: "ruili-river-0009", name: "塔麓", position: pt(196, -72), status: "planned", plotsInitial: 8, plotsCapacity: 36, note: "姐勒金塔山麓，东线古道旁" }),
  Object.freeze({ id: "ruili-river-0010", name: "莫里山麓", position: pt(300, -190), status: "planned", plotsInitial: 8, plotsCapacity: 36, note: "莫里雨林缘，东线古道旁" }),
  Object.freeze({ id: "ruili-river-0011", name: "芒令", position: pt(190, 92), status: "planned", plotsInitial: 8, plotsCapacity: 40, note: "独树成林东南、瑞丽大道与江之间" }),
]);

// 瑞丽一区容量账（由 VILLAGE_SITES 求和，文档抄录这两个数，不另算一份）
const REGION_CAPACITY = Object.freeze({
  villageSites: VILLAGE_SITES.length,
  plotsInitial: VILLAGE_SITES.reduce((s, v) => s + v.plotsInitial, 0),
  plotsCapacity: VILLAGE_SITES.reduce((s, v) => s + v.plotsCapacity, 0),
});

// —— 地标表（坝内坐标）——
// built 的落位全部来自现有场景 spec/decorate 或已定稿的村落契约；planned 按真实瑞丽大概地理与地方图设计稿落位。
// 村落类地标不另抄坐标：直接引用 VILLAGE_SITES 的对象位置（同一份数，改一处即全改）。
function villageLandmark(site, kind) {
  return Object.freeze({ id: site.id, name: `瑞丽村落 · ${site.name}`, position: site.position, kind, status: site.status });
}
const LANDMARKS = Object.freeze([
  Object.freeze({ id: "ruili-market", name: "系统集市", position: pt(0, 6), kind: "market", status: "built" }),
  Object.freeze({ id: "ruili-hall", name: "大厅", position: pt(-27, -8), kind: "hall", status: "built" }),
  Object.freeze({ id: "ruili-crystal", name: "传送水晶", position: pt(6.5, 10.5), kind: "crystal", status: "built" }),
  Object.freeze({ id: "ruili-jiele-pagoda", name: "姐勒金塔", position: fromVillageCoords(Village.PAGODA.center), kind: "pagoda", status: "built" }), // 村落契约 PAGODA 换算回坝内 = (152,-118)
  Object.freeze({ id: "nongmo-lake", name: "弄莫湖", position: pt(-144, 60), kind: "lake", status: "built" }), // 现有场景湖面水圆群中心
  Object.freeze({ id: "ruili-banyan", name: "独树成林", position: pt(128, 26), kind: "tree", status: "built" }),
  Object.freeze({ id: "ruili-ferry", name: "瑞丽渡口（竹筏）", position: pt(8, 152), kind: "ferry", status: "built" }), // 现有场景江边竹筏落位
  Object.freeze({ id: "rainforest-falls", name: "雨林瀑布（现状景）", position: pt(-158, -118), kind: "waterfall", status: "built" }), // 现有场景西北瀑布景，场景注释称莫里；总图按真实方位把莫里落到城东，此处如实另标，见布局文档 §9
  villageLandmark(VILLAGE_SITES[0], "village"), // ruili-river-0001 湖畔
  villageLandmark(VILLAGE_SITES[1], "village-site"), // 塔下预留基址（引用 VILLAGE_SITES）
  villageLandmark(VILLAGE_SITES[3], "village-site"), // 江畔预留基址（引用 VILLAGE_SITES）
  Object.freeze({ id: "jie-gao", name: "姐告", position: pt(16, 246), kind: "district", status: "planned" }), // 瑞丽江南岸对岸片区中心：古渡 + 玉城早市意象
  Object.freeze({ id: "jie-gao-crossing", name: "姐告桥 · 古渡", position: pt(12, 196), kind: "crossing", status: "planned" }), // 过江点（藤桥/古渡），在瑞丽江南岸一侧水面
  Object.freeze({ id: "moli-falls", name: "莫里瀑布", position: pt(430, -260), kind: "waterfall", status: "planned" }), // 真实方位在城东莫里山，按地方图设计稿落位
  Object.freeze({ id: "moli-hotspring", name: "莫里温泉", position: pt(452, -238), kind: "hotspring", status: "planned" }),
  Object.freeze({ id: "wanding-bridge", name: "畹町桥", position: pt(640, 64), kind: "bridge", status: "planned" }), // 东出口，瑞丽大道尽头
  Object.freeze({ id: "hansha", name: "喊沙", position: pt(-280, 118), kind: "village-site", status: "planned" }), // 西线江畔道旁寨子（奘房）
  Object.freeze({ id: "yizhai-liangguo", name: "一寨两国", position: pt(-380, 132), kind: "landmark", status: "planned" }),
  Object.freeze({ id: "dadenghan", name: "大等喊", position: pt(-470, 140), kind: "village-site", status: "planned" }),
  Object.freeze({ id: "nongdao", name: "弄岛", position: pt(-560, 150), kind: "exit", status: "planned" }), // 西出口
  Object.freeze({ id: "tuanjie-ditch", name: "团结大沟", position: pt(-78, 118), kind: "waterway", status: "planned" }), // 与 RIVERS 同名水系的中点标位
]);

// —— 全域小地图投影 ——
// 与村落版同朝向定义：map.x 东为正，map.y 向下为正（+Z/南在下、-Z/北在上，指北向上）。
// 投影中心取 masterPlan 几何中心，scale = 0.5 地图单位/游戏单位（总图 1320×950 → 660×475 地图单位）。
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

// 点到主干路网（默认全部 ROADS，可传入子集如只算瑞丽大道）的最短距离。
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
  fromVillageCoords, toVillageCoords,
  landmarkById, villageSiteById,
  pointInBounds, landmarksInBounds, villageSitesInBounds,
  distancePointToSegment, distanceToPolyline, distanceToRoad, distanceToRiver,
  worldToMap, mapToWorld,
};
