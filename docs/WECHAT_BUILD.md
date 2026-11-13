# WeChat game build

The source entry is `wechat/game.js`. The generated, importable project is `dist/wechat`. Muse owns the game renderer and gameplay; this pipeline only prepares a WeChat runtime package. It does not upload, deploy or publish anything.

```sh
node scripts/build-wechat.mjs --check
node scripts/build-wechat.mjs
node --test tests/wechat-build.test.mjs
```

`--check` bundles and validates in memory without changing output. A normal build writes a complete staging directory first, then replaces only `dist/wechat`. Existing web files elsewhere in `dist` remain unchanged. Failed compilation or budget checks leave the previous game output intact. The web build may clear all of `dist`, so run the WeChat build after the web build when both artifacts are needed.

The script uses esbuild to bundle JavaScript/TypeScript into one ES2020 IIFE `game.js`; `wx` stays the actual platform global. Modules must resolve within `wechat/`, `src/`, or `node_modules/`. Node builtins, service modules, React/DOM framework imports, JSX, HTML and CSS are rejected. This catches known incompatible dependencies, not every possible use of a browser global: runtime testing remains required. Pure shared game rules may be imported normally. Do not provide a fake `window`/`document` just to make React compile.

The output allowlist is:

- Bundled `game.js`.
- Validated `game.json` and a public `project.config.json`, with domain checks enabled and `miniprogramRoot: ./`.
- Runtime assets placed under `wechat/assets/`: PNG/JPEG/WebP/GIF, KTX2/Basis, GLB/glTF/BIN, MP3/OGG/WAV, JSON, TTF/WOFF/WOFF2 and atlas files.

Dependencies imported from JavaScript are bundled, while static runtime assets keep their relative `assets/` paths. Referenced asset existence and rendering must be tested in the target runtime. Private project config, `.env`, README, reports, source trees, dependencies, service code, maps and credentials are not copied. Symbolic links/junctions in inputs or output paths are rejected. The conservative initial package budget is 4 MiB of uncompressed files, an internal engineering budget rather than a statement of current WeChat platform limits. Large scenes need an explicit subpackage/asset delivery design; this first pipeline rejects subpackages, plugins and worker declarations instead of silently omitting them.

`reports/wechat/build-report.json` records the source HEAD, build timestamp, included module paths, output bytes and SHA-256 hashes. The report and generated build are ignored by Git. A dirty working tree can be built; the HEAD identifies the baseline, not a claim that the output matches a clean commit. Credential detection covers high-confidence key patterns only and is not a complete security audit.

Windows build and test temporary files stay in the physical D: project. Tests use `reports/wechat-build-tests/`. Do not import `dist/wechat` as a regular mini program: the generated config declares `compileType: game` and uses the registered Anheli AppID. Successful bundling does not establish real login, cloud saves, real-device compatibility, or a complete Muse game scene.
