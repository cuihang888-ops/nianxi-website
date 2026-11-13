import Daily from "../vendor/daily-state.cjs";
import { createLocalSaveRepository } from "./save-repository.js";

export function createPreviewSave(storage, now = Date.now) {
  const repository = createLocalSaveRepository(storage, { namespace: "anheli-minigame-v2", validate: Daily.validateState, now });
  const loaded = repository.load();
  if (loaded.ok && loaded.state === null) {
    let migrated;
    try {
      const legacy = typeof storage.getLegacyItem === "function"
        ? storage.getLegacyItem("anheli-minigame-v1") : storage.getItem("anheli-minigame-v1");
      if (legacy !== null && legacy !== undefined) migrated = Daily.normalizeLegacyState(legacy);
    } catch { migrated = { ok: false, error: { code: "SAVE_READ_FAILED", message: "原存档无法读取，已保留" } }; }
    if (migrated?.ok) migrated = repository.save(migrated.state, { expectedRevision: 0 });
    if (migrated && !migrated.ok) return Daily.createStateSession({ load: () => migrated });
  }
  return Daily.createStateSession(repository);
}
