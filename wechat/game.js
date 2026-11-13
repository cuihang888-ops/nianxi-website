import { WECHAT_RUNTIME_CONFIG } from "./runtime-config.js";
import { createWechatGameHost } from "./platform/game-host.js";
import { createGame } from "./game-entry.js";

const host = createWechatGameHost(wx, {
  config: WECHAT_RUNTIME_CONFIG,
  createGame,
  onError(error) {
    console.error(`Anheli platform: ${error.code}`);
    wx.showToast?.({ title: "运行已停止，请重新进入", icon: "none" });
  },
});

host.start();
