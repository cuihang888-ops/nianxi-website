import test from "node:test";
import assert from "node:assert/strict";
import Daily from "../wechat/vendor/daily-state.cjs";
import { createLocalSaveRepository } from "../wechat/platform/save-repository.js";

const DAY = "2026-11-13";
const clone = value => JSON.parse(JSON.stringify(value));
const horse = (x, z, dam = "mangshi") => ({ owned: true, dam, x, z, bond: 10, careDate: "", careCount: 0 });
function fixture() {
  const entries = new Map();
  let failWrites = false;
  const storage = {
    getItem: key => entries.get(key) ?? null,
    setItem(key, value) {
      if (failWrites) throw new Error("quota");
      entries.set(key, value);
    },
  };
  const repository = createLocalSaveRepository(storage, {
    namespace: "daily-test", validate: Daily.validateState, now: () => Date.parse(DAY),
  });
  return { entries, repository, storage, set failWrites(value) { failWrites = value; } };
}

test("preview economy keeps Muse's current values isolated", () => {
  assert.equal(Daily.defaultState().coins, 1200);
  assert.equal(Daily.ECONOMY.signinCoins, 5);
  assert.equal(Daily.ECONOMY.questReward, 40);
  assert.equal(Daily.ECONOMY.plotPrice, 400);
  assert.equal(Daily.ECONOMY.carrotSale, 15);
  assert.deepEqual(Daily.MILESTONES, { 3: 60, 7: 150, 15: 350, 25: 700 });
  assert.equal(Daily.validateState(Daily.defaultState()), true);
});

test("state validation rejects invalid homes, balances, dates and accessor data", () => {
  const cases = [
    state => { state.coins = -1; },
    state => { state.coins = Infinity; },
    state => { state.coins = Number.MAX_SAFE_INTEGER + 1; },
    state => { state.latestDay = "2026-02-30"; },
    state => { state.signin = { month: "2026-11", days: [1, 1], last: "2026-11-01" }; },
    state => { state.signin = { month: "2026-02", days: [30], last: "" }; },
    state => { state.signin = { month: "2026-11", days: [1], last: DAY }; },
    state => { state.quests.claimed = true; },
    state => { state.home = { site: 2, plot: 0, hut: false, label: "home" }; },
    state => { state.home = { site: 0, plot: 8, hut: false, label: "home" }; },
    state => { state.home = { site: 0, plot: 0, hut: 1, label: "home" }; },
    state => { state.home = { site: 0, plot: 0, hut: true, label: "bad\nlabel" }; },
    state => { state.extra = true; },
  ];
  for (const change of cases) {
    const state = Daily.defaultState();
    change(state);
    assert.equal(Daily.validateState(state), false);
  }
  let reads = 0;
  const state = Daily.defaultState();
  Object.defineProperty(state, "coins", { enumerable: true, get() { reads += 1; return 1200; } });
  assert.equal(Daily.validateState(state), false);
  const another = Daily.defaultState();
  another.signin.days = [1];
  Object.defineProperty(another.signin.days, "0", { enumerable: true, get() { reads += 1; return 1; } });
  assert.equal(Daily.validateState(another), false);
  assert.equal(reads, 0);
});

test("Shanghai midnight is independent of the host timezone", () => {
  assert.equal(Daily.todayShanghai(Date.parse("2026-11-12T15:59:59Z")), "2026-11-12");
  assert.equal(Daily.todayShanghai(Date.parse("2026-11-12T16:00:00Z")), DAY);
  assert.throws(() => Daily.todayShanghai(NaN), TypeError);
});

test("signin milestones reward once and clock rollback cannot reset accumulated days", () => {
  const state = Daily.defaultState();
  for (const day of [1, 2, 3]) assert.equal(Daily.doSignin(state, `2026-11-0${day}`).ok, true);
  assert.equal(state.coins, 1275);
  assert.deepEqual(state.signin.days, [1, 2, 3]);
  assert.equal(Daily.doSignin(state, "2026-11-03").ok, false);
  const before = clone(state);
  assert.equal(Daily.doSignin(state, "2026-11-02").error.code, "CLOCK_ROLLBACK");
  assert.equal(Daily.refreshDaily(state, "2026-10-31"), false);
  assert.deepEqual(state, before);
  assert.equal(Daily.doSignin(state, "2026-12-01").ok, true);
  assert.equal(state.coins, 1280);
  assert.deepEqual(state.signin.days, [1]);
  assert.equal(Daily.doSignin(state, "2026-11-03").error.code, "CLOCK_ROLLBACK");
  assert.deepEqual(state.signin.days, [1]);
});

test("quests reward once per day, reset forward and reject arbitrary keys", () => {
  const state = Daily.defaultState();
  for (const key of ["fed", "harvest"]) assert.equal(Daily.markQuest(state, DAY, key).changed, true);
  assert.equal(Daily.doJingxin(state, DAY).ok, true);
  assert.equal(Daily.claimQuest(state, DAY).ok, true);
  assert.equal(state.coins, 1240);
  assert.equal(Daily.claimQuest(state, DAY).ok, false);
  assert.equal(Daily.markQuest(state, DAY, "__proto__").error.code, "INVALID_QUEST");
  assert.equal(Daily.refreshDaily(state, "2026-11-14"), true);
  assert.equal(Daily.questAllDone(state), false);
  assert.equal(Daily.claimQuest(state, DAY).error.code, "CLOCK_ROLLBACK");
  assert.equal(state.coins, 1240);
  assert.equal(state.jingxinDate, DAY);
});

test("UI save failures restore the same state root and allow a clean retry", () => {
  const f = fixture();
  const session = Daily.createStateSession(f.repository);
  const state = session.state;
  assert.equal(session.save().ok, true);
  const raw = f.entries.get("daily-test:save");
  f.failWrites = true;
  assert.equal(Daily.doSignin(state, DAY).ok, true);
  assert.equal(session.save().error.code, "SAVE_WRITE_FAILED");
  assert.equal(session.state, state);
  assert.deepEqual(state, Daily.defaultState());
  assert.equal(session.revision, 1);
  assert.equal(f.entries.get("daily-test:save"), raw);
  f.failWrites = false;
  assert.equal(Daily.doSignin(state, DAY).ok, true);
  assert.equal(session.save().ok, true);
  assert.equal(session.revision, 2);
  const reopened = Daily.createStateSession(f.repository);
  assert.equal(reopened.state.coins, 1205);
  assert.equal(Daily.doSignin(reopened.state, DAY).ok, false);
});

test("home purchase commits before visual success and recovers with hut on restart", () => {
  const f = fixture();
  const session = Daily.createStateSession(f.repository);
  f.failWrites = true;
  assert.equal(session.transact(state => Daily.claimHome(state, 1, 7)).ok, false);
  assert.equal(session.state.coins, 1200);
  assert.equal(session.state.home, null);
  f.failWrites = false;
  const bought = session.transact(state => Daily.claimHome(state, 1, 7));
  assert.equal(bought.ok, true);
  assert.equal(bought.result.ok, true);
  assert.equal(session.state.coins, 800);
  assert.equal(session.transact(state => Daily.claimHome(state, 0, 0)).error.code, "HOME_EXISTS");
  assert.equal(session.state.coins, 800);
  assert.equal(session.transact(Daily.buildHomeHut).ok, true);
  const reopened = Daily.createStateSession(f.repository);
  assert.deepEqual(reopened.state.home, { ...Daily.createHome(1, 7, "芒市坝 · 东基址 8 号地"), hut: true, house: 1 });
  assert.equal(reopened.state.coins, 800);
  assert.equal(reopened.transact(Daily.buildHomeHut).error.code, "HUT_EXISTS");
});

test("invalid or failed transactions roll back and reentrant save cannot double-write", () => {
  const f = fixture();
  const session = Daily.createStateSession(f.repository);
  assert.equal(session.transact(state => { state.coins = -1; }).error.code, "SAVE_INVALID_STATE");
  assert.equal(session.state.coins, 1200);
  assert.equal(session.transact(state => { state.coins = 0; throw new Error("bad"); }).error.code, "STATE_UPDATE_FAILED");
  assert.equal(session.state.coins, 1200);
  let reentrant;
  assert.equal(session.transact(state => {
    reentrant = session.transact(inner => { inner.coins = 0; });
    return Daily.doSignin(state, DAY);
  }).ok, true);
  assert.equal(reentrant.error.code, "SAVE_BUSY");
  assert.equal(session.revision, 1);
  assert.equal(session.state.coins, 1205);
});

test("corrupt saves remain untouched and read-only preview cannot overwrite them", () => {
  const f = fixture();
  f.entries.set("daily-test:save", "{bad-json");
  const session = Daily.createStateSession(f.repository);
  assert.equal(session.ok, false);
  assert.equal(session.error.code, "SAVE_CORRUPT");
  assert.equal(session.state.coins, 1200);
  Daily.doSignin(session.state, DAY);
  assert.equal(session.save().ok, false);
  assert.equal(session.state.coins, 1200);
  let called = false;
  assert.equal(session.transact(() => { called = true; }).ok, false);
  assert.equal(called, false);
  assert.equal(f.entries.get("daily-test:save"), "{bad-json");
});

test("concurrent sessions cannot overwrite newer balances", () => {
  const f = fixture();
  const first = Daily.createStateSession(f.repository);
  const second = Daily.createStateSession(f.repository);
  assert.equal(first.transact(state => Daily.claimHome(state, 0, 0)).ok, true);
  assert.equal(second.transact(state => Daily.claimHome(state, 1, 0)).error.code, "SAVE_CONFLICT");
  assert.equal(second.state.home, null);
  assert.equal(second.state.coins, 1200);
  assert.equal(f.repository.load().state.home.site, 0);
});

test("legacy migration is explicit, preserves progress and does not mutate its source", () => {
  const old = Daily.defaultState();
  Daily.doSignin(old, DAY);
  delete old.home;
  delete old.latestDay;
  const before = clone(old);
  const migrated = Daily.normalizeLegacyState(old);
  assert.equal(migrated.ok, true);
  assert.deepEqual(old, before);
  assert.equal(migrated.state.coins, 1205);
  assert.deepEqual(migrated.state.signin.days, [13]);
  assert.equal(migrated.state.home, null);
  assert.equal(migrated.state.latestDay, DAY);
  assert.equal(Daily.doSignin(migrated.state, "2026-11-12").ok, false);
  assert.equal(Daily.normalizeLegacyState("{broken").ok, false);
  assert.equal(Daily.normalizeLegacyState({ ...old, coins: -1 }).ok, false);
});

test("round 13 homes migrate without losing a purchased plot or shelter", () => {
  const f = fixture();
  const old = Daily.defaultState();
  old.coins = 800;
  old.home = { site: 1, plot: 3, hut: true, label: "old home" };
  assert.equal(f.repository.save(old, { expectedRevision: 0 }).ok, true);
  const session = Daily.createStateSession(f.repository);
  assert.equal(session.ok, true);
  assert.equal(session.state.home.house, 1);
  assert.equal(session.state.home.hut, true);
  assert.equal(session.state.home.field, false);
  assert.equal(session.state.coins, 800);
  assert.equal(session.save().ok, true);
  assert.deepEqual(f.repository.load().state, session.state);
});

test("half-coin portal charges persist and reject other fractional or unsafe balances", () => {
  const f = fixture();
  const session = Daily.createStateSession(f.repository);
  assert.equal(session.transact(state => Daily.lightCrystal(state, "ruili")).ok, true);
  assert.equal(session.transact(state => Daily.payTeleport(state, "ruili")).ok, true);
  assert.equal(session.state.coins, 1199.5);
  assert.equal(Daily.createStateSession(f.repository).state.coins, 1199.5);
  assert.equal(session.transact(state => { state.coins = 1.2; }).ok, false);
  assert.equal(session.state.coins, 1199.5);
  session.state.coins = 0.5;
  assert.equal(session.transact(state => Daily.payTeleport(state, "ruili")).ok, true);
  assert.equal(session.state.coins, 0);
  assert.equal(session.transact(state => Daily.payTeleport(state, "ruili")).ok, false);
});

test("crystal unlocks are free, idempotent and whitelist five dams", () => {
  const state = Daily.defaultState();
  assert.deepEqual(state.lit, {});
  assert.equal(Daily.payTeleport(state, "ruili").error.code, "CRYSTAL_UNLIT");
  assert.equal(state.coins, 1200);
  for (const dam of Object.keys(Daily.ECONOMY.DAMS)) {
    assert.equal(Daily.lightCrystal(state, dam).changed, true);
    assert.equal(Daily.lightCrystal(state, dam).changed, false);
  }
  assert.equal(state.coins, 1200);
  assert.equal(Daily.validateState(state), true);
  for (const dam of [undefined, null, 0, "", "unknown", "__proto__", "constructor"]) {
    const before = clone(state);
    assert.equal(Daily.lightCrystal(state, dam).error.code, "INVALID_DAM");
    assert.equal(Daily.payTeleport(state, dam).error.code, "INVALID_DAM");
    assert.deepEqual(state, before);
  }
  assert.equal(Daily.payTeleport(state, "ruili", 0).ok, true);
  assert.equal(state.coins, 1199.5);
  for (const lit of [null, [], { ruili: false }, { mangshi: 1 }, { unknown: true }, { constructor: true }]) {
    assert.equal(Daily.validateState({ ...state, lit }), false);
  }
  let reads = 0;
  const lit = {};
  Object.defineProperty(lit, "ruili", { enumerable: true, get() { reads++; return true; } });
  assert.equal(Daily.validateState({ ...state, lit }), false);
  assert.equal(reads, 0);
});

test("missing legacy crystal map migrates only established progress and preserves explicit unlocks", () => {
  for (const mutate of [
    state => {},
    state => { state.coins = 1199.5; },
    state => { Daily.claimHome(state, 0, 0, "ruili"); Daily.buyHorse(state); },
    state => { state.coins = 3000; Daily.claimHome(state, 0, 0, "ruili"); Daily.buyHorse(state); Daily.setHorsePosition(state, 20, 30, "lianghe"); },
  ]) {
    const old = Daily.defaultState();
    mutate(old);
    delete old.lit;
    const before = clone(old);
    const migrated = Daily.normalizeLegacyState(old);
    assert.equal(migrated.ok, true);
    assert.deepEqual(old, before);
    const expected = {};
    if (old.home || old.horse || old.coins !== 1200) {
      expected.mangshi = true;
      if (old.home) expected[old.home.dam || "mangshi"] = true;
      if (old.horse) expected[old.horse.dam || "mangshi"] = true;
    }
    assert.deepEqual(migrated.state.lit, expected);
    assert.equal(migrated.state.coins, old.coins);
    const f = fixture();
    assert.equal(f.repository.save(old, { expectedRevision: 0 }).ok, true);
    const session = Daily.createStateSession(f.repository);
    assert.deepEqual(session.state.lit, expected);
    assert.equal(session.save().ok, true);
    assert.deepEqual(Daily.createStateSession(f.repository).state.lit, expected);
  }
  const established = Daily.defaultState();
  Daily.claimHome(established, 0, 0, "ruili");
  assert.deepEqual(Daily.normalizeLegacyState(established).state.lit, {});
  established.lit = { yingjiang: true };
  assert.deepEqual(Daily.normalizeLegacyState(established).state.lit, { yingjiang: true });
});

test("failed crystal and paid travel saves roll back unlocks and balances", () => {
  const f = fixture();
  const session = Daily.createStateSession(f.repository);
  f.failWrites = true;
  assert.equal(session.transact(state => Daily.lightCrystal(state, "ruili")).ok, false);
  assert.deepEqual(session.state.lit, {});
  assert.equal(session.state.coins, 1200);
  f.failWrites = false;
  assert.equal(session.transact(state => Daily.lightCrystal(state, "ruili")).ok, true);
  f.failWrites = true;
  assert.equal(session.transact(state => Daily.payTeleport(state, "ruili")).ok, false);
  assert.equal(session.state.coins, 1200);
  assert.deepEqual(session.state.lit, { ruili: true });
  f.failWrites = false;
  assert.equal(session.transact(state => Daily.payTeleport(state, "ruili")).ok, true);
  assert.equal(session.state.coins, 1199.5);
});

function homeSession() {
  const f = fixture();
  const session = Daily.createStateSession(f.repository);
  session.transact(state => Daily.claimHome(state, 0, 0));
  session.transact(Daily.buildHomeHut);
  session.transact(Daily.openHomeField);
  return { ...f, f, session };
}

test("carrot cost, maturity and harvest persist with real epoch seconds and roll back failed saves", () => {
  const { f, session } = homeSession();
  const now = Math.floor(Date.parse("2026-11-13T02:00:00Z") / 1000);
  assert.equal(session.transact(state => Daily.plantCarrots(state, now)).ok, true);
  assert.equal(session.state.coins, 728);
  assert.equal(session.state.home.beds.readyAt, now + 60);
  assert.equal(session.transact(state => Daily.harvestCarrots(state, now + 59)).error.code, "CROP_NOT_READY");
  f.failWrites = true;
  assert.equal(session.transact(state => Daily.harvestCarrots(state, now + 60)).error.code, "SAVE_WRITE_FAILED");
  assert.equal(session.state.home.beds.crop, "carrot");
  assert.equal(session.state.coins, 728);
  f.failWrites = false;
  const harvested = session.transact(state => Daily.harvestCarrots(state, now + 60));
  assert.equal(harvested.result.value, 120);
  assert.equal(harvested.result.count, 8);
  assert.equal(session.state.coins, 728);
  assert.equal(session.state.home.basket.carrot, 8);
  assert.equal(session.state.home.harvests, 1);
  assert.equal(session.state.quests.harvest, true);
  assert.equal(session.transact(state => Daily.harvestCarrots(state, now + 60)).ok, false);
  assert.equal(Daily.createStateSession(f.repository).state.home.harvests, 1);
});

test("animal production caps offline income and persists the next timestamp while already full", () => {
  const { f, session } = homeSession();
  const now = Math.floor(Date.parse("2026-11-13T02:00:00Z") / 1000);
  assert.equal(session.transact(state => Daily.buyHomeAnimal(state, "chicken", now)).ok, true);
  assert.equal(session.state.coins, 660);
  assert.equal(session.transact(state => Daily.buyHomeAnimal(state, "chicken", now)).error.code, "ANIMAL_EXISTS");
  assert.equal(session.transact(state => Daily.buyHomeAnimal(state, "horse", now)).error.code, "INVALID_ANIMAL");
  assert.equal(Daily.accrueProduce(session.state, now + 44), false);
  assert.equal(Daily.accrueProduce(session.state, now + 45), true);
  assert.equal(session.state.home.produce.egg, 1);
  assert.equal(session.save().ok, true);
  assert.equal(Daily.accrueProduce(session.state, now + 9000), true);
  assert.equal(session.state.home.produce.egg, 3);
  assert.equal(session.state.home.produceNext.chicken, now + 9045);
  assert.equal(session.save().ok, true);
  assert.equal(Daily.accrueProduce(session.state, now + 9046), true);
  assert.equal(session.state.home.produceNext.chicken, now + 9091);
  assert.equal(session.save().ok, true);
  const reopened = Daily.createStateSession(f.repository);
  assert.equal(reopened.state.home.produceNext.chicken, now + 9091);
  assert.equal(Daily.accrueProduce(reopened.state, now), false);
  f.failWrites = true;
  assert.equal(reopened.transact(state => Daily.collectHomeProduce(state, now + 9046)).ok, false);
  assert.equal(reopened.state.home.produce.egg, 3);
  assert.equal(reopened.state.coins, 660);
  f.failWrites = false;
  assert.equal(reopened.transact(state => Daily.collectHomeProduce(state, now + 9046)).result.value, 48);
  assert.equal(reopened.state.coins, 660);
  assert.equal(reopened.state.home.basket.egg, 3);
  assert.equal(reopened.state.home.produce.egg, 0);
  assert.equal(reopened.transact(state => Daily.collectHomeProduce(state, now + 9046)).ok, false);
  assert.equal(Daily.accrueProduce(reopened.state, now + 9090), false);
  assert.equal(Daily.accrueProduce(reopened.state, now + 9091), true);
});

test("home caps and field relationships reject corrupt progress", () => {
  const cases = [
    h => { h.animals.chicken = 2; },
    h => { h.produce.egg = 4; },
    h => { h.produceNext.chicken = -1; },
    h => { h.house = 3; },
    h => { h.house = 1; },
    h => { h.beds = { crop: "carrot", readyAt: 100 }; },
    h => { h.beds = { crop: null, readyAt: 100 }; },
  ];
  for (const change of cases) {
    const state = Daily.defaultState();
    state.home = Daily.createHome(0, 0, "home");
    change(state.home);
    assert.equal(Daily.validateState(state), false);
  }
});

test("round 14 saves acquire an empty horse slot without resetting home or balance", () => {
  const f = fixture();
  const old = Daily.defaultState();
  old.coins = 799.5;
  old.home = Daily.createHome(0, 2, "home");
  delete old.horse;
  assert.equal(Daily.validateState(old), true);
  assert.equal(f.repository.save(old, { expectedRevision: 0 }).ok, true);
  const session = Daily.createStateSession(f.repository);
  assert.equal(session.ok, true);
  assert.equal(session.state.horse, null);
  assert.equal(session.state.coins, 799.5);
  assert.equal(session.state.home.plot, 2);
  assert.equal(session.save().ok, true);
  assert.equal(Daily.createStateSession(f.repository).state.horse, null);
});

test("horse purchase and position save are transactional and survive reload", () => {
  const f = fixture();
  const session = Daily.createStateSession(f.repository);
  f.failWrites = true;
  assert.equal(session.transact(Daily.buyHorse).error.code, "SAVE_WRITE_FAILED");
  assert.equal(session.state.coins, 1200);
  assert.equal(session.state.horse, null);
  f.failWrites = false;
  assert.equal(session.transact(Daily.buyHorse).ok, true);
  assert.equal(session.state.coins, 0);
  assert.deepEqual(session.state.horse, horse(17, 51));
  assert.equal(session.transact(Daily.buyHorse).error.code, "HORSE_EXISTS");
  assert.equal(session.transact(state => Daily.setHorsePosition(state, 100.25, -30.75)).ok, true);
  assert.deepEqual(Daily.createStateSession(f.repository).state.horse, horse(100.25, -30.75));
  f.failWrites = true;
  assert.equal(session.transact(state => Daily.setHorsePosition(state, 1, 1)).ok, false);
  assert.deepEqual(session.state.horse, horse(100.25, -30.75));
});

test("horse validation rejects non-finite and out-of-bounds positions without deducting coins", () => {
  const state = Daily.defaultState();
  state.coins = 1199.5;
  assert.equal(Daily.buyHorse(state).error.code, "INSUFFICIENT_COINS");
  assert.equal(state.horse, null);
  assert.equal(state.coins, 1199.5);
  state.coins = 1200;
  Daily.buyHorse(state);
  for (const [x, z] of [[NaN, 1], [Infinity, 0], [266, 0], [0, -216], [265, 215], ["1", 1]]) {
    assert.equal(Daily.setHorsePosition(state, x, z).error.code, "INVALID_HORSE_POSITION");
    const bad = clone(state);
    bad.horse = { owned: true, x, z };
    assert.equal(Daily.validateState(bad), false);
  }
  assert.deepEqual(state.horse, horse(17, 51));
  state.horse = { owned: false, x: 0, z: 0 };
  assert.equal(Daily.validateState(state), false);
  state.horse = { owned: true, x: 265, z: 0 };
  assert.equal(Daily.validateState(state), true);
});

test("round 15 saves migrate homes and horses into mangshi without moving them", () => {
  const f = fixture();
  const old = Daily.defaultState();
  old.home = Daily.createHome(1, 5, "existing home");
  delete old.home.dam;
  old.horse = { owned: true, x: 250, z: 0 };
  assert.equal(f.repository.save(old, { expectedRevision: 0 }).ok, true);
  const session = Daily.createStateSession(f.repository);
  assert.equal(session.ok, true);
  assert.equal(session.state.home.dam, "mangshi");
  assert.deepEqual(session.state.horse, horse(250, 0));
  assert.equal(session.save().ok, true);
});

test("homes keep dam identity across saves and reject unknown destinations", () => {
  for (const dam of ["mangshi", "ruili", "yingjiang", "longchuan", "lianghe"]) {
    const f = fixture();
    const session = Daily.createStateSession(f.repository);
    assert.equal(session.transact(state => Daily.claimHome(state, 1, 7, dam)).ok, true);
    assert.equal(session.state.home.dam, dam);
    assert.ok(session.state.home.label.startsWith(Daily.ECONOMY.DAMS[dam].name));
    assert.equal(Daily.createStateSession(f.repository).state.home.dam, dam);
  }
  const state = Daily.defaultState();
  assert.equal(Daily.claimHome(state, 0, 0, "unknown").error.code, "INVALID_DAM");
  assert.equal(state.coins, 1200);
  state.home = Daily.createHome(0, 0, "bad", "unknown");
  assert.equal(Daily.validateState(state), false);
});

test("horse bounds follow its saved dam and invalid changes roll back", () => {
  const f = fixture();
  const session = Daily.createStateSession(f.repository);
  session.transact(Daily.buyHorse);
  assert.equal(session.transact(state => Daily.setHorsePosition(state, 254, 0, "yingjiang")).ok, true);
  assert.equal(session.state.horse.dam, "yingjiang");
  assert.equal(session.transact(state => Daily.setHorsePosition(state, 254, 0, "ruili")).ok, false);
  assert.equal(session.state.horse.dam, "yingjiang");
  assert.equal(session.transact(state => Daily.setHorsePosition(state, 248, 0, "lianghe")).ok, true);
  assert.equal(session.transact(state => Daily.setHorsePosition(state, 249, 0, "lianghe")).ok, false);
  assert.equal(session.transact(state => Daily.setHorsePosition(state, 1, 1, "__proto__")).ok, false);
  assert.deepEqual(Daily.createStateSession(f.repository).state.horse, horse(248, 0, "lianghe"));
});

test("festival rewards require configured dates, reject forged objects and prevent annual replay", () => {
  const f = fixture();
  const session = Daily.createStateSession(f.repository);
  assert.equal(Daily.activeFestival("2026-04-10").id, "songkran");
  assert.equal(Daily.activeFestival("2026-04-16").id, "songkran");
  assert.equal(Daily.activeFestival("2026-04-17"), null);
  assert.equal(Daily.activeFestival(new Date()), null);
  assert.equal(Daily.nextFestival("2026-11-13").fest.id, "munao");
  assert.equal(Daily.nextFestival("2026-11-13").days, 91);
  assert.equal(session.transact(state => Daily.joinFestival(state, "songkran", DAY)).error.code, "FESTIVAL_INACTIVE");
  assert.equal(session.transact(state => Daily.joinFestival(state, { id: "songkran" }, "2026-04-12")).ok, false);
  f.failWrites = true;
  assert.equal(session.transact(state => Daily.joinFestival(state, "songkran", "2026-04-12")).ok, false);
  assert.equal(session.state.coins, 1200);
  assert.deepEqual(session.state.festJoined, {});
  assert.deepEqual(session.state.album.festivals, {});
  f.failWrites = false;
  assert.equal(session.transact(state => Daily.joinFestival(state, "songkran", "2026-04-12")).ok, true);
  assert.equal(session.state.coins, 1230);
  assert.equal(session.state.album.festivals.songkran, true);
  assert.equal(session.transact(state => Daily.joinFestival(state, "songkran", "2026-04-13")).error.code, "FESTIVAL_JOINED");
  assert.equal(session.transact(state => Daily.joinFestival(state, "songkran", "2025-04-12")).ok, false);
  assert.equal(session.transact(state => Daily.joinFestival(state, "songkran", "2027-04-12")).ok, true);
  assert.equal(session.state.coins, 1260);
  assert.equal(Daily.createStateSession(f.repository).state.festJoined.songkran, 2027);
});

test("album validates catalog IDs and purchase rewards persist in the same transaction", () => {
  const f = fixture();
  const session = Daily.createStateSession(f.repository);
  assert.equal(Daily.albumAdd(session.state, "__proto__", "evil"), false);
  assert.equal(Daily.albumAdd(session.state, "landmarks", "unknown"), false);
  assert.equal(session.transact(state => Daily.albumAdd(state, "landmarks", "ms-temple")).ok, true);
  assert.equal(Daily.albumAdd(session.state, "landmarks", "ms-temple"), false);
  f.failWrites = true;
  assert.equal(session.transact(Daily.buyHorse).ok, false);
  assert.deepEqual(session.state.album.animals, {});
  f.failWrites = false;
  assert.equal(session.transact(Daily.buyHorse).ok, true);
  assert.equal(Daily.createStateSession(f.repository).state.album.animals.horse, true);
  const old = Daily.defaultState();
  old.home = Daily.createHome(0, 0, "home");
  old.home.hut = true; old.home.house = 1; old.home.animals.sheep = 1;
  old.horse = { owned: true, dam: "mangshi", x: 17, z: 51 };
  delete old.album; delete old.festJoined;
  const migrated = Daily.normalizeLegacyState(old);
  assert.equal(migrated.ok, true);
  assert.deepEqual(migrated.state.album.animals, { horse: true, sheep: true });
  assert.equal(migrated.state.horse.bond, 10);
});

test("horse care is daily, rollback-safe and cannot replay via a backward clock", () => {
  const f = fixture();
  const session = Daily.createStateSession(f.repository);
  session.transact(Daily.buyHorse);
  assert.equal(session.transact(state => Daily.careHorse(state, "brush", DAY)).error.code, "CARE_ORDER");
  assert.equal(session.state.horse.careCount, 0);
  f.failWrites = true;
  assert.equal(session.transact(state => Daily.careHorse(state, "feed", DAY)).ok, false);
  assert.equal(session.state.horse.bond, 10);
  assert.equal(session.state.horse.careCount, 0);
  f.failWrites = false;
  assert.equal(session.transact(state => Daily.careHorse(state, "feed", DAY)).result.bond, 16);
  assert.equal(session.transact(state => Daily.careHorse(state, "feed", DAY)).error.code, "CARE_ORDER");
  assert.equal(session.state.horse.bond, 16);
  assert.equal(session.transact(state => Daily.careHorse(state, "brush", DAY)).result.bond, 20);
  assert.equal(Daily.bondTier(session.state.horse.bond), "熟络");
  assert.equal(session.transact(state => Daily.careHorse(state, "feed", DAY)).error.code, "CARE_LIMIT");
  assert.equal(session.transact(state => Daily.careHorse(state, "feed", "2026-11-12")).error.code, "CLOCK_ROLLBACK");
  assert.equal(session.transact(state => Daily.careHorse(state, "invalid", "2026-11-14")).error.code, "INVALID_CARE");
  assert.equal(session.transact(state => Daily.careHorse(state, "feed", "2026-11-14")).result.bond, 26);
  session.transact(state => { state.horse.bond = 99; });
  assert.equal(session.transact(state => Daily.careHorse(state, "brush", "2026-11-14")).result.bond, 100);
  assert.equal(Daily.createStateSession(f.repository).state.horse.careCount, 2);
});

test("horse call validates bond and destination and rolls back failed cross-dam saves", () => {
  const f = fixture();
  const session = Daily.createStateSession(f.repository);
  session.transact(Daily.buyHorse);
  assert.equal(session.transact(state => Daily.callHorse(state, 12, 42, "ruili")).error.code, "BOND_TOO_LOW");
  session.transact(state => { state.horse.bond = 80; });
  f.failWrites = true;
  assert.equal(session.transact(state => Daily.callHorse(state, 12, 42, "ruili")).ok, false);
  assert.equal(session.state.horse.dam, "mangshi");
  f.failWrites = false;
  assert.equal(session.transact(state => Daily.callHorse(state, 12, 42, "ruili")).ok, true);
  assert.equal(session.state.horse.dam, "ruili");
  assert.equal(session.transact(state => Daily.callHorse(state, 900, 42, "ruili")).ok, false);
  assert.equal(session.state.horse.x, 12);
});

test("custom home charges 600 once and retains precise validated coordinates", () => {
  const f = fixture();
  const session = Daily.createStateSession(f.repository);
  assert.equal(session.transact(state => Daily.claimCustomHome(state, NaN, 1, "ruili")).ok, false);
  assert.equal(session.transact(state => Daily.claimCustomHome(state, 1000, 1, "ruili")).ok, false);
  f.failWrites = true;
  assert.equal(session.transact(state => Daily.claimCustomHome(state, 100.125, 24.75, "ruili")).ok, false);
  assert.equal(session.state.home, null);
  assert.equal(session.state.coins, 1200);
  f.failWrites = false;
  assert.equal(session.transact(state => Daily.claimCustomHome(state, 100.125, 24.75, "ruili")).ok, true);
  assert.equal(session.state.coins, 600);
  assert.equal(session.state.home.site, -1);
  assert.equal(session.state.home.plot, -1);
  assert.deepEqual(session.state.home.custom, { x: 100.125, z: 24.75 });
  assert.equal(session.transact(Daily.buildHomeHut).ok, true);
  assert.equal(Daily.createStateSession(f.repository).state.home.dam, "ruili");
  assert.equal(session.transact(state => Daily.claimCustomHome(state, 80, 24, "ruili")).error.code, "HOME_EXISTS");
});

test("new state schema rejects malformed album, festival, bond and custom-home data", () => {
  const badChanges = [
    state => { state.album.landmarks.unknown = true; },
    state => { state.album.animals.horse = "true"; },
    state => { state.festJoined.songkran = "2026"; },
    state => { state.festJoined.unknown = 2026; },
    state => { state.horse = { ...horse(0, 0), bond: 101 }; },
    state => { state.horse = { ...horse(0, 0), careCount: 3 }; },
    state => { state.horse = { ...horse(0, 0), careCount: 1 }; },
    state => { state.horse = { ...horse(0, 0), careDate: "2026-02-30" }; },
    state => { state.horse = { ...horse(0, 0), dam: ["mangshi"] }; },
    state => { state.home = { ...Daily.createHome(-1, 0, "bad"), custom: { x: 0, z: 0 } }; },
    state => { state.home = { ...Daily.createHome(-1, -1, "bad"), custom: { x: 999, z: 0 } }; },
    state => { state.home = { ...Daily.createHome(0, 0, "bad"), dam: ["mangshi"] }; },
  ];
  for (const change of badChanges) {
    const state = Daily.defaultState();
    change(state);
    assert.equal(Daily.validateState(state), false);
  }
});

test("legacy homes gain an empty basket without changing their existing money", () => {
  const f = fixture();
  const old = Daily.defaultState();
  old.home = Daily.createHome(0, 0, "home");
  old.coins = 12345.5;
  delete old.home.basket;
  assert.equal(f.repository.save(old, { expectedRevision: 0 }).ok, true);
  const session = Daily.createStateSession(f.repository);
  assert.equal(session.ok, true);
  assert.equal(session.state.coins, 12345.5);
  assert.deepEqual(session.state.home.basket, { carrot: 0, egg: 0, wool: 0, fur: 0 });
  assert.equal(session.save().ok, true);
  assert.equal(Daily.createStateSession(f.repository).state.coins, 12345.5);
});

test("basket sale is atomic, repeat-safe and survives restart", () => {
  const { f, session } = homeSession();
  session.transact(state => { state.home.basket = { carrot: 8, egg: 2, wool: 1, fur: 1 }; });
  assert.equal(Daily.basketCount(session.state), 12);
  assert.equal(Daily.basketValue(session.state), 206);
  f.failWrites = true;
  assert.equal(session.transact(Daily.sellBasket).error.code, "SAVE_WRITE_FAILED");
  assert.equal(session.state.coins, 800);
  assert.equal(Daily.basketCount(session.state), 12);
  f.failWrites = false;
  assert.equal(session.transact(Daily.sellBasket).result.gain, 206);
  assert.equal(session.state.coins, 1006);
  assert.equal(Daily.basketCount(session.state), 0);
  assert.equal(session.transact(Daily.sellBasket).error.code, "BASKET_EMPTY");
  const reopened = Daily.createStateSession(f.repository);
  assert.equal(reopened.state.coins, 1006);
  assert.equal(Daily.basketCount(reopened.state), 0);
});

test("basket schema rejects unknown, negative, fractional and overflowing goods", () => {
  const corrupt = [
    b => { b.carrot = -1; }, b => { b.egg = 0.5; }, b => { b.fur = Infinity; },
    b => { b.stone = 1; }, b => { delete b.wool; },
    b => { b.carrot = Number.MAX_SAFE_INTEGER; },
  ];
  for (const change of corrupt) {
    const state = Daily.defaultState();
    state.home = Daily.createHome(0, 0, "home");
    change(state.home.basket);
    assert.equal(Daily.validateState(state), false);
  }
  const { session } = homeSession();
  session.transact(state => { state.coins = (Number.MAX_SAFE_INTEGER - 1) / 2; state.home.basket.carrot = 1; });
  assert.equal(session.transact(Daily.sellBasket).error.code, "BALANCE_LIMIT");
  assert.equal(session.state.home.basket.carrot, 1);
});
