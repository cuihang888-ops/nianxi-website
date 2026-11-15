import test from "node:test";
import assert from "node:assert/strict";
import { link, mkdir, mkdtemp, readFile, realpath, rm, symlink, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { Worker } from "node:worker_threads";
import { createWorldStore, WorldStoreError } from "./world-store.mjs";

const TEST_ROOT = fileURLToPath(new URL("../reports/world-store-tests/", import.meta.url));
const NOW = 1_800_000_000_000;
const WORLD_ID = "dehong";
const VILLAGE_ID = "ruili-river-0001";
const CONFIG_VERSION = "shared-world-free-v1";
const APPLICATION_ID = 0x414E484C;
const PLAYER_A = "player_actual_a";
const PLAYER_B = "player_actual_b";
const PLAYER_C = "player_actual_c";
const errorCode = (status, code) => error => error instanceof WorldStoreError
  && error.isWorldError === true && error.status === status && error.code === code && error.message === code;
const purchase = (plot, commandId = "purchase-command-01", overrides = {}) => ({
  commandId, kind: "plot.purchase", targetId: plot.plotId, expectedRevision: plot.revision,
  configVersion: CONFIG_VERSION, payload: {}, ...overrides,
});
const register = (store, playerId, commandId = "register-command-01", avatarId = "wanderer") => store.registerPlayer(playerId, { commandId, avatarId });
const firstPlots = store => store.listPlots({ worldId: WORLD_ID, villageId: VILLAGE_ID }).plots;

async function fixture(t) {
  if (process.platform === "win32") assert.equal(path.parse(TEST_ROOT).root.toUpperCase(), "D:\\");
  await mkdir(TEST_ROOT, { recursive: true });
  const physicalRoot = await realpath(TEST_ROOT);
  if (process.platform === "win32") assert.equal(path.parse(physicalRoot).root.toUpperCase(), "D:\\");
  const directory = await mkdtemp(path.join(physicalRoot, "case-"));
  const filename = path.join(directory, "world.sqlite");
  const stores = [];
  const connections = [];
  const open = () => {
    const store = createWorldStore({ filename, now: () => NOW });
    stores.push(store);
    return store;
  };
  const inspect = () => {
    const db = new DatabaseSync(filename, { allowExtension: false });
    connections.push(db);
    return db;
  };
  t.after(async () => {
    for (const store of stores) store.close();
    for (const connection of connections) connection.close();
    const physicalDirectory = await realpath(directory);
    assert.equal(path.dirname(physicalDirectory), physicalRoot);
    const relative = path.relative(physicalRoot, physicalDirectory);
    assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative));
    await rm(physicalDirectory, { recursive: true, force: true });
  });
  return { directory, filename, open, inspect, store: open() };
}

test("bootstrap is read-only and truthful before registration; SQLite uses WAL and a versioned independent schema", async t => {
  const { store, inspect } = await fixture(t);
  const initial = store.getBootstrap(PLAYER_A);
  assert.equal(initial.registered, false);
  assert.equal(initial.player, null);
  assert.equal(initial.wallet, null);
  assert.equal(initial.home, null);
  assert.equal(initial.worldId, WORLD_ID);
  assert.equal(initial.configVersion, CONFIG_VERSION);
  assert.deepEqual(initial.catalog.regions.map(region => region.id).sort(), ["lianghe", "longchuan", "mangshi", "ruili", "yingjiang"]);
  assert.deepEqual(initial.catalog.villages, [{ villageId: VILLAGE_ID, worldId: WORLD_ID, regionId: "ruili", ordinal: 1, layout: "provisional" }]);
  assert.deepEqual(initial.economy, { coinMinorPerCoin: 100, initialGrantMinor: 100000, standardPlotPriceMinor: 40000 });
  assert.deepEqual(initial.capabilities, {
    registration: true, plots: true, plotPurchase: true, homes: true,
    farming: false, multiplayer: false, redKnots: false,
  });
  const plots = firstPlots(store);
  assert.equal(plots.length, 2);
  assert.equal(plots[0].layout, "provisional");
  assert.equal(plots[0].priceMinor, 40000);
  assert.equal(plots[0].owner, null);
  assert.equal(plots[0].home, null);
  assert.ok(plots[0].bounds.every(point => point.x < plots[1].bounds[0].x));
  const db = inspect();
  assert.equal(db.prepare("PRAGMA journal_mode").get().journal_mode, "wal");
  assert.equal(db.prepare("PRAGMA application_id").get().application_id, APPLICATION_ID);
  assert.equal(db.prepare("PRAGMA user_version").get().user_version, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM players").get().count, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM ledger_transactions").get().count, 0);
});

test("registration grants exactly once; restart and later purchases preserve original durable receipts", async t => {
  const { store, open, inspect } = await fixture(t);
  const registered = register(store, PLAYER_A, "register-first-01", "farmer");
  assert.equal(registered.kind, "player.register");
  assert.equal(registered.status, "committed");
  assert.equal(registered.result.player.avatarId, "farmer");
  assert.equal(registered.result.wallet.balanceMinor, 100000);
  assert.deepEqual(register(store, PLAYER_A, "register-first-01", "farmer"), registered);
  assert.throws(() => register(store, PLAYER_A, "register-first-01", "herder"), errorCode(409, "COMMAND_ID_CONFLICT"));
  const duplicate = register(store, PLAYER_A, "register-again-02", "herder");
  assert.equal(duplicate.status, "rejected");
  assert.equal(duplicate.code, "PLAYER_ALREADY_REGISTERED");
  assert.equal(duplicate.result.player.avatarId, "farmer");
  const bought = store.executeCommand(PLAYER_A, purchase(firstPlots(store)[0], "purchase-first-01"));
  assert.equal(bought.status, "committed");
  assert.deepEqual(bought.result.wallet, { balanceMinor: 60000, revision: 2 });
  assert.equal(bought.result.home.owner.playerId, PLAYER_A);
  assert.equal(bought.result.home.house, null);
  assert.deepEqual(bought.result.home.beds, []);
  assert.deepEqual(bought.result.home.animals, []);
  assert.deepEqual(store.getReceipt(PLAYER_A, "register-first-01"), registered);
  store.close();
  const restarted = open();
  assert.equal(restarted.getBootstrap(PLAYER_A).wallet.balanceMinor, 60000);
  assert.deepEqual(restarted.getReceipt(PLAYER_A, "purchase-first-01"), bought);
  assert.deepEqual(register(restarted, PLAYER_A, "register-first-01", "farmer"), registered);
  assert.deepEqual(register(restarted, PLAYER_A, "register-again-02", "herder"), duplicate);
  assert.equal(register(restarted, PLAYER_A, "register-later-03").code, "PLAYER_ALREADY_REGISTERED");
  assert.equal(restarted.getBootstrap(PLAYER_A).wallet.balanceMinor, 60000);
  const db = inspect();
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM ledger_transactions WHERE source = 'starter' AND player_id = ?").get(PLAYER_A).count, 1);
  const entries = db.prepare("SELECT transaction_id, COUNT(*) AS count, SUM(delta_minor) AS net FROM ledger_entries GROUP BY transaction_id").all();
  assert.equal(entries.length, 2);
  assert.ok(entries.every(entry => entry.count === 2 && entry.net === 0));
  assert.deepEqual(db.prepare("SELECT source FROM ledger_transactions ORDER BY created_at, source").all().map(row => row.source), ["plot", "starter"]);
  assert.throws(() => restarted.getReceipt(PLAYER_B, "purchase-first-01"), errorCode(404, "RECEIPT_NOT_FOUND"));
});

test("same-key replay preserves the rejected snapshot even after registration and validates canonical intent", async t => {
  const { store, open } = await fixture(t);
  const plot = firstPlots(store)[0];
  const command = purchase(plot, "attempt-before-register");
  const original = store.executeCommand(PLAYER_A, command);
  assert.equal(original.code, "PLAYER_NOT_REGISTERED");
  register(store, PLAYER_A);
  assert.deepEqual(store.executeCommand(PLAYER_A, { payload: {}, configVersion: CONFIG_VERSION, expectedRevision: 1, targetId: plot.plotId, kind: "plot.purchase", commandId: command.commandId }), original);
  assert.throws(() => store.executeCommand(PLAYER_A, { ...command, expectedRevision: 2 }), errorCode(409, "COMMAND_ID_CONFLICT"));
  assert.throws(() => register(store, PLAYER_A, command.commandId), errorCode(409, "COMMAND_ID_CONFLICT"));
  const committed = store.executeCommand(PLAYER_A, purchase(plot, "attempt-after-register"));
  assert.equal(committed.status, "committed");
  store.close();
  const restarted = open();
  assert.deepEqual(restarted.executeCommand(PLAYER_A, command), original);
  assert.deepEqual(restarted.getReceipt(PLAYER_A, command.commandId), original);
  assert.deepEqual(restarted.executeCommand(PLAYER_A, purchase(plot, "attempt-after-register")), committed);
});

test("two independent SQLite handles contend for a plot without charging the loser, and one home is enforced", async t => {
  const { store, open, inspect } = await fixture(t);
  const second = open();
  register(store, PLAYER_A);
  register(second, PLAYER_B);
  const [plot, next] = firstPlots(store);
  const won = store.executeCommand(PLAYER_A, purchase(plot, "contending-command-a"));
  const lost = second.executeCommand(PLAYER_B, purchase(plot, "contending-command-b"));
  assert.equal(won.status, "committed");
  assert.equal(lost.status, "rejected");
  assert.equal(lost.code, "PLOT_UNAVAILABLE");
  assert.equal(store.getBootstrap(PLAYER_A).wallet.balanceMinor, 60000);
  assert.equal(second.getBootstrap(PLAYER_B).wallet.balanceMinor, 100000);
  const limited = store.executeCommand(PLAYER_A, purchase(next, "second-home-command"));
  assert.equal(limited.code, "HOME_LIMIT_REACHED");
  assert.equal(store.getBootstrap(PLAYER_A).wallet.balanceMinor, 60000);
  assert.deepEqual(second.executeCommand(PLAYER_B, purchase(plot, "contending-command-b")), lost);
  const db = inspect();
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM ledger_transactions WHERE source = 'plot'").get().count, 1);
});

test("simultaneous worker buyers serialize through SQLite and only one acquires the land", async t => {
  const { store, filename } = await fixture(t);
  register(store, PLAYER_A);
  register(store, PLAYER_B);
  const plot = firstPlots(store)[0];
  const barrier = new SharedArrayBuffer(4);
  const ready = new Int32Array(barrier);
  const storeUrl = new URL("./world-store.mjs", import.meta.url).href;
  const workers = [PLAYER_A, PLAYER_B].map((playerId, index) => {
    const worker = new Worker(`
      const { parentPort, workerData } = require("node:worker_threads");
      (async () => {
        const { createWorldStore } = await import(workerData.storeUrl);
        const store = createWorldStore({ filename: workerData.filename, now: () => ${NOW} });
        const ready = new Int32Array(workerData.barrier);
        parentPort.postMessage({ ready: true });
        Atomics.wait(ready, 0, 0);
        try { parentPort.postMessage({ receipt: store.executeCommand(workerData.playerId, workerData.command) }); }
        finally { store.close(); }
      })().catch(error => { parentPort.postMessage({ error: { code: error.code, message: error.message } }); process.exitCode = 1; });
    `, { eval: true, workerData: { storeUrl, filename, playerId, barrier, command: purchase(plot, `parallel-buyer-${index}`) } });
    t.after(async () => worker.terminate());
    let announce;
    const started = new Promise(resolve => { announce = resolve; });
    const result = new Promise((resolve, reject) => {
      worker.on("message", message => {
        if (message.ready) announce();
        else if (message.receipt) resolve(message.receipt);
        else if (message.error) reject(new Error(message.error.message));
      });
      worker.on("error", reject);
      worker.on("exit", code => { if (code !== 0) reject(new Error(`Worker exited ${code}`)); });
    });
    return { started, result };
  });
  await Promise.all(workers.map(worker => worker.started));
  Atomics.store(ready, 0, 1);
  Atomics.notify(ready, 0);
  const results = await Promise.all(workers.map(worker => worker.result));
  assert.equal(results.filter(receipt => receipt.status === "committed").length, 1);
  assert.equal(results.filter(receipt => receipt.code === "PLOT_UNAVAILABLE").length, 1);
  assert.deepEqual([PLAYER_A, PLAYER_B].map(id => store.getBootstrap(id).wallet.balanceMinor).sort((a, b) => a - b), [60000, 100000]);
});

test("filling a village creates the next persistent provisional village while existing addresses remain stable", async t => {
  const { store, open } = await fixture(t);
  for (const player of [PLAYER_A, PLAYER_B, PLAYER_C]) register(store, player);
  const plots = firstPlots(store);
  const first = store.executeCommand(PLAYER_A, purchase(plots[0], "fill-first-plot"));
  assert.equal(store.getBootstrap(PLAYER_A).catalog.villages.length, 1);
  const second = store.executeCommand(PLAYER_B, purchase(plots[1], "fill-second-plot"));
  assert.equal(second.status, "committed");
  const villages = store.getBootstrap(PLAYER_C).catalog.villages;
  assert.deepEqual(villages.map(village => village.villageId), [VILLAGE_ID, "ruili-river-0002"]);
  const expanded = store.listPlots({ worldId: WORLD_ID, villageId: "ruili-river-0002" });
  assert.equal(expanded.plots.length, 2);
  assert.ok(expanded.plots.every(plot => plot.owner === null && plot.home === null && plot.revision === 1));
  assert.deepEqual(store.getBootstrap(PLAYER_A).home, first.result.home);
  store.close();
  const restarted = open();
  assert.deepEqual(restarted.getBootstrap(PLAYER_A).home, first.result.home);
  assert.deepEqual(restarted.getBootstrap(PLAYER_C).catalog.villages, villages);
  assert.equal(restarted.executeCommand(PLAYER_C, purchase(expanded.plots[0], "new-village-purchase")).status, "committed");
});

test("SQL failure rolls back debit, ownership, home, ledger and receipt; retry is safe after recovery", async t => {
  const { store, inspect, open } = await fixture(t);
  register(store, PLAYER_A);
  const plot = firstPlots(store)[0];
  const command = purchase(plot, "failure-command-01");
  const db = inspect();
  db.exec("CREATE TRIGGER forcefail BEFORE INSERT ON command_receipts WHEN NEW.command_id = 'failure-command-01' BEGIN SELECT RAISE(ABORT, 'sensitive schema diagnostic'); END");
  assert.throws(() => store.executeCommand(PLAYER_A, command), errorCode(503, "WORLD_STORAGE_UNAVAILABLE"));
  assert.deepEqual(store.getBootstrap(PLAYER_A).wallet, { balanceMinor: 100000, revision: 1 });
  assert.equal(store.getBootstrap(PLAYER_A).home, null);
  assert.deepEqual(firstPlots(store)[0], plot);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM ledger_transactions WHERE source = 'plot'").get().count, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM ledger_entries").get().count, 2);
  assert.throws(() => store.getReceipt(PLAYER_A, command.commandId), errorCode(404, "RECEIPT_NOT_FOUND"));
  db.exec("DROP TRIGGER forcefail");
  store.close();
  const restarted = open();
  assert.equal(restarted.executeCommand(PLAYER_A, command).status, "committed");
  assert.equal(restarted.getBootstrap(PLAYER_A).wallet.balanceMinor, 60000);
});

test("SQL registration failure does not create a player or partially grant the starter balance", async t => {
  const { store, inspect } = await fixture(t);
  const db = inspect();
  db.exec("CREATE TRIGGER forcefail BEFORE INSERT ON ledger_entries WHEN NEW.line = 1 BEGIN SELECT RAISE(ABORT, 'internal grant failure'); END");
  assert.throws(() => register(store, PLAYER_A), errorCode(503, "WORLD_STORAGE_UNAVAILABLE"));
  assert.equal(store.getBootstrap(PLAYER_A).registered, false);
  for (const table of ["players", "wallets", "ledger_transactions", "ledger_entries", "command_receipts"]) {
    assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count, 0);
  }
  db.exec("DROP TRIGGER forcefail");
  assert.equal(register(store, PLAYER_A).result.wallet.balanceMinor, 100000);
});

test("business rejections are durable, do not debit and cannot be changed by retry", async t => {
  const { store, inspect, open } = await fixture(t);
  register(store, PLAYER_A);
  const plot = firstPlots(store)[0];
  const config = store.executeCommand(PLAYER_A, purchase(plot, "config-mismatch-01", { configVersion: "future-version" }));
  assert.equal(config.code, "CONFIG_VERSION_MISMATCH");
  const revision = store.executeCommand(PLAYER_A, purchase(plot, "revision-mismatch-01", { expectedRevision: 2 }));
  assert.equal(revision.code, "PLOT_REVISION_CONFLICT");
  const absent = store.executeCommand(PLAYER_A, purchase(plot, "plot-missing-01", { targetId: "missing-plot" }));
  assert.equal(absent.code, "PLOT_NOT_FOUND");
  const db = inspect();
  db.prepare("UPDATE wallets SET balance_minor = 39999 WHERE player_id = ?").run(PLAYER_A);
  const insufficientCommand = purchase(plot, "insufficient-funds-01");
  const insufficient = store.executeCommand(PLAYER_A, insufficientCommand);
  assert.equal(insufficient.code, "INSUFFICIENT_FUNDS");
  db.prepare("UPDATE wallets SET balance_minor = 100000 WHERE player_id = ?").run(PLAYER_A);
  assert.deepEqual(store.executeCommand(PLAYER_A, insufficientCommand), insufficient);
  assert.equal(store.getBootstrap(PLAYER_A).home, null);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM ledger_transactions WHERE source = 'plot'").get().count, 0);
  store.close();
  const restarted = open();
  assert.deepEqual(restarted.getReceipt(PLAYER_A, "config-mismatch-01"), config);
  assert.deepEqual(restarted.getReceipt(PLAYER_A, "revision-mismatch-01"), revision);
  assert.deepEqual(restarted.executeCommand(PLAYER_A, insufficientCommand), insufficient);
});

test("public plot and home projections contain no wallets, ledger rows or authentication data", async t => {
  const { store } = await fixture(t);
  register(store, PLAYER_A);
  store.executeCommand(PLAYER_A, purchase(firstPlots(store)[0]));
  const [plot] = firstPlots(store);
  assert.deepEqual(Object.keys(plot.owner).sort(), ["nickname", "playerId"]);
  assert.deepEqual(Object.keys(plot.home).sort(), ["address", "animals", "beds", "bounds", "homeId", "house", "origin", "owner", "revision"]);
  for (const forbidden of ["wallet", "balanceMinor", "balance_minor", "session", "openid", "ledger", "created_at", "avatar_id"]) {
    assert.equal(JSON.stringify(plot).includes(forbidden), false, forbidden);
  }
  const publicHome = structuredClone(plot.home);
  plot.home.owner.nickname = "mutated";
  plot.home.bounds[0].x = 12345;
  assert.deepEqual(firstPlots(store)[0].home, publicHome);
});

test("input validation rejects unknown fields, invalid identifiers and client-authoritative values without receipts", async t => {
  const { store, inspect } = await fixture(t);
  for (const playerId of ["", "x".repeat(129), "has space", "../player", 123, null]) {
    assert.throws(() => store.getBootstrap(playerId), errorCode(400, "INVALID_PLAYER_ID"));
    assert.throws(() => register(store, playerId), errorCode(400, "INVALID_PLAYER_ID"));
  }
  for (const body of [
    null, [], {}, { commandId: "short", avatarId: "farmer" },
    { commandId: "registration-01", avatarId: "custom" },
    { commandId: "registration-01", avatarId: "farmer", playerId: PLAYER_B },
    { commandId: "registration-01", avatarId: "farmer", nickname: "free text" },
    { commandId: "registration-01", avatarId: "farmer", balanceMinor: 1000000 },
  ]) assert.throws(() => store.registerPlayer(PLAYER_A, body), errorCode(400, "INVALID_REGISTRATION"));
  const plot = firstPlots(store)[0];
  const command = purchase(plot);
  for (const invalid of [
    null, [], {}, { ...command, playerId: PLAYER_B }, { ...command, priceMinor: 1 },
    { ...command, commandId: "short" }, { ...command, commandId: "c".repeat(97) },
    { ...command, targetId: "bad/plot" }, { ...command, expectedRevision: 0 },
    { ...command, expectedRevision: 1.5 }, { ...command, expectedRevision: Number.MAX_SAFE_INTEGER },
    { ...command, payload: { priceMinor: 1 } }, { ...command, kind: "wallet.credit" },
    { ...command, configVersion: "bad version" },
  ]) assert.throws(() => store.executeCommand(PLAYER_A, invalid), errorCode(400, "INVALID_COMMAND"));
  for (const query of [null, {}, { worldId: WORLD_ID, villageId: VILLAGE_ID, playerId: PLAYER_A }]) {
    assert.throws(() => store.listPlots(query), errorCode(400, "INVALID_PLOT_QUERY"));
  }
  assert.throws(() => store.listPlots({ worldId: "other", villageId: VILLAGE_ID }), errorCode(404, "WORLD_NOT_FOUND"));
  assert.throws(() => store.listPlots({ worldId: WORLD_ID, villageId: "not-found" }), errorCode(404, "VILLAGE_NOT_FOUND"));
  assert.throws(() => store.getReceipt(PLAYER_A, "bad"), errorCode(400, "INVALID_COMMAND_ID"));
  assert.equal(inspect().prepare("SELECT COUNT(*) AS count FROM command_receipts").get().count, 0);
});

test("future schema versions and unusable stores fail closed with sanitized errors", async t => {
  const { store, filename, inspect } = await fixture(t);
  store.close();
  assert.throws(() => store.getBootstrap(PLAYER_A), errorCode(503, "WORLD_STORE_CLOSED"));
  const db = inspect();
  db.exec("PRAGMA user_version = 2");
  assert.throws(() => createWorldStore({ filename }), errorCode(503, "WORLD_SCHEMA_UNSUPPORTED"));
  assert.throws(() => createWorldStore({ filename: path.join(filename, "invalid.sqlite") }), errorCode(503, "WORLD_STORAGE_UNAVAILABLE"));
  assert.throws(() => createWorldStore({ filename, extra: true }), errorCode(400, "INVALID_STORE_OPTIONS"));
});

test("unrelated SQLite databases are rejected before journal mode, headers or schema can change", async t => {
  const { directory } = await fixture(t);
  for (const [index, setup, code] of [
    [0, "CREATE TABLE unrelated (value TEXT NOT NULL); INSERT INTO unrelated VALUES ('preserve-me')", "WORLD_STORAGE_IDENTITY_MISMATCH"],
    [1, "PRAGMA user_version = 1; CREATE TABLE unrelated (value TEXT NOT NULL)", "WORLD_STORAGE_IDENTITY_MISMATCH"],
    [2, "PRAGMA application_id = 12345; CREATE TABLE unrelated (value TEXT NOT NULL)", "WORLD_STORAGE_IDENTITY_MISMATCH"],
    [3, `PRAGMA application_id = ${APPLICATION_ID}; CREATE TABLE unrelated (value TEXT NOT NULL)`, "WORLD_STORAGE_IDENTITY_MISMATCH"],
    [4, "PRAGMA user_version = 2; CREATE TABLE unrelated (value TEXT NOT NULL)", "WORLD_SCHEMA_UNSUPPORTED"],
    [5, "CREATE VIEW unrelated AS SELECT 1 AS value", "WORLD_STORAGE_IDENTITY_MISMATCH"],
    [6, "CREATE TABLE former_data (value TEXT); DROP TABLE former_data; PRAGMA application_id = 12345", "WORLD_STORAGE_IDENTITY_MISMATCH"],
  ]) {
    const filename = path.join(directory, `unrelated-${index}.sqlite`);
    let db = new DatabaseSync(filename, { allowExtension: false });
    db.exec("PRAGMA journal_mode = DELETE");
    db.exec(setup);
    const schema = db.prepare("SELECT type, name, sql FROM sqlite_schema ORDER BY name").all();
    const applicationId = db.prepare("PRAGMA application_id").get().application_id;
    const version = db.prepare("PRAGMA user_version").get().user_version;
    db.close();
    const original = await readFile(filename);
    assert.throws(() => createWorldStore({ filename }), errorCode(503, code));
    assert.deepEqual(await readFile(filename), original);
    db = new DatabaseSync(filename, { readOnly: true, allowExtension: false });
    try {
      assert.equal(db.prepare("PRAGMA journal_mode").get().journal_mode, "delete");
      assert.equal(db.prepare("PRAGMA application_id").get().application_id, applicationId);
      assert.equal(db.prepare("PRAGMA user_version").get().user_version, version);
      assert.deepEqual(db.prepare("SELECT type, name, sql FROM sqlite_schema ORDER BY name").all(), schema);
    } finally { db.close(); }
  }
});

test("owned version-one stores reopen only with the ANHL identity marker", async t => {
  const { store, filename, open } = await fixture(t);
  const registered = register(store, PLAYER_A);
  store.close();
  const reopened = open();
  assert.equal(reopened.getBootstrap(PLAYER_A).wallet.balanceMinor, 100000);
  assert.deepEqual(reopened.getReceipt(PLAYER_A, registered.commandId), registered);
  reopened.close();
  let db = new DatabaseSync(filename, { allowExtension: false });
  db.exec("PRAGMA journal_mode = DELETE");
  assert.equal(db.prepare("PRAGMA application_id").get().application_id, APPLICATION_ID);
  assert.equal(db.prepare("PRAGMA user_version").get().user_version, 1);
  db.exec("PRAGMA application_id = 0");
  db.close();
  const original = await readFile(filename);
  assert.throws(() => createWorldStore({ filename }), errorCode(503, "WORLD_STORAGE_IDENTITY_MISMATCH"));
  assert.deepEqual(await readFile(filename), original);
  db = new DatabaseSync(filename, { allowExtension: false });
  db.exec(`PRAGMA application_id = ${APPLICATION_ID}`);
  db.close();
  const restored = open();
  assert.equal(restored.getBootstrap(PLAYER_A).wallet.balanceMinor, 100000);
  assert.deepEqual(restored.getReceipt(PLAYER_A, registered.commandId), registered);
});

test("database and SQLite sidecar aliases are rejected before modifying their targets", async t => {
  const { store, filename, directory, open } = await fixture(t);
  register(store, PLAYER_A);
  store.close();
  const original = await readFile(filename);
  const alias = path.join(directory, "aliased.sqlite");
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    const candidate = `${alias}${suffix}`;
    await symlink(filename, candidate, "file");
    assert.throws(() => createWorldStore({ filename: alias }), errorCode(503, "WORLD_STORAGE_PATH_UNSAFE"));
    assert.deepEqual(await readFile(filename), original);
    await unlink(candidate);
  }
  await link(filename, alias);
  assert.throws(() => createWorldStore({ filename: alias }), errorCode(503, "WORLD_STORAGE_PATH_UNSAFE"));
  await unlink(alias);
  assert.deepEqual(await readFile(filename), original);
  assert.equal(open().getBootstrap(PLAYER_A).wallet.balanceMinor, 100000);
});
