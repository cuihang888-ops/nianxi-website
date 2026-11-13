const FARM_KEY = "anheli-farm-v1";
const VERSION = 1;
const MAX_COINS = 9_999_999;
const MAX_ITEMS = 9999;
const MAX_TIME = 8_640_000_000_000_000;
const PET_COOLDOWN_MS = 5000;
export const HUNT_COOLDOWN_MS = 20_000;

export const LAND_PLOTS = Object.freeze([
  Object.freeze({ id: "meadow-west", name: "西侧草场", nameEn: "West meadow", price: 400, capacity: 6, x: -19, z: 39 }),
  Object.freeze({ id: "meadow-east", name: "东侧草场", nameEn: "East meadow", price: 600, capacity: 6, x: 19, z: 39 }),
  Object.freeze({ id: "river-west", name: "柳岸西田", nameEn: "West riverside", price: 800, capacity: 6, x: -19, z: 57 }),
  Object.freeze({ id: "river-east", name: "柳岸东田", nameEn: "East riverside", price: 1100, capacity: 6, x: 19, z: 57 }),
]);

export const ANIMAL_TYPES = Object.freeze({
  sheep: Object.freeze({ id: "sheep", name: "小羊", nameEn: "Sheep", price: 260, product: "wool", productEn: "Wool", productValue: 32, productionMs: 30_000 }),
  rabbit: Object.freeze({ id: "rabbit", name: "兔子", nameEn: "Rabbit", price: 180, product: "fur", productEn: "Rabbit fur", productValue: 22, productionMs: 24_000 }),
  chicken: Object.freeze({ id: "chicken", name: "小鸡", nameEn: "Chicken", price: 140, product: "egg", productEn: "Egg", productValue: 16, productionMs: 18_000 }),
});

export const CROPS = Object.freeze({
  grass: Object.freeze({ id: "grass", name: "牧草", nameEn: "Grass", cost: 12, growMs: 20_000, yield: 3 }),
  carrot: Object.freeze({ id: "carrot", name: "胡萝卜", nameEn: "Carrot", cost: 18, growMs: 30_000, yield: 2 }),
});

const INVENTORY_KEYS = Object.freeze(["grass", "carrot", "wool", "fur", "egg", "game"]);
const PRODUCT_VALUES = Object.freeze({ wool: 32, fur: 22, egg: 16, game: 45 });
const timestamp = (value, fallback = 0) => Number.isFinite(value) ? Math.max(0, Math.min(MAX_TIME, Math.floor(value))) : fallback;
const asTime = value => timestamp(value, Date.now());
const integer = (value, fallback = 0, max = 999_999) => Number.isSafeInteger(value) ? Math.max(0, Math.min(max, value)) : fallback;
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const dateKey = value => {
  const date = new Date(asTime(value));
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const idFor = (prefix, index) => `${prefix}-${index}`;

function emptyBeds(plotId) {
  return [1, 2].map(index => ({ id: `${plotId}-bed-${index}`, plotId, crop: "", plantedAt: 0, readyAt: 0, watered: false }));
}

function defaultPlot(definition) {
  return { ...definition, owned: false };
}

function animalDefaults(id, type, plotId, now) {
  const spec = ANIMAL_TYPES[type];
  return {
    id, type, plotId, name: spec.name, comfort: 55, fedUntil: 0,
    nextProductAt: now + spec.productionMs, readyProduct: 0,
    lastPettedAt: 0, adoptedAt: now,
  };
}

export function createFarm(now = Date.now()) {
  const time = asTime(now);
  const plots = LAND_PLOTS.map(defaultPlot);
  return {
    version: VERSION,
    coins: 1200,
    plots,
    animals: [],
    beds: plots.flatMap(plot => emptyBeds(plot.id)),
    inventory: { grass: 4, carrot: 2, wool: 0, fur: 0, egg: 0, game: 0 },
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
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name.slice(0, 24) : spec.name,
    comfort: Math.round(Math.max(0, Math.min(100, finite(raw.comfort, 55)))),
    fedUntil: Math.min(now + spec.productionMs * 4, timestamp(raw.fedUntil)),
    nextProductAt: Math.max(adoptedAt + spec.productionMs, Math.min(now + spec.productionMs * 5, timestamp(raw.nextProductAt, adoptedAt + spec.productionMs))),
    readyProduct: integer(raw.readyProduct, 0, 12),
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
        readyProduct = Math.min(12, readyProduct + cycles * (animal.comfort >= 80 ? 2 : 1));
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
  if (type === "hunt") {
    if (typeof action.success !== "boolean") return fail(next, "这次狩猎结果无效", "Invalid hunt result");
    if (next.huntStats.attempts > 0 && time - next.lastHuntAt < HUNT_COOLDOWN_MS) return fail(next, "山林需要安静一会儿，再试一次吧", "Let the forest rest before another attempt");
    if (action.success && next.inventory.game >= MAX_ITEMS) return fail(next, "仓库已经放不下了", "Storage is full");
    next.lastHuntAt = time;
    next.huntStats.attempts = Math.min(999_999, next.huntStats.attempts + 1);
    if (action.success) {
      next.inventory.game += 1;
      next.huntStats.successes = Math.min(999_999, next.huntStats.successes + 1);
    }
    return action.success
      ? result(next, true, "获得一份山野收获", "Received one game item")
      : result(next, true, "这次没有命中，下次再试", "Missed this time. Try again soon");
  }
  if (type === "dailyGift") {
    if (next.lastDailyGift === dateKey(time)) return fail(next, "今日补给已经领取", "Today's supply was already claimed");
    next.coins = Math.min(MAX_COINS, next.coins + 120);
    next.inventory.grass = Math.min(MAX_ITEMS, next.inventory.grass + 2);
    next.inventory.carrot = Math.min(MAX_ITEMS, next.inventory.carrot + 1);
    next.lastDailyGift = dateKey(time);
    return result(next, true, "收到今日农场补给", "Daily farm supply received");
  }
  if (type === "buyPlot") {
    const definition = LAND_PLOTS.find(plot => plot.id === action.plotId);
    const current = next.plots.find(plot => plot.id === action.plotId);
    if (!definition || !current) return fail(next, "这块土地不存在", "That land does not exist");
    if (current.owned) return fail(next, "这块土地已经属于你", "You already own this land");
    if (next.coins < definition.price) return fail(next, "叶币还不够买下这块地", "You need more leaf coins for this land");
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
    if (next.coins < spec.price) return fail(next, "叶币还不够领养它", "You need more leaf coins to adopt it");
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
    if (next.coins < crop.cost) return fail(next, "叶币还不够买种子", "You need more leaf coins for seeds");
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
  if (type === "feed" || type === "pet" || type === "collect") {
    const target = animal(next, action.animalId);
    if (!target || !ownedPlot(next, target.plotId)) return fail(next, "找不到这只小动物", "This animal could not be found");
    const spec = ANIMAL_TYPES[target.type];
    if (type === "pet") {
      if (target.lastPettedAt > 0 && time - target.lastPettedAt < PET_COOLDOWN_MS) return fail(next, "让它玩一小会儿再来摸摸吧", "Let it play a moment before petting again");
      if (target.comfort >= 100) return fail(next, "它已经很开心了", "It is already feeling happy");
      target.comfort = Math.min(100, target.comfort + 12);
      target.lastPettedAt = Math.max(1, time);
      return result(next, true, `${target.name}开心地蹭了蹭你`, `${spec.nameEn} is feeling loved`);
    }
    if (type === "feed") {
      const feed = action.feed;
      if (feed !== "grass" && feed !== "carrot") return fail(next, "这份饲料不能喂食", "This feed is unavailable");
      if (next.inventory[feed] < 1) return fail(next, feed === "grass" ? "牧草不够了，先种一些吧" : "胡萝卜不够了，先种一些吧", feed === "grass" ? "You need more grass" : "You need more carrots");
      if (target.fedUntil > time + spec.productionMs * 2) return fail(next, "它已经吃得很饱了", "It has enough food for now");
      next.inventory[feed] -= 1;
      if (target.fedUntil <= time) target.nextProductAt = time + spec.productionMs;
      target.fedUntil = Math.max(target.fedUntil, time) + spec.productionMs * 2;
      target.comfort = Math.min(100, target.comfort + 8);
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
    const quantity = integer(action.quantity, 0, 9999);
    const value = Object.hasOwn(PRODUCT_VALUES, item) ? PRODUCT_VALUES[item] : 0;
    if (!value || quantity < 1) return fail(next, "没有可出售的货物", "There is nothing to sell");
    if (next.inventory[item] < quantity) return fail(next, "库存里的货物不够", "You do not have enough in storage");
    if (next.coins + value * quantity > MAX_COINS) return fail(next, "叶币已经达到上限", "Your leaf coin balance is full");
    next.inventory[item] -= quantity;
    next.coins += value * quantity;
    return result(next, true, `卖出${quantity}份货物，收到${value * quantity}叶币`, `Sold ${quantity} items for ${value * quantity} leaf coins`);
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
