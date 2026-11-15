"use strict";

// —— 地价分档（用户 2026-11-15 拍板的新规则，全游戏唯一价格表）——
// 每座城以其传送水晶为锚点：地块中心距水晶的直线距离（坝内单位）决定档位与价格，
// 主城区内最贵，城区外离水晶越远越便宜。固定基址地块与自选地共用本表计价；
// 控制器、状态层与测试都只能调用下面的纯函数取价，不许别处再写一份价格表。
// C2 服务端接管时必须按 plotId/坐标用同一张表算价，客户端只展示（见
// docs/MUSE_LAND_PRICE_BANDS_20261115.md）。已认领的家不因本表变化补差价或退款。
const LAND_BANDS = Object.freeze([
  Object.freeze({ key: "core", name: "主城区", label: "主城区", maxDistance: 60, price: 600 }),
  Object.freeze({ key: "near", name: "近郊", label: "近郊地", maxDistance: 150, price: 400 }),
  Object.freeze({ key: "far", name: "远郊", label: "远郊地", maxDistance: 260, price: 250 }),
  Object.freeze({ key: "edge", name: "边地", label: "边地", maxDistance: Infinity, price: 150 }),
]);

// 距离 → 档位。距离无效（非有限数/负数）返回 null，调用方须先校验坐标。
function landBandForDistance(distance) {
  if (typeof distance !== "number" || !Number.isFinite(distance) || distance < 0) return null;
  return LAND_BANDS.find(band => distance <= band.maxDistance) || null;
}

// 距离 → 价格（安币）。距离无效返回 null。
function landPriceForDistance(distance) {
  const band = landBandForDistance(distance);
  return band ? band.price : null;
}

// 锚点 + 坐标 → 报价 { distance, band, name, label, price }。坐标或锚点无效返回 null。
function landQuote(anchor, x, z) {
  if (!anchor || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.z)
    || !Number.isFinite(x) || !Number.isFinite(z)) return null;
  const distance = Math.hypot(x - anchor.x, z - anchor.z);
  const band = landBandForDistance(distance);
  if (!band) return null;
  return { distance, band: band.key, name: band.name, label: band.label, price: band.price };
}

// 标准地价 = 近郊档价格：瑞丽契约样板地 A/B 距水晶约 105/74，正在此档；
// 状态层在不知道地块坐标时（旧调用路径）以此为默认，控制器接线后恒传真实坐标。
const STANDARD_PLOT_PRICE = LAND_BANDS.find(band => band.key === "near").price;

// —— 开放式安家与玩家修路（用户 2026-11-15 拍板；规则口径 21:29 修订：少规则）——
// 设计原则：留足可玩性与开放性，只拦物理上不可能与侵犯他人之地的事，其余全开放。
// 以道路为标尺沿路安家：自选地必须通路（地块边缘到路网 ≤ ACCESS_RANGE）；
// 没路的地方玩家自费修路（只按长度计价，COST_PER_UNIT 安币/单位），一建成即计入路网、
// 周边随即开放安家——孤立路段也行，村落可以先自己长出来，以后再和主网连上。
// 修路只剩三条硬性：不压已划地块、不压地标建筑本体、余额够（校验在 dam-world 与状态层）。
// 过水就搭一段木栈道（同价）、贴山脚、任意长度、不用先接主网，全部放行。
// 路网 = 场景自带古道 + 村落内部土路 + 玩家自建路（存档 state.roads 按坝记名保存）。
// 修好的路是公共的：任何人路过、沿它安家都不再收费；修路不产生路边土地的任何权利，
// 地仍按 LAND_BANDS 先到先得认领——修路是基建，不是圈地（见 docs/MUSE_OPEN_SETTLEMENT_ROADS_20261115.md）。
const ROADS = Object.freeze({
  ACCESS_RANGE: 30,       // 自选地块边缘到路网（路面边缘）的最大距离：超过即「还没通路」
  COST_PER_UNIT: 2,       // 修路单价（安币/坝内单位）——费用只留这一个数，无最低消费
  SAMPLE_STEP: 2,         // 修路整段校验的采样步长（坝内单位/点）
  HALF_WIDTH: 5,          // 既有道路走廊半宽（与 shared-village.cjs 的 ROAD_HALF_WIDTH 同值）
  STRIP_HALF_WIDTH: 1.5,  // 玩家自建土路的条带半宽（整条宽约 3）
  PLOT_REACH: 7.7,        // 自选地 footprint 最坏半径（dam-world checkCustomPlotSpot 足迹点极值约 7.66）
});

// 修路报价：只按长度计价，报价 = round(长度 × 单价)（四舍五入，全游戏唯一口径）；
// 长度不足 1（两点几乎重合）不是一条路，返回 null。
function roadCostForLength(length) {
  if (typeof length !== "number" || !Number.isFinite(length) || length < 1) return null;
  return Math.round(length * ROADS.COST_PER_UNIT);
}

const HOME = Object.freeze({
  PLOT_PRICE: STANDARD_PLOT_PRICE,
  CARROT_SEED_PER_BED: 18,
  BEDS: 4,
  CARROT_GROW_SEC: 60,
  CARROT_YIELD_PER_BED: 2,
  CARROT_SELL: 15,
  ANIMAL_PRICE: Object.freeze({ chicken: 140, rabbit: 180, sheep: 260 }),
  PRODUCE_INTERVAL: Object.freeze({ chicken: 45, rabbit: 60, sheep: 75 }),
  PRODUCE_OF: Object.freeze({ chicken: "egg", rabbit: "fur", sheep: "wool" }),
  PRODUCE_SELL: Object.freeze({ egg: 16, fur: 22, wool: 32 }),
  PRODUCE_CAP: 3,
  BAMBOO_PRICE: 500,
  HORSE_PRICE: 1200,
  TELEPORT_PRICE: 0.5,
  // 已由地价分档取代（自选地按落点距水晶分档计价），仅为兼容旧引用保留，不得再用于定价。
  CUSTOM_PLOT_PRICE: 600,
});

// crystal = 本坝传送水晶锚点（坝内坐标），与各 scene 的 spec.crystalPos / CRYSTAL_POS 逐字一致
// （芒市为独立模块 CRYSTAL_POS = 集市组位 (4,34) + 水晶组内偏移 (-4.5,1.5) = (-0.5,35.5)）。
// 地价分档以它为圆心；tests/wechat-land-price.test.mjs 会与各场景实测锚点交叉断言防漂移。
const DAMS = Object.freeze({
  mangshi: Object.freeze({ name: "芒市坝", sites: Object.freeze(["西基址", "东基址"]), xRadius: 265, zRadius: 215, crystal: Object.freeze({ x: -0.5, z: 35.5 }) }),
  ruili: Object.freeze({ name: "瑞丽坝", sites: Object.freeze(["湖畔基址", "塔下基址"]), xRadius: 250, zRadius: 205, crystal: Object.freeze({ x: 6.5, z: 10.5 }) }),
  yingjiang: Object.freeze({ name: "盈江坝", sites: Object.freeze(["江西基址", "江东基址"]), xRadius: 255, zRadius: 210, crystal: Object.freeze({ x: -9.5, z: -3.5 }) }),
  longchuan: Object.freeze({ name: "陇川坝", sites: Object.freeze(["河畔基址", "山脚基址"]), xRadius: 250, zRadius: 205, crystal: Object.freeze({ x: 99, z: -46 }) }),
  lianghe: Object.freeze({ name: "梁河", sites: Object.freeze(["帮盖基址", "塔影基址"]), xRadius: 248, zRadius: 203, crystal: Object.freeze({ x: -11, z: 19 }) }),
});

// Muse's free preview balance is separate from the existing farm economy.
module.exports = Object.freeze({
  initialCoins: 1200,
  // 新世界注册安家金（用户 2026-11-15 定案）：新存档走登记入住时一次性发放 1000，
  // 取代新档默认 1200 的旧口径；只发一次，幂等标记在存档 grant.registration1000。
  // 老存档不补发、余额不动。发放实现集中在 daily-state.cjs 的 registerPlayer。
  registrationGrant: 1000,
  // 安家见面礼开关位（2026-11-14 任务书的免费地+首只动物）：与注册安家金默认不叠加，
  // 本开关保持关闭；日后若用户改口径，先在此打开并在发放处写独立的一次性领取记录，
  // 不得直接改地价或与 registrationGrant 共用幂等标记。
  welcomeGift: Object.freeze({ enabled: false }),
  // 免费版定版（用户 2026-11-15 拍板“先做免费版本”）：首发只有免费无充值版，
  // 本开关关闭时，任何界面都不得出现充值/支付/内购入口或付费暗示文案；
  // 安币只能在游戏内赚取与使用，不与现金挂钩。日后若第三期（版号就绪后）再议充值，
  // 先在此打开开关并另行评审——且付费永远只许买外观与便利，永不卖玩法资格（用户红线）。
  // 网页端对应开关在 src/economy-config.js 的 MONETIZATION，两处必须同口径。
  monetization: Object.freeze({ rechargeEnabled: false }),
  signinCoins: 5,
  questReward: 40,
  milestones: Object.freeze({ 3: 60, 7: 150, 15: 350, 25: 700 }),
  // 标准地价（近郊档）：分档定价的唯一价格表是 LAND_BANDS，本值由表中导出，不得手改。
  plotPrice: STANDARD_PLOT_PRICE,
  LAND_BANDS,
  landBandForDistance,
  landPriceForDistance,
  landQuote,
  ROADS,
  roadCostForLength,
  carrotSale: 15,
  cropRegrowthSeconds: 18,
  meditationMilliseconds: 5000,
  teleportPrice: 0.5,
  horseStart: Object.freeze({ x: 17, z: 51 }),
  horseBounds: Object.freeze({ xRadius: 265, zRadius: 215 }),
  festivalReward: 30,
  BOND: Object.freeze({ START: 10, FEED: 6, BRUSH: 4, DAILY_CARES: 2, FOLLOW_AT: 50, CALL_AT: 80, MAX: 100, BASE_SPEED: 30, SPEED_PER_BOND: 0.06 }),
  DAMS,
  HOME,
});
