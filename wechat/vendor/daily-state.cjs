"use strict";

const ECONOMY = require("./preview-economy.cjs");
const { FESTIVALS, ALBUM_CATALOG } = require("./preview-discovery.cjs");
const { computeSky } = require("./preview-sky.cjs");
const BOND = ECONOMY.BOND;
const FEST_REWARD = ECONOMY.festivalReward;
const MILESTONES = ECONOMY.milestones;
const QUEST_REWARD = ECONOMY.questReward;
const HOME = ECONOMY.HOME;
const ANIMAL_KINDS = ["chicken", "rabbit", "sheep"];
const PRODUCE_KINDS = ["egg", "wool", "fur"];
const BASKET_KINDS = ["carrot", "egg", "wool", "fur"];
const BASKET_PRICES = { carrot: HOME.CARROT_SELL, ...HOME.PRODUCE_SELL };
const QUEST_KEYS = ["fed", "harvest", "jingxin"];
const clone = value => JSON.parse(JSON.stringify(value));
const failure = (code, msg) => ({ ok: false, error: { code, message: msg }, msg });

function defaultState() {
  return {
    coins: ECONOMY.initialCoins,
    jingxinDate: "",
    signin: { month: "", days: [], last: "" },
    quests: { date: "", fed: false, harvest: false, jingxin: false, claimed: false },
    home: null,
    horse: null,
    album: { landmarks: {}, animals: {}, festivals: {} },
    festJoined: {},
    lit: {},
    latestDay: "",
  };
}

function dataKeys(value, keys) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return false;
  const own = Reflect.ownKeys(value);
  return own.length === keys.length && keys.every(key => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && descriptor.enumerable && Object.hasOwn(descriptor, "value");
  });
}

function fields(value, required, optional = []) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Reflect.ownKeys(value);
  return keys.every(key => required.includes(key) || optional.includes(key))
    && required.every(key => keys.includes(key)) && dataKeys(value, keys);
}

function record(value, allowed, check) {
  return fields(value, [], allowed) && Object.keys(value).every(key => check(value[key]));
}

function validateAlbum(album) {
  return dataKeys(album, Object.keys(ALBUM_CATALOG)) && Object.keys(ALBUM_CATALOG).every(group =>
    record(album[group], ALBUM_CATALOG[group].map(item => item.id), value => value === true));
}

function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

const optionalDate = value => value === "" || validDate(value);
const validMonth = value => value === "" || (typeof value === "string" && validDate(value + "-01"));
const validCoins = value => typeof value === "number" && value >= 0 && Number.isSafeInteger(value * 2);
const validTime = value => Number.isSafeInteger(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER - 3600;

function validDays(days, month) {
  if (!Array.isArray(days) || days.length > 31 || Reflect.ownKeys(days).length !== days.length + 1) return false;
  const found = new Set();
  for (let index = 0; index < days.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(days, String(index));
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, "value")) return false;
    const day = descriptor.value;
    if (!Number.isInteger(day) || day < 1 || found.has(day)
      || !validDate(month + "-" + String(day).padStart(2, "0"))) return false;
    found.add(day);
  }
  return true;
}

function validateState(state) {
  try {
    const keys = ["coins", "jingxinDate", "signin", "quests", "home", "latestDay"];
    if (!fields(state, keys, ["horse", "album", "festJoined", "lit"])
      || !validCoins(state.coins)
      || !optionalDate(state.jingxinDate) || !optionalDate(state.latestDay)
      || !dataKeys(state.signin, ["month", "days", "last"])
      || !validMonth(state.signin.month) || !optionalDate(state.signin.last)
      || !validDays(state.signin.days, state.signin.month)
      || !dataKeys(state.quests, ["date", "fed", "harvest", "jingxin", "claimed"])
      || !optionalDate(state.quests.date)
      || ![...QUEST_KEYS, "claimed"].every(key => typeof state.quests[key] === "boolean")
      || (state.quests.claimed && !questAllDone(state))) return false;
    if (state.signin.last && (!state.signin.month || state.signin.last.slice(0, 7) > state.signin.month)) return false;
    if (state.signin.last.slice(0, 7) === state.signin.month && state.signin.last
      && !state.signin.days.includes(Number(state.signin.last.slice(8)))) return false;
    if (!state.quests.date && [...QUEST_KEYS, "claimed"].some(key => state.quests[key])) return false;
    if (state.home !== null && !validateHome(state.home)) return false;
    if (Object.hasOwn(state, "horse") && state.horse !== null && !validateHorse(state.horse)) return false;
    if (Object.hasOwn(state, "album") && !validateAlbum(state.album)) return false;
    if (Object.hasOwn(state, "festJoined") && !record(state.festJoined, FESTIVALS.map(fest => fest.id), year => Number.isInteger(year) && year >= 1 && year <= 9999)) return false;
    if (Object.hasOwn(state, "lit") && !record(state.lit, Object.keys(ECONOMY.DAMS), value => value === true)) return false;
    return true;
  } catch { return false; }
}

function validHorsePosition(x, z, dam = "mangshi") {
  const bounds = typeof dam === "string" && Object.hasOwn(ECONOMY.DAMS, dam) ? ECONOMY.DAMS[dam] : null;
  return bounds && Number.isFinite(x) && Number.isFinite(z)
    && Math.hypot(x / bounds.xRadius, z / bounds.zRadius) <= 1 + 1e-10;
}

function validateHorse(horse) {
  return fields(horse, ["owned", "x", "z"], ["dam", "bond", "careDate", "careCount"])
    && horse.owned === true && validHorsePosition(horse.x, horse.z, horse.dam === undefined ? "mangshi" : horse.dam) === true
    && (!Object.hasOwn(horse, "bond") || (Number.isInteger(horse.bond) && horse.bond >= 0 && horse.bond <= BOND.MAX))
    && (!Object.hasOwn(horse, "careDate") || optionalDate(horse.careDate))
    && (!Object.hasOwn(horse, "careCount") || (Number.isInteger(horse.careCount) && horse.careCount >= 0 && horse.careCount <= BOND.DAILY_CARES))
    && !(horse.careCount > 0 && !horse.careDate);
}

function validateHome(home) {
  const basicKeys = ["site", "plot", "hut", "label"];
  const fullKeys = [...basicKeys, "house", "field", "beds", "harvests", "animals", "produce", "produceNext"];
  const legacy = fields(home, basicKeys, ["dam", "custom", "basket"]);
  if (!legacy && !fields(home, fullKeys, ["dam", "custom", "basket"])) return false;
  if (Object.hasOwn(home, "basket") && !validateBasket(home.basket)) return false;
  if (Object.hasOwn(home, "dam") && (typeof home.dam !== "string" || !Object.hasOwn(ECONOMY.DAMS, home.dam))) return false;
  const custom = Object.hasOwn(home, "custom");
  if (custom ? (home.site !== -1 || home.plot !== -1 || !dataKeys(home.custom, ["x", "z"])
    || !validHorsePosition(home.custom.x, home.custom.z, home.dam || "mangshi"))
    : (!Number.isInteger(home.site) || home.site < 0 || home.site > 1 || !Number.isInteger(home.plot) || home.plot < 0 || home.plot > 7)) return false;
  if (typeof home.hut !== "boolean"
    || typeof home.label !== "string" || !home.label.trim() || home.label.length > 80
    || /[\x00-\x1f\x7f]/.test(home.label)) return false;
  if (legacy) return true;
  if (!Number.isInteger(home.house) || home.house < 0 || home.house > 2 || home.hut !== (home.house >= 1)
    || typeof home.field !== "boolean" || (home.field && !home.hut)
    || !Number.isSafeInteger(home.harvests) || home.harvests < 0
    || !dataKeys(home.beds, ["crop", "readyAt"]) || !validTime(home.beds.readyAt)
    || ![null, "carrot"].includes(home.beds.crop)
    || (home.beds.crop === null ? home.beds.readyAt !== 0 : (!home.field || home.beds.readyAt === 0))
    || !dataKeys(home.animals, ANIMAL_KINDS) || !dataKeys(home.produceNext, ANIMAL_KINDS)
    || !dataKeys(home.produce, PRODUCE_KINDS)) return false;
  if (!ANIMAL_KINDS.every(kind => Number.isInteger(home.animals[kind]) && home.animals[kind] >= 0 && home.animals[kind] <= 1
    && validTime(home.produceNext[kind]) && (home.animals[kind] || home.produceNext[kind] === 0))) return false;
  return PRODUCE_KINDS.every(kind => Number.isInteger(home.produce[kind]) && home.produce[kind] >= 0 && home.produce[kind] <= HOME.PRODUCE_CAP);
}

function validateBasket(basket) {
  if (!dataKeys(basket, BASKET_KINDS)
    || !BASKET_KINDS.every(kind => Number.isSafeInteger(basket[kind]) && basket[kind] >= 0)) return false;
  const count = BASKET_KINDS.reduce((sum, kind) => sum + basket[kind], 0);
  const value = BASKET_KINDS.reduce((sum, kind) => sum + basket[kind] * BASKET_PRICES[kind], 0);
  return Number.isSafeInteger(count) && validCoins(value);
}

function todayShanghai(now = Date.now()) {
  const value = Number(now);
  if (!Number.isFinite(value)) throw new TypeError("Invalid date timestamp");
  return new Date(value + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function highWaterDay(state) {
  return [state.latestDay, state.signin.last, state.jingxinDate, state.quests.date,
    state.horse?.careDate || "",
    state.signin.month ? state.signin.month + "-01" : ""].reduce((a, b) => a > b ? a : b, "");
}

function refreshDaily(state, today) {
  if (!validDate(today) || today < highWaterDay(state)) return false;
  state.latestDay = today;
  const month = today.slice(0, 7);
  if (state.signin.month !== month) { state.signin.month = month; state.signin.days = []; }
  if (state.quests.date !== today) {
    state.quests = { date: today, fed: false, harvest: false, jingxin: false, claimed: false };
  }
  return true;
}

const dateFailure = () => failure("CLOCK_ROLLBACK", "日期尚未同步，请恢复正确时间后再试");
const balanceFailure = () => failure("BALANCE_LIMIT", "安币已达到存档上限");

function doSignin(state, today) {
  if (!refreshDaily(state, today)) return dateFailure();
  const dom = Number(today.slice(8, 10));
  if (state.signin.last === today || state.signin.days.includes(dom)) {
    return { ok: false, msg: "今天已经签到了 · 本月累计 " + state.signin.days.length + " 天，断了也不罚" };
  }
  const count = state.signin.days.length + 1;
  const bonus = MILESTONES[count] || 0;
  const coins = state.coins + ECONOMY.signinCoins + bonus;
  if (!validCoins(coins)) return balanceFailure();
  state.signin.last = today;
  state.signin.days.push(dom);
  state.coins = coins;
  return { ok: true, msg: bonus
    ? "签到 +" + ECONOMY.signinCoins + " · 本月累计 " + count + " 天，里程碑再 +" + bonus + " 安币"
    : "签到 +" + ECONOMY.signinCoins + " 安币 · 本月累计 " + count + " 天" };
}

function doJingxin(state, today) {
  if (!refreshDaily(state, today)) return dateFailure();
  if (state.jingxinDate === today) return { ok: false, msg: "今日已静心 · 心安处，即是安和里" };
  state.jingxinDate = today;
  state.quests.jingxin = true;
  return { ok: true, msg: "心安了 · 今日已静心" };
}

function questAllDone(state) {
  return QUEST_KEYS.every(key => state.quests[key] === true);
}

function markQuest(state, today, key) {
  if (!QUEST_KEYS.includes(key)) return { ...failure("INVALID_QUEST", "无效的小确幸"), changed: false, allDone: questAllDone(state) };
  if (!refreshDaily(state, today)) return { ...dateFailure(), changed: false, allDone: questAllDone(state) };
  if (state.quests[key]) return { changed: false, allDone: questAllDone(state) };
  state.quests[key] = true;
  return { changed: true, allDone: questAllDone(state) };
}

function claimQuest(state, today) {
  if (!refreshDaily(state, today)) return dateFailure();
  if (state.quests.claimed) return { ok: false, msg: "今日小确幸已领 · 明天再来" };
  if (!questAllDone(state)) return { ok: false, msg: "" };
  if (!validCoins(state.coins + QUEST_REWARD)) return balanceFailure();
  state.quests.claimed = true;
  state.coins += QUEST_REWARD;
  return { ok: true, msg: "小确幸达成 +" + QUEST_REWARD + " 安币 · 日子就是这样一点点攒起来的" };
}

function claimHome(state, site, plot, dam = "mangshi") {
  if (typeof dam !== "string" || !Object.hasOwn(ECONOMY.DAMS, dam)) return failure("INVALID_DAM", "这处坝子暂时不能安家");
  if (!Number.isInteger(site) || site < 0 || site > 1 || !Number.isInteger(plot) || plot < 0 || plot > 7) {
    return failure("INVALID_PLOT", "这处土地暂时不能安家");
  }
  if (state.home) return failure("HOME_EXISTS", "已经有家了 · 一处家园，就够安心");
  if (state.coins < ECONOMY.plotPrice) return failure("INSUFFICIENT_COINS", "安币不够，还差 " + (ECONOMY.plotPrice - state.coins) + " 安币");
  state.coins -= ECONOMY.plotPrice;
  state.home = createHome(site, plot, ECONOMY.DAMS[dam].name + " · " + ECONOMY.DAMS[dam].sites[site] + " " + (plot + 1) + " 号地", dam);
  return { ok: true, msg: "安家了 · " + state.home.label };
}

function buildHomeHut(state) {
  if (!state.home) return failure("HOME_MISSING", "先选一处地方安家");
  if (state.home.hut) return failure("HUT_EXISTS", "草棚已经搭好了");
  normalizeHome(state);
  state.home.house = 1;
  state.home.hut = true;
  return { ok: true, msg: "草棚搭好了 · 遮风挡雨，有个落脚处了" };
}

function createHome(site, plot, label, dam = "mangshi") {
  return { site, plot, hut: false, house: 0, label, dam,
    field: false, beds: { crop: null, readyAt: 0 }, harvests: 0,
    animals: { chicken: 0, rabbit: 0, sheep: 0 },
    produce: { egg: 0, wool: 0, fur: 0 },
    basket: { carrot: 0, egg: 0, wool: 0, fur: 0 },
    produceNext: { chicken: 0, rabbit: 0, sheep: 0 } };
}

function normalizeHome(state) {
  if (!state.home) return false;
  const old = state.home;
  if (fields(old, ["site", "plot", "hut", "label"], ["dam", "custom", "basket"])) {
    const home = createHome(old.site, old.plot, old.label, old.dam || "mangshi");
    home.house = old.hut ? 1 : 0;
    home.hut = old.hut;
    if (old.custom) home.custom = { ...old.custom };
    if (old.basket) home.basket = { ...old.basket };
    state.home = home;
    return true;
  }
  let changed = false;
  if (old.dam === undefined) { old.dam = "mangshi"; changed = true; }
  if (old.basket === undefined) { old.basket = { carrot: 0, egg: 0, wool: 0, fur: 0 }; changed = true; }
  return changed;
}

function accrueProduce(state, nowSec) {
  if (!state.home || !validTime(nowSec)) return false;
  normalizeHome(state);
  const home = state.home;
  let changed = false;
  for (const kind of ANIMAL_KINDS) {
    if (!home.animals[kind]) continue;
    const product = HOME.PRODUCE_OF[kind];
    const interval = HOME.PRODUCE_INTERVAL[kind];
    if (!home.produceNext[kind]) {
      home.produceNext[kind] = nowSec + interval;
      changed = true;
    }
    if (home.produceNext[kind] <= nowSec && home.produce[product] < HOME.PRODUCE_CAP) {
      const count = Math.min(HOME.PRODUCE_CAP - home.produce[product],
        Math.floor((nowSec - home.produceNext[kind]) / interval) + 1);
      home.produce[product] += count;
      home.produceNext[kind] += count * interval;
      changed = true;
    }
    if (home.produce[product] >= HOME.PRODUCE_CAP && home.produceNext[kind] <= nowSec) {
      home.produceNext[kind] = nowSec + interval;
      changed = true;
    }
  }
  return changed;
}

function produceValue(state) {
  if (!state.home) return 0;
  normalizeHome(state);
  return PRODUCE_KINDS.reduce((sum, kind) => sum + state.home.produce[kind] * HOME.PRODUCE_SELL[kind], 0);
}

function homeReady(state) {
  if (!state.home) return failure("HOME_MISSING", "先选一处地方安家");
  normalizeHome(state);
  if (!state.home.hut) return failure("HUT_MISSING", "先搭一间草棚");
  return null;
}

function openHomeField(state) {
  const blocked = homeReady(state);
  if (blocked) return blocked;
  if (state.home.field) return failure("FIELD_EXISTS", "田已经开好了");
  state.home.field = true;
  return { ok: true, msg: "田开好了 · 四畦地，种点萝卜吧" };
}

function plantCarrots(state, nowSec) {
  const blocked = homeReady(state);
  if (blocked) return blocked;
  if (!state.home.field) return failure("FIELD_MISSING", "先开一块田");
  if (state.home.beds.crop) return failure("FIELD_OCCUPIED", "田里已经种下了萝卜");
  if (!validTime(nowSec)) return failure("INVALID_TIME", "种植时间无效");
  const cost = HOME.CARROT_SEED_PER_BED * HOME.BEDS;
  if (state.coins < cost) return failure("INSUFFICIENT_COINS", "安币不够，还差 " + (cost - state.coins) + " 安币");
  state.coins -= cost;
  state.home.beds = { crop: "carrot", readyAt: nowSec + HOME.CARROT_GROW_SEC };
  return { ok: true, msg: "种下了 · 慢慢长，不催它" };
}

function harvestCarrots(state, nowSec, today = todayShanghai(nowSec * 1000)) {
  const blocked = homeReady(state);
  if (blocked) return blocked;
  const home = state.home;
  if (!validTime(nowSec)) return failure("INVALID_TIME", "收获时间无效");
  if (!home.beds.crop || nowSec < home.beds.readyAt) return failure("CROP_NOT_READY", "萝卜还没成熟");
  const count = HOME.BEDS * HOME.CARROT_YIELD_PER_BED;
  const basket = { ...home.basket, carrot: home.basket.carrot + count };
  if (!validateBasket(basket) || !Number.isSafeInteger(home.harvests + 1)) return balanceFailure();
  const quest = markQuest(state, today, "harvest");
  if (quest.ok === false) return quest;
  home.basket = basket;
  home.harvests += 1;
  home.beds = { crop: null, readyAt: 0 };
  return { ok: true, count, value: count * HOME.CARROT_SELL, msg: "收了 " + count + " 根萝卜 · 已放进背篓" };
}

function buyHomeAnimal(state, kind, nowSec) {
  const blocked = homeReady(state);
  if (blocked) return blocked;
  if (!ANIMAL_KINDS.includes(kind)) return failure("INVALID_ANIMAL", "这位小住户暂时不能领养");
  if (!validTime(nowSec)) return failure("INVALID_TIME", "领养时间无效");
  if (state.home.animals[kind]) return failure("ANIMAL_EXISTS", "院子里已经有这位小住户了");
  const price = HOME.ANIMAL_PRICE[kind];
  if (state.coins < price) return failure("INSUFFICIENT_COINS", "安币不够，还差 " + (price - state.coins) + " 安币");
  state.coins -= price;
  state.home.animals[kind] = 1;
  state.home.produceNext[kind] = nowSec + HOME.PRODUCE_INTERVAL[kind];
  albumAdd(state, "animals", kind);
  return { ok: true, msg: "领回家了 · 院里多了一位小住户" };
}

function collectHomeProduce(state, nowSec) {
  const blocked = homeReady(state);
  if (blocked) return blocked;
  if (!validTime(nowSec)) return failure("INVALID_TIME", "收获时间无效");
  accrueProduce(state, nowSec);
  const value = produceValue(state);
  if (value <= 0) return failure("PRODUCE_EMPTY", "院子里的出产还在慢慢攒");
  const basket = { ...state.home.basket };
  let count = 0;
  for (const kind of PRODUCE_KINDS) { basket[kind] += state.home.produce[kind]; count += state.home.produce[kind]; }
  if (!validateBasket(basket)) return balanceFailure();
  state.home.basket = basket;
  state.home.produce = { egg: 0, wool: 0, fur: 0 };
  return { ok: true, count, value, msg: "收好 " + count + " 件出产 · 已放进背篓" };
}

function basketValue(state) {
  if (!state.home) return 0;
  normalizeHome(state);
  return BASKET_KINDS.reduce((sum, kind) => sum + state.home.basket[kind] * BASKET_PRICES[kind], 0);
}

function basketCount(state) {
  if (!state.home) return 0;
  normalizeHome(state);
  return BASKET_KINDS.reduce((sum, kind) => sum + state.home.basket[kind], 0);
}

function sellBasket(state) {
  if (!state.home) return failure("HOME_MISSING", "先选一处地方安家");
  normalizeHome(state);
  if (!validateBasket(state.home.basket)) return failure("INVALID_BASKET", "背篓里的物品未通过校验");
  const gain = basketValue(state);
  if (gain <= 0) return failure("BASKET_EMPTY", "背篓里还没有可出售的货物");
  if (!validCoins(state.coins + gain)) return balanceFailure();
  state.coins += gain;
  state.home.basket = { carrot: 0, egg: 0, wool: 0, fur: 0 };
  return { ok: true, gain, msg: "摊子支起来，货都卖出去了 · +" + gain + " 安币" };
}

function upgradeHomeBamboo(state) {
  const blocked = homeReady(state);
  if (blocked) return blocked;
  if (state.home.house >= 2) return failure("HOUSE_COMPLETE", "竹楼已经立起来了");
  if (state.coins < HOME.BAMBOO_PRICE) return failure("INSUFFICIENT_COINS", "安币不够，还差 " + (HOME.BAMBOO_PRICE - state.coins) + " 安币");
  state.coins -= HOME.BAMBOO_PRICE;
  state.home.house = 2;
  return { ok: true, msg: "竹楼立起来了 · 坝上看得见你家了" };
}

function lightCrystal(state, dam) {
  if (typeof dam !== "string" || !Object.hasOwn(ECONOMY.DAMS, dam)) return failure("INVALID_DAM", "这处传送点暂时无法点亮");
  if (!state.lit) state.lit = {};
  if (state.lit[dam] === true) return { ok: true, changed: false, msg: "这座传送点已经点亮了" };
  state.lit[dam] = true;
  return { ok: true, changed: true, msg: ECONOMY.DAMS[dam].name + "的传送点亮了 · 已加入传送网" };
}

function payTeleport(state, destinationDam) {
  if (typeof destinationDam !== "string" || !Object.hasOwn(ECONOMY.DAMS, destinationDam)) return failure("INVALID_DAM", "这处坝子暂时无法传送");
  if (state.lit?.[destinationDam] !== true) return failure("CRYSTAL_UNLIT", "先沿古道去点亮当地的传送点");
  if (state.coins < ECONOMY.teleportPrice) return failure("INSUFFICIENT_COINS", "安币不够 · 传送要 " + ECONOMY.teleportPrice + " 安币");
  state.coins -= ECONOMY.teleportPrice;
  return { ok: true };
}

function buyHorse(state) {
  if (state.horse) return failure("HORSE_EXISTS", "已经领养过骏马了");
  if (state.coins < HOME.HORSE_PRICE) return failure("INSUFFICIENT_COINS", "安币不够 · 骏马要 " + HOME.HORSE_PRICE + " 安币");
  state.coins -= HOME.HORSE_PRICE;
  state.horse = { owned: true, dam: "mangshi", x: ECONOMY.horseStart.x, z: ECONOMY.horseStart.z, bond: BOND.START, careDate: "", careCount: 0 };
  albumAdd(state, "animals", "horse");
  return { ok: true, msg: "骏马领回来了 · 它在芒市坝等你" };
}

function setHorsePosition(state, x, z, dam = state.horse?.dam || "mangshi") {
  if (!state.horse || state.horse.owned !== true) return failure("HORSE_MISSING", "还没有领养骏马");
  if (!validHorsePosition(x, z, dam)) return failure("INVALID_HORSE_POSITION", "骏马的位置超出了坝子的范围");
  const changed = state.horse.x !== x || state.horse.z !== z || state.horse.dam !== dam;
  state.horse.x = x;
  state.horse.z = z;
  state.horse.dam = dam;
  return { ok: true, changed };
}

function claimCustomHome(state, x, z, dam = "mangshi") {
  if (!validHorsePosition(x, z, dam)) return failure("INVALID_PLOT", "这处土地暂时不能安家");
  if (state.home) return failure("HOME_EXISTS", "已经有家了 · 一处家园，就够安心");
  if (state.coins < HOME.CUSTOM_PLOT_PRICE) return failure("INSUFFICIENT_COINS", "安币不够，还差 " + (HOME.CUSTOM_PLOT_PRICE - state.coins) + " 安币");
  state.coins -= HOME.CUSTOM_PLOT_PRICE;
  state.home = createHome(-1, -1, ECONOMY.DAMS[dam].name + " · 自选之地", dam);
  state.home.custom = { x, z };
  return { ok: true, msg: "安家了 · 这块自选之地，从此是你的了" };
}

function normalizeProgress(state) {
  normalizeHome(state);
  if (!state.album) state.album = { landmarks: {}, animals: {}, festivals: {} };
  if (!state.festJoined) state.festJoined = {};
  if (state.horse) {
    if (state.horse.dam === undefined) state.horse.dam = "mangshi";
    if (state.horse.bond === undefined) state.horse.bond = BOND.START;
    if (state.horse.careDate === undefined) state.horse.careDate = "";
    if (state.horse.careCount === undefined) state.horse.careCount = 0;
    albumAdd(state, "animals", "horse");
  }
  if (state.lit === undefined) {
    state.lit = {};
    if (state.home || state.horse || state.coins !== ECONOMY.initialCoins) {
      state.lit.mangshi = true;
      if (state.home) state.lit[state.home.dam || "mangshi"] = true;
      if (state.horse) state.lit[state.horse.dam || "mangshi"] = true;
    }
  }
  for (const kind of ANIMAL_KINDS) if (state.home?.animals?.[kind]) albumAdd(state, "animals", kind);
  for (const fest of Object.keys(state.festJoined)) albumAdd(state, "festivals", fest);
}

function albumAdd(state, group, id) {
  if (!Object.hasOwn(ALBUM_CATALOG, group) || !ALBUM_CATALOG[group].some(item => item.id === id)) return false;
  if (!state.album) state.album = { landmarks: {}, animals: {}, festivals: {} };
  if (state.album[group][id] === true) return false;
  state.album[group][id] = true;
  return true;
}

function activeFestival(today) {
  if (!validDate(today)) return null;
  const value = Number(today.slice(5, 7)) * 100 + Number(today.slice(8));
  return FESTIVALS.find(fest => value >= fest.from[0] * 100 + fest.from[1] && value <= fest.to[0] * 100 + fest.to[1]) || null;
}

function nextFestival(today) {
  if (!validDate(today)) return null;
  const now = Date.parse(today + "T00:00:00Z"), year = Number(today.slice(0, 4));
  let next = null;
  for (const fest of FESTIVALS) {
    const suffix = "-" + String(fest.from[0]).padStart(2, "0") + "-" + String(fest.from[1]).padStart(2, "0");
    let start = Date.parse(String(year).padStart(4, "0") + suffix + "T00:00:00Z");
    if (start < now) start = Date.parse(String(year + 1).padStart(4, "0") + suffix + "T00:00:00Z");
    const days = Math.round((start - now) / 86400000);
    if (!next || days < next.days) next = { fest, days };
  }
  return next;
}

function joinFestival(state, id, today) {
  const fest = activeFestival(today);
  if (typeof id !== "string" || !fest || fest.id !== id) return failure("FESTIVAL_INACTIVE", "这个节日还没到，平时也欢迎来走走");
  if (today < highWaterDay(state)) return dateFailure();
  const year = Number(today.slice(0, 4));
  if (state.festJoined?.[id] >= year) return failure("FESTIVAL_JOINED", "今年的" + fest.name + "已经热闹过了 · 明年再聚");
  if (!validCoins(state.coins + FEST_REWARD)) return balanceFailure();
  if (!state.festJoined) state.festJoined = {};
  state.latestDay = today;
  state.festJoined[id] = year;
  albumAdd(state, "festivals", id);
  state.coins += FEST_REWARD;
  return { ok: true, msg: fest.wish + " · 节日福袋 +" + FEST_REWARD + " 安币" };
}

function bondTier(bond) {
  return bond >= 80 ? "心意相通" : bond >= 50 ? "亲近" : bond >= 20 ? "熟络" : "初识";
}

function careHorse(state, kind, today) {
  if (!state.horse?.owned) return failure("HORSE_MISSING", "还没有领养骏马");
  if (kind !== "feed" && kind !== "brush") return failure("INVALID_CARE", "这次照料没有完成");
  if (!validDate(today) || today < highWaterDay(state)) return dateFailure();
  const horse = state.horse;
  const count = horse.careDate === today ? horse.careCount || 0 : 0;
  if (count >= BOND.DAILY_CARES) return failure("CARE_LIMIT", "今天已经陪过它了 · 明天再来");
  if ((count === 0 && kind !== "feed") || (count === 1 && kind !== "brush")) {
    return failure("CARE_ORDER", count === 0 ? "先喂它一点草料，再梳理鬃毛" : "今天已经喂过了，可以帮它梳梳毛");
  }
  const oldBond = horse.bond === undefined ? BOND.START : horse.bond;
  const before = bondTier(oldBond);
  horse.bond = Math.min(BOND.MAX, oldBond + (kind === "feed" ? BOND.FEED : BOND.BRUSH));
  horse.careDate = today;
  horse.careCount = count + 1;
  state.latestDay = today;
  const after = bondTier(horse.bond);
  return { ok: true, bond: horse.bond, tierUp: before !== after ? after : null,
    msg: (kind === "feed" ? "它低头吃得很香 · 亲密度 " : "鬃毛理顺了，它拿头蹭了蹭你 · 亲密度 ") + horse.bond };
}

function callHorse(state, x, z, dam) {
  if (!state.horse?.owned) return failure("HORSE_MISSING", "还没有领养骏马");
  if ((state.horse.bond ?? BOND.START) < BOND.CALL_AT) return failure("BOND_TOO_LOW", "再陪陪它，慢慢熟悉彼此");
  return setHorsePosition(state, x, z, dam);
}

function normalizeLegacyState(raw) {
  try {
    const state = typeof raw === "string" ? JSON.parse(raw) : clone(raw);
    if (state.home === undefined) state.home = null;
    if (state.horse === undefined) state.horse = null;
    if (state.latestDay === undefined) state.latestDay = highWaterDay({ ...state, latestDay: "" });
    if (!validateState(state)) return failure("SAVE_INVALID_STATE", "旧进度未通过校验，已保留原数据");
    normalizeProgress(state);
    return { ok: true, state };
  } catch { return failure("SAVE_INVALID_STATE", "旧进度未通过校验，已保留原数据"); }
}

function restoreState(target, snapshot) {
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, clone(snapshot));
}

function createStateSession(repository) {
  let loaded;
  try { loaded = repository.load(); } catch { loaded = failure("SAVE_READ_FAILED", "本机进度暂时无法读取"); }
  if (loaded.ok && loaded.state !== null && !validateState(loaded.state)) loaded = failure("SAVE_CORRUPT", "本机进度无效，原数据已保留");
  const state = loaded.ok && loaded.state !== null ? clone(loaded.state) : defaultState();
  if (state.horse === undefined) state.horse = null;
  normalizeProgress(state);
  let committed = clone(state);
  let revision = loaded.ok ? loaded.revision : 0;
  let busy = false;
  const blocked = loaded.ok ? null : loaded;

  function persist() {
    if (blocked) { restoreState(state, committed); return blocked; }
    if (!validateState(state)) { restoreState(state, committed); return failure("SAVE_INVALID_STATE", "进度校验失败，已保留上次进度"); }
    let saved;
    try { saved = repository.save(state, { expectedRevision: revision }); }
    catch { saved = failure("SAVE_WRITE_FAILED", "本机进度未保存，请重试"); }
    if (!saved || saved.ok !== true) {
      restoreState(state, committed);
      return saved || failure("SAVE_WRITE_FAILED", "本机进度未保存，请重试");
    }
    revision = saved.revision;
    committed = clone(state);
    return saved;
  }

  function save() {
    if (busy) return failure("SAVE_BUSY", "正在保存进度，请稍后再试");
    busy = true;
    try { return persist(); } finally { busy = false; }
  }

  function transact(mutator) {
    if (busy) return failure("SAVE_BUSY", "正在保存进度，请稍后再试");
    if (blocked) { restoreState(state, committed); return blocked; }
    busy = true;
    const before = clone(state);
    try {
      const result = mutator(state);
      if (result && (result.ok === false || typeof result.then === "function")) {
        restoreState(state, before);
        return result.ok === false ? result : failure("ASYNC_MUTATION", "进度操作必须同步完成");
      }
      const saved = persist();
      return saved.ok ? { ...saved, result } : saved;
    } catch {
      restoreState(state, before);
      return failure("STATE_UPDATE_FAILED", "这次操作未完成，请重试");
    } finally { busy = false; }
  }

  return Object.freeze({ ok: loaded.ok, error: loaded.error, state, save, transact,
    get revision() { return revision; }, source: loaded.source || "unavailable", cloudSynced: false });
}

module.exports = { defaultState, refreshDaily, doSignin, doJingxin, markQuest, claimQuest, questAllDone,
  claimHome, buildHomeHut, validateState, normalizeLegacyState, createStateSession, todayShanghai,
  createHome, normalizeHome, accrueProduce, produceValue, openHomeField, plantCarrots, harvestCarrots,
  buyHomeAnimal, collectHomeProduce, basketValue, basketCount, sellBasket, upgradeHomeBamboo, lightCrystal, payTeleport, buyHorse, setHorsePosition,
  claimCustomHome, careHorse, callHorse, bondTier, albumAdd, activeFestival, nextFestival, joinFestival, computeSky,
  HOME, ECONOMY, MILESTONES, QUEST_REWARD, BOND, FESTIVALS, FEST_REWARD };
