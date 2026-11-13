import test from "node:test";
import assert from "node:assert/strict";
import { createWechatGameHost } from "../wechat/platform/game-host.js";
import { createDiagnostics } from "../wechat/platform/diagnostics.js";

const baseConfig = { appId: "wx24c1d8b3a00f962e", clientVersion: "diagnostic-test", protocolVersion: 1, backendBaseUrl: "" };
const SAVE_KEY = "anheli-platform-diagnostic:save";
const settle = () => new Promise(resolve => setImmediate(resolve));

function harness({ width = 390, height = 844, store = new Map(), backendBaseUrl = "", failWrites = false } = {}) {
  const events = new Map(), frames = new Map();
  const calls = { login: 0, writes: 0, requests: [] };
  let sequence = 0, drawCalls = [], time = 0;
  const drawing = {
    font: "13px sans-serif", textAlign: "left", fillStyle: "",
    setTransform() {},
    measureText(value) {
      const size = Number.parseFloat(/([0-9.]+)px/.exec(this.font)?.[1] || "13");
      return { width: [...value].reduce((total, char) => total + (char.codePointAt(0) > 255 ? 1 : 0.55) * size, 0) };
    },
    fillRect(x, y, w, h) {
      if (x === 0 && y === 0 && w === width && h === height) drawCalls = [];
      drawCalls.push({ kind: "rect", x, y, width: w, height: h, color: this.fillStyle });
    },
    fillText(value, x, y) {
      const size = Number.parseFloat(/([0-9.]+)px/.exec(this.font)?.[1] || "13");
      const measured = this.measureText(value).width;
      drawCalls.push({ kind: "text", value, x: this.textAlign === "center" ? x - measured / 2 : x, y: y - size, width: measured, height: size + 3 });
    },
  };
  const canvas = { width: 0, height: 0, getContext: type => { assert.equal(type, "2d"); return drawing; } };
  const wx = {
    createCanvas: () => canvas,
    getWindowInfo: () => ({ windowWidth: width, windowHeight: height, pixelRatio: 2, statusBarHeight: 44, safeArea: { top: 44, left: 0, right: width, bottom: height - 20 } }),
    getMenuButtonBoundingClientRect: () => ({ bottom: 76 }),
    getStorageSync: key => store.get(key) ?? "",
    setStorageSync(key, value) { calls.writes++; if (failWrites) throw new Error("Storage full"); store.set(key, value); },
    removeStorageSync: key => store.delete(key),
    login({ success }) { calls.login++; success({ code: "diagnostic-login-code" }); },
    request(options) { calls.requests.push(options); },
  };
  for (const event of ["Show", "Hide", "Error", "WindowResize", "TouchStart", "TouchMove", "TouchEnd", "TouchCancel"]) {
    wx[`on${event}`] = handler => { if (!events.has(event)) events.set(event, new Set()); events.get(event).add(handler); };
    wx[`off${event}`] = handler => events.get(event)?.delete(handler);
  }
  const host = createWechatGameHost(wx, {
    config: { ...baseConfig, backendBaseUrl }, createGame: createDiagnostics,
    scheduler: {
      requestAnimationFrame(callback) { const id = ++sequence; frames.set(id, callback); return id; },
      cancelAnimationFrame: id => frames.delete(id),
    },
  });
  function tick() {
    time += 16;
    const current = [...frames.values()]; frames.clear();
    current.forEach(callback => callback(time));
  }
  function emit(event, value) { for (const callback of [...events.get(event) || []]) callback(value); }
  return {
    host, calls, store, frames, tick, emit,
    drawCalls: () => drawCalls,
    text: () => drawCalls.filter(call => call.kind === "text").map(call => call.value).join(""),
    async open() { assert.deepEqual(await host.start(), { ok: true }); tick(); },
    async click(label) {
      const text = drawCalls.find(call => call.kind === "text" && call.value === label);
      assert.ok(text, `Button exists: ${label}`);
      const point = { identifier: 1, clientX: text.x + text.width / 2, clientY: text.y + text.height / 2 };
      emit("TouchEnd", { touches: [], changedTouches: [point] });
      await settle(); tick();
    },
  };
}

test("diagnostic entry runs real host, adapter and local repository through touch/save/reload", async t => {
  const store = new Map([["anheli-farm-v1", "existing-game-data"]]);
  const first = harness({ store });
  t.after(() => first.host.dispose());
  await first.open();
  assert.match(first.text(), /触控 0 次/);
  await first.click("测试触控");
  assert.match(first.text(), /触控 1 次/);
  await first.click("保存本机测试记录");
  assert.match(first.text(), /本机保存成功 1 次/);
  assert.equal(JSON.parse(store.get(SAVE_KEY)).revision, 1);
  assert.deepEqual(JSON.parse(store.get(SAVE_KEY)).state, { checks: 1 });
  assert.equal(store.get("anheli-farm-v1"), "existing-game-data");
  await first.click("检查微信登录");
  assert.match(first.text(), /已检查：登录服务未配置/);
  assert.equal(first.calls.login, 0);
  assert.equal(first.calls.requests.length, 0);
  first.host.dispose();
  const reopened = harness({ store });
  t.after(() => reopened.host.dispose());
  await reopened.open();
  assert.match(reopened.text(), /已恢复本机记录 1 次/);
  await reopened.click("保存本机测试记录");
  assert.equal(JSON.parse(store.get(SAVE_KEY)).revision, 2);
  assert.deepEqual(JSON.parse(store.get(SAVE_KEY)).state, { checks: 2 });
});

test("diagnostics preserve existing records when storage is corrupt or writing fails", async t => {
  const seeded = harness(); await seeded.open(); await seeded.click("保存本机测试记录"); seeded.host.dispose();
  for (const corrupt of [false, true]) {
    const store = new Map(seeded.store);
    if (corrupt) store.set(SAVE_KEY, "invalid-existing-progress");
    const before = store.get(SAVE_KEY);
    const env = harness({ store, failWrites: !corrupt });
    t.after(() => env.host.dispose());
    await env.open();
    if (corrupt) assert.match(env.text(), /读取失败，原数据已保留/);
    await env.click("保存本机测试记录");
    assert.match(env.text(), /本机保存失败，原数据已保留/);
    assert.equal(store.get(SAVE_KEY), before);
    assert.equal(env.host.getState().phase, "running");
  }
});

test("disposing during asynchronous login prevents late UI or storage updates", async () => {
  const env = harness({ backendBaseUrl: "https://api.example.test" });
  await env.open();
  await env.click("检查微信登录");
  assert.equal(env.calls.requests.length, 1);
  assert.match(env.text(), /正在检查登录/);
  const before = JSON.stringify(env.drawCalls());
  env.host.dispose();
  env.calls.requests[0].success({ statusCode: 200, data: { ok: true, playerId: "test-player", sessionToken: "test-token-for-diagnostic", expiresAt: Date.now() + 60_000 } });
  await settle();
  env.tick();
  assert.equal(JSON.stringify(env.drawCalls()), before);
  assert.equal(env.calls.writes, 0);
  assert.equal(env.store.size, 0);
  assert.equal(env.frames.size, 0);
  assert.equal(env.host.getState().phase, "disposed");
});

test("diagnostic narrow-screen controls and longest normal statuses remain within safe bounds", async t => {
  for (const initial of ["empty", "corrupt", "large-counter"]) {
    const store = new Map();
    if (initial === "corrupt") store.set(SAVE_KEY, "invalid");
    if (initial === "large-counter") store.set(SAVE_KEY, JSON.stringify({ formatVersion: 1, schemaVersion: 1, revision: 1, savedAt: Date.now(), state: { checks: 999999999999999 } }));
    const env = harness({ width: 320, height: 568, store });
    t.after(() => env.host.dispose());
    await env.open();
    for (const label of [null, "测试触控", "保存本机测试记录", "检查微信登录"]) {
      if (label) await env.click(label);
      for (const call of env.drawCalls()) {
        if (call.kind === "rect" && call.x === 0 && call.y === 0) continue;
        assert.ok(call.x >= 0 && call.x + call.width <= 320, `${initial}: horizontal bounds: ${JSON.stringify(call)}`);
        assert.ok(call.y >= 76 && call.y + call.height <= 548, `${initial}: vertical bounds: ${JSON.stringify(call)}`);
      }
    }
  }
});
