import { createServer } from "node:http";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";

const EXCHANGE_URL = "https://api.weixin.qq.com/sns/jscode2session";
const AUTH_ERROR = Symbol("authError");
const hash = value => createHash("sha256").update(value).digest("hex");
const failure = (status, code) => Object.assign(new Error(code), { status, code, [AUTH_ERROR]: true });
const integer = (value, fallback, min, max) => Number.isSafeInteger(value) && value >= min && value <= max ? value : fallback;
const plainObject = value => value !== null && typeof value === "object" && !Array.isArray(value);

function respond(response, status, payload) {
  if (response.destroyed || response.writableEnded) return;
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
  });
  response.end(JSON.stringify(payload));
}

function readJson(request, maxBytes, timeoutMs) {
  if (request.headers["content-type"]?.split(";")[0].trim().toLowerCase() !== "application/json") {
    request.resume();
    return Promise.reject(failure(415, "JSON_REQUIRED"));
  }
  if (request.headers["content-encoding"] && request.headers["content-encoding"] !== "identity") {
    request.resume();
    return Promise.reject(failure(415, "CONTENT_ENCODING_UNSUPPORTED"));
  }
  if (Number(request.headers["content-length"]) > maxBytes) {
    request.resume();
    return Promise.reject(failure(413, "BODY_TOO_LARGE"));
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0, settled = false;
    const finish = (error, data) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      request.removeListener("data", onData);
      request.removeListener("end", onEnd);
      request.removeListener("error", onError);
      request.removeListener("aborted", onAborted);
      if (error) { request.resume(); reject(error); } else resolve(data);
    };
    const onError = () => finish(failure(400, "INVALID_BODY"));
    const onAborted = () => finish(failure(400, "INVALID_BODY"));
    const onData = chunk => {
      size += chunk.length;
      if (size > maxBytes) finish(failure(413, "BODY_TOO_LARGE"));
      else chunks.push(chunk);
    };
    const onEnd = () => {
      try { finish(null, JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch { finish(failure(400, "INVALID_JSON")); }
    };
    const timer = setTimeout(() => finish(failure(408, "BODY_TIMEOUT")), timeoutMs);
    request.on("data", onData);
    request.on("end", onEnd);
    request.on("error", onError);
    request.on("aborted", onAborted);
  });
}

async function readUpstreamJson(response) {
  if (!response?.ok || !response.body?.getReader) {
    void response?.body?.cancel?.().catch(() => {});
    throw failure(502, "WECHAT_UNAVAILABLE");
  }
  if (Number(response.headers?.get("content-length")) > 8192) {
    void response.body.cancel().catch(() => {});
    throw failure(502, "WECHAT_INVALID_RESPONSE");
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) throw failure(502, "WECHAT_INVALID_RESPONSE");
      chunks.push(Buffer.from(value));
    }
    const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!plainObject(data)) throw failure(502, "WECHAT_INVALID_RESPONSE");
    return data;
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error?.code ? error : failure(502, "WECHAT_INVALID_RESPONSE");
  } finally { reader.releaseLock(); }
}

export function createWechatAuthServer(options = {}) {
  const env = options.env ?? process.env;
  const enabled = options.enabled ?? env.ANHELI_WECHAT_AUTH_ENABLED === "1";
  const appId = options.appId ?? env.ANHELI_WECHAT_APP_ID;
  const appSecret = options.appSecret ?? env.ANHELI_WECHAT_APP_SECRET;
  const playerIdSecret = options.playerIdSecret ?? env.ANHELI_WECHAT_PLAYER_ID_SECRET;
  const configured = enabled === true && /^wx[a-zA-Z0-9]{16}$/.test(appId || "")
    && typeof appSecret === "string" && /^[a-zA-Z0-9]{32,128}$/.test(appSecret)
    && typeof playerIdSecret === "string" && Buffer.byteLength(playerIdSecret) >= 32
    && Buffer.byteLength(playerIdSecret) <= 4096 && new Set(playerIdSecret).size >= 8;
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const now = options.now ?? Date.now;
  const sessionTtlMs = integer(options.sessionTtlMs, 30 * 60_000, 1000, 24 * 60 * 60_000);
  const exchangeTimeoutMs = integer(options.exchangeTimeoutMs, 5000, 10, 30_000);
  const bodyTimeoutMs = integer(options.bodyTimeoutMs, 5000, 10, 30_000);
  const maxBodyBytes = integer(options.maxBodyBytes, 1024, 64, 4096);
  const maxSessions = integer(options.maxSessions, 2048, 1, 10_000);
  const maxBuckets = integer(options.maxBuckets, 2048, 1, 10_000);
  const maxCodeRecords = integer(options.maxCodeRecords, 4096, 1, 20_000);
  const maxConcurrentExchanges = integer(options.maxConcurrentExchanges, 8, 1, 64);
  const maxPendingRequests = integer(options.maxPendingRequests, 32, 1, 256);
  const requestsPerMinute = integer(options.requestsPerMinute, 90, 1, 10_000);
  const loginsPerMinute = integer(options.loginsPerMinute, 10, 1, 1000);
  const sessions = new Map(), buckets = new Map(), codes = new Map(), controllers = new Set();
  let exchanges = 0, pendingRequests = 0;

  function prune(time) {
    for (const [key, value] of sessions) if (value.expiresAt <= time) sessions.delete(key);
    for (const [key, value] of codes) if (value.expiresAt <= time && !value.pending) codes.delete(key);
    for (const [key, value] of buckets) if (value.expiresAt <= time) buckets.delete(key);
  }

  function rateLimit(request, login, time) {
    // Forwarded headers are intentionally ignored until a trusted proxy is configured.
    const key = hash(request.socket.remoteAddress || "unknown");
    let bucket = buckets.get(key);
    if (!bucket) {
      if (buckets.size >= maxBuckets) throw failure(503, "AUTH_BUSY");
      bucket = { requests: 0, logins: 0, expiresAt: time + 60_000 };
      buckets.set(key, bucket);
    }
    if (bucket.requests >= requestsPerMinute || (login && bucket.logins >= loginsPerMinute)) throw failure(429, "RATE_LIMITED");
    bucket.requests += 1;
    if (login) bucket.logins += 1;
  }

  function authenticated(request, time) {
    if (request.headersDistinct?.authorization?.length !== 1) throw failure(401, "SESSION_INVALID");
    const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.authorization || "");
    const tokenHash = match ? hash(match[1]) : "";
    const session = sessions.get(tokenHash);
    if (!session || session.expiresAt <= time) throw failure(401, "SESSION_INVALID");
    return { tokenHash, session };
  }

  async function exchange(code) {
    const controller = new AbortController();
    controllers.add(controller);
    let timer;
    try {
      const url = new URL(EXCHANGE_URL);
      url.search = new URLSearchParams({ appid: appId, secret: appSecret, js_code: code, grant_type: "authorization_code" }).toString();
      const data = await Promise.race([
        (async () => readUpstreamJson(await fetchImpl(url, { method: "GET", redirect: "error", signal: controller.signal })))(),
        new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(failure(504, "WECHAT_TIMEOUT")); }, exchangeTimeoutMs); }),
      ]);
      if (data.errcode !== undefined && data.errcode !== 0) {
        if ([40029, 40163].includes(data.errcode)) throw failure(401, "WECHAT_CODE_REJECTED");
        if (data.errcode === 40226) throw failure(403, "WECHAT_RISK_REJECTED");
        if ([-1, 45011].includes(data.errcode)) throw failure(503, "WECHAT_UNAVAILABLE");
        throw failure(502, "WECHAT_EXCHANGE_FAILED");
      }
      if (typeof data.openid !== "string" || !/^[A-Za-z0-9_-]{8,128}$/.test(data.openid)
        || typeof data.session_key !== "string" || !/^[A-Za-z0-9+/]{22}==$/.test(data.session_key)
        || Buffer.from(data.session_key, "base64").length !== 16
        || Buffer.from(data.session_key, "base64").toString("base64") !== data.session_key) throw failure(502, "WECHAT_INVALID_RESPONSE");
      return createHmac("sha256", playerIdSecret).update(JSON.stringify([appId, data.openid])).digest("base64url");
    } catch (error) {
      if (error?.[AUTH_ERROR]) throw error;
      throw failure(502, "WECHAT_UNAVAILABLE");
    } finally {
      clearTimeout(timer);
      controllers.delete(controller);
    }
  }

  const server = createServer({ maxHeaderSize: 8192 }, async (request, response) => {
    request.on("error", () => {});
    response.on("error", () => {});
    if (pendingRequests >= maxPendingRequests) { request.resume(); respond(response, 503, { error: { code: "AUTH_BUSY" } }); return; }
    pendingRequests += 1;
    try {
      const path = request.url;
      const login = path === "/v1/auth/wechat/session";
      const inspect = path === "/v1/auth/session";
      const logout = path === "/v1/auth/logout";
      if (!login && !inspect && !logout) throw failure(404, "NOT_FOUND");
      if (request.method !== (inspect ? "GET" : "POST")) throw failure(405, "METHOD_NOT_ALLOWED");
      if (!configured || typeof fetchImpl !== "function") throw failure(503, "WECHAT_AUTH_UNCONFIGURED");
      const time = now();
      prune(time);
      rateLimit(request, login, time);
      if (inspect) {
        if (request.headers["transfer-encoding"] || Number(request.headers["content-length"] || 0) !== 0) throw failure(400, "INVALID_BODY");
        const { session } = authenticated(request, time);
        respond(response, 200, { ok: true, playerId: session.playerId, expiresAt: session.expiresAt });
        return;
      }
      if (logout) {
        const { tokenHash } = authenticated(request, time);
        const body = await readJson(request, maxBodyBytes, bodyTimeoutMs);
        if (!plainObject(body) || Object.keys(body).length !== 0) throw failure(400, "INVALID_BODY");
        sessions.delete(tokenHash);
        respond(response, 200, { ok: true, revoked: true });
        return;
      }
      const body = await readJson(request, maxBodyBytes, bodyTimeoutMs);
      if (!plainObject(body) || !Object.hasOwn(body, "code") || Object.keys(body).some(key => !["code", "clientVersion", "protocolVersion"].includes(key))
        || typeof body.code !== "string" || !/^[A-Za-z0-9_-]{8,256}$/.test(body.code)
        || (Object.hasOwn(body, "protocolVersion") && body.protocolVersion !== 1)
        || (Object.hasOwn(body, "clientVersion") && (typeof body.clientVersion !== "string" || !/^[A-Za-z0-9._-]{1,64}$/.test(body.clientVersion)))) throw failure(400, "INVALID_BODY");
      if (exchanges >= maxConcurrentExchanges || sessions.size + exchanges >= maxSessions) throw failure(503, "AUTH_BUSY");
      const codeHash = hash(`${appId}:${body.code}`);
      if (codes.has(codeHash)) throw failure(409, "WECHAT_CODE_REUSED");
      if (codes.size >= maxCodeRecords) throw failure(503, "AUTH_BUSY");
      codes.set(codeHash, { expiresAt: now() + 10 * 60_000, pending: true });
      exchanges += 1;
      try {
        const playerId = await exchange(body.code);
        if (response.destroyed || request.aborted) return;
        const token = randomBytes(32).toString("base64url");
        const expiresAt = now() + sessionTtlMs;
        sessions.set(hash(token), { playerId, expiresAt });
        respond(response, 200, { ok: true, sessionToken: token, playerId, expiresAt });
      } finally {
        exchanges -= 1;
        const record = codes.get(codeHash);
        if (record) record.pending = false;
      }
    } catch (error) {
      request.resume();
      const status = error?.[AUTH_ERROR] ? error.status : 500;
      respond(response, status, { error: { code: status === 500 ? "AUTH_INTERNAL_ERROR" : error.code } });
    } finally { pendingRequests -= 1; }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5000;
  server.maxRequestsPerSocket = 100;
  server.on("close", () => {
    controllers.forEach(controller => controller.abort());
    controllers.clear(); sessions.clear(); buckets.clear(); codes.clear();
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = integer(Number(process.env.ANHELI_WECHAT_AUTH_PORT), 4108, 1, 65535);
  const host = process.env.ANHELI_WECHAT_AUTH_HOST || "127.0.0.1";
  const server = createWechatAuthServer();
  server.listen(port, host, () => console.info(`Anheli auth service listening on ${host}:${port}`));
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close());
}
