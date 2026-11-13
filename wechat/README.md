# 安和里微信游戏工程

截至 2026-11-14，Muse 第 26 轮的庭院、牧场和五坝游戏已接入现有微信宿主，包含画布 UI、步行骑马、家园经营、节日和图鉴。浏览器试玩与微信构建共用 `game-entry.js`。这是免费本机原型，尚未正式发布；实际微信游戏模拟器与手机验收仍待完成，不能把诊断页的历史结果当作游戏已验收。

`game.js` 启动宿主，`game-entry.js` 创建游戏；`platform/game-host.js` 管理画布、触控和前后台帧循环；`platform/preview-save.js` 通过 `save-repository.js` 提供版本校验、旧档迁移和失败回滚。存档键为 `anheli-minigame-v2:save`，原始 `anheli-minigame-v1` 迁移后保留，原网页农场存档不变。诊断页保留在独立测试中。

执行 `npm run build:wechat` 生成可导入的 `dist/wechat`；同时构建网页时先执行 `npm run build`，再构建小游戏。`npm run check:wechat` 只检查、不写构建目录。运行接口、存档接口和构建边界分别见 `../docs/WECHAT_RUNTIME_CONTRACT.md`、`../docs/WECHAT_SAVE_CONTRACT.md`、`../docs/WECHAT_BUILD.md`。本轮接入和验收范围见 `../docs/MUSE_ROUND26_INTEGRATION_20261114.md`。

在微信开发者工具中导入构建目录 `D:\CodexStorage\projects\nianxi-website\dist\wechat`。构建将 `.cjs` 场景依赖合并为单个 `game.js`，不要求开发者工具直接处理源码模块。`project.config.json` 使用小游戏类型 `compileType: game`、`miniprogramRoot: ./`，根入口为 `game.js` 和 `game.json`。AppID 已填 `wx24c1d8b3a00f962e`；它是公开应用标识，不是密钥。

本机浏览器试玩运行 `npm run trial:minigame`，地址 `http://127.0.0.1:5180/`。`?renderer=wechat` 使用随微信包提供的 r108 渲染适配器；这仍是浏览器验收，不能替代微信真机。顶部箭头切景、WASD/方向键或屏幕摇杆移动，点击画面按钮操作。试玩的免费回家和直接切景仍保留。浏览器存档和微信本机存档分开，尚无跨设备同步。

2026-11-13 已在官方稳定版 `2.02.2609250` 导入，并识别为小游戏模式。工程私有配置 `project.private.config.json` 已排除提交。工具安装、Chromium资料及应用缓存实际留在 D:；C 盘应用专属路径通过 junction 指向 D:，不能删除这个兼容入口。启动时使用：

```powershell
$env:TEMP = 'D:\CodexStorage\temp'
$env:TMP = 'D:\CodexStorage\temp'
Start-Process -FilePath 'D:\CodexStorage\app-runtime\wechat-devtools\微信开发者工具.exe' -ArgumentList '--user-data-dir=D:\CodexStorage\app-runtime\wechat-devtools-data\Chromium'
```

首次启动的 `3.18.0` 基础库缓存落盘失败导致 `WAGame.js` 500。已从工具配置指向的微信官方地址重取同版本基础库，经工具原公钥验签通过后恢复到 D 盘缓存；校验报告在本机 `reports/wechat/vendor-3.18.0-verification.json`。重新打开工程后，模拟器已显示非空诊断画布和正确 AppID；点击登录检查明确提示后端未配置，控制台无错误，仅有 HarmonyOS 信息提示。顶部内容已按微信菜单按钮边界留出空间，本机验证截图为 `reports/wechat/wechat-diagnostic-20261113.png`。这些结果仅验证平台诊断入口，不代表真实登录、游戏迁移或真机验收完成。

`runtime-config.js` 的 `backendBaseUrl` 目前为空，诊断页会明确显示登录未接通。它必须是本项目部署的 HTTPS API 基址，并在微信后台配置相应 request 合法域名后才能真机联调。域名校验保持开启。AppSecret 只进入服务端环境变量，不写入客户端、Git、日志或截图。

## 平台接口

- `startLogin()`：取得微信 code 后请求服务端交换，仅收到有效服务端会话才返回 `{ ok: true, session }`。失败返回稳定错误码，不生成 playerId，不发安币。
- `getSession()`：返回当前内存中的有效会话；过期后返回 null。当前不持久化凭证。
- `signOut()`：清除客户端会话并使在途登录结果失效；独立服务已实现注销端点，客户端调用仍需接入。
- `storage.getItem/setItem/removeItem`：字符串存储接口，可用于本地快照。写入失败抛出异常，调用方必须提示失败；本地快照不是云存档成功。
- `subscribeLifecycle({ onShow, onHide, onError })`：返回取消订阅函数。
- `dispose()`：清除会话和生命周期监听。

`getDiagnostics()` 只返回 AppID、版本与后端是否配置，不返回 code、token 或密钥。诊断页不实现游戏玩法，不验证 Three.js、云存档或多人服务。

## 服务端登录契约

独立服务 `service/wechat-auth.mjs` 已按当前客户端契约实现 `POST /v1/auth/wechat/session`，默认禁用，尚未配置密钥、部署或完成真实微信登录。它与现有多人服务分开运行；启动命令为 `node service/wechat-auth.mjs`，默认监听 `127.0.0.1:4108`。部署配置与限制见 `docs/WECHAT_BACKEND_SETUP.md`。

```json
{
  "code": "wx.login 返回的临时凭证",
  "clientVersion": "wechat-platform-0.1.0",
  "protocolVersion": 1
}
```

服务端使用自己配置的 AppID 和 AppSecret 调用微信 `code2Session`，校验平台响应，再按 `(appid, openid)` 映射稳定的 `playerId`。客户端不能指定 playerId、openid、余额或 session key。不要要求 unionid 一定存在。code 和 session key 不记普通日志，响应不返回 session key。

成功返回 HTTP 200：

```json
{
  "playerId": "服务器分配的稳定玩家ID",
  "ok": true,
  "sessionToken": "服务器生成的短期不透明凭证",
  "expiresAt": 1800000000000
}
```

`expiresAt` 是毫秒时间戳。失败返回非 200 状态和 `{ "error": { "code": "稳定错误码" } }`；客户端不把 `wx.login` 成功、HTTP 请求成功或含 code 当作已登录。已实现限流、请求体大小限制、超时、code 防重放、凭证撤销及账号隔离测试。服务端凭证目前只保存在进程内存，服务重启后需要重新登录，不是云存档或经济账本。

`GET /v1/auth/session` 使用 `Authorization: Bearer <sessionToken>` 查询会话；`POST /v1/auth/logout` 使用相同头和空 JSON 对象 `{}` 撤销当前会话。登录请求禁止添加客户端 AppID、OpenID、playerId 或密钥；版本字段可省略用于服务简测，提供时 protocolVersion 必须为 1，clientVersion 为最多 64 字符的简短版本字符串。

2026-11-13 已在浏览器核对迁移后的微信官方 `code2Session` 文档：`https://developers.weixin.qq.com/minigame/dev/api-backend/login/api_code2session.html`。它要求服务端 GET `https://api.weixin.qq.com/sns/jscode2session`，参数为 `appid`、`secret`、`js_code`、`grant_type=authorization_code`；返回 `openid`、`session_key`，`unionid` 可缺省，成功可能带 `errcode: 0`。文档核对不等于实际服务已启用或真实账号已登录。

## 验证

```sh
node --test tests/wechat-adapter.test.mjs
```

测试在仓库根目录运行，仅用 mock 微信 API 验证契约和失败路径。它不替代开发工具导入、真实 AppID、合法域名、服务端身份交换和真机验证。

格式依据（2026-11-13 读取）：微信官方 `wechat-miniprogram/minigame-demo` 的 `project.config.json`、`game.js`、`game.json`；API 依据官方 `wechat-miniprogram/minigame-api-typings/types/wx/lib.wx.api.d.ts`。官方示例含旧基础库版本，本工程不沿用其版本、示例凭证或无关权限；开发工具基础库选择需在真实联调时记录。

```text
https://github.com/wechat-miniprogram/minigame-demo/blob/master/project.config.json
https://github.com/wechat-miniprogram/minigame-demo/blob/master/miniprogram/game.js
https://github.com/wechat-miniprogram/minigame-demo/blob/master/miniprogram/game.json
https://github.com/wechat-miniprogram/minigame-api-typings/blob/master/types/wx/lib.wx.api.d.ts
```
