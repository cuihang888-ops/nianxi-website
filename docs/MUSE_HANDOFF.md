# Muse 协作交接

基线日期：2026-11-13。用户希望安和里成为可从庭院走到外面的原始山谷世界，地面唯美治愈，动物有吸引力，让人愿意停留陪伴；有个人农场与简单深山狩猎。整体年禧商城及原自动罗盘保留。

产品初衷与体验取舍见 `PRODUCT_INTENT.md`。已发送的 ZIP 基线为 `044c034`；后续协作先比对文件变化，保留双方的新工作。

Muse 首次回传已经本地合并，范围和修正见 `MUSE_MERGE_20261113.md`。后续协作需使用合并后的源码；原回传包不能再整体覆盖当前项目。

最新方向：以德宏五市县为灵感的原野世界，以瑞丽总佛寺为公共中心；玩家选择聚落安家，只有步行和骑马，经济统一称安币。具体框架、模块接口、分阶段交付与独立微信小游戏目标见 `DEHONG_WORLD_FRAMEWORK.md`。当前 `codex/dehong-world-framework` 为本轮框架分支；画面开发从该分支最终已验证提交建立 `muse/dehong-visuals`，不要以旧 ZIP 或旧 `main` 整体覆盖。

当前已实现五区域十聚落的个人选址、免费迁居、旧存档迁移、马匹资格、路线规划。尚未实现五区可行走地形、骑乘模型和动作、微信客户端或真实充值。请先做一段可玩的瑞丽总佛寺外围与江畔家园场景，再扩展其他地区。

## 已实现

Three.js 庭院、六个真实多人房间、仪式活动、邀茶与心灯；山门外四块土地、羊兔鸡、种植喂养、互动爱心、产物出售、每日补给和本机存档；东侧深山鹿/野鸡、踪迹选择和无血腥射箭小游戏。原万年历 15 文件未改。

本地后续完善：免费动物昵称（`renameAnimal`），护理面板与场景共用 `src/CompanionName.jsx`；动物错峰走动、吃草、抬头和转向照料者。`farm.animate` 第四个参数为玩家位置；原三个参数仍可用。`src/farm-scene.js` 已有后续修改，Muse 回传时需逐项合并。

开发版已通过 26 项农场规则、8 项世界规则、4 项场景回归、13 项联机测试、12 项浏览器测试。包括昵称、完整养成循环、晚浇水、双窗口、写档失败、刷新恢复、走出/返回庭院、狩猎冷却、手机视口、原罗盘与嵌套部署，以及围栏边界、短暂问候、减少动态、河岸画面和德宏安家流程。仍需微信运行验证、真机低端性能、上线环境回归与实际用户留存验证。

## 确定分工

Muse 可继续完善自然环境与动物吸引力。首轮曲折小路、草地斑块、花丛聚落、山谷层次和短暂靠近已合入；自然活动与照料动作保留本地实现。优先集中修改 `src/farm-scene.js`；修改 `src/scene.js` 前与另一协作者对齐接口。

Codex 负责世界目录、道路、农场规则、存档、服务、经济和集成测试；Muse 负责环境、建筑、动物和马匹动作、材质与画面。不要在画面代码中直接增减余额或修改家园归属。各自分支的 PR 写清基线与实际触及文件，交付前先同步最新协作基线。

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
