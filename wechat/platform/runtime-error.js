const BUILD = "ANH-1114A";
const CODES = new Set(["START_FAILED", "GAME_RUNTIME_ERROR", "PLATFORM_ERROR"]);
const STAGES = new Set([
  "canvas", "scheduler", "platform", "viewport", "events", "game-create", "game-resize",
  "three-scope", "renderer", "ui-canvas", "scene", "ui-resize",
  "update", "render", "input", "resume", "pause", "frame",
]);
const NAMES = new Set(["Error", "TypeError", "ReferenceError", "RangeError", "SyntaxError", "EvalError", "URIError"]);

export function runtimeErrorReport(error = {}) {
  const report = {
    build: BUILD,
    code: CODES.has(error.code) ? error.code : "START_FAILED",
    stage: STAGES.has(error.stage) ? error.stage : "unknown",
    errorName: NAMES.has(error.errorName) ? error.errorName : "Error",
    source: /^game\.js:\d{1,8}:\d{1,8}$/.test(error.source || "") ? error.source : "",
  };
  return Object.freeze(report);
}

export function showRuntimeError(wxApi, error) {
  const report = runtimeErrorReport(error);
  const diagnostic = [report.build, report.code, report.stage, report.errorName, report.source].filter(Boolean).join(" / ");
  // Keep only a bounded diagnostic, never a save, request URL or raw exception.
  try { wxApi.setStorageSync?.("anheli-runtime-error", report); } catch {}
  const fallback = () => { try { wxApi.showToast?.({ title: "启动遇到问题，请重新进入", icon: "none", duration: 10000 }); } catch {} };
  if (typeof wxApi.showModal === "function") {
    try {
      wxApi.showModal({
        title: "安和里暂时未能运行",
        content: `请把下面的诊断码发给开发者，本机存档会保留。\n${diagnostic}`,
        showCancel: false,
        confirmText: "知道了",
        fail: fallback,
      });
    } catch { fallback(); }
  } else fallback();
  return diagnostic;
}
