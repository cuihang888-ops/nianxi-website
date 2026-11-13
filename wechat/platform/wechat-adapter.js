const ERROR_MESSAGES = Object.freeze({
  BACKEND_NOT_CONFIGURED: "登录服务尚未配置，微信账号暂未接通。",
  INVALID_BACKEND_URL: "登录服务必须使用已配置的 HTTPS 域名。",
  LOGIN_UNAVAILABLE: "当前环境不支持微信登录。",
  LOGIN_FAILED: "微信登录未完成，请重试。",
  LOGIN_CODE_MISSING: "微信未返回登录凭证，请重试。",
  NETWORK_FAILED: "无法连接登录服务，请稍后重试。",
  SERVER_REJECTED: "登录服务尚未确认身份，请稍后重试。",
  INVALID_SESSION: "登录服务返回的会话无效，身份未确认。",
  CANCELLED: "登录请求已经取消。",
});

function failure(code) {
  return { ok: false, error: { code, message: ERROR_MESSAGES[code] } };
}

function legacyJsonData(value, ancestors = new Set(), depth = 0) {
  if (depth > 32) return false;
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || ancestors.has(value)) return false;
  if (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return false;
  const keys = Reflect.ownKeys(value);
  if (keys.some(key => typeof key !== "string")) return false;
  const entries = Array.isArray(value) ? keys.filter(key => key !== "length") : keys;
  if (Array.isArray(value) && (entries.length !== value.length || entries.some((key, index) => key !== String(index)))) return false;
  ancestors.add(value);
  const valid = entries.every(key => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor.enumerable && Object.hasOwn(descriptor, "value") && legacyJsonData(descriptor.value, ancestors, depth + 1);
  });
  ancestors.delete(value);
  return valid;
}

function backendUrl(value) {
  if (typeof value !== "string" || !value.trim()) return failure("BACKEND_NOT_CONFIGURED");
  const url = value.trim();
  if (!/^https:\/\/[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::443)?(?:\/[A-Za-z0-9._~-]+)*\/?$/i.test(url)) return failure("INVALID_BACKEND_URL");
  return { ok: true, url: url.replace(/\/$/, "") };
}

function validSession(data, now) {
  return data && typeof data === "object" && data.ok === true
    && typeof data.playerId === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(data.playerId)
    && typeof data.sessionToken === "string" && data.sessionToken.length >= 16 && data.sessionToken.length <= 4096
    && !/[\s\x00-\x1f\x7f]/.test(data.sessionToken)
    && Number.isSafeInteger(data.expiresAt) && data.expiresAt > now;
}

export function createWechatAdapter(wxApi, config, options = {}) {
  const now = options.now || Date.now;
  const base = backendUrl(config.backendBaseUrl);
  let session = null;
  let pendingLogin = null;
  let generation = 0;
  const disposers = new Set();

  const storage = Object.freeze({
    getItem(key) {
      const value = wxApi.getStorageSync(key);
      if (value === "" || value === undefined || value === null) return null;
      if (typeof value !== "string") throw new TypeError("Unexpected storage format");
      return value;
    },
    getLegacyItem(key) {
      if (key !== "anheli-minigame-v1") throw new TypeError("Unsupported legacy storage key");
      const value = wxApi.getStorageSync(key);
      if (value === "" || value === undefined || value === null) return null;
      if (typeof value === "string") return value;
      if (!value || Array.isArray(value) || typeof value !== "object" || !legacyJsonData(value)) {
        throw new TypeError("Unexpected legacy storage format");
      }
      return JSON.stringify(value);
    },
    setItem(key, value) {
      if (typeof value !== "string") throw new TypeError("Storage values must be strings");
      wxApi.setStorageSync(key, value);
    },
    removeItem(key) { wxApi.removeStorageSync(key); },
  });

  function startLogin() {
    if (pendingLogin) return pendingLogin;
    if (!base.ok) return Promise.resolve(base);
    if (typeof wxApi.login !== "function" || typeof wxApi.request !== "function") return Promise.resolve(failure("LOGIN_UNAVAILABLE"));
    const attempt = generation;
    pendingLogin = new Promise(resolve => {
      let finished = false;
      const finish = result => {
        if (finished) return;
        finished = true;
        resolve(attempt === generation ? result : failure("CANCELLED"));
      };
      try {
        wxApi.login({
          timeout: 10000,
          fail: () => finish(failure("LOGIN_FAILED")),
          success: result => {
            if (finished) return;
            if (attempt !== generation) return finish(failure("CANCELLED"));
            if (typeof result?.code !== "string" || !result.code.trim()) return finish(failure("LOGIN_CODE_MISSING"));
            try {
              wxApi.request({
                url: `${base.url}/v1/auth/wechat/session`,
                method: "POST",
                header: { "content-type": "application/json" },
                timeout: 10000,
                data: { code: result.code, clientVersion: config.clientVersion, protocolVersion: config.protocolVersion },
                fail: () => finish(failure("NETWORK_FAILED")),
                success: response => {
                  if (finished) return;
                  if (attempt !== generation) return finish(failure("CANCELLED"));
                  if (response.statusCode !== 200) return finish(failure("SERVER_REJECTED"));
                  if (!validSession(response.data, now())) return finish(failure("INVALID_SESSION"));
                  session = Object.freeze({
                    playerId: response.data.playerId,
                    sessionToken: response.data.sessionToken,
                    expiresAt: response.data.expiresAt,
                    guest: false,
                  });
                  finish({ ok: true, session });
                },
              });
            } catch { finish(failure("NETWORK_FAILED")); }
          },
        });
      } catch { finish(failure("LOGIN_FAILED")); }
    }).finally(() => { pendingLogin = null; });
    return pendingLogin;
  }

  function signOut() {
    generation += 1;
    session = null;
  }

  function subscribeLifecycle(handlers = {}) {
    let active = true;
    const bindings = [["Show", "onShow"], ["Hide", "onHide"], ["Error", "onError"]]
      .filter(([, handler]) => typeof handlers[handler] === "function")
      .map(([event, handler]) => {
        const callback = value => { if (active) handlers[handler](value); };
        wxApi[`on${event}`]?.(callback);
        return [event, callback];
      });
    const dispose = () => {
      if (!active) return;
      active = false;
      bindings.forEach(([event, callback]) => wxApi[`off${event}`]?.(callback));
      disposers.delete(dispose);
    };
    disposers.add(dispose);
    return dispose;
  }

  return Object.freeze({
    storage,
    startLogin,
    signOut,
    getSession() {
      if (session && session.expiresAt <= now()) session = null;
      return session;
    },
    getDiagnostics() {
      return { appId: config.appId, clientVersion: config.clientVersion, backendConfigured: base.ok, backendError: base.ok ? null : base.error };
    },
    subscribeLifecycle,
    dispose() { signOut(); [...disposers].forEach(dispose => dispose()); },
  });
}
