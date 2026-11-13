import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { WebSocket } from "ws";
import { createCourtyardServer } from "./server.mjs";

const ORIGIN = "http://127.0.0.1:5173";

async function setup(options = {}) {
  const server = await createCourtyardServer({
    port: 0, allowedOrigins: [ORIGIN], sessionRatePerMinute: 100,
    teaCooldownMs: 5, ...options,
  });
  return { ...server, url: `http://127.0.0.1:${server.port}`, wsUrl: `ws://127.0.0.1:${server.port}/ws` };
}

async function issue(server, resumeToken) {
  const response = await fetch(`${server.url}/session`, {
    method: "POST",
    headers: { Origin: ORIGIN, "Content-Type": "application/json" },
    body: JSON.stringify(resumeToken ? { resumeToken } : {}),
  });
  assert.equal(response.status, 200);
  return response.json();
}

async function connect(server, session, roomId = "bamboo") {
  const socket = new WebSocket(server.wsUrl, { origin: ORIGIN });
  const messages = [];
  const waiters = new Set();
  socket.on("message", (data) => {
    const message = JSON.parse(data.toString());
    messages.push(message);
    for (const waiter of waiters) waiter();
  });
  socket.on("error", () => {});
  await once(socket, "open");
  const client = {
    socket,
    messages,
    send(value) { socket.send(JSON.stringify(value)); },
    async wait(type, predicate = () => true, timeoutMs = 2000) {
      const found = () => messages.findIndex((message) => message.type === type && predicate(message));
      if (found() >= 0) return messages.splice(found(), 1)[0];
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          waiters.delete(check);
          reject(new Error(`Timed out waiting for ${type}: ${JSON.stringify(messages.slice(-5))}`));
        }, timeoutMs);
        const check = () => {
          const index = found();
          if (index >= 0) {
            clearTimeout(timer);
            waiters.delete(check);
            resolve(messages.splice(index, 1)[0]);
          }
        };
        waiters.add(check);
        check();
      });
    },
    async close() {
      if (socket.readyState === WebSocket.CLOSED) return;
      const closing = once(socket, "close");
      socket.close();
      await closing;
    },
  };
  client.send({ type: "auth", token: session.token, roomId });
  return client;
}

test("two actual visitors share authoritative movement, wishes and consensual tea, then resume identity", async () => {
  const server = await setup();
  try {
    const first = await issue(server);
    const second = await issue(server);
    assert.notEqual(first.visitor.id, second.visitor.id);
    assert.match(first.visitor.nickname, /^.{3}\d{5}$/u);
    const a = await connect(server, first);
    const b = await connect(server, second);
    const joinedA = await a.wait("joined");
    const joinedB = await b.wait("joined");
    assert.equal(joinedA.selfId, first.visitor.id);
    assert.equal(joinedB.snapshot.players.length, 2);
    const both = await a.wait("state", (state) => state.players.length === 2);
    assert.deepEqual(new Set(both.players.map((player) => player.id)), new Set([first.visitor.id, second.visitor.id]));

    a.send({ type: "move", x: 900, z: -900, yaw: 8, action: "bow" });
    const moved = await b.wait("state", (state) => state.players.some((player) => player.id === first.visitor.id && player.action === "bow"));
    const authoritative = moved.players.find((player) => player.id === first.visitor.id);
    assert.equal(authoritative.x, 50);
    assert.equal(authoritative.z, -32);
    assert.ok(authoritative.yaw >= -Math.PI && authoritative.yaw <= Math.PI);
    a.send({ type: "move", id: second.visitor.id, x: 0, z: 0, yaw: 0, action: "sit" });
    assert.equal((await a.wait("error")).code, "invalid_move");

    a.send({ type: "lantern", wish: "peace" });
    const lanternEvent = await b.wait("lantern.created");
    assert.equal(lanternEvent.lantern.ownerId, first.visitor.id);
    assert.equal(lanternEvent.lantern.wish, "peace");
    assert.equal(lanternEvent.lantern.x, 50);
    assert.equal(lanternEvent.lantern.z, -32);
    await b.wait("state", (state) => state.lanterns.some((lantern) => lantern.id === lanternEvent.lantern.id));
    a.send({ type: "lantern", wish: "peace", text: "unmoderated text" });
    assert.equal((await a.wait("error")).code, "invalid_lantern");

    b.send({ type: "move", x: 49, z: -31, yaw: 0, action: "idle" });
    await a.wait("state", (state) => state.players.some((player) => player.id === second.visitor.id && player.x === 49));
    a.send({ type: "tea.invite", targetId: second.visitor.id });
    const invitation = (await b.wait("tea.invitation")).invitation;
    await a.wait("tea.pending");
    const beforeConsent = await a.wait("state", (state) => state.serverTime >= invitation.createdAt);
    assert.equal(beforeConsent.teas.length, 0);
    a.send({ type: "tea.reply", invitationId: invitation.id, accept: true });
    assert.equal((await a.wait("error")).code, "tea_not_yours");
    b.send({ type: "tea.reply", invitationId: invitation.id, accept: true });
    assert.equal((await a.wait("tea.result")).status, "accepted");
    assert.equal((await b.wait("tea.result")).status, "accepted");
    const sharedTea = await b.wait("tea.shared");
    assert.equal(sharedTea.tea.fromId, first.visitor.id);
    assert.equal(sharedTea.tea.toId, second.visitor.id);
    await b.wait("state", (state) => state.teas.some((tea) => tea.id === invitation.id));

    a.send({ type: "tea.invite", targetId: second.visitor.id });
    const declined = (await b.wait("tea.invitation")).invitation;
    b.send({ type: "tea.reply", invitationId: declined.id, accept: false });
    assert.equal((await a.wait("tea.result")).status, "declined");
    await b.wait("tea.result");

    await a.close();
    await b.wait("state", (state) => state.players.length === 1);
    const resumed = await issue(server, first.resumeToken);
    assert.deepEqual(resumed.visitor, first.visitor);
    const reconnect = await connect(server, resumed);
    const resumedJoin = await reconnect.wait("joined");
    const self = resumedJoin.snapshot.players.find((player) => player.id === first.visitor.id);
    assert.equal(self.x, 50);
    assert.equal(self.z, -32);
    assert.equal(self.nickname, first.visitor.nickname);
    assert.equal(self.action, "idle");
    await b.wait("state", (state) => state.players.length === 2);
    await Promise.all([reconnect.close(), b.close()]);
  } finally {
    await server.close();
  }
});

test("farm coordinates sync without truncation while distant coordinates remain bounded through resume", async () => {
  const server = await setup();
  try {
    const first = await issue(server);
    const second = await issue(server);
    const a = await connect(server, first);
    const b = await connect(server, second);
    await a.wait("joined");
    await b.wait("joined");

    a.send({ type: "move", x: 48, z: 66, yaw: 0, action: "walk" });
    const farmState = await b.wait("state", (state) => state.players.some((player) => (
      player.id === first.visitor.id && player.x === 48 && player.z === 66
    )));
    assert.equal(farmState.players.find((player) => player.id === first.visitor.id).action, "walk");

    b.send({ type: "move", x: -48, z: -30, yaw: 0, action: "sit" });
    await a.wait("state", (state) => state.players.some((player) => (
      player.id === second.visitor.id && player.x === -48 && player.z === -30 && player.action === "sit"
    )));

    a.send({ type: "move", x: -1_000_000, z: 1_000_000, yaw: 0, action: "idle" });
    await b.wait("state", (state) => state.players.some((player) => (
      player.id === first.visitor.id && player.x === -50 && player.z === 68
    )));
    a.send({ type: "move", x: null, z: 0, yaw: 0, action: "idle" });
    assert.equal((await a.wait("error")).code, "invalid_move");

    await a.close();
    await b.wait("state", (state) => state.players.length === 1);
    const resumed = await connect(server, await issue(server, first.resumeToken));
    const joined = await resumed.wait("joined");
    const self = joined.snapshot.players.find((player) => player.id === first.visitor.id);
    assert.equal(self.x, -50);
    assert.equal(self.z, 68);
    await Promise.all([resumed.close(), b.close()]);
  } finally {
    await server.close();
  }
});

test("origin checks, single-use tickets, room capacity and actual room switching hold at the boundary", async () => {
  const server = await setup({ roomCapacity: 1 });
  try {
    const blocked = await fetch(`${server.url}/session`, {
      method: "POST", headers: { Origin: "https://not-allowed.example", "Content-Type": "application/json" }, body: "{}",
    });
    assert.equal(blocked.status, 403);
    const missing = await fetch(`${server.url}/session`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
    });
    assert.equal(missing.status, 403);
    const health = await (await fetch(`${server.url}/health`)).json();
    assert.equal(health.rooms, 6);
    assert.equal(health.visitors, 0);
    const first = await issue(server);
    const a = await connect(server, first);
    await a.wait("joined");
    const replay = await connect(server, first, "lotus");
    assert.equal((await replay.wait("error")).code, "invalid_token");
    await replay.close();
    const second = await issue(server);
    const b = await connect(server, second);
    assert.equal((await b.wait("error")).code, "room_full");
    await b.close();
    const secondTicket = await issue(server, second.resumeToken);
    const next = await connect(server, secondTicket, "lotus");
    await next.wait("joined");
    next.send({ type: "room.join", roomId: "bamboo" });
    assert.equal((await next.wait("error")).code, "room_full");
    a.send({ type: "room.join", roomId: "moon" });
    assert.equal((await a.wait("joined")).roomId, "moon");
    next.send({ type: "room.join", roomId: "bamboo" });
    assert.equal((await next.wait("joined")).roomId, "bamboo");
    const list = await (await fetch(`${server.url}/rooms`)).json();
    assert.equal(list.rooms.reduce((count, room) => count + room.count, 0), 2);
    assert.ok(list.rooms.every((room) => room.count <= 1));
    await Promise.all([a.close(), next.close()]);
  } finally {
    await server.close();
  }
});

test("declined and expired wishes/invitations do not become accepted tea; resume expires", async () => {
  const server = await setup({
    heartbeatMs: 25, lanternTtlMs: 80, teaInvitationTtlMs: 80, resumeTtlMs: 80,
  });
  try {
    const first = await issue(server);
    const second = await issue(server);
    const a = await connect(server, first);
    const b = await connect(server, second);
    await a.wait("joined");
    await b.wait("joined");
    a.send({ type: "lantern", wish: "gratitude" });
    const lantern = (await b.wait("lantern.created")).lantern;
    await b.wait("state", (state) => state.serverTime > lantern.expiresAt && state.lanterns.length === 0);
    a.send({ type: "tea.invite", targetId: second.visitor.id });
    const invitation = (await b.wait("tea.invitation")).invitation;
    assert.equal((await a.wait("tea.result", (event) => event.invitationId === invitation.id)).status, "expired");
    b.send({ type: "tea.reply", invitationId: invitation.id, accept: true });
    assert.equal((await b.wait("error")).code, "tea_not_yours");
    await b.wait("state", (state) => state.serverTime > invitation.expiresAt && state.teas.length === 0);
    await a.close();
    const removed = await b.wait("state", (state) => state.players.length === 1);
    await b.wait("state", (state) => state.serverTime >= removed.serverTime + 100);
    const expiredResume = await fetch(`${server.url}/session`, {
      method: "POST",
      headers: { Origin: ORIGIN, "Content-Type": "application/json" },
      body: JSON.stringify({ resumeToken: first.resumeToken }),
    });
    assert.equal(expiredResume.status, 401);
    await b.close();
  } finally {
    await server.close();
  }
});

test("resuming replaces the old connection without duplicating presence, and leaving cancels tea", async () => {
  const server = await setup();
  try {
    const first = await issue(server);
    const second = await issue(server);
    const a = await connect(server, first);
    const b = await connect(server, second);
    await a.wait("joined");
    await b.wait("joined");
    a.send({ type: "tea.invite", targetId: second.visitor.id });
    const invitation = (await b.wait("tea.invitation")).invitation;
    const closed = once(a.socket, "close");
    const freshTicket = await issue(server, first.resumeToken);
    const replacement = await connect(server, freshTicket);
    const joined = await replacement.wait("joined");
    assert.equal((await closed)[0], 4001);
    assert.equal(joined.snapshot.players.filter((player) => player.id === first.visitor.id).length, 1);
    assert.equal((await b.wait("tea.result", (event) => event.invitationId === invitation.id)).status, "cancelled");
    const actual = await b.wait("state", (state) => state.players.length === 2);
    assert.equal(new Set(actual.players.map((player) => player.id)).size, 2);
    replacement.send({ type: "tea.invite", targetId: second.visitor.id });
    const pending = (await b.wait("tea.invitation")).invitation;
    b.send({ type: "room.join", roomId: "lotus" });
    await b.wait("joined");
    assert.equal((await replacement.wait("tea.result", (event) => event.invitationId === pending.id)).status, "cancelled");
    const remaining = await replacement.wait("state", (state) => state.players.length === 1);
    assert.equal(remaining.players[0].id, first.visitor.id);
    await Promise.all([replacement.close(), b.close()]);
  } finally {
    await server.close();
  }
});

test("transport heartbeat removes a client that stops replying to ping", async () => {
  const server = await setup({ heartbeatMs: 40 });
  try {
    const session = await issue(server);
    const socket = new WebSocket(server.wsUrl, { origin: ORIGIN, autoPong: false });
    socket.on("error", () => {});
    const seen = [];
    socket.on("message", (data) => seen.push(JSON.parse(data.toString())));
    await once(socket, "open");
    socket.send(JSON.stringify({ type: "auth", token: session.token, roomId: "bamboo" }));
    await once(socket, "close");
    assert.ok(seen.some((message) => message.type === "joined"));
    const health = await (await fetch(`${server.url}/health`)).json();
    assert.equal(health.visitors, 0);
  } finally {
    await server.close();
  }
});

test("a trusted loopback proxy gives forwarded visitor IPs separate session rate limits", async () => {
  const server = await setup({ trustProxy: true, sessionRatePerMinute: 2 });
  const requestSession = async (forwardedIp) => {
    const response = await fetch(`${server.url}/session`, {
      method: "POST",
      headers: {
        Origin: ORIGIN,
        "Content-Type": "application/json",
        "X-Forwarded-For": forwardedIp,
      },
      body: "{}",
    });
    return { status: response.status, body: await response.json() };
  };
  try {
    assert.equal((await requestSession("198.51.100.10")).status, 200);
    assert.equal((await requestSession("198.51.100.10")).status, 200);
    const firstLimit = await requestSession("198.51.100.10");
    assert.equal(firstLimit.status, 429);
    assert.equal(firstLimit.body.error, "rate_limited");

    assert.equal((await requestSession("198.51.100.20")).status, 200);
    assert.equal((await requestSession("198.51.100.20")).status, 200);
    const secondLimit = await requestSession("198.51.100.20");
    assert.equal(secondLimit.status, 429);
    assert.equal(secondLimit.body.error, "rate_limited");
  } finally {
    await server.close();
  }
});

test("without proxy trust forwarded IP changes cannot bypass the shared socket IP rate limit", async () => {
  const server = await setup({ trustProxy: false, sessionRatePerMinute: 2 });
  const requestSession = async (forwardedIp) => {
    const response = await fetch(`${server.url}/session`, {
      method: "POST",
      headers: {
        Origin: ORIGIN,
        "Content-Type": "application/json",
        "X-Forwarded-For": forwardedIp,
      },
      body: "{}",
    });
    return { status: response.status, body: await response.json() };
  };
  try {
    assert.equal((await requestSession("198.51.100.10")).status, 200);
    assert.equal((await requestSession("198.51.100.20")).status, 200);
    const changedIp = await requestSession("198.51.100.30");
    assert.equal(changedIp.status, 429);
    assert.equal(changedIp.body.error, "rate_limited");
    const originalIp = await requestSession("198.51.100.10");
    assert.equal(originalIp.status, 429);
    assert.equal(originalIp.body.error, "rate_limited");
  } finally {
    await server.close();
  }
});
