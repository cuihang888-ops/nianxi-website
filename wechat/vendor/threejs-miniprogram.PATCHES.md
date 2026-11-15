# Local Compatibility Patch

The bundled Three r108 adapter installs EventTarget methods on its internal
document and window objects. The upstream bundle instead targets each object's
constructor prototype, which is Object.prototype for those ordinary objects.

The two calls `L(i.constructor.prototype,u.prototype)` and
`L(a.constructor.prototype,u.prototype)` now target `i` and `a` directly. This
preserves their event methods, including WebVR disposal, without changing every
object in the Mini Game runtime. The screen canvas is separately wrapped by
`wechat/platform/three-canvas.js` before the adapter initializes.

`tests/wechat-native-entry.test.mjs` exercises the real game entry, renderer,
overlay texture, disposal, and unchanged native/Object prototypes in isolated
JavaScript runtimes. It does not replace device WebGL validation.
