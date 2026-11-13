# WeChat Local Save Contract

The local repository is platform infrastructure only. Muse owns the game's save schema, state transitions and migration design. This repository does not import game rules or write the existing browser farm key. It does not provide cloud storage or trusted asset ownership.

```js
import { createLocalSaveRepository } from "./platform/save-repository.js";

const saves = createLocalSaveRepository(platform.storage, {
  namespace: "anheli-game",
  schemaVersion: 1,
  validate: state => state !== null && Number.isSafeInteger(state.coins),
});
const loaded = saves.load();
if (loaded.ok) {
  const receipt = saves.save(nextState, { expectedRevision: loaded.revision });
  // Only receipt.ok confirms the local write. Cloud sync remains false.
}
```

## Results

Both methods are synchronous, so a small pending snapshot can be written in a lifecycle `pause` callback before background suspension. The storage adapter must implement synchronous `getItem(key)` and atomic `setItem(key, string)`. Use the existing `platform.storage` adapter. Do not save on every animation frame.

- Empty: `{ok:true,state:null,revision:0,savedAt:null,source:"empty",cloudSynced:false}`.
- Loaded or saved: `{ok:true,state,revision,savedAt,source:"local",cloudSynced:false}`.
- Failure: `{ok:false,error:{code,message}}`. No state or revision success is returned.

The returned state is detached from the stored JSON. Mutating it does not save it. Every successful write increments the revision once. All repositories using a namespace share its latest stored revision; a stale `expectedRevision` produces `SAVE_CONFLICT`. This check prevents sequential stale writes in the single JavaScript runtime; it is not a distributed compare-and-swap or cross-process lock.

The envelope uses the key `<namespace>:save` and contains `formatVersion`, `schemaVersion`, `revision`, `savedAt` and `state`. It is limited to 1 MiB of UTF-8 JSON including metadata. Only finite JSON values, dense arrays and plain data objects are accepted; cycles, getters, functions, undefined, dates and symbol properties fail without writing. State depth is limited to 64. Validators must be synchronous, pure and return exactly `true` for an accepted state; thrown errors fail closed.

## Failure Handling

| Code | Client action |
| --- | --- |
| `SAVE_READ_FAILED` | Keep in-memory progress, show that local storage is unavailable, retry when available. |
| `SAVE_WRITE_FAILED` | Keep dirty progress and the previous revision; do not report saved. |
| `SAVE_CONFLICT` | Reload and preserve the competing in-memory candidate for an explicit recovery choice. Never add balances together. |
| `SAVE_CORRUPT` | Preserve the existing bytes; offer recovery only through a separately designed flow. Do not create a new save over it. |
| `SAVE_UNSUPPORTED` | Preserve the existing version for an explicit reviewed migration. No automatic reset. |
| `SAVE_TOO_LARGE` | Reduce the snapshot schema; do not delete unrelated storage. |
| `SAVE_INVALID_STATE`, `SAVE_INVALID_REVISION`, `SAVE_INVALID_TIME` | Treat as client contract errors; no write occurred. |

No clear/reset/delete operation is provided. A changed schema version does not create a new key and hide old progress. Both older and newer unsupported versions are left intact. A failing atomic storage write preserves the previous envelope; no second write or silent retry is performed.

## Boundaries

Store only game progress. Never include login codes, session tokens, AppSecret, identity secrets, raw OpenID, payment data, phone numbers or chat content. The repository cannot infer every sensitive field in an arbitrary game schema; game serialization must explicitly allow only required progress fields.

Local data can be modified by the device owner. Validation and revisions are corruption/conflict checks, not anti-cheat or authoritative balances. No account identity is invented. Do not import browser progress into a logged-in player's cloud assets automatically. Future cloud sync must authenticate server-side, define ownership and migration, and return an actual server acknowledgement before showing cloud success.

Diagnostic checks must use a separate namespace, such as `anheli-diagnostic`, so they cannot overwrite actual gameplay. Run `node --test tests/wechat-save.test.mjs` from the repository root.
