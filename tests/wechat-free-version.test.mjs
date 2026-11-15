import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const Economy = require("../wechat/vendor/preview-economy.cjs");
const { MONETIZATION } = await import("../src/economy-config.js");

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

// 免费版定版（用户 2026-11-15 拍板“先做免费版本”）：首发无充值。
// 本文件钉死三件事：版本开关关闭、微信运行时无充值/支付入口与文案、
// 网页端唯一的充值按钮受同一开关控制而不渲染。

test("free version: monetization switch is off on both runtimes", () => {
  assert.equal(Economy.monetization.rechargeEnabled, false);
  assert.equal(MONETIZATION.rechargeEnabled, false);
});

// 不含裸词 recharge：版本开关的标识符就叫 rechargeEnabled，那是关闭入口的控制本身。
const FORBIDDEN = ["充值", "支付", "内购", "requestPayment", "topUp", "top-up", "top_up"];

function runtimeFiles() {
  const files = [];
  const wechatDir = path.join(root, "wechat");
  for (const name of readdirSync(wechatDir)) {
    if (name.endsWith(".js")) files.push(path.join(wechatDir, name));
  }
  for (const name of readdirSync(path.join(wechatDir, "platform"))) {
    if (name.endsWith(".js")) files.push(path.join(wechatDir, "platform", name));
  }
  for (const name of readdirSync(path.join(wechatDir, "vendor"))) {
    // threejs-miniprogram.cjs 是第三方引擎包，不含业务文案，不在清查范围。
    if (name.endsWith(".cjs") && name !== "threejs-miniprogram.cjs") files.push(path.join(wechatDir, "vendor", name));
  }
  return files;
}

// 只查玩家可能看到的字符串与代码标识符，不查注释（配置注释里会写明“无充值版”等说明）。
const stripComments = source => source
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .filter(line => !line.trimStart().startsWith("//"))
  .join("\n");

test("free version: wechat runtime ships no recharge/payment entry or copy", () => {
  const offenders = [];
  for (const file of runtimeFiles()) {
    const source = stripComments(readFileSync(file, "utf8"));
    for (const word of FORBIDDEN) {
      if (source.includes(word)) offenders.push(`${path.relative(root, file)} contains ${JSON.stringify(word)}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test("free version: web recharge button is gated by the monetization switch", () => {
  const panel = readFileSync(path.join(root, "src", "WorldPanel.jsx"), "utf8");
  assert.ok(panel.includes("MONETIZATION.rechargeEnabled"), "WorldPanel must consult the switch");
  const buttonAt = panel.indexOf("world-recharge");
  assert.ok(buttonAt > 0, "recharge button markup still exists for a future paid version");
  const guardAt = panel.lastIndexOf("MONETIZATION.rechargeEnabled", buttonAt);
  assert.ok(guardAt > 0 && guardAt < buttonAt, "recharge button must render only when the switch is on");
});

test("free version: free-player income constants the launch account relies on", () => {
  // 与 docs/MUSE_FREE_VERSION_20261115.md 的免费玩家收支账同源，改数先改账。
  assert.equal(Economy.registrationGrant, 1000);
  assert.equal(Economy.plotPrice, 400);
  assert.equal(Economy.signinCoins, 5);
  assert.equal(Economy.questReward, 40);
  assert.deepEqual({ ...Economy.milestones }, { 3: 60, 7: 150, 15: 350, 25: 700 });
  assert.equal(Economy.HOME.BAMBOO_PRICE, 500);
  assert.equal(Economy.HOME.HORSE_PRICE, 1200);
  assert.equal(Economy.HOME.ANIMAL_PRICE.chicken, 140);
});
