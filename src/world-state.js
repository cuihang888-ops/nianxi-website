import { ECONOMY_CONFIG } from "./economy-config.js";

const settlement = (id, name, nameEn, kind) => Object.freeze({ id, name, nameEn, kind });
const region = definition => Object.freeze({ ...definition, settlements: Object.freeze(definition.settlements) });

// Positions, settlements and route times are fictional game design, not survey data.
export const WORLD_REGIONS = Object.freeze([
  region({ id: "yingjiang", name: "盈江", nameEn: "Yingjiang", x: 22, y: 24, landscape: "雨林与宽阔河谷", landscapeEn: "Rainforest and river valleys", settlements: [
    settlement("yingjiang-river", "榕荫河湾", "Banyan bend", "riverside"),
    settlement("yingjiang-forest", "雨林草甸", "Rainforest meadow", "woodland"),
  ] }),
  region({ id: "lianghe", name: "梁河", nameEn: "Lianghe", x: 65, y: 17, landscape: "雾山与温柔田野", landscapeEn: "Misty hills and open fields", settlements: [
    settlement("lianghe-spring", "暖泉田畔", "Warm spring fields", "farmland"),
    settlement("lianghe-hill", "云杉山麓", "Cloudwood foothills", "highland"),
  ] }),
  region({ id: "longchuan", name: "陇川", nameEn: "Longchuan", x: 43, y: 51, landscape: "开阔草场与林间小路", landscapeEn: "Open pastures and woodland trails", settlements: [
    settlement("longchuan-meadow", "青禾草坡", "Green grain slopes", "meadow"),
    settlement("longchuan-grove", "林间小寨", "Woodland hamlet", "woodland"),
  ] }),
  region({ id: "mangshi", name: "芒市", nameEn: "Mangshi", x: 79, y: 55, landscape: "竹林与山间稻田", landscapeEn: "Bamboo groves and hillside fields", settlements: [
    settlement("mangshi-bamboo", "竹影水畔", "Bamboo waterside", "riverside"),
    settlement("mangshi-field", "山间稻坪", "Hillside rice meadow", "farmland"),
  ] }),
  region({ id: "ruili", name: "瑞丽", nameEn: "Ruili", x: 29, y: 80, landscape: "江畔绿洲与寺院庭荫", landscapeEn: "Riverside greenery and temple shade", settlements: [
    settlement("ruili-river", "江风草场", "River breeze pasture", "meadow"),
    settlement("ruili-grove", "菩提林畔", "Bodhi grove", "woodland"),
  ] }),
]);

export const TEMPLE = Object.freeze({
  id: "ruili-temple", regionId: "ruili", name: "瑞丽总佛寺", nameEn: "Ruili General Buddhist Temple",
  x: 36, y: 76,
});

export const HORSE_PRICE = ECONOMY_CONFIG.horse.price;
export const WORLD_TRANSPORT = Object.freeze({
  walk: Object.freeze({ id: "walk", name: "步行", nameEn: "Walk", speed: 1 }),
  horse: Object.freeze({ id: "horse", name: "骑马", nameEn: "Horseback", speed: 2 }),
});

export const WORLD_ROUTES = Object.freeze([
  { from: "ruili", to: "longchuan", walkMinutes: 8 },
  { from: "longchuan", to: "yingjiang", walkMinutes: 10 },
  { from: "yingjiang", to: "lianghe", walkMinutes: 11 },
  { from: "longchuan", to: "mangshi", walkMinutes: 12 },
  { from: "mangshi", to: "lianghe", walkMinutes: 9 },
  { from: "ruili", to: "mangshi", walkMinutes: 18 },
].map(Object.freeze));

export function getRegion(id) {
  return typeof id === "string" ? WORLD_REGIONS.find(item => item.id === id) || null : null;
}

export function getSettlement(regionId, settlementId) {
  return typeof settlementId === "string" ? getRegion(regionId)?.settlements.find(item => item.id === settlementId) || null : null;
}

export function createWorld() {
  return { home: null, transport: "walk", horseOwned: false };
}

export function normalizeWorld(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return createWorld();
  const home = raw.home && getSettlement(raw.home.regionId, raw.home.settlementId)
    ? { regionId: raw.home.regionId, settlementId: raw.home.settlementId } : null;
  const horseOwned = raw.horseOwned === true;
  return { home, transport: horseOwned && raw.transport === "horse" ? "horse" : "walk", horseOwned };
}

export function planRoute(fromRegionId, toRegionId, transport = "walk") {
  if (!getRegion(fromRegionId) || !getRegion(toRegionId) || typeof transport !== "string" || !Object.hasOwn(WORLD_TRANSPORT, transport)) return null;
  const remaining = new Set(WORLD_REGIONS.map(item => item.id));
  const distances = new Map([[fromRegionId, 0]]);
  const previous = new Map();
  while (remaining.size) {
    let current = null;
    let shortest = Infinity;
    for (const id of remaining) {
      if ((distances.get(id) ?? Infinity) < shortest) { current = id; shortest = distances.get(id); }
    }
    if (current === null) return null;
    if (current === toRegionId) {
      const regions = [current];
      while (previous.has(regions[0])) regions.unshift(previous.get(regions[0]));
      return { regions, transport, gameMinutes: Math.ceil(shortest / WORLD_TRANSPORT[transport].speed) };
    }
    remaining.delete(current);
    for (const route of WORLD_ROUTES) {
      const neighbor = route.from === current ? route.to : route.to === current ? route.from : null;
      if (!neighbor || !remaining.has(neighbor)) continue;
      const candidate = shortest + route.walkMinutes;
      if (candidate < (distances.get(neighbor) ?? Infinity)) {
        distances.set(neighbor, candidate);
        previous.set(neighbor, current);
      }
    }
  }
  return null;
}
