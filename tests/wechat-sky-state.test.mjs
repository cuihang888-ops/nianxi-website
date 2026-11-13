import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import Daily from "../wechat/vendor/daily-state.cjs";
import Sky from "../wechat/vendor/preview-sky.cjs";

const at = value => Date.parse(value + "+08:00");

test("sky follows Shanghai time independently of the host timezone", () => {
  const timestamp = at("2026-11-13T12:00:00");
  const expected = JSON.stringify(Daily.computeSky(timestamp));
  for (const zone of ["UTC", "America/Los_Angeles", "Asia/Tokyo"]) {
    const result = execFileSync(process.execPath, ["-e", `console.log(JSON.stringify(require('./wechat/vendor/preview-sky.cjs').computeSky(${timestamp})))`], {
      cwd: new URL("..", import.meta.url), env: { ...process.env, TZ: zone }, encoding: "utf8",
    }).trim();
    assert.equal(result, expected);
  }
  assert.match(Daily.computeSky(timestamp).label, /^正午/);
  assert.match(Daily.computeSky(at("2026-11-13T00:00:00")).label, /^夜里/);
});

test("weather stays deterministic within the Shanghai calendar day", () => {
  const samples = new Set();
  for (let day = 1; day <= 30; day += 1) {
    const date = "2026-11-" + String(day).padStart(2, "0");
    const morning = Daily.computeSky(at(date + "T00:00:00"));
    const evening = Daily.computeSky(at(date + "T23:59:00"));
    assert.equal(morning.weather, evening.weather);
    const legacySeed = 2026 * 372 + 11 * 31 + day;
    const value = legacySeed * 2654435761 % 100;
    assert.equal(morning.weather, value < 18 ? "rain" : value < 48 ? "cloudy" : "sunny");
    samples.add(morning.weather);
  }
  assert.deepEqual([...samples].sort(), ["cloudy", "rain", "sunny"]);
  const beforeMidnight = Daily.computeSky(Date.parse("2026-11-12T15:59:00Z"));
  const afterMidnight = Daily.computeSky(Date.parse("2026-11-12T16:00:00Z"));
  assert.equal(beforeMidnight.weather, Daily.computeSky(at("2026-11-12T12:00:00")).weather);
  assert.equal(afterMidnight.weather, Daily.computeSky(at("2026-11-13T12:00:00")).weather);
});

test("nine keyframes interpolate bounded lighting and have no gameplay side effects", () => {
  assert.equal(Sky.SKY_KEYS.length, 9);
  assert.equal(Object.isFrozen(Sky.SKY_KEYS), true);
  assert.equal(Sky.SKY_KEYS.every(Object.isFrozen), true);
  const state = Daily.defaultState();
  const before = JSON.stringify(state);
  for (let minute = 0; minute < 1440; minute += 5) {
    const sky = Daily.computeSky(at("2026-11-13T00:00:00") + minute * 60000);
    for (const key of ["bg", "fog", "sunColor"]) assert.ok(Number.isInteger(sky[key]) && sky[key] >= 0 && sky[key] <= 0xffffff);
    for (const key of ["hemi", "sun", "night"]) assert.ok(Number.isFinite(sky[key]) && sky[key] >= 0 && sky[key] <= 1);
    assert.equal(sky.rain, sky.weather === "rain");
  }
  assert.equal(JSON.stringify(state), before);
  const daylight = Daily.computeSky(at("2026-11-13T12:00:00"));
  const night = Daily.computeSky(at("2026-11-13T22:00:00"));
  assert.equal(daylight.night, 0);
  assert.equal(night.night, 1);
  assert.ok(daylight.hemi > night.hemi);
  assert.ok(daylight.sun > night.sun);
});

test("sky rejects invalid timestamps and exposes no force controls", () => {
  for (const invalid of [undefined, null, "2026-11-13", NaN, Infinity, new Date(), 9e15]) assert.throws(() => Daily.computeSky(invalid), TypeError);
  const timestamp = at("2026-11-13T12:00:00");
  assert.deepEqual(Daily.computeSky(timestamp, { weather: "rain", hour: 0 }), Daily.computeSky(timestamp));
  assert.equal(Daily.computeSky.length, 1);
});
