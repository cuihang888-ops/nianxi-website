import "./platform/runtime-compat.js";
import { WECHAT_RUNTIME_CONFIG } from "./runtime-config.js";
import { createWechatGameHost } from "./platform/game-host.js";
import { createGame } from "./game-entry.js";
import { showRuntimeError } from "./platform/runtime-error.js";

const host = createWechatGameHost(wx, {
  config: WECHAT_RUNTIME_CONFIG,
  createGame,
  onError(error) {
    console.error(`Anheli platform: ${showRuntimeError(wx, error)}`);
  },
});

host.start();
