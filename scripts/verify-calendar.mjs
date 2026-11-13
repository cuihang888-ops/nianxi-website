import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(path.join(root, "docs/calendar-manifest.json"), "utf8"));
const files = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry =>
  entry.isDirectory() ? files(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
for (const folder of ["public/calendar", "dist/calendar"]) {
  const directory = path.join(root, folder);
  if (!existsSync(directory)) continue;
  assert.equal(files(directory).length, manifest.length, `${folder}: unexpected file count`);
  for (const item of manifest) {
    const hash = createHash("sha256").update(readFileSync(path.join(directory, item.path))).digest("hex");
    assert.equal(hash, item.sha256, `${folder}/${item.path}: original calendar changed`);
  }
  console.log(`${folder}: ${manifest.length} original files verified`);
}
