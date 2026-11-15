import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { mkdir, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createWorldStore, WorldStoreError } from "./world-store.mjs";

class WorldHttpError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

const failure = (status, code) => new WorldHttpError(status, code);
const integer = (value, fallback, min, max) => Number.isSafeInteger(value) && value >= min && value <= max ? value : fallback;
const safeId = value => typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const hash = value => createHash("sha256").update(value).digest("hex");

function respond(response, status, payload) {
  if (response.destroyed || response.writableEnded) return;
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
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
    let size = 0, finished = false;
    const chunks = [];
    const settle = (error, data) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      request.removeListener("data", onData);
      request.removeListener("end", onEnd);
      request.removeListener("error", onError);
      request.removeListener("aborted", onError);
      if (error) { request.resume(); reject(error); } else resolve(data);
    };
    const onError = () => settle(failure(400, "INVALID_BODY"));
    const onData = chunk => {
      size += chunk.length;
      if (size > maxBytes) settle(failure(413, "BODY_TOO_LARGE"));
      else chunks.push(chunk);
    };
    const onEnd = () => {
      try { settle(null, JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch { settle(failure(400, "INVALID_JSON")); }
    };
    const timer = setTimeout(() => settle(failure(408, "BODY_TIMEOUT")), timeoutMs);
    request.on("data", onData);
    request.on("end", onEnd);
    request.on("error", onError);
    request.on("aborted", onError);
  });
}

async function readAuthResponse(response) {
  if (!response.body?.getReader || Number(response.headers.get("content-length")) > 2048) {
    void response.body?.cancel?.().catch(() => {});
    throw failure(503, "WORLD_AUTH_UNAVAILABLE");
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2048) throw failure(503, "WORLD_AUTH_UNAVAILABLE");
      chunks.push(Buffer.from(value));
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    void reader.cancel().catch(() => {});
    throw failure(503, "WORLD_AUTH_UNAVAILABLE");
  } finally { reader.releaseLock(); }
}

function authUrl(value) {
  if (typeof value !== "string" || !value) return null;
  try {
    const url = new URL(value);
    if (url.username || url.password || url.hash || url.search || url.pathname !== "/v1/auth/session") return null;
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "[::1]"].includes(url.hostname))) return null;
    return url;
  } catch { return null; }
}

export function createAuthInspector(options = {}) {
  const url = authUrl(options.url ?? process.env.ANHELI_WORLD_AUTH_URL);
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const now = options.now ?? Date.now;
  const timeoutMs = integer(options.timeoutMs, 3000, 10, 10_000);
  const authenticate = async sessionToken => {
    if (!url || typeof fetchImpl !== "function") throw failure(503, "WORLD_AUTH_UNCONFIGURED");
    if (typeof sessionToken !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(sessionToken)) throw failure(401, "SESSION_INVALID");
    const controller = new AbortController();
    let timer;
    try {
      return await Promise.race([
        (async () => {
          const response = await fetchImpl(url, {
            method: "GET", headers: { Authorization: `Bearer ${sessionToken}` },
            redirect: "error", signal: controller.signal,
          });
          if (response.status === 401) {
            void response.body?.cancel?.().catch(() => {});
            throw failure(401, "SESSION_INVALID");
          }
          if (response.status === 429) {
            void response.body?.cancel?.().catch(() => {});
            throw failure(429, "RATE_LIMITED");
          }
          if (!response.ok) {
            void response.body?.cancel?.().catch(() => {});
            throw failure(503, "WORLD_AUTH_UNAVAILABLE");
          }
          const data = await readAuthResponse(response);
          if (!data || data.ok !== true || !safeId(data.playerId) || !Number.isSafeInteger(data.expiresAt)) throw failure(503, "WORLD_AUTH_UNAVAILABLE");
          if (data.expiresAt <= now()) throw failure(401, "SESSION_INVALID");
          return { playerId: data.playerId, expiresAt: data.expiresAt };
        })(),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(failure(503, "WORLD_AUTH_UNAVAILABLE"));
          }, timeoutMs);
        }),
      ]);
    } catch (error) {
      if (error instanceof WorldHttpError) throw error;
      throw failure(503, "WORLD_AUTH_UNAVAILABLE");
    } finally { clearTimeout(timer); }
  };
  Object.defineProperty(authenticate, "configured", { value: Boolean(url) && typeof fetchImpl === "function" });
  return authenticate;
}

export function createWorldServer(options = {}) {
  const enabled = options.enabled ?? process.env.ANHELI_WORLD_ENABLED === "1";
  const store = options.store;
  const authenticate = options.authenticate ?? createAuthInspector();
  const authConfigured = typeof authenticate === "function" && authenticate.configured !== false;
  const now = options.now ?? Date.now;
  const maxPendingRequests = integer(options.maxPendingRequests, 32, 1, 256);
  const maxBodyBytes = integer(options.maxBodyBytes, 4096, 256, 16_384);
  const bodyTimeoutMs = integer(options.bodyTimeoutMs, 3000, 10, 10_000);
  const requestsPerMinute = integer(options.requestsPerMinute, 120, 1, 10_000);
  const maxBuckets = integer(options.maxBuckets, 2048, 1, 10_000);
  const buckets = new Map();
  let pendingRequests = 0;

  function pruneBuckets(time) {
    for (const [key, bucket] of buckets) if (bucket.expiresAt <= time) buckets.delete(key);
  }

  function rateLimit(key, time) {
    let bucket = buckets.get(key);
    if (!bucket) {
      if (buckets.size >= maxBuckets) throw failure(503, "WORLD_BUSY");
      bucket = { count: 0, expiresAt: time + 60_000 };
      buckets.set(key, bucket);
    }
    if (bucket.count >= requestsPerMinute) throw failure(429, "RATE_LIMITED");
    bucket.count += 1;
  }

  async function inspectSession(token) {
    const session = await authenticate(token);
    if (!session || !safeId(session.playerId) || !Number.isSafeInteger(session.expiresAt)) throw failure(503, "WORLD_AUTH_UNAVAILABLE");
    if (session.expiresAt <= now()) throw failure(401, "SESSION_INVALID");
    return session;
  }

  const server = createServer({ maxHeaderSize: 8192 }, async (request, response) => {
    request.on("error", () => {});
    response.on("error", () => {});
    if (pendingRequests >= maxPendingRequests) {
      request.resume();
      respond(response, 503, { error: { code: "WORLD_BUSY" } });
      return;
    }
    pendingRequests += 1;
    try {
      if (!request.url?.startsWith("/")) throw failure(404, "NOT_FOUND");
      const url = new URL(request.url, "http://127.0.0.1");
      const pathname = url.pathname;
      const route = pathname === "/v2/world/health" ? "health"
        : pathname === "/v2/world/bootstrap" ? "bootstrap"
        : pathname === "/v2/world/register" ? "register"
        : pathname === "/v2/world/plots" ? "plots"
        : pathname === "/v2/world/commands" ? "commands"
        : /^\/v2\/world\/receipts\/[A-Za-z0-9_-]{8,96}$/.test(pathname) ? "receipt" : null;
      if (!route) throw failure(404, "NOT_FOUND");
      const method = ["register", "commands"].includes(route) ? "POST" : "GET";
      if (request.method !== method) throw failure(405, "METHOD_NOT_ALLOWED");
      if (route !== "plots" && url.search) throw failure(400, "INVALID_QUERY");
      if (route === "health") {
        respond(response, 200, { ok: true, service: "anheli-shared-world", protocolVersion: 2, enabled: enabled === true, authConfigured, storageConfigured: Boolean(store) });
        return;
      }
      if (enabled !== true || !store || !authConfigured) throw failure(503, "WORLD_UNCONFIGURED");
      const time = now();
      pruneBuckets(time);
      // Invalid requests share a bounded socket-IP budget; real players keep separate budgets behind a proxy.
      const ipKey = `ip:${hash(request.socket.remoteAddress || "unknown")}`;
      if ((buckets.get(ipKey)?.count ?? 0) >= requestsPerMinute) throw failure(429, "RATE_LIMITED");
      let token, session;
      try {
        if (request.headersDistinct?.authorization?.length !== 1) throw failure(401, "SESSION_INVALID");
        token = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.authorization || "")?.[1];
        if (!token) throw failure(401, "SESSION_INVALID");
        session = await inspectSession(token);
      } catch (error) {
        if (error instanceof WorldHttpError && error.status === 401) rateLimit(ipKey, time);
        throw error;
      }
      rateLimit(`player:${hash(session.playerId)}`, now());
      if (method === "GET" && (request.headers["transfer-encoding"] || Number(request.headers["content-length"] || 0) !== 0)) throw failure(400, "INVALID_BODY");
      if (route === "bootstrap") {
        respond(response, 200, store.getBootstrap(session.playerId));
      } else if (route === "plots") {
        if (url.searchParams.size !== 2 || url.searchParams.getAll("worldId").length !== 1
          || url.searchParams.getAll("villageId").length !== 1
          || [...url.searchParams.keys()].some(key => !["worldId", "villageId"].includes(key))) throw failure(400, "INVALID_QUERY");
        respond(response, 200, store.listPlots({ worldId: url.searchParams.get("worldId"), villageId: url.searchParams.get("villageId") }));
      } else if (route === "receipt") {
        respond(response, 200, { ok: true, receipt: store.getReceipt(session.playerId, pathname.slice("/v2/world/receipts/".length)) });
      } else {
        const body = await readJson(request, maxBodyBytes, bodyTimeoutMs);
        // Re-inspect after reading the body so logout during a slow upload revokes the pending mutation.
        const currentSession = await inspectSession(token);
        if (currentSession.playerId !== session.playerId) throw failure(401, "SESSION_INVALID");
        if (request.aborted || response.destroyed) return;
        const receipt = route === "register"
          ? store.registerPlayer(session.playerId, body)
          : store.executeCommand(session.playerId, body);
        respond(response, 200, { ok: true, receipt });
      }
    } catch (error) {
      request.resume();
      const known = error instanceof WorldHttpError || error instanceof WorldStoreError;
      respond(response, known ? error.status : 500, { error: { code: known ? error.code : "WORLD_INTERNAL_ERROR" } });
    } finally { pendingRequests -= 1; }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5000;
  server.maxRequestsPerSocket = 100;
  server.on("close", () => buckets.clear());
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const enabled = process.env.ANHELI_WORLD_ENABLED === "1";
  const authenticate = createAuthInspector();
  let store = null;
  if (enabled && authenticate.configured) {
    const root = await realpath(fileURLToPath(new URL("..", import.meta.url)));
    const filename = path.resolve(process.env.ANHELI_WORLD_DATABASE || path.join(root, "reports", "shared-world", "dev-world.sqlite"));
    if (process.platform === "win32" && !/^d:/i.test(filename)) throw new Error("World storage must stay on D:");
    await mkdir(path.dirname(filename), { recursive: true });
    const physicalParent = await realpath(path.dirname(filename));
    if (process.platform === "win32" && !/^d:/i.test(physicalParent)) throw new Error("World storage must stay physically on D:");
    store = createWorldStore({ filename: path.join(physicalParent, path.basename(filename)) });
  }
  const host = process.env.ANHELI_WORLD_HOST || "127.0.0.1";
  const port = integer(Number(process.env.ANHELI_WORLD_PORT), 4109, 1, 65535);
  const server = createWorldServer({ enabled, authenticate, store });
  server.listen(port, host, () => console.info(`Anheli shared world service listening on ${host}:${port}`));
  server.on("close", () => store?.close());
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => server.close());
}
