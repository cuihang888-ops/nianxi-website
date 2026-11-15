import { createHash, randomUUID } from "node:crypto";
import { lstatSync, realpathSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import previewEconomy from "../wechat/vendor/preview-economy.cjs";

const WORLD_ID = "dehong";
const CONFIG_VERSION = "shared-world-free-v1";
const SCHEMA_VERSION = 1;
const APPLICATION_ID = 0x414E484C; // ANHL
const COIN_MINOR_PER_COIN = 100;
const INITIAL_GRANT_MINOR = 100_000;
const PLOT_PRICE_MINOR = previewEconomy.HOME.PLOT_PRICE * COIN_MINOR_PER_COIN;
const MAX_BALANCE_MINOR = 9_000_000_000_000;
const MAX_REVISION = 2_147_483_647;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const COMMAND_ID_PATTERN = /^[A-Za-z0-9_-]{8,96}$/;
const AVATARS = new Set(["wanderer", "farmer", "herder"]);
const NICKNAMES = [
  "\u6c5f\u8fb9\u6765\u5ba2", "\u5c71\u95f4\u6765\u5ba2",
  "\u6797\u4e0b\u6765\u5ba2", "\u8c37\u4e2d\u6765\u5ba2",
];
const REGIONS = ["mangshi", "ruili", "yingjiang", "longchuan", "lianghe"];
const CAPABILITIES = Object.freeze({
  registration: true, plots: true, plotPurchase: true, homes: true,
  farming: false, multiplayer: false, redKnots: false,
});

export class WorldStoreError extends Error {
  constructor(status, code) {
    super(code);
    this.name = "WorldStoreError";
    this.status = status;
    this.code = code;
    this.isWorldError = true;
  }
}

const fail = (status, code) => { throw new WorldStoreError(status, code); };
const plainObject = value => value !== null && typeof value === "object"
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const exactKeys = (value, keys) => plainObject(value)
  && Reflect.ownKeys(value).length === keys.length
  && keys.every(key => Object.hasOwn(value, key));
const validId = value => typeof value === "string" && ID_PATTERN.test(value);
const validCommandId = value => typeof value === "string" && COMMAND_ID_PATTERN.test(value);
const validRevision = value => Number.isSafeInteger(value) && value >= 1 && value <= MAX_REVISION;

function validatePlayer(playerId) {
  if (!validId(playerId)) fail(400, "INVALID_PLAYER_ID");
}

function validateRegistration(body) {
  if (!exactKeys(body, ["commandId", "avatarId"])
    || !validCommandId(body.commandId) || !AVATARS.has(body.avatarId)) fail(400, "INVALID_REGISTRATION");
  return { kind: "player.register", avatarId: body.avatarId };
}

function validateCommand(command) {
  if (!exactKeys(command, ["commandId", "kind", "targetId", "expectedRevision", "configVersion", "payload"])
    || !validCommandId(command.commandId) || command.kind !== "plot.purchase"
    || !validId(command.targetId) || !validRevision(command.expectedRevision)
    || typeof command.configVersion !== "string" || !/^[A-Za-z0-9_-]{1,96}$/.test(command.configVersion)
    || !exactKeys(command.payload, [])) fail(400, "INVALID_COMMAND");
  return {
    kind: command.kind, targetId: command.targetId, expectedRevision: command.expectedRevision,
    configVersion: command.configVersion, payload: {},
  };
}

function nicknameFor(playerId) {
  return NICKNAMES[createHash("sha256").update(playerId).digest()[0] % NICKNAMES.length];
}

function verifiedFilename(filename) {
  const requested = path.resolve(filename);
  const physicalParent = realpathSync(path.dirname(requested));
  const physical = path.join(physicalParent, path.basename(requested));
  const comparable = value => process.platform === "win32" ? value.toLowerCase() : value;
  if (process.platform === "win32"
    && comparable(path.parse(requested).root) !== comparable(path.parse(physical).root)) fail(503, "WORLD_STORAGE_PATH_UNSAFE");
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    const candidate = `${physical}${suffix}`;
    let stat;
    try { stat = lstatSync(candidate); }
    catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink > 1
      || comparable(realpathSync(candidate)) !== comparable(candidate)) fail(503, "WORLD_STORAGE_PATH_UNSAFE");
  }
  return physical;
}

export function createWorldStore(options) {
  if (!plainObject(options) || Reflect.ownKeys(options).some(key => !["filename", "now"].includes(key))
    || typeof options.filename !== "string" || options.filename.length === 0 || options.filename.includes("\0")
    || (options.now !== undefined && typeof options.now !== "function")) fail(400, "INVALID_STORE_OPTIONS");
  if (!Number.isSafeInteger(PLOT_PRICE_MINOR) || PLOT_PRICE_MINOR <= 0 || PLOT_PRICE_MINOR > MAX_BALANCE_MINOR) {
    fail(503, "WORLD_CONFIG_INVALID");
  }
  const now = options.now ?? Date.now;
  let db, closed = false;

  function guarded(callback) {
    if (closed) fail(503, "WORLD_STORE_CLOSED");
    try { return callback(); }
    catch (error) {
      if (error instanceof WorldStoreError) throw error;
      throw new WorldStoreError(503, "WORLD_STORAGE_UNAVAILABLE");
    }
  }

  function transaction(callback, write = true) {
    let started = false;
    try {
      db.exec(write ? "BEGIN IMMEDIATE" : "BEGIN");
      started = true;
      const result = callback();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      if (started) {
        try { db.exec("ROLLBACK"); } catch { /* Preserve the original safe failure. */ }
      }
      throw error;
    }
  }

  function serverTime() {
    const value = now();
    if (!Number.isSafeInteger(value) || value < 0) fail(503, "WORLD_CLOCK_UNAVAILABLE");
    return value;
  }

  function createVillage(ordinal) {
    const villageId = `ruili-river-${String(ordinal).padStart(4, "0")}`;
    db.prepare("INSERT INTO villages (village_id, world_id, region_id, ordinal, layout) VALUES (?, ?, 'ruili', ?, 'provisional')")
      .run(villageId, WORLD_ID, ordinal);
    const insert = db.prepare(`INSERT INTO plots
      (plot_id, village_id, revision, origin_x, origin_y, origin_z, bounds_json)
      VALUES (?, ?, 1, ?, 0, 0, ?)`);
    // The gap between these sample plots is reserved for Muse's village road.
    for (const [index, x] of [-18, 18].entries()) {
      const bounds = [
        { x: x - 12, z: -12 }, { x: x + 12, z: -12 },
        { x: x + 12, z: 12 }, { x: x - 12, z: 12 },
      ];
      insert.run(`${villageId}-plot-${String(index + 1).padStart(2, "0")}`, villageId, x, JSON.stringify(bounds));
    }
  }

  function schemaIdentity() {
    const applicationId = db.prepare("PRAGMA application_id").get().application_id;
    const version = db.prepare("PRAGMA user_version").get().user_version;
    if (version !== 0 && version !== SCHEMA_VERSION) fail(503, "WORLD_SCHEMA_UNSUPPORTED");
    if (version === SCHEMA_VERSION) {
      if (applicationId !== APPLICATION_ID) fail(503, "WORLD_STORAGE_IDENTITY_MISMATCH");
      return "owned";
    }
    if (applicationId !== 0 || db.prepare("SELECT 1 FROM sqlite_schema LIMIT 1").get()) {
      fail(503, "WORLD_STORAGE_IDENTITY_MISMATCH");
    }
    return "fresh";
  }

  try {
    const filename = verifiedFilename(options.filename);
    db = new DatabaseSync(filename, { allowExtension: false });
    verifiedFilename(filename);
    db.exec("PRAGMA busy_timeout = 5000");
    transaction(schemaIdentity, false);
    db.exec("PRAGMA foreign_keys = ON");
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA synchronous = FULL");
    transaction(() => {
      if (schemaIdentity() === "owned") return;
      db.exec(`
        CREATE TABLE players (
          player_id TEXT PRIMARY KEY,
          nickname TEXT NOT NULL,
          avatar_id TEXT NOT NULL CHECK (avatar_id IN ('wanderer', 'farmer', 'herder')),
          revision INTEGER NOT NULL CHECK (revision BETWEEN 1 AND ${MAX_REVISION}),
          created_at INTEGER NOT NULL
        ) STRICT;
        CREATE TABLE wallets (
          player_id TEXT PRIMARY KEY REFERENCES players(player_id),
          balance_minor INTEGER NOT NULL CHECK (balance_minor BETWEEN 0 AND ${MAX_BALANCE_MINOR}),
          revision INTEGER NOT NULL CHECK (revision BETWEEN 1 AND ${MAX_REVISION})
        ) STRICT;
        CREATE TABLE villages (
          village_id TEXT PRIMARY KEY,
          world_id TEXT NOT NULL CHECK (world_id = 'dehong'),
          region_id TEXT NOT NULL CHECK (region_id = 'ruili'),
          ordinal INTEGER NOT NULL CHECK (ordinal > 0),
          layout TEXT NOT NULL CHECK (layout = 'provisional'),
          UNIQUE (world_id, region_id, ordinal)
        ) STRICT;
        CREATE TABLE plots (
          plot_id TEXT PRIMARY KEY,
          village_id TEXT NOT NULL REFERENCES villages(village_id),
          owner_player_id TEXT REFERENCES players(player_id),
          revision INTEGER NOT NULL CHECK (revision BETWEEN 1 AND ${MAX_REVISION}),
          origin_x REAL NOT NULL,
          origin_y REAL NOT NULL,
          origin_z REAL NOT NULL,
          bounds_json TEXT NOT NULL
        ) STRICT;
        CREATE TABLE homes (
          home_id TEXT PRIMARY KEY,
          owner_player_id TEXT NOT NULL UNIQUE REFERENCES players(player_id),
          plot_id TEXT NOT NULL UNIQUE REFERENCES plots(plot_id),
          revision INTEGER NOT NULL CHECK (revision BETWEEN 1 AND ${MAX_REVISION})
        ) STRICT;
        CREATE TABLE ledger_transactions (
          transaction_id TEXT PRIMARY KEY,
          player_id TEXT NOT NULL REFERENCES players(player_id),
          command_id TEXT NOT NULL,
          source TEXT NOT NULL CHECK (source IN ('starter', 'plot')),
          created_at INTEGER NOT NULL,
          UNIQUE (player_id, command_id)
        ) STRICT;
        CREATE UNIQUE INDEX one_starter_per_player ON ledger_transactions (player_id) WHERE source = 'starter';
        CREATE TABLE ledger_entries (
          transaction_id TEXT NOT NULL REFERENCES ledger_transactions(transaction_id),
          line INTEGER NOT NULL CHECK (line IN (0, 1)),
          account_kind TEXT NOT NULL CHECK (account_kind IN ('player', 'system')),
          account_id TEXT NOT NULL,
          delta_minor INTEGER NOT NULL CHECK (delta_minor != 0 AND delta_minor BETWEEN -${MAX_BALANCE_MINOR} AND ${MAX_BALANCE_MINOR}),
          PRIMARY KEY (transaction_id, line),
          UNIQUE (transaction_id, account_kind)
        ) STRICT;
        CREATE TABLE command_receipts (
          player_id TEXT NOT NULL,
          command_id TEXT NOT NULL,
          intent_json TEXT NOT NULL,
          receipt_json TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          PRIMARY KEY (player_id, command_id)
        ) STRICT;
        CREATE INDEX village_plots ON plots (village_id, plot_id);
      `);
      createVillage(1);
      db.exec(`PRAGMA application_id = ${APPLICATION_ID}`);
      db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    });
  } catch (error) {
    try { db?.close(); } catch { /* Nothing usable has been returned. */ }
    if (error instanceof WorldStoreError) throw error;
    throw new WorldStoreError(503, "WORLD_STORAGE_UNAVAILABLE");
  }

  const playerRow = playerId => db.prepare("SELECT player_id, nickname, avatar_id, revision FROM players WHERE player_id = ?").get(playerId);
  const walletRow = playerId => db.prepare("SELECT balance_minor, revision FROM wallets WHERE player_id = ?").get(playerId);
  const playerProjection = row => row ? { playerId: row.player_id, nickname: row.nickname, avatarId: row.avatar_id, revision: row.revision } : null;
  const walletProjection = row => row ? { balanceMinor: row.balance_minor, revision: row.revision } : null;
  const plotRow = plotId => db.prepare(`SELECT p.*, v.world_id, v.region_id, v.ordinal, v.layout
    FROM plots p JOIN villages v ON v.village_id = p.village_id WHERE p.plot_id = ?`).get(plotId);
  const ownHomeRow = playerId => db.prepare("SELECT * FROM homes WHERE owner_player_id = ?").get(playerId);

  function homeProjection(home, plot = home && plotRow(home.plot_id)) {
    if (!home) return null;
    const owner = playerRow(home.owner_player_id);
    return {
      homeId: home.home_id,
      owner: { playerId: owner.player_id, nickname: owner.nickname },
      address: { worldId: plot.world_id, regionId: plot.region_id, villageId: plot.village_id, plotId: plot.plot_id },
      revision: home.revision,
      origin: { x: plot.origin_x, y: plot.origin_y, z: plot.origin_z },
      bounds: JSON.parse(plot.bounds_json),
      house: null, beds: [], animals: [],
    };
  }

  function plotProjection(plot) {
    const owner = plot.owner_player_id ? playerRow(plot.owner_player_id) : null;
    const home = db.prepare("SELECT * FROM homes WHERE plot_id = ?").get(plot.plot_id);
    return {
      plotId: plot.plot_id, worldId: plot.world_id, regionId: plot.region_id, villageId: plot.village_id,
      revision: plot.revision, layout: plot.layout,
      origin: { x: plot.origin_x, y: plot.origin_y, z: plot.origin_z },
      bounds: JSON.parse(plot.bounds_json), priceMinor: PLOT_PRICE_MINOR,
      owner: owner ? { playerId: owner.player_id, nickname: owner.nickname } : null,
      home: homeProjection(home, plot),
    };
  }

  function previousReceipt(playerId, commandId, intent) {
    const row = db.prepare("SELECT intent_json, receipt_json FROM command_receipts WHERE player_id = ? AND command_id = ?")
      .get(playerId, commandId);
    if (!row) return null;
    if (row.intent_json !== JSON.stringify(intent)) fail(409, "COMMAND_ID_CONFLICT");
    return JSON.parse(row.receipt_json);
  }

  function saveReceipt(playerId, commandId, intent, receipt) {
    db.prepare("INSERT INTO command_receipts (player_id, command_id, intent_json, receipt_json, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(playerId, commandId, JSON.stringify(intent), JSON.stringify(receipt), receipt.serverTime);
    return receipt;
  }

  function writeLedger(playerId, commandId, source, deltaMinor, time) {
    const transactionId = `tx_${randomUUID()}`;
    db.prepare("INSERT INTO ledger_transactions (transaction_id, player_id, command_id, source, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(transactionId, playerId, commandId, source, time);
    const insert = db.prepare("INSERT INTO ledger_entries (transaction_id, line, account_kind, account_id, delta_minor) VALUES (?, ?, ?, ?, ?)");
    insert.run(transactionId, 0, "player", playerId, deltaMinor);
    insert.run(transactionId, 1, "system", source, -deltaMinor);
  }

  function rejection(playerId, commandId, intent, code, time, result) {
    return saveReceipt(playerId, commandId, intent, {
      commandId, kind: intent.kind, status: "rejected", code,
      configVersion: CONFIG_VERSION, serverTime: time, ...(result ? { result } : {}),
    });
  }

  return {
    getBootstrap(playerId) {
      return guarded(() => {
        validatePlayer(playerId);
        return transaction(() => {
          const player = playerRow(playerId);
          return {
            ok: true, worldId: WORLD_ID, configVersion: CONFIG_VERSION, registered: Boolean(player),
            player: playerProjection(player), wallet: walletProjection(walletRow(playerId)),
            home: homeProjection(ownHomeRow(playerId)),
            catalog: {
              regions: REGIONS.map(id => ({ id })),
              villages: db.prepare("SELECT village_id, world_id, region_id, ordinal, layout FROM villages ORDER BY ordinal").all()
                .map(row => ({ villageId: row.village_id, worldId: row.world_id, regionId: row.region_id, ordinal: row.ordinal, layout: row.layout })),
            },
            economy: { coinMinorPerCoin: COIN_MINOR_PER_COIN, initialGrantMinor: INITIAL_GRANT_MINOR, standardPlotPriceMinor: PLOT_PRICE_MINOR },
            capabilities: { ...CAPABILITIES },
          };
        }, false);
      });
    },

    registerPlayer(playerId, body) {
      return guarded(() => {
        validatePlayer(playerId);
        const intent = validateRegistration(body);
        return transaction(() => {
          const previous = previousReceipt(playerId, body.commandId, intent);
          if (previous) return previous;
          const time = serverTime();
          const existing = playerRow(playerId);
          if (existing) {
            return rejection(playerId, body.commandId, intent, "PLAYER_ALREADY_REGISTERED", time, {
              player: playerProjection(existing), wallet: walletProjection(walletRow(playerId)),
              home: homeProjection(ownHomeRow(playerId)),
            });
          }
          db.prepare("INSERT INTO players (player_id, nickname, avatar_id, revision, created_at) VALUES (?, ?, ?, 1, ?)")
            .run(playerId, nicknameFor(playerId), body.avatarId, time);
          db.prepare("INSERT INTO wallets (player_id, balance_minor, revision) VALUES (?, ?, 1)")
            .run(playerId, INITIAL_GRANT_MINOR);
          writeLedger(playerId, body.commandId, "starter", INITIAL_GRANT_MINOR, time);
          return saveReceipt(playerId, body.commandId, intent, {
            commandId: body.commandId, kind: intent.kind, status: "committed", configVersion: CONFIG_VERSION, serverTime: time,
            result: { player: playerProjection(playerRow(playerId)), wallet: walletProjection(walletRow(playerId)), home: null },
          });
        });
      });
    },

    listPlots(query) {
      return guarded(() => {
        if (!exactKeys(query, ["worldId", "villageId"]) || !validId(query.worldId) || !validId(query.villageId)) fail(400, "INVALID_PLOT_QUERY");
        if (query.worldId !== WORLD_ID) fail(404, "WORLD_NOT_FOUND");
        return transaction(() => {
          const village = db.prepare("SELECT village_id, layout FROM villages WHERE world_id = ? AND village_id = ?").get(query.worldId, query.villageId);
          if (!village) fail(404, "VILLAGE_NOT_FOUND");
          return {
            ok: true, worldId: WORLD_ID, villageId: village.village_id, layout: village.layout,
            plots: db.prepare("SELECT plot_id FROM plots WHERE village_id = ? ORDER BY plot_id").all(query.villageId)
              .map(row => plotProjection(plotRow(row.plot_id))),
          };
        }, false);
      });
    },

    executeCommand(playerId, command) {
      return guarded(() => {
        validatePlayer(playerId);
        const intent = validateCommand(command);
        return transaction(() => {
          const previous = previousReceipt(playerId, command.commandId, intent);
          if (previous) return previous;
          const time = serverTime();
          const reject = code => rejection(playerId, command.commandId, intent, code, time);
          if (!playerRow(playerId)) return reject("PLAYER_NOT_REGISTERED");
          if (command.configVersion !== CONFIG_VERSION) return reject("CONFIG_VERSION_MISMATCH");
          const plot = plotRow(command.targetId);
          if (!plot) return reject("PLOT_NOT_FOUND");
          if (ownHomeRow(playerId)) return reject("HOME_LIMIT_REACHED");
          if (plot.owner_player_id !== null) return reject("PLOT_UNAVAILABLE");
          if (plot.revision !== command.expectedRevision) return reject("PLOT_REVISION_CONFLICT");
          const wallet = walletRow(playerId);
          if (!wallet) throw new Error("Missing wallet");
          if (wallet.balance_minor < PLOT_PRICE_MINOR) return reject("INSUFFICIENT_FUNDS");
          const debit = db.prepare(`UPDATE wallets SET balance_minor = balance_minor - ?, revision = revision + 1
            WHERE player_id = ? AND revision = ? AND balance_minor >= ?`)
            .run(PLOT_PRICE_MINOR, playerId, wallet.revision, PLOT_PRICE_MINOR);
          const assignment = db.prepare(`UPDATE plots SET owner_player_id = ?, revision = revision + 1
            WHERE plot_id = ? AND revision = ? AND owner_player_id IS NULL`)
            .run(playerId, plot.plot_id, plot.revision);
          if (debit.changes !== 1 || assignment.changes !== 1) throw new Error("Atomic purchase conflict");
          const homeId = `home_${randomUUID()}`;
          db.prepare("INSERT INTO homes (home_id, owner_player_id, plot_id, revision) VALUES (?, ?, ?, 1)")
            .run(homeId, playerId, plot.plot_id);
          writeLedger(playerId, command.commandId, "plot", -PLOT_PRICE_MINOR, time);
          const available = db.prepare("SELECT COUNT(*) AS count FROM plots WHERE village_id = ? AND owner_player_id IS NULL").get(plot.village_id).count;
          if (available === 0 && !db.prepare("SELECT village_id FROM villages WHERE world_id = ? AND region_id = ? AND ordinal = ?")
            .get(WORLD_ID, plot.region_id, plot.ordinal + 1)) createVillage(plot.ordinal + 1);
          const purchased = plotRow(plot.plot_id);
          return saveReceipt(playerId, command.commandId, intent, {
            commandId: command.commandId, kind: intent.kind, status: "committed", configVersion: CONFIG_VERSION, serverTime: time,
            result: { wallet: walletProjection(walletRow(playerId)), home: homeProjection(ownHomeRow(playerId), purchased), plot: plotProjection(purchased) },
          });
        });
      });
    },

    getReceipt(playerId, commandId) {
      return guarded(() => {
        validatePlayer(playerId);
        if (!validCommandId(commandId)) fail(400, "INVALID_COMMAND_ID");
        const row = db.prepare("SELECT receipt_json FROM command_receipts WHERE player_id = ? AND command_id = ?").get(playerId, commandId);
        if (!row) fail(404, "RECEIPT_NOT_FOUND");
        return JSON.parse(row.receipt_json);
      });
    },

    close() {
      if (closed) return;
      guarded(() => db.close());
      closed = true;
    },
  };
}
