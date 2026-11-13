import { build } from "esbuild";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile, realpath } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = await realpath(fileURLToPath(new URL("..", import.meta.url)));
if (process.platform === "win32" && !/^d:/i.test(root)) throw new Error("Trial outputs must stay on D:");
const outputName = process.env.ANHELI_TRIAL_OUTPUT || "minigame-trial";
if (!/^[a-z0-9-]+$/i.test(outputName)) throw new Error("Invalid trial output name");
const destination = path.join(root, "reports", outputName);
await mkdir(destination, { recursive: true });
await build({ entryPoints: [path.join(root, "preview/main.js")], outfile: path.join(destination, "game.js"), bundle: true, format: "iife", target: "es2022", sourcemap: false });
await writeFile(path.join(destination, "index.html"), await readFile(path.join(root, "preview/minigame.html")));
const files = new Map([["/", ["index.html", "text/html; charset=utf-8"]], ["/game.js", ["game.js", "text/javascript; charset=utf-8"]]]);
const server = createServer(async (request, response) => {
  const route = new URL(request.url, "http://127.0.0.1").pathname;
  if (route === "/favicon.ico") { response.writeHead(204); response.end(); return; }
  const file = files.get(route);
  if (!file || request.method !== "GET") { response.writeHead(404); response.end(); return; }
  try {
    const bytes = await readFile(path.join(destination, file[0]));
    response.writeHead(200, { "content-type": file[1], "cache-control": "no-store", "x-content-type-options": "nosniff" }); response.end(bytes);
  } catch { response.writeHead(500); response.end(); }
});
const port = Number(process.env.ANHELI_TRIAL_PORT || 5180);
server.listen(port, "127.0.0.1", () => console.log(`Anheli trial ready: http://127.0.0.1:${port}/`));
