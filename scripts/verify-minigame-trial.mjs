import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import Discovery from "../wechat/vendor/preview-discovery.cjs";
import Sky from "../wechat/vendor/preview-sky.cjs";

const root = await realpath(fileURLToPath(new URL("..", import.meta.url)));
if (process.platform === "win32" && !/^d:/i.test(root)) throw new Error("Trial verification outputs must stay on D:");
const runLabel = process.env.ANHELI_TRIAL_RUN || "minigame-trial-check";
assert.match(runLabel, /^[a-z0-9][a-z0-9-]{0,79}$/i, "Report label must be a directory name");
const reportRoot = path.join(root, "reports", runLabel);
const profileRoot = path.join(root, "reports", "minigame-browser-profile");
await mkdir(reportRoot, { recursive: true });
await mkdir(profileRoot, { recursive: true });
for (const folder of [reportRoot, profileRoot]) {
  if (process.platform === "win32" && !/^d:/i.test(await realpath(folder))) throw new Error("A report directory resolves outside D:");
}
const profile = await mkdtemp(path.join(profileRoot, "acceptance-"));
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
assert.ok(existsSync(executablePath), "Installed Chrome is available");
const url = process.env.ANHELI_TRIAL_URL || "http://127.0.0.1:5180/?test=1";
const results = { url, startedAt: new Date().toISOString(), profile, checks: [], screenshots: [], errors: [] };
const context = await chromium.launchPersistentContext(profile, {
  executablePath, headless: true, viewport: { width: 1280, height: 800 },
  locale: "zh-CN", timezoneId: "Asia/Shanghai", downloadsPath: reportRoot,
  args: ["--disable-dev-shm-usage", "--disable-background-timer-throttling"],
});
const contexts = [context];
let page = context.pages()[0] || await context.newPage();
function watchPage(value) {
  value.setDefaultTimeout(15_000);
  value.on("pageerror", error => results.errors.push({ type: "pageerror", message: error.message }));
  value.on("console", message => {
    if (message.type() === "error") results.errors.push({ type: "console", message: message.text() });
  });
}
watchPage(page);
let fakeNow = Date.now();
const state = () => page.evaluate(() => window.__trial.getState());
const active = () => page.evaluate(() => window.__trial.getActive());
const wait = predicate => page.waitForFunction(predicate);
const check = label => { results.checks.push(label); console.log(`PASS ${label}`); };

async function click(id) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const controls = await page.evaluate(() => window.__trial.ui.getHitRects());
    if (controls.some(rect => rect.id === id)) break;
    const pager = controls.find(rect => rect.id === "hall-next" && rect.enabled)
      || controls.find(rect => rect.id === "hall-prev" && rect.enabled);
    if (!pager || id.startsWith("hall-")) break;
    await page.mouse.click(pager.x + pager.w / 2, pager.y + pager.h / 2);
    await page.waitForTimeout(100);
  }
  await page.waitForFunction(value => window.__trial.ui.getHitRects().some(rect => rect.id === value), id);
  const rect = await page.evaluate(value => window.__trial.ui.getHitRects().find(item => item.id === value), id);
  assert.ok(rect.w > 0 && rect.h > 0, `${id} has a usable target`);
  await page.mouse.click(rect.x + rect.w / 2, rect.y + rect.h / 2);
  await page.waitForTimeout(100);
}

async function action(fragment) {
  await page.waitForTimeout(100);
  await page.waitForFunction(value => window.__trial.ui.getActionLabel().includes(value), fragment);
  await click("action");
}

async function scene(index) {
  if (await page.evaluate(() => window.__trial.ui.isPanelOpen())) await click("close");
  for (let attempt = 0; await active() !== index && attempt < 7; attempt++) await click("next-scene");
  assert.equal(await active(), index, `scene ${index} selected by visible control`);
}

async function visual(label) {
  await page.waitForTimeout(150);
  const stats = await page.evaluate(() => {
    const source = document.querySelector("#game");
    window.__trial.game.render();
    const copy = document.createElement("canvas");
    copy.width = 80; copy.height = 64;
    const ctx = copy.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(source, source.width * 0.08, source.height * 0.18, source.width * 0.84, source.height * 0.56, 0, 0, 80, 64);
    const pixels = ctx.getImageData(0, 0, 80, 64).data;
    const colors = new Set();
    let opaque = 0, light = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] > 200) opaque++;
      if (pixels[i] + pixels[i + 1] + pixels[i + 2] > 10) light++;
      colors.add([pixels[i] >> 2, pixels[i + 1] >> 2, pixels[i + 2] >> 2].join(","));
    }
    const badRects = window.__trial.ui.getHitRects().filter(r => r.x < 0 || r.y < 0 || r.x + r.w > innerWidth + 0.1 || r.y + r.h > innerHeight + 0.1);
    const composite = document.createElement("canvas");
    composite.width = innerWidth; composite.height = innerHeight;
    const composed = composite.getContext("2d", { willReadFrequently: true });
    composed.drawImage(source, 0, 0, innerWidth, innerHeight);
    const actual = composed.getImageData(0, 0, innerWidth, innerHeight).data;
    composed.clearRect(0, 0, innerWidth, innerHeight);
    composed.drawImage(window.__trial.ui.canvas, 0, 0, innerWidth, innerHeight);
    const expected = composed.getImageData(0, 0, innerWidth, innerHeight).data;
    let opaqueUiSamples = 0, visibleUiSamples = 0;
    for (let i = 0; i < expected.length; i += 16) {
      if (expected[i + 3] < 245 || expected[i] + expected[i + 1] + expected[i + 2] < 630) continue;
      opaqueUiSamples++;
      if (actual[i] + actual[i + 1] + actual[i + 2] > 570) visibleUiSamples++;
    }
    return { colors: colors.size, opaque, light, samples: pixels.length / 4, width: source.width, height: source.height,
      viewportWidth: innerWidth, viewportHeight: innerHeight, dpr: Math.min(devicePixelRatio, 2),
      badRects, opaqueUiSamples, visibleUiSamples, uiAlignment: visibleUiSamples / Math.max(1, opaqueUiSamples) };
  });
  assert.ok(stats.colors >= 8, `${label}: world has varied rendered pixels (${stats.colors})`);
  assert.ok(stats.opaque > stats.samples * 0.95 && stats.light > stats.samples * 0.5, `${label}: day or night world canvas is nonblank`);
  assert.deepEqual(stats.badRects, [], `${label}: controls fit viewport`);
  assert.equal(stats.width, Math.round(stats.viewportWidth * stats.dpr), `${label}: canvas matches DPR width`);
  assert.equal(stats.height, Math.round(stats.viewportHeight * stats.dpr), `${label}: canvas matches DPR height`);
  assert.ok(stats.opaqueUiSamples > 100 && stats.uiAlignment > 0.9,
    `${label}: composed UI must align with its canvas (${stats.uiAlignment.toFixed(3)})`);
  const filename = path.join(reportRoot, `${label}.png`);
  await page.screenshot({ path: filename });
  results.screenshots.push({ label, filename, stats });
}

async function advanceSeconds(seconds) {
  fakeNow += seconds * 1000;
  await page.clock.setFixedTime(fakeNow);
  await page.waitForTimeout(250);
}

async function approachCrystal() {
  await page.evaluate(() => {
    const world = window.__trial.getWorld(), crystal = world.getCrystalPos();
    world.debugSetPlayer(crystal.x, crystal.z);
  });
  await page.waitForTimeout(150);
}

async function lightCrystal(dam) {
  await approachCrystal();
  const before = (await state()).coins;
  await action("点亮");
  assert.equal((await state()).lit[dam], true, `${dam}: visiting lights its crystal`);
  assert.equal((await state()).coins, before, "lighting a crystal is free");
}

async function returnHome() {
  await click("open-hall");
  await click("go-home");
}

async function sellAtMarket(dam, value, label) {
  const before = await state();
  const market = Discovery.MARKET_POS[dam];
  assert.ok(market, `${dam}: market coordinates are configured`);
  const marketSpot = await page.evaluate(point => {
    const world = window.__trial.getWorld(), spec = world.getSpec();
    for (let radius = 5; radius <= 11; radius += 2) {
      for (let step = 0; step < 24; step++) {
        const angle = step / 24 * Math.PI * 2;
        const x = point.x + Math.cos(angle) * radius, z = point.z + Math.sin(angle) * radius;
        if (spec.waters.every(zone => Math.hypot(x - zone.x, z - zone.z) > zone.r + 1)
          && spec.colliders.every(zone => Math.hypot(x - zone.x, z - zone.z) > zone.r + 1)) {
          world.debugSetPlayer(x, z);
          return { x, z };
        }
      }
    }
    return null;
  }, market);
  assert.ok(marketSpot, `${dam}: the market has a walkable selling position outside water and solid obstacles`);
  await page.waitForTimeout(150);
  await visual(`${label}-basket-ready`);
  if (label === "desktop-carrot") {
    const previousViewport = page.viewportSize();
    for (const viewport of [{ width: 320, height: 568 }, { width: 667, height: 375 }]) {
      await page.setViewportSize(viewport);
      await visual(`${label}-basket-${viewport.width}x${viewport.height}`);
    }
    await page.setViewportSize(previousViewport);
  }
  await action("摆摊卖货");
  assert.equal((await state()).coins, before.coins + value, "market sale pays the basket value exactly once");
  assert.deepEqual((await state()).home.basket, { carrot: 0, egg: 0, wool: 0, fur: 0 });
  assert.equal(await page.evaluate(() => window.__trial.getWorld().scene.getObjectByName("market:stall")?.visible), true,
    "successful sale displays the market stall");
  assert.equal(await page.evaluate(() => window.__trial.ui.getActionLabel().includes("摆摊卖货")), false,
    "an empty basket cannot be sold again");
  await page.waitForTimeout(150);
  assert.equal((await state()).coins, before.coins + value, "subsequent market updates do not pay again");
  await visual(`${label}-market-sold`);
  await page.evaluate(point => window.__trial.getWorld().debugSetPlayer(point.x + 20, point.z), market);
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => window.__trial.getWorld().scene.getObjectByName("market:stall")?.visible), false,
    "leaving the stall beyond 14 units hides it");
}

async function freshPage(label, date = fakeNow, viewport = { width: 390, height: 844 }) {
  const userDataDir = await mkdtemp(path.join(profileRoot, label + "-"));
  const opened = await chromium.launchPersistentContext(userDataDir, {
    executablePath, headless: true, viewport, deviceScaleFactor: 2,
    locale: "zh-CN", timezoneId: "Asia/Shanghai", downloadsPath: reportRoot,
    args: ["--disable-dev-shm-usage", "--disable-background-timer-throttling"],
  });
  contexts.push(opened);
  page = opened.pages()[0] || await opened.newPage();
  watchPage(page);
  await page.clock.setFixedTime(date);
  await page.goto(url, { waitUntil: "networkidle" });
  await wait(() => !!window.__trial);
  return { context: opened, userDataDir };
}

async function closeCurrentPageContext() {
  const current = page.context();
  await current.close();
  contexts.splice(contexts.indexOf(current), 1);
}

async function canvasLabels(font) {
  return page.evaluate(wantedFont => {
    const drawing = window.__trial.ui.canvas.getContext("2d"), original = drawing.fillText, labels = [];
    drawing.fillText = function (value, ...args) {
      if (!wantedFont || this.font === wantedFont) labels.push(String(value));
      return original.call(this, value, ...args);
    };
    try { window.__trial.ui.draw(); } finally { drawing.fillText = original; }
    return labels;
  }, font);
}

async function albumNote(id, expectedNote, label) {
  const before = await state(), rendered = [];
  await click(id);
  for (let index = 0; index < 20; index++) {
    const labels = await canvasLabels();
    const marker = labels.indexOf("已收录 · 手记");
    assert.ok(marker >= 0, "the note detail heading is rendered");
    rendered.push(...labels.slice(marker + 1).filter(value => value !== "‹" && value !== "›" && !/^\d+\s*\/\s*\d+$/.test(value)));
    await visual(`${label}-note-${index + 1}`);
    const next = await page.evaluate(() => window.__trial.ui.getHitRects().find(rect => rect.id === "album-detail-next"));
    if (!next?.enabled) break;
    await click("album-detail-next");
    if (index === 19) throw new Error("Album note pagination did not terminate");
  }
  assert.equal(rendered.join("").replace(/\s/g, ""), expectedNote.replace(/\s/g, ""), `${label}: the complete configured note is reachable`);
  assert.equal((await state()).coins, before.coins, "reading a note grants no coins");
  assert.deepEqual((await state()).album, before.album, "reading a note never manufactures discoveries");
  await click("album-back");
}

async function albumPages(label) {
  await click("open-hall");
  await click("album");
  assert.equal(await page.evaluate(() => window.__trial.ui.isAlbumOpen()), true);
  const gameState = await state(), lines = [];
  for (const [group, entries] of Object.entries(Discovery.ALBUM_CATALOG)) {
    lines.push(null);
    for (const item of entries) lines.push({ ...item, got: !!gameState.album[group][item.id], note: Discovery.ALBUM_NOTES[item.id] });
  }
  const captured = [];
  let verifiedNote = false;
  for (let index = 0; index < 20; index++) {
    const rendered = await canvasLabels();
    captured.push(...rendered);
    await visual(`${label}-page-${index + 1}`);
    const controls = await page.evaluate(() => window.__trial.ui.getHitRects().map(rect => rect.id));
    const noteButtons = controls.filter(id => id.startsWith("al:"));
    for (const id of noteButtons) assert.equal(lines[Number(id.slice(3))]?.got, true, "uncollected catalog entries cannot open notes");
    if (!verifiedNote && noteButtons.length) {
      const id = noteButtons[0];
      await albumNote(id, lines[Number(id.slice(3))].note, label);
      assert.deepEqual(await page.evaluate(() => window.__trial.ui.getHitRects().map(rect => rect.id)), controls,
        "returning from a note preserves the original album page and controls");
      verifiedNote = true;
    }
    const next = await page.evaluate(() => window.__trial.ui.getHitRects().find(rect => rect.id === "album-next"));
    if (!next?.enabled) break;
    await click("album-next");
    if (index === 19) throw new Error("Album pagination did not terminate");
  }
  const contents = captured.join("\n");
  for (const item of Object.values(Discovery.ALBUM_CATALOG).flat()) {
    assert.ok(contents.replace(/\s/g, "").includes(item.name.replace(/\s/g, "")), `${label}: catalog entry remains reachable: ${item.name}`);
  }
  assert.equal(verifiedNote, true, "a real discovered entry can be read as an album note");
  await click("album-close");
  await click("close");
  return captured.length;
}

async function validateTeleportPanel(label) {
  const geometry = await page.evaluate(() => {
    const targets = window.__trial.ui.getHitRects().filter(rect => rect.id.startsWith("tp:") || rect.id === "tp-cancel");
    return { ids: targets.map(rect => rect.id), overlaps: targets.some((a, i) => targets.some((b, j) => i !== j
      && a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y)) };
  });
  assert.equal(geometry.ids.filter(id => id.startsWith("tp:")).length, 4, "portal lists the other four destinations");
  assert.equal(geometry.overlaps, false, "portal options and cancel do not overlap");
  await visual(label);
}

async function measureMovementSpeed() {
  await page.evaluate(() => {
    const world = window.__trial.getWorld();
    window.__movementCheck = { start: world.getPlayerPos(), elapsed: 0, update: world.update };
    world.update = function (dt, time) {
      window.__movementCheck.elapsed += dt;
      return window.__movementCheck.update.call(this, dt, time);
    };
  });
  await page.keyboard.down("d");
  await page.waitForTimeout(900);
  await page.keyboard.up("d");
  return page.evaluate(() => {
    const world = window.__trial.getWorld(), sample = window.__movementCheck, end = world.getPlayerPos();
    world.update = sample.update;
    delete window.__movementCheck;
    const distance = Math.hypot(end.x - sample.start.x, end.z - sample.start.z);
    return { distance, elapsed: sample.elapsed, speed: distance / sample.elapsed };
  });
}

async function waterBarrier(label) {
  const water = await page.evaluate(() => {
    const world = window.__trial.getWorld(), spec = world.getSpec();
    const zone = spec.waters.find(candidate => {
      const x = candidate.x + candidate.r + 2, z = candidate.z;
      return Math.hypot(x / spec.bounds.rx, z / spec.bounds.rz) < 0.85
        && spec.waters.every(other => Math.hypot(x - other.x, z - other.z) >= other.r + 0.5)
        && (spec.colliders || []).every(other => Math.hypot(x - other.x, z - other.z) >= other.r + 1);
    });
    if (!zone) return null;
    world.debugSetPlayer(zone.x + zone.r + 2, zone.z);
    return zone;
  });
  assert.ok(water, `${label}: a reachable bank is available for collision testing`);
  await page.keyboard.down("a");
  await page.waitForTimeout(600);
  await page.keyboard.up("a");
  const collision = await page.evaluate(zone => {
    const world = window.__trial.getWorld(), position = world.getPlayerPos(), spec = world.getSpec();
    return { position, distance: Math.hypot(position.x - zone.x, position.z - zone.z),
      safe: spec.waters.every(other => Math.hypot(position.x - other.x, position.z - other.z) >= other.r - 1e-5) };
  }, water);
  assert.ok(collision.safe, `${label}: walking never enters a water collision circle`);
  assert.ok(collision.distance >= water.r - 1e-5, `${label}: bank stops inward movement`);
}

try {
  // Shift Date only for production/offline tests; RAF and meditation retain real foreground time.
  await page.clock.setFixedTime(fakeNow);
  await page.goto(url, { waitUntil: "networkidle" });
  await wait(() => !!window.__trial && document.querySelector("#status").hidden);
  assert.equal((await state()).coins, 1200);
  assert.deepEqual((await state()).lit, {}, "a genuinely new save starts with no lit crystals");
  await visual("desktop-courtyard");
  await page.evaluate(() => {
    window.__renderCount = 0;
    const original = window.__trial.game.render;
    window.__trial.game.render = function () { window.__renderCount++; return original.apply(this, arguments); };
    dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
  });
  await page.waitForTimeout(200);
  const hiddenFrames = await page.evaluate(() => window.__renderCount);
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => window.__renderCount), hiddenFrames);
  await page.evaluate(() => dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
  await page.waitForTimeout(250);
  assert.ok(await page.evaluate(() => window.__renderCount) > hiddenFrames + 2);
  check("persisted pagehide pauses frames and pageshow resumes the same game");

  await click("open-hall");
  await click("signin");
  assert.equal((await state()).coins, 1205);
  await click("signin");
  assert.equal((await state()).coins, 1205);
  check("signin adds 5 once; repeat tap does not duplicate reward");
  await click("jingxin");
  await page.waitForTimeout(1200);
  assert.equal((await state()).quests.jingxin, false);
  await page.evaluate(() => window.__trial.pause());
  await page.waitForTimeout(1200);
  assert.equal((await state()).quests.jingxin, false);
  await page.evaluate(() => window.__trial.resume());
  await wait(() => window.__trial.getState().quests.jingxin);
  check("meditation completes after foreground time and excludes a paused interval");
  await click("close");

  await scene(1);
  const petPoint = await page.evaluate(() => window.__trial.getWorld().debugTapPoints(innerWidth, innerHeight).find(point => point.type === "animal" && point.kind === "sheep"));
  await page.mouse.click(petPoint.x, petPoint.y);
  await wait(() => window.__trial.getState().quests.fed);
  const carrotPoint = await page.evaluate(() => window.__trial.getWorld().debugTapPoints(innerWidth, innerHeight).find(point => point.type === "bed" && point.crop === "carrot"));
  await page.mouse.click(carrotPoint.x, carrotPoint.y);
  await wait(() => window.__trial.getState().quests.harvest);
  assert.equal((await state()).coins, 1220);
  const animalStarts = await page.evaluate(() => {
    const values = {};
    window.__trial.getWorld().scene.traverse(object => { if (object.isGroup) values[object.uuid] = object.position.toArray(); });
    return values;
  });
  await page.waitForTimeout(2300);
  const moved = await page.evaluate(starts => {
    let count = 0;
    window.__trial.getWorld().scene.traverse(object => {
      const before = starts[object.uuid];
      if (before && Math.hypot(object.position.x - before[0], object.position.z - before[2]) > 0.1) count++;
    });
    return count;
  }, animalStarts);
  assert.ok(moved > 0, "pasture animal groups move in world coordinates");
  await visual("desktop-pasture");
  await click("open-hall");
  await click("quest");
  assert.equal((await state()).coins, 1260);
  await click("quest");
  assert.equal((await state()).coins, 1260);
  await click("close");
  check("pasture pet and carrot clicks update quests; animals move; quest reward is single-use");

  await scene(2);
  await page.evaluate(() => window.__trial.getWorld().debugSetPlayer(-37, -58));
  await advanceSeconds(2);
  await wait(() => window.__trial.getState().album.landmarks["ms-temple"]);
  await page.reload({ waitUntil: "networkidle" });
  await wait(() => !!window.__trial);
  assert.equal((await state()).album.landmarks["ms-temple"], true);
  await scene(2);
  check("approaching a real landmark records it once and reload preserves the album");
  const start = await page.evaluate(() => window.__trial.getWorld().getPlayerPos());
  await page.keyboard.down("d");
  await page.waitForTimeout(600);
  await page.keyboard.up("d");
  const afterKey = await page.evaluate(() => window.__trial.getWorld().getPlayerPos());
  assert.ok(Math.hypot(afterKey.x - start.x, afterKey.z - start.z) > 2, "WASD moves player");
  const joystick = await page.evaluate(() => window.__trial.ui.getJoystickGeometry());
  await page.mouse.move(joystick.x, joystick.y);
  await page.mouse.down();
  await page.mouse.move(joystick.x, joystick.y - joystick.radius * 0.8, { steps: 4 });
  await page.waitForTimeout(600);
  await page.mouse.up();
  const afterJoy = await page.evaluate(() => window.__trial.getWorld().getPlayerPos());
  assert.ok(Math.hypot(afterJoy.x - afterKey.x, afterJoy.z - afterKey.z) > 2, "joystick moves player");
  await page.waitForTimeout(200);
  const stopped = await page.evaluate(() => window.__trial.getWorld().getPlayerPos());
  assert.ok(Math.hypot(stopped.x - afterJoy.x, stopped.z - afterJoy.z) < 0.5, "release stops movement");
  check("keyboard and joystick move the player; releasing stops movement");
  await waterBarrier("mangshi");

  await page.evaluate(() => {
    const world = window.__trial.getWorld(), plot = world.getPlots()[0];
    world.debugSetPlayer(plot.x, plot.z);
  });
  await action("安家");
  assert.equal((await state()).coins, 860);
  assert.equal((await state()).home.plot, 0);
  await action("草棚");
  assert.equal((await state()).home.house, 1);
  await action("开");
  assert.equal((await state()).home.field, true);
  await action("种萝卜");
  assert.equal((await state()).coins, 788);
  assert.equal((await state()).home.beds.crop, "carrot");
  await advanceSeconds(61);
  await action("收获萝卜");
  assert.equal((await state()).coins, 788, "home harvest enters the basket without minting coins");
  assert.deepEqual((await state()).home.basket, { carrot: 8, egg: 0, wool: 0, fur: 0 });
  assert.equal((await state()).home.harvests, 1);
  await page.reload({ waitUntil: "networkidle" });
  await wait(() => !!window.__trial);
  assert.equal((await state()).coins, 788);
  assert.deepEqual((await state()).home.basket, { carrot: 8, egg: 0, wool: 0, fur: 0 }, "a nonempty basket survives reload");
  await scene(2);
  await sellAtMarket("mangshi", 120, "desktop-carrot");
  await returnHome();
  await action("鸡");
  await action("羊");
  await action("兔");
  let homeState = await state();
  assert.equal(homeState.coins, 328);
  assert.deepEqual(homeState.home.animals, { chicken: 1, rabbit: 1, sheep: 1 });
  await advanceSeconds(226);
  assert.equal(await page.evaluate(() => window.__trial.getWorld().scene.getObjectByName("home:harvest-basket")?.visible), true,
    "waiting animal produce appears as a physical harvest basket");
  await visual("desktop-harvest-basket");
  await action("出产");
  assert.equal((await state()).coins, 328, "collecting animal produce only fills the basket");
  assert.deepEqual((await state()).home.basket, { carrot: 0, egg: 3, wool: 3, fur: 3 });
  assert.equal(await page.evaluate(() => window.__trial.getWorld().scene.getObjectByName("home:harvest-basket")?.visible), false,
    "collecting all produce hides the physical harvest basket");
  await sellAtMarket("mangshi", 210, "desktop-produce");
  await returnHome();
  await action("竹楼");
  homeState = await state();
  assert.equal(homeState.coins, 38);
  assert.equal(homeState.home.house, 2);
  await visual("desktop-home-built");
  check("real actions complete home progression; crop and animal produce enter a persistent basket and sell at market once");

  await page.reload({ waitUntil: "networkidle" });
  await wait(() => !!window.__trial);
  const restored = await state();
  assert.deepEqual(restored.home, homeState.home);
  assert.equal(restored.coins, 38);
  await click("open-hall");
  await click("go-home");
  assert.equal(await active(), 2);
  const visualHome = await page.evaluate(() => {
    const home = window.__trial.getState().home;
    return window.__trial.getWorld().getPlots().find(plot => plot.site === home.site && plot.idx === home.plot);
  });
  assert.equal(visualHome.house, 2);
  assert.equal(visualHome.field, true);
  assert.deepEqual(visualHome.animals, { chicken: 1, rabbit: 1, sheep: 1 });
  check("reload restores balance, home, crops, animals and building visuals; go-home works");

  await lightCrystal("mangshi");
  for (const destination of [
    { id: "ruili", index: 3 }, { id: "yingjiang", index: 4 },
    { id: "longchuan", index: 5 }, { id: "lianghe", index: 6 },
  ]) {
    const beforeRoad = (await state()).coins;
    await action("传送");
    await click(`tp:road:${destination.id}`);
    assert.equal(await active(), destination.index);
    assert.equal((await state()).coins, beforeRoad, "the first road journey is free");
    assert.equal((await state()).lit[destination.id], undefined, "arriving requires physically lighting the destination crystal");
    await lightCrystal(destination.id);
    await action("传送");
    await click("tp:mangshi");
    assert.equal(await active(), 2);
    assert.equal((await state()).coins, beforeRoad - 0.5, "the return teleport charges 0.5");
    await approachCrystal();
  }
  assert.deepEqual((await state()).lit, { mangshi: true, ruili: true, yingjiang: true, longchuan: true, lianghe: true });
  check("new saves light crystals in person; four first road journeys are free and lit return trips cost 0.5");

  await page.evaluate(() => {
    const world = window.__trial.getWorld(), crystal = world.getCrystalPos();
    world.debugSetPlayer(crystal.x, crystal.z);
  });
  await action("传送");
  await validateTeleportPanel("desktop-portal-chooser");
  const portalStart = await page.evaluate(() => window.__trial.getWorld().getPlayerPos());
  await page.keyboard.down("d");
  await page.waitForTimeout(400);
  await page.keyboard.up("d");
  const portalEnd = await page.evaluate(() => window.__trial.getWorld().getPlayerPos());
  assert.deepEqual(portalEnd, portalStart, "movement is blocked behind teleport selector");
  await click("tp:ruili");
  assert.equal(await active(), 3);
  assert.equal((await state()).coins, 35.5);
  await visual("desktop-ruili");
  await approachCrystal();
  await action("传送");
  await click("tp:mangshi");
  assert.equal(await active(), 2);
  assert.equal((await state()).coins, 35);
  check("portal selector offers four destinations, blocks movement, and charges 0.5 per trip");

  for (const destination of [{ id: "yingjiang", index: 4 }, { id: "longchuan", index: 5 }, { id: "lianghe", index: 6 }]) {
    const balance = (await state()).coins;
    await page.evaluate(() => {
      const world = window.__trial.getWorld(), crystal = world.getCrystalPos();
      world.debugSetPlayer(crystal.x, crystal.z);
    });
    await action("传送");
    await click(`tp:${destination.id}`);
    assert.equal(await active(), destination.index);
    assert.equal((await state()).coins, balance - 0.5);
    await approachCrystal();
    await action("传送");
    await click("tp:mangshi");
    assert.equal(await active(), 2);
    assert.equal((await state()).coins, balance - 1);
  }
  check("all four destination routes and return trips use the visible selector and correct charge");

  for (const index of [4, 5, 6]) {
    await scene(index);
    await visual(`desktop-scene-${index}`);
  }

  for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 667, height: 375 }]) {
    await page.setViewportSize(viewport);
    const label = `${viewport.width}x${viewport.height}`;
    for (const index of [0, 1, 2, 3, 4, 5, 6]) {
      await scene(index);
      await visual(`${label}-scene-${index}`);
    }
    await click("open-hall");
    await visual(`${label}-hall`);
    const overlap = await page.evaluate(() => {
      const rows = window.__trial.ui.getHitRects().filter(rect => ["jingxin", "signin", "quest", "go-home", "close", "buy-horse", "horse-owned"].includes(rect.id));
      return rows.some((a, i) => rows.some((b, j) => i !== j && a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y));
    });
    assert.equal(overlap, false, `${label}: hall row controls do not overlap`);
    await click("close");
    await approachCrystal();
    await action("传送");
    await validateTeleportPanel(`${label}-portal-chooser`);
    await click("tp-cancel");
    if (viewport.width === 320 || viewport.height === 375) await albumPages(`${label}-album`);
  }
  check("all seven scenes, hall and four-destination selector fit desktop, portrait mobile, narrow mobile and landscape sizes");

  await page.setViewportSize({ width: 1280, height: 800 });
  await returnHome();
  await advanceSeconds(226);
  const beforeRestSale = (await state()).coins;
  await action("出产");
  assert.equal((await state()).coins, beforeRestSale);
  await sellAtMarket("mangshi", 210, "rest-funding");
  await returnHome();
  await action("种萝卜");
  const beforeRest = await state();
  await action("歇一歇");
  assert.equal(await page.evaluate(() => window.__trial.getWorld().isResting()), true);
  await page.waitForTimeout(1300);
  assert.ok(await page.evaluate(() => window.__trial.getWorld().scene.getObjectByName("player").position.y < -0.35),
    "resting visibly lowers the seated player");
  await visual("desktop-home-resting");
  const rested = await state();
  assert.equal(rested.coins, beforeRest.coins, "resting grants no coins");
  assert.deepEqual(rested.home.beds, beforeRest.home.beds, "resting never accelerates the crop timer");
  assert.deepEqual(rested.home.produce, beforeRest.home.produce, "resting never accelerates animal produce");
  assert.deepEqual(rested.quests, beforeRest.quests, "resting grants no quest reward");
  await action("起身");
  assert.equal(await page.evaluate(() => window.__trial.getWorld().isResting()), false);
  await action("歇一歇");
  await page.keyboard.down("d");
  await page.waitForTimeout(300);
  await page.keyboard.up("d");
  assert.equal(await page.evaluate(() => window.__trial.getWorld().isResting()), false, "movement automatically ends resting");
  assert.equal((await state()).coins, beforeRest.coins);
  check("physical harvest basket tracks pending produce; home resting changes pose, allows standing or walking away, and grants no economy benefit");
  await closeCurrentPageContext();

  // A separate untouched save proves that the horse can be bought with the real opening grant.
  const horseProfile = await mkdtemp(path.join(profileRoot, "horse-"));
  const horseContext = await chromium.launchPersistentContext(horseProfile, {
    executablePath, headless: true, viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2, locale: "zh-CN", timezoneId: "Asia/Shanghai", downloadsPath: reportRoot,
    args: ["--disable-dev-shm-usage", "--disable-background-timer-throttling"],
  });
  contexts.push(horseContext);
  page = horseContext.pages()[0] || await horseContext.newPage();
  watchPage(page);
  await page.clock.setFixedTime(fakeNow);
  await page.goto(url, { waitUntil: "networkidle" });
  await wait(() => !!window.__trial);
  assert.equal((await state()).coins, 1200);
  await scene(2);
  await page.evaluate(() => window.__trial.getWorld().debugSetPlayer(-100, 130));
  const walking = await measureMovementSpeed();
  assert.ok(walking.speed > 11 && walking.speed < 14, `walking is about 13 units/s (${walking.speed})`);
  await click("open-hall");
  await click("buy-horse");
  assert.equal((await state()).coins, 0);
  assert.equal((await state()).horse.owned, true);
  assert.equal(await page.evaluate(() => window.__trial.ui.getHitRects().some(rect => rect.id === "horse-owned")), true);
  await click("horse-owned");
  assert.equal((await state()).coins, 0);
  await click("close");
  await page.evaluate(() => {
    const world = window.__trial.getWorld(), horse = world.getHorsePos();
    world.debugSetPlayer(horse.x + 3, horse.z);
  });
  await action("喂马");
  assert.equal((await state()).horse.bond, 16);
  await action("刷马");
  assert.equal((await state()).horse.bond, 20);
  await action("上马");
  assert.equal(await page.evaluate(() => window.__trial.getWorld().isMounted()), true);
  const riding = await measureMovementSpeed();
  assert.ok(riding.speed > 28.5 && riding.speed < 32.5, `bond 20 mounted speed is about 31.2 units/s (${riding.speed})`);
  assert.ok(riding.speed / walking.speed > 2.1 && riding.speed / walking.speed < 2.6);
  results.movement = { walking, riding };
  await visual("desktop-horse-mounted");
  const horsePosition = await page.evaluate(() => window.__trial.getWorld().getHorsePos());
  await action("下马");
  assert.equal(await page.evaluate(() => window.__trial.getWorld().isMounted()), false);
  const horseSave = (await state()).horse;
  assert.equal(horseSave.x, horsePosition.x);
  assert.equal(horseSave.z, horsePosition.z);
  await page.reload({ waitUntil: "networkidle" });
  await wait(() => !!window.__trial);
  assert.deepEqual((await state()).horse, horseSave);
  assert.equal((await state()).coins, 0);
  await scene(2);
  const restoredHorse = await page.evaluate(() => ({ pos: window.__trial.getWorld().getHorsePos(), mounted: window.__trial.getWorld().isMounted() }));
  assert.deepEqual(restoredHorse.pos, { x: horseSave.x, z: horseSave.z });
  assert.equal(restoredHorse.mounted, false);
  check("fresh grant buys one horse for 1200; feed and brush raise bond to 20; mounted speed and dismount position persist");
  for (let day = 1; day <= 6; day++) {
    await advanceSeconds(86400);
    await page.evaluate(() => {
      const world = window.__trial.getWorld(), horse = world.getHorsePos();
      world.debugSetPlayer(horse.x + 3, horse.z);
    });
    await action("喂马");
    await action("刷马");
    assert.equal((await state()).horse.bond, 20 + day * 10);
    assert.equal((await state()).horse.careCount, 2);
    assert.equal(await page.evaluate(() => window.__trial.ui.getActionLabel().includes("上马")), true);
  }
  const followStart = await page.evaluate(() => {
    const world = window.__trial.getWorld(), horse = world.getHorsePos();
    world.debugSetPlayer(horse.x + 22, horse.z);
    return horse;
  });
  await page.waitForTimeout(1300);
  const followEnd = await page.evaluate(() => window.__trial.getWorld().getHorsePos());
  assert.ok(Math.hypot(followEnd.x - followStart.x, followEnd.z - followStart.z) > 1, "bond earned by daily care enables following");
  await scene(6);
  await click("open-hall");
  await click("call-horse");
  const called = (await state()).horse;
  assert.equal(called.dam, "lianghe");
  assert.equal(called.bond, 80);
  assert.equal((await state()).coins, 0, "care and call do not manufacture coins");
  assert.ok(await page.evaluate(() => {
    const world = window.__trial.getWorld(), horse = world.getHorsePos(), player = world.getPlayerPos();
    return horse && Math.hypot(horse.x - player.x, horse.z - player.z) < 12;
  }));
  await page.reload({ waitUntil: "networkidle" });
  await wait(() => !!window.__trial);
  assert.equal((await state()).horse.dam, "lianghe");
  assert.equal((await state()).horse.bond, 80);
  check("six consecutive care dates legitimately reach bond 80, unlock following and save a cross-dam horse call");
  await closeCurrentPageContext();

  const homeDams = [
    { id: "ruili", index: 3 }, { id: "yingjiang", index: 4 },
    { id: "longchuan", index: 5 }, { id: "lianghe", index: 6 },
  ];
  results.crossDamHomes = [];
  for (const destination of homeDams) {
    const damProfile = await mkdtemp(path.join(profileRoot, `home-${destination.id}-`));
    const damContext = await chromium.launchPersistentContext(damProfile, {
      executablePath, headless: true, viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2, locale: "zh-CN", timezoneId: "Asia/Shanghai", downloadsPath: reportRoot,
      args: ["--disable-dev-shm-usage", "--disable-background-timer-throttling"],
    });
    contexts.push(damContext);
    page = damContext.pages()[0] || await damContext.newPage();
    watchPage(page);
    await page.clock.setFixedTime(fakeNow);
    await page.goto(url, { waitUntil: "networkidle" });
    await wait(() => !!window.__trial);
    assert.equal((await state()).coins, 1200);
    await scene(destination.index);
    await page.evaluate(() => {
      const world = window.__trial.getWorld(), plot = world.getPlots()[0];
      const center = world.getSites()[plot.site];
      world.debugSetPlayer(center.x, center.z);
    });
    const beforeWalk = await page.evaluate(() => window.__trial.getWorld().getPlayerPos());
    await page.keyboard.down("d");
    await page.waitForTimeout(500);
    await page.keyboard.up("d");
    const afterWalk = await page.evaluate(() => window.__trial.getWorld().getPlayerPos());
    assert.ok(Math.hypot(afterWalk.x - beforeWalk.x, afterWalk.z - beforeWalk.z) > 1, `${destination.id}: keyboard walks`);
    const stick = await page.evaluate(() => window.__trial.ui.getJoystickGeometry());
    assert.equal(stick.visible, true);
    await page.mouse.move(stick.x, stick.y);
    await page.mouse.down();
    await page.mouse.move(stick.x, stick.y - stick.radius * 0.8, { steps: 4 });
    await page.waitForTimeout(500);
    await page.mouse.up();
    const afterStick = await page.evaluate(() => window.__trial.getWorld().getPlayerPos());
    assert.ok(Math.hypot(afterStick.x - afterWalk.x, afterStick.z - afterWalk.z) > 1, `${destination.id}: joystick walks`);
    await waterBarrier(destination.id);

    await page.evaluate(() => {
      const world = window.__trial.getWorld(), plot = world.getPlots()[0];
      world.debugSetPlayer(plot.x, plot.z);
    });
    await action("安家");
    assert.equal((await state()).coins, 800);
    assert.equal((await state()).home.dam, destination.id);
    await action("草棚");
    await action("开");
    const savedHome = (await state()).home;
    assert.equal(savedHome.house, 1);
    assert.equal(savedHome.field, true);
    await visual(`home-${destination.id}-claimed`);
    await scene(2);
    const differentDamPlot = await page.evaluate(() => window.__trial.getWorld().getPlots()[0]);
    assert.equal(differentDamPlot.claimed, false, "same plot number in another dam stays unclaimed");
    await click("open-hall");
    await click("go-home");
    assert.equal(await active(), destination.index);
    await page.reload({ waitUntil: "networkidle" });
    await wait(() => !!window.__trial);
    assert.deepEqual((await state()).home, savedHome);
    assert.equal((await state()).coins, 800);
    await click("open-hall");
    await click("go-home");
    assert.equal(await active(), destination.index);
    const restoredPlot = await page.evaluate(() => {
      const home = window.__trial.getState().home;
      return window.__trial.getWorld().getPlots().find(plot => plot.site === home.site && plot.idx === home.plot);
    });
    assert.equal(restoredPlot.house, 1);
    assert.equal(restoredPlot.field, true);
    await visual(`home-${destination.id}-restored`);
    await page.evaluate(() => {
      const key = Object.keys(localStorage).find(value => value.endsWith("anheli-minigame-v2:save"));
      if (!key) throw new Error("The current preview save key was not found");
      const envelope = JSON.parse(localStorage.getItem(key));
      delete envelope.state.lit;
      localStorage.setItem(key, JSON.stringify(envelope));
    });
    await page.reload({ waitUntil: "networkidle" });
    await wait(() => !!window.__trial);
    assert.deepEqual((await state()).lit, { mangshi: true, [destination.id]: true }, "a legitimate old home save migrates its existing home and origin crystals");
    assert.equal((await state()).coins, 800);
    await returnHome();
    await approachCrystal();
    await action("传送");
    await validateTeleportPanel(`home-${destination.id}-portal`);
    const behindStart = await page.evaluate(() => window.__trial.getWorld().getPlayerPos());
    await page.keyboard.down("d");
    await page.waitForTimeout(250);
    await page.keyboard.up("d");
    assert.deepEqual(await page.evaluate(() => window.__trial.getWorld().getPlayerPos()), behindStart);
    await click("tp:mangshi");
    assert.equal(await active(), 2);
    assert.equal((await state()).coins, 799.5);
    results.crossDamHomes.push({ dam: destination.id, profile: damProfile, savedHome });
    await damContext.close();
    contexts.pop();
  }
  check("five dams block water entry; four additional dams support homes, legacy crystal migration and paid return travel");

  await freshPage("custom-home");
  await scene(6);
  const customSpot = await page.evaluate(() => {
    const world = window.__trial.getWorld();
    for (let z = 100; z >= -140; z -= 10) {
      for (let x = -100; x <= 150; x += 10) {
        if (world.checkPlotSpot(x, z).ok) {
          world.debugSetPlayer(x, z);
          return { x, z };
        }
      }
    }
    return null;
  });
  assert.ok(customSpot, "a valid custom home site exists");
  await action("600");
  assert.equal((await state()).coins, 600);
  assert.equal((await state()).home.dam, "lianghe");
  assert.equal((await state()).home.site, -1);
  assert.equal((await state()).home.plot, -1);
  assert.deepEqual((await state()).home.custom, customSpot);
  await action("草棚");
  await action("开");
  await action("种萝卜");
  await advanceSeconds(61);
  await action("收获萝卜");
  assert.equal((await state()).coins, 528);
  assert.deepEqual((await state()).home.basket, { carrot: 8, egg: 0, wool: 0, fur: 0 });
  await sellAtMarket("lianghe", 120, "custom-home-carrot");
  const customSave = (await state()).home;
  assert.equal((await state()).coins, 648);
  await scene(2);
  await click("open-hall");
  await click("go-home");
  assert.equal(await active(), 6);
  await page.reload({ waitUntil: "networkidle" });
  await wait(() => !!window.__trial);
  assert.deepEqual((await state()).home, customSave);
  await click("open-hall");
  await click("go-home");
  assert.equal(await active(), 6);
  const customVisual = await page.evaluate(() => window.__trial.getWorld().getPlots().find(plot => plot.site === -1 && plot.idx === -1));
  assert.equal(customVisual.house, 1);
  assert.equal(customVisual.field, true);
  await visual("custom-home-restored");
  check("custom home costs 600 and supports construction, planting, harvest, cross-dam return and reload");
  await closeCurrentPageContext();

  results.festivals = [];
  for (const festival of Discovery.FESTIVALS) {
    const year = 2027;
    const stamp = new Date(Date.UTC(year, festival.from[0] - 1, festival.from[1], 4)).getTime();
    await freshPage(`festival-${festival.id}`, stamp);
    const index = festival.id === "munao" ? 5 : 2;
    await scene(index);
    const position = festival.id === "dengdeng"
      ? await page.evaluate(() => window.__trial.getWorld().getHallPos()) : festival.site;
    await page.evaluate(point => window.__trial.getWorld().debugSetPlayer(point.x, point.z), position);
    await page.waitForTimeout(150);
    assert.equal(await page.evaluate(id => window.__trial.getWorld().scene.getObjectByName(`festival:${id}`)?.visible, festival.id), true);
    const festiveMotion = await page.evaluate(id => {
      const group = window.__trial.getWorld().scene.getObjectByName(`festival:${id}`), data = {};
      group.traverse(object => { data[object.uuid] = [...object.position.toArray(), ...object.rotation.toArray().slice(0, 3)]; });
      return data;
    }, festival.id);
    await page.waitForTimeout(450);
    assert.ok(await page.evaluate(({ id, start }) => {
      let moved = false;
      window.__trial.getWorld().scene.getObjectByName(`festival:${id}`).traverse(object => {
        const before = start[object.uuid], values = [...object.position.toArray(), ...object.rotation.toArray().slice(0, 3)];
        if (before && values.some((value, i) => Math.abs(value - before[i]) > 0.01)) moved = true;
      });
      return moved;
    }, { id: festival.id, start: festiveMotion }));
    await action(festival.id === "munao" ? "纵歌" : festival.id === "songkran" ? "泼水" : "点灯");
    assert.equal((await state()).coins, 1230);
    assert.equal((await state()).festJoined[festival.id], year);
    assert.equal((await state()).album.festivals[festival.id], true);
    if (festival.id === "songkran") {
      await action("泼一捧水");
      assert.equal(await page.evaluate(() => window.__trial.getWorld().scene.getObjectByName("festival:player-splash")?.visible), true);
      await visual("festival-songkran-splash");
      await page.waitForTimeout(900);
      assert.equal(await page.evaluate(() => window.__trial.getWorld().scene.getObjectByName("festival:player-splash")?.visible), false);
      await action("泼一捧水");
      assert.equal(await page.evaluate(() => window.__trial.getWorld().scene.getObjectByName("festival:player-splash")?.visible), true);
    } else if (festival.id === "munao") {
      await action("绕场一圈");
      assert.equal(await page.evaluate(() => window.__trial.getWorld().isDancing()), true);
      const danceStart = await page.evaluate(() => window.__trial.getWorld().getPlayerPos());
      await page.waitForTimeout(800);
      const danceStep = await page.evaluate(() => window.__trial.getWorld().getPlayerPos());
      assert.ok(Math.hypot(danceStep.x - danceStart.x, danceStep.z - danceStart.z) > 1, "joining the dance moves the player around the actual dance ground");
      await visual("festival-munao-dancing");
      await page.keyboard.down("d");
      await page.waitForTimeout(150);
      await page.keyboard.up("d");
      assert.equal(await page.evaluate(() => window.__trial.getWorld().isDancing()), false, "movement interrupts the dance");
      await page.evaluate(point => window.__trial.getWorld().debugSetPlayer(point.x, point.z), position);
      await action("绕场一圈");
      await page.evaluate(() => window.__trial.pause());
      assert.equal(await page.evaluate(() => window.__trial.getWorld().isDancing()), false, "pausing the game stops dancing");
      await page.evaluate(() => window.__trial.resume());
      await page.evaluate(point => window.__trial.getWorld().debugSetPlayer(point.x, point.z), position);
      await action("绕场一圈");
      await scene(6);
      await scene(index);
      assert.equal(await page.evaluate(() => window.__trial.getWorld().isDancing()), false, "changing scenes stops the previous dance");
      await page.evaluate(point => window.__trial.getWorld().debugSetPlayer(point.x, point.z), position);
      await action("绕场一圈");
      await page.waitForFunction(() => !window.__trial.getWorld().isDancing(), undefined, { timeout: 30000 });
    } else {
      for (let count = 0; count < 7; count++) await action("再放一盏心灯");
      const lanterns = await page.evaluate(() => {
        const pool = window.__trial.getWorld().scene.getObjectByName("festival:player-lanterns");
        return { count: pool.children.length, visible: pool.children.filter(child => child.visible).length };
      });
      assert.equal(lanterns.count, 5, "repeated lantern release reuses a bounded five-lantern pool");
      assert.ok(lanterns.visible > 0 && lanterns.visible <= 5);
      await visual("festival-dengdeng-lanterns");
      await page.waitForTimeout(6800);
      assert.equal(await page.evaluate(() => window.__trial.getWorld().scene.getObjectByName("festival:player-lanterns").children.some(child => child.visible)), false);
    }
    assert.equal((await state()).coins, 1230, "repeated festival play cannot duplicate the annual reward");
    await visual(`festival-${festival.id}-joined`);
    const afterWindow = new Date(Date.UTC(year, festival.to[0] - 1, festival.to[1] + 1, 4)).getTime();
    await page.clock.setFixedTime(afterWindow);
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(id => window.__trial.getWorld().scene.getObjectByName(`festival:${id}`)?.visible, festival.id), false);
    await page.reload({ waitUntil: "networkidle" });
    await wait(() => !!window.__trial);
    assert.equal((await state()).coins, 1230);
    assert.equal((await state()).album.festivals[festival.id], true);
    results.festivals.push({ id: festival.id, date: new Date(stamp).toISOString(), reward: 30, noRepeat: true, expiredWithoutSwitch: true });
    await closeCurrentPageContext();
  }
  check("three calendar festivals pay 30 once; repeat splash, dance and lantern play is free, animated and expires with the date window");

  let rainyDate;
  for (let day = 1; day <= 31; day++) {
    const candidate = Date.UTC(2028, 0, day, 4);
    if (Sky.computeSky(candidate).rain) { rainyDate = candidate; break; }
  }
  assert.ok(rainyDate, "a real rainy date exists in the configured daily weather seed");
  const nightDate = rainyDate + 11 * 60 * 60 * 1000;
  await freshPage("sky", rainyDate, { width: 1280, height: 800 });
  const openingSkyState = await state();
  results.sky = { rainDate: new Date(rainyDate).toISOString(), nightDate: new Date(nightDate).toISOString(), scenes: [] };
  for (const index of [0, 1, 2, 3, 4, 5, 6]) {
    await page.clock.setFixedTime(rainyDate);
    await scene((index + 1) % 7);
    await scene(index);
    await page.waitForTimeout(150);
    const dayLight = await page.evaluate(() => {
      const scene = window.__trial.getWorld().scene;
      return { hemi: scene.children.find(child => child.isHemisphereLight)?.intensity,
        sun: scene.children.find(child => child.isDirectionalLight)?.intensity };
    });
    const expectedDay = Sky.computeSky(rainyDate);
    assert.ok(Math.abs(dayLight.hemi - expectedDay.hemi) < 1e-6);
    assert.ok(Math.abs(dayLight.sun - expectedDay.sun) < 1e-6);
    await visual(`sky-rain-scene-${index}`);
    if (index >= 2) {
      const drops = await page.evaluate(() => {
        let result;
        window.__trial.getWorld().scene.traverse(object => {
          if (object.isLineSegments && object.geometry?.attributes?.position?.count === 300) {
            result = { uuid: object.uuid, values: Array.from(object.geometry.attributes.position.array.slice(0, 24)), visible: object.visible && object.parent.visible };
          }
        });
        return result;
      });
      assert.ok(drops?.visible, "rain geometry is visible on a seeded rain date");
      await page.waitForTimeout(350);
      const changedDrops = await page.evaluate(previous => {
        const object = window.__trial.getWorld().scene.getObjectByProperty("uuid", previous.uuid);
        return previous.values.some((value, i) => value !== object.geometry.attributes.position.array[i]);
      }, drops);
      assert.equal(changedDrops, true, "raindrop vertices animate");
    }
    await page.clock.setFixedTime(nightDate);
    await page.waitForTimeout(200);
    const nightLight = await page.evaluate(() => {
      const scene = window.__trial.getWorld().scene;
      return { hemi: scene.children.find(child => child.isHemisphereLight)?.intensity,
        sun: scene.children.find(child => child.isDirectionalLight)?.intensity };
    });
    const expectedNight = Sky.computeSky(nightDate);
    assert.ok(Math.abs(nightLight.hemi - expectedNight.hemi) < 1e-6);
    assert.ok(Math.abs(nightLight.sun - expectedNight.sun) < 1e-6);
    assert.ok(nightLight.hemi < dayLight.hemi);
    await visual(`sky-night-scene-${index}`);
    if (index >= 2) {
      const nightMotion = await page.evaluate(() => {
        const group = window.__trial.getWorld().scene.getObjectByName("sky:fireflies");
        return { visible: group?.visible, opacity: group?.children[0]?.material.opacity,
          rotation: group?.rotation.toArray().slice(0, 3), childRotation: group?.children[0]?.rotation.toArray().slice(0, 3) };
      });
      assert.ok(nightMotion.visible && nightMotion.opacity > 0, "night fireflies are visible");
      await page.waitForTimeout(400);
      assert.ok(await page.evaluate(before => {
        const group = window.__trial.getWorld().scene.getObjectByName("sky:fireflies");
        return Math.abs(group.children[0].material.opacity - before.opacity) > 1e-5
          || group.rotation.toArray().slice(0, 3).some((value, i) => Math.abs(value - before.rotation[i]) > 1e-5)
          || group.children[0].rotation.toArray().slice(0, 3).some((value, i) => Math.abs(value - before.childRotation[i]) > 1e-5);
      }, nightMotion), "night fireflies breathe or rotate");
    }
    results.sky.scenes.push({ index, dayLight, nightLight });
  }
  assert.equal((await state()).coins, openingSkyState.coins);
  assert.equal((await state()).home, null);
  assert.equal((await state()).horse, null);
  check("seven scenes follow real date-based rain and night lighting; rain animates and atmosphere leaves economy unchanged");
  assert.deepEqual(results.errors, [], "browser has no JavaScript or console errors");
  results.ok = true;
} catch (error) {
  results.ok = false;
  results.failure = { message: error.message, stack: error.stack };
  try {
    results.failure.runtime = await page.evaluate(() => ({
      active: window.__trial?.getActive(), state: window.__trial?.getState(),
      action: window.__trial?.ui.getActionLabel(), controls: window.__trial?.ui.getHitRects(),
      player: window.__trial?.getWorld().getPlayerPos?.(),
    }));
  } catch {}
  try { await page.screenshot({ path: path.join(reportRoot, "failure.png") }); } catch {}
  throw error;
} finally {
  results.finishedAt = new Date().toISOString();
  await writeFile(path.join(reportRoot, "result.json"), JSON.stringify(results, null, 2));
  for (const opened of contexts) await opened.close();
}
