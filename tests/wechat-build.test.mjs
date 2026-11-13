import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { buildWechat } from "../scripts/build-wechat.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporaryRoot = path.join(root, "reports", "wechat-build-tests");

async function fixture(t) {
  await fs.mkdir(temporaryRoot, { recursive: true });
  const directory = await fs.mkdtemp(path.join(temporaryRoot, "case-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await fs.mkdir(path.join(directory, "wechat"));
  await fs.writeFile(path.join(directory, "wechat", "game.js"), "import { value } from './value.js'; wx.record(value);\n");
  await fs.writeFile(path.join(directory, "wechat", "value.js"), "export const value = 42;\n");
  await fs.writeFile(path.join(directory, "wechat", "game.json"), JSON.stringify({ deviceOrientation: "portrait" }));
  await fs.writeFile(path.join(directory, "wechat", "project.config.json"), JSON.stringify({ compileType: "game", appid: "wx1234567890abcdef", setting: { urlCheck: false } }));
  return directory;
}

test("standalone bundle runs without a DOM or module loader, excludes private files, preserves web output", async t => {
  const projectRoot = await fixture(t);
  await fs.mkdir(path.join(projectRoot, "dist"));
  await fs.writeFile(path.join(projectRoot, "dist", "index.html"), "web build");
  await fs.writeFile(path.join(projectRoot, "wechat", "project.private.config.json"), "private");
  await fs.writeFile(path.join(projectRoot, "wechat", ".env"), "not for package");
  const report = await buildWechat({ projectRoot });
  assert.equal(report.files.length, 3);
  let actual;
  vm.runInNewContext(await fs.readFile(path.join(projectRoot, "dist", "wechat", "game.js"), "utf8"), { wx: { record: value => { actual = value; } } });
  assert.equal(actual, 42);
  assert.equal(await fs.readFile(path.join(projectRoot, "dist", "index.html"), "utf8"), "web build");
  const config = JSON.parse(await fs.readFile(path.join(projectRoot, "dist", "wechat", "project.config.json"), "utf8"));
  assert.equal(config.miniprogramRoot, "./");
  assert.equal(config.setting.urlCheck, true);
  await fs.mkdir(path.join(projectRoot, "wechat", "assets"));
  await fs.writeFile(path.join(projectRoot, "wechat", "assets", "manifest.json"), "{}");
  await buildWechat({ projectRoot });
  await fs.unlink(path.join(projectRoot, "wechat", "assets", "manifest.json"));
  await buildWechat({ projectRoot });
  assert.deepEqual((await fs.readdir(path.join(projectRoot, "dist", "wechat"))).sort(), ["game.js", "game.json", "project.config.json"]);
});

test("check-only and failed builds leave the existing output intact", async t => {
  const projectRoot = await fixture(t);
  await buildWechat({ projectRoot, checkOnly: true });
  await assert.rejects(fs.stat(path.join(projectRoot, "dist")), { code: "ENOENT" });
  await buildWechat({ projectRoot });
  const previous = await fs.readFile(path.join(projectRoot, "dist", "wechat", "game.js"));
  await assert.rejects(buildWechat({ projectRoot, maxPackageBytes: 1 }), /exceeds the project budget/);
  assert.deepEqual(await fs.readFile(path.join(projectRoot, "dist", "wechat", "game.js")), previous);
});

test("rejects server modules, Node builtins, DOM frameworks and credential strings", async t => {
  const projectRoot = await fixture(t);
  await fs.mkdir(path.join(projectRoot, "service"));
  await fs.writeFile(path.join(projectRoot, "service", "server.js"), "export const server = 1;");
  for (const [source, error] of [
    ["import fs from 'node:fs'; wx.record(fs);", /Node builtins/],
    ["import React from 'react'; wx.record(React);", /DOM\/framework/],
    ["import {server} from '../service/server.js'; wx.record(server);", /outside the client build boundary/],
    [`wx.record('${"ghp_" + "A".repeat(36)}');`, /Potential credential/],
  ]) {
    await fs.writeFile(path.join(projectRoot, "wechat", "game.js"), source);
    await assert.rejects(buildWechat({ projectRoot }), error);
  }
});

test("assets use an explicit allowlist and links cannot redirect build output", async t => {
  const projectRoot = await fixture(t);
  const assets = path.join(projectRoot, "wechat", "assets");
  await fs.mkdir(assets);
  await fs.writeFile(path.join(assets, "data.sql"), "not a game asset");
  await assert.rejects(buildWechat({ projectRoot }), /not allowlisted/);
  await fs.unlink(path.join(assets, "data.sql"));
  const linkedTarget = path.join(projectRoot, "other-output");
  await fs.mkdir(linkedTarget);
  await fs.mkdir(path.join(projectRoot, "dist"));
  await fs.symlink(linkedTarget, path.join(projectRoot, "dist", "wechat"), process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(buildWechat({ projectRoot }), /Links are not allowed/);
  await fs.unlink(path.join(projectRoot, "dist", "wechat"));
});
