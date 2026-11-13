import { build } from "esbuild";
import { builtinModules } from "node:module";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ASSET_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".ktx2", ".basis", ".glb", ".gltf", ".bin", ".mp3", ".ogg", ".wav", ".json", ".ttf", ".woff", ".woff2", ".atlas"]);
const CODE_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".ts", ".json"]);
const VENDOR_LICENSE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*\.LICENSE$/;
const NODE_MODULES = new Set(builtinModules.flatMap(name => [name, `node:${name}`]));
const SECRET_PATTERN = /(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|AKIA[0-9A-Z]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|sk-[A-Za-z0-9]{30,})/;
const BLOCKED_NAMES = /(?:^|\/)(?:\.env(?:\..*)?|project\.private\.config\.json|[^/]+\.(?:key|pem|p12|pfx|db|sqlite\d*|sql|dump|zip|bak))$/i;
const posix = value => value.split(path.sep).join("/");
const hash = bytes => createHash("sha256").update(bytes).digest("hex");

function inside(root, filename) {
  const relative = path.relative(root, filename);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

async function noLinks(root, filename) {
  if (filename !== root && !inside(root, filename)) throw new Error("Path escapes the project workspace");
  let current = root;
  for (const part of ["", ...path.relative(root, filename).split(path.sep).filter(Boolean)]) {
    if (part) current = path.join(current, part);
    try {
      if ((await fs.lstat(current)).isSymbolicLink()) throw new Error(`Links are not allowed in build paths: ${posix(path.relative(root, current))}`);
    } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
}

async function filesUnder(root, directory) {
  await noLinks(root, directory);
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const filename = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Linked file is not allowed: ${posix(path.relative(root, filename))}`);
    if (entry.isDirectory()) files.push(...await filesUnder(root, filename));
    else if (entry.isFile()) files.push(filename);
    else throw new Error("Unsupported file type in build directory");
  }
  return files;
}

async function exists(filename) {
  try { await fs.lstat(filename); return true; } catch (error) { if (error.code === "ENOENT") return false; throw error; }
}

async function removeGenerated(root, directory, parent) {
  if (path.dirname(directory) !== parent || !inside(root, directory)) throw new Error("Refusing cleanup outside the generated build directory");
  await noLinks(root, directory);
  if (await exists(directory)) {
    await filesUnder(root, directory);
    await fs.rm(directory, { recursive: true });
  }
}

function inspectText(filename, bytes) {
  if (SECRET_PATTERN.test(bytes.toString("utf8"))) throw new Error(`Potential credential in build input: ${filename}`);
}

function packageName(importPath) {
  return importPath.startsWith("@") ? importPath.split("/").slice(0, 2).join("/") : importPath.split("/")[0];
}

function dependencyGuard(root) {
  return {
    name: "wechat-runtime-boundary",
    setup(bundler) {
      bundler.onResolve({ filter: /.*/ }, args => {
        if (NODE_MODULES.has(args.path) || args.path.startsWith("node:")) return { errors: [{ text: "Node builtins cannot run in the WeChat game bundle" }] };
        if (["react", "react-dom", "react-native", "vue", "next"].includes(packageName(args.path))) return { errors: [{ text: "DOM/framework imports must be replaced by a WeChat game renderer" }] };
        return null;
      });
      bundler.onLoad({ filter: /.*/ }, async args => {
        if (args.namespace !== "file") return null;
        await noLinks(root, args.path);
        const relative = posix(path.relative(root, args.path));
        if (!/^(?:wechat|src|node_modules)\//.test(relative) || BLOCKED_NAMES.test(relative)) throw new Error(`Module outside the client build boundary: ${relative}`);
        if (/(?:^|\/)node_modules\/(?:react|react-dom|react-native|vue|next)(?:\/|$)/.test(relative)) throw new Error(`DOM/framework module cannot run in the game bundle: ${relative}`);
        if (!CODE_EXTENSIONS.has(path.extname(args.path).toLowerCase())) throw new Error(`Unsupported client module: ${relative}`);
        inspectText(relative, await fs.readFile(args.path));
        return null;
      });
    },
  };
}

export async function buildWechat({ projectRoot = REPO_ROOT, checkOnly = false, maxPackageBytes = 4 * 1024 * 1024 } = {}) {
  const root = await fs.realpath(projectRoot);
  if (process.platform === "win32" && path.parse(root).root.toLowerCase() !== "d:\\") throw new Error("WeChat build outputs must remain on D:");
  if (!Number.isSafeInteger(maxPackageBytes) || maxPackageBytes < 1) throw new Error("Invalid package budget");
  const client = path.join(root, "wechat");
  const dist = path.join(root, "dist");
  const destination = path.join(dist, "wechat");
  const reportDirectory = path.join(root, "reports", "wechat");
  await noLinks(root, destination);
  await noLinks(root, reportDirectory);
  const readJson = async name => {
    const filename = path.join(client, name);
    await noLinks(root, filename);
    const bytes = await fs.readFile(filename);
    inspectText(name, bytes);
    return JSON.parse(bytes.toString("utf8"));
  };
  const game = await readJson("game.json");
  const sourceProject = await readJson("project.config.json");
  if (!game || typeof game !== "object" || Array.isArray(game)) throw new Error("Invalid game.json");
  if (["subPackages", "subpackages", "workers", "plugins"].some(key => Object.hasOwn(game, key))) throw new Error("This build supports a single game package; package extensions need an explicit asset manifest");
  if (sourceProject.compileType !== "game" || !/^wx[a-z0-9]{16}$/i.test(sourceProject.appid || "")) throw new Error("A registered WeChat game AppID and compileType game are required");
  const project = {
    description: "Anheli WeChat game build",
    compileType: "game", appid: sourceProject.appid,
    projectname: sourceProject.projectname || "anheli-wechat",
    miniprogramRoot: "./",
    setting: { urlCheck: true, es6: false, minified: false, uploadWithSourceMap: false },
    packOptions: { ignore: [], include: [] },
  };
  const bundle = await build({
    absWorkingDir: root, entryPoints: ["wechat/game.js"], outfile: "dist/wechat/game.js",
    bundle: true, platform: "neutral", format: "iife", target: "es2020", write: false,
    metafile: true, sourcemap: false, minify: false, legalComments: "inline", preserveSymlinks: true,
    logLevel: "silent", plugins: [dependencyGuard(root)],
  });
  for (const output of Object.values(bundle.metafile.outputs)) {
    if (output.imports.length) throw new Error("Unresolved runtime imports are not allowed in the game package");
  }
  const outputFiles = new Map([
    ["game.js", Buffer.from(bundle.outputFiles[0].contents)],
    ["game.json", Buffer.from(`${JSON.stringify(game, null, 2)}\n`)],
    ["project.config.json", Buffer.from(`${JSON.stringify(project, null, 2)}\n`)],
  ]);
  inspectText("game.js", outputFiles.get("game.js"));
  const assets = path.join(client, "assets");
  if (await exists(assets)) {
    for (const filename of await filesUnder(root, assets)) {
      const relative = posix(path.relative(client, filename));
      const ext = path.extname(filename).toLowerCase();
      if (BLOCKED_NAMES.test(relative) || !ASSET_EXTENSIONS.has(ext) || relative.split("/").some(part => part.startsWith("."))) throw new Error(`Asset is not allowlisted: ${relative}`);
      const bytes = await fs.readFile(filename);
      if ([".json", ".gltf", ".atlas"].includes(ext)) inspectText(relative, bytes);
      outputFiles.set(relative, bytes);
    }
  }
  const vendor = path.join(client, "vendor");
  if (await exists(vendor)) {
    await noLinks(root, vendor);
    // Vendor code is bundled by imports; only top-level license notices are copied.
    const entries = await fs.readdir(vendor, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (!VENDOR_LICENSE_NAME.test(entry.name)) continue;
      const filename = path.join(vendor, entry.name);
      await noLinks(root, filename);
      if (!entry.isFile()) throw new Error(`Vendor license must be a regular file: ${entry.name}`);
      const relative = `vendor/${entry.name}`;
      const bytes = await fs.readFile(filename);
      inspectText(relative, bytes);
      outputFiles.set(relative, bytes);
    }
  }
  const files = [...outputFiles].map(([name, bytes]) => ({ path: name, bytes: bytes.length, sha256: hash(bytes) }));
  const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
  if (totalBytes > maxPackageBytes) throw new Error(`Game package exceeds the project budget: ${totalBytes} > ${maxPackageBytes} bytes`);
  let baseline = null;
  try { baseline = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch {}
  const report = { version: 1, baseline, checkedAt: new Date().toISOString(), output: "dist/wechat", format: "iife", target: "es2020", maxPackageBytes, totalBytes, files, modules: Object.keys(bundle.metafile.inputs).sort() };
  if (checkOnly) return report;

  await fs.mkdir(dist, { recursive: true });
  const staging = await fs.mkdtemp(path.join(dist, ".wechat-build-"));
  const backup = `${staging}-previous`;
  let backedUp = false;
  try {
    for (const [name, bytes] of outputFiles) {
      const filename = path.join(staging, ...name.split("/"));
      await fs.mkdir(path.dirname(filename), { recursive: true });
      await fs.writeFile(filename, bytes);
    }
    if (await exists(destination)) {
      await filesUnder(root, destination);
      await fs.rename(destination, backup);
      backedUp = true;
    }
    try { await fs.rename(staging, destination); }
    catch (error) {
      if (backedUp) { await fs.rename(backup, destination); backedUp = false; }
      throw error;
    }
    if (backedUp) { await removeGenerated(root, backup, dist); backedUp = false; }
    await fs.mkdir(reportDirectory, { recursive: true });
    await fs.writeFile(path.join(reportDirectory, "build-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await removeGenerated(root, staging, dist);
  }
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.some(arg => arg !== "--check")) throw new Error("Usage: node scripts/build-wechat.mjs [--check]");
    const report = await buildWechat({ checkOnly: args.includes("--check") });
    console.log(`${args.includes("--check") ? "Checked" : "Built"} WeChat package: ${report.files.length} files, ${report.totalBytes} bytes, ${report.modules.length} modules`);
    if (!args.includes("--check")) console.log("Import dist/wechat in WeChat Developer Tools. This does not upload or publish the game.");
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
