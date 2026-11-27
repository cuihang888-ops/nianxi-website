// 协作中心评审测量（可复现）
// 配置: 390x844, 微信 Android UA, CDP Slow 4G (下行 1.6Mbps / 上行 750Kbps / RTT 150ms), CPU 4x
// 冷打开: 新 context 直接访问目标页; 热打开: 同 context 先访首页再访问目标页（服务端缓存头决定复用程度）
// 指标: domContentLoaded / load / firstDataMs(目标元素可见) / requests / transferBytes
const { chromium } = require('playwright-core');

const BASE = 'http://127.0.0.1:4277';
const EXE = process.env.HOME + '/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome';
const UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36 MicroMessenger/8.0.44';

const PAGES = [
  { name: '首页', url: BASE + '/', ready: 'a[href="./tearoom/"]' },
  { name: '数据录入', url: BASE + '/entry', ready: 'form, select, input' },
  { name: '看板(密码页)', url: BASE + '/dashboard', ready: 'input[type="password"], form' },
  { name: '茶水间', url: BASE + '/tearoom/', ready: '#app, main, .tearoom, body' },
  { name: '看场地', url: BASE + '/booking/?module=rooms', ready: 'main, .card, body' },
  { name: '看卖手', url: BASE + '/booking/?module=schedule', ready: 'main, .card, body' },
];

async function throttle(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8,
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  return cdp;
}

async function measure(browser, url, readySel, warm) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: UA, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await throttle(page);
  let reqs = 0, bytes = 0;
  page.on('response', async (r) => { reqs++; try { const b = await r.body(); bytes += b.length; } catch {} });
  if (warm) { await page.goto(BASE + '/', { waitUntil: 'load' }).catch(() => {}); }
  const t0 = Date.now();
  let nav = {};
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    nav = await page.evaluate(() => {
      const n = performance.getEntriesByType('navigation')[0];
      return n ? { dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), resp: Math.round(n.responseEnd) } : {};
    });
  } catch (e) { nav = { error: String(e).slice(0, 80) }; }
  let firstData = null;
  try {
    await page.waitForSelector(readySel, { state: 'visible', timeout: 20000 });
    firstData = Date.now() - t0;
  } catch {}
  // 等网络基本静默, 统计懒加载
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  const totalMs = Date.now() - t0;
  const longTasks = await page.evaluate(() => {
    return new Promise((res) => {
      const arr = [];
      try {
        const po = new PerformanceObserver((l) => { for (const e of l.getEntries()) arr.push(Math.round(e.duration)); });
        po.observe({ entryTypes: ['longtask'] });
        setTimeout(() => { po.disconnect(); res(arr); }, 300);
      } catch { res(arr); }
    });
  }).catch(() => []);
  await ctx.close();
  return { nav, firstData, totalMs, reqs, bytes, longTasks };
}

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  const out = [];
  for (const p of PAGES) {
    const cold = await measure(browser, p.url, p.ready, false);
    const warm = await measure(browser, p.url, p.ready, true);
    out.push({ page: p.name, url: p.url, cold, warm });
    console.log(JSON.stringify(out[out.length - 1]));
  }
  await browser.close();
  require('fs').writeFileSync(__dirname + '/measure-results.json', JSON.stringify(out, null, 2));
})().catch((e) => { console.error(e); process.exit(1); });
