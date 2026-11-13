import { test, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { applyFarmAction, createFarm, FARM_KEY } from "../src/farm-state.js";

test("riverside landscape stays visible and interactive across desktop and mobile", async ({ page }) => {
  test.setTimeout(110000);
  const label = process.env.ANHELI_CAPTURE_LABEL === "before-muse" ? "before-muse" : "merged-muse";
  let seed = createFarm();
  seed.coins = 15000;
  for (const plot of seed.plots) {
    seed = applyFarmAction(seed, { type: "buyPlot", plotId: plot.id }).state;
    for (const type of ["sheep", "rabbit", "chicken"]) seed = applyFarmAction(seed, { type: "buyAnimal", plotId: plot.id, animalType: type }).state;
  }
  await page.addInitScript(({ key, seed }) => localStorage.setItem(key, JSON.stringify(seed)), { key: FARM_KEY, seed });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  const scene = () => page.locator("canvas[data-courtyard-canvas]").evaluate(canvas => JSON.parse(canvas.dataset.state || "{}"));
  await page.goto("/");
  await expect(page.locator("main")).toHaveAttribute("data-ready", "true");
  await page.getByRole("button", { name: /^溪山牧场/ }).first().click();
  await page.getByTestId("plot-river-east").getByRole("button", { name: "去看看" }).click();
  await expect.poll(async () => (await scene()).area, { timeout: 35000 }).toBe("farm");
  await expect.poll(async () => (await scene()).target, { timeout: 35000 }).toBeNull();
  await expect.poll(async () => (await scene()).farm?.animalCount).toBe(12);
  const result = {};
  for (const [size, viewport] of [["desktop", { width: 1440, height: 900 }], ["mobile", { width: 390, height: 844 }]]) {
    await page.setViewportSize(viewport);
    const frames = (await scene()).renderedFrames;
    await expect.poll(async () => (await scene()).renderedFrames).toBeGreaterThan(frames + 30);
    const current = await scene();
    const pixels = await page.evaluate(async () => {
      const canvas = document.querySelector("canvas[data-courtyard-canvas]");
      const bitmap = await createImageBitmap(canvas);
      const sample = document.createElement("canvas");
      sample.width = 100; sample.height = 80;
      const context = sample.getContext("2d");
      context.drawImage(bitmap, 0, 0, 100, 80); bitmap.close();
      const colors = new Set(); let low = 255, high = 0;
      const data = context.getImageData(0, 0, 100, 80).data;
      for (let index = 0; index < data.length; index += 4) {
        const light = (data[index] + data[index + 1] + data[index + 2]) / 3;
        low = Math.min(low, light); high = Math.max(high, light);
        colors.add(`${data[index] >> 4}:${data[index + 1] >> 4}:${data[index + 2] >> 4}`);
      }
      return { colors: colors.size, range: high - low, overflow: document.documentElement.scrollWidth > innerWidth };
    });
    expect(pixels.colors).toBeGreaterThan(40);
    expect(pixels.range).toBeGreaterThan(90);
    expect(pixels.overflow).toBe(false);
    expect(current.farm.animals.every(animal => {
      const plot = current.farm.plots.find(item => item.id === animal.plotId);
      return Math.abs(animal.x - plot.x) < 11 && Math.abs(animal.z - plot.z) < 6;
    })).toBe(true);
    result[size] = { drawCalls: current.drawCalls, triangles: current.triangles, ...pixels };
    await page.screenshot({ path: resolve(`reports/${label}-riverside-${size}.png`) });
  }
  if (label === "merged-muse") {
    const baseline = await readFile(resolve("reports/before-muse-landscape.json"), "utf8").then(JSON.parse).catch(() => null);
    if (baseline) for (const size of ["desktop", "mobile"]) {
      expect(result[size].drawCalls).toBeLessThan(baseline[size].drawCalls * 1.3);
      expect(result[size].triangles).toBeLessThan(baseline[size].triangles * 1.3);
    }
  }
  await writeFile(resolve(`reports/${label}-landscape.json`), JSON.stringify(result, null, 2));
  expect(errors).toEqual([]);
});
