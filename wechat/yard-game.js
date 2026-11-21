import './platform/runtime-compat.js';
import {WECHAT_RUNTIME_CONFIG} from './runtime-config.js';
import {createWechatGameHost} from './platform/game-host.js';
import {showRuntimeError} from './platform/runtime-error.js';
import {createGame} from './yard-entry.js';

const host=createWechatGameHost(wx,{
  config:WECHAT_RUNTIME_CONFIG,createGame,
  onError:error=>console.error('Anheli yard: '+showRuntimeError(wx,error)),
});
host.start();
