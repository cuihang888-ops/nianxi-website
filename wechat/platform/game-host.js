import { createWechatAdapter } from "./wechat-adapter.js";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;
const messages = Object.freeze({
  START_FAILED: "Game startup failed.",
  GAME_RUNTIME_ERROR: "Game execution stopped after an error.",
  PLATFORM_ERROR: "The WeChat runtime reported an error.",
  DISPOSED: "The game host has been disposed.",
});
const failure = (code, detail = {}) => Object.freeze({ ok: false, error: Object.freeze({ code, message: messages[code], ...detail }) });
const errorNames = new Set(["Error", "TypeError", "ReferenceError", "RangeError", "SyntaxError", "EvalError", "URIError"]);
const stages = new Set(["canvas", "scheduler", "platform", "viewport", "events", "game-create", "three-scope", "renderer", "ui-canvas", "scene", "ui-resize", "game-resize", "update", "render", "input", "pause", "resume", "frame"]);

function diagnostic(stage, error) {
  const detail = { stage: stages.has(stage) ? stage : "platform" };
  try {
    if (errorNames.has(error?.name)) detail.errorName = error.name;
    const match = typeof error?.stack === "string" && error.stack.match(/(?:^|[\s(/\\])game\.js:(\d{1,7}):(\d{1,7})(?=[\s)]|$)/);
    if (match) detail.source = `game.js:${match[1]}:${match[2]}`;
  } catch {}
  return detail;
}

function frameScheduler(canvas, scheduler) {
  if (scheduler) return scheduler;
  if (typeof canvas.requestAnimationFrame === "function" && typeof canvas.cancelAnimationFrame === "function") return canvas;
  // Mini Games expose these as global functions; globalThis is not required.
  if (typeof requestAnimationFrame === "function" && typeof cancelAnimationFrame === "function") {
    return { requestAnimationFrame: callback => requestAnimationFrame(callback), cancelAnimationFrame: id => cancelAnimationFrame(id) };
  }
  throw new TypeError("Animation frame API unavailable");
}

function readViewport(wxApi, size) {
  const info = typeof wxApi.getWindowInfo === "function" ? wxApi.getWindowInfo() : wxApi.getSystemInfoSync();
  const width = finite(size?.windowWidth, info.windowWidth);
  const height = finite(size?.windowHeight, info.windowHeight);
  if (!(width > 0 && height > 0)) throw new TypeError("Invalid window size");
  let menu = null;
  try { menu = wxApi.getMenuButtonBoundingClientRect?.(); } catch {}
  const screenTop = finite(info.screenTop, 0);
  const safeTop = clamp(Math.max(finite(info.safeArea?.top, 0), finite(menu?.bottom, 0), finite(info.statusBarHeight, 0)) - screenTop, 0, height);
  return Object.freeze({
    width, height,
    pixelRatio: clamp(finite(info.pixelRatio, 1), 1, 3),
    safeTop,
    safeBottom: clamp(height - (finite(info.safeArea?.bottom, height + screenTop) - screenTop), 0, height),
    safeLeft: clamp(finite(info.safeArea?.left, 0), 0, width),
    safeRight: clamp(width - finite(info.safeArea?.right, width), 0, width),
  });
}

function touchPoints(points) {
  return Object.freeze((Array.isArray(points) ? points : [])
    .filter(point => Number.isFinite(point?.clientX) && Number.isFinite(point?.clientY))
    .map(point => Object.freeze({ id: point.identifier, x: point.clientX, y: point.clientY })));
}

export function createWechatGameHost(wxApi, { config, createGame, onError, scheduler } = {}) {
  if (typeof createGame !== "function") throw new TypeError("createGame is required");
  let phase = "idle", visible = true, viewport = null, canvas = null, game = null, platform = null;
  let startPromise = null, frame = null, lastFrameAt = null, lastError = null, loopEpoch = 0;
  let requestFrame, cancelFrame;
  let stage = "canvas";
  const inputListeners = new Set();
  const removers = [];
  const releasedGames = new WeakSet();
  const overlayCanvases = new Set();

  const stopped = () => phase === "disposed" || phase === "error";
  const getState = () => Object.freeze({ phase, visible, viewport, error: lastError });

  function cancelLoop() {
    loopEpoch += 1;
    const pending = frame;
    frame = null;
    lastFrameAt = null;
    if (pending !== null) { try { cancelFrame(pending); } catch {} }
  }

  function releaseGame(instance) {
    if (!instance || typeof instance !== "object" || releasedGames.has(instance)) return;
    releasedGames.add(instance);
    try { Promise.resolve(instance.dispose?.()).catch(() => {}); } catch {}
  }

  function cleanup() {
    cancelLoop();
    inputListeners.clear();
    for (const remove of removers.splice(0)) { try { remove(); } catch {} }
    try { platform?.dispose(); } catch {}
    releaseGame(game);
    game = null;
    for (const auxiliary of overlayCanvases) {
      try { auxiliary.width = 0; auxiliary.height = 0; } catch {}
    }
    overlayCanvases.clear();
  }

  function fail(code, error, at = stage) {
    if (stopped()) return;
    lastError = failure(code, diagnostic(at, error)).error;
    phase = "error";
    cleanup();
    // Error objects can contain credentials, request URLs or private game data.
    try { Promise.resolve(onError?.(lastError)).catch(() => {}); } catch {}
  }

  function invoke(method, ...args) {
    if (stopped() || typeof game?.[method] !== "function") return;
    stage = method === "resize" ? "game-resize" : method;
    try {
      const result = game[method](...args);
      const at = stage;
      if (result?.then) Promise.resolve(result).catch(error => fail("GAME_RUNTIME_ERROR", error, at));
    } catch (error) { fail("GAME_RUNTIME_ERROR", error); }
  }

  function schedule() {
    if (phase !== "running" || frame !== null) return;
    const epoch = loopEpoch;
    try { frame = requestFrame(timestamp => { if (epoch === loopEpoch) onFrame(timestamp); }); } catch (error) { fail("GAME_RUNTIME_ERROR", error, "frame"); }
  }

  function onFrame(timestamp) {
    frame = null;
    if (phase !== "running") return;
    const time = finite(timestamp, Date.now());
    const dt = lastFrameAt === null ? 0 : clamp((time - lastFrameAt) / 1000, 0, 0.05);
    lastFrameAt = time;
    invoke("update", dt);
    if (phase !== "running") return;
    invoke("render");
    schedule();
  }

  function notifyInput(type, event = {}) {
    if (phase !== "running" && type !== "cancel") return;
    const normalized = Object.freeze({ type, touches: touchPoints(event.touches), changedTouches: touchPoints(event.changedTouches) });
    for (const listener of [...inputListeners]) {
      if (stopped()) break;
      stage = "input";
      try {
        const result = listener(normalized);
        if (result?.then) Promise.resolve(result).catch(error => fail("GAME_RUNTIME_ERROR", error, "input"));
      } catch (error) { fail("GAME_RUNTIME_ERROR", error); }
    }
  }

  function bind(event, callback) {
    if (typeof wxApi[`on${event}`] !== "function") return;
    const guarded = value => { if (!stopped()) callback(value); };
    wxApi[`on${event}`](guarded);
    removers.push(() => wxApi[`off${event}`]?.(guarded));
  }

  function resize(size) {
    stage = "viewport";
    try {
      viewport = readViewport(wxApi, size);
      const pixelWidth = Math.round(viewport.width * viewport.pixelRatio);
      const pixelHeight = Math.round(viewport.height * viewport.pixelRatio);
      if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
      if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
      invoke("resize", viewport);
    } catch (error) { fail("GAME_RUNTIME_ERROR", error); }
  }

  function hide() {
    if (!visible) return;
    visible = false;
    cancelLoop();
    if (phase === "running") {
      notifyInput("cancel");
      if (stopped()) return;
      phase = "paused";
      invoke("pause");
    }
  }

  function show() {
    if (visible) return;
    visible = true;
    if (phase !== "paused") return;
    resize();
    if (stopped()) return;
    phase = "running";
    invoke("resume");
    schedule();
  }

  const input = Object.freeze({
    subscribe(listener) {
      if (typeof listener !== "function") throw new TypeError("Input listener must be a function");
      if (stopped()) return () => {};
      inputListeners.add(listener);
      return () => inputListeners.delete(listener);
    },
  });

  async function initialize() {
    if (stopped()) return failure(lastError?.code || "DISPOSED");
    try {
      stage = "canvas";
      canvas = wxApi.createCanvas();
      stage = "scheduler";
      const clock = frameScheduler(canvas, scheduler);
      if (typeof clock.requestAnimationFrame !== "function" || typeof clock.cancelAnimationFrame !== "function") throw new TypeError("Animation frame API unavailable");
      requestFrame = clock.requestAnimationFrame.bind(clock);
      cancelFrame = clock.cancelAnimationFrame.bind(clock);
      stage = "platform";
      platform = createWechatAdapter(wxApi, config);
      resize();
      if (stopped()) return failure(lastError?.code || "DISPOSED");
      stage = "events";
      bind("Hide", hide);
      bind("Show", show);
      bind("Error", error => fail("PLATFORM_ERROR", error, "platform"));
      bind("WindowResize", event => resize(event?.size || event));
      for (const type of ["Start", "Move", "End", "Cancel"]) bind(`Touch${type}`, event => notifyInput(type.toLowerCase(), event));
      const context = Object.freeze({
        canvas, platform, input,
        createImage: typeof wxApi.createImage === "function" ? () => wxApi.createImage() : undefined,
        setStage(value) { if (stages.has(value)) stage = value; },
        createOverlayCanvas() {
          if (stopped()) throw new Error("The game host is no longer active");
          const auxiliary = wxApi.createCanvas();
          if (auxiliary === canvas || typeof auxiliary?.getContext !== "function") throw new TypeError("A separate overlay canvas is required");
          overlayCanvases.add(auxiliary);
          return auxiliary;
        },
        get viewport() { return viewport; },
      });
      stage = "game-create";
      const instance = await createGame(context);
      if (stopped()) {
        releaseGame(instance);
        return failure(lastError?.code || "DISPOSED");
      }
      if (!instance || typeof instance !== "object") throw new TypeError("Invalid game instance");
      game = instance;
      invoke("resize", viewport);
      if (stopped()) return failure(lastError.code);
      phase = visible ? "running" : "paused";
      invoke(visible ? "resume" : "pause");
      if (stopped()) return failure(lastError.code);
      schedule();
      return stopped() ? failure(lastError.code) : Object.freeze({ ok: true });
    } catch (error) {
      if (phase !== "disposed") fail("START_FAILED", error);
      return lastError ? Object.freeze({ ok: false, error: lastError }) : failure("DISPOSED");
    }
  }

  return Object.freeze({
    start() {
      if (phase === "disposed") return Promise.resolve(failure("DISPOSED"));
      if (!startPromise) {
        phase = "loading";
        startPromise = Promise.resolve().then(initialize);
      }
      return startPromise;
    },
    dispose() {
      if (phase === "disposed") return;
      phase = "disposed";
      cleanup();
    },
    getState,
  });
}
