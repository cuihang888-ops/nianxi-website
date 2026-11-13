# Muse 协作交接

基线日期：2026-11-13。用户希望安和里成为可从庭院走到外面的原始山谷世界，地面唯美治愈，动物有吸引力，让人愿意停留陪伴；有个人农场与简单深山狩猎。整体年禧商城及原自动罗盘保留。

产品初衷与体验取舍见 `PRODUCT_INTENT.md`。已发送的 ZIP 基线为 `044c034`；后续协作先比对文件变化，保留双方的新工作。

Muse 首次回传已经本地合并，范围和修正见 `MUSE_MERGE_20261113.md`。后续协作需使用合并后的源码；原回传包不能再整体覆盖当前项目。

最新方向：以德宏五市县为灵感的原野世界，以瑞丽总佛寺为公共中心；玩家选择聚落安家，只有步行和骑马，经济统一称安币。具体框架、模块接口、分阶段交付与独立微信小游戏目标见 `DEHONG_WORLD_FRAMEWORK.md`。当前 `codex/dehong-world-framework` 为本轮框架分支；画面开发从该分支最终已验证提交建立 `muse/dehong-visuals`，不要以旧 ZIP 或旧 `main` 整体覆盖。

当前已实现五区域十聚落的个人选址、免费迁居、旧存档迁移、马匹资格、路线规划。尚未实现五区可行走地形、骑乘模型和动作、完整微信游戏客户端或真实充值。请先做一段可玩的瑞丽总佛寺外围与江畔家园场景，再扩展其他地区。

## 微信接入实际状态

后台基础信息已完成，小游戏名称“年禧安和里”，AppID `wx24c1d8b3a00f962e`。微信认证已提交、等待审核，尚未通过；官方最终页提示一般耗时 1 至 3 个工作日。后台类目仍为空，备案未完成，实际注册主体仍因类目未完成而未能核实。微信开发者工具 `2.02.2609250` 已安装到 `D:\CodexStorage\app-runtime\wechat-devtools`，已成功导入工程并识别小游戏模式。

`wechat/` 已提供小游戏工程配置、Canvas 平台诊断入口和微信适配器。首次模拟器启动因官方 `3.18.0` 基础库缓存缺失出现 `WAGame.js` 500 和黑屏；同版本基础库已从官方地址重取，经工具原公钥验签后恢复到 D 盘缓存。重新打开工程后，模拟器已显示非空诊断画布和正确 AppID；点击登录检查后明确提示后端未配置，控制台无错误。顶部内容已避让微信菜单按钮；本机验证截图为 `reports/wechat/wechat-diagnostic-20261113.png`。这只验证平台诊断入口，尚未接通真实登录、游戏迁移或真机运行。

`service/wechat-auth.mjs` 已实现独立登录交换、会话检查和注销，但尚未部署，后端 URL、AppSecret 与 HTTPS 域名未配置，真实登录及云存档未接通。诊断页会如实提示未接通，不生成假 playerId；真实 HTTP 契约测试使用 mock 微信接口响应，不等于微信账号或云存档已可用。平台接入说明与登录交换契约见 `../wechat/README.md` 和 `WECHAT_BACKEND_SETUP.md`。

最新留存回传包已静态审查，尚未合并或运行包内脚本；旧基线、满亲近任务卡住和经济配置等问题见 [Muse 留存包接入反馈](MUSE_RETENTION_REVIEW_20261113.md)。请从最新协作基线修订增量，不直接覆盖回传包内的整文件。

## 已实现

2026-11-13 本轮新增交接：先做微信小游戏免费体验版，现数值不变，不充值、不接支付。阅读 `WECHAT_REGISTRATION_CHECKLIST.md`、`WECHAT_MINIGAME_MIGRATION_PLAN.md`、`WECHAT_COLLABORATION_ROLES.md`、`ECONOMY_CONFIGURATION.md`、`FREE_ECONOMY_TELEMETRY.md` 和 `MUSE_ECONOMY_REVIEW_20261113.md`。`src/economy-config.js` 为统一数值表；本机遥测不是线上全服统计。Muse 的三轮模拟尚缺脚本，80安币收购日限与45天退休未采用。

Three.js 庭院、六个真实多人房间、仪式活动、邀茶与心灯；山门外四块土地、羊兔鸡、种植喂养、互动爱心、产物出售、每日补给和本机存档；东侧深山鹿/野鸡、踪迹选择和无血腥射箭小游戏。原万年历 15 文件未改。

本地后续完善：免费动物昵称（`renameAnimal`），护理面板与场景共用 `src/CompanionName.jsx`；动物错峰走动、吃草、抬头和转向照料者。`farm.animate` 第四个参数为玩家位置；原三个参数仍可用。`src/farm-scene.js` 已有后续修改，Muse 回传时需逐项合并。

本轮全套单测 109/109 通过，随后补充的实际构建包无 DOM 启动测试 1/1 通过；微信上游响应仍为 mock。网页 UI 全套 16/16、网页构建、原日历源码与构建产物各 15/15 校验通过。源码工程和独立 `dist/wechat` 均在微信模拟器启动，触控、本机保存、重载恢复、终止后重启恢复及未配置登录提示已实际验证。前后台暂停逻辑有自动测试覆盖，明确的模拟器 hide/show 和真机切后台尚未验收；真实微信登录、游戏迁移、云存档及真机性能仍未完成。完整记录见 `WECHAT_PLATFORM_VERIFICATION_20261113.md`。

## 确定分工

用户最新分工：Codex 先把微信平台与框架接入做好；Muse 负责游戏画面、玩法、细节和游戏内部运行完整性。Codex 本轮不扩写游戏场景或玩法。

2026-11-13 平台增量已经提供固定接入口：Muse 在 `wechat/game-entry.js` 导出 `createGame(context)`，由 `wechat/game.js` 创建宿主。使用宿主的 `context.canvas`、`context.input`、`context.viewport` 和 `context.platform`，不要另开主画布或重复启动帧循环；内部游戏返回 `update/render/resize/pause/resume/dispose`。地图重做可在 Muse 自己的目录进行，保留 Codex 的平台层与入口引导。详细约定见 `WECHAT_RUNTIME_CONTRACT.md`。

第八轮累计地图 ZIP 已只读评审，新增广场、功德碑和花圃的本机共建，但仍是旧基线网页入口，尚未合并或运行；最新事项见 [第八轮微信接入简评](MUSE_ROUND8_WECHAT_REVIEW_20261113.md)，前轮保留在 [第七轮评审](MUSE_ROUND7_WECHAT_REVIEW_20261113.md)、[第六轮评审](MUSE_ROUND6_WECHAT_REVIEW_20261113.md)、[第五轮评审](MUSE_ROUND5_WECHAT_REVIEW_20261113.md) 和 [第四轮评审](MUSE_ROUND4_WECHAT_REVIEW_20261113.md)。微信平台基线已远端核验；Muse 应从 `codex/dehong-world-framework` 的 `86500727aea4858cd5e4accf8046843b6eca0580` 开始制作增量，不整体覆盖累计包。后续评审文档与平台同分支维护。

本机进度使用 `platform/save-repository.js`，由 Muse 提供纯 JSON 游戏状态及校验函数；保存失败、版本冲突和损坏旧档均须反馈。这里尚无云同步，不能把 `cloudSynced:false` 显示成云端保存成功，见 `WECHAT_SAVE_CONTRACT.md`。打包命令为 `npm run build:wechat`，输出 `dist/wechat`，资产放到 `wechat/assets/`；初始单包超出内部预算时需先商定分包方案，见 `WECHAT_BUILD.md`。

Muse 可继续完善自然环境与动物吸引力，并把游戏接入 `wechat/` 平台层。首轮曲折小路、草地斑块、花丛聚落、山谷层次和短暂靠近已合入；自然活动与照料动作保留本地实现。修改 `src/scene.js` 或平台入口前先对齐接口，不整体覆盖已有工作。

Codex 负责外部后台、工程配置、平台适配、登录与存档服务契约、框架边界和集成测试。Muse 负责环境、建筑、动物和马匹动作、材质、画布 UI、游戏玩法及完整客户端流程。双方复用现有农场与世界规则，规则变更先写清影响；不要在画面代码中直接增减余额或修改家园归属。各自分支的 PR 写清基线与实际触及文件，交付前先同步最新协作基线。

## 模块

| 文件 | 职责 |
| --- | --- |
| `src/Courtyard.jsx` | 场景与多人、弹窗、农场存档、直接动物护理栏 |
| `src/scene.js` | 庭院世界、玩家移动、寻路、镜头、联机人物与点击分发 |
| `src/farm-scene.js` | 自然环境、土地、实例化动物与作物、野生动物、护理动画 |
| `src/farm-state.js` | 纯农场状态、购买/产出/存档规范化/狩猎规则 |
| `src/world-state.js` | 五区十聚落目录、总佛寺锚点、马匹参数和路线计算 |
| `src/WorldPanel.jsx`、`src/world.css` | 区域示意、安家、路线规划和安币入口 |
| `src/FarmPanel.jsx`、`src/farm.css` | 农场管理与界面 |
| `src/HuntPanel.jsx`、`src/hunt.css` | 踪迹与时机小游戏 |
| `service/server.mjs` | 临时多人状态、身份接续、房间、移动、心灯、同意式邀茶 |
| `service/wechat-auth.mjs` | 独立微信登录交换、会话检查、注销；已实现但未部署，密钥与 HTTPS 域名未配置 |
| `wechat/project.config.json`、`wechat/game.json` | 已配置真实 AppID 的小游戏工程入口配置 |
| `wechat/game.js`、`wechat/game-entry.js` | 启动平台宿主、导出游戏工厂；当前绑定诊断页，Muse 替换工厂接入游戏 |
| `wechat/platform/game-host.js`、`wechat/platform/save-repository.js` | 单画布、触控、生命周期及带版本的本机存档 |
| `wechat/platform/wechat-adapter.js` | 微信登录交换、字符串存储、生命周期接口；后端尚未配置 |
| `tests/wechat-adapter.test.mjs` | 平台接口测试及真实 HTTP 登录契约测试，微信上游仍为 mock；已并入 `npm test` |
| `public/calendar/` | 保留的原万年历，禁止改动 |
| `integration/patch/` | 商城安和里接入补丁，非完整商城 |

## 场景约定

`createCourtyard(container, callbacks)` 保留原接口，新增 `setFarmState(state)`、`goToFarm(plotId?)`、`goToHunt()`、`setFarmMode(enabled)`、`getFarmWorld()`。`goToFarm`/`goToHunt` 步行寻路并返回是否成功，不传送。选择回调是 `onSelectPlot(id)`、`onSelectAnimal(id)`、`onSelectWildlife(species)`；到达事件为 `farm`、`farm:<plotId>`、`hunt`。

可行走范围 x [-48,48]、z [-30,66]；服务范围略宽为 x [-50,50]、z [-32,68]。庭院原坐标保留，猎场 (38,-18)。地块定义从 `farm-state.js` 读取：meadow-west (-19,39)、meadow-east (19,39)、river-west (-19,57)、river-east (19,57)。

静态环境按材质合批；动物、花草、作物使用 InstancedMesh。动态对象不得进入静态合批。动物点击依赖 instanceId 到 animalId 映射；每秒 setFarmState 不应重建几何。护理字段增加时出现短时轻跳和爱心。外部视角 zoom 1.45，回庭院恢复 1；尊重减少动态效果设置。

## 规则与限制

农场动作由 `applyFarmAction(state,action,now)` 返回 `{state,ok,message,messageEn}`。支持 buyPlot、buyAnimal、renameAnimal、plant、water、harvest、feed、pet、collect、sell、dailyGift、hunt、settleHome、buyHorse、setTransport。世界状态是 `farm.world={home:{regionId,settlementId}|null,horseOwned,transport}`；先由规则确认成功，再给予界面反馈。不要在 UI 直接增减余额或绕过冷却。

个人农场仅存在本机浏览器；同庭访客是真实联机，但看不到彼此动物与土地状态。狩猎为时机小游戏，尚不是开放世界战斗系统。当前没有真实购买、公开土地交易、云存档或商城会员绑定。

## 交付要求

保留可玩的主场景，不做宣传首页。桌面与手机都检查镜头、文字、按钮、真实点击和动画；提交 PR 附改动范围、测试结果和截图。不要部署生产，不修改原万年历，不上传任何登录资料。
