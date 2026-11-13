import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const integration = path.dirname(fileURLToPath(import.meta.url));
const courtyard = path.dirname(integration);
const project = path.resolve(integration, "../..");
const baseline = path.join(project, "nxmall-anheli-release-20261029/source");
const calendarPatch = path.join(project, "nxmall-anhe-calendar-20261104/patch");
const patch = path.join(integration, "patch");
const require = createRequire(path.join(baseline, "package.json"));
const ts = require("typescript");
const list = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry =>
  entry.isDirectory() ? list(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
const files = list(patch);
const overlay = new Map(files.map(filename => [path.join(baseline, path.relative(patch, filename)).toLowerCase(), filename]));
const config = ts.readConfigFile(path.join(baseline, "tsconfig.json"), ts.sys.readFile);
assert.equal(config.error, undefined, "baseline tsconfig must be readable");
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, baseline);
const host = ts.createCompilerHost({ ...parsed.options, incremental: false });
const readOriginal = host.readFile.bind(host);
const existsOriginal = host.fileExists.bind(host);
host.readFile = filename => readOriginal(overlay.get(path.resolve(filename).toLowerCase()) ?? filename);
host.fileExists = filename => overlay.has(path.resolve(filename).toLowerCase()) || existsOriginal(filename);
const directoryExists = host.directoryExists?.bind(host);
host.directoryExists = directory => files.some(filename =>
  path.join(baseline, path.relative(patch, filename)).toLowerCase().startsWith(path.resolve(directory).toLowerCase() + path.sep))
  || Boolean(directoryExists?.(directory));
const roots = files.filter(filename => /\.tsx?$/.test(filename)).map(filename => path.join(baseline, path.relative(patch, filename)));
const program = ts.createProgram(roots, { ...parsed.options, incremental: false }, host);
const diagnostics = ts.getPreEmitDiagnostics(program);
const patchErrors = diagnostics.filter(diagnostic =>
  diagnostic.category === ts.DiagnosticCategory.Error && diagnostic.file && overlay.has(path.resolve(diagnostic.file.fileName).toLowerCase()));
if (patchErrors.length) {
  console.error(ts.formatDiagnosticsWithColorAndContext(patchErrors, {
    getCurrentDirectory: () => baseline,
    getCanonicalFileName: filename => filename,
    getNewLine: () => "\n",
  }));
}
assert.equal(patchErrors.length, 0, "integration patch must type-check against the baseline");

const hrefSource = fs.readFileSync(path.join(patch, "lib/anhe/collection-href.ts"), "utf8")
  .replace('"./core.mjs"', JSON.stringify(pathToFileURL(path.join(baseline, "lib/anhe/core.mjs")).href));
const hrefJs = ts.transpileModule(hrefSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { collectionHref } = await import(`data:text/javascript;base64,${Buffer.from(hrefJs).toString("base64")}`);
assert.equal(collectionHref("zh"), "/zh/anheli/collection#goods");
assert.equal(collectionHref("en", { category: "beads", query: "tea", sort: "price-asc", page: 3 }),
  "/en/anheli/collection?category=beads&q=tea&sort=price-asc&page=3#goods");
assert.equal(collectionHref("invalid"), "/zh/anheli/collection#goods");
assert.equal(collectionHref("zh", { category: "beads", page: 3 }, { utm_source: "courtyard" }, { page: 1 }),
  "/zh/anheli/collection?utm_source=courtyard&category=beads#goods");

function evaluateTypeScript(filename, imports = {}) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const module = { exports: {} };
  const localRequire = specifier => {
    assert.ok(Object.hasOwn(imports, specifier), `unexpected import in metadata check: ${specifier}`);
    return imports[specifier];
  };
  new Function("exports", "require", "module", output)(module.exports, localRequire, module);
  return module.exports;
}
const { brand } = evaluateTypeScript(path.join(baseline, "lib/brand.ts"));
const { anheMetadata } = evaluateTypeScript(path.join(baseline, "lib/anhe/metadata.ts"), { "../brand": { brand } });
const core = await import(pathToFileURL(path.join(baseline, "lib/anhe/core.mjs")).href);
class RedirectResult extends Error {
  constructor(destination) { super(destination); this.destination = destination; }
}
const frameComponent = () => null;
const entryRoute = evaluateTypeScript(path.join(patch, "app/[locale]/anheli/page.tsx"), {
  "react/jsx-runtime": { jsx: (type, props) => ({ type, props }) },
  "next/navigation": {
    notFound() { throw new Error("not_found"); },
    redirect(destination) { throw new RedirectResult(destination); },
  },
  "../../../lib/i18n": { hasLocale: locale => ["zh", "en"].includes(locale) },
  "../../../lib/anhe/metadata": { anheMetadata },
  "../../../lib/anhe/core.mjs": core,
  "../../../lib/anhe/collection-href": { collectionHref },
  "../../../components/anhe/AnheCourtyardFrame": { default: frameComponent, __esModule: true },
});
for (const locale of ["zh", "en"]) {
  const params = Promise.resolve({ locale });
  const metadata = await entryRoute.generateMetadata({ params });
  const canonical = `${brand.origin}/${locale}/anheli`;
  assert.equal(metadata.alternates.canonical, canonical);
  assert.equal(metadata.openGraph.url, canonical);
  assert.equal(metadata.alternates.languages["zh-CN"], `${brand.origin}/zh/anheli`);
  assert.equal(metadata.alternates.languages.en, `${brand.origin}/en/anheli`);
  assert.ok(metadata.title.includes(locale === "zh" ? "安和里" : "Anhe Home"));
  assert.ok(metadata.description.length > 30);
  const rendered = await entryRoute.default({ params, searchParams: Promise.resolve({}) });
  assert.equal(rendered.type, frameComponent);
  assert.equal(rendered.props.locale, locale);
  await assert.rejects(entryRoute.default({ params, searchParams: Promise.resolve({ q: "tea" }) }),
    error => error instanceof RedirectResult && error.destination === `/${locale}/anheli/collection?q=tea#goods`);
}
await assert.rejects(entryRoute.generateMetadata({ params: Promise.resolve({ locale: "invalid" }) }), /not_found/);

const originalCalendar = path.join(calendarPatch, "public/images/anhe/calendar-20261104");
const copiedCalendar = path.join(courtyard, "public/calendar");
const calendarNames = list(originalCalendar).map(filename => path.relative(originalCalendar, filename)).sort();
const calendarHash = createHash("sha256");
function assertCalendarCopy(directory) {
  assert.deepEqual(list(directory).map(filename => path.relative(directory, filename)).sort(), calendarNames,
    "calendar copy must retain the exact file manifest");
  for (const relative of calendarNames) {
    const original = fs.readFileSync(path.join(originalCalendar, relative));
    const copied = fs.readFileSync(path.join(directory, relative));
    assert.equal(createHash("sha256").update(copied).digest("hex"), createHash("sha256").update(original).digest("hex"),
      `original calendar bytes must remain identical: ${relative}`);
  }
}
assertCalendarCopy(copiedCalendar);
for (const relative of calendarNames) {
  calendarHash.update(relative.replaceAll(path.sep, "/"));
  calendarHash.update("\0");
  calendarHash.update(fs.readFileSync(path.join(originalCalendar, relative)));
}
const builtCalendar = path.join(courtyard, "dist/calendar");
const builtCalendarChecked = fs.existsSync(builtCalendar);
if (builtCalendarChecked) assertCalendarCopy(builtCalendar);

const oldCatalogue = fs.readFileSync(path.join(baseline, "components/anhe/AnheCatalogue.tsx"), "utf8").replace(/\r\n/g, "\n");
const newCatalogue = fs.readFileSync(path.join(patch, "components/anhe/AnheCatalogue.tsx"), "utf8").replace(/\r\n/g, "\n");
const expectedCatalogue = oldCatalogue
  .replace("edits, catalogueHref, productTags", "edits, productTags")
  .replace('import ProductCard', 'import { collectionHref } from "../../lib/anhe/collection-href"\nimport ProductCard')
  .replaceAll("catalogueHref(", "collectionHref(")
  .replaceAll("/anheli#goods", "/anheli/collection#goods")
  .replaceAll("/anheli#culture", "/anheli/collection#culture");
assert.equal(newCatalogue, expectedCatalogue, "catalogue behavior must only change its collection navigation");

const oldPage = fs.readFileSync(path.join(calendarPatch, "app/[locale]/anheli/page.tsx"), "utf8");
const newPage = fs.readFileSync(path.join(patch, "app/[locale]/anheli/collection/page.tsx"), "utf8");
for (const section of ["intentionSection", "ritual", "culture", "gift", "about"]) {
  const extract = source => {
    const start = source.indexOf(`<section className={styles.${section}}`);
    const end = source.indexOf("</section>", start) + "</section>".length;
    assert.ok(start >= 0, `section ${section} missing`);
    return source.slice(start, end).replaceAll("catalogueHref(", "collectionHref(").replace(/\r\n/g, "\n");
  };
  assert.equal(extract(newPage), extract(oldPage), `existing ${section} content must be retained`);
}
assert.ok(!files.some(filename => /calendar[\\/]/i.test(path.relative(patch, filename))), "calendar files must remain outside the patch");
assert.ok(!files.some(filename => /app[\\/]globals|app[\\/]layout|components[\\/]layout/i.test(path.relative(patch, filename))), "global mall files must remain outside the patch");
console.log(JSON.stringify({
  status: "passed",
  patchFiles: files.length,
  patchTypeErrors: patchErrors.length,
  baselineDependencyDiagnostics: diagnostics.length - patchErrors.length,
  calendarFiles: calendarNames.length,
  calendarManifestSha256: calendarHash.digest("hex"),
  builtCalendarChecked,
  checks: ["virtual-overlay TypeScript", "collection navigation", "entry route and metadata", "catalogue limited diff", "preserved culture sections", "calendar SHA-256 identical", "calendar and global mall isolation"],
}, null, 2));
