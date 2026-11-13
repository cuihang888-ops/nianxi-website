import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const origin = "http://127.0.0.1:4183";
const nested = "/images/anhe/courtyard-20261113/";

test("nested deployment keeps assets, calendar and permitted parent navigation working", async ({ browser }) => {
  const results = [];
  for (const locale of ["zh", "en"]) {
    const mobile = locale === "en";
    const context = await browser.newContext({
      viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
      isMobile: mobile, hasTouch: mobile,
    });
    const page = await context.newPage();
    const errors = [], missing = [], assets = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    page.on("response", response => {
      const pathname = new URL(response.url()).pathname;
      if (response.status() >= 400) missing.push(`${response.status()} ${pathname}`);
      if (/\.(js|css|woff2|ico)$/.test(pathname) && pathname !== "/favicon.ico") assets.push(pathname);
    });
    await page.goto(`${origin}/integration-check?locale=${locale}`);
    const inner = page.frameLocator("#anheli-frame");
    await expect(inner.locator("main")).toHaveAttribute("data-ready", "true");
    await expect(inner.locator("main")).toHaveAttribute("data-online", "connected");
    const frame = page.frames().find(item => item.url().includes(`${nested}index.html`));
    expect(frame).toBeTruthy();
    const state = await inner.locator("canvas[data-courtyard-canvas]").evaluate(canvas => JSON.parse(canvas.dataset.state));
    expect(state.renderedFrames).toBeGreaterThan(0);
    expect(state.width).toBe(mobile ? 390 : 1440);
    await page.screenshot({ path: resolve("reports", `integration-${locale}.png`) });
    const fit = await frame.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > innerWidth,
      buttonsFit: [...document.querySelectorAll(".action-dock button")].every(button => button.scrollWidth <= button.clientWidth + 1),
    }));
    expect(fit).toEqual({ overflow: false, buttonsFit: true });

    await inner.getByRole("button", { name: locale === "zh" ? "万年历" : "Calendar", exact: true }).click();
    const calendar = inner.frameLocator("iframe.calendar-frame");
    await expect(calendar.locator("#compass")).toBeVisible();
    await expect(calendar.locator("#loading")).toHaveCount(0);
    await expect(inner.locator("iframe.calendar-frame")).toHaveAttribute("src", "./calendar/index.html");
    expect(page.frames().some(item => item.url() === `${origin}${nested}calendar/index.html`)).toBe(true);
    await inner.getByRole("button", { name: locale === "zh" ? "关闭" : "Close", exact: true }).click();

    const output = page.locator("#navigation-destination");
    await page.evaluate(() => window.postMessage({ type: "anheli:navigate", destination: "mall" }, location.origin));
    await frame.evaluate(() => parent.postMessage({ type: "anheli:navigate", destination: "https://example.com" }, location.origin));
    await frame.evaluate(() => parent.postMessage({ type: "anheli:navigate", destination: "__proto__" }, location.origin));
    await page.evaluate(() => window.dispatchEvent(new MessageEvent("message", {
      origin: "https://example.com",
      source: document.getElementById("anheli-frame").contentWindow,
      data: { type: "anheli:navigate", destination: "mall" },
    })));
    await expect(output).toHaveText("No navigation requested");
    await expect(output).not.toHaveAttribute("data-destination");

    await inner.getByRole("button", { name: locale === "zh" ? "安和里菜单" : "Anheli menu", exact: true }).click();
    await inner.getByRole("button", { name: locale === "zh" ? "东方好物" : "Meaningful objects", exact: true }).click();
    await expect(output).toHaveAttribute("data-destination", "collection");
    await expect(output).toHaveAttribute("data-path", `/${locale}/anheli/collection#goods`);
    await inner.getByRole("button", { name: locale === "zh" ? "返回年禧商城" : "Back to Nianxi", exact: true }).click();
    await expect(output).toHaveAttribute("data-destination", "mall");
    await expect(output).toHaveAttribute("data-path", `/${locale}`);
    expect(assets.some(item => item.endsWith(".js"))).toBe(true);
    expect(assets.some(item => item.endsWith(".css"))).toBe(true);
    expect(assets.some(item => item.endsWith(".woff2"))).toBe(true);
    expect(assets.every(item => item.startsWith(nested))).toBe(true);
    expect(errors).toEqual([]);
    expect(missing).toEqual([]);
    results.push({ locale, state, fit, assets: [...new Set(assets)], errors, missing });
    await context.close();
  }
  await writeFile(resolve("reports", "integration-ui-verification.json"), JSON.stringify(results, null, 2));
});
