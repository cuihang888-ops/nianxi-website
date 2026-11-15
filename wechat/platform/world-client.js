const MESSAGES = Object.freeze({
  BACKEND_NOT_CONFIGURED: "共享世界服务尚未配置。",
  INVALID_BACKEND_URL: "共享世界服务需要有效的 HTTPS 地址。",
  WORLD_UNAVAILABLE: "当前环境暂时无法连接共享世界。",
  SESSION_REQUIRED: "请先完成微信登录。",
  SESSION_CHANGED: "登录状态已变化，请重新读取世界。",
  INVALID_REQUEST: "这次操作的信息不完整，请重新选择。",
  NETWORK_FAILED: "连接暂时中断，请使用原操作重试。",
  NETWORK_TIMEOUT: "服务器尚未确认，请查询原操作结果或重试。",
  INVALID_RESPONSE: "服务器返回的信息不完整，请重新读取。",
  SERVER_REJECTED: "服务器未能确认这次操作。",
  CANCELLED: "这次请求已经取消。",
});
const REGIONS = ["ruili", "mangshi", "longchuan", "yingjiang", "lianghe"];
const AVATARS = ["wanderer", "farmer", "herder"];
const REQUEST_TIMEOUT = 10000;
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const id = value => typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const commandId = value => typeof value === "string" && /^[A-Za-z0-9_-]{8,96}$/.test(value);
const version = value => typeof value === "string" && /^[A-Za-z0-9_-]{1,96}$/.test(value);
const natural = value => Number.isSafeInteger(value) && value >= 0;
const revision = value => Number.isSafeInteger(value) && value >= 1 && value <= 2147483647;
const errorCode = value => typeof value === "string" && /^[A-Z][A-Z0-9_]{1,63}$/.test(value);
const name = value => typeof value === "string" && value.length > 0 && value.length <= 128;
const finite = value => typeof value === "number" && Number.isFinite(value);
const exact = (value, required) => object(value) && Object.keys(value).length === required.length
  && required.every(key => Object.prototype.hasOwnProperty.call(value, key));
const failure = (code, retryable = false) => ({
  ok: false, error: { code, message: MESSAGES[code] || MESSAGES.SERVER_REJECTED, retryable },
});
const point = value => object(value) && finite(value.x) && finite(value.y) && finite(value.z);
const bounds = value => Array.isArray(value) && value.length >= 3 && value.length <= 128
  && value.every(item => object(item) && finite(item.x) && finite(item.z));
const owner = value => object(value) && id(value.playerId) && name(value.nickname);
const wallet = value => object(value) && natural(value.balanceMinor) && revision(value.revision);
const player = (value, playerId) => owner(value) && value.playerId === playerId
  && AVATARS.includes(value.avatarId) && revision(value.revision);

function home(value, playerId) {
  return object(value) && id(value.homeId) && owner(value.owner)
    && (!playerId || value.owner.playerId === playerId)
    && object(value.address) && value.address.worldId === "dehong"
    && REGIONS.includes(value.address.regionId) && id(value.address.villageId) && id(value.address.plotId)
    && revision(value.revision) && point(value.origin) && bounds(value.bounds)
    && (value.house === null || object(value.house)) && Array.isArray(value.beds) && Array.isArray(value.animals);
}

function plot(value, worldId, villageId) {
  if (!object(value) || !id(value.plotId) || value.worldId !== worldId || value.villageId !== villageId
    || !REGIONS.includes(value.regionId) || !revision(value.revision) || !natural(value.priceMinor)
    || !point(value.origin) || !bounds(value.bounds)) return false;
  if (value.owner === null) return value.home === null;
  return owner(value.owner) && home(value.home, value.owner.playerId)
    && value.home.address.plotId === value.plotId && value.home.address.villageId === villageId;
}

function bootstrap(value, playerId) {
  if (!object(value) || value.ok !== true || value.worldId !== "dehong" || !version(value.configVersion)
    || typeof value.registered !== "boolean" || !object(value.catalog)
    || !Array.isArray(value.catalog.regions) || value.catalog.regions.length !== REGIONS.length
    || !value.catalog.regions.every(region => object(region) && REGIONS.includes(region.id))
    || new Set(value.catalog.regions.map(region => region.id)).size !== REGIONS.length
    || !Array.isArray(value.catalog.villages) || !value.catalog.villages.every(village => object(village)
      && id(village.villageId) && village.worldId === "dehong" && REGIONS.includes(village.regionId))
    || !object(value.economy) || !revision(value.economy.coinMinorPerCoin)
    || !natural(value.economy.initialGrantMinor) || !natural(value.economy.standardPlotPriceMinor)
    || !object(value.capabilities) || !["registration", "plots", "plotPurchase"].every(key => typeof value.capabilities[key] === "boolean")
    || !Object.values(value.capabilities).every(flag => typeof flag === "boolean")) return false;
  if (!value.registered) return value.player === null && value.wallet === null && value.home === null;
  return player(value.player, playerId) && wallet(value.wallet) && (value.home === null || home(value.home, playerId));
}

function receiptEnvelope(value, playerId, expectedId, expectedKind, expectedPlotId, expectedConfig) {
  const receipt = value && value.receipt;
  if (!object(value) || value.ok !== true || !object(receipt)
    || receipt.commandId !== expectedId || !["player.register", "plot.purchase"].includes(receipt.kind)
    || (expectedKind && receipt.kind !== expectedKind) || !version(receipt.configVersion)
    || !natural(receipt.serverTime) || !["committed", "rejected"].includes(receipt.status)) return false;
  const rejected = receipt.status === "rejected";
  if (rejected && !errorCode(receipt.code)) return false;
  if (!rejected && expectedConfig && receipt.configVersion !== expectedConfig) return false;
  const result = receipt.result;
  if (rejected && result === undefined) return true;
  if (!object(result)) return false;
  if (Object.prototype.hasOwnProperty.call(result, "player") && !player(result.player, playerId)) return false;
  if (Object.prototype.hasOwnProperty.call(result, "wallet") && !wallet(result.wallet)) return false;
  if (Object.prototype.hasOwnProperty.call(result, "home") && result.home !== null && !home(result.home, playerId)) return false;
  if (Object.prototype.hasOwnProperty.call(result, "plot") && (!object(result.plot)
    || !plot(result.plot, "dehong", result.plot.villageId) || !owner(result.plot.owner)
    || result.plot.owner.playerId !== playerId)) return false;
  if (rejected) return true;
  if (receipt.kind === "player.register") return player(result.player, playerId) && wallet(result.wallet);
  return wallet(result.wallet) && home(result.home, playerId) && object(result.plot)
    && result.home.address.plotId === result.plot.plotId
    && (!expectedPlotId || result.plot.plotId === expectedPlotId);
}

function backend(value) {
  if (typeof value !== "string" || !value.trim()) return failure("BACKEND_NOT_CONFIGURED");
  const url = value.trim();
  if (!/^https:\/\/[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::443)?(?:\/[A-Za-z0-9._~-]+)*\/?$/i.test(url)) {
    return failure("INVALID_BACKEND_URL");
  }
  return { ok: true, url: url.replace(/\/$/, "") };
}

export function createWorldClient(wxApi, config = {}, options = {}) {
  const base = backend(config.backendBaseUrl);
  const now = options.now || Date.now;
  const getSession = options.getSession;
  const pending = new Set();
  let disposed = false;

  function session() {
    try {
      const value = typeof getSession === "function" ? getSession() : null;
      return object(value) && value.guest === false && id(value.playerId)
        && typeof value.sessionToken === "string" && value.sessionToken.length >= 16 && value.sessionToken.length <= 4096
        && !/[\s\x00-\x1f\x7f]/.test(value.sessionToken) && Number.isSafeInteger(value.expiresAt) && value.expiresAt > now()
        ? { playerId: value.playerId, sessionToken: value.sessionToken, expiresAt: value.expiresAt } : null;
    } catch { return null; }
  }

  function request(method, path, data, validate) {
    if (disposed) return Promise.resolve(failure("CANCELLED"));
    if (!base.ok) return Promise.resolve(base);
    if (!wxApi || typeof wxApi.request !== "function") return Promise.resolve(failure("WORLD_UNAVAILABLE"));
    const identity = session();
    if (!identity) return Promise.resolve(failure("SESSION_REQUIRED"));
    return new Promise(resolve => {
      let finished = false, task, timer;
      const complete = result => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        pending.delete(cancel);
        const current = session();
        if (disposed) resolve(failure("CANCELLED"));
        else if (!current || current.playerId !== identity.playerId || current.sessionToken !== identity.sessionToken || identity.expiresAt <= now()) {
          resolve(failure("SESSION_CHANGED"));
        } else resolve(result);
      };
      const abort = () => { try { task && task.abort && task.abort(); } catch {} };
      const cancel = () => { complete(failure("CANCELLED")); abort(); };
      pending.add(cancel);
      timer = setTimeout(() => { complete(failure("NETWORK_TIMEOUT", true)); abort(); }, REQUEST_TIMEOUT);
      try {
        task = wxApi.request({
          url: `${base.url}${path}`, method, timeout: REQUEST_TIMEOUT,
          header: { "content-type": "application/json", Authorization: `Bearer ${identity.sessionToken}` },
          ...(data === undefined ? {} : { data }),
          fail: error => complete(failure(/timeout/i.test(String(error && error.errMsg || "")) ? "NETWORK_TIMEOUT" : "NETWORK_FAILED", true)),
          success: response => {
            if (finished) return;
            if (!object(response) || response.statusCode !== 200) {
              const status = response && response.statusCode;
              const code = response && response.data && response.data.error && response.data.error.code;
              return complete(failure(errorCode(code) ? code : "SERVER_REJECTED", [408, 425, 429, 500, 502, 503, 504].includes(status)));
            }
            let valid = false;
            try { valid = validate(response.data, identity.playerId); } catch {}
            if (!valid) return complete(failure("INVALID_RESPONSE"));
            // This confirms this world response only; it does not migrate or sync the local game save.
            complete({ ok: true, data: response.data, source: "server", cloudSynced: true });
          },
        });
      } catch { complete(failure("NETWORK_FAILED", true)); }
    });
  }

  return Object.freeze({
    getBootstrap() { return request("GET", "/v2/world/bootstrap", undefined, bootstrap); },
    registerPlayer(value) {
      if (!exact(value, ["commandId", "avatarId"]) || !commandId(value.commandId) || !AVATARS.includes(value.avatarId)) {
        return Promise.resolve(failure("INVALID_REQUEST"));
      }
      const intent = { commandId: value.commandId, avatarId: value.avatarId };
      return request("POST", "/v2/world/register", intent,
        (data, playerId) => receiptEnvelope(data, playerId, intent.commandId, "player.register"));
    },
    listPlots(value) {
      if (!exact(value, ["worldId", "villageId"]) || value.worldId !== "dehong" || !id(value.villageId)) {
        return Promise.resolve(failure("INVALID_REQUEST"));
      }
      const worldId = value.worldId, villageId = value.villageId;
      return request("GET", `/v2/world/plots?worldId=${encodeURIComponent(worldId)}&villageId=${encodeURIComponent(villageId)}`, undefined,
        data => object(data) && data.ok === true && data.worldId === worldId && data.villageId === villageId
          && Array.isArray(data.plots) && data.plots.every(item => plot(item, worldId, villageId)));
    },
    purchasePlot(value) {
      if (!exact(value, ["commandId", "plotId", "expectedRevision", "configVersion"]) || !commandId(value.commandId)
        || !id(value.plotId) || !revision(value.expectedRevision) || !version(value.configVersion)) {
        return Promise.resolve(failure("INVALID_REQUEST"));
      }
      const intent = {
        commandId: value.commandId, kind: "plot.purchase", targetId: value.plotId,
        expectedRevision: value.expectedRevision, configVersion: value.configVersion, payload: {},
      };
      return request("POST", "/v2/world/commands", intent,
        (data, playerId) => receiptEnvelope(data, playerId, intent.commandId, "plot.purchase", intent.targetId, intent.configVersion));
    },
    getReceipt(value) {
      if (!commandId(value)) return Promise.resolve(failure("INVALID_REQUEST"));
      return request("GET", `/v2/world/receipts/${encodeURIComponent(value)}`, undefined,
        (data, playerId) => receiptEnvelope(data, playerId, value));
    },
    dispose() { if (disposed) return; disposed = true; [...pending].forEach(cancel => cancel()); },
  });
}
