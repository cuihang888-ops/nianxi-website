import { test, expect } from "@playwright/test";
import { createFarm, FARM_KEY } from "../src/farm-state.js";
import { ECONOMY_TELEMETRY_KEY } from "../src/economy-telemetry.js";

const report = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), ECONOMY_TELEMETRY_KEY);

test("successful purchases record one daily sink after persistence", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("main")).toHaveAttribute("data-ready", "true");
  await page.getByRole("button", { name: /^溪山牧场/ }).first().click();
  await page.getByTestId("plot-meadow-west").getByRole("button").click();
  await expect(page.getByTestId("farm-coins")).toHaveText("800");
  const data = await report(page);
  const day = Object.values(data.days)[0];
  expect(day.logins).toBe(1);
  expect(day.sinks.land).toBe(400);
  expect(day.committedActions).toBe(1);
  expect(day.closingBalance).toBe(800);
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page.getByRole("button", { name: /^溪山牧场/ }).first().click();
  const afterRender = await report(page);
  expect(Object.values(afterRender.days)[0].logins).toBe(1);
  expect(Object.values(afterRender.days)[0].sinks.land).toBe(400);
});

test("unwritable farm actions do not produce successful economics events", async ({ page }) => {
  await page.addInitScript(({ farmKey, seed }) => {
    const original = Storage.prototype.setItem;
    original.call(localStorage, farmKey, JSON.stringify(seed));
    Storage.prototype.setItem = function (key, value) {
      if (key === farmKey) throw new DOMException("full", "QuotaExceededError");
      return original.call(this, key, value);
    };
  }, { farmKey: FARM_KEY, seed: createFarm(Date.now()) });
  await page.goto("/");
  await expect(page.locator("main")).toHaveAttribute("data-ready", "true");
  await page.getByRole("button", { name: /^溪山牧场/ }).first().click();
  await page.getByTestId("plot-meadow-west").getByRole("button").click();
  await expect(page.getByText("本次进度未保存", { exact: true })).toBeVisible();
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  const data = await report(page);
  expect(data.events.filter(event => event.type === "farm_action")).toHaveLength(0);
  expect(Object.values(data.days)[0].sinks.land).toBe(0);
  expect(Object.values(data.days)[0].closingBalance).toBe(1200);
});

test("a later successful farm save records every earlier pending purchase", async ({ page }) => {
  await page.addInitScript(({ farmKey, seed }) => {
    const original = Storage.prototype.setItem;
    original.call(localStorage, farmKey, JSON.stringify(seed));
    let failNextFarmWrite = true;
    Storage.prototype.setItem = function (key, value) {
      if (key === farmKey && failNextFarmWrite) {
        failNextFarmWrite = false;
        throw new DOMException("full", "QuotaExceededError");
      }
      return original.call(this, key, value);
    };
  }, { farmKey: FARM_KEY, seed: createFarm(Date.now()) });
  await page.goto("/");
  await expect(page.locator("main")).toHaveAttribute("data-ready", "true");
  await page.getByRole("button", { name: /^溪山牧场/ }).first().click();
  await page.getByTestId("plot-meadow-west").getByRole("button").click();
  await expect(page.getByText("本次进度未保存", { exact: true })).toBeVisible();
  expect((await report(page)).events.filter(event => event.type === "farm_action")).toHaveLength(0);
  await page.getByRole("button", { name: "领养小羊", exact: true }).click();
  await expect(page.getByTestId("farm-coins")).toHaveText("540");
  const day = Object.values((await report(page)).days)[0];
  expect(day.sinks.land).toBe(400);
  expect(day.sinks.animal).toBe(260);
  expect(day.committedActions).toBe(2);
  expect(day.closingBalance).toBe(540);
});

test("a later lifecycle pulse retries failed telemetry without replaying the game action", async ({ page }) => {
  await page.addInitScript(({ telemetryKey }) => {
    const original = Storage.prototype.setItem;
    window.blockTelemetry = false;
    Storage.prototype.setItem = function (key, value) {
      if (key === telemetryKey && window.blockTelemetry) throw new DOMException("full", "QuotaExceededError");
      return original.call(this, key, value);
    };
  }, { telemetryKey: ECONOMY_TELEMETRY_KEY });
  await page.goto("/");
  await expect(page.locator("main")).toHaveAttribute("data-ready", "true");
  await page.getByRole("button", { name: /^溪山牧场/ }).first().click();
  await page.evaluate(() => { window.blockTelemetry = true; });
  await page.getByTestId("plot-meadow-west").getByRole("button").click();
  await expect(page.getByTestId("farm-coins")).toHaveText("800");
  expect((await report(page)).events.filter(event => event.type === "farm_action")).toHaveLength(0);
  await page.evaluate(() => {
    window.blockTelemetry = false;
    document.dispatchEvent(new Event("visibilitychange"));
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const data = await report(page);
  expect(Object.values(data.days)[0].sinks.land).toBe(400);
  expect(data.events.filter(event => event.type === "farm_action")).toHaveLength(1);
  expect(data.failedWrites).toBeGreaterThan(0);
});
