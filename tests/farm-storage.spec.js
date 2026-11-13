import { test, expect } from "@playwright/test";
import { createFarm, FARM_KEY } from "../src/farm-state.js";

test("readable but unwritable farm storage keeps consecutive actions in memory", async ({ page }) => {
  const seed = createFarm(Date.now());
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(({ seed, key }) => {
    const originalSetItem = Storage.prototype.setItem;
    originalSetItem.call(localStorage, key, JSON.stringify(seed));
    Storage.prototype.setItem = function (name, value) {
      if (String(name) === key) throw new DOMException("Farm storage is read only", "QuotaExceededError");
      return originalSetItem.call(this, name, value);
    };
  }, { seed, key: FARM_KEY });

  await page.goto("/");
  await expect(page.locator("main")).toHaveAttribute("data-ready", "true");
  await page.getByRole("button", { name: /^溪山牧场/ }).first().click();
  await expect(page.getByTestId("farm-coins")).toHaveText("1200");

  await page.getByTestId("plot-meadow-west").getByRole("button").click();
  await expect(page.getByTestId("farm-coins")).toHaveText("800");
  await expect(page.getByText("本次进度未保存", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "领养小羊", exact: true }).click();
  await expect(page.getByTestId("farm-coins")).toHaveText("540");
  await expect(page.getByTestId("animal-animal-1").getByRole("heading", { name: /小羊/ })).toBeVisible();

  // An ordinary simulation tick must also keep the unsaved in-memory purchase.
  await expect.poll(() => page.locator("canvas[data-courtyard-canvas]").evaluate(canvas => {
    const state = JSON.parse(canvas.dataset.state || "{}");
    return state.farm?.animalCount;
  })).toBe(1);
  await page.waitForTimeout(1200);
  await expect(page.getByTestId("farm-coins")).toHaveText("540");
  await expect(page.getByTestId("animal-animal-1")).toBeVisible();
  await expect(page.getByText("本次进度未保存", { exact: true })).toBeVisible();

  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), FARM_KEY);
  expect(saved).toEqual(seed);
  expect(saved.animals).toHaveLength(0);
  expect(saved.plots.every(plot => !plot.owned)).toBe(true);
  expect(errors).toEqual([]);
});
