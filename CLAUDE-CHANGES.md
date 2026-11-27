# 本轮改动说明（协作中心 v1.3.0 源码上实现 MUSE-HANDOFF 新功能）

基线：宝塔当前运行版 v1.3.0 全文件（基线提交 `12035c5`，交接分支 commit `4119980`）。
改动范围：仅 `src/` 内文件。未推 GitHub、未部署。AI 助手接入与开关逻辑（ASSISTANT_ACCESS）未动，未接真实 API。

## 1. 录入缺项提醒

- 新增 `live/lib/completeness.mjs`：
  - 六项口径与录入页字段一一对应：业绩 `orderAmount`、单量 `orders`、直播时长 `actualMinutes`、浏览量 `impressions`、分享次数 `shares`、关注数 `newFollowers`。
  - 判定：字段为 `null/undefined` 才算缺；**明确填入的 0 计为已填**。
  - 场次状态：`complete` 齐全 / `partial` 部分已填 / `empty` 未录 / `stopped` 停播或取消（`cancelled` 或 `sourceStatus='stopped'`，与既有月度/复盘口径一致，不计缺项）。晚场跨日沿用既有场次日期口径（归开播日）。
  - `completenessForDate(store, roster, date)` 按名录当日有效主播匹配场次行汇总，**只返回状态与缺项名称，不返回任何指标数值**。
- 接口：
  - `GET /api/entry/completeness?date=`（录入端，与 entry bootstrap 同为公共录入通道，只下发状态）。
  - `GET /api/dashboard/completeness?date=`（看板侧总览，按看板权限保护，见第 3 节）。
- 补录不覆盖：`live/lib/entry.mjs` 新增 `mergeableSession/mergeSession`，`live/server.mjs` 录入 POST 接入——场次已填一部分时，再次提交只写入空缺字段并保存；与已填值冲突仍按 409 重复提交拦截，已填数值不被覆盖。原有「填空白计划场次」逻辑不变。
- 前端 `live/public/entry.js` + `entry.css`：录入页底部新增「本日录入完整性」面板（全部直播间 × 场次的状态与缺项名、汇总计数），点击任意一场次行直达对应主播的录入编辑器补齐；切换日期、提交成功后自动刷新。

## 2. 看板紧凑布局

- `live/public/daily-board.css` 末尾追加「紧凑密度」覆盖层（不动原有规则，便于回退）：
  - 全局收紧间距与昨日/本月大数字字号；
  - ≤640px：正文抬到 ≥12px（表格单元格 12px、主播名 12px、指标切换按钮 12px），单元格内边距收紧；
  - ≤640px：五间汇总（`.daily-room-list`）用 flex order 提到主播近五日表之前，与月目标进度、昨日业绩组成核心区。
- 实测（Playwright，390×844，演示数据）：昨日业绩区 208–298px、部门月目标 304–591px、五间汇总底边 786px，**核心区全部落在首屏 844px 内**；主播近五日表（指标切换保留）在核心区下方滚动查看；页面无横向滚动（scrollWidth=clientWidth=390）。桌面端仅小幅收紧，未改布局结构。

## 3. 看板员工反馈区

- 新增 `live/public/feedback.js` + `feedback.css`，`live/public/app.js` 增加导航项「员工反馈」（含单日大屏分析导航按钮，`daily-board.js` 同步加按钮），`dashboard.html` 引入样式。
- 视图内容：待办概览（待处理建议数、48H 已超时数、待协调数、近 7 天心声数）、录入完整性总览（可换日期，只列待补/未录场次及缺项名）、优化建议处理（状态+进展/动作表单）、协调事项处理、吐槽下架/恢复、荣誉发布表单与已发布列表。
- 服务端权限（`live/server.mjs`）：`/api/dashboard/feedback`、`/api/dashboard/feedback/*`、`/api/dashboard/completeness`、`/api/dashboard/honors` 统一走看板保护——员工录入账号 403；已登录但未解锁看板的会话 403 `DASHBOARD_LOCKED`；无会话 401；写操作限看板只读口令会话或 admin/manager 账号。

## 4. 茶水间三类反馈

存储沿用 SQLite `tearoom_posts` 表（新增 section：`vents`、`coordinates`；建议沿用 `suggest`），无新表迁移负担；`live/lib/tearoom.mjs` 与 `live/lib/feedback.mjs` 实现。

- **优化建议**：与原匿名建议箱合并为一个入口（茶水间「建议箱」）。提交时实名/匿名单选（缺省匿名；实名存当前昵称 `authorName`）。状态机：已收到 → 处理中 → 已调整 / 已回复（后两态必填调整动作/回复；处理中可记进展）。员工凭编号查询（原 `suggestLookup` 机制）与「我的建议」列表均可看到状态；茶水间管理员处理表单同步加「已调整」。**48 小时口径**：`suggestionTiming()` 自提交起计时，未到已调整/已回复即待处理，超 48h 标逾期；看板反馈区顶部计数 + 单条标红 + 「已超时 X 小时」提示。
- **吐槽墙**：茶水间新增「吐槽墙」视图，页面固定文案「我们会认真对待每一个心声。」；匿名提交（系统匿名昵称，不显示真实身份）。**员工端公开展示的选择**：交接文档只明确看板显示，本轮选择员工端也公开展示（只显示匿名昵称）——理由是茶水间定位为员工心声空间、公开可见更利于管理层回应形成氛围；风险是敏感内容先发后管，已用管理员下架对冲：管理员（茶水间管理账号或看板）可下架单条（软删 `hidden`），下架后员工端与最新动态均不可见、看板可恢复；系统不记录、不追溯发帖人真实身份（帖子只存匿名昵称）。
- **协调求助**：茶水间新增「协调求助」视图，员工填事项标题+问题与所需帮助。**内容仅看板可见**：茶水间 `state()` 只下发本人提交的记录（标题/正文/状态），其他员工接口层拿不到；管理层在看板反馈区查看正文并流转状态（已收到/协调中/已解决），提交人只能看到自己事项的状态变化。

## 5. 荣誉墙

- 数据表：新增 SQLite 表 `honors`（`live/lib/feedback.mjs` 内 `CREATE TABLE IF NOT EXISTS`，幂等）：`id、periodType(month/week/yesterday)、periodKey、personName、citation、photoUrl、publishedBy、publishedAt`。周期键：月=`YYYY-MM`，周=ISO 周 `YYYY-Www`，昨日=昨日日期。
- 接口：看板侧 `GET/POST /api/dashboard/honors`（发布限管理会话）；员工端 `GET /api/tearoom/honors`（须茶水间会话）返回每类最新一条为当前之星 + 全部历史留档。
- 前端：茶水间新增「荣誉墙」视图，三类当前之星大卡（照片或昵称首字默认头像、昵称、称号、一句话颁奖词）+ 历史荣誉列表；**墙上字段不含任何业绩数字**（接口层即不下发）。

## 6. 追加项：茶水间首页「最新动态」（用户 2026-11-28 追加）

- 接口：`GET /api/tearoom/activity?limit=20`（须茶水间会话，未进入返回 401），实现在 `live/lib/feedback.mjs` 的 `activityFeed()`。
- 聚合来源：生活集市（含现有「夜宵拼单/拼车」等拼单类帖子，直接聚合集市帖子，未另造拼单系统）、留言板、励志墙、感谢墙、求助台、优秀案例、愿望墙（`tearoom_wishes` 表）、荣誉发布（`honors` 表），以及本轮新增的建议/吐槽（脱敏，见下）。
- 每条字段仅：`kind、actorName、text（动作描述）、createdAt、view（点击直达的板块）`，不带帖子正文（集市拼单带标题、求助带标题，均为原板块公开信息）；默认最近 20 条（上限 50）。
- 刷新方式：首页打开时拉取、回到首页时再拉、页面可见时每 45 秒轮询（`document.hidden` 时不请求），无长连接；接口只查最近 120 条帖子做聚合，首页其他内容不受影响。
- 隐私口径（已按要求判断并在此注明）：
  - **协调事项绝不进动态**——不出现条目，也没有任何计数；
  - 建议只出现「有同事提交了一条新建议」（无正文、无身份、无编号）；
  - 吐槽只出现「有同事在吐槽墙发表了心声」（无正文、无身份），已下架的吐槽不进动态；
  - 荣誉动态为「荣誉墙更新：本周之星是 XX」。
- 前端：茶水间首页每日一句下方新增「最新动态」区，相对时间显示（刚刚/x分钟前/x小时前），点击条目直达对应板块。

## 接口与数据表汇总

| 接口 | 方法 | 权限 | 说明 |
|---|---|---|---|
| `/api/entry/completeness` | GET | 公共录入通道 | 状态+缺项名，无数值 |
| `/api/dashboard/completeness` | GET | 看板解锁 | 同上，看板总览 |
| `/api/dashboard/feedback` | GET | 看板解锁 | 建议/吐槽/协调汇总+48H 计时 |
| `/api/dashboard/feedback/suggestions/:code/status` | POST | 看板口令会话或 admin/manager | 建议状态流转 |
| `/api/dashboard/feedback/vents/:id/visibility` | POST | 同上 | 吐槽下架/恢复 |
| `/api/dashboard/feedback/coordinates/:id/status` | POST | 同上 | 协调状态流转 |
| `/api/dashboard/honors` | GET/POST | 看板解锁/管理会话 | 荣誉列表/发布 |
| `/api/tearoom/honors` | GET | 茶水间会话 | 荣誉墙（当前+历史） |
| `/api/tearoom/activity` | GET | 茶水间会话 | 最新动态（轻量字段） |

数据表：`tearoom_posts` 新增 section `vents`、`coordinates`；新建 `honors` 表（幂等建表，演示数据目录可重建）。

## 测试结果

- 新增测试 `live/tests/backend-feedback-completeness.test.mjs`（7 项，全过）：六项缺项判定（0 已填、缺项名、停播/取消不误报、无数值字段）、建议 48H 逾期判定与状态流转（含已调整必填动作、凭编号查询）、补录只填空缺不覆盖+冲突 409、协调可见性隔离（他人不可见、未解锁看板 403、无会话 401、录入账号 403）、吐槽下架后员工端与动态均不可见、荣誉三周期发布后员工端可见且无业绩字段、**动态接口返回拼单条目且不含协调/建议/吐槽正文**。
- 全量：`live npm test` **68/68 通过**；`booking npm test` **92/92 通过**；合计 160/160，无新增失败。
- 顺手修复既有问题：`live/tests/assistant-gateway.test.mjs`、`live/tests/backend-wishes.test.mjs` 中硬编码的 Windows 路径 `D:/CodexStorage/temp` 改为 `os.tmpdir()`，这两项此前在 Linux 必败，现已通过（计入上述 68 项内）。

## 运行自测（start-review.mjs，端口 4297，演示数据）

- 接口级主流程 22 项检查全过：建议实名/匿名提交与编号、看板处理已调整、员工凭编号查状态、协调仅本人可见且看板可见正文、未解锁 403、荣誉三周期发布与员工端展示、完整性接口可用且无数值字段、动态脱敏与不含协调。
- Playwright 390×844 视觉检查 15 项全过：茶水间首页动态渲染（6 条）、吐槽墙固定文案与内容、荣誉墙三张当前之星卡、看板核心区一屏（见第 2 节数据）、员工反馈视图渲染且含协调正文与完整性总览、录入页完整性面板 15 行且无业绩数字、三页均无横向滚动。自测结束已停服务并清除演示数据目录。

## 存疑点

1. **吐槽员工端公开**是本轮的判断（文档只说看板显示），已在第 4 节注明理由与下架对冲；若负责人希望员工端不公开，只需前端隐藏列表、保留提交与看板同步即可，接口不用改。
2. 录入完整性接口与录入 bootstrap 一样走公共录入通道（无账号校验），因为它只下发状态与缺项名、不含任何数值；若后续要求收紧，可改为必须持录入账号会话。
3. 荣誉照片为外链/站内路径 URL（管理层发布时填写），未做图片上传；无照片时用昵称首字头像。
4. 建议的 48H 计时以服务端提交时间为准；演示/测试环境改系统时间会影响逾期判定，生产环境无此问题。
5. 看板「员工反馈」写操作对看板只读口令会话开放（与看板既有「口令解锁即可处理」的定位一致）；若要区分只读/可处理两种口令，需要另加权限位，本轮未做。

## 本地启动方法

```bash
cd src/
node start-review.mjs            # 默认 http://127.0.0.1:4297/ ，演示口令 Local-admin-board-2026
cd live && npm test              # 直播侧测试
cd ../booking && npm test        # 预约侧测试
```
