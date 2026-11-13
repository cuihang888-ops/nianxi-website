# 安和里庭院接入补丁

状态：仅准备于 D: 独立工作目录，尚未修改线上商城。此包不是整站源码替换包。

GitHub 协作版说明：普通构建、庭院/农场测试不需要历史商城源码。下文 `node integration/verify.mjs` 是作者本机的可选历史基线审查，依赖未上传的兄弟目录 `nxmall-anheli-release-20261029/source` 和 `nxmall-anhe-calendar-20261104/patch`；Muse 不应为通过此检查索取凭证或复制生产数据。独立的原日历字节校验请运行 `npm run verify:calendar`。部署配置均为模板，不能当作生产服务器现状。

## 接入方式

- `/zh/anheli`、`/en/anheli` 显示同源庭院 iframe，商城原有全局导航、购物车及页脚继续由现有布局提供。
- iframe 地址为 `/images/anhe/courtyard-20261113/index.html?locale=zh&embedded=1`，英文使用 `locale=en`。将本项目 `npm run build` 的 `dist/` 内容发布到该独立静态目录。
- 原安和里商品目录与文化内容保留于 `/[locale]/anheli/collection`。分类、意图、搜索、排序、分页、清除筛选都指向此页。
- 旧首页携带商品筛选参数时，由服务端临时重定向至集合页；旧 `#goods`、`#culture`、`#about-anhe` 链接由首页组件兼容跳转。
- `/[locale]/anheli/journal` 转到集合页文化区；现有 `/journal/[slug]` 文章不改动。
- 现有 `/[locale]/anheli/calendar`、`AnheCalendar.tsx`、`AnheCalendarFrame.tsx` 与 `public/images/anhe/calendar-20261104/` 完全不在补丁中。庭院内使用本项目复制保留的原万年历文件。
- 多人服务通过同源 `/anheli-live/` 反向代理连接独立 Node 服务。服务未运行时，庭院应显示独处状态。

## 文件清单

`patch/` 内路径均相对于**当前线上 storefront 项目根目录**。

| 文件 | 操作 | 作用 |
| --- | --- | --- |
| `app/[locale]/anheli/page.tsx` | 替换 | 庭院入口与旧筛选参数兼容 |
| `app/[locale]/anheli/collection/page.tsx` | 新增 | 保留商品目录、东方志、五行、礼赠与品牌内容 |
| `app/[locale]/anheli/journal/page.tsx` | 新增 | 文化入口兼容 |
| `components/anhe/AnheShell.tsx` | 替换 | 首页隐藏安和里旧二级导航，子页保留 |
| `components/anhe/AnheCatalogue.tsx` | 替换 | 仅调整集合页导航路径 |
| `components/anhe/AnheCourtyardFrame.tsx` | 新增 | 同源 iframe、窗口尺寸与固定导航映射 |
| `components/anhe/AnheCourtyard.module.css` | 新增 | 安和里独立样式 |
| `lib/anhe/collection-href.ts` | 新增 | 复用既有筛选编码，仅改变集合页路径 |

未涉及商城全局布局、全局 CSS、支付、订单、ERP、会员、商品 API、凭证或数据库。无需为商城安装 Three.js/Vite；庭院依赖在构建后封装于独立静态包中。

## iframe 导航

直接链接可以使用同源地址和 `target="_top"`。也支持：

```js
window.parent.postMessage({
  type: "anheli:navigate",
  destination: "collection",
}, window.location.origin);
```

固定 destination：`collection`、`culture`、`knowledge`、`calendar`、`mall`。父组件同时校验同源、消息来源为当前 iframe，以及固定映射，不接受消息提供的任意 URL。

## 已完成检查

在本项目根目录执行：

```powershell
node integration/verify.mjs
```

校验使用只读虚拟覆盖，将补丁映射至 2026-10-29 前端基线，**不复制或修改历史源码**。检查结果：

- 8 个接入文件 TypeScript 类型检查通过，基线依赖诊断为 0。
- 逐一执行中英文首页 metadata：canonical、hreflang、Open Graph 地址保留在 `/zh/anheli`、`/en/anheli`；筛选查询实际重定向至集合页。
- `AnheCatalogue` 与旧组件精确比较，行为改动仅限集合页链接与表单地址。
- 五块原文化、五行、礼赠及品牌内容精确比较，内容保留。
- 原万年历 15 个文件在 `public/calendar/` 与已存在的 `dist/calendar/` 中逐一通过 SHA-256 字节一致性检查。
- 万年历与商城全局文件不在补丁清单中。

本检查不能替代当前线上版本的构建和实际浏览器回归。该基线并非 2026-11-13 完整生产快照；发布前必须对线上这三个待替换文件做当前版本差异检查，保留后续用户修改。

## 嵌套路径测试宿主

先执行庭院构建，再运行：

```powershell
node integration/serve-check.mjs
```

默认仅监听 `127.0.0.1:4183`，将 `dist/` 直接映射到 `/images/anhe/courtyard-20261113/`，并将 `/anheli-live/` 的 HTTP 与 WebSocket 流量代理至 `127.0.0.1:4107`。不复制产物、不使用软链接、不修改商城。

- `/integration-check?locale=zh`、`/integration-check?locale=en` 提供明确标记为测试用途的 iframe 宿主页，别名 `/zh/anheli`、`/en/anheli` 也仅为该测试宿主。
- `#anheli-frame` 使用与接入组件相同的嵌套静态资源地址与全屏权限。
- 宿主按接入组件相同的 origin、iframe source 和固定 destination 检查接收消息，将目标写入 `#navigation-destination` 的文本、`data-path` 和 `data-destination`；不真的导航到商城。
- 测试服务原样转发浏览器 Origin。多人服务的 `ANHELI_ALLOWED_ORIGINS` 需要包含 `http://127.0.0.1:4183`；不要将此测试地址加入生产允许列表。

这个宿主用于嵌套资源、字体、日历、全屏及消息协议检查，不模拟或宣称验证了真实商城的购物车、支付、全局导航或服务端渲染。

## 独立多人服务示例

`anheli-courtyard.service` 和 `anheli-courtyard.env.example` 是待核验路径的 systemd 配置示例，未安装至任何服务器。示例使用独立非 root 账号 `anheli`，工作目录为 `/www/wwwroot/nianxi-anheli/live`。将本项目的 `service/server.mjs` 发布为该目录中的 `server.mjs`，并在该目录提供 `ws` 运行依赖；不需要读写商城目录或数据库。Node 路径 `/usr/bin/node`、账号与工作目录必须按服务器实际值调整。

环境文件安装为 `/etc/anheli-courtyard.env`，生产关键值为：

```ini
ANHELI_HOST=127.0.0.1
ANHELI_PORT=4107
ANHELI_ALLOWED_ORIGINS=https://nxmall.net
ANHELI_TRUST_PROXY=1
```

`ANHELI_TRUST_PROXY=1` 与 `nginx-snippet.conf` 的 `proxy_set_header X-Forwarded-For $remote_addr;` 配套使用。Nginx 覆盖客户端自带转发头，Node 仅信任 loopback 代理，从而按真实来访地址进行 session 限流；未配置时，代理后的访客会共用 `127.0.0.1` 的每分钟 12 次 session 配额。不要将 Node 端口开放公网。如果服务器另有可信上游代理，应先核验 Nginx 的真实 IP 配置，再调整这里的地址来源。

Origin 列表只填实际使用的完整商城来源，多个来源用逗号分隔。示例只列当前商城主域；新增其他域名前需确认其实际用途。服务将多人身份、灯和茶邀保存在内存中，日志由 journal 接管。

## 发布准备

1. 只读核验当前站点源码、运行端口和进程；对上述 3 个替换文件及新路径是否已存在做检查。
2. 在服务器安和里专用版本备份目录记录当前文件、静态资源校验和与运行配置。不要备份或移动数据库来配合此补丁。
3. 在独立构建目录生成并验证庭院 `dist/`；以版本目录发布静态文件。
4. 参考上述 systemd 和环境示例配置独立多人服务，精确配置生产 Origin；同源代理必须覆盖 `X-Forwarded-For`，并启用服务端 `ANHELI_TRUST_PROXY=1`。服务仅监听 `127.0.0.1:4107`，不开放公网端口。
5. 合并这 8 个接入文件后，在当前商城副本运行类型检查与构建；不要将整个历史前端覆盖到生产。
6. 在预发布环境验证：首页进入庭院、手机布局、双客户端在线与换房、木鱼/念珠/茶/灯交互、万年历原操作、集合页搜索排序分页、文章返回、商城购物车与普通商品页面。
7. 发布完成再核验 `/zh`、`/en` 商城首页及关键原有页面。此包没有执行任何生产发布。

## 回滚

还原发布前备份的三个替换文件，构建并恢复原商城进程版本。新增集合页、iframe组件、辅助函数和版本静态目录可暂时保留，不影响旧首页。多人服务可独立停止或移除其代理。不要清理原万年历目录、用户上传、订单或数据库。

## 限制

- 商城全局导航与客服仍按原布局出现；庭院可使用自身全屏功能沉浸浏览，不通过全局 CSS 隐藏商城。
- 同源 iframe 保持与商城文档隔离，但不是不可信代码沙箱。仅发布本项目经过审查的产物。
- 需要浏览器支持 WebGL。非 WebGL 设备应由庭院自身显示可访问的替代入口。
- 服务端灯与多人状态是独立服务的临时数据，不与商城账户或订单绑定。重启多人服务的保留行为见 `service/protocol.md`。
