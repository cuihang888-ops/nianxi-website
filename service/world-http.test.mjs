import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { request } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createWechatAuthServer } from "./wechat-auth.mjs";
import { createAuthInspector, createWorldServer } from "./world-http.mjs";
import { createWorldStore } from "./world-store.mjs";

const ROOT = await realpath(fileURLToPath(new URL("..", import.meta.url)));
const NOW = 1_800_000_000_000;
const APP_ID = "wx1234567890abcdef";
const APP_SECRET = "abcdef0123456789abcdef0123456789";
const PLAYER_SECRET = "test-only-world-identity-key-0123456789-ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const CONFIG_VERSION = "shared-world-free-v1";

async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return `http://127.0.0.1:${server.address().port}`;
}

async function close(server) {
  if (!server?.listening) return;
  const closed = once(server, "close");
  server.close();
  server.closeAllConnections();
  await closed;
}

async function fixture(t, options = {}) {
  const { onInspect = () => {}, ...serverOptions } = options;
  const parent = path.join(ROOT, "reports", "world-http-tests");
  if (process.platform === "win32") assert.match(parent, /^d:/i);
  await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(path.join(parent, "case-"));
  const filename = path.join(directory, "world.sqlite");
  const store = createWorldStore({ filename, now: () => NOW });
  const auth = createWechatAuthServer({
    env: {}, enabled: true, appId: APP_ID, appSecret: APP_SECRET, playerIdSecret: PLAYER_SECRET,
    now: () => NOW, loginsPerMinute: 100,
    fetch: async url => Response.json({
      openid: url.searchParams.get("js_code").startsWith("player-beta") ? "openid-world-beta" : "openid-world-alpha",
      session_key: Buffer.alloc(16, 7).toString("base64"),
    }),
  });
  const authBase = await listen(auth);
  const inspector = createAuthInspector({ url: `${authBase}/v1/auth/session`, now: () => NOW });
  const authenticate = async token => {
    const session = await inspector(token);
    onInspect(session);
    return session;
  };
  const server = createWorldServer({ store, enabled: true, authenticate, now: () => NOW, ...serverOptions });
  const base = await listen(server);
  t.after(async () => {
    await close(server);
    await close(auth);
    store.close();
    const physical = await realpath(directory);
    assert.equal(path.dirname(physical), await realpath(parent));
    await rm(physical, { recursive: true });
  });
  const call = async (endpoint, { method = "GET", body, token, raw, headers = {} } = {}) => {
    const response = await fetch(`${base}${endpoint}`, {
      method,
      headers: { ...(body !== undefined || raw !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
      ...(body !== undefined || raw !== undefined ? { body: raw ?? JSON.stringify(body) } : {}),
    });
    return { status: response.status, headers: response.headers, data: await response.json() };
  };
  const login = async code => {
    const response = await fetch(`${authBase}/v1/auth/wechat/session`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }),
    });
    assert.equal(response.status, 200);
    return response.json();
  };
  const register = (session, commandId = "register-alpha-001") => call("/v2/world/register", {
    method: "POST", token: session.sessionToken, body: { commandId, avatarId: "farmer" },
  });
  return { base, authBase, store, call, login, register };
}

test("world service is disabled by default and rejects missing auth configuration", async t => {
  for (const options of [{ enabled: false }, { authenticate: createAuthInspector({ url: "" }) }, { store: null }]) {
    const { call, login } = await fixture(t, options);
    const session = await login("player-alpha-config");
    const response = await call("/v2/world/bootstrap", { token: session.sessionToken });
    assert.equal(response.status, 503);
    assert.equal(response.data.error.code, "WORLD_UNCONFIGURED");
    const health = await call("/v2/world/health");
    assert.equal(health.status, 200);
    assert.equal(health.data.service, "anheli-shared-world");
  }
});

test("real auth exchange connects registration, persistent purchase and private receipts", async t => {
  const { call, login, register, authBase, store } = await fixture(t);
  const a = await login("player-alpha-first-device");
  const b = await login("player-beta-first-device");
  assert.notEqual(a.playerId, b.playerId);
  const bootstrap = await call("/v2/world/bootstrap", { token: a.sessionToken });
  assert.equal(bootstrap.status, 200);
  assert.equal(bootstrap.data.registered, false);
  assert.equal(bootstrap.data.wallet, null);
  const first = await register(a);
  assert.equal(first.status, 200);
  assert.equal(first.data.receipt.status, "committed");
  assert.equal(first.data.receipt.result.wallet.balanceMinor, 100000);
  assert.deepEqual((await register(a)).data, first.data);
  assert.equal((await register(b, "register-beta-0001")).data.receipt.status, "committed");
  const plots = await call("/v2/world/plots?worldId=dehong&villageId=ruili-river-0001", { token: a.sessionToken });
  assert.equal(plots.status, 200);
  const plot = plots.data.plots[0];
  assert.equal(plot.priceMinor, 40000);
  const command = {
    commandId: "purchase-alpha-001", kind: "plot.purchase", targetId: plot.plotId,
    expectedRevision: plot.revision, configVersion: CONFIG_VERSION, payload: {},
  };
  const purchase = await call("/v2/world/commands", { method: "POST", token: a.sessionToken, body: command });
  assert.equal(purchase.status, 200);
  assert.equal(purchase.data.receipt.status, "committed");
  assert.equal(purchase.data.receipt.result.wallet.balanceMinor, 60000);
  assert.deepEqual((await call("/v2/world/commands", { method: "POST", token: a.sessionToken, body: command })).data, purchase.data);
  const competitor = await call("/v2/world/commands", { method: "POST", token: b.sessionToken, body: { ...command, commandId: "purchase-beta-0001" } });
  assert.equal(competitor.status, 200);
  assert.equal(competitor.data.receipt.status, "rejected");
  assert.equal(store.getBootstrap(b.playerId).wallet.balanceMinor, 100000);
  const bReceipt = await call("/v2/world/receipts/purchase-alpha-001", { token: b.sessionToken });
  assert.equal(bReceipt.status, 404);
  const publicPlots = await call("/v2/world/plots?worldId=dehong&villageId=ruili-river-0001", { token: b.sessionToken });
  assert.equal(publicPlots.data.plots[0].owner.playerId, a.playerId);
  for (const secret of [a.sessionToken, APP_SECRET, "openid-world-alpha", "balanceMinor"]) {
    assert.equal(JSON.stringify(publicPlots.data).includes(secret), false);
  }
  const secondDevice = await login("player-alpha-second-device");
  assert.equal(secondDevice.playerId, a.playerId);
  const repeat = await register(secondDevice, "register-alpha-002");
  assert.equal(repeat.data.receipt.status, "rejected");
  assert.equal(repeat.data.receipt.code, "PLAYER_ALREADY_REGISTERED");
  assert.equal(store.getBootstrap(a.playerId).wallet.balanceMinor, 60000);
  const logout = await fetch(`${authBase}/v1/auth/logout`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${a.sessionToken}` }, body: "{}",
  });
  assert.equal(logout.status, 200);
  assert.equal((await call("/v2/world/bootstrap", { token: a.sessionToken })).status, 401);
  assert.equal((await call("/v2/world/bootstrap", { token: secondDevice.sessionToken })).status, 200);
  assert.equal(purchase.headers.get("cache-control"), "no-store");
  assert.equal(purchase.headers.get("access-control-allow-origin"), null);
});

test("anonymous identities, forged ownership, malformed bodies and unsafe requests fail closed", async t => {
  const { call, login, register, base } = await fixture(t, { requestsPerMinute: 1000 });
  assert.equal((await call("/v2/world/bootstrap")).status, 401);
  assert.equal((await call("/v2/world/bootstrap", { token: "x".repeat(43) })).status, 401);
  const session = await login("player-alpha-validation");
  assert.equal((await register(session)).status, 200);
  for (const body of [null, [], {}, { commandId: "bad", avatarId: "farmer" },
    { commandId: "register-forged-001", avatarId: "farmer", playerId: "forged-player" }]) {
    const result = await call("/v2/world/register", { method: "POST", token: session.sessionToken, body });
    assert.equal(result.status, 400);
  }
  assert.equal((await call("/v2/world/register", { method: "POST", token: session.sessionToken, raw: "{" })).status, 400);
  assert.equal((await call("/v2/world/register", { method: "POST", token: session.sessionToken, raw: "x".repeat(5000) })).status, 413);
  assert.equal((await call("/v2/world/register", { method: "POST", token: session.sessionToken, raw: "{}", headers: { "Content-Type": "text/plain" } })).status, 415);
  assert.equal((await call("/v2/world/register", { method: "POST", token: session.sessionToken, body: {}, headers: { "Content-Encoding": "gzip" } })).status, 415);
  assert.equal((await call("/v2/world/register", { token: session.sessionToken })).status, 405);
  for (const endpoint of ["/v2/world/bootstrap?token=secret", "/v2/world/plots?worldId=dehong&villageId=ruili-river-0001&playerId=forged",
    "/v2/world/plots?worldId=dehong&worldId=dehong&villageId=ruili-river-0001"]) {
    assert.equal((await call(endpoint, { token: session.sessionToken })).status, 400);
  }
  const duplicate = await new Promise((resolve, reject) => {
    const req = request(`${base}/v2/world/bootstrap`, {
      headers: ["Host", new URL(base).host, "Authorization", `Bearer ${session.sessionToken}`, "Authorization", `Bearer ${session.sessionToken}`],
    }, response => { response.resume(); resolve(response.statusCode); });
    req.on("error", reject);
    req.end();
  });
  assert.equal(duplicate, 401);
});

test("world auth inspection refuses unsafe destinations and bounds upstream behavior", async () => {
  for (const url of ["", "http://example.com/v1/auth/session", "https://example.com/v1/auth/session?token=secret",
    "https://name:secret@example.com/v1/auth/session", "https://example.com/wrong"]) {
    const inspect = createAuthInspector({ url, fetch: () => { throw Error("must not send"); } });
    assert.equal(inspect.configured, false);
    await assert.rejects(inspect("x".repeat(43)), { code: "WORLD_AUTH_UNCONFIGURED" });
  }
  for (const result of [Response.json({ ok: true, playerId: "id", expiresAt: NOW }),
    Response.json({ ok: true, playerId: "bad id", expiresAt: NOW + 1000 }),
    new Response("bad"), new Response("x".repeat(3000)), new Response("upstream secret", { status: 500 })]) {
    const inspect = createAuthInspector({ url: "http://127.0.0.1:4108/v1/auth/session", now: () => NOW, fetch: async () => result });
    await assert.rejects(inspect("x".repeat(43)), error => ["SESSION_INVALID", "WORLD_AUTH_UNAVAILABLE"].includes(error.code));
  }
  let signal;
  const timeout = createAuthInspector({
    url: "http://127.0.0.1:4108/v1/auth/session", timeoutMs: 20,
    fetch: async (_, init) => { signal = init.signal; return new Promise(() => {}); },
  });
  await assert.rejects(timeout("x".repeat(43)), { code: "WORLD_AUTH_UNAVAILABLE" });
  assert.equal(signal.aborted, true);
});

test("world request limits do not mutate state and SQL errors never reach clients", async t => {
  const limited = await fixture(t, { requestsPerMinute: 1 });
  const session = await limited.login("player-alpha-rate-limit");
  assert.equal((await limited.call("/v2/world/bootstrap", { token: session.sessionToken })).status, 200);
  const limit = await limited.register(session);
  assert.equal(limit.status, 429);
  assert.equal(limited.store.getBootstrap(session.playerId).registered, false);

  const broken = await fixture(t, { store: { getBootstrap() { throw Error("SQLITE internal path and secret"); } } });
  const b = await broken.login("player-beta-internal-error");
  const result = await broken.call("/v2/world/bootstrap", { token: b.sessionToken });
  assert.equal(result.status, 500);
  assert.deepEqual(result.data, { error: { code: "WORLD_INTERNAL_ERROR" } });
});

test("players behind one proxy have independent budgets while invalid sessions stay IP-limited", async t => {
  const { call, login } = await fixture(t, { requestsPerMinute: 2 });
  const a = await login("player-alpha-proxy-budget");
  const b = await login("player-beta-proxy-budget");
  const anotherDevice = await login("player-alpha-proxy-device");
  assert.equal((await call("/v2/world/bootstrap", { token: a.sessionToken })).status, 200);
  assert.equal((await call("/v2/world/bootstrap", { token: anotherDevice.sessionToken })).status, 200);
  assert.equal((await call("/v2/world/bootstrap", { token: a.sessionToken })).status, 429);
  assert.equal((await call("/v2/world/bootstrap", { token: b.sessionToken })).status, 200);
  assert.equal((await call("/v2/world/bootstrap", { token: b.sessionToken })).status, 200);
  assert.equal((await call("/v2/world/bootstrap", { token: b.sessionToken })).status, 429);
  for (const forwarded of ["192.0.2.1", "192.0.2.2"]) {
    const invalid = await call("/v2/world/bootstrap", { token: "x".repeat(43), headers: { "X-Forwarded-For": forwarded } });
    assert.equal(invalid.status, 401);
  }
  assert.equal((await call("/v2/world/bootstrap", { token: "x".repeat(43) })).status, 429);
});

test("logout while uploading a body revokes pending registration and purchase before any mutation", async t => {
  for (const operation of ["register", "purchase"]) {
    let notify;
    const { base, authBase, store, login, register } = await fixture(t, { onInspect: () => notify?.() });
    const session = await login(`player-alpha-revoke-${operation}`);
    if (operation === "purchase") assert.equal((await register(session)).status, 200);
    const plot = store.listPlots({ worldId: "dehong", villageId: "ruili-river-0001" }).plots[0];
    const body = JSON.stringify(operation === "register"
      ? { commandId: "register-during-logout", avatarId: "farmer" }
      : { commandId: "purchase-during-logout", kind: "plot.purchase", targetId: plot.plotId,
        expectedRevision: plot.revision, configVersion: CONFIG_VERSION, payload: {} });
    const inspected = new Promise(resolve => { notify = resolve; });
    const slow = request(`${base}/v2/world/${operation === "register" ? "register" : "commands"}`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.sessionToken}` },
    });
    const completed = new Promise((resolve, reject) => {
      slow.on("response", response => {
        const chunks = [];
        response.on("data", chunk => chunks.push(chunk));
        response.on("end", () => resolve({ status: response.statusCode, data: JSON.parse(Buffer.concat(chunks).toString("utf8")) }));
      });
      slow.on("error", reject);
    });
    slow.write(body.slice(0, -1));
    await inspected;
    const logout = await fetch(`${authBase}/v1/auth/logout`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.sessionToken}` }, body: "{}",
    });
    assert.equal(logout.status, 200);
    slow.end(body.slice(-1));
    const result = await completed;
    assert.equal(result.status, 401);
    assert.equal(result.data.error.code, "SESSION_INVALID");
    const bootstrap = store.getBootstrap(session.playerId);
    assert.equal(bootstrap.registered, operation === "purchase");
    assert.equal(bootstrap.home, null);
    if (bootstrap.wallet) assert.equal(bootstrap.wallet.balanceMinor, 100000);
    assert.equal(store.listPlots({ worldId: "dehong", villageId: "ruili-river-0001" }).plots[0].owner, null);
    assert.throws(() => store.getReceipt(session.playerId, `${operation}-during-logout`), { code: "RECEIPT_NOT_FOUND" });
  }
});

test("slow request bodies release bounded capacity without granting a registration", async t => {
  const { base, login, call, store } = await fixture(t, { bodyTimeoutMs: 100, maxPendingRequests: 1 });
  const session = await login("player-alpha-slow-body");
  const slow = request(`${base}/v2/world/register`, {
    method: "POST", headers: { "Content-Type": "application/json", "Transfer-Encoding": "chunked", Authorization: `Bearer ${session.sessionToken}` },
  });
  const completed = new Promise((resolve, reject) => {
    slow.on("response", response => { response.resume(); resolve(response.statusCode); });
    slow.on("error", reject);
  });
  slow.write("{");
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal((await call("/v2/world/bootstrap", { token: session.sessionToken })).status, 503);
  assert.equal(await completed, 408);
  slow.end();
  assert.equal(store.getBootstrap(session.playerId).registered, false);
});
