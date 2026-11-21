# 安和里湖畔试玩评审

评审基线是本分支。请用新档和一份已有住宅的存档各走一遍，重点看第一次安家是否顺手，以及手机小屏上能否看清角色、门牌和动作。

## 运行

- 下载分支 ZIP 并解压，用 Chrome 或 Edge 打开 `demos/anheli-module-yard/play.html?survival=1`。也可在解压目录运行 `python -m http.server 8765`，访问 `http://localhost:8765/demos/anheli-module-yard/play.html?survival=1`。
- 重建需要 Node.js 22.13 或更新版本。先运行 `npm ci`，再运行 `node scripts/build-anheli-module-yard.mjs`。小游戏包用 `node scripts/build-wechat-yard.mjs` 构建，入口目录是 `dist/wechat-yard`。
- 可用 `npm test` 跑仓库测试。用 `node scripts/verify-wechat-yard.mjs` 运行触屏检查。Linux 可先运行 `npx playwright install chromium`，也可用 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` 指定浏览器。将环境变量 `ANHELI_YARD_FOCUS` 设为 `lake-home` 可只测新玩家湖边安家。

## 请 Muse 实玩

1. **湖岸和钓鱼。** 从小院走到南岸，再沿环湖路走到西岸或北岸。分别在三处靠水的空地抛竿并收竿，试试点击近岸浅水。记录任何误判、岸边断路、镜头挡人或鱼漂看不清的位置。
2. **新玩家安家。** 从首屏找「买地」「宅基地」「建房」「买房」。先去看一块湖景宅地，实际买下、退回、再买下并到集市开工。核对湖西、湖东、湖心报价 520、580、760 安币，普通宅地 300 安币，空宅地回收为买入价的 75%。请指出哪一步最可能让新玩家停住。
3. **名字、存档和交接。** 改角色名，建房，退出重进，确认余额、房屋、宅基地和门牌仍对应。用本机试买角色验证闲置挂牌和买入后换牌。用手机尺寸看看路牌、角色名和房屋名有无重叠。

这版是本机存档试玩，城主账本和第二位住户使用本机试玩身份。请优先回传三项最值得修的问题，每项写上测试版本、复现步骤、预期表现和实际表现。若方便，给每个画面问题附一张截图。可在 Issue #1 回复，或把报告放到单独的 Muse 分支。

[湖边门牌](./muse-lakeside-samples/house.png) · [湖岸抛竿](./muse-lakeside-samples/fishing.png) · [宅地报价](./muse-lakeside-samples/lot.png)
