import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

const children = [];
let exiting = false;
const stop = code => {
  if (exiting) return;
  exiting = true;
  for (const child of children) child.kill();
  process.exitCode = code;
};
const run = (file, args = [], env = {}) => {
  const child = spawn(process.execPath, [file, ...args], {
    stdio: "inherit", windowsHide: true, env: { ...process.env, ...env },
  });
  children.push(child);
  child.on("error", error => { console.error(error.message); stop(1); });
  child.on("exit", code => { if (!exiting) stop(code || 0); });
};
if (!existsSync("node_modules/vite/bin/vite.js")) throw new Error("Run npm ci first");
run("service/server.mjs", [], {
  ANHELI_ALLOWED_ORIGINS: "http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:4173,http://localhost:4173,http://127.0.0.1:4183",
});
run("node_modules/vite/bin/vite.js", ["--host", "127.0.0.1", "--port", "5173", "--strictPort"]);
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
