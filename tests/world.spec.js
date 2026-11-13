import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { createFarm, applyFarmAction, FARM_KEY } from "../src/farm-state.js";

const stored = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), FARM_KEY);
const openWorld = async (page, english = false) => {
  await expect(page.locator("main")).toHaveAttribute("data-ready", "true");
  await page.getByRole("button", { name: english ? "Dehong world" : "德宏世界", exact: true }).click();
};

test("legacy companions survive settling, moving, horse purchase and sequential cross-tab updates", async ({ page, context }) => {
  let seed = { ...createFarm(), coins: 5000 };
  for (const action of [
    { type: "buyPlot", plotId: "meadow-west" },
    { type: "buyAnimal", plotId: "meadow-west", animalType: "sheep" },
    { type: "renameAnimal", animalId: "animal-1", name: "云朵" },
  ]) seed = applyFarmAction(seed, action).state;
  delete seed.world;
  await page.addInitScript(({ key, seed }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(seed)); }, { key: FARM_KEY, seed });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await openWorld(page);
  await expect(page.getByTestId("world-home")).toHaveText("还未安家");
  await page.getByTestId("world-region-yingjiang").click();
  await page.getByRole("radio", { name: "雨林草甸", exact: true }).check();
  await page.getByRole("button", { name: "安家在这里", exact: true }).click();
  await expect(page.getByTestId("world-home")).toHaveText("盈江 · 雨林草甸");
  await page.getByRole("button", { name: "领养马匹 480 安币", exact: true }).click();
  await page.getByRole("button", { name: "骑马", exact: true }).click();
  await page.getByRole("combobox", { name: "目的地区域" }).selectOption("ruili");
  await expect(page.getByTestId("world-route-duration")).toHaveText("游戏路程 9 分钟");
  await expect(page.getByRole("button", { name: "充值未开放", exact: true })).toBeDisabled();
  await expect(page.getByTestId("world-coins")).toHaveText(String(seed.coins - 480));
  await page.locator(".modal-content").evaluate(node => { node.scrollTop = 0; });
  await page.screenshot({ path: resolve("reports/dehong-world-desktop.png") });
  const first = await stored(page);
  expect(first.animals[0].name).toBe("云朵");
  expect(first.plots.map(plot => plot.owned)).toEqual(seed.plots.map(plot => plot.owned));
  expect(first.world.transport).toBe("horse");

  const second = await context.newPage();
  await second.goto("/");
  await openWorld(second);
  await expect(second.getByTestId("world-home")).toHaveText("盈江 · 雨林草甸");
  await second.getByTestId("world-region-mangshi").click();
  await second.getByRole("button", { name: "迁居到这里", exact: true }).click();
  await expect(page.getByTestId("world-home")).toHaveText("芒市 · 竹影水畔");
  expect((await stored(second)).coins).toBe(first.coins);
  expect((await stored(second)).animals[0].id).toBe(first.animals[0].id);
  await second.close();
  await page.reload();
  await openWorld(page);
  await expect(page.getByTestId("world-home")).toHaveText("芒市 · 竹影水畔");
  await expect(page.getByRole("button", { name: "骑马", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(errors).toEqual([]);
});

test("world map fits narrow screens in both languages and reports unsaved home changes", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");
  await openWorld(page);
  await expect(page.getByRole("button", { name: "骑马", exact: true })).toBeDisabled();
  await page.screenshot({ path: resolve("reports/dehong-world-mobile.png") });
  for (const english of [false, true]) {
    if (english) {
      await page.goto("/?locale=en");
      await openWorld(page, true);
    }
    const dialog = await page.getByRole("dialog").boundingBox();
    expect(dialog.x).toBeGreaterThanOrEqual(0);
    expect(dialog.x + dialog.width).toBeLessThanOrEqual(320);
    expect(dialog.y).toBeGreaterThanOrEqual(0);
    expect(dialog.y + dialog.height).toBeLessThanOrEqual(740);
    const bounds = await page.getByTestId("world-map").evaluate(node => {
      const atlas = node.getBoundingClientRect();
      const buttons = [...node.querySelectorAll("button")].map(button => {
        const rect = button.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, contentFits: button.scrollWidth <= button.clientWidth + 1 };
      });
      return { atlas: { left: atlas.left, right: atlas.right, top: atlas.top, bottom: atlas.bottom }, buttons };
    });
    for (const button of bounds.buttons) {
      expect(button.left).toBeGreaterThanOrEqual(bounds.atlas.left);
      expect(button.right).toBeLessThanOrEqual(bounds.atlas.right);
      expect(button.top).toBeGreaterThanOrEqual(bounds.atlas.top);
      expect(button.bottom).toBeLessThanOrEqual(bounds.atlas.bottom);
      expect(button.contentFits).toBe(true);
    }
    for (let first = 0; first < bounds.buttons.length; first++) {
      for (let second = first + 1; second < bounds.buttons.length; second++) {
        const a = bounds.buttons[first], b = bounds.buttons[second];
        expect(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top).toBe(true);
      }
    }
    expect(await page.locator(".modal-content").evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.goto("/");
  await openWorld(page);
  const before = await stored(page);
  await page.evaluate(key => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === key) throw new DOMException("Storage unavailable", "QuotaExceededError");
      return original.call(this, name, value);
    };
  }, FARM_KEY);
  await page.getByRole("button", { name: "安家在这里", exact: true }).click();
  await expect(page.getByTestId("world-home")).toHaveText("瑞丽 · 江风草场");
  await expect(page.getByRole("alert")).toHaveText("本次进度未保存");
  expect(await stored(page)).toEqual(before);
});
