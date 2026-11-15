import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createWorldStore, WorldStoreError } from "../service/world-store.mjs";
import { createWorldClient } from "../wechat/platform/world-client.js";

const NOW = 1800000000000;
const CONFIG_VERSION = "shared-world-free-v1";
const BASE = "https://world.example.test/anheli";
const SESSION = { playerId: "player-123", sessionToken: "opaque-session-token-123", expiresAt: NOW + 60000, guest: false };
const PLAYER = { playerId: SESSION.playerId, nickname: "Visitor", avatarId: "wanderer", revision: 1 };
const VILLAGE = "ruili-river-0001";
const PLOT = `${VILLAGE}-plot-01`;
const position = { x: 0, y: 0, z: 0 };
const boundary = [{ x: -12, z: -12 }, { x: 12, z: -12 }, { x: 12, z: 12 }, { x: -12, z: 12 }];
const emptyPlot = {
  plotId: PLOT, worldId: "dehong", regionId: "ruili", villageId: VILLAGE,
  revision: 1, priceMinor: 40000, layout: "provisional", origin: position, bounds: boundary, owner: null, home: null,
};
const HOME = {
  homeId: "home-123", owner: { playerId: PLAYER.playerId, nickname: PLAYER.nickname },
  address: { worldId: "dehong", regionId: "ruili", villageId: VILLAGE, plotId: PLOT },
  revision: 1, origin: position, bounds: boundary, house: null, beds: [], animals: [],
};
const purchasedPlot = { ...emptyPlot, revision: 2, owner: HOME.owner, home: HOME };
const bootstrap = registered => ({
  ok: true, worldId: "dehong", configVersion: CONFIG_VERSION, registered,
  player: registered ? PLAYER : null, wallet: registered ? { balanceMinor: 100000, revision: 1 } : null, home: null,
  catalog: {
    regions: ["ruili", "mangshi", "longchuan", "yingjiang", "lianghe"].map(id => ({ id })),
    villages: [{ villageId: VILLAGE, worldId: "dehong", regionId: "ruili", ordinal: 1, layout: "provisional" }],
  },
  economy: { coinMinorPerCoin: 100, initialGrantMinor: 100000, standardPlotPriceMinor: 40000 },
  capabilities: { registration: true, plots: true, plotPurchase: true, homes: true, farming: false, multiplayer: false, redKnots: false },
});
const registerReceipt = commandId => ({
  ok: true, receipt: {
    commandId, kind: "player.register", status: "committed", configVersion: CONFIG_VERSION, serverTime: NOW,
    result: { player: PLAYER, wallet: { balanceMinor: 100000, revision: 1 }, home: null },
  },
});
const purchaseReceipt = commandId => ({
  ok: true, receipt: {
    commandId, kind: "plot.purchase", status: "committed", configVersion: CONFIG_VERSION, serverTime: NOW,
    result: { wallet: { balanceMinor: 60000, revision: 2 }, home: HOME, plot: purchasedPlot },
  },
});

function fixture(options = {}) {
  let identity = { ...SESSION };
  const calls = [];
  const wxApi = { request(value) { calls.push(value); return { abort() {} }; } };
  const client = createWorldClient(wxApi, { backendBaseUrl: BASE }, { getSession: () => identity, now: () => NOW, ...options });
  return { client, wxApi, calls, setSession(value) { identity = value; } };
}
const respond = (call, data, statusCode = 200) => call.success({ statusCode, data });

test("world requests require a configured HTTPS backend and a current authenticated session", async () => {
  for (const [backendBaseUrl, code] of [
    ["", "BACKEND_NOT_CONFIGURED"], ["http://world.example.test", "INVALID_BACKEND_URL"],
    ["https://user:secret@world.example.test", "INVALID_BACKEND_URL"], ["https://world.example.test?token=secret", "INVALID_BACKEND_URL"],
  ]) {
    const calls = [];
    const client = createWorldClient({ request(value) { calls.push(value); } }, { backendBaseUrl }, { getSession: () => SESSION, now: () => NOW });
    assert.equal((await client.getBootstrap()).error.code, code);
    assert.equal(calls.length, 0);
  }
  for (const identity of [null, { ...SESSION, guest: true }, { ...SESSION, expiresAt: NOW }, { ...SESSION, sessionToken: "bad\ntoken-value-12345" }]) {
    const f = fixture(); f.setSession(identity);
    assert.equal((await f.client.getBootstrap()).error.code, "SESSION_REQUIRED");
    assert.equal(f.calls.length, 0);
  }
});

test("bootstrap accepts unregistered accounts without manufacturing a wallet and binds confirmed profiles", async () => {
  const f = fixture();
  const pending = f.client.getBootstrap();
  assert.equal(f.calls[0].url, `${BASE}/v2/world/bootstrap`);
  assert.equal(f.calls[0].method, "GET");
  assert.equal(f.calls[0].header.Authorization, `Bearer ${SESSION.sessionToken}`);
  assert.equal(f.calls[0].timeout, 10000);
  assert.equal(Object.hasOwn(f.calls[0], "data"), false);
  assert.equal(f.calls[0].url.includes(SESSION.sessionToken), false);
  respond(f.calls[0], bootstrap(false));
  assert.deepEqual(await pending, { ok: true, data: bootstrap(false), source: "server", cloudSynced: true });
  const next = f.client.getBootstrap();
  respond(f.calls[1], bootstrap(true));
  assert.equal((await next).data.wallet.balanceMinor, 100000);
  const mismatch = f.client.getBootstrap();
  respond(f.calls[2], { ...bootstrap(true), player: { ...PLAYER, playerId: "other-player" } });
  assert.equal((await mismatch).error.code, "INVALID_RESPONSE");
});

test("register, plots, purchase and receipt requests use frozen server contract without sending balances or identity", async () => {
  const f = fixture();
  const registration = f.client.registerPlayer({ commandId: "register-0001", avatarId: "wanderer" });
  assert.equal(f.calls[0].url, `${BASE}/v2/world/register`);
  assert.deepEqual(f.calls[0].data, { commandId: "register-0001", avatarId: "wanderer" });
  respond(f.calls[0], registerReceipt("register-0001"));
  assert.equal((await registration).data.receipt.status, "committed");
  const listing = f.client.listPlots({ worldId: "dehong", villageId: VILLAGE });
  assert.equal(f.calls[1].url, `${BASE}/v2/world/plots?worldId=dehong&villageId=${VILLAGE}`);
  respond(f.calls[1], { ok: true, worldId: "dehong", villageId: VILLAGE, layout: "provisional", plots: [emptyPlot, purchasedPlot] });
  assert.equal((await listing).data.plots.length, 2);
  const buying = f.client.purchasePlot({ commandId: "purchase-0001", plotId: PLOT, expectedRevision: 1, configVersion: CONFIG_VERSION });
  assert.equal(f.calls[2].url, `${BASE}/v2/world/commands`);
  assert.deepEqual(f.calls[2].data, { commandId: "purchase-0001", kind: "plot.purchase", targetId: PLOT, expectedRevision: 1, configVersion: CONFIG_VERSION, payload: {} });
  respond(f.calls[2], purchaseReceipt("purchase-0001"));
  assert.equal((await buying).data.receipt.result.wallet.balanceMinor, 60000);
  const receipt = f.client.getReceipt("purchase-0001");
  assert.equal(f.calls[3].url, `${BASE}/v2/world/receipts/purchase-0001`);
  respond(f.calls[3], purchaseReceipt("purchase-0001"));
  assert.equal((await receipt).data.receipt.result.home.homeId, HOME.homeId);
  assert.ok(f.calls.every(call => call.header.Authorization === `Bearer ${SESSION.sessionToken}`));
  assert.ok(f.calls.filter(call => call.data).every(call => !Object.hasOwn(call.data, "playerId") && !Object.hasOwn(call.data, "balanceMinor")));
});

test("network retries preserve the caller's command and business rejection remains a rejected receipt", async () => {
  const f = fixture();
  const intent = { commandId: "purchase-retry", plotId: PLOT, expectedRevision: 1, configVersion: CONFIG_VERSION };
  const pending = f.client.purchasePlot(intent);
  f.calls[0].fail({ errMsg: "request:fail socket closed private-details" });
  const failed = await pending;
  assert.deepEqual(failed, { ok: false, error: { code: "NETWORK_FAILED", message: "连接暂时中断，请使用原操作重试。", retryable: true } });
  assert.equal(f.calls.length, 1);
  const retry = f.client.purchasePlot(intent);
  assert.deepEqual(f.calls[1].data, f.calls[0].data);
  respond(f.calls[1], {
    ok: true, receipt: { commandId: intent.commandId, kind: "plot.purchase", status: "rejected", code: "PLOT_UNAVAILABLE", configVersion: CONFIG_VERSION, serverTime: NOW },
  });
  const rejected = await retry;
  assert.equal(rejected.ok, true);
  assert.equal(rejected.data.receipt.status, "rejected");
  assert.equal(rejected.data.receipt.code, "PLOT_UNAVAILABLE");
  assert.equal(Object.hasOwn(rejected.data.receipt, "result"), false);
  assert.equal(f.calls.length, 2);
});

test("rejected receipts validate any returned profile, wallet, home and plot without requiring the requested config", async () => {
  const clean = { player: PLAYER, wallet: { balanceMinor: 100000, revision: 1 }, home: null };
  for (const result of [
    null,
    { ...clean, player: { ...PLAYER, playerId: "other-player" } },
    { ...clean, wallet: { balanceMinor: -1, revision: 1 } },
    { ...clean, home: { ...HOME, owner: { playerId: "other-player", nickname: "Other" } } },
    { ...clean, plot: { ...purchasedPlot, owner: { playerId: "other-player", nickname: "Other" }, home: { ...HOME, owner: { playerId: "other-player", nickname: "Other" } } } },
    { ...clean, plot: emptyPlot },
  ]) {
    const f = fixture();
    const pending = f.client.registerPlayer({ commandId: "register-rejected", avatarId: "wanderer" });
    respond(f.calls[0], {
      ok: true, receipt: {
        commandId: "register-rejected", kind: "player.register", status: "rejected",
        code: "PLAYER_ALREADY_REGISTERED", configVersion: CONFIG_VERSION, serverTime: NOW, result,
      },
    });
    const response = await pending;
    assert.equal(response.error.code, "INVALID_RESPONSE");
    assert.equal(Object.hasOwn(response, "cloudSynced"), false);
  }
  const f = fixture();
  const pending = f.client.registerPlayer({ commandId: "register-rejected", avatarId: "wanderer" });
  respond(f.calls[0], {
    ok: true, receipt: {
      commandId: "register-rejected", kind: "player.register", status: "rejected",
      code: "PLAYER_ALREADY_REGISTERED", configVersion: CONFIG_VERSION, serverTime: NOW, result: clean,
    },
  });
  assert.equal((await pending).data.receipt.status, "rejected");
  const mismatch = f.client.purchasePlot({ commandId: "purchase-old-config", plotId: PLOT, expectedRevision: 1, configVersion: "old-config" });
  respond(f.calls[1], {
    ok: true, receipt: {
      commandId: "purchase-old-config", kind: "plot.purchase", status: "rejected",
      code: "CONFIG_VERSION_MISMATCH", configVersion: CONFIG_VERSION, serverTime: NOW,
    },
  });
  assert.equal((await mismatch).data.receipt.code, "CONFIG_VERSION_MISMATCH");
});

test("request timeout settles once, aborts transport and never automatically retries", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = fixture();
  let aborted = 0;
  f.wxApi.request = value => { f.calls.push(value); return { abort() { aborted += 1; } }; };
  const pending = f.client.registerPlayer({ commandId: "register-timeout", avatarId: "farmer" });
  t.mock.timers.tick(10000);
  assert.equal((await pending).error.code, "NETWORK_TIMEOUT");
  assert.equal(aborted, 1);
  respond(f.calls[0], registerReceipt("register-timeout"));
  f.calls[0].fail({});
  assert.equal(f.calls.length, 1);
});

test("sign out, account changes, token renewal and expiry reject pending responses", async () => {
  for (const identity of [null, { ...SESSION, playerId: "other-player" }, { ...SESSION, sessionToken: "renewed-session-token-456" }, { ...SESSION, expiresAt: NOW }]) {
    const f = fixture();
    const pending = f.client.getBootstrap();
    f.setSession(identity);
    respond(f.calls[0], bootstrap(true));
    assert.equal((await pending).error.code, "SESSION_CHANGED");
  }
  let time = NOW;
  const f = fixture({ now: () => time });
  const pending = f.client.getBootstrap();
  time += 60000;
  respond(f.calls[0], bootstrap(true));
  assert.equal((await pending).error.code, "SESSION_CHANGED");
});

test("disposal immediately cancels pending requests and ignores late or duplicate callbacks", async () => {
  const f = fixture();
  let aborted = 0;
  f.wxApi.request = value => { f.calls.push(value); return { abort() { aborted += 1; } }; };
  const pending = f.client.getBootstrap();
  f.client.dispose();
  f.client.dispose();
  assert.equal((await pending).error.code, "CANCELLED");
  assert.equal(aborted, 1);
  respond(f.calls[0], bootstrap(true));
  assert.equal((await f.client.getBootstrap()).error.code, "CANCELLED");
  assert.equal(f.calls.length, 1);
});

test("invalid response, mismatched receipt and fractional wallet cannot become confirmed world state", async () => {
  for (const data of [
    null, { ok: false }, { ...bootstrap(false), wallet: { balanceMinor: 100000, revision: 1 } },
    { ...bootstrap(true), wallet: { balanceMinor: 1000.5, revision: 1 } },
    { ...bootstrap(true), wallet: { balanceMinor: 100000, revision: 2147483648 } },
    { ...bootstrap(true), home: { ...HOME, owner: { playerId: "other-player", nickname: "Other" } } },
  ]) {
    const f = fixture();
    const pending = f.client.getBootstrap(); respond(f.calls[0], data);
    const result = await pending;
    assert.equal(result.error.code, "INVALID_RESPONSE");
    assert.equal(Object.hasOwn(result, "cloudSynced"), false);
  }
  for (const data of [
    purchaseReceipt("other-command"),
    { ...registerReceipt("purchase-invalid"), receipt: { ...registerReceipt("purchase-invalid").receipt } },
    { ok: true, receipt: { ...purchaseReceipt("purchase-invalid").receipt, result: { wallet: { balanceMinor: 60000, revision: 2 } } } },
    { ok: true, receipt: { ...purchaseReceipt("purchase-invalid").receipt, result: { ...purchaseReceipt("purchase-invalid").receipt.result, wallet: { balanceMinor: -1, revision: 2 } } } },
    { ok: true, receipt: { ...purchaseReceipt("purchase-invalid").receipt, configVersion: "other-config" } },
    { ok: true, receipt: { ...purchaseReceipt("purchase-invalid").receipt, result: { ...purchaseReceipt("purchase-invalid").receipt.result, plot: { ...purchasedPlot, plotId: "other-plot" } } } },
  ]) {
    const f = fixture();
    const pending = f.client.purchasePlot({ commandId: "purchase-invalid", plotId: PLOT, expectedRevision: 1, configVersion: CONFIG_VERSION });
    respond(f.calls[0], data);
    assert.equal((await pending).error.code, "INVALID_RESPONSE");
  }
});

test("public plots permit another owner without switching the authenticated player", async () => {
  const f = fixture();
  const neighbour = { ...purchasedPlot, owner: { playerId: "neighbour", nickname: "Neighbour" }, home: { ...HOME, owner: { playerId: "neighbour", nickname: "Neighbour" } } };
  const pending = f.client.listPlots({ worldId: "dehong", villageId: VILLAGE });
  respond(f.calls[0], { ok: true, worldId: "dehong", villageId: VILLAGE, layout: "provisional", plots: [neighbour] });
  const result = await pending;
  assert.equal(result.data.plots[0].owner.playerId, "neighbour");
  const bootstrapPending = f.client.getBootstrap();
  respond(f.calls[1], bootstrap(true));
  assert.equal((await bootstrapPending).data.player.playerId, SESSION.playerId);
});

test("HTTP failures expose safe codes with generic messages and no server details", async () => {
  for (const [status, code, retryable] of [[404, "RECEIPT_NOT_FOUND", false], [401, "SESSION_INVALID", false], [503, "WORLD_BUSY", true]]) {
    const f = fixture();
    const pending = f.client.getReceipt("receipt-missing");
    respond(f.calls[0], { error: { code, message: "private database details" } }, status);
    const result = await pending;
    assert.equal(result.ok, false);
    assert.equal(result.error.code, code);
    assert.equal(result.error.retryable, retryable);
    assert.equal(JSON.stringify(result).includes("private"), false);
    assert.equal(Object.hasOwn(result, "cloudSynced"), false);
  }
});

test("invalid operation arguments cannot transmit arbitrary fields, prices or URL fragments", async () => {
  const f = fixture();
  for (const value of [undefined, {}, { commandId: "short", avatarId: "wanderer" }, { commandId: "register-valid", avatarId: "unknown" },
    { commandId: "register-valid", avatarId: "farmer", playerId: "claimed" }]) {
    assert.equal((await f.client.registerPlayer(value)).error.code, "INVALID_REQUEST");
  }
  for (const value of [undefined, { worldId: "other", villageId: VILLAGE }, { worldId: "dehong", villageId: "../private" }]) {
    assert.equal((await f.client.listPlots(value)).error.code, "INVALID_REQUEST");
  }
  for (const value of [
    { commandId: "purchase-valid", plotId: PLOT, expectedRevision: -1, configVersion: CONFIG_VERSION },
    { commandId: "purchase-valid", plotId: PLOT, expectedRevision: 0, configVersion: CONFIG_VERSION },
    { commandId: "purchase-valid", plotId: PLOT, expectedRevision: 2147483648, configVersion: CONFIG_VERSION },
    { commandId: "purchase-valid", plotId: PLOT, expectedRevision: Number.MAX_SAFE_INTEGER, configVersion: CONFIG_VERSION },
    { commandId: "purchase-valid", plotId: PLOT, expectedRevision: 1, configVersion: CONFIG_VERSION, priceMinor: 0 },
    { commandId: "purchase-valid", plotId: PLOT, expectedRevision: 1, configVersion: "config.with-dots" },
    { commandId: "purchase-valid", plotId: PLOT, expectedRevision: 1, configVersion: "c".repeat(97) },
  ]) assert.equal((await f.client.purchasePlot(value)).error.code, "INVALID_REQUEST");
  assert.equal((await f.client.getReceipt("x?token=private")).error.code, "INVALID_REQUEST");
  assert.equal(f.calls.length, 0);
});

test("plot revisions and config versions use the same positive bounded contract as the store", async () => {
  for (const plotRevision of [0, -1, 2147483648, Number.MAX_SAFE_INTEGER]) {
    const f = fixture();
    const pending = f.client.listPlots({ worldId: "dehong", villageId: VILLAGE });
    respond(f.calls[0], { ok: true, worldId: "dehong", villageId: VILLAGE, plots: [{ ...emptyPlot, revision: plotRevision }] });
    assert.equal((await pending).error.code, "INVALID_RESPONSE");
  }
  const f = fixture();
  const longestVersion = "c".repeat(96);
  const pending = f.client.purchasePlot({ commandId: "purchase-boundary", plotId: PLOT, expectedRevision: 2147483647, configVersion: longestVersion });
  assert.equal(f.calls[0].data.expectedRevision, 2147483647);
  assert.equal(f.calls[0].data.configVersion, longestVersion);
  respond(f.calls[0], {
    ok: true, receipt: {
      commandId: "purchase-boundary", kind: "plot.purchase", status: "rejected",
      code: "CONFIG_VERSION_MISMATCH", configVersion: CONFIG_VERSION, serverTime: NOW,
    },
  });
  assert.equal((await pending).data.receipt.status, "rejected");
});

test("a synchronous transport and repeated callbacks settle only the first confirmed result", async () => {
  const f = fixture();
  f.wxApi.request = call => {
    f.calls.push(call);
    respond(call, bootstrap(true));
    respond(call, bootstrap(false));
    call.fail({ errMsg: "late failure" });
    return { abort() {} };
  };
  const result = await f.client.getBootstrap();
  assert.equal(result.data.registered, true);
  assert.equal(result.data.wallet.balanceMinor, 100000);
  assert.equal(f.calls.length, 1);
  f.wxApi.request = () => { throw new Error("private transport details"); };
  const failed = await f.client.getBootstrap();
  assert.equal(failed.error.code, "NETWORK_FAILED");
  assert.equal(JSON.stringify(failed).includes("private"), false);
});

test("caller mutations cannot change an in-flight command's expected identity", async () => {
  const f = fixture();
  const intent = { commandId: "purchase-immutable", plotId: PLOT, expectedRevision: 1, configVersion: CONFIG_VERSION };
  const pending = f.client.purchasePlot(intent);
  intent.commandId = "purchase-changed";
  intent.plotId = "other-plot";
  respond(f.calls[0], purchaseReceipt("purchase-immutable"));
  assert.equal((await pending).data.receipt.commandId, "purchase-immutable");
});

test("client contracts round trip through the real SQLite store with durable grant, purchase and replay", async t => {
  const root = fileURLToPath(new URL("../reports/world-client-tests/", import.meta.url));
  await mkdir(root, { recursive: true });
  const physicalRoot = await realpath(root);
  assert.equal(path.parse(physicalRoot).root.toUpperCase(), "D:\\");
  const directory = await mkdtemp(path.join(physicalRoot, "case-"));
  const filename = path.join(directory, "world.sqlite");
  const stores = [];
  const open = () => {
    const next = createWorldStore({ filename, now: () => NOW });
    stores.push(next);
    return next;
  };
  let store;
  let client;
  t.after(async () => {
    client?.dispose();
    for (const opened of stores) opened.close();
    const physicalDirectory = await realpath(directory);
    const relative = path.relative(physicalRoot, physicalDirectory);
    assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative));
    await rm(physicalDirectory, { recursive: true, force: true });
  });
  store = open();
  const calls = [];
  const wxApi = {
    request(call) {
      calls.push(call);
      assert.equal(call.header.Authorization, `Bearer ${SESSION.sessionToken}`);
      const url = new URL(call.url);
      const route = url.pathname.slice("/anheli".length);
      let response;
      let statusCode = 200;
      try {
        if (call.method === "GET" && route === "/v2/world/bootstrap") response = store.getBootstrap(SESSION.playerId);
        else if (call.method === "POST" && route === "/v2/world/register") {
          response = { ok: true, receipt: store.registerPlayer(SESSION.playerId, call.data) };
        } else if (call.method === "GET" && route === "/v2/world/plots") {
          response = store.listPlots({ worldId: url.searchParams.get("worldId"), villageId: url.searchParams.get("villageId") });
        } else if (call.method === "POST" && route === "/v2/world/commands") {
          response = { ok: true, receipt: store.executeCommand(SESSION.playerId, call.data) };
        } else if (call.method === "GET" && route.startsWith("/v2/world/receipts/")) {
          response = { ok: true, receipt: store.getReceipt(SESSION.playerId, decodeURIComponent(route.slice("/v2/world/receipts/".length))) };
        } else assert.fail(`Unexpected world request: ${call.method} ${route}`);
      } catch (error) {
        if (!(error instanceof WorldStoreError)) throw error;
        statusCode = error.status;
        response = { ok: false, error: { code: error.code } };
      }
      respond(call, JSON.parse(JSON.stringify(response)), statusCode);
      return { abort() {} };
    },
  };
  client = createWorldClient(wxApi, { backendBaseUrl: BASE }, { getSession: () => SESSION, now: () => NOW });

  const initial = await client.getBootstrap();
  assert.equal(initial.ok, true);
  assert.equal(initial.data.registered, false);
  assert.equal(initial.data.wallet, null);
  const registered = await client.registerPlayer({ commandId: "actual-register-01", avatarId: "farmer" });
  assert.equal(registered.ok, true);
  assert.equal(registered.data.receipt.status, "committed");
  assert.equal(registered.data.receipt.result.player.playerId, SESSION.playerId);
  assert.equal(registered.data.receipt.result.player.avatarId, "farmer");
  assert.equal(registered.data.receipt.result.wallet.balanceMinor, 100000);
  const listed = await client.listPlots({ worldId: "dehong", villageId: VILLAGE });
  assert.equal(listed.ok, true);
  assert.equal(listed.data.plots.length, 2);
  const land = listed.data.plots[0];
  const intent = { commandId: "actual-purchase-01", plotId: land.plotId, expectedRevision: land.revision, configVersion: initial.data.configVersion };
  const purchased = await client.purchasePlot(intent);
  assert.equal(purchased.ok, true);
  assert.equal(purchased.cloudSynced, true);
  assert.equal(purchased.data.receipt.status, "committed");
  assert.equal(purchased.data.receipt.result.wallet.balanceMinor, 60000);
  assert.equal(purchased.data.receipt.result.home.address.plotId, land.plotId);
  assert.equal(purchased.data.receipt.result.plot.revision, land.revision + 1);
  assert.deepEqual((await client.getReceipt(intent.commandId)).data, purchased.data);
  assert.deepEqual((await client.purchasePlot(intent)).data, purchased.data);
  assert.equal((await client.purchasePlot({ ...intent, expectedRevision: land.revision + 1 })).error.code, "COMMAND_ID_CONFLICT");

  store.close();
  store = open();
  const restarted = await client.getBootstrap();
  assert.equal(restarted.ok, true);
  assert.equal(restarted.data.wallet.balanceMinor, 60000);
  assert.deepEqual(restarted.data.home, purchased.data.receipt.result.home);
  assert.deepEqual((await client.getReceipt(intent.commandId)).data, purchased.data);
  const repeatedRegistration = await client.registerPlayer({ commandId: "actual-register-02", avatarId: "herder" });
  assert.equal(repeatedRegistration.ok, true);
  assert.equal(repeatedRegistration.data.receipt.status, "rejected");
  assert.equal(repeatedRegistration.data.receipt.code, "PLAYER_ALREADY_REGISTERED");
  assert.equal((await client.getBootstrap()).data.wallet.balanceMinor, 60000);
  assert.equal((await client.getReceipt("actual-missing-receipt")).error.code, "RECEIPT_NOT_FOUND");
  assert.ok(calls.length >= 10);
});
