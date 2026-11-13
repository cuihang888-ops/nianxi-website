export const ECONOMY_TELEMETRY_KEY = "anheli-economy-telemetry-v1";
export const FAUCET_SOURCES = Object.freeze(["login", "online", "business", "hunt", "activity"]);
export const SINK_DESTINATIONS = Object.freeze(["land", "animal", "seed", "horse", "other"]);
const MAX_DAYS = 180;
const MAX_EVENTS = 5000;
const MAX_OUTBOX = 1000;
const MAX_HEARTBEAT_MS = 30_000;
const DAY_MS = 86_400_000;
const CHINA_OFFSET_MS = 8 * 60 * 60 * 1000;
const emptyTotals = keys => Object.fromEntries(keys.map(key => [key, 0]));
const validCoins = value => Number.isSafeInteger(value) && value >= 0;
const identifier = () => globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export function telemetryDay(time) {
  return new Date(time + CHINA_OFFSET_MS).toISOString().slice(0, 10);
}

export function readEconomyTelemetry(storage) {
  try {
    const data = JSON.parse(storage?.getItem(ECONOMY_TELEMETRY_KEY) || "null");
    if (data?.version === 1 && typeof data.playerId === "string" && data.days && typeof data.days === "object" && Array.isArray(data.events)) return data;
  } catch {}
  return null;
}

function dayRecord(data, now) {
  const key = telemetryDay(now);
  if (!Object.hasOwn(data.days, key)) data.days[key] = {
    date: key, faucets: emptyTotals(FAUCET_SOURCES), sinks: emptyTotals(SINK_DESTINATIONS),
    logins: 0, foregroundMs: 0, openingBalance: null, closingBalance: null,
    lastBalanceAt: null, committedActions: 0, huntAttempts: 0, huntSuccesses: 0,
  };
  return data.days[key];
}

function snapshot(day, balance, now) {
  if (!validCoins(balance)) return;
  if (day.openingBalance === null) day.openingBalance = balance;
  day.closingBalance = balance;
  day.lastBalanceAt = now;
}

function actionCategory(action, delta) {
  if (delta > 0) {
    if (action.type === "dailyGift") return ["faucet", "login"];
    if (action.type === "sell") return ["faucet", action.item === "game" ? "hunt" : "business"];
    return ["faucet", "activity"];
  }
  return ["sink", ({ buyPlot: "land", buyAnimal: "animal", plant: "seed", buyHorse: "horse" })[action.type] || "other"];
}

// Local diagnostics only. The future server adapter must use committed ledger IDs.
export function createEconomyTelemetry(storage, { now = Date.now, makeId = identifier } = {}) {
  let playerId = readEconomyTelemetry(storage)?.playerId || makeId();
  let sequence = 0;
  let failedWrites = 0;
  let droppedEvents = 0;
  const outbox = [];
  const sessionId = makeId();
  let lastPulse = null;
  let visible = false;

  function writeEntry({ eventId, mutate, time }) {
    try {
      const data = readEconomyTelemetry(storage) || { version: 1, playerId, timezone: "Asia/Shanghai", days: {}, events: [], failedWrites: 0, droppedEvents: 0 };
      playerId = data.playerId;
      if (data.events.some(event => event.id === eventId)) return true;
      const event = mutate(data, time);
      data.failedWrites = (data.failedWrites || 0) + failedWrites;
      data.droppedEvents = (data.droppedEvents || 0) + droppedEvents;
      data.events.push({ id: eventId, at: time, sessionId, ...event });
      data.events = data.events.slice(-MAX_EVENTS);
      const dates = Object.keys(data.days).sort();
      dates.slice(0, Math.max(0, dates.length - MAX_DAYS)).forEach(date => delete data.days[date]);
      storage.setItem(ECONOMY_TELEMETRY_KEY, JSON.stringify(data));
      failedWrites = 0;
      droppedEvents = 0;
      return true;
    } catch {
      failedWrites += 1;
      return false;
    }
  }

  function flush() {
    while (outbox.length) {
      if (!writeEntry(outbox[0])) return false;
      outbox.shift();
    }
    return true;
  }

  function commit(eventId, mutate, time = now(), kind = "action") {
    if (typeof eventId !== "string" || !eventId || eventId.length > 200 || !Number.isFinite(time)) return false;
    if (!outbox.some(entry => entry.eventId === eventId)) {
      if (outbox.length >= MAX_OUTBOX) {
        const pulseIndex = outbox.findIndex(entry => entry.kind === "pulse");
        outbox.splice(pulseIndex < 0 ? 0 : pulseIndex, 1);
        droppedEvents += 1;
      }
      outbox.push({ eventId, mutate, time, kind });
    }
    return flush();
  }

  const nextEventId = () => `${sessionId}:${++sequence}`;
  function startSession(balance, isVisible = true) {
    const time = now();
    lastPulse = time;
    visible = isVisible;
    return commit(`${sessionId}:login:${telemetryDay(time)}`, (data, timestamp) => {
      const day = dayRecord(data, timestamp);
      day.logins += 1;
      snapshot(day, balance, timestamp);
      return { type: "session_start", balance: validCoins(balance) ? balance : null };
    });
  }

  function pulse(balance, isVisible = visible) {
    const time = now();
    // Timer suspension must not turn a sleeping device into hours of play time.
    const elapsed = lastPulse === null || !visible ? 0 : Math.max(0, Math.min(MAX_HEARTBEAT_MS, time - lastPulse));
    lastPulse = time;
    visible = isVisible;
    return commit(nextEventId(), (data, timestamp) => {
      const start = time - elapsed;
      const nextMidnight = Math.floor((start + CHINA_OFFSET_MS) / DAY_MS) * DAY_MS + DAY_MS - CHINA_OFFSET_MS;
      if (elapsed && nextMidnight <= time) {
        dayRecord(data, start).foregroundMs += nextMidnight - start;
        dayRecord(data, time).foregroundMs += time - nextMidnight;
      } else dayRecord(data, time).foregroundMs += elapsed;
      snapshot(dayRecord(data, timestamp), balance, timestamp);
      return { type: "session_pulse", foregroundMs: elapsed, balance: validCoins(balance) ? balance : null };
    }, time, "pulse");
  }

  function recordAction({ eventId, action, before, after, ok, saved, at = now() }) {
    if (ok !== true || saved !== true || !validCoins(before?.coins) || !validCoins(after?.coins) || typeof action?.type !== "string") return false;
    const delta = after.coins - before.coins;
    return commit(eventId, (data, time) => {
      const day = dayRecord(data, time);
      snapshot(day, before.coins, time);
      const [direction, category] = actionCategory(action, delta);
      if (delta > 0) day.faucets[category] += delta;
      if (delta < 0) day.sinks[category] -= delta;
      day.committedActions += 1;
      if (action.type === "hunt") {
        day.huntAttempts += 1;
        if (action.success === true) day.huntSuccesses += 1;
      }
      snapshot(day, after.coins, time);
      return { type: "farm_action", action: action.type, direction: delta === 0 ? "none" : direction, category: delta === 0 ? null : category, delta, balanceBefore: before.coins, balanceAfter: after.coins };
    }, at);
  }

  return { nextEventId, startSession, pulse, recordAction, flush, read: () => readEconomyTelemetry(storage) };
}

// Successful in-memory actions stay pending until a later farm save commits them.
export function createFarmTelemetryJournal(tracker, now = Date.now) {
  let pending = [];
  return {
    stage(action, before, result) {
      if (!result.ok) return;
      pending.push({
        eventId: tracker.nextEventId(), at: now(),
        action: { type: action.type, item: action.item, success: action.success },
        before: { coins: before.coins }, after: { coins: result.state.coins }, ok: true, saved: true,
      });
    },
    persisted(saved) {
      if (!saved) return;
      const committed = pending;
      pending = [];
      committed.forEach(entry => tracker.recordAction(entry));
      tracker.flush();
    },
    discard() { pending = []; },
  };
}
