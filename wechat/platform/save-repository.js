export const MAX_LOCAL_SAVE_BYTES = 1024 * 1024;
const FORMAT_VERSION = 1;
const ERROR_MESSAGES = Object.freeze({
  SAVE_READ_FAILED: "Local progress could not be read.",
  SAVE_WRITE_FAILED: "Local progress could not be saved.",
  SAVE_CORRUPT: "Existing local progress is invalid and was preserved.",
  SAVE_UNSUPPORTED: "Existing local progress requires a different save version.",
  SAVE_TOO_LARGE: "Local progress exceeds the supported size.",
  SAVE_CONFLICT: "Local progress changed. Reload before saving.",
  SAVE_INVALID_STATE: "Progress must contain valid JSON data matching the game schema.",
  SAVE_INVALID_REVISION: "Saving requires the revision returned by load.",
  SAVE_INVALID_TIME: "A valid save timestamp is required.",
});
const fail = code => ({ ok: false, error: { code, message: ERROR_MESSAGES[code] } });
const plain = value => value !== null && typeof value === "object"
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

function jsonData(value, ancestors = new Set(), depth = 0) {
  if (depth > 64) return false;
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (!Array.isArray(value) && !plain(value)) return false;
  if (ancestors.has(value)) return false;
  ancestors.add(value);
  const keys = Reflect.ownKeys(value);
  if (keys.some(key => typeof key !== "string")) return false;
  const entries = Array.isArray(value) ? keys.filter(key => key !== "length") : keys;
  if (Array.isArray(value) && (entries.length !== value.length || entries.some((key, i) => key !== String(i)))) return false;
  const valid = entries.every(key => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor.enumerable && Object.hasOwn(descriptor, "value") && jsonData(descriptor.value, ancestors, depth + 1);
  });
  ancestors.delete(value);
  return valid;
}

function utf8Size(value) {
  let size = 0;
  for (const character of value) {
    const code = character.codePointAt(0);
    size += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
    if (size > MAX_LOCAL_SAVE_BYTES) return size;
  }
  return size;
}

export function createLocalSaveRepository(storage, {
  namespace = "anheli-game", schemaVersion = 1, validate = () => true, now = Date.now,
} = {}) {
  if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function"
    || typeof namespace !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/.test(namespace)
    || !Number.isSafeInteger(schemaVersion) || schemaVersion < 1
    || typeof validate !== "function" || typeof now !== "function") throw new TypeError("Invalid local save repository options");
  const key = `${namespace}:save`;
  const receipt = envelope => ({
    ok: true, state: envelope.state, revision: envelope.revision,
    savedAt: envelope.savedAt, source: "local", cloudSynced: false,
  });

  function load() {
    let raw;
    try { raw = storage.getItem(key); } catch { return fail("SAVE_READ_FAILED"); }
    if (raw === null || raw === undefined) return { ok: true, state: null, revision: 0, savedAt: null, source: "empty", cloudSynced: false };
    if (typeof raw !== "string") return fail("SAVE_CORRUPT");
    if (utf8Size(raw) > MAX_LOCAL_SAVE_BYTES) return fail("SAVE_TOO_LARGE");
    try {
      const envelope = JSON.parse(raw);
      if (!plain(envelope) || !Number.isSafeInteger(envelope.formatVersion) || envelope.formatVersion < 1
        || !Number.isSafeInteger(envelope.schemaVersion) || envelope.schemaVersion < 1) return fail("SAVE_CORRUPT");
      if (envelope.formatVersion !== FORMAT_VERSION || envelope.schemaVersion !== schemaVersion) return fail("SAVE_UNSUPPORTED");
      if (Object.keys(envelope).length !== 5 || !Object.hasOwn(envelope, "state")
        || !Number.isSafeInteger(envelope.revision) || envelope.revision < 1
        || !Number.isSafeInteger(envelope.savedAt) || envelope.savedAt < 0
        || !jsonData(envelope.state) || validate(envelope.state) !== true) return fail("SAVE_CORRUPT");
      return receipt(envelope);
    } catch { return fail("SAVE_CORRUPT"); }
  }

  function save(state, { expectedRevision } = {}) {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || expectedRevision >= Number.MAX_SAFE_INTEGER) return fail("SAVE_INVALID_REVISION");
    const existing = load();
    if (!existing.ok) return existing;
    if (existing.revision !== expectedRevision) return fail("SAVE_CONFLICT");
    let snapshot;
    try {
      if (!jsonData(state)) return fail("SAVE_INVALID_STATE");
      snapshot = JSON.parse(JSON.stringify(state));
      if (validate(snapshot) !== true || !jsonData(snapshot)) return fail("SAVE_INVALID_STATE");
    } catch { return fail("SAVE_INVALID_STATE"); }
    let savedAt;
    try { savedAt = now(); } catch { return fail("SAVE_INVALID_TIME"); }
    if (!Number.isSafeInteger(savedAt) || savedAt < 0) return fail("SAVE_INVALID_TIME");
    const envelope = { formatVersion: FORMAT_VERSION, schemaVersion, revision: existing.revision + 1, savedAt, state: snapshot };
    const serialized = JSON.stringify(envelope);
    if (utf8Size(serialized) > MAX_LOCAL_SAVE_BYTES) return fail("SAVE_TOO_LARGE");
    try { storage.setItem(key, serialized); } catch { return fail("SAVE_WRITE_FAILED"); }
    return receipt(envelope);
  }

  return Object.freeze({ load, save });
}
