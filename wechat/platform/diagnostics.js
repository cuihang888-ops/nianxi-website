import { createLocalSaveRepository } from "./save-repository.js";

export function createDiagnostics(context) {
  const drawing = context.canvas.getContext("2d");
  const saves = createLocalSaveRepository(context.platform.storage, {
    namespace: "anheli-platform-diagnostic",
    schemaVersion: 1,
    validate: value => value && Number.isSafeInteger(value.checks) && value.checks >= 0,
  });
  const restored = saves.load();
  const diagnostic = context.platform.getDiagnostics();
  let viewport = context.viewport;
  let checks = restored.ok ? restored.state?.checks || 0 : 0;
  let revision = restored.ok ? restored.revision : 0;
  let saveStatus = restored.ok ? (restored.state ? `已恢复本机记录 ${checks} 次` : "本机测试记录为空") : "本机记录读取失败，原数据已保留";
  let loginStatus = diagnostic.backendConfigured ? "登录服务已配置，等待联调" : "登录服务未配置";
  let busy = false, disposed = false, elapsed = 0, resumes = 0, touches = 0;
  let buttons = [];

  function text(value, x, y, maxWidth, lineHeight = 21) {
    let line = "";
    for (const character of value) {
      const next = line + character;
      if (line && drawing.measureText(next).width > maxWidth) {
        drawing.fillText(line, x, y);
        y += lineHeight;
        line = character;
      } else line = next;
    }
    if (line) drawing.fillText(line, x, y);
    return y + lineHeight;
  }

  function render() {
    if (disposed) return;
    const { width, height, pixelRatio, safeTop, safeLeft, safeRight } = viewport;
    const left = Math.max(20, safeLeft + 12);
    const available = width - left - Math.max(20, safeRight + 12);
    drawing.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    drawing.fillStyle = "#f4f7f6";
    drawing.fillRect(0, 0, width, height);
    drawing.fillStyle = "#18352e";
    drawing.font = "bold 22px sans-serif";
    let y = text("安和里 · 平台验收", left, safeTop + 32, available, 27);
    drawing.font = "13px sans-serif";
    drawing.fillStyle = "#506560";
    y = text("游戏场景等待 Muse 接入", left, y + 4, available);
    y = text(`AppID: ${diagnostic.appId}`, left, y + 9, available);
    y = text(`前台运行 ${Math.floor(elapsed)} 秒 · 恢复 ${resumes} 次`, left, y + 4, available);
    y = text(`触控 ${touches} 次 · ${saveStatus}`, left, y + 4, available);
    y = text(loginStatus, left, y + 4, available);
    buttons = [];
    const definitions = [
      { id: "touch", label: "测试触控", color: "#276a57" },
      { id: "save", label: "保存本机测试记录", color: "#315d79" },
      { id: "login", label: busy ? "正在检查登录" : "检查微信登录", color: busy ? "#879f95" : "#276a57" },
    ];
    for (const definition of definitions) {
      y += 9;
      const button = { ...definition, x: left, y, width: available, height: 42 };
      buttons.push(button);
      drawing.fillStyle = button.color;
      drawing.fillRect(left, y, available, button.height);
      drawing.fillStyle = "#ffffff";
      drawing.font = "15px sans-serif";
      drawing.textAlign = "center";
      drawing.fillText(button.label, left + available / 2, y + 27);
      drawing.textAlign = "left";
      y += button.height;
    }
    drawing.font = "12px sans-serif";
    drawing.fillStyle = "#506560";
    text("本页只验证平台；测试记录不属于游戏存档或云存档。", left, y + 25, available, 18);
  }

  const unsubscribe = context.input.subscribe(async event => {
    if (disposed || event.type !== "end") return;
    const point = event.changedTouches[0];
    if (!point) return;
    const button = buttons.find(item => point.x >= item.x && point.x <= item.x + item.width && point.y >= item.y && point.y <= item.y + item.height);
    if (!button) return;
    if (button.id === "touch") touches += 1;
    if (button.id === "save") {
      const result = saves.save({ checks: checks + 1 }, { expectedRevision: revision });
      if (result.ok) { checks += 1; revision = result.revision; saveStatus = `本机保存成功 ${checks} 次`; }
      else saveStatus = "本机保存失败，原数据已保留";
    }
    if (button.id === "login" && !busy) {
      busy = true;
      const result = await context.platform.startLogin();
      if (disposed) return;
      busy = false;
      loginStatus = result.ok ? "服务端已确认微信身份" : result.error.code === "BACKEND_NOT_CONFIGURED" ? "已检查：登录服务未配置" : "登录检查未通过，请稍后重试";
    }
  });

  return {
    update(dt) { elapsed += dt; },
    render,
    resize(value) { viewport = value; },
    resume() { resumes += 1; },
    dispose() { disposed = true; unsubscribe(); },
  };
}
