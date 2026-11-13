import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { buildWechat } from "../scripts/build-wechat.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const testRoot = path.join(root, "reports", "wechat-build-tests");
const settle = () => new Promise(resolve => setImmediate(resolve));
const saveKey = "anheli-platform-diagnostic:save";

async function diagnosticBundle(t) {
  await fs.mkdir(testRoot, { recursive: true });
  const fixture = await fs.mkdtemp(path.join(testRoot, "diagnostic-bundle-"));
  t.after(async () => {
    assert.equal(path.dirname(fixture), testRoot);
    await fs.rm(fixture, { recursive: true, force: true });
  });
  await fs.cp(path.join(root, "wechat"), path.join(fixture, "wechat"), {
    recursive: true,
    filter: async filename => {
      const stat = await fs.lstat(filename);
      if (stat.isSymbolicLink()) throw new Error("Linked source cannot enter the bundle smoke fixture");
      if (stat.isDirectory()) return true;
      const name = path.basename(filename);
      return name !== "project.private.config.json" && !name.startsWith(".")
        && [".js", ".mjs", ".cjs", ".ts", ".json", ".LICENSE"].includes(path.extname(name));
    },
  });
  // Exercise the platform diagnostic bundle independently of Muse's game renderer.
  await fs.writeFile(path.join(fixture, "wechat", "game-entry.js"), 'export { createDiagnostics as createGame } from "./platform/diagnostics.js";\n');
  const report = await buildWechat({ projectRoot: fixture });
  assert.ok(report.files.some(file => file.path === "game.js"));
  assert.equal(report.modules.includes("wechat/game.js"), true);
  return fs.readFile(path.join(fixture, "dist", "wechat", "game.js"), "utf8");
}

function runtime(bundle, store) {
  const frames = new Map(), events = new Map(), errors = [], toasts = [];
  let sequence = 0, now = 0, drawCalls = [], canvasCount = 0, loginCalls = 0;
  const width = 390, height = 844;
  const drawing = {
    font: "13px sans-serif", textAlign: "left", fillStyle: "",
    setTransform() {},
    measureText(text) {
      const size = Number.parseFloat(/([0-9.]+)px/.exec(this.font)?.[1] || "13");
      return { width: [...text].reduce((total, char) => total + (char.codePointAt(0) > 255 ? 1 : 0.55) * size, 0) };
    },
    fillRect(x, y, w, h) {
      if (x === 0 && y === 0 && w === width && h === height) drawCalls = [];
      drawCalls.push({ kind: "rect", x, y, width: w, height: h });
    },
    fillText(text, x, y) {
      const w = this.measureText(text).width;
      const size = Number.parseFloat(/([0-9.]+)px/.exec(this.font)?.[1] || "13");
      drawCalls.push({ kind: "text", text, x: this.textAlign === "center" ? x - w / 2 : x, y: y - size, width: w, height: size });
    },
  };
  const canvas = { width: 0, height: 0, getContext(type) { assert.equal(type, "2d"); return drawing; } };
  const wx = {
    createCanvas() { canvasCount++; return canvas; },
    getWindowInfo: () => ({ windowWidth: width, windowHeight: height, pixelRatio: 2, statusBarHeight: 44, safeArea: { top: 44, left: 0, right: width, bottom: height - 20 } }),
    getMenuButtonBoundingClientRect: () => ({ bottom: 76 }),
    getStorageSync: key => store.get(key) ?? "",
    setStorageSync: (key, value) => store.set(key, value),
    removeStorageSync: key => store.delete(key),
    login() { loginCalls++; throw new Error("Unconfigured login must not contact WeChat"); },
    request() { throw new Error("Unconfigured backend must not send network requests"); },
    showToast: value => toasts.push(value),
  };
  for (const event of ["Show", "Hide", "Error", "WindowResize", "TouchStart", "TouchMove", "TouchEnd", "TouchCancel"]) {
    wx[`on${event}`] = handler => { if (!events.has(event)) events.set(event, new Set()); events.get(event).add(handler); };
    wx[`off${event}`] = handler => events.get(event)?.delete(handler);
  }
  const context = vm.createContext({
    wx,
    console: { error: value => errors.push(String(value)) },
    requestAnimationFrame(callback) { const id = ++sequence; frames.set(id, callback); return id; },
    cancelAnimationFrame: id => frames.delete(id),
  });
  assert.equal(vm.runInContext("[typeof window, typeof document, typeof require, typeof module, typeof process, typeof Buffer].join(',')", context), "undefined,undefined,undefined,undefined,undefined,undefined");
  vm.runInContext(bundle, context, { timeout: 3000, filename: "dist/wechat/game.js" });
  const emit = (event, value) => [...events.get(event) || []].forEach(handler => handler(value));
  function tick(delta = 16) {
    now += delta;
    const pending = [...frames.values()]; frames.clear();
    pending.forEach(callback => callback(now));
  }
  return {
    errors, toasts, canvas, frames, emit, tick,
    text: () => drawCalls.filter(call => call.kind === "text").map(call => call.text).join(""),
    async open() {
      await settle(); tick();
      assert.equal(canvasCount, 1);
      assert.equal(canvas.width, 780);
      assert.equal(canvas.height, 1688);
      assert.equal(frames.size, 1);
      assert.deepEqual(errors, []);
    },
    async click(label) {
      const text = drawCalls.find(call => call.kind === "text" && call.text === label);
      assert.ok(text, `Rendered button exists: ${label}`);
      emit("TouchEnd", { touches: [], changedTouches: [{ identifier: 1, clientX: text.x + text.width / 2, clientY: text.y + text.height / 2 }] });
      await settle(); tick();
    },
    stop() {
      emit("Error", { message: "test teardown" });
      assert.equal(frames.size, 0);
      assert.equal([...events.values()].reduce((total, handlers) => total + handlers.size, 0), 0);
      assert.equal(loginCalls, 0);
    },
  };
}

test("diagnostic fixture bundle starts without DOM or module loader and preserves touch-save-restart flow", async t => {
  const bundle = await diagnosticBundle(t);
  const store = new Map([["anheli-farm-v1", "existing-game-data"]]);
  const first = runtime(bundle, store);
  t.after(() => first.stop());
  await first.open();
  assert.match(first.text(), /安和里 · 平台验收/);
  await first.click("测试触控");
  assert.match(first.text(), /触控 1 次/);
  await first.click("保存本机测试记录");
  assert.match(first.text(), /本机保存成功 1 次/);
  assert.equal(JSON.parse(store.get(saveKey)).revision, 1);
  assert.equal(JSON.parse(store.get(saveKey)).state.checks, 1);
  await first.click("检查微信登录");
  assert.match(first.text(), /已检查：登录服务未配置/);
  first.emit("Hide");
  assert.equal(first.frames.size, 0);
  first.tick(3_600_000);
  first.emit("Show");
  first.tick();
  assert.match(first.text(), /前台运行 0 秒/);
  assert.match(first.text(), /恢复 2 次/);
  assert.deepEqual(first.errors, []);
  first.stop();

  const reopened = runtime(bundle, store);
  t.after(() => reopened.stop());
  await reopened.open();
  assert.match(reopened.text(), /已恢复本机记录 1 次/);
  await reopened.click("保存本机测试记录");
  assert.equal(JSON.parse(store.get(saveKey)).revision, 2);
  assert.equal(JSON.parse(store.get(saveKey)).state.checks, 2);
  assert.equal(store.get("anheli-farm-v1"), "existing-game-data");
  assert.deepEqual(reopened.errors, []);
});
