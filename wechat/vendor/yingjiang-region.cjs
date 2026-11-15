"use strict";

// 安和里 · 盈江全域大地图布局（坝区层总图契约，2026-11-15）
// 纯数据 + 纯函数：无 DOM、无随机、无时间依赖。
// 坐标系：坝内坐标 —— 与现有盈江场景 wechat/vendor/yingjiang-scene.cjs 的 spec 完全一致
//（右手系、Y 向上、地面 X/Z，北为 -Z、东为 +X，yaw = atan2(dx, dz)，单位为游戏单位）。
// 两层口径：playableNow = 现有场景已覆盖范围（spec bounds 椭圆 rx255/rz210）；
// masterPlan = 全域总图规划范围（东西 1320 × 南北 980），现有锚点一律不挪位、范围只向外扩。
// status 说明：built = 现有场景已有实物；planned = 总图规划落位，尚未建模。
// 本模块的数值是本区全域布局的唯一来源，docs/MUSE_YINGJIANG_FULLMAP_LAYOUT_20261115.md 从此处抄录。
// 「大概位置」是设计落位（对齐真实盈江大概地理与 2026-11-13 盈江地方图设计稿），不是测绘坐标。
// 这里的 region/village/landmark ID 均为场景侧建议名，最终以服务端目录（C1）为准。

const WORLD_ID = "dehong";
const REGION_ID = "yingjiang";

// —— 全域范围（坝内坐标）——
const PLAYABLE_NOW = Object.freeze({
  minX: -255, maxX: 255, minZ: -210, maxZ: 210, // spec bounds 椭圆的包围盒
  ellipse: Object.freeze({ cx: 0, cz: 0, rx: 255, rz: 210 }), // yingjiang-scene spec.bounds 原值
});
const MASTER_PLAN = Object.freeze({
  minX: -660, maxX: 660, minZ: -490, maxZ: 490, // 东西 1320 × 南北 980
});
const REGION_BOUNDS = Object.freeze({ playableNow: PLAYABLE_NOW, masterPlan: MASTER_PLAN });

function pt(x, z) { return Object.freeze({ x, z }); }

// —— 水系（坝内坐标，折线按水流方向排列）——
// built 段点列逐字抄自 yingjiang-scene.cjs decorate 的 riverRun 调用与 spec waters，不许挪位。
// 水乡格局：槟榔江（西北）与南底河（东北）在坝北旧城一带汇成大盈江，大盈江纵贯坝心向南出境；
// 凯邦亚湖是坝西南高山上的水库（户宋河水库，湖面本体见地标表），户宋河自南入湖。
const RIVERS = Object.freeze([
  Object.freeze({
    id: "binlang-river", name: "槟榔江", // 西北来水，向东南汇入大盈江
    segments: Object.freeze([
      Object.freeze({ status: "planned", width: 8, points: Object.freeze([pt(-190, -470), pt(-156, -340), pt(-120, -210)]) }), // 北延入境段
      Object.freeze({ status: "built", width: 8, points: Object.freeze([pt(-120, -210), pt(-70, -150), pt(-34, -105)]) }), // 现有 riverRun，末点即大盈江起点
    ]),
  }),
  Object.freeze({
    id: "nandi-river", name: "南底河", // 东北来水，向西南在旧城一带汇入大盈江
    segments: Object.freeze([
      Object.freeze({ status: "planned", width: 8, points: Object.freeze([pt(190, -470), pt(152, -330), pt(110, -205)]) }), // 北延入境段
      Object.freeze({ status: "built", width: 8, points: Object.freeze([pt(110, -205), pt(62, -152), pt(26, -108)]) }), // 现有 riverRun，末点抵旧城汇流带
    ]),
  }),
  Object.freeze({
    id: "daying-river", name: "大盈江", // 全州大江：旧城汇流后纵贯坝心、过平原镇南下出境（去芒允）
    segments: Object.freeze([
      Object.freeze({ status: "built", width: 12.5, points: Object.freeze([pt(-34, -105), pt(-6, -52), pt(4, 10), pt(-4, 80), pt(-16, 150), pt(-24, 215)]) }), // 现有 riverRun
      Object.freeze({ status: "planned", width: 12.5, points: Object.freeze([pt(-24, 215), pt(-34, 330), pt(-40, 470)]) }), // 南延出境段
    ]),
  }),
  Object.freeze({
    id: "husong-river", name: "户宋河", // 西南山河，自南向北注入凯邦亚湖（现有场景未建）
    segments: Object.freeze([
      Object.freeze({ status: "planned", width: 5, points: Object.freeze([pt(-150, 472), pt(-164, 340), pt(-168, 168)]) }), // 末点抵湖面南缘
    ]),
  }),
]);

// —— 主干路网（坝内坐标）——
// 坝心大道 built 段逐字抄自 yingjiang-scene.cjs decorate 的 roadPts（古道）：沿大盈江西岸纵贯坝心、过平原集市。
// 原始社会底色下它就是大道古道：土路、驿站、行人走的这条线。
const ROADS = Object.freeze([
  Object.freeze({
    id: "daying-avenue", name: "坝心大道（古道主干）", // 全域主轴：南北纵贯坝心、过平原集市与大厅
    halfWidth: 5,
    segments: Object.freeze([
      Object.freeze({ status: "planned", points: Object.freeze([pt(-120, -452), pt(-64, -300), pt(-30, -190), pt(-6, -104)]) }), // 北延：坝心 → 旧城北谷口 → 昔马/腾冲方向
      Object.freeze({ status: "built", points: Object.freeze([pt(-6, -104), pt(-12, -52), pt(-16, -8), pt(-14, 50), pt(-18, 120), pt(-24, 200)]) }), // 现有古道
      Object.freeze({ status: "planned", points: Object.freeze([pt(-24, 200), pt(-70, 300), pt(-140, 390), pt(-228, 462)]) }), // 南延：坝心 → 铜壁关 → 陇川方向
    ]),
    exits: Object.freeze([
      Object.freeze({ id: "tengchong-exit", point: pt(-120, -452), yaw: -2.788, toward: "昔马 · 腾冲方向" }),
      Object.freeze({ id: "tongbiguan-exit", point: pt(-228, 462), yaw: -0.885, toward: "铜壁关 · 陇川 · 瑞丽方向" }),
    ]),
  }),
  Object.freeze({
    id: "east-road", name: "东线古道", // 集市 → 允燕塔下 → 东北出坝去梁河（现有场景未铺路，全线 planned）
    halfWidth: 4,
    segments: Object.freeze([
      Object.freeze({ status: "planned", points: Object.freeze([pt(-16, -8), pt(40, -60), pt(110, -52), pt(190, -95), pt(300, -160), pt(470, -240), pt(640, -300)]) }),
    ]),
    exits: Object.freeze([
      Object.freeze({ id: "lianghe-exit", point: pt(640, -300), yaw: 1.910, toward: "梁河 · 芒市方向" }),
    ]),
  }),
  Object.freeze({
    id: "west-road", name: "西线古道", // 集市 → 榕树王 → 西出那邦方向（现有场景未铺路，全线 planned）
    halfWidth: 4,
    segments: Object.freeze([
      Object.freeze({ status: "planned", points: Object.freeze([pt(-16, -8), pt(-90, -30), pt(-128, -88), pt(-230, -40), pt(-360, 30), pt(-500, 90), pt(-636, 140)]) }),
    ]),
    exits: Object.freeze([
      Object.freeze({ id: "nabang-exit", point: pt(-636, 140), yaw: -1.924, toward: "那邦 · 边境方向" }),
    ]),
  }),
  Object.freeze({
    id: "lake-road", name: "湖畔道", // 集市西南出 → 凯邦亚湖东岸（现有场景未铺路，全线 planned，无出口、止于湖畔）
    halfWidth: 4,
    segments: Object.freeze([
      Object.freeze({ status: "planned", points: Object.freeze([pt(-16, -8), pt(-60, 60), pt(-110, 110), pt(-140, 140)]) }),
    ]),
    exits: Object.freeze([]),
  }),
]);

// —— 村落基址（安家容量体系）——
// 每村首期 8 块（与瑞丽村落契约的定稿排布同口径），上限按平均占地估算：
// 地块 30×32=960，连同土巷、土径、公共保留与地形损耗，平均每户占地约 1700–2200；
// 单村可安家地带约 7–10 万单位 → 上限 32–48 块（逐村按地形给值，坝田最开阔给 48、河谷/山麓最窄给 32）。
// 基址落位规则：不压水（离现有水面与河道留岸线余量）、不压主干路（中心到坝心大道 ≥ 8 的契约余量外加村域展开空间）、
// 不压地标本体、彼此间距 ≥ 60。status：built = 现有场景基址且为本区首村（0001）；planned = 总图预留基址。
const PLOTS_PER_VILLAGE_INITIAL = 8;
const VILLAGE_SITES = Object.freeze([
  Object.freeze({ id: "yingjiang-river-0001", name: "江西", position: pt(-72, 30), status: "built", plotsInitial: 8, plotsCapacity: 40, note: "现有基址（spec sites[0]），大盈江西岸、平原镇旁" }),
  Object.freeze({ id: "yingjiang-river-0002", name: "江东", position: pt(58, 66), status: "planned", plotsInitial: 8, plotsCapacity: 40, note: "基址已建于现有场景（spec sites[1]），村落未开；大盈江东岸、水车下游" }),
  Object.freeze({ id: "yingjiang-river-0003", name: "湖南", position: pt(-95, 205), status: "planned", plotsInitial: 8, plotsCapacity: 36, note: "凯邦亚湖东南山麓，湖畔道方向" }),
  Object.freeze({ id: "yingjiang-river-0004", name: "江北", position: pt(95, -120), status: "planned", plotsInitial: 8, plotsCapacity: 36, note: "南底河南岸、旧城以东的江北地带，东线古道旁" }),
  Object.freeze({ id: "yingjiang-river-0005", name: "旧城北", position: pt(-95, -150), status: "planned", plotsInitial: 8, plotsCapacity: 32, note: "槟榔江东岸、旧城汇流带以北，谷口较窄" }),
  Object.freeze({ id: "yingjiang-river-0006", name: "东坝田", position: pt(185, 40), status: "planned", plotsInitial: 8, plotsCapacity: 48, note: "坝东田畴最开阔，允燕山以南" }),
  Object.freeze({ id: "yingjiang-river-0007", name: "南坝田", position: pt(60, 190), status: "planned", plotsInitial: 8, plotsCapacity: 48, note: "坝南田畴开阔，大盈江东岸" }),
  Object.freeze({ id: "yingjiang-river-0008", name: "江南", position: pt(-110, 300), status: "planned", plotsInitial: 8, plotsCapacity: 40, note: "大盈江西岸坝南，去铜壁关的路上" }),
  Object.freeze({ id: "yingjiang-river-0009", name: "湖西山麓", position: pt(-265, 205), status: "planned", plotsInitial: 8, plotsCapacity: 32, note: "凯邦亚湖以西的林缘山麓，安静" }),
  Object.freeze({ id: "yingjiang-river-0010", name: "北谷", position: pt(10, -320), status: "planned", plotsInitial: 8, plotsCapacity: 36, note: "坝北两江之间的谷地，北延古道旁" }),
  Object.freeze({ id: "yingjiang-river-0011", name: "东南林缘", position: pt(300, 180), status: "planned", plotsInitial: 8, plotsCapacity: 36, note: "坝东南林缘，田畴与山林之间" }),
]);

// 盈江一区容量账（由 VILLAGE_SITES 求和，文档抄录这两个数，不另算一份）
const REGION_CAPACITY = Object.freeze({
  villageSites: VILLAGE_SITES.length,
  plotsInitial: VILLAGE_SITES.reduce((s, v) => s + v.plotsInitial, 0),
  plotsCapacity: VILLAGE_SITES.reduce((s, v) => s + v.plotsCapacity, 0),
});

// —— 地标表（坝内坐标）——
// built 的落位全部来自现有场景 spec/decorate；planned 按真实盈江大概地理与地方图设计稿落位。
// 村落类地标不另抄坐标：直接引用 VILLAGE_SITES 的对象位置（同一份数，改一处即全改）。
function villageLandmark(site, kind) {
  return Object.freeze({ id: site.id, name: `盈江村落 · ${site.name}`, position: site.position, kind, status: site.status });
}
const LANDMARKS = Object.freeze([
  Object.freeze({ id: "yingjiang-market", name: "平原集市", position: pt(-16, -8), kind: "market", status: "built" }),
  Object.freeze({ id: "yingjiang-hall", name: "平原大厅", position: pt(-40, 6), kind: "hall", status: "built" }), // spec hallPos，章凤式大厅落在平原镇中心
  Object.freeze({ id: "yingjiang-crystal", name: "传送水晶", position: pt(-9.5, -3.5), kind: "crystal", status: "built" }), // spec crystalPos，集市旁
  Object.freeze({ id: "yingjiang-waterwheel", name: "江畔水车", position: pt(15.5, 30), kind: "waterwheel", status: "built" }), // 现有场景江畔水车落位，慢慢转
  Object.freeze({ id: "yingjiang-yunyan-pagoda", name: "允燕塔", position: pt(96, -30), kind: "pagoda", status: "built" }), // 城东允燕山上，现有场景已建
  Object.freeze({ id: "yingjiang-banyan-king", name: "榕树王", position: pt(-128, -88), kind: "tree", status: "built" }), // 现有场景落位在坝西北（与设计稿方位有出入，见布局文档 §9）
  Object.freeze({ id: "yingjiang-kaibangya-lake", name: "凯邦亚湖", position: pt(-168, 148), kind: "lake", status: "built" }), // 现有场景已建：西南高山水库湖面（spec waters 末项 r15，丘顶湖面）
  Object.freeze({ id: "yingjiang-hujiaoshi", name: "虎跳石", position: pt(0, 50), kind: "rock", status: "built" }), // 现有场景江心石群中心（四块江心石的质心）
  villageLandmark(VILLAGE_SITES[0], "village"), // yingjiang-river-0001 江西
  villageLandmark(VILLAGE_SITES[1], "village-site"), // 江东预留基址（引用 VILLAGE_SITES）
  villageLandmark(VILLAGE_SITES[3], "village-site"), // 江北预留基址（引用 VILLAGE_SITES）
  Object.freeze({ id: "tongbiguan", name: "铜壁关", position: pt(-215, 448), kind: "pass", status: "planned" }), // 南方丝路古关，坝心大道南延出口内侧；关外即陇川方向
  Object.freeze({ id: "yingjiang-ferry", name: "大盈江渡口（竹筏）", position: pt(-12, 96), kind: "ferry", status: "planned" }), // 设计稿渡口在平原镇以南江面，总图落位
  Object.freeze({ id: "jiucheng", name: "旧城 · 两江交汇", position: pt(-8, -92), kind: "confluence", status: "planned" }), // 槟榔江与南底河汇成大盈江处，现有场景只有水面、无旧城本体
  Object.freeze({ id: "shimowadi", name: "诗蜜娃底", position: pt(-430, -330), kind: "landmark", status: "planned" }), // 设计稿在坝西北边境，总图落位
  Object.freeze({ id: "fengweizhu", name: "凤尾竹堤 · 江心绿岛", position: pt(-18, 326), kind: "landmark", status: "planned" }), // 设计稿在大盈江下游，总图落位
]);

// —— 全域小地图投影 ——
// 与瑞丽版同朝向定义：map.x 东为正，map.y 向下为正（+Z/南在下、-Z/北在上，指北向上）。
// 投影中心取 masterPlan 几何中心，scale = 0.5 地图单位/游戏单位（总图 1320×980 → 660×490 地图单位）。
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

// 点到主干路网（默认全部 ROADS，可传入子集如只算坝心大道）的最短距离。
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
