import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createFarm, applyFarmAction, FARM_KEY } from "../src/farm-state.js";

const reports = {};
const scene = page => page.locator("canvas[data-courtyard-canvas]").evaluate(canvas => JSON.parse(canvas.dataset.state || "{}"));
const save = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), FARM_KEY);
const openFarm = page => page.getByRole("button", { name: /^溪山牧场/ }).first().click();
const close = page => page.getByRole("button", { name: "关闭", exact: true }).click();

async function boot(page) {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/");
  await expect(page.locator("main")).toHaveAttribute("data-ready", "true");
  return errors;
}

async function canvasSample(page) {
  return page.evaluate(async () => {
    const canvas = document.querySelector("canvas[data-courtyard-canvas]");
    const bitmap = await createImageBitmap(canvas);
    const sample = document.createElement("canvas"); sample.width = 100; sample.height = 70;
    const context = sample.getContext("2d"); context.drawImage(bitmap, 0, 0, 100, 70); bitmap.close();
    const pixels = context.getImageData(0, 0, 100, 70).data;
    const colors = new Set(); let low = 255, high = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const l = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
      low = Math.min(l, low); high = Math.max(l, high);
      colors.add(`${pixels[i] >> 4}:${pixels[i + 1] >> 4}:${pixels[i + 2] >> 4}`);
    }
    return { colors: colors.size, range: high - low };
  });
}

test("personal farm completes purchase, care, growing, trade, travel and reload", async ({ page, context }) => {
  test.setTimeout(150000);
  const errors = await boot(page);
  await openFarm(page);
  await expect(page.getByTestId("farm-coins")).toHaveText("1200");
  await page.getByTestId("plot-meadow-west").getByRole("button").click();
  await expect(page.getByTestId("farm-coins")).toHaveText("800");
  await page.getByRole("button", { name: "领养小羊", exact: true }).click();
  await expect(page.getByTestId("farm-coins")).toHaveText("540");
  const animal = page.getByTestId("animal-animal-1");
  await animal.getByRole("button", { name: "喂牧草", exact: true }).click();
  await animal.getByRole("button", { name: "摸摸", exact: true }).click();
  await expect(animal.getByRole("meter")).toHaveAttribute("value", "75");
  await page.getByRole("tab", { name: "种植", exact: true }).click();
  const bed = page.getByTestId("meadow-west-bed-1");
  await bed.getByRole("button", { name: /牧草/ }).click();
  await expect(bed.getByRole("button", { name: "采收", exact: true })).toBeDisabled();
  // Let the crop mature before watering to cover the late-water recovery path.
  await expect(bed.getByText("土有些干，补一点水")).toBeVisible({ timeout: 26000 });
  await bed.getByRole("button", { name: "浇水", exact: true }).click();
  await bed.getByRole("button", { name: "采收", exact: true }).click();
  await expect(bed.getByText("待播种", { exact: true })).toBeVisible();
  expect((await save(page)).inventory.grass).toBe(6);
  await page.getByRole("tab", { name: "小伙伴", exact: true }).click();
  await expect(animal.getByRole("button", { name: "收获", exact: true })).toBeEnabled({ timeout: 20000 });
  await animal.getByRole("button", { name: "收获", exact: true }).click();
  await page.getByRole("tab", { name: "收获篮", exact: true }).click();
  await expect(page.getByTestId("inventory-wool")).toHaveText("1");
  await page.locator(".farm-product").filter({ hasText: "羊毛" }).getByRole("button", { name: "售出" }).click();
  await expect(page.getByTestId("farm-coins")).toHaveText("560");
  await page.getByRole("button", { name: "每日补给", exact: true }).click();
  await expect(page.getByRole("button", { name: "今日已领", exact: true })).toBeDisabled();
  const stored = await save(page);
  await close(page);
  await page.reload();
  await expect(page.locator("main")).toHaveAttribute("data-ready", "true");
  await openFarm(page);
  await expect(page.getByTestId("farm-coins")).toHaveText(String(stored.coins));
  expect((await save(page)).animals).toHaveLength(1);

  // An idle second tab must not overwrite the first tab's newer farm actions.
  const second = await context.newPage();
  await boot(second);
  await openFarm(second);
  await page.getByRole("tab", { name: "小伙伴", exact: true }).click();
  await page.getByRole("button", { name: "领养兔子", exact: true }).click();
  await expect.poll(async () => (await save(second)).animals.length).toBe(2);
  await expect(second.getByTestId("farm-coins")).toHaveText(String(stored.coins - 180));
  await second.waitForTimeout(1200);
  expect((await save(page)).animals).toHaveLength(2);
  await second.close();

  await page.getByRole("button", { name: "走进山谷", exact: true }).click();
  await expect.poll(async () => (await scene(page)).target).toBe("farm:meadow-west");
  await expect.poll(async () => (await scene(page)).area, { timeout: 25000 }).toBe("farm");
  await expect.poll(async () => (await scene(page)).target, { timeout: 25000 }).toBeNull();
  reports.farmScene = await scene(page);
  expect(reports.farmScene.farm.animalCount).toBe(2);
  const animalsBefore = JSON.stringify(reports.farmScene.farm.animals);
  await expect.poll(async () => JSON.stringify((await scene(page)).farm.animals)).not.toBe(animalsBefore);
  reports.canvas = await canvasSample(page);
  expect(reports.canvas.colors).toBeGreaterThan(40);
  expect(reports.canvas.range).toBeGreaterThan(90);
  await page.screenshot({ path: resolve("reports/farm-desktop.png") });
  await page.getByRole("button", { name: "回到庭院", exact: true }).click();
  await expect.poll(async () => (await scene(page)).target).toBe("gate");
  await expect.poll(async () => (await scene(page)).target, { timeout: 25000 }).toBeNull();
  expect((await scene(page)).area).toBe("courtyard");
  await page.getByRole("button", { name: "万年历", exact: true }).click();
  await expect(page.frameLocator("iframe.calendar-frame").locator("#compass")).toBeVisible();
  reports.errors = errors;
  expect(errors).toEqual([]);
});

test("forest route and timed hunt award once, cool down, and sell", async ({ page }) => {
  test.setTimeout(120000);
  const errors = await boot(page);
  await page.getByRole("button", { name: "远山猎场", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "远山猎场", exact: true })).toBeVisible({ timeout: 45000 });
  reports.forestScene = await scene(page);
  expect(reports.forestScene.x).toBeGreaterThan(30);
  await page.getByTestId("hunt-begin").click();
  await page.waitForFunction(() => {
    const track = document.querySelector('[data-testid="hunt-timing-track"]');
    const p = Number(track?.dataset.position);
    return p > .45 && p < .51;
  });
  await page.getByTestId("hunt-shoot").click();
  await expect(page.getByTestId("hunt-result")).toContainText("这一箭命中");
  await expect(page.getByTestId("hunt-attempts")).toHaveText("1");
  await expect(page.getByTestId("hunt-successes")).toHaveText("1");
  await expect(page.getByTestId("hunt-begin")).toBeDisabled();
  expect((await save(page)).inventory.game).toBe(1);
  await page.screenshot({ path: resolve("reports/forest-hunt.png") });
  await close(page);
  await openFarm(page);
  await page.getByRole("tab", { name: "收获篮", exact: true }).click();
  await page.locator(".farm-product").filter({ hasText: "山野收获" }).getByRole("button", { name: "售出" }).click();
  await expect(page.getByTestId("farm-coins")).toHaveText("1245");
  expect((await save(page)).huntStats.attempts).toBe(1);
  expect(errors).toEqual([]);
});

test("mobile farm and forest panels fit and preserve saved animals", async ({ page }) => {
  let seed = createFarm(Date.now());
  for (const action of [{ type: "buyPlot", plotId: "meadow-west" }, { type: "buyAnimal", plotId: "meadow-west", animalType: "sheep" }, { type: "buyAnimal", plotId: "meadow-west", animalType: "rabbit" }, { type: "buyAnimal", plotId: "meadow-west", animalType: "chicken" }]) seed = applyFarmAction(seed, action, Date.now()).state;
  await page.addInitScript(({ seed, key }) => localStorage.setItem(key, JSON.stringify(seed)), { seed, key: FARM_KEY });
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = await boot(page);
  await openFarm(page);
  for (const tab of ["土地", "小伙伴", "种植", "收获篮"]) {
    await page.getByRole("tab", { name: tab, exact: true }).click();
    expect(await page.locator(".farm-panel").evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  }
  await page.getByRole("tab", { name: "小伙伴", exact: true }).click();
  await page.screenshot({ path: resolve("reports/farm-mobile-panel.png") });
  await page.getByRole("button", { name: "走进山谷", exact: true }).click();
  await expect.poll(async () => (await scene(page)).target).toBe("farm:meadow-west");
  await expect.poll(async () => (await scene(page)).target, { timeout: 25000 }).toBeNull();
  reports.mobileScene = await scene(page);
  expect(reports.mobileScene.area).toBe("farm");
  expect(reports.mobileScene.farm.animalCount).toBe(3);
  await page.screenshot({ path: resolve("reports/farm-mobile-world.png") });
  reports.mobileCanvas = await canvasSample(page);
  expect(reports.mobileCanvas.colors).toBeGreaterThan(40);
  await page.setViewportSize({ width: 320, height: 740 });
  await openFarm(page);
  await page.getByRole("tab", { name: "小伙伴", exact: true }).click();
  expect(await page.locator(".farm-panel").evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  reports.mobileNarrowOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  expect(reports.mobileNarrowOverflow).toBe(false);
  expect(errors).toEqual([]);
  await writeFile(resolve("reports/farm-ui-verification.json"), JSON.stringify(reports, null, 2));
});
