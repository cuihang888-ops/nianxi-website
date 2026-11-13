import test from "node:test";
import assert from "node:assert/strict";
import Daily from "../wechat/vendor/daily-state.cjs";
import Discovery from "../wechat/vendor/preview-discovery.cjs";
import { createDiscoveryController } from "../wechat/discovery-controller.js";

function fixture(day = "2026-11-13") {
  let time = Date.parse(day + "T04:00:00Z"), fail = false, writes = 0, stored = null, revision = 0;
  const session = Daily.createStateSession({
    load: () => ({ ok: true, state: stored, revision }),
    save(state) {
      writes++;
      if (fail) return { ok: false, error: { code: "SAVE_WRITE_FAILED" } };
      assert.equal(Daily.validateState(state), true);
      stored = structuredClone(state);
      return { ok: true, revision: ++revision };
    },
  });
  let position = { x: 0, z: 0 }, mounted = false, dancing = false, danceDone = false, playResult = true;
  const plays = { playSplash: 0, releaseLantern: 0, joinDance: 0, stopDance: 0 };
  const visible = [], toasts = [];
  const world = {
    getPlayerPos: () => position, isMounted: () => mounted,
    setFestivalVisible: value => visible.push(value),
    isDancing: () => dancing,
    playSplash() { plays.playSplash++; return playResult; },
    releaseLantern() { plays.releaseLantern++; return playResult; },
    joinDance() { plays.joinDance++; if (playResult) dancing = true; return playResult; },
    stopDance() { plays.stopDance++; dancing = false; danceDone = false; },
    consumeDanceDone() { const done = danceDone; danceDone = false; return done; },
  };
  const ui = { label: "", action: null, lines: [],
    setAlbumRow(value) { this.albumRow = value; },
    setAction(label, action) { this.label = label; this.action = action; },
    openAlbum(lines) { this.lines = lines; }, markDirty() {}, toast: value => toasts.push(value),
  };
  const controller = createDiscoveryController({ state: session.state, transact: session.transact, ui,
    today: () => Daily.todayShanghai(time), now: () => time });
  return { session, state: session.state, world, ui, controller, visible, toasts, plays,
    setPosition(x, z) { position = { x, z }; }, setMounted(value) { mounted = value; },
    setDancing(value) { dancing = value; }, finishDance() { dancing = false; danceDone = true; },
    setPlayResult(value) { playResult = value; },
    setTime(value) { time = Date.parse(value); }, advance(ms) { time += ms; },
    fail(value) { fail = value; }, writes: () => writes };
}

test("discovery persists each landmark once and uses the corrected temple label", () => {
  const f = fixture();
  f.setPosition(-58, -58);
  f.controller.update("mangshi", f.world);
  assert.equal(f.writes(), 1);
  assert.equal(f.state.album.landmarks["ms-temple"], true);
  assert.ok(f.toasts.at(-1).includes("芒市寺院"));
  for (let i = 0; i < 30; i++) { f.advance(1000); f.controller.update("mangshi", f.world); }
  assert.equal(f.writes(), 1);
  f.controller.openAlbum();
  assert.ok(f.ui.lines.some(line => line.name === "芒市寺院" && line.got === true));
});

test("failed discoveries are throttled and retry without claiming unsaved collection", () => {
  const f = fixture();
  f.setPosition(-58, -58);
  f.fail(true);
  f.controller.update("mangshi", f.world);
  assert.equal(f.state.album.landmarks["ms-temple"], undefined);
  for (let i = 0; i < 50; i++) f.controller.update("mangshi", f.world);
  assert.equal(f.writes(), 1);
  f.advance(999); f.controller.update("mangshi", f.world);
  assert.equal(f.writes(), 1);
  f.fail(false);
  f.advance(1); f.controller.update("mangshi", f.world);
  assert.equal(f.writes(), 2);
  assert.equal(f.state.album.landmarks["ms-temple"], true);
});

test("festival action rechecks date and proximity and only celebrates a committed reward", () => {
  const f = fixture("2027-04-12");
  f.setPosition(0, 40);
  assert.equal(f.controller.setAction("mangshi", f.world), true);
  const action = f.ui.action;
  f.fail(true);
  action();
  assert.equal(f.state.coins, 1200);
  assert.equal(f.state.festJoined.songkran, undefined);
  f.fail(false);
  action();
  assert.equal(f.state.coins, 1230);
  assert.equal(f.state.festJoined.songkran, 2027);
  assert.equal(f.state.album.festivals.songkran, true);
  assert.equal(f.controller.setAction("mangshi", f.world), true);
  assert.equal(f.ui.label, "泼一捧水 · 送祝福");
  action();
  assert.equal(f.state.coins, 1230);
  const stale = fixture("2027-04-16");
  stale.setPosition(0, 40);
  stale.controller.setAction("mangshi", stale.world);
  const staleAction = stale.ui.action;
  stale.setPosition(100, 100); staleAction();
  assert.equal(stale.writes(), 0);
  stale.setPosition(0, 40);
  stale.setTime("2027-04-16T16:00:00Z");
  staleAction();
  assert.equal(stale.state.coins, 1200);
  assert.equal(stale.writes(), 0);
});

test("festival visibility follows Shanghai midnight and configured dam locations", () => {
  const f = fixture("2027-04-09");
  f.setTime("2027-04-09T15:59:59Z");
  f.controller.syncWorld("mangshi", f.world);
  assert.deepEqual(f.visible, [null]);
  f.setTime("2027-04-09T16:00:00Z");
  f.controller.syncWorld("mangshi", f.world);
  assert.deepEqual(f.visible, [null, "songkran"]);
  f.controller.syncWorld("mangshi", f.world);
  assert.equal(f.visible.length, 2);
  assert.equal(Discovery.festSiteFor("songkran", "yingjiang"), null);
  assert.deepEqual(Discovery.festSiteFor("songkran", "ruili"), { x: 2, z: 18 });
  f.setTime("2027-04-16T16:00:00Z");
  f.controller.syncWorld("mangshi", f.world);
  assert.deepEqual(f.visible, [null, "songkran", null]);
});

const FESTIVAL_PLAYS = [
  { id: "songkran", day: "2027-04-12", dam: "mangshi", method: "playSplash" },
  { id: "munao", day: "2027-02-14", dam: "longchuan", method: "joinDance" },
  { id: "dengdeng", day: "2027-10-22", dam: "ruili", method: "releaseLantern" },
];

function claimedFestival(config) {
  const f = fixture(config.day);
  const site = Discovery.festSiteFor(config.id, config.dam);
  f.setPosition(site.x, site.z);
  assert.equal(f.session.transact(state => Daily.joinFestival(state, config.id, config.day)).ok, true);
  assert.equal(f.controller.setAction(config.dam, f.world), true);
  return f;
}

test("all three repeated festival performances leave rewards and saved progress untouched", () => {
  for (const config of FESTIVAL_PLAYS) {
    const f = claimedFestival(config);
    const before = structuredClone(f.state), writes = f.writes(), revision = f.session.revision;
    for (let count = 0; count < 3; count++) {
      f.setDancing(false);
      assert.equal(f.ui.action(), true);
    }
    assert.equal(f.plays[config.method], 3, config.id);
    assert.deepEqual(f.state, before);
    assert.equal(f.state.coins, 1230);
    assert.equal(f.writes(), writes);
    assert.equal(f.session.revision, revision);
  }
});

test("repeated festival clicks recheck location, riding, dance, claim and current event year", () => {
  for (const config of FESTIVAL_PLAYS) {
    const invalidations = [
      f => f.setPosition(999, 999),
      f => f.setMounted(true),
      f => f.setDancing(true),
      f => { delete f.state.festJoined[config.id]; },
      f => { f.state.festJoined[config.id] = 2028; },
      f => f.setTime("2027-12-01T04:00:00Z"),
      f => f.setTime(config.day.replace("2027", "2028") + "T04:00:00Z"),
      f => f.setTime(config.day.replace("2027", "2026") + "T04:00:00Z"),
    ];
    for (const invalidate of invalidations) {
      const f = claimedFestival(config), action = f.ui.action;
      invalidate(f);
      const before = structuredClone(f.state), writes = f.writes();
      assert.equal(action(), false, config.id);
      assert.equal(f.plays[config.method], 0, config.id);
      assert.deepEqual(f.state, before);
      assert.equal(f.writes(), writes);
    }
  }
});

test("festival action availability rejects future claims and unsupported scene effects", () => {
  for (const config of FESTIVAL_PLAYS) {
    const f = claimedFestival(config);
    f.state.festJoined[config.id] = 2028;
    assert.equal(f.controller.setAction(config.dam, f.world), false);
    f.state.festJoined[config.id] = 2027;
    f.setMounted(true);
    assert.equal(f.controller.setAction(config.dam, f.world), false);
    f.setMounted(false);
    f.setPlayResult(false);
    assert.equal(f.controller.setAction(config.dam, f.world), true);
    const toastCount = f.toasts.length, writes = f.writes();
    assert.equal(f.ui.action(), false);
    assert.equal(f.toasts.length, toastCount);
    assert.equal(f.writes(), writes);
    delete f.world[config.method];
    assert.equal(f.controller.setAction(config.dam, f.world), false);
  }
});

test("festival reward callbacks cannot roll forward to a different year or act while mounted", () => {
  for (const invalidation of [f => f.setMounted(true), f => f.setTime("2028-04-12T04:00:00Z")]) {
    const f = fixture("2027-04-12");
    f.setPosition(0, 40);
    f.controller.setAction("mangshi", f.world);
    const action = f.ui.action;
    invalidation(f);
    assert.equal(action(), false);
    assert.equal(f.writes(), 0);
    assert.equal(f.state.coins, 1200);
  }
});

test("dance completion toast is consumed once without new save or reward", () => {
  const f = claimedFestival(FESTIVAL_PLAYS[1]);
  assert.equal(f.ui.action(), true);
  f.controller.update("longchuan", f.world);
  const before = structuredClone(f.state), writes = f.writes(), toasts = f.toasts.length;
  f.finishDance();
  f.controller.update("longchuan", f.world);
  assert.equal(f.toasts.length, toasts + 1);
  assert.ok(f.toasts.at(-1).includes("一圈跳完了"));
  for (let count = 0; count < 10; count++) f.controller.update("longchuan", f.world);
  assert.equal(f.toasts.length, toasts + 1);
  assert.equal(f.writes(), writes);
  assert.deepEqual(f.state, before);
});

test("leaving the configured dance festival stops dancing and clears stale completion", () => {
  const f = claimedFestival(FESTIVAL_PLAYS[1]);
  f.controller.syncWorld("longchuan", f.world);
  f.ui.action();
  assert.equal(f.world.isDancing(), true);
  f.setTime("2027-02-18T16:00:00Z");
  f.controller.syncWorld("longchuan", f.world);
  assert.equal(f.world.isDancing(), false);
  assert.equal(f.plays.stopDance, 1);
  assert.equal(f.visible.at(-1), null);
  f.controller.syncWorld("longchuan", f.world);
  assert.equal(f.plays.stopDance, 1);
  f.setDancing(true);
  f.controller.syncWorld("mangshi", f.world);
  assert.equal(f.world.isDancing(), false);
  assert.equal(f.plays.stopDance, 2);
});

test("all thirty album entries receive immutable game notes without changing progress", () => {
  const catalog = Object.values(Discovery.ALBUM_CATALOG).flat();
  assert.equal(catalog.length, 30);
  assert.deepEqual(Object.keys(Discovery.ALBUM_NOTES).sort(), catalog.map(entry => entry.id).sort());
  assert.equal(Object.isFrozen(Discovery.ALBUM_NOTES), true);
  assert.equal(Discovery.ALBUM_NOTES["ms-temple"].includes("总佛寺"), false);
  for (const entry of catalog) {
    assert.equal(typeof Discovery.ALBUM_NOTES[entry.id], "string");
    assert.ok(Discovery.ALBUM_NOTES[entry.id].trim().length > 10);
  }
  const f = fixture();
  Daily.albumAdd(f.state, "animals", "rabbit");
  const before = structuredClone(f.state);
  f.controller.openAlbum();
  const items = f.ui.lines.filter(line => line.type === "item");
  assert.equal(items.length, 30);
  for (const [index, entry] of catalog.entries()) {
    assert.equal(items[index].name, entry.name);
    assert.equal(items[index].note, Discovery.ALBUM_NOTES[entry.id]);
    assert.equal(items[index].got, entry.id === "rabbit");
  }
  assert.equal(f.ui.lines.filter(line => line.type === "group").length, 3);
  assert.equal(f.writes(), 0);
  assert.deepEqual(f.state, before);
});
