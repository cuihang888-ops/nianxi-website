# Muse 协作交接

基线日期：2026-11-13。用户希望安和里成为可从庭院走到外面的原始山谷世界，地面唯美治愈，动物有吸引力，让人愿意停留陪伴；有个人农场与简单深山狩猎。整体年禧商城及原自动罗盘保留。

产品初衷与体验取舍见 `PRODUCT_INTENT.md`。已发送的 ZIP 基线为 `044c034`；后续协作先比对文件变化，保留双方的新工作。

Muse 首次回传已经本地合并，范围和修正见 `MUSE_MERGE_20261113.md`。后续协作需使用合并后的源码；原回传包不能再整体覆盖当前项目。

## 已实现

Three.js 庭院、六个真实多人房间、仪式活动、邀茶与心灯；山门外四块土地、羊兔鸡、种植喂养、互动爱心、产物出售、每日补给和本机存档；东侧深山鹿/野鸡、踪迹选择和无血腥射箭小游戏。原万年历 15 文件未改。

本地后续完善：免费动物昵称（`renameAnimal`），护理面板与场景共用 `src/CompanionName.jsx`；动物错峰走动、吃草、抬头和转向照料者。`farm.animate` 第四个参数为玩家位置；原三个参数仍可用。`src/farm-scene.js` 已有后续修改，Muse 回传时需逐项合并。

开发版已通过 26 项农场规则、4 项场景回归、13 项联机测试、10 项浏览器测试。包括昵称、完整养成循环、晚浇水、双窗口、写档失败、刷新恢复、走出/返回庭院、狩猎冷却、手机视口、原罗盘与嵌套部署，以及围栏边界、短暂问候、减少动态和河岸画面。仍需真机低端性能、上线环境回归与实际用户留存验证。

## 建议分工

Muse 可继续完善自然环境与动物吸引力。首轮曲折小路、草地斑块、花丛聚落、山谷层次和短暂靠近已合入；自然活动与照料动作保留本地实现。优先集中修改 `src/farm-scene.js`；修改 `src/scene.js` 前与另一协作者对齐接口。

Codex 保持农场规则、存档、服务与集成测试的连贯性。此分工是建议，请在各自分支的 PR 中写清实际触及文件。任何并行开发都以最新 `main` 为基线。

## 模块

| 文件 | 职责 |
| --- | --- |
| `src/Courtyard.jsx` | 场景与多人、弹窗、农场存档、直接动物护理栏 |
| `src/scene.js` | 庭院世界、玩家移动、寻路、镜头、联机人物与点击分发 |
| `src/farm-scene.js` | 自然环境、土地、实例化动物与作物、野生动物、护理动画 |
| `src/farm-state.js` | 纯农场状态、购买/产出/存档规范化/狩猎规则 |
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

农场动作由 `applyFarmAction(state,action,now)` 返回 `{state,ok,message,messageEn}`。支持 buyPlot、buyAnimal、renameAnimal、plant、water、harvest、feed、pet、collect、sell、dailyGift、hunt。先由规则确认成功，再给予界面反馈。不要在 UI 直接增减余额或绕过冷却。

个人农场仅存在本机浏览器；同庭访客是真实联机，但看不到彼此动物与土地状态。狩猎为时机小游戏，尚不是开放世界战斗系统。当前没有真实购买、公开土地交易、云存档或商城会员绑定。

## 交付要求

保留可玩的主场景，不做宣传首页。桌面与手机都检查镜头、文字、按钮、真实点击和动画；提交 PR 附改动范围、测试结果和截图。不要部署生产，不修改原万年历，不上传任何登录资料。
