import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import { WebSocket, WebSocketServer } from "ws";

export const ROOM_DEFINITIONS = Object.freeze([
  { id: "bamboo", name: "竹影庭", englishName: "Bamboo court" },
  { id: "lotus", name: "莲风庭", englishName: "Lotus court" },
  { id: "moon", name: "月白庭", englishName: "Moon court" },
  { id: "cedar", name: "松声庭", englishName: "Cedar court" },
  { id: "stillwater", name: "止水庭", englishName: "Stillwater court" },
  { id: "cloud", name: "云归庭", englishName: "Cloud court" },
]);
export const ACTIONS = Object.freeze(["idle", "walk", "bow", "sit", "woodfish", "beads"]);
export const WISHES = Object.freeze(["peace", "family", "health", "study", "prosperity", "gratitude"]);

const DEFAULT_ORIGINS = [
  "http://127.0.0.1:5173", "http://localhost:5173",
  "http://127.0.0.1:4173", "http://localhost:4173",
  "http://127.0.0.1:3002", "http://localhost:3002",
];
const NICKNAME_PREFIXES = ["竹", "松", "云", "月", "泉", "荷", "风", "山", "溪", "星", "石", "雨"];
const NICKNAME_ENDINGS = ["听客", "行客", "茶客", "闲客", "来客", "远客"];
const MAX_BODY_BYTES = 1024;
const MAX_MESSAGE_BYTES = 2048;
const WORLD_BOUNDS = Object.freeze({ minX: -50, maxX: 50, minZ: -32, maxZ: 68 });

function token(bytes = 24) {
  return randomBytes(bytes).toString("base64url");
}

function cleanOrigin(value) {
  if (typeof value !== "string" || value.length > 300) return null;
  try {
    const parsed = new URL(value);
    return ["http:", "https:"].includes(parsed.protocol) && parsed.origin === value ? value : null;
  } catch {
    return null;
  }
}

function objectWithKeys(value, required, optional = []) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && required.every((key) => Object.hasOwn(value, key))
    && Object.keys(value).every((key) => required.includes(key) || optional.includes(key));
}

function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function normalizeYaw(value) {
  const bounded = clamp(value, -Math.PI * 1000, Math.PI * 1000);
  return round(((bounded + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI);
}

function consume(bucket, now, rate, burst, amount = 1) {
  bucket.tokens = Math.min(burst, bucket.tokens + Math.max(0, now - bucket.updatedAt) * rate / 1000);
  bucket.updatedAt = now;
  if (bucket.tokens < amount) return false;
  bucket.tokens -= amount;
  return true;
}

function json(response, status, data, origin) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...(origin ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}),
  });
  response.end(JSON.stringify(data));
}

async function readJson(request) {
  if (request.headers["content-type"]?.split(";")[0].trim() !== "application/json") {
    throw Object.assign(new Error("JSON content type required"), { status: 415 });
  }
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES) throw Object.assign(new Error("Request too large"), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("Invalid JSON"), { status: 400 });
  }
}

function publicPlayer(session) {
  return {
    id: session.id,
    nickname: session.nickname,
    x: session.x,
    z: session.z,
    yaw: session.yaw,
    action: session.action,
  };
}

export async function createCourtyardServer(options = {}) {
  const host = options.host ?? process.env.ANHELI_HOST ?? "127.0.0.1";
  const requestedPort = options.port ?? Number(process.env.ANHELI_PORT ?? 4107);
  const origins = options.allowedOrigins
    ?? (process.env.ANHELI_ALLOWED_ORIGINS
      ? process.env.ANHELI_ALLOWED_ORIGINS.split(",").map((value) => value.trim()).filter(Boolean)
      : DEFAULT_ORIGINS);
  const allowedOrigins = new Set(origins.map(cleanOrigin));
  if (!allowedOrigins.size || allowedOrigins.has(null)) throw new Error("Invalid allowed origin configuration");
  if (!Number.isInteger(requestedPort) || requestedPort < 0 || requestedPort > 65535) throw new Error("Invalid port");
  const capacity = options.roomCapacity ?? 24;
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 24) throw new Error("Room capacity must be 1 to 24");
  const resumeTtlMs = options.resumeTtlMs ?? 30 * 60_000;
  const ticketTtlMs = options.ticketTtlMs ?? 60_000;
  const heartbeatMs = options.heartbeatMs ?? 15_000;
  const lanternTtlMs = options.lanternTtlMs ?? 120_000;
  const lanternCooldownMs = options.lanternCooldownMs ?? 5_000;
  const teaCooldownMs = options.teaCooldownMs ?? 5_000;
  const teaInvitationTtlMs = options.teaInvitationTtlMs ?? 20_000;
  const sessionRatePerMinute = options.sessionRatePerMinute ?? 12;
  const trustProxy = options.trustProxy ?? process.env.ANHELI_TRUST_PROXY === "1";
  const sessions = new Map();
  const resumeSessions = new Map();
  const tickets = new Map();
  const ipBuckets = new Map();
  const connections = new Set();
  const pendingTea = new Map();
  const rooms = new Map(ROOM_DEFINITIONS.map((definition) => [
    definition.id, { ...definition, members: new Set(), lanterns: [], teas: [] },
  ]));
  let closed = false;

  function roomList() {
    return [...rooms.values()].map(({ id, name, englishName, members }) => ({
      id, name, englishName, count: members.size, capacity,
    }));
  }

  function send(socket, message) {
    if (socket?.readyState !== WebSocket.OPEN) return;
    if (socket.bufferedAmount > 128 * 1024) {
      socket.close(1013, "Connection too slow");
      return;
    }
    socket.send(JSON.stringify(message));
  }

  function snapshot(room) {
    return {
      type: "state",
      roomId: room.id,
      serverTime: Date.now(),
      rooms: roomList(),
      players: [...room.members].map((id) => sessions.get(id)).filter(Boolean).map(publicPlayer),
      lanterns: room.lanterns,
      teas: room.teas,
    };
  }

  function broadcast(room, message) {
    for (const id of room.members) send(sessions.get(id)?.socket, message);
  }

  function reportError(socket, code, message) {
    send(socket, { type: "error", code, message });
  }

  function rejectMessage(connection, code, message) {
    connection.strikes += 1;
    reportError(connection.socket, code, message);
    if (connection.strikes >= 8) connection.socket.close(1008, "Invalid messages");
  }

  function completeTea(invitation, status) {
    pendingTea.delete(invitation.id);
    const event = {
      type: "tea.result",
      invitationId: invitation.id,
      fromId: invitation.fromId,
      toId: invitation.toId,
      status,
      serverTime: Date.now(),
    };
    send(sessions.get(invitation.fromId)?.socket, event);
    send(sessions.get(invitation.toId)?.socket, event);
    return event;
  }

  function cancelInvitations(sessionId) {
    for (const invitation of pendingTea.values()) {
      if (invitation.fromId === sessionId || invitation.toId === sessionId) completeTea(invitation, "cancelled");
    }
  }

  function detach(connection) {
    const session = connection.session;
    if (!session || session.socket !== connection.socket) return;
    rooms.get(session.roomId)?.members.delete(session.id);
    session.socket = null;
    session.action = "idle";
    session.expiresAt = Date.now() + resumeTtlMs;
    cancelInvitations(session.id);
  }

  function ipFor(request) {
    const remote = request.socket.remoteAddress ?? "unknown";
    if (trustProxy && ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(remote)) {
      const forwarded = request.headers["x-forwarded-for"];
      if (typeof forwarded === "string") return forwarded.split(",")[0].trim().slice(0, 80);
    }
    return remote;
  }

  function sessionBucket(ip, now) {
    let bucket = ipBuckets.get(ip);
    if (!bucket) {
      if (ipBuckets.size >= 10_000) return null;
      bucket = { tokens: sessionRatePerMinute, updatedAt: now };
      ipBuckets.set(ip, bucket);
    }
    return bucket;
  }

  function issueSession(body, origin, now) {
    let session;
    if (body.resumeToken) {
      session = resumeSessions.get(body.resumeToken);
      if (!session || session.origin !== origin || (!session.socket && session.expiresAt <= now)) return null;
    } else {
      if (sessions.size >= 4000) return false;
      const id = `v_${token(9)}`;
      const entropy = randomBytes(4);
      const nickname = `${NICKNAME_PREFIXES[entropy[0] % NICKNAME_PREFIXES.length]}${NICKNAME_ENDINGS[entropy[1] % NICKNAME_ENDINGS.length]}${entropy.readUInt16BE(2).toString().padStart(5, "0")}`;
      session = {
        id, nickname, origin,
        resumeToken: token(32),
        roomId: "bamboo",
        x: round((entropy[0] / 255 - 0.5) * 8),
        z: round(4 + entropy[1] / 255 * 4),
        yaw: 0, action: "idle", socket: null,
        expiresAt: now + resumeTtlMs,
        lastLanternAt: -Infinity,
        lastTeaAt: -Infinity,
        lastRoomChangeAt: -Infinity,
      };
      sessions.set(id, session);
      resumeSessions.set(session.resumeToken, session);
    }
    for (const [key, ticket] of tickets) if (ticket.sessionId === session.id) tickets.delete(key);
    const connectionToken = token(32);
    tickets.set(connectionToken, { sessionId: session.id, origin, expiresAt: now + ticketTtlMs });
    session.expiresAt = now + resumeTtlMs;
    return {
      token: connectionToken,
      tokenExpiresAt: now + ticketTtlMs,
      resumeToken: session.resumeToken,
      visitor: { id: session.id, nickname: session.nickname },
      rooms: roomList(),
      serverTime: now,
    };
  }

  const httpServer = createServer(async (request, response) => {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    const origin = cleanOrigin(request.headers.origin);
    const originAllowed = origin && allowedOrigins.has(origin);
    if (request.headers.origin && !originAllowed) {
      json(response, 403, { error: "origin_not_allowed" });
      return;
    }
    if (request.method === "OPTIONS") {
      if (!originAllowed || pathname !== "/session") {
        json(response, 403, { error: "origin_not_allowed" });
        return;
      }
      response.writeHead(204, {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "600",
        Vary: "Origin",
      });
      response.end();
      return;
    }
    if (request.method === "GET" && pathname === "/health") {
      json(response, 200, {
        ok: true, service: "anheli-courtyard", protocolVersion: 1,
        rooms: rooms.size, visitors: roomList().reduce((sum, room) => sum + room.count, 0),
        serverTime: Date.now(),
      }, originAllowed ? origin : undefined);
      return;
    }
    if (request.method === "GET" && pathname === "/rooms") {
      json(response, 200, { rooms: roomList(), serverTime: Date.now() }, originAllowed ? origin : undefined);
      return;
    }
    if (pathname !== "/session") {
      json(response, 404, { error: "not_found" }, originAllowed ? origin : undefined);
      return;
    }
    if (request.method !== "POST") {
      json(response, 405, { error: "method_not_allowed" }, originAllowed ? origin : undefined);
      return;
    }
    if (!originAllowed) {
      json(response, 403, { error: "origin_required" });
      return;
    }
    const now = Date.now();
    const bucket = sessionBucket(ipFor(request), now);
    if (!bucket || !consume(bucket, now, sessionRatePerMinute / 60, sessionRatePerMinute)) {
      json(response, 429, { error: "rate_limited" }, origin);
      return;
    }
    try {
      const body = await readJson(request);
      if (!objectWithKeys(body, [], ["resumeToken"])
        || (Object.hasOwn(body, "resumeToken") && (typeof body.resumeToken !== "string" || body.resumeToken.length > 100 || !body.resumeToken))) {
        json(response, 400, { error: "invalid_session_request" }, origin);
        return;
      }
      const result = issueSession(body, origin, Date.now());
      if (result === null) json(response, 401, { error: "invalid_resume_token" }, origin);
      else if (result === false) json(response, 503, { error: "session_capacity" }, origin);
      else json(response, 200, result, origin);
    } catch (error) {
      if (!response.destroyed && !response.headersSent) {
        json(response, error.status ?? 400, { error: error.status === 413 ? "request_too_large" : "invalid_request" }, origin);
      }
    }
  });
  httpServer.requestTimeout = 5000;
  httpServer.headersTimeout = 5000;
  httpServer.keepAliveTimeout = 5000;

  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_MESSAGE_BYTES,
    perMessageDeflate: false,
  });

  httpServer.on("upgrade", (request, socket, head) => {
    const origin = cleanOrigin(request.headers.origin);
    if (request.url !== "/ws" || !origin || !allowedOrigins.has(origin) || connections.size >= 256) {
      socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
      return;
    }
    wss.handleUpgrade(request, socket, head, (websocket) => {
      wss.emit("connection", websocket, request);
    });
  });

  function joinRoom(connection, roomId, initial = false) {
    const room = rooms.get(roomId);
    const session = connection.session;
    if (!room) {
      reportError(connection.socket, "unknown_room", "Choose an existing courtyard.");
      return false;
    }
    if (!room.members.has(session.id) && room.members.size >= capacity) {
      send(connection.socket, { type: "error", code: "room_full", message: "This courtyard is full.", rooms: roomList() });
      return false;
    }
    if (!initial && roomId !== session.roomId) {
      if (Date.now() - session.lastRoomChangeAt < 1000) {
        reportError(connection.socket, "room_cooldown", "Wait a moment before changing courtyard.");
        return false;
      }
      cancelInvitations(session.id);
      rooms.get(session.roomId)?.members.delete(session.id);
      session.x = 0;
      session.z = 6;
      session.yaw = 0;
      session.action = "idle";
      session.lastRoomChangeAt = Date.now();
    }
    session.roomId = roomId;
    room.members.add(session.id);
    send(connection.socket, {
      type: "joined",
      protocolVersion: 1,
      selfId: session.id,
      resumeToken: session.resumeToken,
      roomId,
      rooms: roomList(),
      snapshot: snapshot(room),
    });
    return true;
  }

  function handleAuthenticated(connection, message, now) {
    const session = connection.session;
    const room = rooms.get(session.roomId);
    if (message.type === "move") {
      if (!objectWithKeys(message, ["type", "x", "z", "yaw", "action"])
        || !finite(message.x) || !finite(message.z) || !finite(message.yaw) || !ACTIONS.includes(message.action)) {
        rejectMessage(connection, "invalid_move", "Invalid movement.");
        return;
      }
      if (!consume(connection.moveBucket, now, 20, 24)) {
        reportError(connection.socket, "move_rate_limited", "Send movement at 20 messages per second or less.");
        return;
      }
      session.x = round(clamp(message.x, WORLD_BOUNDS.minX, WORLD_BOUNDS.maxX));
      session.z = round(clamp(message.z, WORLD_BOUNDS.minZ, WORLD_BOUNDS.maxZ));
      session.yaw = normalizeYaw(message.yaw);
      session.action = message.action;
      return;
    }
    if (message.type === "lantern") {
      if (!objectWithKeys(message, ["type", "wish"]) || !WISHES.includes(message.wish)) {
        rejectMessage(connection, "invalid_lantern", "Choose a preset wish.");
        return;
      }
      if (now - session.lastLanternAt < lanternCooldownMs) {
        reportError(connection.socket, "lantern_cooldown", "Wait a moment before another lantern.");
        return;
      }
      if (room.lanterns.length >= 24) {
        reportError(connection.socket, "lantern_capacity", "Wait for a lantern to drift away.");
        return;
      }
      session.lastLanternAt = now;
      const lantern = {
        id: `l_${token(9)}`, ownerId: session.id, wish: message.wish,
        x: session.x, z: session.z, createdAt: now, expiresAt: now + lanternTtlMs,
      };
      room.lanterns.push(lantern);
      broadcast(room, { type: "lantern.created", lantern, serverTime: now });
      return;
    }
    if (message.type === "tea.invite") {
      if (!objectWithKeys(message, ["type", "targetId"]) || typeof message.targetId !== "string" || message.targetId.length > 60) {
        rejectMessage(connection, "invalid_tea_invite", "Invalid tea invitation.");
        return;
      }
      const target = sessions.get(message.targetId);
      if (!target?.socket || target.id === session.id || !room.members.has(target.id)
        || Math.hypot(target.x - session.x, target.z - session.z) > 12) {
        reportError(connection.socket, "tea_target_unavailable", "Choose another visitor nearby in this courtyard.");
        return;
      }
      if (now - session.lastTeaAt < teaCooldownMs) {
        reportError(connection.socket, "tea_cooldown", "Wait a moment before another invitation.");
        return;
      }
      if ([...pendingTea.values()].some((invitation) => [invitation.fromId, invitation.toId].includes(session.id)
        || [invitation.fromId, invitation.toId].includes(target.id))) {
        reportError(connection.socket, "tea_busy", "One tea invitation at a time.");
        return;
      }
      session.lastTeaAt = now;
      const invitation = {
        id: `t_${token(9)}`, fromId: session.id, fromNickname: session.nickname,
        toId: target.id, toNickname: target.nickname, roomId: room.id,
        createdAt: now, expiresAt: now + teaInvitationTtlMs,
      };
      pendingTea.set(invitation.id, invitation);
      send(target.socket, { type: "tea.invitation", invitation });
      send(session.socket, { type: "tea.pending", invitation });
      return;
    }
    if (message.type === "tea.reply") {
      if (!objectWithKeys(message, ["type", "invitationId", "accept"]) || typeof message.invitationId !== "string"
        || message.invitationId.length > 60 || typeof message.accept !== "boolean") {
        rejectMessage(connection, "invalid_tea_reply", "Invalid tea reply.");
        return;
      }
      const invitation = pendingTea.get(message.invitationId);
      if (!invitation || invitation.toId !== session.id) {
        reportError(connection.socket, "tea_not_yours", "This invitation is no longer available.");
        return;
      }
      const sender = sessions.get(invitation.fromId);
      if (invitation.expiresAt <= now) {
        completeTea(invitation, "expired");
      } else if (!sender?.socket || sender.roomId !== session.roomId || invitation.roomId !== session.roomId) {
        completeTea(invitation, "cancelled");
      } else if (!message.accept) {
        completeTea(invitation, "declined");
      } else {
        completeTea(invitation, "accepted");
        const tea = {
          id: invitation.id, fromId: invitation.fromId, toId: invitation.toId,
          createdAt: now, expiresAt: now + 8000,
        };
        room.teas.push(tea);
        broadcast(room, { type: "tea.shared", tea, serverTime: now });
      }
      return;
    }
    if (message.type === "room.join") {
      if (!objectWithKeys(message, ["type", "roomId"]) || typeof message.roomId !== "string") {
        rejectMessage(connection, "invalid_room", "Invalid courtyard.");
        return;
      }
      joinRoom(connection, message.roomId);
      return;
    }
    if (message.type === "ping" && objectWithKeys(message, ["type"])) {
      send(connection.socket, { type: "pong", serverTime: now });
      return;
    }
    rejectMessage(connection, "unknown_message", "Unknown message.");
  }

  wss.on("connection", (socket, request) => {
    const now = Date.now();
    const connection = {
      socket, origin: request.headers.origin, session: null, strikes: 0,
      alive: true, connectedAt: now,
      messageBucket: { tokens: 60, updatedAt: now },
      moveBucket: { tokens: 24, updatedAt: now },
    };
    connections.add(connection);
    const authTimer = setTimeout(() => {
      if (!connection.session) socket.close(1008, "Authentication required");
    }, 5000);
    authTimer.unref();
    socket.on("pong", () => { connection.alive = true; });
    socket.on("error", () => {});
    socket.on("close", () => {
      clearTimeout(authTimer);
      detach(connection);
      connections.delete(connection);
    });
    socket.on("message", (data, isBinary) => {
      const now = Date.now();
      if (isBinary || data.length > MAX_MESSAGE_BYTES) {
        rejectMessage(connection, "invalid_message", "Text JSON messages are required.");
        return;
      }
      if (!consume(connection.messageBucket, now, 40, 60)) {
        socket.close(1008, "Message rate exceeded");
        return;
      }
      let message;
      try { message = JSON.parse(data.toString()); } catch {
        rejectMessage(connection, "invalid_json", "Invalid JSON.");
        return;
      }
      if (!message || typeof message !== "object" || Array.isArray(message) || typeof message.type !== "string") {
        rejectMessage(connection, "invalid_message", "Invalid message.");
        return;
      }
      if (!connection.session) {
        if (message.type !== "auth" || !objectWithKeys(message, ["type", "token"], ["roomId"])
          || typeof message.token !== "string" || message.token.length > 100
          || (Object.hasOwn(message, "roomId") && typeof message.roomId !== "string")) {
          reportError(socket, "authentication_required", "Authenticate before joining.");
          socket.close(1008, "Authentication required");
          return;
        }
        const ticket = tickets.get(message.token);
        tickets.delete(message.token);
        const session = ticket && sessions.get(ticket.sessionId);
        if (!ticket || ticket.expiresAt <= now || ticket.origin !== connection.origin || !session) {
          reportError(socket, "invalid_token", "Request a fresh connection ticket.");
          socket.close(1008, "Invalid ticket");
          return;
        }
        const desiredRoom = message.roomId ?? session.roomId;
        const room = rooms.get(desiredRoom);
        if (!room || (!room.members.has(session.id) && room.members.size >= capacity)) {
          send(socket, { type: "error", code: room ? "room_full" : "unknown_room", message: "Choose another courtyard.", rooms: roomList() });
          socket.close(1008, "Courtyard unavailable");
          return;
        }
        const previousSocket = session.socket;
        if (previousSocket) {
          rooms.get(session.roomId)?.members.delete(session.id);
          cancelInvitations(session.id);
          previousSocket.close(4001, "Session resumed elsewhere");
        }
        connection.session = session;
        session.socket = socket;
        session.expiresAt = now + resumeTtlMs;
        clearTimeout(authTimer);
        joinRoom(connection, desiredRoom, true);
        return;
      }
      if (connection.session.socket !== socket) {
        socket.close(4001, "Session resumed elsewhere");
        return;
      }
      connection.session.expiresAt = now + resumeTtlMs;
      handleAuthenticated(connection, message, now);
    });
  });

  const broadcastTimer = setInterval(() => {
    const now = Date.now();
    for (const room of rooms.values()) {
      room.lanterns = room.lanterns.filter((lantern) => lantern.expiresAt > now);
      room.teas = room.teas.filter((tea) => tea.expiresAt > now);
      if (room.members.size) broadcast(room, snapshot(room));
    }
    for (const invitation of pendingTea.values()) {
      if (invitation.expiresAt <= now) completeTea(invitation, "expired");
    }
  }, 100);
  broadcastTimer.unref();

  const heartbeatTimer = setInterval(() => {
    const now = Date.now();
    for (const connection of connections) {
      if (!connection.alive) {
        detach(connection);
        connection.socket.terminate();
        continue;
      }
      connection.alive = false;
      if (connection.socket.readyState === WebSocket.OPEN) connection.socket.ping();
    }
    for (const [key, ticket] of tickets) if (ticket.expiresAt <= now) tickets.delete(key);
    for (const [id, session] of sessions) {
      if (!session.socket && session.expiresAt <= now) {
        sessions.delete(id);
        resumeSessions.delete(session.resumeToken);
      }
    }
    for (const [ip, bucket] of ipBuckets) if (now - bucket.updatedAt > 120_000) ipBuckets.delete(ip);
  }, heartbeatMs);
  heartbeatTimer.unref();

  await new Promise((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(requestedPort, host, () => {
      httpServer.off("error", reject);
      resolve();
    });
  }).catch((error) => {
    clearInterval(broadcastTimer);
    clearInterval(heartbeatTimer);
    wss.close();
    throw error;
  });

  return {
    httpServer,
    host,
    port: httpServer.address().port,
    async close() {
      if (closed) return;
      closed = true;
      clearInterval(broadcastTimer);
      clearInterval(heartbeatTimer);
      for (const connection of connections) connection.socket.terminate();
      await Promise.all([
        new Promise((resolve) => wss.close(resolve)),
        new Promise((resolve) => {
          httpServer.close(resolve);
          httpServer.closeAllConnections();
        }),
      ]);
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const service = await createCourtyardServer();
  console.log(`Anheli presence service listening on http://${service.host}:${service.port}`);
  const shutdown = async () => {
    await service.close();
    process.exitCode = 0;
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
