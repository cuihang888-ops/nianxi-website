import { WECHAT_RUNTIME_CONFIG } from "./runtime-config.js";
import { createWechatAdapter } from "./platform/wechat-adapter.js";

const platform = createWechatAdapter(wx, WECHAT_RUNTIME_CONFIG);
const canvas = wx.createCanvas();
const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
const width = windowInfo.windowWidth;
const height = windowInfo.windowHeight;
const menuBounds = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null;
const contentTop = Math.max(88, (menuBounds?.bottom || 64) + 32);
const ratio = Math.min(windowInfo.pixelRatio || 1, 3);
canvas.width = Math.round(width * ratio);
canvas.height = Math.round(height * ratio);
const context = canvas.getContext("2d");
const diagnostics = platform.getDiagnostics();
let status = diagnostics.backendConfigured ? "等待登录联调" : diagnostics.backendError.message;
let busy = false;
let active = true;
const button = { x: 24, y: Math.max(255, Math.min(height - 110, 330)), width: Math.max(120, width - 48), height: 48 };

function wrappedText(text, x, y, maxWidth, lineHeight) {
  let line = "";
  for (const character of text) {
    const candidate = line + character;
    if (line && context.measureText(candidate).width > maxWidth) {
      context.fillText(line, x, y);
      line = character;
      y += lineHeight;
    } else line = candidate;
  }
  if (line) context.fillText(line, x, y);
  return y + lineHeight;
}

function render() {
  if (!active) return;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.fillStyle = "#f5f7f8";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#202b2d";
  context.font = "bold 24px sans-serif";
  context.fillText("安和里 · 微信接入", 24, contentTop);
  context.font = "14px sans-serif";
  let y = wrappedText("平台诊断入口，游戏内容由 Muse 接入。", 24, contentTop + 33, width - 48, 22);
  y = wrappedText(`AppID: ${diagnostics.appId}`, 24, y + 18, width - 48, 22);
  y = wrappedText(`版本: ${diagnostics.clientVersion}`, 24, y + 6, width - 48, 22);
  context.fillStyle = "#495f61";
  y = wrappedText(status, 24, y + 18, width - 48, 24);
  button.y = Math.max(y + 24, Math.min(height - 110, 330));
  context.fillStyle = busy ? "#8caaa0" : "#23795b";
  context.fillRect(button.x, button.y, button.width, button.height);
  context.fillStyle = "#ffffff";
  context.font = "16px sans-serif";
  context.textAlign = "center";
  context.fillText(busy ? "正在验证身份" : "检查微信登录", width / 2, button.y + 30);
  context.textAlign = "left";
}

wx.onTouchEnd(async event => {
  const point = event.changedTouches?.[0];
  if (!point || busy || point.clientX < button.x || point.clientX > button.x + button.width || point.clientY < button.y || point.clientY > button.y + button.height) return;
  busy = true;
  status = "正在等待平台与服务端确认。";
  render();
  const result = await platform.startLogin();
  busy = false;
  status = result.ok ? "微信身份已由服务端确认，游戏内容尚未接入。" : result.error.message;
  render();
});

platform.subscribeLifecycle({
  onHide() { active = false; },
  onShow() { active = true; render(); },
  onError() { status = "运行异常，请查看开发工具诊断日志。"; render(); },
});
render();
