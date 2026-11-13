import test from "node:test";
import assert from "node:assert/strict";
import { createWechatGameHost } from "../wechat/platform/game-host.js";

const config = { appId: "wx24c1d8b3a00f962e", clientVersion: "host-test", protocolVersion: 1, backendBaseUrl: "" };

function environment() {
  const events = new Map(), frames = new Map();
  let sequence = 0, canvasCount = 0;
  const info = { windowWidth: 390, windowHeight: 844, pixelRatio: 4, statusBarHeight: 44, safeArea: { top: 44, left: 0, right: 390, bottom: 810 } };
  const canvas = { width: 0, height: 0 };
  const scheduler = {
    requestAnimationFrame(callback) { const id = ++sequence; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
  };
  const wx = {
    createCanvas() { canvasCount += 1; return canvas; },
    getWindowInfo: () => info,
    getMenuButtonBoundingClientRect: () => ({ bottom: 76 }),
  };
  for (const event of ["Show", "Hide", "Error", "WindowResize", "TouchStart", "TouchMove", "TouchEnd", "TouchCancel"]) {
    wx[`on${event}`] = callback => { if (!events.has(event)) events.set(event, new Set()); events.get(event).add(callback); };
    wx[`off${event}`] = callback => events.get(event)?.delete(callback);
  }
  return {
    wx, canvas, info, scheduler, frames, events,
    canvasCount: () => canvasCount,
    emit(event, value) { for (const callback of [...events.get(event) || []]) callback(value); },
    tick(time) { const current = [...frames.values()]; frames.clear(); current.forEach(callback => callback(time)); },
    listenerCount: () => [...events.values()].reduce((total, set) => total + set.size, 0),
  };
}

test("host starts once, sizes one canvas and maintains one bounded frame loop", async () => {
  const env = environment(), deltas = [], sizes = [];
  let creations = 0, renders = 0, resumes = 0, context;
  const host = createWechatGameHost(env.wx, { config, scheduler: env.scheduler, createGame: value => {
    context = value; creations += 1;
    return { update: dt => deltas.push(dt), render: () => renders++, resize: size => sizes.push(size), resume: () => resumes++ };
  } });
  const first = host.start();
  assert.equal(first, host.start());
  assert.deepEqual(await first, { ok: true });
  assert.equal(creations, 1);
  assert.equal(env.canvasCount(), 1);
  assert.equal(context.canvas, env.canvas);
  assert.equal(env.canvas.width, 1170);
  assert.equal(env.canvas.height, 2532);
  assert.equal(context.viewport.safeTop, 76);
  assert.equal(context.viewport.safeBottom, 34);
  assert.equal(sizes.length, 1);
  env.tick(1000); env.tick(1016); env.tick(3000);
  assert.deepEqual(deltas, [0, 0.016, 0.05]);
  assert.equal(renders, 3);
  assert.equal(env.frames.size, 1);
  assert.equal(resumes, 1);
  host.dispose();
});

test("background pauses once, cancels touches and resumes without elapsed offline ticks", async () => {
  const env = environment(), deltas = [], inputs = [];
  let pauses = 0, resumes = 0, releases = 0;
  const host = createWechatGameHost(env.wx, { config, scheduler: env.scheduler, createGame: context => {
    context.input.subscribe(event => inputs.push(event));
    return { update: dt => deltas.push(dt), pause: () => pauses++, resume: () => resumes++, dispose: () => releases++ };
  } });
  await host.start(); env.tick(1000); env.tick(1010);
  const staleFrame = [...env.frames.values()][0];
  env.emit("Hide"); env.emit("Hide");
  assert.equal(pauses, 1);
  assert.equal(host.getState().phase, "paused");
  assert.equal(env.frames.size, 0);
  assert.equal(inputs.at(-1).type, "cancel");
  env.emit("TouchStart", { touches: [{ identifier: 1, clientX: 12, clientY: 34 }] });
  staleFrame(800000);
  assert.equal(deltas.length, 2);
  env.emit("Show"); env.emit("Show"); env.tick(900000);
  staleFrame(950000);
  assert.equal(resumes, 2);
  assert.deepEqual(deltas, [0, 0.01, 0]);
  assert.equal(env.frames.size, 1);
  host.dispose(); host.dispose();
  assert.equal(releases, 1);
  assert.equal(env.listenerCount(), 0);
  assert.equal(env.frames.size, 0);
  assert.equal((await host.start()).error.code, "DISPOSED");
});

test("touch events use logical pixels and resize updates backing size and context", async () => {
  const env = environment(), inputs = [], sizes = [];
  let context, unsubscribe;
  const host = createWechatGameHost(env.wx, { config, scheduler: env.scheduler, createGame: value => {
    context = value; unsubscribe = value.input.subscribe(event => inputs.push(event));
    return { resize: size => sizes.push(size) };
  } });
  await host.start();
  const point = { identifier: 4, clientX: 90, clientY: 150 };
  env.emit("TouchEnd", { changedTouches: [point, { clientX: NaN }], touches: [] });
  assert.deepEqual(inputs[0], { type: "end", touches: [], changedTouches: [{ id: 4, x: 90, y: 150 }] });
  point.clientX = 10;
  assert.equal(inputs[0].changedTouches[0].x, 90);
  assert.equal(Object.isFrozen(inputs[0].changedTouches[0]), true);
  env.info.pixelRatio = 2;
  env.info.safeArea = { top: 0, left: 0, right: 844, bottom: 390 };
  env.emit("WindowResize", { windowWidth: 844, windowHeight: 390 });
  assert.equal(context.viewport.width, 844);
  assert.equal(sizes.at(-1).height, 390);
  assert.equal(env.canvas.width, 1688);
  assert.equal(env.canvas.height, 780);
  unsubscribe(); env.emit("TouchStart", { touches: [point] });
  assert.equal(inputs.length, 1);
  host.dispose();
});

test("async loading honors hide and disposal releases a late game without starting it", async () => {
  for (const cancel of [false, true]) {
    const env = environment();
    let resolveGame, pauses = 0, resumes = 0, releases = 0;
    const host = createWechatGameHost(env.wx, { config, scheduler: env.scheduler, createGame: () => new Promise(resolve => { resolveGame = resolve; }) });
    const started = host.start();
    await Promise.resolve();
    env.emit("Hide");
    if (cancel) host.dispose();
    resolveGame({ pause: () => pauses++, resume: () => resumes++, dispose: () => releases++ });
    const result = await started;
    assert.equal(result.ok, !cancel);
    assert.equal(env.frames.size, 0);
    assert.equal(resumes, 0);
    assert.equal(pauses, cancel ? 0 : 1);
    assert.equal(releases, cancel ? 1 : 0);
    if (!cancel) { env.emit("Show"); assert.equal(env.frames.size, 1); }
    host.dispose();
    assert.equal(releases, 1);
    assert.equal(env.listenerCount(), 0);
  }
});

test("factory failure and runtime errors stop safely without returning private details", async () => {
  for (const stage of ["factory", "frame", "input", "platform"]) {
    const env = environment(), errors = [];
    let releases = 0;
    const host = createWechatGameHost(env.wx, { config, scheduler: env.scheduler, onError: error => errors.push(error), createGame: context => {
      if (stage === "factory") throw new Error("private-access-token");
      context.input.subscribe(() => { if (stage === "input") throw new Error("private-access-token"); });
      return { update() { if (stage === "frame") throw new Error("private-access-token"); }, dispose: () => releases++ };
    } });
    const result = await host.start();
    if (stage === "frame") env.tick(100);
    if (stage === "input") env.emit("TouchEnd");
    if (stage === "platform") env.emit("Error", { message: "private-access-token" });
    assert.equal(result.ok, stage !== "factory");
    assert.equal(host.getState().phase, "error");
    assert.equal(errors.length, 1);
    assert.equal(JSON.stringify([errors, host.getState()]).includes("private-access-token"), false);
    assert.equal(env.frames.size, 0);
    assert.equal(env.listenerCount(), 0);
    assert.equal(releases, stage === "factory" ? 0 : 1);
    host.dispose();
  }
});

test("native canvas scheduler works and stale platform handlers are inert after disposal", async () => {
  const env = environment();
  Object.assign(env.canvas, env.scheduler);
  const host = createWechatGameHost(env.wx, { config, createGame: () => ({}) });
  await host.start();
  const staleResize = [...env.events.get("WindowResize")][0];
  const size = env.canvas.width;
  host.dispose();
  staleResize({ windowWidth: 100, windowHeight: 100 });
  assert.equal(env.canvas.width, size);
  assert.equal(host.getState().phase, "disposed");
  assert.equal(env.frames.size, 0);
});

test("disposal immediately after start prevents any deferred platform initialization", async () => {
  const env = environment();
  let creations = 0;
  const host = createWechatGameHost(env.wx, { config, scheduler: env.scheduler, createGame: () => { creations++; return {}; } });
  const pending = host.start();
  host.dispose();
  assert.equal((await pending).error.code, "DISPOSED");
  assert.equal(creations, 0);
  assert.equal(env.canvasCount(), 0);
  assert.equal(env.listenerCount(), 0);
});
