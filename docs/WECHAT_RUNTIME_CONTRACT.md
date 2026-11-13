# WeChat game runtime contract

The platform host is `wechat/platform/game-host.js`. Codex owns this module; Muse owns the game factory and scene/UI implementation. It creates no map, rules, balances, assets or cloud save service. It does not emulate the browser DOM or validate a renderer's WeChat compatibility.

## Entry

```js
import { createWechatGameHost } from "./platform/game-host.js";
import { WECHAT_RUNTIME_CONFIG } from "./runtime-config.js";
import { createGame } from "./game-entry.js";

const host = createWechatGameHost(wx, {
  config: WECHAT_RUNTIME_CONFIG,
  createGame,
  onError(error) {
    // Show a platform-level failure state using error.code and error.message.
  },
});
host.start().then(result => {
  if (!result.ok) console.error(result.error.code);
});
```

`wechat/game-entry.js` exports the shared playable game factory. The diagnostic factory remains a test fixture; `wechat/game.js` stays the platform bootstrap. `start()` returns the same promise when called again. It resolves to `{ok:true}` when the factory and initial hooks complete, or `{ok:false,error:{code,message}}`. This is host startup, not proof of login, asset completeness or game readiness. Create a new host to retry after an error; do not run two hosts concurrently. The first canvas created by this host is the screen canvas. The game factory must use it rather than create a replacement screen canvas.

`host.getState()` returns `{phase,visible,viewport,error}`. Phases are `idle`, `loading`, `running`, `paused`, `error`, `disposed`. `host.dispose()` is idempotent and terminal. It cancels rendering, removes platform/input listeners, disposes the platform adapter and releases the game. A factory resolving after disposal is released without starting.

## Factory context

`createGame(context)` may be asynchronous while loading assets. It receives:

- `canvas`: actual `wx.createCanvas()` output, sized to the viewport backing pixels. The host does not select a drawing context. A Canvas 2D or WebGL renderer may use it.
- `createOverlayCanvas()`: create a separate offscreen canvas for Canvas UI. The host owns its lifetime and releases its backing dimensions on disposal or startup failure. This does not replace the main screen canvas or start another frame loop. The game uses a CanvasTexture and recreates its GPU allocation after dimensions change.
- `platform`: existing `createWechatAdapter` instance, with login, local string storage and lifecycle subscription. Empty backend configuration remains an explicit login failure.
- `viewport`: a getter returning the current immutable `{width,height,pixelRatio,safeTop,safeBottom,safeLeft,safeRight}`. Width, height, safe insets and input coordinates use logical pixels. Backing canvas size is `round(width * pixelRatio)` by `round(height * pixelRatio)`. Pixel ratio is capped at 3. `safeTop` includes the WeChat menu button bottom.
- `input.subscribe(handler)`: subscribe to normalized touch events and receive an unsubscribe function. Events are `{type,touches,changedTouches}`, with `type` equal to `start`, `move`, `end` or `cancel`; points are `{id,x,y}` in logical pixels. Do not multiply them by pixel ratio for UI hit testing. No original platform event is exposed.

The factory returns an object with optional hooks:

```js
{
  update(dtSeconds) {},
  render() {},
  resize(viewport) {},
  pause() {},
  resume() {},
  dispose() {},
}
```

Frame and lifecycle hooks should complete synchronously. The factory and input handlers may await loading or login. Async operations must check their own disposed state before updating game UI. `dispose()` must release pending loaders, audio, GPU resources, game subscriptions and timers; the host only owns its platform listeners and frame scheduling.

## Runtime behavior

- One frame request is outstanding at a time. The host prefers the canvas RAF pair, falling back to the global RAF pair. Tests may inject `scheduler: {requestAnimationFrame,cancelAnimationFrame}`.
- `update` receives seconds, capped at 0.05. The initial frame and first frame after foreground return receive zero. Do not use this interval to compute offline rewards; game rules must use their own confirmed timestamps.
- On hide, the host cancels the frame loop, dispatches an empty `cancel` touch event to clear held input, then calls `pause` once. Ordinary touches are ignored while paused or loading.
- On show, the host reads current viewport information, calls `resize` then `resume` once, and starts one loop. Hide/show during asynchronous loading is respected when the factory resolves.
- Window resize updates backing canvas dimensions before calling `resize`. A 2D renderer must restore transforms/styles after dimensions change; a WebGL renderer must update drawing buffers, viewport and camera. The host does not configure a Three.js renderer.
- Factory errors, game hook/input errors or platform `onError` stop the loop, release resources and call `onError` with a sanitized code/message. Raw exception messages and platform error payloads are not returned or logged.

## Verification

Run `node --test tests/wechat-runtime.test.mjs`. Tests cover one startup/canvas/loop, bounded timing, background pause and stale frame cancellation, touch normalization, resize, asynchronous startup races, disposal, sanitized errors and listener removal. These are platform mock tests; the parent integration must also run the actual developer-tool simulator and real-device checks. A successful diagnostic scene does not prove Muse's renderer, textures, game controls or cloud save work.

API signatures were checked against WeChat's official `wechat-miniprogram/minigame-api-typings` source on 2026-11-13: `Touch.clientX/clientY` are visible-viewport coordinates, `onWindowResize` and touch cancellation have matching removal methods, `getWindowInfo` supplies screen/window and safe-area values, and animation-frame functions are global in the mini-game runtime. The optional canvas RAF pair is used only if both methods exist.

```text
https://raw.githubusercontent.com/wechat-miniprogram/minigame-api-typings/master/types/wx/lib.wx.api.d.ts
```
