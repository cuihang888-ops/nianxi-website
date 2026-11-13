# 安和里微信接入骨架

这是微信小游戏工程入口，不是已移植的游戏。当前只有 Canvas 接入诊断页，以及登录、存储和生命周期适配器。庭院、山谷、猎场、画布 UI 及资源由 Muse 按接口接入，原网页继续回归测试。

在微信开发者工具中导入本目录 `D:\CodexStorage\projects\nianxi-website\wechat`。`project.config.json` 使用小游戏类型 `compileType: game`、`miniprogramRoot: ./`，根入口为 `game.js` 和 `game.json`。AppID 已填 `wx24c1d8b3a00f962e`；它是公开应用标识，不是密钥。不要复制官方示例的 AppID、云环境、权限或插件配置。

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
