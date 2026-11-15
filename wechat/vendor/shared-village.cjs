"use strict";

// 安和里 · 瑞丽共享村落（M1 布局契约数据模块，v2 放大版）
// 纯数据 + 纯函数：无 DOM、无随机、无时间依赖。
// 坐标系：村落局部坐标 —— 原点为现有瑞丽场景（wechat/vendor/ruili-scene.cjs）
// 基址 site0「湖畔」的中心，坝内坐标 (-64, 66)；村落坐标轴与坝内坐标轴平行，
// 不旋转、不缩放：村落坐标 = 坝内坐标 - (-64, 66)。右手系、Y 向上、地面为 X/Z，
// 北为 -Z，yaw 为绕 +Y 的弧度（与 dam-world 的 face 约定一致：yaw = atan2(dx, dz)）。
// 本模块的数值是布局契约的唯一来源，docs/MUSE_M1_RUILI_VILLAGE_LAYOUT_20261115.md 从此处抄录。
// 这里的地块/村落 ID 均为场景侧建议名，最终以服务端目录（C1）为准。
//
// v2（2026-11-15 用户反馈「地图要大一点，我们做的是原始社会」）：
// 村落可走范围由矩形 90×120（面积 10800）放大为顺应水面的多边形（面积 22784，约 2.11 倍）；
// 样板地由 23×24（552）放大为 30×32（960）；正式给出 8 块地块位（2 样板 + 6 预留）；
// 公共空间放大（村心空地南北贯通、井/榕树保留半径 6 → 8）；
// 新增姐勒金塔祈福锚点（现有场景地标，此前未纳入锚点体系）。

const WORLD_ID = "dehong";
const REGION_ID = "ruili";
const VILLAGE_ID = "ruili-river-0001"; // 建议名，沿用交接文档 HomeProjection 样例
const TEMPLE_ID = "ruili-temple";

// 村落原点在坝内（ruili-scene spec）坐标中的位置：基址 site0 中心。
const ORIGIN_IN_DAM = Object.freeze({ x: -64, z: 66 });

// 村落可走范围（村落坐标，多边形，顶点按顺序绕行）。
// 形状顺应地形让出三处凹口：西侧弄莫湖（spec 水圆东沿坝内 -119、渲染沿 -117.5）、
// 东北系统集市圆盘与大厅一带、东南南宛河河道（渲染河道西沿随 z 收向村内）；
// 南界与瑞丽江水面（北沿村落 z≈94）之间留 6 以上余量；北界坝内 z=-24，
// 北侧丘陵碰撞圈（最近一处村落坐标 (-164,-36) r29.1）均在范围之外。
// 多边形面积 22784（鞋带公式，测试断言），为 v1 矩形范围（90×120=10800）的约 2.11 倍。
const BOUNDS_POLYGON = Object.freeze([
  Object.freeze({ x: -52, z: -90 }),  // 北界西段起（坝内 -116,-24）
  Object.freeze({ x: 48, z: -90 }),   // 北界东端
  Object.freeze({ x: 48, z: -28 }),   // 东界北段（集市圆盘在其东侧 z -75..-45，不入村）
  Object.freeze({ x: 62, z: -28 }),   // 河岸步道凸出段北端
  Object.freeze({ x: 62, z: 88 }),    // 东南角（南宛河渲染河道西沿在此 z 约 64，留 1.3 以上）
  Object.freeze({ x: -100, z: 88 }),  // 南界西端（瑞丽江水面北沿约 94）
  Object.freeze({ x: -100, z: 18 }),  // 湖岸南侧凸出段（弄莫湖渲染南沿 17.5 以南 0.5 起，spec 沿 16）
  Object.freeze({ x: -52, z: 18 }),   // 湖东凹口（湖 spec 东沿 -55、渲染东沿 -53.5，均在界外）
]);
// 包围盒（仅作粗筛与地图视窗参考，不作可走判定；判定用 BOUNDS_POLYGON + pointInPolygon）。
const BOUNDS = Object.freeze({ minX: -100, maxX: 62, minZ: -90, maxZ: 88 });

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
// 村心空地：南北贯通的公共长条（x -5..5），样板地与后续地块分列其东西两侧，
// 北起第 0 排北界、南抵第 2 排南界；出生圆台居其北段中央。任何地块不得侵入。
const VILLAGE_COMMONS = Object.freeze({ minX: -5, maxX: 5, minZ: -18, maxZ: 86 });
const COMMON_POINT = Object.freeze({
  id: "ruili-river-0001-common",
  kind: "well-banyan", // 井台 + 榕树
  position: Object.freeze({ x: -16, z: -28 }),
  radius: 8, // v2 由 6 放大为 8（井边空地）；到 A 地块北界距离 10，不压地块；到主路中心线 17.65，不压路
});

// 村外参照点（村落坐标表示，仅作小地图方向指示）
const HALL_POS = Object.freeze({ x: 37, z: -74 });     // 大厅亭，坝内 (-27,-8)；v2 北界扩至 -90 后位于村落北缘范围内，仍是宿主锚点保留点，不划地块
const CRYSTAL_POS = Object.freeze({ x: 70.5, z: -55.5 }); // 传送水晶现状，坝内 (6.5,10.5)，在村落范围之外，试玩快捷入口不在本契约改动

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

// —— 姐勒金塔（金塔祈福点）——
// 来源：现有瑞丽场景 ruili-scene.cjs decorate —— 金塔建在坝内 (152,-118) 的山丘上
// （丘体圆锥 r30 h15、塔身多层金顶），碰撞圈 {x:152, z:-118, r:16}；
// 换算村落坐标中心 (216,-184)。金塔在村落东北、坝内可达（坝界椭圆 rx250/rz205 内），
// 沿古道东行出村、再北上塔山可达；不在村落可走多边形内，本契约作坝内地标锚点管理。
// 塔门朝村落/古道一侧（西南侧）：入口锚点 = 塔中心 + 局部偏移 (-11, 9)（距中心约 14.2，在碰撞圈内缘）。
// 本契约只定锚点与动线；塔内场景建模属 M1 场景实现阶段，不 invent 现有代码不存在的室内结构。
const PAGODA = Object.freeze({
  id: "ruili-jiele-pagoda", // 场景侧建议名
  name: "姐勒金塔",
  center: Object.freeze({ x: 216, z: -184 }), // 村落坐标；坝内 (152,-118)
  hillRadius: 30,        // 塔山丘体半径（现有场景圆锥 r30）
  colliderRadius: 16,    // 现有场景碰撞圈 r16
  entry: Object.freeze({
    anchorId: "ruili-jiele-pagoda-entry",
    position: Object.freeze({ x: 205, z: -175 }), // 村落坐标；相对塔中心局部偏移 (-11, 9)，朝村落/古道一侧
    localOffset: Object.freeze({ x: -11, z: 9 }),
    radius: 4, // 入塔判定半径
  }),
  prayerSpot: Object.freeze({
    anchorId: "ruili-jiele-pagoda-prayer",
    localOffset: Object.freeze({ x: 0, z: 3.5 }), // 塔内佛前礼拜位（相对塔中心局部点，塔基台面范围内）
  }),
  circumambulationRadius: 9, // 绕塔环行路径半径（绕塔基一周）
});

// —— 地块（样板地 + 预留扩展槽）——
// 统一 30（x 向）× 32（z 向），面积 960。三排排布，全部在主路以南（路在北，户门朝北向路）：
// 第 0 排（中心 z=-2）：A、B 样板地分列村心空地东西两侧（中间 10 宽空地，出生圆台居中，地块不压圆台）；
// 第 1 排（中心 z=35）：C、D、E；第 2 排（中心 z=70）：F、G、H。
// 排间留 3–5 宽土巷，列间留 4–10 宽土径/空地。东侧不再排地块：东南是南宛河河道、
// 东北是集市与大厅，地块目录向西、向南展开（地形所迫，见布局文档 v2 修订节）。
// 场景 bounds 为相对地块原点（地块中心）的局部坐标，plotPolygon 转为村落坐标。
// 服务端 HomeProjection.bounds 已是村落坐标，不能再加地块 origin。
// layout 锚点仍为地块局部坐标，与未来 HomeProjection.house / beds / animals 对齐。
const PLOT_WIDTH = 30;
const PLOT_DEPTH = 32;

function makePlot(id, cx, cz) {
  return Object.freeze({
    id,
    villageId: VILLAGE_ID,
    origin: Object.freeze({ x: cx, z: cz }),
    yaw: 0,
    bounds: Object.freeze([
      Object.freeze({ x: -15, z: -16 }),
      Object.freeze({ x: 15, z: -16 }),
      Object.freeze({ x: 15, z: 16 }),
      Object.freeze({ x: -15, z: 16 }),
    ]),
    layout: Object.freeze({
      house: Object.freeze({
        kind: "hut", // 起步草棚，后续可升竹楼；kind 取值等服务端资产目录冻结
        position: Object.freeze({ x: -7.5, z: -8 }),
        yaw: Math.PI, // 门朝北（-Z）向主路：yaw = atan2(0, -1) = PI
      }),
      beds: Object.freeze([
        Object.freeze({ position: Object.freeze({ x: 4.2, z: -7 }), size: Object.freeze({ x: 4.4, z: 5.2 }) }),
        Object.freeze({ position: Object.freeze({ x: 9.4, z: -7 }), size: Object.freeze({ x: 4.4, z: 5.2 }) }),
        Object.freeze({ position: Object.freeze({ x: 4.2, z: -0.5 }), size: Object.freeze({ x: 4.4, z: 5.2 }) }),
        Object.freeze({ position: Object.freeze({ x: 9.4, z: -0.5 }), size: Object.freeze({ x: 4.4, z: 5.2 }) }),
      ]),
      animalZone: Object.freeze({
        center: Object.freeze({ x: -7.5, z: 6.5 }),
        radius: 6,
      }),
      gate: Object.freeze({ position: Object.freeze({ x: 0, z: -16 }) }), // 北边中点，朝主路
    }),
  });
}

// 样板地（M1 首批两户，村心第 0 排）
const SAMPLE_PLOTS = Object.freeze([
  makePlot("plot_ruili_river_0001_a", -20, -2),
  makePlot("plot_ruili_river_0001_b", 20, -2),
]);

// 预留扩展槽（村落目录预留位，启用顺序 = 数组顺序：先近路排、同排西→东，再向南逐排）
const EXPANSION_PLOTS = Object.freeze([
  makePlot("plot_ruili_river_0001_c", -54, 35), // 第 1 排西
  makePlot("plot_ruili_river_0001_d", -20, 35), // 第 1 排中西
  makePlot("plot_ruili_river_0001_e", 20, 35),  // 第 1 排中东
  makePlot("plot_ruili_river_0001_f", -54, 70), // 第 2 排西
  makePlot("plot_ruili_river_0001_g", -20, 70), // 第 2 排中西
  makePlot("plot_ruili_river_0001_h", 20, 70),  // 第 2 排中东
]);

// 村落全部地块位（样板 + 预留，共 8 块）
const ALL_PLOTS = Object.freeze([...SAMPLE_PLOTS, ...EXPANSION_PLOTS]);

// 村落扩展规则摘要（完整规则见布局文档）：地块统一 30×32；
// 排距：第 0→1 排中心距 37、第 1→2 排中心距 35（地深 32 + 土巷 5/3）；
// 列距：村心两侧列中心距 40（中间夹 10 宽村心空地），西列与中列中心距 34（土径 4）。
// 既有地块一经分配永不移动；本目录 8 块排满后扩新村（新 villageId），本村坐标不变。
const EXPANSION = Object.freeze({
  plotWidth: PLOT_WIDTH,
  plotDepth: PLOT_DEPTH,
  rowCentersZ: Object.freeze([-2, 35, 70]),
  columnCentersX: Object.freeze([-54, -20, 20]), // 第 0 排只有中两列（村心两侧），西列自第 1 排起
  enableOrder: Object.freeze(ALL_PLOTS.map(p => p.id)),
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

// 点是否在村落可走范围内（BOUNDS_POLYGON 判定）。
function pointInBounds(point) {
  return pointInPolygon(point, BOUNDS_POLYGON);
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

function pointOnSegment(point, a, b) {
  return orientation(a, b, point) === 0
    && point.x >= Math.min(a.x, b.x) && point.x <= Math.max(a.x, b.x)
    && point.z >= Math.min(a.z, b.z) && point.z <= Math.max(a.z, b.z);
}

function segmentsIntersect(p1, p2, p3, p4) {
  const d1 = orientation(p3, p4, p1), d2 = orientation(p3, p4, p2);
  const d3 = orientation(p1, p2, p3), d4 = orientation(p1, p2, p4);
  if (pointOnSegment(p1, p3, p4) || pointOnSegment(p2, p3, p4)
    || pointOnSegment(p3, p1, p2) || pointOnSegment(p4, p1, p2)) return true;
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

// 点到多边形的距离（点在多边形内为 0）。
function distancePointToPolygon(point, polygon) {
  if (pointInPolygon(point, polygon)) return 0;
  let min = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    min = Math.min(min, distancePointToSegment(point, polygon[i], polygon[(i + 1) % polygon.length]));
  }
  return min;
}

// 点（村落坐标）落在哪个地块内；不在任何地块返回 null。plots 可注入以便测试/扩展。
function plotAt(point, plots = ALL_PLOTS) {
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

// 地块区域（含内部，村落坐标）与道路中心线的最短距离。
function distancePolygonToRoad(polygon, roadPoints = ROAD_POINTS) {
  // 道路完全落在地块内时没有边界交点，也必须判作压路。
  if (roadPoints.length >= 2 && roadPoints.some(point => pointInPolygon(point, polygon))) return 0;
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
  ORIGIN_IN_DAM, BOUNDS, BOUNDS_POLYGON,
  ROAD_POINTS, ROAD_HALF_WIDTH, ROAD_CLEARANCE,
  WEST_JUNCTION, ROAD_APPROACH_WEST, EAST_GATE,
  MARKET, MARKET_SELL_POINT,
  REST_POINT, VILLAGE_COMMONS, COMMON_POINT, HALL_POS, CRYSTAL_POS,
  TEMPLE_ROUTE, TEMPLE_EXIT, PAGODA,
  PLOT_WIDTH, PLOT_DEPTH,
  SAMPLE_PLOTS, EXPANSION_PLOTS, ALL_PLOTS, EXPANSION, MAP_PROJECTION,
  toVillageCoords, toDamCoords,
  plotPolygon, polygonArea,
  pointInPolygon, pointInBounds, distancePointToSegment, distancePointToPolygon, segmentsDistance,
  plotAt, distanceToRoad, distancePolygonToRoad, isClearOfRoad,
  worldToMap, mapToWorld,
};
