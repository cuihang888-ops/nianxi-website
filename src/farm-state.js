import { createWorld, getRegion, getSettlement, HORSE_PRICE, normalizeWorld } from "./world-state.js";
import { ECONOMY_CONFIG, PRODUCT_VALUES } from "./economy-config.js";

const FARM_KEY = "anheli-farm-v1";
const VERSION = 1;
const MAX_COINS = ECONOMY_CONFIG.limits.maxCoins;
const MAX_ITEMS = ECONOMY_CONFIG.limits.maxItems;
const MAX_TIME = 8_640_000_000_000_000;
export const PET_COOLDOWN_MS = ECONOMY_CONFIG.timing.petCooldownMs;
export const HUNT_COOLDOWN_MS = ECONOMY_CONFIG.timing.huntCooldownMs;
export const MAX_ANIMAL_NAME_LENGTH = 12;

export const LAND_PLOTS = Object.freeze([
  Object.freeze({ id: "meadow-west", name: "西侧草场", nameEn: "West meadow", price: ECONOMY_CONFIG.land.meadowWest, capacity: ECONOMY_CONFIG.land.capacity, x: -19, z: 39 }),
  Object.freeze({ id: "meadow-east", name: "东侧草场", nameEn: "East meadow", price: ECONOMY_CONFIG.land.meadowEast, capacity: ECONOMY_CONFIG.land.capacity, x: 19, z: 39 }),
  Object.freeze({ id: "river-west", name: "柳岸西田", nameEn: "West riverside", price: ECONOMY_CONFIG.land.riverWest, capacity: ECONOMY_CONFIG.land.capacity, x: -19, z: 57 }),
  Object.freeze({ id: "river-east", name: "柳岸东田", nameEn: "East riverside", price: ECONOMY_CONFIG.land.riverEast, capacity: ECONOMY_CONFIG.land.capacity, x: 19, z: 57 }),
]);

export const ANIMAL_TYPES = Object.freeze({
  sheep: Object.freeze({ id: "sheep", name: "小羊", nameEn: "Sheep", ...ECONOMY_CONFIG.animals.sheep, product: "wool", productEn: "Wool", productValue: PRODUCT_VALUES.wool }),
  rabbit: Object.freeze({ id: "rabbit", name: "兔子", nameEn: "Rabbit", ...ECONOMY_CONFIG.animals.rabbit, product: "fur", productEn: "Rabbit fur", productValue: PRODUCT_VALUES.fur }),
  chicken: Object.freeze({ id: "chicken", name: "小鸡", nameEn: "Chicken", ...ECONOMY_CONFIG.animals.chicken, product: "egg", productEn: "Egg", productValue: PRODUCT_VALUES.egg }),
});

export const CROPS = Object.freeze({
  grass: Object.freeze({ id: "grass", name: "牧草", nameEn: "Grass", ...ECONOMY_CONFIG.crops.grass }),
  carrot: Object.freeze({ id: "carrot", name: "胡萝卜", nameEn: "Carrot", ...ECONOMY_CONFIG.crops.carrot }),
});

const INVENTORY_KEYS = Object.freeze(["grass", "carrot", "wool", "fur", "egg", "game"]);
const timestamp = (value, fallback = 0) => Number.isFinite(value) ? Math.max(0, Math.min(MAX_TIME, Math.floor(value))) : fallback;
const asTime = value => timestamp(value, Date.now());
const integer = (value, fallback = 0, max = 999_999) => Number.isSafeInteger(value) ? Math.max(0, Math.min(max, value)) : fallback;
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const dateKey = value => {
  const date = new Date(asTime(value));
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const idFor = (prefix, index) => `${prefix}-${index}`;

function animalName(value, truncate = false) {
  if (typeof value !== "string" || /[\p{Cc}\p{Cs}\u061c\u200b\u200e\u200f\u202a-\u202e\u2060-\u206f\ufeff]/u.test(value)) return "";
  const name = value.trim().replace(/\s+/gu, " ");
  if (!/[\p{L}\p{N}\p{P}\p{S}]/u.test(name)) return "";
  const characters = Array.from(name);
  if (characters.length <= MAX_ANIMAL_NAME_LENGTH) return name;
  return truncate ? characters.slice(0, MAX_ANIMAL_NAME_LENGTH).join("").trim() : "";
}

function emptyBeds(plotId) {
  return [1, 2].map(index => ({ id: `${plotId}-bed-${index}`, plotId, crop: "", plantedAt: 0, readyAt: 0, watered: false }));
}

function defaultPlot(definition) {
  return { ...definition, owned: false };
}

function animalDefaults(id, type, plotId, now) {
  const spec = ANIMAL_TYPES[type];
  return {
    id, type, plotId, name: spec.name, comfort: ECONOMY_CONFIG.care.initialComfort, fedUntil: 0,
    nextProductAt: now + spec.productionMs, readyProduct: 0,
    lastPettedAt: 0, adoptedAt: now,
  };
}

export function createFarm(now = Date.now()) {
  const time = asTime(now);
  const plots = LAND_PLOTS.map(defaultPlot);
  return {
    version: VERSION,
    coins: ECONOMY_CONFIG.startingCoins,
    world: createWorld(),
    plots,
    animals: [],
    beds: plots.flatMap(plot => emptyBeds(plot.id)),
    inventory: { ...ECONOMY_CONFIG.startingInventory },
    lastDailyGift: "",
    lastHuntAt: 0,
    huntStats: { attempts: 0, successes: 0 },
    updatedAt: time,
    nextAnimalNumber: 1,
  };
}

function normalizeAnimal(raw, index, plotIds, now) {
  if (!raw || typeof raw !== "object" || !Object.hasOwn(ANIMAL_TYPES, raw.type)) return null;
  const plotId = typeof raw.plotId === "string" && plotIds.has(raw.plotId) ? raw.plotId : "";
  if (!plotId) return null;
  const spec = ANIMAL_TYPES[raw.type];
  const adoptedAt = Math.min(now, timestamp(raw.adoptedAt, now));
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id.slice(0, 40) : idFor("animal", index + 1),
    type: raw.type,
    plotId,
    name: animalName(raw.name, true) || spec.name,
    comfort: Math.round(Math.max(0, Math.min(ECONOMY_CONFIG.care.maxComfort, finite(raw.comfort, ECONOMY_CONFIG.care.initialComfort)))),
    fedUntil: Math.min(now + spec.productionMs * ECONOMY_CONFIG.care.maxFedCycles, timestamp(raw.fedUntil)),
    nextProductAt: Math.max(adoptedAt + spec.productionMs, Math.min(now + spec.productionMs * ECONOMY_CONFIG.care.maxNextProductCycles, timestamp(raw.nextProductAt, adoptedAt + spec.productionMs))),
    readyProduct: integer(raw.readyProduct, 0, ECONOMY_CONFIG.limits.maxReadyProduct),
    lastPettedAt: Math.min(now, timestamp(raw.lastPettedAt)),
    adoptedAt,
  };
}

function normalizeBed(raw, fallback, ownedIds, now) {
  const item = raw && typeof raw === "object" ? raw : {};
  const plotId = fallback.plotId;
  const crop = ownedIds.has(plotId) && Object.hasOwn(CROPS, item.crop) ? item.crop : "";
  const plantedAt = crop ? Math.min(now, timestamp(item.plantedAt, now)) : 0;
  return {
    id: fallback.id,
    plotId,
    crop,
    plantedAt,
    readyAt: crop ? plantedAt + CROPS[crop].growMs : 0,
    watered: crop ? item.watered === true : false,
  };
}

export function normalizeFarm(raw, now = Date.now()) {
  const time = asTime(now);
  const base = createFarm(time);
  if (!raw || typeof raw !== "object" || raw.version !== VERSION) return base;
  const plotRaw = Array.isArray(raw.plots) ? raw.plots : [];
  const plots = LAND_PLOTS.map(definition => {
    const stored = plotRaw.find(item => item?.id === definition.id);
    return { ...definition, owned: stored?.owned === true };
  });
  const ownedIds = new Set(plots.filter(plot => plot.owned).map(plot => plot.id));
  const bedsRaw = Array.isArray(raw.beds) ? raw.beds : [];
  const beds = plots.flatMap(plot => emptyBeds(plot.id).map(fallback => {
    const stored = bedsRaw.find(item => item?.id === fallback.id);
    return normalizeBed(stored, fallback, ownedIds, time);
  }));
  const seen = new Set();
  const population = new Map();
  const animals = (Array.isArray(raw.animals) ? raw.animals : []).map((item, index) => normalizeAnimal(item, index, ownedIds, time)).filter(item => {
    if (!item || seen.has(item.id)) return false;
    const count = population.get(item.plotId) || 0;
    if (count >= LAND_PLOTS.find(plot => plot.id === item.plotId).capacity) return false;
    population.set(item.plotId, count + 1);
    seen.add(item.id);
    return true;
  });
  const inventory = Object.fromEntries(INVENTORY_KEYS.map(key => [key, integer(raw.inventory?.[key], 0, MAX_ITEMS)]));
  const maxNext = animals.reduce((max, animal) => {
    const match = /^animal-(\d+)$/.exec(animal.id);
    return match && Number.isSafeInteger(Number(match[1])) ? Math.max(max, Math.min(999_999, Number(match[1]) + 1)) : max;
  }, 1);
  return {
    version: VERSION,
    coins: integer(raw.coins, 0, MAX_COINS),
    world: normalizeWorld(raw.world),
    plots,
    animals,
    beds,
    inventory,
    lastDailyGift: typeof raw.lastDailyGift === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.lastDailyGift) ? raw.lastDailyGift : "",
    lastHuntAt: Math.min(time, timestamp(raw.lastHuntAt)),
    huntStats: {
      attempts: integer(raw.huntStats?.attempts, 0),
      successes: Math.min(integer(raw.huntStats?.attempts, 0), integer(raw.huntStats?.successes, 0)),
    },
    updatedAt: time,
    nextAnimalNumber: Math.max(maxNext, integer(raw.nextAnimalNumber, 1, 999999)),
  };
}

export function advanceFarm(state, now = Date.now()) {
  const time = asTime(now);
  const next = normalizeFarm(state, time);
  next.animals = next.animals.map(animal => {
    const spec = ANIMAL_TYPES[animal.type];
    let readyProduct = animal.readyProduct;
    let nextProductAt = animal.nextProductAt;
    const horizon = Math.min(time, animal.fedUntil);
    if (animal.fedUntil > 0 && nextProductAt <= horizon) {
      const cycles = Math.floor((horizon - nextProductAt) / spec.productionMs) + 1;
      if (cycles > 0) {
        readyProduct = Math.min(ECONOMY_CONFIG.limits.maxReadyProduct, readyProduct + cycles * (animal.comfort >= ECONOMY_CONFIG.care.bonusThreshold ? ECONOMY_CONFIG.care.bonusMultiplier : 1));
        // Advance every elapsed cycle even when storage is full, so collection cannot replay it.
        nextProductAt += cycles * spec.productionMs;
      }
    }
    return { ...animal, readyProduct, nextProductAt };
  });
  next.updatedAt = time;
  return next;
}

function result(state, ok, message, messageEn) {
  return { state, ok, message, messageEn };
}

function fail(state, message, messageEn) { return result(state, false, message, messageEn); }
function ownedPlot(state, plotId) { return state.plots.find(plot => plot.id === plotId && plot.owned); }
function animal(state, id) { return state.animals.find(item => item.id === id); }
function bed(state, id) { return state.beds.find(item => item.id === id); }

export function applyFarmAction(state, action, now = Date.now()) {
  const time = asTime(now);
  const next = advanceFarm(state, time);
  if (!action || typeof action !== "object" || typeof action.type !== "string") return fail(next, "操作无效", "Invalid action");
  const type = action.type;
  if (type === "settleHome") {
    if (Object.keys(action).some(key => !["type", "regionId", "settlementId"].includes(key))) return fail(next, "安家信息无效", "Invalid home details");
    const region = getRegion(action.regionId);
    const settlement = getSettlement(action.regionId, action.settlementId);
    if (!region || !settlement) return fail(next, "这处聚落暂不能安家", "This settlement is unavailable");
    next.world.home = { regionId: region.id, settlementId: settlement.id };
    return result(next, true, `已在${region.name}·${settlement.name}安家`, `Your home is now in ${settlement.nameEn}, ${region.nameEn}`);
  }
  if (type === "buyHorse") {
    if (Object.keys(action).some(key => key !== "type")) return fail(next, "养马信息无效", "Invalid horse adoption details");
    if (next.world.horseOwned) return fail(next, "已有一匹马陪你远行", "You already have a horse companion");
    if (next.coins < HORSE_PRICE) return fail(next, "安币还不够领养马匹", "You need more An coins to adopt a horse");
    next.coins -= HORSE_PRICE;
    next.world.horseOwned = true;
    return result(next, true, "一匹山地马成为了你的伙伴", "A mountain horse has joined you");
  }
  if (type === "setTransport") {
    if (Object.keys(action).some(key => !["type", "transport"].includes(key)) || !["walk", "horse"].includes(action.transport)) return fail(next, "请选择步行或骑马", "Choose walking or horseback");
    if (action.transport === "horse" && !next.world.horseOwned) return fail(next, "先领养一匹马，再一起远行", "Adopt a horse before riding");
    next.world.transport = action.transport;
    return result(next, true, action.transport === "horse" ? "按骑马规划路程" : "按步行规划路程", action.transport === "horse" ? "Route planned on horseback" : "Route planned on foot");
  }
  if (type === "hunt") {
    if (typeof action.success !== "boolean") return fail(next, "这次狩猎结果无效", "Invalid hunt result");
    if (next.huntStats.attempts > 0 && time - next.lastHuntAt < HUNT_COOLDOWN_MS) return fail(next, "山林需要安静一会儿，再试一次吧", "Let the forest rest before another attempt");
    if (action.success && next.inventory.game + ECONOMY_CONFIG.hunt.rewardQuantity > MAX_ITEMS) return fail(next, "仓库已经放不下了", "Storage is full");
    next.lastHuntAt = time;
    next.huntStats.attempts = Math.min(999_999, next.huntStats.attempts + 1);
    if (action.success) {
      next.inventory.game += ECONOMY_CONFIG.hunt.rewardQuantity;
      next.huntStats.successes = Math.min(999_999, next.huntStats.successes + 1);
    }
    return action.success
      ? result(next, true, ECONOMY_CONFIG.hunt.rewardQuantity === 1 ? "获得一份山野收获" : `获得${ECONOMY_CONFIG.hunt.rewardQuantity}份山野收获`, ECONOMY_CONFIG.hunt.rewardQuantity === 1 ? "Received one game item" : `Received ${ECONOMY_CONFIG.hunt.rewardQuantity} game items`)
      : result(next, true, "这次没有命中，下次再试", "Missed this time. Try again soon");
  }
  if (type === "dailyGift") {
    if (next.lastDailyGift === dateKey(time)) return fail(next, "今日补给已经领取", "Today's supply was already claimed");
    next.coins = Math.min(MAX_COINS, next.coins + ECONOMY_CONFIG.dailyGift.coins);
    next.inventory.grass = Math.min(MAX_ITEMS, next.inventory.grass + ECONOMY_CONFIG.dailyGift.inventory.grass);
    next.inventory.carrot = Math.min(MAX_ITEMS, next.inventory.carrot + ECONOMY_CONFIG.dailyGift.inventory.carrot);
    next.lastDailyGift = dateKey(time);
    return result(next, true, "收到今日农场补给", "Daily farm supply received");
  }
  if (type === "buyPlot") {
    const definition = LAND_PLOTS.find(plot => plot.id === action.plotId);
    const current = next.plots.find(plot => plot.id === action.plotId);
    if (!definition || !current) return fail(next, "这块土地不存在", "That land does not exist");
    if (current.owned) return fail(next, "这块土地已经属于你", "You already own this land");
    if (next.coins < definition.price) return fail(next, "安币还不够买下这块地", "You need more An coins for this land");
    next.coins -= definition.price;
    current.owned = true;
    return result(next, true, `已买下${definition.name}`, `You bought ${definition.nameEn}`);
  }
  if (type === "buyAnimal") {
    const spec = Object.hasOwn(ANIMAL_TYPES, action.animalType) ? ANIMAL_TYPES[action.animalType] : null;
    const plot = ownedPlot(next, action.plotId);
    if (!spec) return fail(next, "暂不认识这种小动物", "This animal is unavailable");
    if (!plot) return fail(next, "请先拥有这块土地", "Buy this land first");
    if (next.animals.filter(item => item.plotId === plot.id).length >= plot.capacity) return fail(next, "这块地已经住满了", "This land is full");
    if (next.coins < spec.price) return fail(next, "安币还不够领养它", "You need more An coins to adopt it");
    let id = idFor("animal", next.nextAnimalNumber++);
    while (next.animals.some(item => item.id === id)) id = idFor("animal", next.nextAnimalNumber++);
    next.coins -= spec.price;
    next.animals.push(animalDefaults(id, spec.id, plot.id, time));
    return result(next, true, `已领养${spec.name}`, `You adopted a ${spec.nameEn.toLowerCase()}`);
  }
  if (type === "plant") {
    const crop = Object.hasOwn(CROPS, action.crop) ? CROPS[action.crop] : null;
    const target = bed(next, action.bedId);
    if (!crop) return fail(next, "这份种子不存在", "This seed is unavailable");
    if (!target || !ownedPlot(next, target.plotId)) return fail(next, "请先拥有这块土地", "Buy this land first");
    if (target.crop) return fail(next, "这块地已经种上东西了", "This bed is already planted");
    if (next.coins < crop.cost) return fail(next, "安币还不够买种子", "You need more An coins for seeds");
    next.coins -= crop.cost;
    target.crop = crop.id;
    target.plantedAt = time;
    target.readyAt = time + crop.growMs;
    target.watered = false;
    return result(next, true, `已种下${crop.name}`, `${crop.nameEn} planted`);
  }
  if (type === "water") {
    const target = bed(next, action.bedId);
    if (!target || !target.crop || !ownedPlot(next, target.plotId)) return fail(next, "这里还没有可浇灌的作物", "There is no crop to water here");
    if (target.watered) return fail(next, "作物已经喝饱水了", "The crop is already watered");
    target.watered = true;
    return result(next, true, "作物喝饱水了", "The crop is watered");
  }
  if (type === "harvest") {
    const target = bed(next, action.bedId);
    const crop = target && CROPS[target.crop];
    if (!target || !crop || !ownedPlot(next, target.plotId)) return fail(next, "这里没有可收获的作物", "There is no crop to harvest here");
    if (target.readyAt > time) return fail(next, "作物还在生长", "The crop is still growing");
    if (!target.watered) return fail(next, "先给作物浇一瓢水吧", "Water the crop before harvesting");
    if (next.inventory[crop.id] + crop.yield > MAX_ITEMS) return fail(next, "仓库已经放不下了", "Storage is full");
    next.inventory[crop.id] += crop.yield;
    Object.assign(target, { crop: "", plantedAt: 0, readyAt: 0, watered: false });
    return result(next, true, `收获了${crop.name}`, `${crop.nameEn} harvested`);
  }
  if (type === "feed" || type === "pet" || type === "collect" || type === "renameAnimal") {
    const target = animal(next, action.animalId);
    if (!target || !ownedPlot(next, target.plotId)) return fail(next, "找不到这只小动物", "This animal could not be found");
    const spec = ANIMAL_TYPES[target.type];
    if (type === "renameAnimal") {
      const name = animalName(action.name);
      if (!name) return fail(next, "取一个 1 到 12 个字的名字吧", "Choose a name with 1 to 12 characters");
      target.name = name;
      return result(next, true, `以后就叫你${name}了`, `Your companion is now called ${name}`);
    }
    if (type === "pet") {
      if (target.lastPettedAt > 0 && time - target.lastPettedAt < PET_COOLDOWN_MS) return fail(next, "让它玩一小会儿再来摸摸吧", "Let it play a moment before petting again");
      if (target.comfort >= ECONOMY_CONFIG.care.maxComfort) return fail(next, "它已经很开心了", "It is already feeling happy");
      target.comfort = Math.min(ECONOMY_CONFIG.care.maxComfort, target.comfort + ECONOMY_CONFIG.care.petComfort);
      target.lastPettedAt = Math.max(1, time);
      return result(next, true, `${target.name}开心地蹭了蹭你`, `${spec.nameEn} is feeling loved`);
    }
    if (type === "feed") {
      const feed = action.feed;
      if (feed !== "grass" && feed !== "carrot") return fail(next, "这份饲料不能喂食", "This feed is unavailable");
      if (next.inventory[feed] < 1) return fail(next, feed === "grass" ? "牧草不够了，先种一些吧" : "胡萝卜不够了，先种一些吧", feed === "grass" ? "You need more grass" : "You need more carrots");
      if (target.fedUntil > time + spec.productionMs * ECONOMY_CONFIG.care.feedCycles) return fail(next, "它已经吃得很饱了", "It has enough food for now");
      next.inventory[feed] -= 1;
      if (target.fedUntil <= time) target.nextProductAt = time + spec.productionMs;
      target.fedUntil = Math.max(target.fedUntil, time) + spec.productionMs * ECONOMY_CONFIG.care.feedCycles;
      target.comfort = Math.min(ECONOMY_CONFIG.care.maxComfort, target.comfort + ECONOMY_CONFIG.care.feedComfort);
      return result(next, true, `喂饱了${target.name}`, `${spec.nameEn} has been fed`);
    }
    if (target.readyProduct < 1) return fail(next, `${target.name}还没有产出`, `${spec.nameEn} has no product ready`);
    const quantity = target.readyProduct;
    if (next.inventory[spec.product] + quantity > MAX_ITEMS) return fail(next, "仓库已经放不下了", "Storage is full");
    next.inventory[spec.product] += quantity;
    target.readyProduct = 0;
    return result(next, true, `收取了${quantity}份${spec.product === "wool" ? "羊毛" : spec.product === "fur" ? "兔毛" : "鸡蛋"}`, `${quantity} ${spec.productEn.toLowerCase()} collected`);
  }
  if (type === "sell") {
    const item = typeof action.item === "string" ? action.item : "";
    const quantity = integer(action.quantity, 0, MAX_ITEMS);
    const value = Object.hasOwn(PRODUCT_VALUES, item) ? PRODUCT_VALUES[item] : 0;
    if (!value || quantity < 1) return fail(next, "没有可出售的货物", "There is nothing to sell");
    if (next.inventory[item] < quantity) return fail(next, "库存里的货物不够", "You do not have enough in storage");
    if (next.coins + value * quantity > MAX_COINS) return fail(next, "安币已经达到上限", "Your An coin balance is full");
    next.inventory[item] -= quantity;
    next.coins += value * quantity;
    return result(next, true, `卖出${quantity}份货物，收到${value * quantity}安币`, `Sold ${quantity} items for ${value * quantity} An coins`);
  }
  return fail(next, "还没有这个农场动作", "This farm action is unavailable");
}

export function loadFarm(storage, now = Date.now()) {
  try {
    const source = storage && typeof storage.getItem === "function" ? storage.getItem(FARM_KEY) : "";
    return source ? advanceFarm(JSON.parse(source), now) : createFarm(now);
  } catch { return createFarm(now); }
}

export function saveFarm(storage, state) {
  if (!storage || typeof storage.setItem !== "function") return false;
  try { storage.setItem(FARM_KEY, JSON.stringify(normalizeFarm(state, state?.updatedAt ?? Date.now()))); return true; } catch { return false; }
}

export { FARM_KEY };
