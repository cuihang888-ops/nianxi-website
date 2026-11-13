# Muse 第五轮地图包微信接入评审

日期：2026-11-13。此次仅在内存中读取并比较附件，未解压覆盖、未合并、未运行包内代码。游戏内部仍由 Muse 负责，Codex 负责微信平台与接入边界。

## 相比第四轮

第五轮仍基于 `a28d1b7`，新增提交 `cd4f2ec77e8ef750158289910e003538651c174b`。`files/` 下仅 `src/dehong.css`、`src/dehong-world.js`、`src/dehong-main.js`、`dehong.html` 四份源码有变化：新增 16 处地点各 8 块可选土地、400 安币安家、免费茅屋/首块菜地/首只鸡和自动步行回家。本机状态使用 `anheli-dehong-v1`。

附件自述的 52/52 测试、构建和重载结果尚未独立复跑，不能作为微信运行通过的证据。第四轮旧基线风险与待对齐事项仍有效，见 [第四轮评审](MUSE_ROUND4_WECHAT_REVIEW_20261113.md)。

## 微信接入仍未完成

- 包内没有 `wechat/`、`wechat/game-entry.js` 或 `createGame(context)`。入口仍是网页 HTML，依赖 DOM、CSS、浏览器事件、自有帧循环和直接 `localStorage`；标签仍用 `document.createElement("canvas")`，新增安家面板也是 DOM。
- 累计包的 `package.json`、`farm-state.js`、`economy-config.js` 等沿用旧内容，整体覆盖会丢失当前微信命令、测试、依赖及世界规则/经济配置增量。请等本轮平台提交完成后，从 `codex/dehong-world-framework` 最新已验证提交制作增量。
- `dehong-data.js` 未改，仍把总佛寺放在芒市；用户确认的是瑞丽总佛寺。独立的 1200 安币钱包、0.5 安币传送费及本轮土地/赠礼数值须与共用规则对齐，附件描述不视为用户批准新规则。
- `save()` 仍吞掉异常，安家扣款与成功提示未区分持久化失败。`renderHome()` 清空场景后重建资源，也需要补齐几何、材质、标签纹理的释放。

## Muse 下一份交付

先接入一个可交互的最小场景。按 [运行接口](WECHAT_RUNTIME_CONTRACT.md) 在 `wechat/game-entry.js` 导出 `createGame(context)`，复用宿主的画布、输入、视口与平台接口，返回 `update/render/resize/pause/resume/dispose`，由宿主管理主循环。

界面与标签改为微信兼容的画布方案；资产放入 `wechat/assets/`，使用 `npm run build:wechat` 生成 `dist/wechat`，见 [构建约定](WECHAT_BUILD.md)。本机存档接入 [存档契约](WECHAT_SAVE_CONTRACT.md)，明确显示保存失败与未云同步状态。先验证触摸移动、场景显示、后台暂停/恢复和退出重进存档，再扩展整张地图。保留 Codex 平台层，不修改日历、不接支付。

## 附件核验记录

- 文件：`nianxi-anheli-muse-round5-cumulative-20261113.zip`；压缩大小 3,319,626 字节。
- 44 个条目，解压总大小 3,938,771 字节；未发现绝对路径、路径穿越或链接条目。
- 26 份文本文件的高置信度凭据/令牌模式扫描未命中；这不是完整安全审计。
- SHA256：`33077E4FFC6F130E480F37FC39C46C32BF1F7BA903403C8536A3DAF1ECD318D2`。
