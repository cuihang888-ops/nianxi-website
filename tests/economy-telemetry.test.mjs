import test from "node:test";
import assert from "node:assert/strict";
import { createEconomyTelemetry, createFarmTelemetryJournal, readEconomyTelemetry, telemetryDay } from "../src/economy-telemetry.js";

const START = Date.parse("2026-11-13T00:00:00+08:00");
function setup() {
  const values = new Map();
  let time = START, id = 0, blocked = false;
  const storage = { getItem: key => values.get(key) || null, setItem: (key, value) => { if (blocked) throw Error("full"); values.set(key, value); } };
  return { tracker: createEconomyTelemetry(storage, { now: () => time, makeId: () => `id-${++id}` }), storage, setTime: next => { time = next; }, block: next => { blocked = next; } };
}
function action(tracker, type, before, after, extra = {}) {
  return tracker.recordAction({ eventId: tracker.nextEventId(), action: { type }, before: { coins: before }, after: { coins: after }, ok: true, saved: true, ...extra });
}

test("daily coin source and sink totals use actual committed deltas without adding rewards", () => {
  const { tracker } = setup();
  tracker.startSession(1200);
  action(tracker, "dailyGift", 1200, 1320);
  action(tracker, "sell", 1320, 1352, { action: { type: "sell", item: "wool" } });
  action(tracker, "sell", 1352, 1397, { action: { type: "sell", item: "game" } });
  action(tracker, "buyPlot", 1397, 997);
  action(tracker, "buyAnimal", 997, 737);
  action(tracker, "plant", 737, 731);
  const day = tracker.read().days["2026-11-13"];
  assert.deepEqual(day.faucets, { login: 120, online: 0, business: 32, hunt: 45, activity: 0 });
  assert.deepEqual(day.sinks, { land: 400, animal: 260, seed: 6, horse: 0, other: 0 });
  assert.equal(day.openingBalance, 1200);
  assert.equal(day.closingBalance, 731);
});

test("failed farm writes and rejected actions never become successful telemetry", () => {
  const { tracker } = setup();
  assert.equal(action(tracker, "dailyGift", 1200, 1320, { saved: false }), false);
  assert.equal(action(tracker, "dailyGift", 1200, 1320, { ok: false }), false);
  assert.equal(tracker.read(), null);
});

test("operation IDs and session starts are idempotent across rerender retries", () => {
  const { tracker } = setup();
  tracker.startSession(1200);
  tracker.startSession(1200);
  const eventId = tracker.nextEventId();
  action(tracker, "dailyGift", 1200, 1320, { eventId });
  action(tracker, "dailyGift", 1200, 1320, { eventId });
  const day = tracker.read().days["2026-11-13"];
  assert.equal(day.logins, 1);
  assert.equal(day.faucets.login, 120);
  assert.equal(day.committedActions, 1);
});

test("foreground time excludes hidden sessions and caps suspended timers", () => {
  const { tracker, setTime } = setup();
  tracker.startSession(1200);
  setTime(START + 15_000); tracker.pulse(1200, false);
  setTime(START + 75_000); tracker.pulse(1200, true);
  setTime(START + 90_000); tracker.pulse(1200);
  setTime(START + 3_600_000); tracker.pulse(1200);
  assert.equal(tracker.read().days["2026-11-13"].foregroundMs, 60_000);
});

test("foreground intervals split at Shanghai midnight", () => {
  const { tracker, setTime } = setup();
  setTime(START + 86_395_000); tracker.startSession(1200);
  setTime(START + 86_405_000); tracker.pulse(1200);
  assert.equal(tracker.read().days["2026-11-13"].foregroundMs, 5000);
  assert.equal(tracker.read().days["2026-11-14"].foregroundMs, 5000);
  assert.equal(telemetryDay(START), "2026-11-13");
});

test("a pulse exactly at midnight assigns elapsed time to the previous day and snapshot to the new day", () => {
  const { tracker, setTime } = setup();
  setTime(START + 86_385_000); tracker.startSession(1200);
  setTime(START + 86_400_000); tracker.pulse(1200);
  assert.equal(tracker.read().days["2026-11-13"].foregroundMs, 15_000);
  assert.equal(tracker.read().days["2026-11-14"].foregroundMs, 0);
  assert.equal(tracker.read().days["2026-11-14"].closingBalance, 1200);
});

test("telemetry storage failures are observable and a retry does not double count", () => {
  const { tracker, block } = setup();
  const eventId = tracker.nextEventId();
  block(true);
  assert.equal(action(tracker, "dailyGift", 1200, 1320, { eventId }), false);
  block(false);
  assert.equal(action(tracker, "dailyGift", 1200, 1320, { eventId }), true);
  assert.equal(tracker.read().failedWrites, 1);
  assert.equal(tracker.read().days["2026-11-13"].faucets.login, 120);
});

test("local player identity persists and action payloads do not retain animal names", () => {
  const { tracker, storage } = setup();
  action(tracker, "renameAnimal", 1200, 1200, { action: { type: "renameAnimal", name: "private nickname" } });
  const next = createEconomyTelemetry(storage);
  assert.equal(next.read().playerId, tracker.read().playerId);
  assert.equal(JSON.stringify(readEconomyTelemetry(storage)).includes("private nickname"), false);
});

test("inventory hunting awards are tracked without minting or double counting coins", () => {
  const { tracker } = setup();
  action(tracker, "hunt", 1200, 1200, { action: { type: "hunt", success: false } });
  action(tracker, "hunt", 1200, 1200, { action: { type: "hunt", success: true } });
  action(tracker, "sell", 1200, 1245, { action: { type: "sell", item: "game" } });
  const day = tracker.read().days["2026-11-13"];
  assert.equal(day.huntAttempts, 2);
  assert.equal(day.huntSuccesses, 1);
  assert.equal(day.faucets.hunt, 45);
});

test("invalid balances are rejected and capped gifts use observed delta", () => {
  const { tracker } = setup();
  assert.equal(action(tracker, "dailyGift", 1200, NaN), false);
  action(tracker, "dailyGift", 999990, 999999);
  assert.equal(tracker.read().days["2026-11-13"].faucets.login, 9);
});

test("pending farm actions are recorded together only when the state is persisted", () => {
  const { tracker } = setup();
  const journal = createFarmTelemetryJournal(tracker, () => START);
  journal.stage({ type: "buyPlot" }, { coins: 1200 }, { ok: true, state: { coins: 800 } });
  journal.persisted(false);
  assert.equal(tracker.read(), null);
  journal.stage({ type: "buyAnimal" }, { coins: 800 }, { ok: true, state: { coins: 540 } });
  journal.persisted(true);
  journal.persisted(true);
  const day = tracker.read().days["2026-11-13"];
  assert.equal(day.sinks.land, 400);
  assert.equal(day.sinks.animal, 260);
  assert.equal(day.committedActions, 2);
  assert.equal(day.openingBalance, 1200);
  assert.equal(day.closingBalance, 540);
});

test("replacing an unsaved farm state discards its never-persisted telemetry", () => {
  const { tracker } = setup();
  const journal = createFarmTelemetryJournal(tracker, () => START);
  journal.stage({ type: "buyPlot" }, { coins: 1200 }, { ok: true, state: { coins: 800 } });
  journal.persisted(false);
  journal.discard();
  journal.stage({ type: "dailyGift" }, { coins: 1200 }, { ok: true, state: { coins: 1320 } });
  journal.persisted(true);
  const day = tracker.read().days["2026-11-13"];
  assert.equal(day.sinks.land, 0);
  assert.equal(day.faucets.login, 120);
  assert.equal(day.committedActions, 1);
});

test("pulse automatically retries failed telemetry with original ID and day", () => {
  const { tracker, block, setTime } = setup();
  tracker.startSession(1200);
  block(true);
  action(tracker, "buyPlot", 1200, 800);
  action(tracker, "buyAnimal", 800, 540);
  assert.equal(tracker.read().days["2026-11-13"].committedActions, 0);
  block(false);
  setTime(START + 86_400_000);
  tracker.pulse(540);
  tracker.pulse(540);
  const oldDay = tracker.read().days["2026-11-13"];
  assert.equal(oldDay.sinks.land, 400);
  assert.equal(oldDay.sinks.animal, 260);
  assert.equal(oldDay.committedActions, 2);
  assert.equal(tracker.read().days["2026-11-14"].committedActions, 0);
  assert.equal(tracker.read().events.filter(event => event.type === "farm_action").length, 2);
});

test("outbox is bounded and reports dropped events after storage recovery", () => {
  const { tracker, block } = setup();
  block(true);
  for (let index = 0; index < 1005; index += 1) action(tracker, "buyPlot", 1200, 800);
  block(false);
  assert.equal(tracker.flush(), true);
  assert.equal(tracker.read().events.length, 1000);
  assert.equal(tracker.read().droppedEvents, 5);
});
