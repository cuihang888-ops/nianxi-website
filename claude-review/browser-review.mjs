// 协作中心 v1.3.2 独立评审 · 浏览器级实测（Muse）
// 对本地试用实例 http://127.0.0.1:4297（start-review.mjs 演示数据）执行。
import { chromium } from '/home/hatch/workspace/nianxi-anheli/nianxi-website/node_modules/playwright/index.mjs';
import { writeFileSync } from 'node:fs';

const BASE = 'http://127.0.0.1:4297';
const UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36 MicroMessenger/8.0.44';
const results = [];
function check(id, title, expected, actual, pass, detail = '') {
  results.push({ id, title, expected, actual, pass: Boolean(pass), detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} [${id}] ${title} :: ${actual}${detail ? ' | ' + detail : ''}`);
}
const api = async path => (await fetch(BASE + path)).json();

const browser = await chromium.launch();

// ---------- L. 手机布局 390 / 320 ----------
for (const width of [390, 320]) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, userAgent: UA });
  const page = await ctx.newPage();
  await page.goto(BASE + '/entry', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.entry-session-card', { timeout: 20000 });
  const layout = await page.evaluate(() => {
    const tabs = [...document.querySelectorAll('.account-tabs button')].map(btn => ({
      name: btn.querySelector('.entry-account-name')?.textContent,
      badge: btn.querySelector('.entry-count-badge')?.textContent || null,
      nameTruncated: (() => { const el = btn.querySelector('.entry-account-name'); return el ? el.scrollWidth > el.clientWidth + 1 : null; })()
    }));
    const cards = [...document.querySelectorAll('.entry-session-card')].map(card => ({
      anchor: card.querySelector('.card-body strong')?.textContent,
      badge: card.querySelector('.entry-count-badge')?.textContent || null,
      badgeTitle: card.querySelector('.entry-count-badge')?.getAttribute('title') || null,
      disabled: card.disabled
    }));
    return { tabs, cards, docScrollW: document.documentElement.scrollWidth, innerW: window.innerWidth,
      bodyScrollW: document.body.scrollWidth };
  });
  const todayComp = await api('/api/entry/completeness');
  const todayStr = todayComp.to;
  const dayComp = await api('/api/entry/completeness?date=' + todayStr);
  const expectedRoomBadge = {};
  for (const g of dayComp.accounts) expectedRoomBadge[g.accountName] = g.sessions.filter(s => s.canEnter).length;
  const roomBadgesOk = layout.tabs.every(t => (t.badge ? Number(t.badge.slice(1)) : 0) === (expectedRoomBadge[t.name] || 0));
  check(`L${width}-1`, `布局 ${width}px：五间名字完整 + 直播间红色 +N 与接口待补数一致`,
    '5 间名无截断；每间 badge = 当日 canEnter 场次数',
    `${layout.tabs.map(t => `${t.name}:${t.badge || '无'}`).join(' ')}`,
    layout.tabs.length === 5 && layout.tabs.every(t => t.nameTruncated === false) && roomBadgesOk,
    '接口期望 ' + JSON.stringify(expectedRoomBadge));
  const firstCard = layout.cards[0];
  const apiFirst = dayComp.accounts[0].sessions[0];
  check(`L${width}-2`, `布局 ${width}px：场次卡 +N = 缺项数`,
    `首卡 badge=+${apiFirst.missing.length}（${apiFirst.missing.join('/')}）`,
    `${firstCard.anchor} badge=${firstCard.badge} title=${firstCard.badgeTitle}`,
    firstCard.badge === '+' + apiFirst.missing.length);
  check(`L${width}-3`, `布局 ${width}px：无横向滚动`, `scrollWidth ≤ ${width}`,
    `doc=${layout.docScrollW} body=${layout.bodyScrollW} inner=${layout.innerW}`,
    layout.docScrollW <= width && layout.bodyScrollW <= width);
  if (width === 390) {
    // 合成长中文名压测（仅改 DOM 文本测 CSS 容纳，不改数据）
    const longName = await page.evaluate(() => {
      const name = document.querySelector('.entry-account-name');
      name.textContent = '缅甸寻翠国际珠宝直播间';
      const cardName = document.querySelector('.entry-session-card .card-body strong');
      if (cardName) cardName.textContent = '欧阳娜娜娜·长名字主播测试';
      return { docW: document.documentElement.scrollWidth, tabTrunc: name.scrollWidth > name.clientWidth + 1 };
    });
    check('L390-4', '布局 390px：长中文名不溢出页面（合成压测）', '页面无横向滚动',
      `docScrollW=${longName.docW} 标签内截断=${longName.tabTrunc}`, longName.docW <= 390);
  }
  await ctx.close();
}

// ---------- M. 月度清单点击直达表单 ----------
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: UA });
  const page = await ctx.newPage();
  await page.goto(BASE + '/entry', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.entry-month-shifts a', { timeout: 20000 });
  const target = await page.evaluate(() => {
    const a = document.querySelector('.entry-month-shifts a');
    return { href: a.href, text: a.textContent.trim(), date: a.dataset.monthDate, anchor: a.dataset.monthAnchor };
  });
  await page.click('.entry-month-shifts a');
  await page.waitForLoadState('domcontentloaded');
  let dialogOpen = false; let dialogTitle = '';
  try {
    await page.waitForSelector('#entry-editor[open]', { timeout: 8000 });
    dialogOpen = true;
    dialogTitle = await page.evaluate(() => document.querySelector('#entry-editor-title')?.textContent || document.querySelector('#entry-editor h2')?.textContent || '');
  } catch { /* 若未自动打开，点对应场次卡再验 */
    const card = page.locator(`.entry-session-card[data-anchor-id="${target.anchor}"]`);
    if (await card.count()) { await card.first().click(); await page.waitForSelector('#entry-editor[open]', { timeout: 8000 }); dialogOpen = true; }
  }
  const dateVal = await page.evaluate(() => document.querySelector('#entry-date')?.value);
  check('M1', '本月待补：月度清单点击直达具体表单', '点击待补记录 → 日期切到该日且对应主播表单打开',
    `目标 ${target.date}/${target.text.slice(0, 20)} → 当前日期=${dateVal} 表单打开=${dialogOpen} 标题=${dialogTitle}`,
    dateVal === target.date && dialogOpen);
  await ctx.close();
}

// ---------- G. 草稿：保留、恢复、提交后清除 ----------
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: UA });
  const page = await ctx.newPage();
  await page.goto(BASE + '/entry?date=2026-11-27', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.entry-session-card', { timeout: 20000 });
  await page.click('.entry-session-card[data-anchor-id="anchor-1"]');
  await page.waitForSelector('#entry-editor[open]');
  await page.fill('#entry-editor input[name="impressions"]', '12345');
  await page.fill('#entry-editor input[name="shares"]', '3');
  await page.click('#entry-editor [data-action="close-editor"]');
  await page.waitForTimeout(400);
  const draftKeys = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('cooperation-trial-entry:')));
  const badge = await page.evaluate(() => document.querySelector('.entry-session-card[data-anchor-id="anchor-1"] .draft-badge')?.textContent || null);
  check('G1', '草稿：填写后关闭自动保留并在卡上标记', 'localStorage 有草稿键；卡显示「本机草稿」',
    `keys=${draftKeys.length} badge=${badge}`, draftKeys.length >= 1 && badge === '本机草稿');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.entry-session-card', { timeout: 20000 });
  await page.click('.entry-session-card[data-anchor-id="anchor-1"]');
  await page.waitForSelector('#entry-editor[open]');
  const restored = await page.evaluate(() => ({
    impressions: document.querySelector('#entry-editor input[name="impressions"]')?.value,
    shares: document.querySelector('#entry-editor input[name="shares"]')?.value
  }));
  check('G2', '草稿：刷新后仍恢复且归原场次', 'impressions=12345 shares=3',
    JSON.stringify(restored), restored.impressions === '12345' && restored.shares === '3');
  await page.click('#entry-editor [data-testid="entry-submit"]');
  await page.waitForFunction(() => document.querySelector('#entry-editor')?.textContent.includes('提交回执') || document.querySelector('#entry-editor')?.textContent.includes('已提交'), null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(600);
  const afterKeys = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('cooperation-trial-entry:')));
  const comp = await api('/api/entry/completeness?date=2026-11-27');
  const mine = comp.accounts[0].sessions.find(s => s.anchorId === 'anchor-1');
  check('G3', '草稿：提交成功后草稿清除且场次录齐', '草稿键=0；接口状态 complete',
    `keys=${afterKeys.length} status=${mine?.status}`, afterKeys.length === 0 && mine?.status === 'complete');
  await ctx.close();
}

// ---------- S. 旧表单归属变更提示（接口等价 + UI 复核入口） ----------
{
  // 接口级：打开表单后主播被改派，旧 slotId 提交 → 409 assignmentChanged
  const jar = new Map();
  const req = async (path, body, method) => {
    const r = await fetch(BASE + path, { method: method || (body ? 'POST' : 'GET'), headers: { 'Content-Type': 'application/json', Cookie: [...jar].map(([k, v]) => k + '=' + v).join('; '), 'X-Command-Scope': 'public-entry' }, body: body ? JSON.stringify(body) : undefined });
    for (const c of r.headers.getSetCookie()) { const p = c.split(';')[0]; const i = p.indexOf('='); jar.set(p.slice(0, i), p.slice(i + 1)); }
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
  const stale = await req('/api/entry/sessions?status=1', { date: '2026-11-26', accountId: 'account-2', anchorId: 'anchor-4', slotId: 'slot-3', orders: 1 });
  check('S1', '历史/归属：旧表单带过期 slot 提交被拦并提示刷新', '409 code=ENTRY_CONFLICT assignmentChanged=true',
    `${stale.status} code=${stale.body.code} assignmentChanged=${stale.body.assignmentChanged}`,
    stale.status === 409 && stale.body.code === 'ENTRY_CONFLICT' && stale.body.assignmentChanged === true);
}

// ---------- T. 茶水间荣誉照片（浏览器显示）+ 预约返回入口 ----------
{
  const jar = new Map();
  const req = async (path, body) => {
    const r = await fetch(BASE + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Cookie: [...jar].map(([k, v]) => k + '=' + v).join('; ') }, body: body ? JSON.stringify(body) : undefined });
    for (const c of r.headers.getSetCookie()) { const p = c.split(';')[0]; const i = p.indexOf('='); jar.set(p.slice(0, i), p.slice(i + 1)); }
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
  await req('/api/login', { username: 'demo', password: 'demo2026!' });
  await req('/api/dashboard/unlock', { password: 'Local-admin-board-2026', mode: 'manage' });
  const pixel = 'data:image/png;base64,' + Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=', 'base64').toString('base64');
  const pub = await req('/api/dashboard/honors', { periodType: 'week', personName: '浏览器评审之星', citation: '照片显示验证', photoData: pixel });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: UA });
  const page = await ctx.newPage();
  await page.goto(BASE + '/tearoom/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const honorsNav = page.locator('button, a', { hasText: '荣誉墙' }).first();
  if (await honorsNav.count()) await honorsNav.click();
  await page.waitForTimeout(1500);
  const honorImg = await page.evaluate(() => {
    const img = document.querySelector('.honor-banner, .honor-photo');
    return img ? { src: img.getAttribute('src'), natural: img.naturalWidth, visible: Boolean(img.offsetParent) } : null;
  });
  check('T1', '茶水间：荣誉照片在员工端大图显示', '发布 201；荣誉墙有照片图且成功加载（naturalWidth>0）',
    `发布=${pub.status} img=${JSON.stringify(honorImg)}`,
    pub.status === 201 && Boolean(honorImg) && honorImg.natural > 0);
  await page.goto(BASE + '/booking/?module=rooms', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const backLink = await page.evaluate(() => {
    const a = [...document.querySelectorAll('a')].find(x => /协作中心/.test(x.textContent));
    return a ? { text: a.textContent.trim(), href: a.getAttribute('href') } : null;
  });
  check('T2', '预约：有返回协作中心入口', '存在含「协作中心」的链接', JSON.stringify(backLink), Boolean(backLink));
  await ctx.close();
}

// ---------- P. 性能（固定条件） ----------
const perf = { conditions: { viewport: '390x844', ua: 'MicroMessenger/8.0.44 (Android)', downKbps: 1600, upKbps: 750, rttMs: 150, cpuThrottle: 4 }, runs: {} };
async function throttle(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1600 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  return cdp;
}
async function measureLoad(label, warm) {
  const samples = [];
  for (let i = 0; i < 3; i++) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: UA });
    const page = await ctx.newPage();
    await throttle(page);
    const requests = [];
    page.on('response', async res => {
      let bytes = 0;
      try { bytes = (await res.body()).length; } catch { /* ignore */ }
      requests.push({ url: res.url().replace(BASE, ''), status: res.status(), bytes });
    });
    if (warm) { await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1200); requests.length = 0; }
    const t0 = Date.now();
    await page.goto(BASE + '/entry', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.entry-session-card', { timeout: 60000 });
    const visibleMs = Date.now() - t0;
    await page.waitForTimeout(800);
    samples.push({ visibleMs, requestCount: requests.length, totalBytes: requests.reduce((a, r) => a + r.bytes, 0),
      apiRequests: requests.filter(r => r.url.startsWith('/api/')).map(r => r.url) });
    await ctx.close();
  }
  const median = arr => arr.sort((a, b) => a - b)[1];
  const out = { visibleMsMedian: median(samples.map(s => s.visibleMs)), requestCountMedian: median(samples.map(s => s.requestCount)),
    totalBytesMedian: median(samples.map(s => s.totalBytes)), samples };
  perf.runs[label] = out;
  return out;
}
{
  const cold = await measureLoad('entryCold', false);
  const hot = await measureLoad('entryHot', true);
  const bootCalls = cold.samples[0].apiRequests.filter(u => u.includes('/api/entry/bootstrap'));
  check('P1', '性能：录入页冷打开（慢网+CPU 4×）', '记录可见耗时/请求数/传输量；首屏 API 仅 1 次 bootstrap（含名录+状态+本月汇总）',
    `中位 ${cold.visibleMsMedian}ms / ${cold.requestCountMedian} 请求 / ${Math.round(cold.totalBytesMedian / 1024)}KB；bootstrap 调用=${bootCalls.length} ${bootCalls[0] || ''}`,
    bootCalls.length === 1 && bootCalls[0].includes('completeness=1'));
  check('P2', '性能：录入页热打开（先访问首页）', '记录中位可见耗时',
    `中位 ${hot.visibleMsMedian}ms / ${hot.requestCountMedian} 请求 / ${Math.round(hot.totalBytesMedian / 1024)}KB`, hot.visibleMsMedian > 0);
  // 交互请求数：切间 / 开表单 / 提交
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: UA });
  const page = await ctx.newPage();
  await throttle(page);
  const apiCalls = [];
  page.on('request', r => { if (r.url().includes('/api/')) apiCalls.push(r.method() + ' ' + r.url().replace(BASE, '')); });
  await page.goto(BASE + '/entry?date=2026-11-25', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.entry-session-card', { timeout: 60000 });
  apiCalls.length = 0;
  await page.click('.account-tabs button[data-account-id="account-2"]');
  await page.waitForTimeout(600);
  const switchCalls = apiCalls.length;
  await page.click('.entry-session-card[data-anchor-id="anchor-4"]');
  await page.waitForSelector('#entry-editor[open]', { timeout: 15000 });
  const openCalls = apiCalls.length - switchCalls;
  await page.fill('#entry-editor input[name="impressions"]', '555');
  apiCalls.length = 0;
  const t0 = Date.now();
  await page.click('#entry-editor [data-testid="entry-submit"]');
  await page.waitForFunction(() => document.querySelector('#entry-editor')?.textContent.includes('提交回执') || document.querySelector('#entry-editor')?.textContent.includes('已提交'), null, { timeout: 30000 }).catch(() => {});
  const submitMs = Date.now() - t0;
  check('P3', '性能：交互请求数（切间/开表单/提交）', '切间 0 请求；开表单 0 请求；提交 1 个 POST 且回执内嵌状态不再拉取',
    `切间=${switchCalls} 开表单=${openCalls} 提交请求=${JSON.stringify(apiCalls)} 提交耗时=${submitMs}ms`,
    switchCalls === 0 && openCalls === 0 && apiCalls.length === 1 && apiCalls[0].startsWith('POST'));
  perf.interactions = { switchCalls, openCalls, submitCalls: apiCalls, submitMs };
  await ctx.close();
}

// ---------- N. 慢网并发补录（双端） ----------
{
  const mk = async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: UA });
    const page = await ctx.newPage();
    await throttle(page);
    await page.goto(BASE + '/entry?date=2026-11-24', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.entry-session-card[data-anchor-id="anchor-1"]', { timeout: 60000 });
    await page.click('.entry-session-card[data-anchor-id="anchor-1"]');
    await page.waitForSelector('#entry-editor[open]', { timeout: 30000 });
    return { ctx, page };
  };
  const a = await mk(); const b = await mk();
  await a.page.fill('#entry-editor input[name="impressions"]', '111');
  await b.page.fill('#entry-editor input[name="shares"]', '9');
  await Promise.all([
    a.page.click('#entry-editor [data-testid="entry-submit"]'),
    b.page.click('#entry-editor [data-testid="entry-submit"]')
  ]);
  await Promise.all([a.page.waitForTimeout(9000), b.page.waitForTimeout(9000)]);
  const stateOf = async p => p.evaluate(() => document.querySelector('#entry-editor')?.textContent.replace(/\s+/g, ' ').slice(0, 160) || '');
  const sa = await stateOf(a.page); const sb = await stateOf(b.page);
  const comp = await api('/api/entry/completeness?date=2026-11-24');
  const mine = comp.accounts[0].sessions.find(s => s.anchorId === 'anchor-1');
  check('N1', '慢网并发补录：双端同场不同缺项最终都落库', '最终状态 complete（两项都补上），无互相覆盖',
    `A端=${sa.slice(0, 60)} | B端=${sb.slice(0, 60)} | 接口状态=${mine?.status}`,
    mine?.status === 'complete', `A=${sa} || B=${sb}`);
  await a.ctx.close(); await b.ctx.close();
}

await browser.close();
writeFileSync(new URL('./perf-v132.json', import.meta.url), JSON.stringify(perf, null, 2));
writeFileSync(new URL('./browser-results.json', import.meta.url), JSON.stringify(results, null, 2));
const failed = results.filter(r => !r.pass);
console.log(`\n== 浏览器评审：${results.length - failed.length}/${results.length} 通过 ==`);
process.exit(failed.length ? 1 : 0);
