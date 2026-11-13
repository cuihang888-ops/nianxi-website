const errorMessages = {
  session_replaced: ["此窗口的连接已由另一处接续", "This visit has continued in another window."],
  room_full: ["这一庭已坐满，正在寻找另一处空庭", "This courtyard is full. Looking for another courtyard."],
  unknown_room: ["这一庭暂不可用，请另择一庭", "This courtyard is unavailable. Choose another courtyard."],
  room_cooldown: ["稍候片刻再移步另一庭", "Wait a moment before changing courtyard."],
  lantern_cooldown: ["让上一盏心灯先飘一会儿", "Let your last lantern drift for a moment."],
  lantern_capacity: ["这一庭的心灯暂满，稍候再挂", "Wait for a lantern to drift away before hanging another."],
  tea_target_unavailable: ["请向同一庭里附近的来客邀茶", "Invite someone nearby in this courtyard."],
  tea_cooldown: ["稍候片刻再递茶邀", "Wait a moment before another tea invitation."],
  tea_busy: ["先等这一盏茶的回音", "Wait for the current tea invitation."],
  tea_not_yours: ["这份茶邀已经结束", "This tea invitation is no longer available."],
  invalid_token: ["正在重新入庭", "Requesting a fresh courtyard connection."],
  move_rate_limited: ["移步稍缓，连接正在同步", "The courtyard is catching up with your movement."],
};

function eventWithMessage(data) {
  if (data.type !== "error") return data;
  const text = errorMessages[data.code];
  return {
    ...data,
    messageKey: `presence.error.${data.code || "unavailable"}`,
    messageZh: text?.[0] || "暂时无法完成，请稍后再试",
    messageEn: text?.[1] || data.message || "Please try again in a moment.",
  };
}

export function connectPresence({ onStatus, onJoined, onState, onEvent }, environment = globalThis) {
  const BrowserSocket = environment.WebSocket;
  const request = environment.fetch.bind(environment);
  const pageLocation = environment.location;
  let storage;
  try { storage = environment.sessionStorage; } catch {}
  const readStored = key => {
    try { return storage?.getItem(key) || ""; } catch { return ""; }
  };
  const writeStored = (key, value) => {
    try {
      if (value) storage?.setItem(key, value);
      else storage?.removeItem(key);
    } catch {}
  };
  let socket;
  let disposed = false;
  let replaced = false;
  let starting = false;
  let joined = false;
  let retry;
  let timer;
  let requestController;
  let generation = 0;
  let roomId = readStored("anheli-room") || "bamboo";
  let desiredRoomId = roomId;
  let rejectedRoomId = "";
  let resumeToken = readStored("anheli-resume");
  let rooms = [];
  let attempts = 0;
  const base = new URL("/anheli-live/", pageLocation.href);

  const send = data => {
    if (!disposed && !replaced && joined && socket?.readyState === BrowserSocket.OPEN) {
      socket.send(JSON.stringify(data));
      return true;
    }
    return false;
  };

  const emit = data => onEvent(eventWithMessage(data));

  async function sessionRequest(signal) {
    let response = await request(new URL("session", base), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(resumeToken ? { resumeToken } : {}),
      signal,
    });
    if (response.status === 401 && resumeToken) {
      resumeToken = "";
      writeStored("anheli-resume", "");
      response = await request(new URL("session", base), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        signal,
      });
    }
    if (!response.ok) throw new Error("Presence unavailable");
    const session = await response.json();
    if (!session || typeof session.token !== "string" || typeof session.resumeToken !== "string"
      || !Array.isArray(session.rooms)) throw new Error("Invalid session response");
    return session;
  }

  async function start() {
    if (disposed || replaced || starting) return;
    starting = true;
    clearTimeout(retry);
    const currentGeneration = ++generation;
    onStatus(attempts ? "reconnecting" : "connecting");
    const controller = new AbortController();
    requestController = controller;
    const requestTimeout = setTimeout(() => controller.abort(), 6500);
    try {
      const session = await sessionRequest(controller.signal);
      if (disposed || replaced || currentGeneration !== generation) return;
      resumeToken = session.resumeToken;
      writeStored("anheli-resume", resumeToken);
      rooms = session.rooms;
      if (rejectedRoomId) {
        const available = rooms.find(room => room.id !== rejectedRoomId && room.count < room.capacity)
          || rooms.find(room => room.count < room.capacity);
        if (available) desiredRoomId = available.id;
      }
      const address = new URL("ws", base);
      address.protocol = base.protocol === "https:" ? "wss:" : "ws:";
      const nextSocket = new BrowserSocket(address);
      socket = nextSocket;
      joined = false;
      const isCurrent = () => !disposed && currentGeneration === generation && socket === nextSocket;
      nextSocket.addEventListener("open", () => {
        if (isCurrent()) nextSocket.send(JSON.stringify({ type: "auth", token: session.token, roomId: desiredRoomId }));
      });
      nextSocket.addEventListener("message", message => {
        if (!isCurrent()) return;
        let data;
        try { data = JSON.parse(message.data); } catch { return; }
        if (!data || typeof data !== "object" || Array.isArray(data)) return;
        if (data.type === "joined") {
          attempts = 0;
          joined = true;
          rejectedRoomId = "";
          roomId = data.roomId;
          desiredRoomId = roomId;
          rooms = data.rooms || rooms;
          writeStored("anheli-room", roomId);
          onStatus("connected");
          onJoined(data);
          if (data.snapshot) onState(data.snapshot);
          clearInterval(timer);
          timer = setInterval(() => send({ type: "ping" }), 15000);
        } else if (data.type === "state") {
          if (data.rooms) rooms = data.rooms;
          if (joined && data.roomId === roomId) onState(data);
        } else {
          if (data.type === "error" && ["room_full", "unknown_room"].includes(data.code) && !joined) {
            rejectedRoomId = desiredRoomId;
            rooms = data.rooms || rooms;
            const available = rooms.find(room => room.id !== rejectedRoomId && room.count < room.capacity);
            if (available) desiredRoomId = available.id;
            nextSocket.close();
          }
          emit(data);
        }
      });
      nextSocket.addEventListener("close", event => {
        if (!isCurrent()) return;
        clearInterval(timer);
        joined = false;
        socket = undefined;
        if (event.code === 4001) {
          replaced = true;
          onState({ type: "state", roomId, serverTime: Date.now(), players: [], lanterns: [], teas: [], rooms });
          onStatus("replaced");
          emit({ type: "error", code: "session_replaced", message: "This visit has continued in another window." });
          return;
        }
        reconnect();
      });
      nextSocket.addEventListener("error", () => {
        if (isCurrent()) nextSocket.close();
      });
    } catch {
      if (!disposed && !replaced && currentGeneration === generation) reconnect();
    } finally {
      clearTimeout(requestTimeout);
      if (requestController === controller) requestController = undefined;
      starting = false;
    }
  }

  function reconnect() {
    if (disposed || replaced) return;
    clearTimeout(retry);
    onStatus("offline");
    attempts++;
    retry = setTimeout(start, Math.min(15000, 1500 * attempts));
  }

  start();
  return {
    send,
    join(next) {
      if (typeof next !== "string" || next === roomId) return false;
      return send({ type: "room.join", roomId: next });
    },
    dispose() {
      disposed = true;
      generation++;
      joined = false;
      clearTimeout(retry);
      clearInterval(timer);
      requestController?.abort();
      socket?.close();
    },
  };
}
