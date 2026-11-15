"use strict";

// 安和里 · 瑞丽共享村落（M1 布局契约数据模块）
// 纯数据 + 纯函数：无 DOM、无随机、无时间依赖。
// 坐标系：村落局部坐标 —— 原点为现有瑞丽场景（wechat/vendor/ruili-scene.cjs）
// 基址 site0「湖畔」的中心，坝内坐标 (-64, 66)；村落坐标轴与坝内坐标轴平行，
// 不旋转、不缩放：村落坐标 = 坝内坐标 - (-64, 66)。右手系、Y 向上、地面为 X/Z，
// 北为 -Z，yaw 为绕 +Y 的弧度（与 dam-world 的 face 约定一致：yaw = atan2(dx, dz)）。
// 本模块的数值是布局契约的唯一来源，docs/MUSE_M1_RUILI_VILLAGE_LAYOUT_20261115.md 从此处抄录。
// 这里的地块/村落 ID 均为场景侧建议名，最终以服务端目录（C1）为准。

const WORLD_ID = "dehong";
const REGION_ID = "ruili";
const VILLAGE_ID = "ruili-river-0001"; // 建议名，沿用交接文档 HomeProjection 样例
const TEMPLE_ID = "ruili-temple";

// 村落原点在坝内（ruili-scene spec）坐标中的位置：基址 site0 中心。
const ORIGIN_IN_DAM = Object.freeze({ x: -64, z: 66 });

// 村落可走范围（村落坐标，矩形）。东界刻意停在集市空地圆盘（坝内中心 (0,6)、r15）
// 西沿之外，集市本体不划入村落；南界与瑞丽江水面（坝内 z≈160 起）之间留有余量；
// 西界停在弄莫湖水面（坝内 (-126,56) r7 等）东沿之外。
const BOUNDS = Object.freeze({ minX: -46, maxX: 44, minZ: -66, maxZ: 54 });

// —— 村路 ——
// 村内主路沿现有古道（ruili-scene decorate 的 roadPts）南段走行：
// 坝内 (-110,26) → (-40,12) 两点正落在村内，变换为村落坐标即下表前两点；
// 第三点为东门：古道段 (-40,12) → (0,6) 在坝内 x=-20 处的点（村落 x=44），
// 参数 t=0.5，坝内 (-20, 9)，村落坐标 (44, -57)。
const ROAD_POINTS = Object.freeze([
  Object.freeze({ x: -46, z: -40 }), // 西口/路口：古道既有折点（坝内 -110,26）
  Object.freeze({ x: 24, z: -54 }),  // 古道既有折点（坝内 -40,12）
  Object.freeze({ x: 44, z: -57 }),  // 东门（坝内 -20,9，古道段中点）
]);
const ROAD_HALF_WIDTH = 5;   // 道路走廊半宽（古道圆盘 r4.4 取整到 5）
const ROAD_CLEARANCE = 8;    // 地块边界到道路中心线的最小距离 = 半宽 5 + 余量 3

const WEST_JUNCTION = Object.freeze({ x: -46, z: -40 }); // 同 ROAD_POINTS[0]，向西接古道去弄岛方向
const ROAD_APPROACH_WEST = Object.freeze({ x: -126, z: -22 }); // 村外古道上一折点（坝内 -190,44）
const EAST_GATE = Object.freeze({ x: 44, z: -57 });      // 同 ROAD_POINTS[2]

// 系统集市（村外东侧，对齐现有场景）：空地圆盘中心坝内 (0,6)，卖货点 preview-discovery 的 MARKET_POS.ruili (2,18)。
const MARKET = Object.freeze({ x: 64, z: -60, radius: 15 });
const MARKET_SELL_POINT = Object.freeze({ x: 66, z: -48 });

// 公共点（村内，永久保留，不划入任何地块）
const REST_POINT = Object.freeze({ x: 0, z: 0 }); // 出生歇脚处 = 基址中心圆台（引擎在 site 中心生成 r3.2 石台）
const COMMON_POINT = Object.freeze({
  id: "ruili-river-0001-common",
  kind: "well-banyan", // 井台 + 榕树
  position: Object.freeze({ x: -16, z: -28 }),
  radius: 6,
});

// 村外参照点（村落坐标表示，仅作小地图方向指示，不在本村范围内）
const HALL_POS = Object.freeze({ x: 37, z: -74 });     // 大厅亭，坝内 (-27,-8)
const CRYSTAL_POS = Object.freeze({ x: 70.5, z: -55.5 }); // 传送水晶现状，坝内 (6.5,10.5)，试玩快捷入口不在本契约改动

// —— 寺院通路 ——
// 总佛寺（ruili-temple）不在现有瑞丽坝场景范围内，本村只交出口、方向与里程碑锚点。
const TEMPLE_ROUTE = Object.freeze([
  Object.freeze({ x: 44, z: -57 }),   // 东门（出口）
  Object.freeze({ x: 64, z: -60 }),   // 系统集市（坝内 0,6）
  Object.freeze({ x: 134, z: -50 }),  // 里程碑锚点：古道东段既有折点（坝内 70,16），由此出坝往总佛寺方向
]);
const TEMPLE_EXIT = Object.freeze({
  templeId: TEMPLE_ID,
  point: EAST_GATE,
  milestoneId: "ruili-river-0001-temple-milestone",
  milestone: Object.freeze({ x: 134, z: -50 }),
  // 下马/入院锚点在寺院场景内定义，本村不编造；命名规则先行约定如下（待 Codex 冻结）：
  dismountAnchorId: "ruili-temple-gate-dismount",
  entryAnchorId: "ruili-temple-gate-entry",
  knotAnchorIdPrefix: "ruili-temple-knot-", // 后接树/架编号，如 ruili-temple-knot-tree-01 / ruili-temple-knot-rack-01
});

// —— 样板地 ——
// 两块相邻样板地，位于村心、主路以南（路在北，户门朝北向路）。
// 地块 23 x 24（x 向 23、z 向 24），面积 552。两块之间是 8 宽的村心空地：
// 基址中心圆台（r3.2）居中，两侧各留约 2.4 通行带，地块边界不压圆台。
// bounds 为相对地块原点（地块中心）的局部坐标，与 HomeProjection.bounds 同构；
// layout 锚点同样为地块局部坐标，与 HomeProjection.house / beds / animals 对齐。
function makePlot(id, originX) {
  return Object.freeze({
    id,
    villageId: VILLAGE_ID,
    origin: Object.freeze({ x: originX, z: -4 }),
    yaw: 0,
    bounds: Object.freeze([
      Object.freeze({ x: -11.5, z: -12 }),
      Object.freeze({ x: 11.5, z: -12 }),
      Object.freeze({ x: 11.5, z: 12 }),
      Object.freeze({ x: -11.5, z: 12 }),
    ]),
    layout: Object.freeze({
      house: Object.freeze({
        kind: "hut", // 起步草棚，后续可升竹楼；kind 取值等服务端资产目录冻结
        position: Object.freeze({ x: -5.75, z: -6 }),
        yaw: Math.PI, // 门朝北（-Z）向主路：yaw = atan2(0, -1) = PI
      }),
      beds: Object.freeze([
        Object.freeze({ position: Object.freeze({ x: 3.4, z: -5.4 }), size: Object.freeze({ x: 3.6, z: 4.2 }) }),
        Object.freeze({ position: Object.freeze({ x: 7.6, z: -5.4 }), size: Object.freeze({ x: 3.6, z: 4.2 }) }),
        Object.freeze({ position: Object.freeze({ x: 3.4, z: -0.2 }), size: Object.freeze({ x: 3.6, z: 4.2 }) }),
        Object.freeze({ position: Object.freeze({ x: 7.6, z: -0.2 }), size: Object.freeze({ x: 3.6, z: 4.2 }) }),
      ]),
      animalZone: Object.freeze({
        center: Object.freeze({ x: -5.75, z: 5 }),
        radius: 5,
      }),
      gate: Object.freeze({ position: Object.freeze({ x: 0, z: -12 }) }), // 北边中点，朝主路
    }),
  });
}

const SAMPLE_PLOTS = Object.freeze([
  makePlot("plot_ruili_river_0001_a", -15.5),
  makePlot("plot_ruili_river_0001_b", 15.5),
]);

// 村落扩展网格（沿路新增地块的排布规则，详见布局文档）：
// 样板地所在为第 0 排；向南（+Z）逐排扩展，排距 27（地深 24 + 巷 3）；
// 同排向东/西逐列扩展，列距 26（地宽 23 + 径 3）；编号按排、列递增。
// 第 0 排两列中心距为 31（中间夹村心空地），其余相邻列按列距 26 排布。
const EXPANSION = Object.freeze({
  plotWidth: 23,
  plotDepth: 24,
  columnStep: 26,
  rowStep: 27,
  firstRowCenterZ: -4,
  firstColumnCentersX: Object.freeze([-15.5, 15.5]),
});

// —— 小地图投影 ——
// 地图平面坐标：以村心为中心，scale = 2 地图单位/游戏单位；
// map.x = (x - center.x) * scale（东为正），map.y = (z - center.z) * scale
//（屏幕向下为正，即 +Z/南朝下、-Z/北朝上，指北向上）。地图定位不触发传送。
const MAP_PROJECTION = Object.freeze({
  center: Object.freeze({ x: 0, z: 0 }),
  scale: 2,
});

// —— 纯函数 ——

function toVillageCoords(damPoint) {
  return { x: damPoint.x - ORIGIN_IN_DAM.x, z: damPoint.z - ORIGIN_IN_DAM.z };
}

function toDamCoords(villagePoint) {
  return { x: villagePoint.x + ORIGIN_IN_DAM.x, z: villagePoint.z + ORIGIN_IN_DAM.z };
}

// 地块在村落坐标中的多边形（bounds 局部坐标 + 地块原点）。
function plotPolygon(plot) {
  return plot.bounds.map(p => ({ x: p.x + plot.origin.x, z: p.z + plot.origin.z }));
}

function polygonArea(polygon) {
  let sum = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    sum += a.x * b.z - b.x * a.z;
  }
  return Math.abs(sum) / 2;
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.z > point.z) !== (b.z > point.z)
      && point.x < (b.x - a.x) * (point.z - a.z) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

function distancePointToSegment(point, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  let t = len2 === 0 ? 0 : ((point.x - a.x) * dx + (point.z - a.z) * dz) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(point.x - (a.x + dx * t), point.z - (a.z + dz * t));
}

function segmentsDistance(p1, p2, p3, p4) {
  // 端点到线段距离的最小值足够判定不相交线段间的最短距离（线段相交时由点在线段上覆盖为 0 的情形单独判）。
  if (segmentsIntersect(p1, p2, p3, p4)) return 0;
  return Math.min(
    distancePointToSegment(p1, p3, p4), distancePointToSegment(p2, p3, p4),
    distancePointToSegment(p3, p1, p2), distancePointToSegment(p4, p1, p2),
  );
}

function orientation(a, b, c) {
  return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
}

function segmentsIntersect(p1, p2, p3, p4) {
  const d1 = orientation(p3, p4, p1), d2 = orientation(p3, p4, p2);
  const d3 = orientation(p1, p2, p3), d4 = orientation(p1, p2, p4);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

// 点（村落坐标）落在哪个样板地内；不在任何地块返回 null。plots 可注入以便测试/扩展。
function plotAt(point, plots = SAMPLE_PLOTS) {
  for (const plot of plots) {
    if (pointInPolygon(point, plotPolygon(plot))) return plot;
  }
  return null;
}

// 点到村内主路折线的最短距离。
function distanceToRoad(point, roadPoints = ROAD_POINTS) {
  let min = Infinity;
  for (let i = 0; i < roadPoints.length - 1; i++) {
    min = Math.min(min, distancePointToSegment(point, roadPoints[i], roadPoints[i + 1]));
  }
  return min;
}

// 地块多边形（村落坐标）与道路中心线的最短距离（边对边）。
function distancePolygonToRoad(polygon, roadPoints = ROAD_POINTS) {
  let min = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    for (let j = 0; j < roadPoints.length - 1; j++) {
      min = Math.min(min, segmentsDistance(a, b, roadPoints[j], roadPoints[j + 1]));
    }
  }
  return min;
}

// 地块是否压路：多边形与道路中心线最短距离 >= clearance（默认 ROAD_CLEARANCE）。
function isClearOfRoad(polygon, clearance = ROAD_CLEARANCE, roadPoints = ROAD_POINTS) {
  return distancePolygonToRoad(polygon, roadPoints) >= clearance;
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
  WORLD_ID, REGION_ID, VILLAGE_ID, TEMPLE_ID,
  ORIGIN_IN_DAM, BOUNDS,
  ROAD_POINTS, ROAD_HALF_WIDTH, ROAD_CLEARANCE,
  WEST_JUNCTION, ROAD_APPROACH_WEST, EAST_GATE,
  MARKET, MARKET_SELL_POINT,
  REST_POINT, COMMON_POINT, HALL_POS, CRYSTAL_POS,
  TEMPLE_ROUTE, TEMPLE_EXIT,
  SAMPLE_PLOTS, EXPANSION, MAP_PROJECTION,
  toVillageCoords, toDamCoords,
  plotPolygon, polygonArea,
  pointInPolygon, distancePointToSegment, segmentsDistance,
  plotAt, distanceToRoad, distancePolygonToRoad, isClearOfRoad,
  worldToMap, mapToWorld,
};
