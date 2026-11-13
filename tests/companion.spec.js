import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { FARM_KEY } from "../src/farm-state.js";
import { createFarm, applyFarmAction } from "../src/farm-state.js";

const animal = page => page.getByTestId("animal-animal-1");
const savedFarm = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), FARM_KEY);
const openCompanions = async page => {
  await page.getByRole("button", { name: /^溪山牧场/ }).first().click();
  await page.getByRole("tab", { name: "小伙伴", exact: true }).click();
};

test("companion names validate, persist, sync across tabs and fit narrow screens", async ({ page, context }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator("main")).toHaveAttribute("data-ready", "true");
  await page.getByRole("button", { name: /^溪山牧场/ }).first().click();
  await page.getByTestId("plot-meadow-west").getByRole("button").click();
  await page.getByRole("button", { name: "领养小羊", exact: true }).click();
  const before = await savedFarm(page);
  await animal(page).getByRole("button", { name: "修改小伙伴名字" }).click();
  const input = animal(page).getByRole("textbox", { name: "小伙伴名字" });
  await input.fill("正在取名");
  await input.dispatchEvent("keydown", { key: "Escape", code: "Escape", isComposing: true, bubbles: true });
  await expect(input).toHaveValue("正在取名");
  await expect(page.getByRole("dialog", { name: "溪山牧场", exact: true })).toBeVisible();
  await input.fill("   ");
  await animal(page).getByRole("button", { name: "保存名字" }).click();
  await expect(animal(page).getByRole("alert")).toBeVisible();
  expect((await savedFarm(page)).animals[0].name).toBe("小羊");
  await input.fill("  云朵  ");
  await input.press("Enter");
  await expect(animal(page).getByRole("heading", { name: "云朵", exact: true })).toBeVisible();
  const renamed = await savedFarm(page);
  expect(renamed.coins).toBe(before.coins);
  expect(renamed.animals[0]).toEqual({ ...before.animals[0], name: "云朵" });
  await page.screenshot({ path: resolve("reports/companion-desktop.png") });

  const second = await context.newPage();
  await second.goto("/");
  await expect(second.locator("main")).toHaveAttribute("data-ready", "true");
  await openCompanions(second);
  await expect(animal(second).getByRole("heading", { name: "云朵", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 740 });
  await animal(page).getByRole("button", { name: "修改小伙伴名字" }).click();
  await input.fill("山谷里慢慢长大的小云朵");
  await page.screenshot({ path: resolve("reports/companion-mobile-edit.png") });
  await animal(page).getByRole("button", { name: "保存名字" }).click();
  await expect(animal(second).getByRole("heading", { name: "山谷里慢慢长大的小云朵", exact: true })).toBeVisible();
  expect(await page.locator(".farm-panel").evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: resolve("reports/companion-mobile.png") });

  await animal(page).getByRole("button", { name: "修改小伙伴名字" }).click();
  await input.fill("没有保存的名字");
  await input.press("Escape");
  await expect(page.getByRole("dialog", { name: "溪山牧场", exact: true })).toBeVisible();
  await expect(animal(page).getByRole("button", { name: "修改小伙伴名字" })).toBeFocused();
  expect((await savedFarm(page)).animals[0].name).toBe("山谷里慢慢长大的小云朵");
  await page.reload();
  await expect(page.locator("main")).toHaveAttribute("data-ready", "true");
  await openCompanions(page);
  await expect(animal(page).getByRole("heading", { name: "山谷里慢慢长大的小云朵", exact: true })).toBeVisible();
  await second.close();
  expect(errors).toEqual([]);
});

test("companions pause, graze and respond to real canvas care on desktop and mobile", async ({ page }) => {
  test.setTimeout(100000);
  let seed = createFarm(Date.now());
  for (const action of [
    { type: "buyPlot", plotId: "meadow-west" },
    { type: "buyAnimal", plotId: "meadow-west", animalType: "sheep" },
    { type: "renameAnimal", animalId: "animal-1", name: "云朵" },
  ]) seed = applyFarmAction(seed, action).state;
  await page.addInitScript(({ seed, key }) => localStorage.setItem(key, JSON.stringify(seed)), { seed, key: FARM_KEY });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  const state = () => page.locator("canvas[data-courtyard-canvas]").evaluate(canvas => JSON.parse(canvas.dataset.state || "{}"));
  await page.goto("/");
  await expect(page.locator("main")).toHaveAttribute("data-ready", "true");
  await openCompanions(page);
  await page.getByRole("button", { name: "走进山谷", exact: true }).click();
  await expect.poll(async () => (await state()).area, { timeout: 25000 }).toBe("farm");
  await expect.poll(async () => (await state()).target, { timeout: 25000 }).toBeNull();
  await expect.poll(async () => (await state()).farm?.animals[0]?.motion, { timeout: 18000 }).toBe("grazing");
  const resting = (await state()).farm.animals[0];
  await page.waitForTimeout(1100);
  const still = (await state()).farm.animals[0];
  expect(Math.hypot(resting.x - still.x, resting.z - still.z)).toBeLessThan(.02);
  const canvas = page.locator("canvas[data-courtyard-canvas]");
  await canvas.click({ position: { x: still.screenX, y: still.screenY } });
  const care = page.getByRole("complementary", { name: "照顾小伙伴" });
  await expect(care.getByRole("heading", { name: "云朵", exact: true })).toBeVisible();
  await care.getByRole("button", { name: "摸摸", exact: true }).click();
  await expect.poll(async () => (await state()).farm.animals[0].motion).toBe("responding");
  await expect.poll(async () => {
    const responding = await state();
    const companion = responding.farm.animals[0];
    if (companion.motion !== "responding") return Number.POSITIVE_INFINITY;
    const targetHeading = Math.atan2(responding.x - companion.x, responding.z - companion.z);
    return Math.abs(Math.atan2(Math.sin(companion.heading - targetHeading), Math.cos(companion.heading - targetHeading)));
  }, { timeout: 3000, intervals: [50, 100, 150] }).toBeLessThan(.5);
  await page.screenshot({ path: resolve("reports/companion-care-desktop.png") });
  await expect.poll(async () => (await state()).farm.animals[0].motion, { timeout: 18000 }).toBe("walking");

  await page.setViewportSize({ width: 390, height: 844 });
  await care.getByRole("button", { name: "修改小伙伴名字" }).click();
  await care.getByRole("textbox", { name: "小伙伴名字" }).fill("山谷小云朵");
  await care.getByRole("button", { name: "保存名字" }).click();
  await expect(care.getByRole("heading", { name: "山谷小云朵", exact: true })).toBeVisible();
  expect(await care.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: resolve("reports/companion-care-mobile.png") });
  await page.evaluate(key => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (String(name) === key) throw new DOMException("Storage unavailable", "QuotaExceededError");
      return setItem.call(this, name, value);
    };
  }, FARM_KEY);
  await care.getByRole("button", { name: "修改小伙伴名字" }).click();
  await care.getByRole("textbox", { name: "小伙伴名字" }).fill("暂时的小名");
  await care.getByRole("button", { name: "保存名字" }).click();
  await expect(care.getByRole("heading", { name: "暂时的小名", exact: true })).toBeVisible();
  await expect(care.getByRole("alert")).toHaveText("本次进度未保存");
  expect((await savedFarm(page)).animals[0].name).toBe("山谷小云朵");
  expect(errors).toEqual([]);
});
