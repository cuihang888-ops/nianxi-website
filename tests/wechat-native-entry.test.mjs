import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { buildSync } from "esbuild";
import { fileURLToPath } from "node:url";
import { createThreeCanvas } from "../wechat/platform/three-canvas.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const bundle = buildSync({
  absWorkingDir: root,
  stdin: { contents: `
    import "./wechat/platform/runtime-compat.js";
    import { createWechatGameHost } from "./wechat/platform/game-host.js";
    import { createGame } from "./wechat/game-entry.js";
    export function start(wx, scheduler) {
      const host = createWechatGameHost(wx, {
        config: { appId: "wx24c1d8b3a00f962e", clientVersion: "native-test", protocolVersion: 1, backendBaseUrl: "" },
        createGame(context) {
          const game = createGame(context);
          const dispose = game.dispose;
          game.dispose = () => {
            try { return dispose(); } catch (error) { disposeFailures.push(error); throw error; }
          };
          return game;
        },
        scheduler, onError: error => failures.push(error),
      });
      return { host, started: host.start() };
    }
  `, resolveDir: root },
  bundle: true, platform: "neutral", format: "iife", globalName: "NativeEntry", target: "es2017", write: false,
}).outputFiles[0].text;

function fixture(kind = "null-prototype", { missingGlobalThis = false, failDrawing = false, scheduler = false, missingFrames = false } = {}) {
  const context = vm.createContext({ console: { log() {}, warn() {}, error() {} } });
  vm.runInContext(`
    var failures = [], disposeFailures = [], frames = new Map(), events = new Map(), calls = [], dimensions = [];
    var nextFrame = 0, drawingFails = ${failDrawing};
    var requestAnimationFrame = callback => { frames.set(++nextFrame, callback); return nextFrame; };
    var cancelAnimationFrame = id => frames.delete(id);
    var originalObjectDescriptors = Object.getOwnPropertyDescriptors(Object.prototype);
    var nativePrototype = ${kind === "null-prototype" ? "null" : "Object.freeze({ native: true })"};
    var width = 0, height = 0;
    var gl = new Proxy({
      getExtension() { return null; },
      getShaderPrecisionFormat() { return { rangeMin: 127, rangeMax: 127, precision: 23 }; },
      getParameter(name) {
        if (name === 7938) return "WebGL 1.0";
        if (name === 34930 || name === 35660) return 8;
        if (name === 3379 || name === 34076) return 4096;
        if (name === 34921) return 16;
        if (name === 36347 || name === 36348 || name === 36349) return 128;
        if (name === 2978 || name === 3088) return [0, 0, width, height];
        if (name === 34016) return 33984;
        return 0;
      },
      getContextAttributes() { return { alpha: false }; },
      getShaderParameter() { return true; },
      getProgramParameter(program, name) { return name === 35714 ? true : name === 35718 ? 1 : 0; },
      getActiveUniform() { return { name: "map", size: 1, type: 35678 }; },
      getUniformLocation() { return {}; },
      getShaderInfoLog() { return ""; }, getProgramInfoLog() { return ""; },
    }, { get(target, key) {
      if (key in target) return target[key];
      if (typeof key === "string" && /^[A-Z_0-9]+$/.test(key)) return 0;
      return (...args) => { calls.push([key, args]); return key.startsWith("create") ? {} : undefined; };
    } });
    var drawing = new Proxy({ font: "14px sans-serif", measureText(value) { return { width: String(value).length * 7 }; },
      setTransform() { if (drawingFails) { const error = new TypeError("private-access-token"); error.stack = "TypeError: private-access-token\\n at draw (https://private.example/game.js:123:45)"; throw error; } },
    }, { get(target, key) { return key in target ? target[key] : () => {}; } });
    var native = Object.create(nativePrototype);
    Object.defineProperties(native, {
      width: { get() { return width; }, set(value) { width = value; dimensions.push([width, height]); } },
      height: { get() { return height; }, set(value) { height = value; dimensions.push([width, height]); } },
      style: { value: Object.freeze({ native: true }), configurable: false },
      getContext: { value(type) { if (this !== native) throw new TypeError("Native receiver lost"); if (type !== "webgl") throw new TypeError("Unexpected context"); return gl; } },
    });
    Object.preventExtensions(native);
    var originalNativeDescriptors = Object.getOwnPropertyDescriptors(native);
    var overlay = { width: 0, height: 0, getContext(type) { if (this !== overlay || type !== "2d") throw new Error("Bad overlay receiver"); return drawing; } };
    var canvasCount = 0;
    var wx = {
      createCanvas() { return ++canvasCount === 1 ? native : overlay; },
      createImage() { if (this !== wx) throw new Error("Bad image receiver"); return { nativeImage: true }; },
      getWindowInfo() { return { windowWidth: 390, windowHeight: 844, pixelRatio: 2 }; },
      getStorageSync() { return ""; }, setStorageSync() {},
    };
    for (const event of ["Show", "Hide", "Error", "WindowResize", "TouchStart", "TouchMove", "TouchEnd", "TouchCancel"]) {
      wx["on" + event] = callback => events.set(event, callback);
      wx["off" + event] = () => events.delete(event);
    }
    delete Object.hasOwn;
    var injectedScheduler;
    ${scheduler ? `
      injectedScheduler = {
        requestAnimationFrame(callback) { if (this !== injectedScheduler) throw new Error("Scheduler receiver lost"); frames.set(++nextFrame, callback); return nextFrame; },
        cancelAnimationFrame(id) { if (this !== injectedScheduler) throw new Error("Scheduler receiver lost"); frames.delete(id); },
      };
      requestAnimationFrame = () => { throw new Error("Global scheduler must not run"); };
      cancelAnimationFrame = () => { throw new Error("Global scheduler must not run"); };
    ` : ""}
    ${missingFrames ? "requestAnimationFrame = undefined; cancelAnimationFrame = undefined;" : ""}
    ${missingGlobalThis ? "globalThis = undefined;" : ""}
  `, context);
  vm.runInContext(bundle, context, { filename: "game.js" });
  vm.runInContext("var runtime = NativeEntry.start(wx, injectedScheduler);", context);
  return { context, runtime: context.runtime };
}

for (const kind of ["null-prototype", "frozen-prototype"]) {
  test(`real game starts, renders and disposes with ${kind} native Canvas`, async () => {
    const { context, runtime } = fixture(kind, { missingGlobalThis: true });
    assert.equal((await runtime.started).ok, true);
    assert.equal(vm.runInContext("canvasCount", context), 2);
    vm.runInContext("var frame = [...frames.values()][0]; frames.clear(); frame(16);", context);
    assert.equal(vm.runInContext("failures.length", context), 0, vm.runInContext("JSON.stringify(failures)", context));
    assert.equal(vm.runInContext("calls.some(([name]) => name === 'drawElements' || name === 'drawArrays')", context), true);
    assert.equal(vm.runInContext("calls.some(([name, args]) => name === 'texImage2D' && args.includes(overlay))", context), true);
    assert.equal(vm.runInContext("dimensions.every(([w,h]) => w <= 780 && h <= 1688)", context), true);
    assert.equal(vm.runInContext("frames.size", context), 1);
    assert.equal(vm.runInContext("failures.length", context), 0);
    assert.equal(vm.runInContext(`Object.keys(originalNativeDescriptors).every(key => {
      const before = originalNativeDescriptors[key], after = Object.getOwnPropertyDescriptor(native, key);
      return Reflect.ownKeys(before).every(field => before[field] === after[field]);
    }) && Reflect.ownKeys(native).length === Reflect.ownKeys(originalNativeDescriptors).length`, context), true);
    assert.equal(vm.runInContext("Object.getPrototypeOf(native) === nativePrototype", context), true);
    assert.equal(vm.runInContext(`Object.getOwnPropertyNames(Object.prototype).every(key => {
      const before = originalObjectDescriptors[key], after = Object.getOwnPropertyDescriptor(Object.prototype, key);
      return before && Reflect.ownKeys(before).every(field => before[field] === after[field]);
    }) && Object.getOwnPropertyNames(Object.prototype).length === Object.keys(originalObjectDescriptors).length`, context), true);
    runtime.host.dispose();
    assert.equal(vm.runInContext("disposeFailures.length", context), 0);
    assert.equal(vm.runInContext("frames.size + events.size", context), 0);
    assert.equal(vm.runInContext("overlay.width + overlay.height", context), 0);
    assert.equal(vm.runInContext("calls.some(([name]) => name === 'deleteBuffer')", context), true);
  });
}

test("real UI startup failure exposes only a whitelisted name, stage and game location", async () => {
  const { context, runtime } = fixture("null-prototype", { failDrawing: true });
  const result = await runtime.started;
  assert.equal(result.ok, false);
  assert.equal(result.error.stage, "ui-resize");
  assert.equal(result.error.errorName, "TypeError");
  assert.equal(result.error.source, "game.js:123:45");
  assert.equal(JSON.stringify(result).includes("private"), false);
  assert.equal(vm.runInContext("JSON.stringify(failures).includes('private')", context), false);
  assert.equal(vm.runInContext("frames.size + events.size", context), 0);
});

test("injected scheduler has priority and retains its receiver through the real entry", async () => {
  const { context, runtime } = fixture("null-prototype", { scheduler: true });
  assert.equal((await runtime.started).ok, true);
  assert.equal(vm.runInContext("frames.size", context), 1);
  runtime.host.dispose();
  assert.equal(vm.runInContext("frames.size", context), 0);
});

test("missing animation APIs fail at the scheduler without creating the scene or overlay", async () => {
  const { context, runtime } = fixture("null-prototype", { missingGlobalThis: true, missingFrames: true });
  const result = await runtime.started;
  assert.equal(result.ok, false);
  assert.equal(result.error.stage, "scheduler");
  assert.equal(result.error.errorName, "TypeError");
  assert.equal(vm.runInContext("canvasCount", context), 1);
  assert.equal(vm.runInContext("calls.length + frames.size + events.size", context), 0);
});

test("Three canvas delegates methods with native receivers and supports platform image creation", () => {
  const image = {}, native = { width: 2, height: 3, getContext(type) { assert.equal(this, native); return type; }, createImage() { assert.equal(this, native); return image; } };
  const wrapped = createThreeCanvas(native, () => { throw new Error("Unexpected fallback"); });
  assert.equal(wrapped.getContext("webgl"), "webgl");
  assert.equal(wrapped.createImage(), image);
  assert.equal(createThreeCanvas({ getContext() {} }, () => image).createImage(), image);
  assert.throws(() => createThreeCanvas({ getContext() {} }).createImage(), TypeError);
  assert.deepEqual(Object.keys(native), ["width", "height", "getContext", "createImage"]);
});
