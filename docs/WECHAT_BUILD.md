# WeChat game build

The source entry is `wechat/game.js`. The generated, importable project is `dist/wechat`. Muse owns the game renderer and gameplay; this pipeline only prepares a WeChat runtime package. It does not upload, deploy or publish anything.

```sh
node scripts/build-wechat.mjs --check
node scripts/build-wechat.mjs
node --test tests/wechat-build.test.mjs
```

`--check` bundles and validates in memory without changing output. A normal build writes a complete staging directory first, then replaces only `dist/wechat`. Existing web files elsewhere in `dist` remain unchanged. Failed compilation or budget checks leave the previous game output intact. The web build may clear all of `dist`, so run the WeChat build after the web build when both artifacts are needed.

The script uses esbuild to bundle JavaScript/TypeScript into one ES2017 IIFE `game.js`; `wx` stays the actual platform global. The preview uploader rejected optional chaining in the ES2020 output on 2026-11-14, so newer syntax is lowered before upload. Syntax lowering does not supply missing runtime APIs; the entry loads the small `platform/runtime-compat.js` compatibility layer before the game modules. Modules must resolve within `wechat/`, `src/`, or `node_modules/`. Node builtins, service modules, React/DOM framework imports, JSX, HTML and CSS are rejected. This catches known incompatible dependencies, not every possible use of a browser global: runtime testing remains required. Pure shared game rules may be imported normally. Do not provide a fake `window`/`document` just to make React compile.

On Windows, an open Developer Tools project may lock `dist/wechat` and prevent its atomic replacement. Close that project through the tool or its official `cli close --project` command before rebuilding, then generate a new preview. If the directory remains locked after closing the project, exit Developer Tools normally (or use its official `cli quit`) before rebuilding, then reopen the same generated project. Do not edit the generated bundle in place or disable the staging checks to work around a directory lock.

The output allowlist is:

- Bundled `game.js`.
- Validated `game.json` and a public `project.config.json`, with domain checks enabled and `miniprogramRoot: ./`.
- Runtime assets placed under `wechat/assets/`: PNG/JPEG/WebP/GIF, KTX2/Basis, GLB/glTF/BIN, MP3/OGG/WAV, JSON, TTF/WOFF/WOFF2 and atlas files.

Dependencies imported from JavaScript are bundled, while static runtime assets keep their relative `assets/` paths. Referenced asset existence and rendering must be tested in the target runtime. Private project config, `.env`, README, reports, source trees, dependencies, service code, maps and credentials are not copied. Symbolic links/junctions in inputs or output paths are rejected. The conservative initial package budget is 4 MiB of uncompressed files, an internal engineering budget rather than a statement of current WeChat platform limits. Large scenes need an explicit subpackage/asset delivery design; this first pipeline rejects subpackages, plugins and worker declarations instead of silently omitting them.

`reports/wechat/build-report.json` records the source HEAD, build timestamp, included module paths, output bytes and SHA-256 hashes. The report and generated build are ignored by Git. A dirty working tree can be built; the HEAD identifies the baseline, not a claim that the output matches a clean commit. Credential detection covers high-confidence key patterns only and is not a complete security audit.

Windows build and test temporary files stay in the physical D: project. Tests use `reports/wechat-build-tests/`. Do not import `dist/wechat` as a regular mini program: the generated config declares `compileType: game` and uses the registered Anheli AppID. Successful bundling does not establish real login, cloud saves, real-device compatibility, or a complete Muse game scene.

The Mini Game host uses the native global animation functions without requiring `globalThis`. The scoped Three adapter receives a dedicated JavaScript canvas wrapper; it must not redefine native canvas properties or mutate native prototypes. Image creation delegates to `wx.createImage`. Renderer dimensions are applied with one `setDrawingBufferSize` call to avoid multiplying the physical backing size twice. The two local vendor event-target changes are recorded in `wechat/vendor/threejs-miniprogram.PATCHES.md`.

`tests/wechat-native-entry.test.mjs` executes the actual shared game entry and r108 renderer with constrained native-style canvases and a recording WebGL test double. It checks startup, first-frame drawing, texture submission and disposal, including missing `globalThis` and immutable native properties. This covers JavaScript compatibility, not a real GPU or an iPhone. Verify the full scene in Developer Tools, then rescan a newly generated preview on the affected phone.

Runtime failures show a persistent native dialog and store only a bounded `anheli-runtime-error` diagnostic: build label, fixed error code/stage, allowlisted exception name, and optional bundle line/column. Raw messages, request URLs, stacks and save contents are excluded. The diagnostic does not clear or replace the player's local save.
