# 安和里 · 玩家完整闭环（注册 → 安家 → 营生 → 每日 → 祈福）

日期：2026-11-15。施工方：Muse（分支 `muse/shared-world-scenes`，在 M1 场景施工第一块 873c787 之上）。
依据：用户 2026-11-15 18:44 拍板——世界是空地状态、要开放给玩家进来，整个游戏闭环由 Muse 做；
注册送 1000 安币安家（用户 2026-11-15 17:07 定案）；取名规则沿用 2026-11-14 定稿口径。

## 0. 口径先说清（诚实边界）

- 本块的注册与账本是**本机闭环实现**：playerId 为本机登记编号（`local-` 前缀），存档仍是
  `anheli-minigame-v2` 本机存档（`cloudSynced:false` 不变）。界面文案只说“先记在这台设备上”，
  **不声称已联网、已云存档、已有多人在线**。真实账号、地权权威与多人同步仍是 Codex 的 C1–C3。
- 接口形状按将来可接管设计：注册发放只有 **一个集中点**（`Daily.registerPlayer`），
  客户端其余部分只读 `state.player` / `state.grant` 两个字段；接管清单见 §7。

## 1. 闭环各段与实现位置

| 段 | 玩家体验 | 实现 |
| --- | --- | --- |
| 注册入口 | 新存档首次进入即待登记：大厅面板首行「登记入住 · 给自己取个名字（领 1000 安币安家金）」；在瑞丽村样板地边、或任何可自选安家处，动作钮先指向登记 | `canvas-ui.cjs` 大厅行 + `home-controller.js` 认领门槛（`Daily.registrationPending` 时动作钮改为「先登记入住 · 领安家金再安家」，点开取名面板） |
| 取名 | 取名面板：24 个灵感名分批点选（换一批）、选中确认、可跳过（先逛逛）；本运行时没有宿主文本输入通道，自由输入待平台键盘通道接入（见 §8） | `canvas-ui.cjs` `openNamePanel` / `drawNamePanel`；规则在 `daily-state.cjs`：1–10 字、无空格/控制字符、保留名拦截（`RESERVED_NAMES`），玩家名与家名共用 |
| 安家金 | 确认名字即发放 **1000 安币**（新档从 0 起，发放后正好 1000） | `daily-state.cjs` `registerPlayer`（唯一发放点）+ `preview-economy.cjs` `registrationGrant: 1000` |
| 认领与建家 | 登记后到样板地 A/B 边认领（400，先 A 后 B 的口径由玩家就近选择，C–H 保持预留拒绝）；家名默认「玩家名的家」，大厅可改名；草棚（免费）→ 开田 → 首种萝卜/草 | 复用既有 `claimHome`（认领时自动盖默认家名）、`buildHomeHut`、`openHomeField`、`plantCarrots`；改名走 `renamePlayer` / `renameHome` + 大厅「我的名字 / 家的名字」行 |
| 营生回本 | 种 → 长 → 收进背篓 → 集市摆摊卖货 → 安币入账；买鸡（140）→ 产蛋 → 收进背篓 → 再卖 | 全部复用既有实现与 `preview-economy.cjs` 价格（萝卜卖 15、蛋 16、种子 18/畦），本块未新编任何价格 |
| 每日 | 大厅签到（累计口径、里程碑）、静心、每日小确幸（喂/收/静心三件 +40） | 既有实现不变，新档上已在端到端测试里验通 |
| 祈福 | 金塔礼拜庭祈福全流程（上一块已建）；走完一圈写完成标记 `rites.pagodaAt`（只记来过，不发币、不加产量）；去总佛寺仍沿既有古道/里程碑方向（寺院本体不在本坝场景内，与 M1 契约一致） | `home-controller.js` 祈福状态机在“绕满一圈”转场时 `commit(Daily.markPagodaPrayer)`；小地图数据沿用上一块的 `getMapFeatures()`（小地图 UI 仍待 Codex 合并 11-14 交付，本块不另造） |
| 引导线 | 动作钮“下一件该做的事”串成一条线（见 §5） | `home-controller.js` 既有 `homeAction` 链 + 本块新增两段 |

## 2. 存档形状（新增，全部为可选键，老存档不补）

```jsonc
// 新世界新存档（createPreviewSave 对“从未有过任何存档”的存储种入 Daily.newPlayerState()）
{
  "coins": 0,                 // 新档从 0 起；老档默认 1200 的 defaultState 不变
  "player": null,             // 待登记；登记后为 { "id": "local-…", "name": "…" }
  "grant": null,              // 登记后为 { "registration1000": { "at": <ms>, "amount": 1000 } }
  "rites": { "pagodaAt": 0 }, // 可选；金塔祈福完成时间（毫秒时间戳），无任何数值作用
  "home": { "name": "松岚的家" } // 可选；认领时按“玩家名+的家”盖上，可改名；label 仍是坝/基址地址
}
```

校验（`validateState` / `validateHome`）同步收紧：player 的 id 必须匹配 `local-` 编号格式、名字必须过
取名规则；grant 金额必须恰为 `registrationGrant`；**登记与发放标记有其一必有其二**，半套档案判伪造；
home.name 必须过取名规则。伪造金额（如 999）在端到端测试里被断言拒绝。

## 3. 账本与幂等

- 所有安币变动仍走既有 `transact`（校验 → 落盘 → 失败回滚）与各 `Daily.*` 函数；本块没有新增第二套账本。
- 注册发放幂等三重保险（`registerPlayer`）：① 存档无 `player` 键（老存档）→ `REGISTRATION_UNAVAILABLE`，
  不补发；② `player` 已存在 → `ALREADY_REGISTERED`；③ `grant.registration1000` 已存在 → `GRANT_ALREADY_ISSUED`。
  改名（`renamePlayer`）只改名字、不动编号、不动 grant、不动余额。重复触发、重进游戏、改名都不会第二次发放。
- playerId 生成在控制器层（`local-` + 时间 base36 + 随机段），形状与服务端签发可平滑替换（见 §7）。

## 4. 老存档口径

- 老存档（v1 迁移与此前 v2 存档）**没有** `player`/`grant` 键：不弹登记、不补发 1000、余额一律不动；
  认领门槛只拦“有 player 键且为 null”的新档，老住户的认领/自选流程与动作顺序与此前完全一致
  （既有 264 项测试含“home actions keep Muse order”顺序契约，全数通过即此口径的证据）。
- 老存档在瑞丽 site0 已安的家，认领视觉恢复路径不变（上一块口径）；其家没有 `name` 字段时，
  大厅显示回退到原 label，随时可通过「家的名字」行补名（补名不触发任何发放）。

## 5. 新手引导线（温和串联，可跳过、无倒计时、无惩罚）

动作钮顺序即引导线（新世界已登记玩家）：

登记入住 →（到样板地边）在
...[truncated 2119 chars]