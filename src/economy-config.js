// This checked-in table is shared by rules and UI. It is not remote config
// and must never be accepted from a player's save file or action payload.
const FREE_ECONOMY = {
  version: "free-v1",
  startingCoins: 1200,
  startingInventory: { grass: 4, carrot: 2, wool: 0, fur: 0, egg: 0, game: 0 },
  limits: {
    maxCoins: 9_999_999,
    maxItems: 9999,
    maxReadyProduct: 12,
  },
  timing: {
    petCooldownMs: 5000,
    huntCooldownMs: 20_000,
  },
  care: {
    initialComfort: 55,
    maxComfort: 100,
    petComfort: 12,
    feedComfort: 8,
    bonusThreshold: 80,
    bonusMultiplier: 2,
    feedCycles: 2,
    maxFedCycles: 4,
    maxNextProductCycles: 5,
  },
  dailyGift: {
    coins: 120,
    inventory: { grass: 2, carrot: 1 },
  },
  hunt: { rewardQuantity: 1 },
  horse: { price: 480 },
  land: {
    meadowWest: 400,
    meadowEast: 600,
    riverWest: 800,
    riverEast: 1100,
    capacity: 6,
  },
  animals: {
    sheep: { price: 260, productionMs: 30_000 },
    rabbit: { price: 180, productionMs: 24_000 },
    chicken: { price: 140, productionMs: 18_000 },
  },
  crops: {
    grass: { cost: 12, growMs: 20_000, yield: 3 },
    carrot: { cost: 18, growMs: 30_000, yield: 2 },
  },
  products: { wool: 32, fur: 22, egg: 16, game: 45 },
};

const positivePaths = new Set([
  "limits.maxCoins", "limits.maxItems", "limits.maxReadyProduct", "land.capacity",
  "timing.petCooldownMs", "timing.huntCooldownMs", "care.maxComfort",
  "care.bonusMultiplier", "care.feedCycles", "care.maxFedCycles", "care.maxNextProductCycles",
  "animals.sheep.productionMs", "animals.rabbit.productionMs", "animals.chicken.productionMs",
  "crops.grass.growMs", "crops.carrot.growMs",
]);

export function validateEconomyConfig(config) {
  const check = (value, template, path = "") => {
    if (typeof template === "number") {
      if (!Number.isSafeInteger(value) || value < (positivePaths.has(path) ? 1 : 0)) throw new TypeError(`Invalid economy value: ${path}`);
    } else if (typeof template === "string") {
      if (typeof value !== "string" || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(value)) throw new TypeError(`Invalid economy value: ${path}`);
    } else {
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`Invalid economy table: ${path}`);
      const keys = Object.keys(template);
      if (Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) throw new TypeError(`Invalid economy fields: ${path}`);
      keys.forEach(key => check(value[key], template[key], path ? `${path}.${key}` : key));
    }
  };
  check(config, FREE_ECONOMY);
  if (config.startingCoins > config.limits.maxCoins || config.dailyGift.coins > config.limits.maxCoins
    || Object.values(config.startingInventory).some(value => value > config.limits.maxItems)
    || Object.values(config.dailyGift.inventory).some(value => value > config.limits.maxItems)
    || config.hunt.rewardQuantity > config.limits.maxItems
    || config.care.initialComfort > config.care.maxComfort || config.care.bonusThreshold > config.care.maxComfort
    || config.care.maxFedCycles < config.care.feedCycles * 2 || config.care.maxNextProductCycles < config.care.maxFedCycles) {
    throw new TypeError("Economy values exceed their configured limits");
  }
  return true;
}

function deepFreeze(value) {
  Object.values(value).forEach(item => { if (item && typeof item === "object") deepFreeze(item); });
  return Object.freeze(value);
}

validateEconomyConfig(FREE_ECONOMY);
export const ECONOMY_CONFIG = deepFreeze(FREE_ECONOMY);

export const PRODUCT_VALUES = ECONOMY_CONFIG.products;
