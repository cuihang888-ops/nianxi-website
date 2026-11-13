import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { request } from "node:http";
import { createWechatAuthServer } from "./wechat-auth.mjs";

const APP_ID = "wx1234567890abcdef";
const APP_SECRET = "abcdef0123456789abcdef0123456789";
const PLAYER_SECRET = "test-only-identity-key-0123456789-ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const SESSION_KEY = Buffer.alloc(16, 7).toString("base64");
const NOW = 1_800_000_000_000;
const upstream = (openid = "openid-player-one") => Response.json({ openid, session_key: SESSION_KEY });

async function fixture(t, options = {}) {
  const server = createWechatAuthServer({ env: {}, enabled: true, appId: APP_ID, appSecret: APP_SECRET, playerIdSecret: PLAYER_SECRET, now: () => NOW, fetch: async () => upstream(), ...options });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => { const closed = once(server, "close"); server.close(); server.closeAllConnections(); await closed; });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, { method = "POST", body = {}, token, headers = {}, raw } = {}) => {
    const response = await fetch(`${base}${path}`, {
      method, headers: { ...(method === "POST" ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
      ...(method === "POST" ? { body: raw ?? JSON.stringify(body) } : {}),
    });
    return { status: response.status, headers: response.headers, data: await response.json() };
  };
  const login = (code = "test-code-000001") => call("/v1/auth/wechat/session", { body: { code } });
  return { server, base, call, login };
}

test("disabled, missing configuration and insufficient identity secrets fail closed", async t => {
  for (const options of [{ enabled: false }, { appId: "" }, { appSecret: "" }, { playerIdSecret: "short" }, { playerIdSecret: "x".repeat(64) }]) {
    const { login } = await fixture(t, { ...options, fetch: () => { throw Error("must not call upstream"); } });
    const result = await login();
    assert.equal(result.status, 503);
    assert.equal(result.data.error.code, "WECHAT_AUTH_UNCONFIGURED");
  }
  const server = createWechatAuthServer({ env: {} });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const response = await fetch(`http://127.0.0.1:${server.address().port}/v1/auth/session`);
  assert.equal(response.status, 503);
  server.close(); server.closeAllConnections();
  await once(server, "close");
});

test("fixed server AppID exchanges code and returns only an opaque session", async t => {
  let calls = 0;
  const { login, call } = await fixture(t, { fetch: async (url, init) => {
    calls += 1;
    assert.equal(url.origin + url.pathname, "https://api.weixin.qq.com/sns/jscode2session");
    assert.equal(url.searchParams.get("appid"), APP_ID);
    assert.equal(url.searchParams.get("secret"), APP_SECRET);
    assert.equal(url.searchParams.get("grant_type"), "authorization_code");
    assert.equal(url.searchParams.get("js_code"), "test-code-000001");
    assert.equal(init.redirect, "error");
    return upstream();
  } });
  const result = await login();
  assert.equal(result.status, 200);
  assert.deepEqual(Object.keys(result.data).sort(), ["expiresAt", "ok", "playerId", "sessionToken"]);
  assert.equal(result.data.ok, true);
  assert.match(result.data.sessionToken, /^[A-Za-z0-9_-]{43}$/);
  assert.match(result.data.playerId, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(result.headers.get("cache-control"), "no-store");
  for (const value of [APP_SECRET, SESSION_KEY, "openid-player-one", "test-code-000001"]) assert.equal(JSON.stringify(result.data).includes(value), false);
  const session = await call("/v1/auth/session", { method: "GET", token: result.data.sessionToken });
  assert.equal(session.status, 200);
  assert.deepEqual(session.data, { ok: true, playerId: result.data.playerId, expiresAt: NOW + 30 * 60_000 });
  assert.equal(calls, 1);
});

test("stable identities distinguish AppIDs and OpenIDs while tokens remain independent", async t => {
  let ordinal = 0;
  const first = await fixture(t, { fetch: async () => upstream(++ordinal === 3 ? "openid-player-two" : "openid-player-one") });
  const a = (await first.login("test-code-identity-a")).data;
  const b = (await first.login("test-code-identity-b")).data;
  const c = (await first.login("test-code-identity-c")).data;
  assert.equal(a.playerId, b.playerId);
  assert.notEqual(a.sessionToken, b.sessionToken);
  assert.notEqual(a.playerId, c.playerId);
  const sameConfig = await fixture(t);
  const same = (await sameConfig.login()).data;
  assert.equal(a.playerId, same.playerId);
  assert.equal((await sameConfig.call("/v1/auth/session", { method: "GET", token: a.sessionToken })).status, 401);
  const differentApp = await fixture(t, { appId: "wxabcdef1234567890" });
  assert.notEqual(a.playerId, (await differentApp.login()).data.playerId);
});

test("logout revokes only its bearer token and expiry rejects old sessions", async t => {
  let time = NOW;
  const { call, login } = await fixture(t, { now: () => time, sessionTtlMs: 1000 });
  const first = (await login("test-code-session-one")).data;
  const second = (await login("test-code-session-two")).data;
  assert.equal((await call("/v1/auth/logout", { token: first.sessionToken })).status, 200);
  assert.equal((await call("/v1/auth/session", { method: "GET", token: first.sessionToken })).status, 401);
  assert.equal((await call("/v1/auth/session", { method: "GET", token: second.sessionToken })).status, 200);
  assert.equal((await call("/v1/auth/logout", { token: "invalid" })).status, 401);
  time += 1000;
  assert.equal((await call("/v1/auth/session", { method: "GET", token: second.sessionToken })).status, 401);
});

test("repeated and concurrently submitted codes trigger only one exchange", async t => {
  let release, entered;
  const started = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  let calls = 0;
  const { login } = await fixture(t, { fetch: async () => { calls += 1; entered(); await gate; return upstream(); } });
  const pending = login();
  await started;
  const concurrent = await login();
  assert.equal(concurrent.status, 409);
  assert.equal(concurrent.data.error.code, "WECHAT_CODE_REUSED");
  release();
  assert.equal((await pending).status, 200);
  assert.equal((await login()).status, 409);
  assert.equal(calls, 1);
});

test("exchange concurrency and session capacity are bounded", async t => {
  let release, entered;
  const started = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const { login, call } = await fixture(t, { maxConcurrentExchanges: 1, maxSessions: 1, fetch: async () => { entered(); await gate; return upstream(); } });
  const pending = login("test-code-capacity-a");
  await started;
  assert.equal((await login("test-code-capacity-b")).status, 503);
  release();
  const result = await pending;
  assert.equal(result.status, 200);
  assert.equal((await login("test-code-capacity-c")).status, 503);
  await call("/v1/auth/logout", { token: result.data.sessionToken });
  assert.equal((await login("test-code-capacity-d")).status, 200);
});

test("rate limits and the replay-cache capacity fail safely without unbounded growth", async t => {
  let time = NOW;
  const limited = await fixture(t, { now: () => time, loginsPerMinute: 1 });
  assert.equal((await limited.login()).status, 200);
  const rate = await limited.login("test-code-rate-b");
  assert.equal(rate.status, 429);
  assert.equal(rate.data.error.code, "RATE_LIMITED");
  time += 60_000;
  assert.equal((await limited.login("test-code-rate-c")).status, 200);
  const cache = await fixture(t, { maxCodeRecords: 1 });
  assert.equal((await cache.login()).status, 200);
  assert.equal((await cache.login("test-code-cache-b")).status, 503);
});

test("JSON payload, path, method and authentication headers are strictly checked", async t => {
  const { call, base } = await fixture(t, { loginsPerMinute: 100 });
  for (const body of [null, [], {}, { code: 1 }, { code: "short" }, { code: "has space in code" }, { code: "test-code-000001", appid: APP_ID }, { code: "test-code-000001", secret: APP_SECRET }, { code: "test-code-000001", protocolVersion: 2 }, { code: "test-code-000001", clientVersion: "x".repeat(65) }]) {
    assert.equal((await call("/v1/auth/wechat/session", { body })).status, 400);
  }
  assert.equal((await call("/v1/auth/wechat/session", { raw: "{" })).status, 400);
  assert.equal((await call("/v1/auth/wechat/session", { raw: "x".repeat(1100) })).status, 413);
  assert.equal((await call("/v1/auth/wechat/session", { headers: { "Content-Type": "text/plain" } })).status, 415);
  assert.equal((await call("/v1/auth/wechat/session", { headers: { "Content-Encoding": "gzip" } })).status, 415);
  assert.equal((await call("/v1/auth/wechat/session", { method: "GET" })).status, 405);
  assert.equal((await call("/v1/auth/session?token=secret", { method: "GET" })).status, 404);
  assert.equal((await call("/v1/auth/session", { method: "GET" })).status, 401);
  const duplicate = await new Promise((resolve, reject) => {
    const req = request(`${base}/v1/auth/session`, { headers: ["Host", new URL(base).host, "Authorization", `Bearer ${"a".repeat(43)}`, "Authorization", `Bearer ${"b".repeat(43)}`] }, response => { response.resume(); resolve(response.statusCode); });
    req.on("error", reject); req.end();
  });
  assert.equal(duplicate, 401);
});

test("the existing WeChat adapter metadata and errcode zero are supported", async t => {
  const { call } = await fixture(t, { fetch: async () => Response.json({ errcode: 0, openid: "openid-player-one", session_key: SESSION_KEY }) });
  const result = await call("/v1/auth/wechat/session", { body: { code: "test-code-metadata", clientVersion: "wechat-platform-0.1.0", protocolVersion: 1 } });
  assert.equal(result.status, 200);
  assert.equal(result.data.ok, true);
  assert.match(result.data.sessionToken, /^[A-Za-z0-9_-]{43}$/);
});

test("invalid and rejected WeChat responses produce stable errors without upstream details", async t => {
  const cases = [
    [() => Response.json({ errcode: 40029, errmsg: APP_SECRET }), 401, "WECHAT_CODE_REJECTED"],
    [() => Response.json({ errcode: 40163 }), 401, "WECHAT_CODE_REJECTED"],
    [() => Response.json({ errcode: 40226 }), 403, "WECHAT_RISK_REJECTED"],
    [() => Response.json({ errcode: 45011 }), 503, "WECHAT_UNAVAILABLE"],
    [() => Response.json({ errcode: 40013 }), 502, "WECHAT_EXCHANGE_FAILED"],
    [() => Response.json({ openid: "openid-player-one" }), 502, "WECHAT_INVALID_RESPONSE"],
    [() => Response.json({ openid: "openid-player-one", session_key: "bad" }), 502, "WECHAT_INVALID_RESPONSE"],
    [() => new Response("bad", { status: 200 }), 502, "WECHAT_INVALID_RESPONSE"],
    [() => new Response("x".repeat(9000), { status: 200 }), 502, "WECHAT_INVALID_RESPONSE"],
    [() => new Response("bad", { status: 500 }), 502, "WECHAT_UNAVAILABLE"],
    [() => { throw Error(`network ${APP_SECRET}`); }, 502, "WECHAT_UNAVAILABLE"],
  ];
  for (const [fetchImpl, status, code] of cases) {
    const { login } = await fixture(t, { fetch: fetchImpl });
    const result = await login();
    assert.equal(result.status, status);
    assert.deepEqual(result.data, { error: { code } });
    assert.equal((await login()).status, 409);
  }
});

test("upstream timeout is bounded, cancels the request and never grants a session", async t => {
  let signal;
  const { login } = await fixture(t, { exchangeTimeoutMs: 20, fetch: (_, init) => { signal = init.signal; return new Promise(() => {}); } });
  const result = await login();
  assert.equal(result.status, 504);
  assert.equal(result.data.error.code, "WECHAT_TIMEOUT");
  assert.equal(signal.aborted, true);
  assert.equal((await login()).status, 409);
});

test("slow request bodies time out and pending request capacity is bounded", async t => {
  const { base, login } = await fixture(t, { bodyTimeoutMs: 100, maxPendingRequests: 1 });
  const slow = await new Promise(resolve => {
    const req = request(`${base}/v1/auth/wechat/session`, { method: "POST", headers: { "Content-Type": "application/json", "Transfer-Encoding": "chunked" } });
    req.write("{");
    req.on("socket", socket => socket.once("connect", () => resolve(req)));
  });
  const responsePromise = new Promise((resolve, reject) => { slow.on("response", response => { response.resume(); resolve(response.statusCode); }); slow.on("error", reject); });
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal((await login()).status, 503);
  assert.equal(await responsePromise, 408);
  slow.end();
});
