import Daily from "../vendor/daily-state.cjs";
import { createLocalSaveRepository } from "./save-repository.js";

export function createPreviewSave(storage, now = Date.now) {
  const repository = createLocalSaveRepository(storage, { namespace: "anheli-minigame-v2", validate: Daily.validateState, now });
  const loaded = repository.load();
  if (loaded.ok && loaded.state === null) {
    let migrated;
    let legacySeen = false;
    try {
      const legacy = typeof storage.getLegacyItem === "function"
        ? storage.getLegacyItem("anheli-minigame-v1") : storage.getItem("anheli-minigame-v1");
      if (legacy !== null && legacy !== undefined) {
        legacySeen = true;
        migrated = Daily.normalizeLegacyState(legacy);
      }
    } catch { legacySeen = true; migrated = { ok: false, error: { code: "SAVE_READ_FAILED", message: "原存档无法读取，已保留" } }; }
    if (migrated?.ok) migrated = repository.save(migrated.state, { expectedRevision: 0 });
    if (migrated && !migrated.ok) return Daily.createStateSession({ load: () => migrated });
    if (!legacySeen) {
      // 全新玩家（这台设备上从未有过任何存档）：种入新世界存档——安币从 0 起、
      // player 待登记；登记入住后由 Daily.registerPlayer 一次性发放 1000 安家金。
      // 老存档一律走上面的原路径：不种入、不补登记、不补发，余额不动。
      const seeded = repository.save(Daily.newPlayerState(), { expectedRevision: 0 });
      if (!seeded.ok) return Daily.createStateSession({ load: () => seeded });
    }
  }
  return Daily.createStateSession(repository);
}
