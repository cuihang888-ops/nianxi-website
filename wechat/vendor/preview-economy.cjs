"use strict";

const HOME = Object.freeze({
  PLOT_PRICE: 400,
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
  CUSTOM_PLOT_PRICE: 600,
});

const DAMS = Object.freeze({
  mangshi: Object.freeze({ name: "芒市坝", sites: Object.freeze(["西基址", "东基址"]), xRadius: 265, zRadius: 215 }),
  ruili: Object.freeze({ name: "瑞丽坝", sites: Object.freeze(["湖畔基址", "塔下基址"]), xRadius: 250, zRadius: 205 }),
  yingjiang: Object.freeze({ name: "盈江坝", sites: Object.freeze(["江西基址", "江东基址"]), xRadius: 255, zRadius: 210 }),
  longchuan: Object.freeze({ name: "陇川坝", sites: Object.freeze(["河畔基址", "山脚基址"]), xRadius: 250, zRadius: 205 }),
  lianghe: Object.freeze({ name: "梁河", sites: Object.freeze(["帮盖基址", "塔影基址"]), xRadius: 248, zRadius: 203 }),
});

// Muse's free preview balance is separate from the existing farm economy.
module.exports = Object.freeze({
  initialCoins: 1200,
  signinCoins: 5,
  questReward: 40,
  milestones: Object.freeze({ 3: 60, 7: 150, 15: 350, 25: 700 }),
  plotPrice: 400,
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
