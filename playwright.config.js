import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";

const installedChrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (existsSync(installedChrome) ? installedChrome : undefined);

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.js",
  fullyParallel: false,
  workers: 1,
  timeout: 90000,
  expect: { timeout: 15000 },
  outputDir: "./reports/playwright-results",
  reporter: [["list"], ["html", { outputFolder: "./reports/playwright-report", open: "never" }]],
  webServer: [
    { command: "node service/server.mjs", url: "http://127.0.0.1:4107/health", reuseExistingServer: !process.env.CI, env: { ANHELI_ALLOWED_ORIGINS: "http://127.0.0.1:4173,http://localhost:4173,http://127.0.0.1:4183", ANHELI_TRUST_PROXY: "1" } },
    { command: "npm run preview", url: "http://127.0.0.1:4173", reuseExistingServer: !process.env.CI },
    { command: "node integration/serve-check.mjs", url: "http://127.0.0.1:4183/integration-check", reuseExistingServer: !process.env.CI },
  ],
  use: {
    baseURL: "http://127.0.0.1:4173",
    viewport: { width: 1440, height: 900 },
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
    launchOptions: {
      executablePath,
      args: ["--disable-dev-shm-usage"],
    },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});
