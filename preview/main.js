import * as THREE from "three";
import { createGame } from "../wechat/game-entry.js";

const canvas = document.getElementById("game");
const status = document.getElementById("status");
const listeners = new Set(), touches = new Map(), keys = new Set();
const debug = new URLSearchParams(location.search).get("test") === "1";
const wechatRenderer = new URLSearchParams(location.search).get("renderer") === "wechat";
const viewport = () => ({ width: innerWidth, height: innerHeight, pixelRatio: Math.min(devicePixelRatio, 2), safeTop: 0, safeBottom: 0, safeLeft: 0, safeRight: 0 });
let game, frame = null, last = null;
const overlays = [];
class ScreenCanvas {
  get width() { return canvas.width; }
  set width(value) { canvas.width = value; }
  get height() { return canvas.height; }
  set height(value) { canvas.height = value; }
  getContext(...args) { return canvas.getContext(...args); }
  createImage() { return document.createElement("img"); }
}
function emit(type, changedTouches = []) {
  const event = { type, touches: [...touches.values()], changedTouches };
  for (const listener of listeners) listener(event);
}
function stopInput() {
  touches.clear(); keys.clear(); emit("cancel"); game?.setMoveInput(0, 0);
}
function fail(error) {
  if (frame !== null) cancelAnimationFrame(frame);
  frame = null;
  status.hidden = false;
  status.textContent = "暂时无法进入，请刷新重试。";
  console.error(error);
}
function animate(time) {
  frame = null;
  if (document.hidden) return;
  try {
    const dt = last === null ? 0 : Math.min(0.05, (time - last) / 1000);
    last = time;
    game.setMoveInput((keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0),
      (keys.has("w") || keys.has("arrowup") ? 1 : 0) - (keys.has("s") || keys.has("arrowdown") ? 1 : 0));
    game.update(dt); game.render();
    frame = requestAnimationFrame(animate);
  } catch (error) { fail(error); }
}
try {
  game = createGame({ canvas: wechatRenderer ? new ScreenCanvas() : canvas, ...(wechatRenderer ? {} : { three: THREE }), viewport: viewport(), debug,
    createOverlayCanvas() { const layer = document.createElement("canvas"); overlays.push(layer); return layer; },
    platform: { storage: { getItem: key => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value) } },
    input: { subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); } },
  });
  status.hidden = true;
  if (debug) window.__trial = { ...game.debug, pause: () => { game.pause(); stopInput(); }, resume: () => game.resume(), game };
  frame = requestAnimationFrame(animate);
} catch (error) { fail(error); }

canvas.addEventListener("pointerdown", event => {
  if (!game || event.button > 0) return;
  canvas.setPointerCapture(event.pointerId);
  const point = { id: event.pointerId, x: event.clientX, y: event.clientY };
  touches.set(event.pointerId, point); emit("start", [point]);
});
canvas.addEventListener("pointermove", event => {
  if (!touches.has(event.pointerId)) return;
  const point = { id: event.pointerId, x: event.clientX, y: event.clientY };
  touches.set(event.pointerId, point); emit("move", [point]);
});
canvas.addEventListener("pointerup", event => {
  if (!touches.has(event.pointerId)) return;
  touches.delete(event.pointerId);
  emit("end", [{ id: event.pointerId, x: event.clientX, y: event.clientY }]);
});
canvas.addEventListener("pointercancel", stopInput);
canvas.addEventListener("lostpointercapture", event => { if (touches.has(event.pointerId)) stopInput(); });
canvas.addEventListener("wheel", event => { event.preventDefault(); game?.zoom(event.deltaY < 0 ? 1.08 : 0.92); }, { passive: false });
addEventListener("keydown", event => {
  const key = event.key.toLowerCase();
  if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) { event.preventDefault(); keys.add(key); }
});
addEventListener("keyup", event => keys.delete(event.key.toLowerCase()));
addEventListener("blur", stopInput);
addEventListener("resize", () => { stopInput(); game?.resize(viewport()); });
document.addEventListener("visibilitychange", () => {
  stopInput(); last = null;
  if (document.hidden) { if (frame !== null) cancelAnimationFrame(frame); frame = null; game?.pause(); }
  else { game?.resume(); if (game && frame === null) frame = requestAnimationFrame(animate); }
});
addEventListener("pagehide", event => {
  if (frame !== null) cancelAnimationFrame(frame);
  frame = null; last = null; stopInput();
  if (event.persisted) game?.pause();
  else { game?.dispose(); overlays.forEach(layer => { layer.width = 0; layer.height = 0; }); }
});
addEventListener("pageshow", event => {
  if (!event.persisted || !game) return;
  last = null; game.resize(viewport()); game.resume();
  if (!document.hidden && frame === null) frame = requestAnimationFrame(animate);
});
