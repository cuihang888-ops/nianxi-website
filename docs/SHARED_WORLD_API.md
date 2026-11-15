# Shared world M1 API

2026-11-15：独立服务、SQLite 存储和微信请求客户端已在本机测试。尚未部署，未完成真实微信账号联调，也未接入游戏 UI。当前只实现角色注册、一次性启动金、地块购买与回执；不代表完整云存档或多人世界。

## 启动与存储

`package.json` 要求 Node >=22.13.0，存储使用内置 `node:sqlite`。本机实际测试版本为 24.17.0；尚未在 Node 22.x CI 实测。

`npm run world:serve` 默认关闭业务路由，只可查看健康信息。配置如下，微信认证密钥按 [WECHAT_BACKEND_SETUP.md](WECHAT_BACKEND_SETUP.md) 仅注入认证服务环境：

| 环境变量 | 默认值与含义 |
| --- | --- |
| `ANHELI_WORLD_ENABLED` | 仅 `1` 开启业务路由 |
| `ANHELI_WORLD_AUTH_URL` | 必填；真实认证检查地址，路径必须为 `/v1/auth/session`，远程需 HTTPS；本机允许 `http://127.0.0.1:4108/v1/auth/session` |
| `ANHELI_WORLD_DATABASE` | 默认项目内 `reports/shared-world/dev-world.sqlite` |
| `ANHELI_WORLD_HOST` | `127.0.0.1` |
| `ANHELI_WORLD_PORT` | `4109` |

本地示例，需另行启动已配置的认证服务：

```powershell
Set-Location -LiteralPath 'D:\CodexStorage\projects\nianxi-website'
$env:ANHELI_WORLD_ENABLED = '1'
$env:ANHELI_WORLD_AUTH_URL = 'http://127.0.0.1:4108/v1/auth/session'
$env:ANHELI_WORLD_DATABASE = 'D:\CodexStorage\projects\nianxi-website\reports\shared-world\dev-world.sqlite'
npm run world:serve
```

Windows CLI 要求数据库路径及其物理父目录都在 D:。存储层拒绝数据库及现有 `-wal`、`-shm`、`-journal` 的符号链接、非普通文件、硬链接和路径别名。已有数据库必须同时带 `ANHL` application ID 与受支持的 schema 版本；仅允许初始化无标识、版本 0 且 schema 为空的新库，归属检查在修改 WAL 前进行。此服务使用独立数据库，不复用商城库。生产 HTTPS API 地址、代理及微信 request 合法域名尚未配置；客户端 `backendBaseUrl` 仍为空。

备份时先停世界服务并确认进程完全退出，完整复制数据库目录内的数据库及存在的 SQLite 附属文件到 D: 备份目录，再恢复服务。恢复时同样先停服，保留现有数据副本，完整恢复同一份备份，使用兼容版本启动并核验角色、余额、地权和历史回执。认证服务的 AppID 与稳定身份 HMAC 密钥需单独受控保存；改密钥会改变玩家身份。上述是操作流程，尚未完成生产备份恢复验收。

## HTTP 契约

除健康接口外，每次请求必须带 `Authorization: Bearer <sessionToken>`，身份只来自真实 `GET /v1/auth/session` 检查，不接收客户端 `playerId`。POST 要求 `Content-Type: application/json`，最多 4096 字节、读体限时 3 秒；GET 不接受请求体。POST 读完后再次检查会话，注销或过期会阻止待执行变更。

| 方法与路径 | 请求 | HTTP 200 的响应 |
| --- | --- | --- |
| `GET /v2/world/health` | 无认证、无 query | `{ok:true,service:"anheli-shared-world",protocolVersion:2,enabled,authConfigured,storageConfigured}`；标志只说明配置，不证明上游可用 |
| `GET /v2/world/bootstrap` | 无 query | `{ok:true,worldId,configVersion,registered,player,wallet,home,catalog,economy,capabilities}` |
| `POST /v2/world/register` | `{"commandId":"register_example_01","avatarId":"farmer"}` | `{ok:true,receipt}` |
| `GET /v2/world/plots?worldId=dehong&villageId=...` | 两个 query 各恰好一次，无其他参数 | `{ok:true,worldId,villageId,layout,plots}` |
| `POST /v2/world/commands` | 见下方买地请求 | `{ok:true,receipt}` |
| `GET /v2/world/receipts/:commandId` | 自己的命令 ID，无 query | `{ok:true,receipt}` |

注册请求只接受这两个字段，`avatarId` 为 `wanderer`、`farmer`、`herder` 之一；昵称暂由服务器分配，不接收自由昵称。未注册时 bootstrap 的 `player/wallet/home` 均为 `null`；注册后 `player` 为 `{playerId,nickname,avatarId,revision}`，`wallet` 为 `{balanceMinor,revision}`，未买地时 `home:null`。

当前 `worldId:"dehong"`、`configVersion:"shared-world-free-v1"`。`catalog.regions` 列出五区 ID，但当前地块只在瑞丽；客户端必须使用 `catalog.villages` 返回的真实村落 ID。`capabilities` 为：

```json
{"registration":true,"plots":true,"plotPurchase":true,"homes":true,"farming":false,"multiplayer":false,"redKnots":false}
```

钱均用安全整数最小单位：`coinMinorPerCoin:100`，100 最小单位 = 1 安币；启动金 `initialGrantMinor:100000`，标准地价 `standardPlotPriceMinor:40000`。首次服务端角色注册在同一事务内创建角色、钱包、唯一启动金账本及回执，发放一次 1000 安币。重登、换设备和重新安装不重发；本机旧余额不自动上传或叠加，欢迎活动也不默认再叠加赠币。当前不提供充值、每日补给或其他服务端发币入口。

买地请求必须完整且不含额外字段：

```json
{
  "commandId": "purchase_example_01",
  "kind": "plot.purchase",
  "targetId": "ruili-river-0001-plot-01",
  "expectedRevision": 1,
  "configVersion": "shared-world-free-v1",
  "payload": {}
}
```

`commandId` 只含 ASCII 字母、数字、`_`、`-`，长度 8–96；其他 ID 长度 1–128。地块 ID、版本和 revision 使用实际响应值，不能固定写样例。每位玩家目前限一块地；买地事务原子检查归属、revision 和余额，再扣款、建家、写账本及回执。并发争地只有一人成功，拒绝不扣款。

回执形状为 `{commandId,kind,status,configVersion,serverTime,result?,code?}`。`serverTime` 是该回执产生时的服务端 epoch 毫秒；bootstrap/地块列表当前没有统一时间戳、订阅序号或增量。`status` 只有 `committed` 和 `rejected`：注册成功的 `result` 含 `player,wallet,home:null`；买地成功含 `wallet,home,plot`。**HTTP 200、外层 `ok:true` 都不代表买地或注册成功，必须检查 `receipt.status`。**

相同玩家、相同 `commandId` 和相同内容重试返回原回执，含原 `serverTime`，不重复扣发；同 ID 改内容返回 HTTP 409 `COMMAND_ID_CONFLICT`。已注册玩家用新 ID 再注册得到 HTTP 200、`status:"rejected"`、`code:"PLAYER_ALREADY_REGISTERED"`，附现有角色/钱包/家园，不改外观、不再赠币。其他业务拒绝包括 `PLAYER_NOT_REGISTERED`、`CONFIG_VERSION_MISMATCH`、`PLOT_NOT_FOUND`、`HOME_LIMIT_REACHED`、`PLOT_UNAVAILABLE`、`PLOT_REVISION_CONFLICT`、`INSUFFICIENT_FUNDS`。

历史回执保留操作当时的快照，不是最新存档；例如买地后查询早先注册回执仍会读到当时的 1000 安币。调用方须按实体 revision 合并，不能用旧 revision 覆盖已确认的新状态；完成恢复或重试后重新读取 bootstrap/地块列表。`serverTime` 也不是全世界增量序号。

请求失败使用 `{"error":{"code":"STABLE_CODE"}}`：400 输入错误；401 `SESSION_INVALID` 需重新登录；404 资源或 `RECEIPT_NOT_FOUND`；405 方法错误；408 读体超时；409 幂等键冲突；413/415 体积或格式错误；429 `RATE_LIMITED` 应等待；503 配置、认证、存储或容量不可用。未预期错误仅返回 500 `WORLD_INTERNAL_ERROR`。响应丢失或查不到回执不能据此另起命令扣币，应保留原 ID 与原内容查询/重试。

## 地块与家园投影

初始村落为 `ruili-river-0001`，`layout:"provisional"`，仅两块样板地；当前中心 x 为 -18/+18，边长 24，留出中间道路。该村填满时服务端自动创建下一村，ID 仍从 catalog 获取。各村当前复用同一局部样板，不能当作全局位置直接叠放。面积、道路出口及锚点待 Muse 返回村落布局后冻结，再由 Codex 做服务端布局迁移；这两块地不是最终几何，也不代表连续地图、交通或锚点实现。

每块地返回 `plotId,worldId,regionId,villageId,revision,layout,origin,bounds,priceMinor,owner,home`。无主时 `owner/home:null`；有主时公开主人 `{playerId,nickname}` 与家园投影，不含钱包或凭证。家园为 `{homeId,owner,address,revision,origin,bounds,house:null,beds:[],animals:[]}`，其中 `address` 包含四级住址。当前空布局不能显示为已建房、已种植或已饲养。

坐标契约：右手系、Y 向上、地面 X/Z；地块 `origin` 与 `bounds` 均使用村落局部坐标，未来房屋等布局使用相对地块原点的局部坐标，`yaw` 为绕 +Y 的弧度。Muse 还须返回每村的全局 `origin/transform` 与地图坐标转换，显示时逐层转换；服务端当前没有发布这份全局变换。寺院/道路/红结锚点只保留交接契约；暂无对应 API、持久红结、世界票据或 WebSocket 订阅。

## 微信客户端

`wechat/platform/world-client.js` 提供 `createWorldClient` 及 `getBootstrap/registerPlayer/listPlots/purchasePlot/getReceipt/dispose`。它使用 `wx.request`、现有适配器的有效非游客会话和 HTTPS 基址；令牌只放认证头。以下示例假设已有 `platform`、完成真实登录、从服务端读取 `selectedPlot/configVersion`，且操作 ID 已为本次意图生成并保留：

```js
import { createWorldClient } from "./world-client.js";

const world = createWorldClient(wx, runtimeConfig, {
  getSession: () => platform.getSession(),
});
const result = await world.purchasePlot({
  commandId: pendingPurchase.commandId,
  plotId: selectedPlot.plotId,
  expectedRevision: selectedPlot.revision,
  configVersion,
});
if (!result.ok) {
  // 显示 result.error；需要重试时沿用原 pendingPurchase，不另造命令。
} else if (result.data.receipt.status === "committed") {
  // 用回执中的权威 wallet/home/plot 更新展示。
} else {
  // 显示 receipt.code 的拒绝原因，不显示购买成功。
}
```

客户端成功封装为 `{ok:true,data,source:"server",cloudSynced:true}`，业务拒绝也可能有此封装；`cloudSynced` 仅表示**这一份响应**通过验证，不能标记整个本机存档已同步。客户端错误为 `{ok:false,error:{code,message,retryable}}`，不会把失败改成本机成功。它尚未接入游戏 UI，不迁移本机存档，不接管种养经济；请求中切换会话会丢弃旧响应，`dispose()` 取消未完成请求。

默认世界限流为每位已认证玩家 120 次/分钟（同账号多 token 共享），失败认证按 socket IP 计入有界桶；详见 [认证与限流说明](WECHAT_BACKEND_SETUP.md#deployment-boundary-and-limits)。POST 两次真实检查会消耗认证服务每会话 120 次/分钟的额度，因此同会话纯 POST 约 60 次/分钟先受限。尚未进行生产容量验收。
