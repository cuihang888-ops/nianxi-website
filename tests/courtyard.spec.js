import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const report = {};
const path = name => resolve("reports", name);
const state = page => page.locator("canvas[data-courtyard-canvas]").evaluate(canvas => JSON.parse(canvas.dataset.state || "{}"));
const closeModal = page => page.getByRole("button", { name: "关闭", exact: true }).click();

async function boot(page, url = "/") {
  const errors = [];
  const missing = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) missing.push(`${response.status()} ${response.url()}`); });
  await page.goto(url);
  await expect(page.locator("main")).toHaveAttribute("data-ready", "true");
  await expect(page.locator("main")).toHaveAttribute("data-online", "connected");
  await expect.poll(async () => (await state(page)).renderedFrames || 0).toBeGreaterThan(2);
  return { errors, missing };
}

async function checkCanvas(page, filename) {
  const canvas = page.locator("canvas[data-courtyard-canvas]");
  await canvas.screenshot({ path: path(filename) });
  const data = await page.evaluate(async () => {
    const canvas = document.querySelector("canvas[data-courtyard-canvas]");
    const bitmap = await createImageBitmap(canvas);
    const sample = document.createElement("canvas");
    sample.width = 96; sample.height = 64;
    const context = sample.getContext("2d");
    context.drawImage(bitmap, 0, 0, 96, 64);
    bitmap.close();
    const pixels = context.getImageData(0, 0, 96, 64).data;
    const colors = new Set();
    let low = 255, high = 0, dark = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const light = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
      low = Math.min(low, light); high = Math.max(high, light);
      if (light < 150) dark++;
      colors.add(`${pixels[i] >> 4}:${pixels[i + 1] >> 4}:${pixels[i + 2] >> 4}`);
    }
    return { colors: colors.size, range: high - low, darkPixels: dark, total: pixels.length / 4 };
  });
  expect(data.colors).toBeGreaterThan(40);
  expect(data.range).toBeGreaterThan(90);
  expect(data.darkPixels / data.total).toBeGreaterThan(.05);
  return data;
}

async function layout(page) {
  return page.evaluate(() => {
    const rect = element => {
      const box = element.getBoundingClientRect();
      return { x: box.x, y: box.y, w: box.width, h: box.height, right: box.right, bottom: box.bottom };
    };
    const overlap = (a, b) => a.x < b.right && a.right > b.x && a.y < b.bottom && a.bottom > b.y;
    const dock = rect(document.querySelector(".action-dock"));
    const name = rect(document.querySelector(".bottom-left"));
    const mall = rect(document.querySelector(".mall-link"));
    return {
      overflow: document.documentElement.scrollWidth > innerWidth,
      dock, name, mall,
      overlaps: overlap(dock, name) || overlap(dock, mall) || overlap(name, mall),
      buttons: [...document.querySelectorAll(".action-dock button")].every(button => button.scrollWidth <= button.clientWidth + 1),
    };
  });
}

test("courtyard renders, preserves the calendar, and synchronizes two real visitors", async ({ browser }) => {
  const firstContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: "Asia/Shanghai" });
  const first = await firstContext.newPage();
  const firstLog = await boot(first);
  report.desktopCanvas = await checkCanvas(first, "desktop-canvas.png");
  report.desktopScene = await state(first);
  await first.screenshot({ path: path("desktop-courtyard.png") });
  report.desktopLayout = await layout(first);
  expect(report.desktopLayout.overlaps).toBe(false);
  expect(report.desktopLayout.overflow).toBe(false);
  expect(Object.values(report.desktopScene.paths).every(Boolean)).toBe(true);
  const frameStart = report.desktopScene.renderedFrames;
  await expect.poll(async () => (await state(first)).renderedFrames).toBeGreaterThan(frameStart + 4);

  await first.getByRole("button", { name: "木鱼", exact: true }).click();
  await first.getByRole("button", { name: "归零", exact: true }).click();
  await first.getByRole("button", { name: "敲一下木鱼", exact: true }).click();
  await expect(first.getByTestId("woodfish-count")).toHaveText("1");
  await first.getByRole("button", { name: "自动敲击", exact: true }).click();
  await expect.poll(async () => Number(await first.getByTestId("woodfish-count").textContent())).toBeGreaterThan(1);
  await first.getByRole("button", { name: "暂停", exact: true }).click();
  const fishCount = Number(await first.getByTestId("woodfish-count").textContent());
  await closeModal(first);
  await first.reload();
  await expect(first.locator("main")).toHaveAttribute("data-ready", "true");
  await expect(first.locator("main")).toHaveAttribute("data-online", "connected");
  await first.getByRole("button", { name: "木鱼", exact: true }).click();
  await expect(first.getByTestId("woodfish-count")).toHaveText(String(fishCount));
  await closeModal(first);

  await first.getByRole("button", { name: "拨珠", exact: true }).click();
  await first.getByRole("button", { name: "归零", exact: true }).click();
  await first.getByRole("button", { name: "拨珠", exact: true }).last().click();
  await expect(first.getByTestId("bead-count")).toHaveText("1");
  const ring = await first.locator(".bead-ring").boundingBox();
  await first.mouse.move(ring.x + 60, ring.y + 135);
  await first.mouse.down();
  await first.mouse.move(ring.x + 200, ring.y + 135, { steps: 12 });
  await first.mouse.up();
  await expect.poll(async () => Number(await first.getByTestId("bead-count").textContent())).toBeGreaterThan(1);
  await closeModal(first);

  await first.getByRole("button", { name: "静坐", exact: true }).click();
  await first.getByRole("button", { name: "3 分钟", exact: true }).click();
  await first.getByRole("button", { name: "开始静坐", exact: true }).click();
  await expect(first.locator("main")).toHaveAttribute("data-action", "sit");
  await expect(first.locator(".breathing strong")).not.toHaveText("03:00");
  await first.getByRole("button", { name: "自动礼拜", exact: true }).click();
  await expect.poll(async () => Number(await first.getByTestId("bow-count").textContent())).toBeGreaterThan(0);
  await first.getByRole("button", { name: "停一停", exact: true }).click();
  await expect(first.locator("main")).toHaveAttribute("data-action", "idle");
  await first.keyboard.press("Shift+Tab");
  expect(await first.locator('[role="dialog"]').evaluate(dialog => dialog.contains(document.activeElement))).toBe(true);
  await closeModal(first);

  await first.getByRole("button", { name: "庭院地图", exact: true }).click();
  await first.getByRole("button", { name: "静心堂 静坐 · 礼拜" }).click();
  await expect.poll(async () => (await state(first)).target).toBe("hall");
  await first.getByRole("button", { name: "万年历", exact: true }).click();
  const calendar = first.frameLocator("iframe.calendar-frame");
  await expect(calendar.locator("#compass")).toBeVisible();
  await expect(calendar.locator("#loading")).toHaveCount(0);
  await calendar.getByLabel("选择公历日期", { exact: true }).fill("2000-02-29");
  await calendar.getByRole("button", { name: "查看", exact: true }).click();
  await expect(calendar.locator("#dateInput")).toHaveValue("2000-02-29");
  await expect(calendar.locator("#civilDate")).toContainText("2000");
  await calendar.locator("#motionBtn").click();
  await expect(calendar.locator("#motionBtn")).toHaveAttribute("aria-pressed", "true");
  await calendar.getByLabel("罗盘缩放", { exact: true }).fill("150");
  await expect(calendar.locator("#zoomValue")).toHaveText("150%");
  await calendar.locator("#detailsBtn").click();
  await expect(calendar.locator(".ring-item")).toHaveCount(42);
  await calendar.getByRole("button", { name: "关闭圈层目录" }).click();
  await calendar.locator("#todayBtn").click();
  await expect(calendar.locator("#modeFoot")).toHaveText("实时模式");
  await expect.poll(async () => (await state(first)).target, { timeout: 25000 }).toBeNull();
  await expect(first.getByRole("dialog", { name: "玄枢万年历", exact: true })).toBeVisible();
  await expect(first.locator("iframe.calendar-frame")).toHaveAttribute("allowfullscreen", "");
  await first.screenshot({ path: path("calendar-preserved.png") });
  await closeModal(first);

  const secondContext = await browser.newContext({ viewport: { width: 1100, height: 800 }, timezoneId: "Asia/Shanghai" });
  const second = await secondContext.newPage();
  const secondLog = await boot(second);
  await expect.poll(async () => (await state(first)).remoteVisitors).toBeGreaterThan(0);
  await expect.poll(async () => (await state(second)).remoteVisitors).toBeGreaterThan(0);
  const secondId = await second.locator("main").getAttribute("data-self");
  const firstId = await first.locator("main").getAttribute("data-self");
  const secondName = (await second.locator(".visitor-name").textContent()).trim();
  const firstName = (await first.locator(".visitor-name").textContent()).trim();
  expect(firstId).not.toBe(secondId);

  await first.getByRole("button", { name: "心灯", exact: true }).click();
  await first.getByRole("button", { name: "阖家和乐", exact: true }).click();
  await first.getByRole("button", { name: "挂上心灯", exact: true }).click();
  await second.getByRole("button", { name: "心灯", exact: true }).click();
  await expect(second.locator(".wish-list")).toContainText("阖家和乐");
  await closeModal(first);
  await closeModal(second);

  await second.getByRole("button", { name: "喝茶", exact: true }).click();
  await second.getByRole("button", { name: "为自己沏茶", exact: true }).click();
  await first.getByRole("button", { name: "同庭访客", exact: true }).click();
  await first.locator(".person").filter({ hasText: secondName }).getByRole("button", { name: "邀茶", exact: true }).click();
  await expect(second.getByRole("alertdialog", { name: "收到茶邀" })).toBeVisible();
  await second.getByRole("button", { name: "赴约", exact: true }).click();
  await expect(first.locator("main")).toHaveAttribute("data-action", "tea");
  await expect(second.locator("main")).toHaveAttribute("data-action", "tea");
  await expect(first.getByRole("status")).toContainText("共饮一盏茶");
  if (await first.getByRole("dialog").count()) await closeModal(first);

  await first.getByRole("button", { name: "庭院地图", exact: true }).click();
  await first.getByRole("button", { name: "听雨池 临水 · 歇脚" }).click();
  await expect.poll(async () => (await state(first)).target).toBe("pond");
  const beforeWalk = await state(second);
  await expect.poll(async () => (await state(first)).action, { timeout: 25000 }).toBe("sit");
  const arrived = await state(first);
  expect(Math.hypot(arrived.x - 12, arrived.z - 6)).toBeLessThan(1);
  await first.screenshot({ path: path("pond-arrival.png") });
  report.multiplayer = { identitiesDifferent: firstId !== secondId, remoteVisitors: beforeWalk.remoteVisitors, pondArrival: { x: arrived.x, z: arrived.z } };

  await first.getByRole("button", { name: /竹影庭/ }).click();
  await first.getByRole("button", { name: /莲风庭/ }).click();
  await expect(first.locator("main")).toHaveAttribute("data-room", "lotus");
  await first.getByRole("button", { name: "同庭访客", exact: true }).click();
  await expect(first.locator(".people-list")).not.toContainText(secondName);
  await second.getByRole("button", { name: "同庭访客", exact: true }).click();
  await expect(second.locator(".people-list")).not.toContainText(firstName);

  report.desktopErrors = firstLog;
  report.secondErrors = secondLog;
  await writeFile(path("ui-verification.json"), JSON.stringify(report, null, 2));
  expect(firstLog.errors).toEqual([]);
  expect(firstLog.missing).toEqual([]);
  expect(secondLog.errors).toEqual([]);
  expect(secondLog.missing).toEqual([]);
  await secondContext.close();
  await firstContext.close();
  await writeFile(path("ui-verification.json"), JSON.stringify(report, null, 2));
});

test("mobile scene remains framed and controls fit", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const log = await boot(page);
  report.mobileCanvas = await checkCanvas(page, "mobile-canvas.png");
  report.mobileScene = await state(page);
  report.mobileLayout = await layout(page);
  expect(report.mobileLayout.overlaps).toBe(false);
  expect(report.mobileLayout.overflow).toBe(false);
  expect(report.mobileLayout.buttons).toBe(true);
  await page.screenshot({ path: path("mobile-courtyard.png") });
  await page.getByRole("button", { name: "木鱼", exact: true }).tap();
  await page.getByRole("button", { name: "敲一下木鱼", exact: true }).tap();
  await expect(page.getByTestId("woodfish-count")).toHaveText("1");
  await closeModal(page);
  await page.getByRole("button", { name: "声音与时光", exact: true }).tap();
  await page.getByRole("switch", { name: "庭院声音", exact: true }).check();
  await page.getByRole("button", { name: "暮色", exact: true }).tap();
  await closeModal(page);
  await expect.poll(async () => (await state(page)).lightMode).toBe("dusk");
  await page.screenshot({ path: path("mobile-dusk.png") });
  await page.setViewportSize({ width: 320, height: 640 });
  report.smallLayout = await layout(page);
  expect(report.smallLayout.overflow).toBe(false);
  expect(report.smallLayout.overlaps).toBe(false);
  expect(report.smallLayout.buttons).toBe(true);
  await page.getByRole("button", { name: "万年历", exact: true }).tap();
  await expect(page.frameLocator("iframe.calendar-frame").locator("#compass")).toBeVisible();
  await page.screenshot({ path: path("mobile-calendar.png") });
  await closeModal(page);
  await page.getByRole("button", { name: "留影", exact: true }).tap();
  await expect(page.locator(".photo-view img")).toBeVisible();
  const photoSize = await page.locator(".photo-view img").evaluate(image => ({ w: image.naturalWidth, h: image.naturalHeight }));
  expect(photoSize.w).toBeGreaterThanOrEqual(320);
  expect(photoSize.h).toBeGreaterThanOrEqual(640);
  await closeModal(page);
  report.mobileErrors = log;
  await writeFile(path("ui-verification.json"), JSON.stringify(report, null, 2));
  expect(log.errors).toEqual([]);
  expect(log.missing).toEqual([]);
  await context.close();
  await writeFile(path("ui-verification.json"), JSON.stringify(report, null, 2));
});
