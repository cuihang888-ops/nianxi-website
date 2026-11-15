import test from "node:test";
import assert from "node:assert/strict";
import { runtimeErrorReport, showRuntimeError } from "../wechat/platform/runtime-error.js";

test("runtime failure preserves an actionable native dialog without copying private errors or saves", () => {
  const writes = [], dialogs = [];
  const wx = { setStorageSync: (...args) => writes.push(args), showModal: options => dialogs.push(options) };
  const diagnostic = showRuntimeError(wx, {
    code: "GAME_RUNTIME_ERROR", stage: "render", errorName: "TypeError", source: "game.js:123:45",
    message: "private-access-token", stack: "https://private.invalid/token", save: { coins: 1200 },
  });
  assert.match(diagnostic, /render \/ TypeError \/ game\.js:123:45/);
  assert.equal(writes[0][0], "anheli-runtime-error");
  assert.equal(dialogs.length, 1);
  assert.equal(dialogs[0].showCancel, false);
  assert.equal(JSON.stringify([writes, dialogs, diagnostic]).includes("private"), false);
  assert.equal(JSON.stringify(writes).includes("coins"), false);
});

test("diagnostic fields accept only known codes and a bounded bundle location", () => {
  const report = runtimeErrorReport({ code: "private", stage: "private", errorName: "private", source: "https://private/game.js:1:2" });
  assert.equal(JSON.stringify(report).includes("private"), false);
  assert.equal(report.stage, "unknown");
  assert.equal(report.source, "");
  assert.equal(runtimeErrorReport({ source: "game.js:123456789:1" }).source, "");
});

test("native error reporting still works when storage or dialog is unavailable", () => {
  let toasts = 0;
  const wx = { setStorageSync() { throw new Error("unavailable"); }, showToast() { toasts++; } };
  assert.doesNotThrow(() => showRuntimeError(wx, {}));
  assert.equal(toasts, 1);
  wx.showModal = ({ fail }) => fail();
  showRuntimeError(wx, {});
  assert.equal(toasts, 2);
});
