import test from "node:test";
import assert from "node:assert/strict";
import { createLocalSaveRepository, MAX_LOCAL_SAVE_BYTES } from "../wechat/platform/save-repository.js";

const NOW = 1800000000000;
function memoryStorage() {
  const values = new Map();
  let writes = 0;
  return {
    values,
    get writes() { return writes; },
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { writes += 1; values.set(key, value); },
  };
}
const options = { now: () => NOW, validate: state => state !== null && Number.isSafeInteger(state.coins) && state.coins >= 0 };

test("local snapshots survive a new repository and never claim cloud sync", () => {
  const storage = memoryStorage();
  const repository = createLocalSaveRepository(storage, options);
  assert.deepEqual(repository.load(), { ok: true, state: null, revision: 0, savedAt: null, source: "empty", cloudSynced: false });
  const original = { coins: 1200, animals: [{ id: "sheep-1", name: "云朵" }] };
  const saved = repository.save(original, { expectedRevision: 0 });
  assert.equal(saved.ok, true);
  assert.equal(saved.revision, 1);
  assert.equal(saved.cloudSynced, false);
  original.animals[0].name = "Changed outside";
  saved.state.coins = 0;
  const reloaded = createLocalSaveRepository(storage, options).load();
  assert.equal(reloaded.state.coins, 1200);
  assert.equal(reloaded.state.animals[0].name, "云朵");
  assert.equal(reloaded.source, "local");
  assert.equal(reloaded.savedAt, NOW);
  assert.equal(storage.writes, 1);
});

test("stale revisions cannot overwrite newer progress", () => {
  const storage = memoryStorage();
  const first = createLocalSaveRepository(storage, options);
  const second = createLocalSaveRepository(storage, options);
  assert.equal(first.save({ coins: 1200 }, { expectedRevision: 0 }).ok, true);
  assert.equal(second.save({ coins: 800 }, { expectedRevision: 1 }).revision, 2);
  assert.equal(first.save({ coins: 940 }, { expectedRevision: 1 }).error.code, "SAVE_CONFLICT");
  assert.equal(first.load().state.coins, 800);
  assert.equal(storage.writes, 2);
});

test("quota and read failures never return success or rewrite stored progress", () => {
  const storage = memoryStorage();
  const repository = createLocalSaveRepository(storage, options);
  repository.save({ coins: 1200 }, { expectedRevision: 0 });
  const before = storage.values.get("anheli-game:save");
  storage.setItem = () => { throw new Error("private storage details"); };
  const failure = repository.save({ coins: 800 }, { expectedRevision: 1 });
  assert.equal(failure.error.code, "SAVE_WRITE_FAILED");
  assert.equal(JSON.stringify(failure).includes("private"), false);
  assert.equal(storage.values.get("anheli-game:save"), before);
  storage.getItem = () => { throw new Error("locked"); };
  assert.equal(repository.load().error.code, "SAVE_READ_FAILED");
  assert.equal(repository.save({ coins: 800 }, { expectedRevision: 1 }).error.code, "SAVE_READ_FAILED");
});

test("corrupt, wrong-schema and malformed envelopes remain intact", () => {
  const base = { formatVersion: 1, schemaVersion: 1, revision: 4, savedAt: NOW, state: { coins: 20 } };
  const cases = [
    ["", "SAVE_CORRUPT"], ["{broken", "SAVE_CORRUPT"],
    [JSON.stringify({ ...base, state: { coins: -1 } }), "SAVE_CORRUPT"],
    [JSON.stringify({ ...base, revision: 0 }), "SAVE_CORRUPT"],
    [JSON.stringify({ ...base, extra: true }), "SAVE_CORRUPT"],
    [JSON.stringify({ ...base, schemaVersion: 2 }), "SAVE_UNSUPPORTED"],
    [JSON.stringify({ ...base, formatVersion: 2 }), "SAVE_UNSUPPORTED"],
  ];
  for (const [raw, code] of cases) {
    const storage = memoryStorage();
    storage.values.set("anheli-game:save", raw);
    const repository = createLocalSaveRepository(storage, options);
    assert.equal(repository.load().error.code, code);
    assert.equal(repository.save({ coins: 1200 }, { expectedRevision: 4 }).error.code, code);
    assert.equal(storage.values.get("anheli-game:save"), raw);
    assert.equal(storage.writes, 0);
  }
});

test("non-JSON values and invalid state cannot silently lose data", () => {
  const storage = memoryStorage();
  const repository = createLocalSaveRepository(storage, options);
  const cyclic = { coins: 1 }; cyclic.self = cyclic;
  const getter = { coins: 1, get unsafe() { throw new Error("must not execute"); } };
  const cases = [undefined, { coins: NaN }, { coins: 1, missing: undefined }, { coins: 1, value: Infinity },
    { coins: 1, date: new Date() }, { coins: 1, fn: () => {} }, { coins: 1, array: new Array(3) },
    { coins: 1, token: Symbol("x") }, { coins: 1, largeInteger: 1n }, cyclic, getter, { coins: -1 }];
  for (const value of cases) assert.equal(repository.save(value, { expectedRevision: 0 }).error.code, "SAVE_INVALID_STATE");
  assert.equal(storage.writes, 0);
});

test("UTF-8 envelope size, revision and timestamp limits fail before writing", () => {
  const storage = memoryStorage();
  const repository = createLocalSaveRepository(storage, options);
  assert.equal(repository.save({ coins: 1, text: "云".repeat(Math.ceil(MAX_LOCAL_SAVE_BYTES / 3)) }, { expectedRevision: 0 }).error.code, "SAVE_TOO_LARGE");
  assert.equal(repository.save({ coins: 1 }).error.code, "SAVE_INVALID_REVISION");
  assert.equal(repository.save({ coins: 1 }, { expectedRevision: Number.MAX_SAFE_INTEGER }).error.code, "SAVE_INVALID_REVISION");
  assert.equal(createLocalSaveRepository(storage, { ...options, now: () => NaN }).save({ coins: 1 }, { expectedRevision: 0 }).error.code, "SAVE_INVALID_TIME");
  storage.values.set("anheli-game:save", "x".repeat(MAX_LOCAL_SAVE_BYTES + 1));
  assert.equal(repository.load().error.code, "SAVE_TOO_LARGE");
  assert.equal(storage.writes, 0);
});

test("namespaces isolate diagnostics from gameplay and version changes require migration", () => {
  const storage = memoryStorage();
  const game = createLocalSaveRepository(storage, options);
  const diagnostic = createLocalSaveRepository(storage, { ...options, namespace: "anheli-diagnostic" });
  game.save({ coins: 1200 }, { expectedRevision: 0 });
  diagnostic.save({ coins: 5 }, { expectedRevision: 0 });
  assert.equal(game.load().state.coins, 1200);
  assert.equal(diagnostic.load().state.coins, 5);
  assert.equal(createLocalSaveRepository(storage, { ...options, schemaVersion: 2 }).load().error.code, "SAVE_UNSUPPORTED");
  assert.equal(game.load().state.coins, 1200);
});
