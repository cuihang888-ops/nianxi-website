# Free edition economy telemetry

This adapter is local development instrumentation, not a cloud analytics service or an authoritative ledger. It writes only to `anheli-economy-telemetry-v1` in the current browser's localStorage. Clearing browser data removes its history. Different devices are different anonymous players. It never records names, animal nicknames, WeChat identifiers, credentials, or IP addresses.

## Daily record

Each anonymous player has daily summaries using the explicit `Asia/Shanghai` day boundary:

- Faucets: `login`, `online`, `business`, `hunt`, `activity`.
- Sinks: `land`, `animal`, `seed`, `horse`, `other`.
- Opening and closing observed balance, last snapshot timestamp, successful committed action count.
- Session entry count (`logins`) and foreground dwell time in milliseconds.
- Hunting attempts and successes, including misses that consume cooldown but award no coins.

The current daily supply is classified as `login`. Sales of game items are `hunt`; other product sales are `business`. Hunting item collection itself does not mint coins and is not double counted. `online` and `activity` remain zero unless actual existing rewards cause committed balance changes. This instrumentation adds no rewards and changes no values.

Session entries are an anonymous browser-session proxy, not verified WeChat logins. Rendering and React effect replay reuse the same session ID, so they do not add another entry. The future WeChat adapter must record authenticated session starts separately.

## Commit boundary

`Courtyard` stages successful in-memory actions in a pending journal. A successful farm save submits that whole committed batch, including earlier actions whose first save failed. An unsuccessful save leaves the batch pending and unrecorded; replacing the local state from storage clears abandoned pending actions. The adapter requires both `ok === true` and `saved === true`. Rejected actions and changes never persisted do not become successful economics events. The actual before/after coin delta is recorded, including capped rewards.

An explicit operation ID makes retrying the same operation idempotent within the retained event window. Events contain an action type and amounts, never the arbitrary input payload. Daily aggregates retain 180 days; the raw diagnostic event ring retains the latest 5,000 events. Idempotency is limited to that ring; a production server must retain durable committed ledger IDs.

The browser reports foreground time every 15 seconds and when visibility changes or the page closes. A single interval is capped at 30 seconds to avoid counting device sleep as play time. Intervals crossing Shanghai midnight are split between days. This measures visible dwell time, not confirmed human attention. Multiple foreground windows may double count, and localStorage has no multi-tab transaction guarantees. Process crashes can lose the last interval.

Economy snapshots are suppressed while the farm reports unsaved changes. Telemetry storage failures retain committed events in a bounded in-memory outbox with their original event IDs and timestamps. Later actions and lifecycle pulses retry that outbox in order. `failedWrites` records failures when storage recovers. The outbox holds up to 1,000 entries, evicts a pulse first when full (otherwise the oldest entry), and reports that loss as `droppedEvents` after recovery. Because the farm and telemetry have separate writes, closing the browser before the outbox recovers can still leave a gap. These local records must not be used for billing, fraud decisions, or claiming full population statistics.

## Server migration contract

Keep the source and sink names stable. A later server adapter should derive economics events inside the same database transaction as the authoritative ledger write, use its committed transaction ID for deduplication, and attach a pseudonymous internal player ID. WeChat `onShow` / `onHide` can feed the session tracker, with server receipt time and session expiry enforcing dwell limits. No cloud endpoint or fake upload has been added in this edition.

For local inspection, call `readEconomyTelemetry(localStorage)` from this module; it returns the stored JSON object or `null`. Tests run with `node --test tests/economy-telemetry.test.mjs`.
