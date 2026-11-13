import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createWechatAdapter } from "../wechat/platform/wechat-adapter.js";
import { createWechatAuthServer } from "../service/wechat-auth.mjs";

const NOW = 1800000000000;
const config = { appId: "wx24c1d8b3a00f962e", clientVersion: "test", protocolVersion: 1, backendBaseUrl: "https://api.example.test/anheli" };
const confirmed = { ok: true, playerId: "player-123", sessionToken: "opaque-session-token-123", expiresAt: NOW + 60000 };
function mockApi() {
  const store = new Map();
  const events = new Map();
  const calls = { login: 0, requests: [] };
  const api = {
    login({ success }) { calls.login += 1; success({ code: "wechat-code" }); },
    request(options) { calls.requests.push(options); options.success({ statusCode: 200, data: confirmed }); },
    getStorageSync(key) { return store.get(key) ?? ""; },
    setStorageSync(key, value) { store.set(key, value); },
    removeStorageSync(key) { store.delete(key); },
  };
  for (const name of ["Show", "Hide", "Error"]) {
    api[`on${name}`] = handler => events.set(name, handler);
    api[`off${name}`] = handler => { if (events.get(name) === handler) events.delete(name); };
  }
  return { api, calls, events, store };
}

test("unconfigured or invalid backend cannot request a code or create a player", async () => {
  for (const [backendBaseUrl, code] of [["", "BACKEND_NOT_CONFIGURED"], ["http://api.example.test", "INVALID_BACKEND_URL"], ["https://user:secret@api.example.test", "INVALID_BACKEND_URL"]]) {
    const mock = mockApi();
    const platform = createWechatAdapter(mock.api, { ...config, backendBaseUrl }, { now: () => NOW });
    assert.equal((await platform.startLogin()).error.code, code);
    assert.equal(platform.getSession(), null);
    assert.equal(mock.calls.login, 0);
    assert.equal(mock.calls.requests.length, 0);
  }
});

test("login exchanges a code and only accepts a server-confirmed session", async () => {
  const mock = mockApi();
  let time = NOW;
  const platform = createWechatAdapter(mock.api, config, { now: () => time });
  assert.equal(platform.getSession(), null);
  const result = await platform.startLogin();
  assert.equal(result.ok, true);
  assert.equal(result.session.playerId, confirmed.playerId);
  const request = mock.calls.requests[0];
  assert.equal(request.url, "https://api.example.test/anheli/v1/auth/wechat/session");
  assert.deepEqual(request.data, { code: "wechat-code", clientVersion: "test", protocolVersion: 1 });
  assert.equal(JSON.stringify(platform.getDiagnostics()).includes("sessionToken"), false);
  assert.equal(mock.store.size, 0);
  time += 60000;
  assert.equal(platform.getSession(), null);
});

test("platform, network, server and malformed responses never manufacture success", async () => {
  const scenarios = [
    ["LOGIN_FAILED", api => { api.login = ({ fail }) => fail({ errMsg: "secret details" }); }],
    ["LOGIN_CODE_MISSING", api => { api.login = ({ success }) => success({}); }],
    ["NETWORK_FAILED", api => { api.request = ({ fail }) => fail({}); }],
    ["SERVER_REJECTED", api => { api.request = ({ success }) => success({ statusCode: 401, data: confirmed }); }],
    ["INVALID_SESSION", api => { api.request = ({ success }) => success({ statusCode: 200, data: { ...confirmed, ok: false } }); }],
    ["INVALID_SESSION", api => { api.request = ({ success }) => success({ statusCode: 200, data: { ...confirmed, expiresAt: NOW } }); }],
    ["INVALID_SESSION", api => { api.request = ({ success }) => success({ statusCode: 200, data: { ...confirmed, playerId: "" } }); }],
    ["INVALID_SESSION", api => { api.request = ({ success }) => success({ statusCode: 200, data: { ...confirmed, sessionToken: "bad\ntoken1234567890" } }); }],
  ];
  for (const [code, change] of scenarios) {
    const mock = mockApi();
    change(mock.api);
    const platform = createWechatAdapter(mock.api, config, { now: () => NOW });
    assert.equal((await platform.startLogin()).error.code, code);
    assert.equal(platform.getSession(), null);
  }
});

test("duplicate login shares one exchange and sign out invalidates its pending result", async () => {
  const mock = mockApi();
  let complete;
  mock.api.request = options => { mock.calls.requests.push(options); complete = options.success; };
  const platform = createWechatAdapter(mock.api, config, { now: () => NOW });
  const first = platform.startLogin();
  const second = platform.startLogin();
  assert.equal(first, second);
  assert.equal(mock.calls.login, 1);
  platform.signOut();
  complete({ statusCode: 200, data: confirmed });
  assert.equal((await first).error.code, "CANCELLED");
  assert.equal(platform.getSession(), null);
});

test("storage retains string snapshots and exposes write failure", () => {
  const mock = mockApi();
  const { storage } = createWechatAdapter(mock.api, config);
  assert.equal(storage.getItem("save"), null);
  storage.setItem("save", '{"version":1}');
  assert.equal(storage.getItem("save"), '{"version":1}');
  storage.removeItem("save");
  assert.equal(storage.getItem("save"), null);
  assert.throws(() => storage.setItem("save", {}), TypeError);
  mock.api.setStorageSync = () => { throw new Error("quota exceeded"); };
  assert.throws(() => storage.setItem("save", "data"), /quota/);
});

test("lifecycle subscriptions are removable and disposal clears a confirmed session", async () => {
  const mock = mockApi();
  const platform = createWechatAdapter(mock.api, config, { now: () => NOW });
  const observed = [];
  const unsubscribe = platform.subscribeLifecycle({ onShow: value => observed.push(value), onHide: () => observed.push("hide") });
  const oldShow = mock.events.get("Show");
  oldShow("show");
  mock.events.get("Hide")();
  unsubscribe();
  oldShow("stale");
  assert.deepEqual(observed, ["show", "hide"]);
  assert.equal(mock.events.size, 0);
  await platform.startLogin();
  platform.subscribeLifecycle({ onError() {} });
  platform.dispose();
  assert.equal(platform.getSession(), null);
  assert.equal(mock.events.size, 0);
});

test("adapter login JSON and session parsing integrate with the real HTTP auth handler", async t => {
  let exchanges = 0;
  const server = createWechatAuthServer({
    env: {}, enabled: true, appId: config.appId,
    appSecret: "abcdef0123456789abcdef0123456789",
    playerIdSecret: "test-only-identity-key-0123456789-ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    now: () => NOW,
    fetch: async url => {
      exchanges += 1;
      assert.equal(url.origin + url.pathname, "https://api.weixin.qq.com/sns/jscode2session");
      assert.equal(url.searchParams.get("appid"), config.appId);
      assert.equal(url.searchParams.get("js_code"), "wechat-code");
      return Response.json({ errcode: 0, openid: "openid-integration-player", session_key: Buffer.alloc(16, 7).toString("base64") });
    },
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => { const closed = once(server, "close"); server.close(); server.closeAllConnections(); await closed; });
  const localBase = `http://127.0.0.1:${server.address().port}`;
  const mock = mockApi();
  mock.api.request = options => {
    mock.calls.requests.push(options);
    assert.equal(options.url, `${config.backendBaseUrl}/v1/auth/wechat/session`);
    // Only transport routing changes: the actual adapter JSON reaches the real handler.
    void fetch(`${localBase}${options.url.slice(config.backendBaseUrl.length)}`, {
      method: options.method, headers: options.header, body: JSON.stringify(options.data),
    }).then(async response => options.success({ statusCode: response.status, data: await response.json() }), options.fail);
  };
  const platform = createWechatAdapter(mock.api, config, { now: () => NOW });
  t.after(() => platform.dispose());
  const result = await platform.startLogin();
  assert.equal(result.ok, true);
  assert.equal(result.session.guest, false);
  assert.match(result.session.sessionToken, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(exchanges, 1);
  assert.deepEqual(mock.calls.requests[0].data, { code: "wechat-code", clientVersion: "test", protocolVersion: 1 });
  const headers = { Authorization: `Bearer ${result.session.sessionToken}` };
  const verified = await fetch(`${localBase}/v1/auth/session`, { headers });
  assert.equal(verified.status, 200);
  assert.deepEqual(await verified.json(), { ok: true, playerId: result.session.playerId, expiresAt: result.session.expiresAt });
  const revoked = await fetch(`${localBase}/v1/auth/logout`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: "{}" });
  assert.equal(revoked.status, 200);
  assert.deepEqual(await revoked.json(), { ok: true, revoked: true });
  assert.equal((await fetch(`${localBase}/v1/auth/session`, { headers })).status, 401);
  platform.signOut();
  assert.equal(platform.getSession(), null);
});
