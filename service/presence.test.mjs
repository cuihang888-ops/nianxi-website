import assert from "node:assert/strict";
import test from "node:test";
import { WebSocket } from "ws";
import { connectPresence } from "../src/presence.js";
import { createCourtyardServer } from "./server.mjs";

const ORIGIN = "http://127.0.0.1:5173";

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
}

async function fixture(options = {}) {
  const server = await createCourtyardServer({
    port: 0, allowedOrigins: [ORIGIN], sessionRatePerMinute: 100, ...options,
  });
  const origin = `http://127.0.0.1:${server.port}`;
  const clients = [];
  function client(storage = memoryStorage()) {
    const messages = [];
    const statuses = [];
    const requests = [];
    const listeners = new Set();
    const notify = () => { for (const listener of listeners) listener(); };
    class BrowserSocket extends WebSocket {
      constructor(address) {
        const url = new URL(address);
        url.port = String(server.port);
        url.pathname = url.pathname.replace(/^\/anheli-live/, "");
        super(url, { origin: ORIGIN });
      }
    }
    const environment = {
      location: { href: `${ORIGIN}/images/anhe/courtyard/index.html`, protocol: "http:" },
      sessionStorage: storage,
      WebSocket: BrowserSocket,
      async fetch(address, options) {
        requests.push(JSON.parse(options.body));
        const url = new URL(address);
        url.host = new URL(origin).host;
        url.pathname = url.pathname.replace(/^\/anheli-live/, "");
        return fetch(url, { ...options, headers: { ...options.headers, Origin: ORIGIN } });
      },
    };
    const connection = connectPresence({
      onStatus(value) { statuses.push(value); notify(); },
      onJoined(value) { messages.push(value); notify(); },
      onState(value) { messages.push(value); notify(); },
      onEvent(value) { messages.push(value); notify(); },
    }, environment);
    const result = {
      connection, messages, statuses, requests, storage,
      async wait(predicate, timeout = 4500) {
        if (predicate(result)) return;
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            listeners.delete(check);
            reject(new Error(`Client condition timed out: ${JSON.stringify({ statuses, messages: messages.slice(-3), requests })}`));
          }, timeout);
          const check = () => {
            if (!predicate(result)) return;
            clearTimeout(timer);
            listeners.delete(check);
            resolve();
          };
          listeners.add(check);
          check();
        });
      },
    };
    clients.push(result);
    return result;
  }
  return {
    server, client,
    async close() {
      for (const client of clients) client.connection.dispose();
      await server.close();
    },
  };
}

test("browser connector discards an expired resume token and joins through a fresh anonymous session", async () => {
  const fixtureData = await fixture();
  try {
    const client = fixtureData.client(memoryStorage({ "anheli-resume": "expired-or-invalid" }));
    await client.wait(({ statuses }) => statuses.includes("connected"));
    assert.deepEqual(client.requests.slice(0, 2), [{ resumeToken: "expired-or-invalid" }, {}]);
    assert.notEqual(client.storage.getItem("anheli-resume"), "expired-or-invalid");
    assert.ok(client.storage.getItem("anheli-resume"));
    const state = client.messages.find(message => message.type === "state");
    assert.equal(state.rooms.length, 6);
    assert.equal(state.players.length, 1);
  } finally {
    await fixtureData.close();
  }
});

test("browser connector recovers from a full preferred room and only persists successful room changes", async () => {
  const fixtureData = await fixture({ roomCapacity: 1 });
  try {
    const a = fixtureData.client();
    await a.wait(({ statuses }) => statuses.includes("connected"));
    const b = fixtureData.client();
    await b.wait(({ messages }) => messages.some(message => message.type === "joined" && message.roomId === "lotus"));
    const full = b.messages.find(message => message.type === "error" && message.code === "room_full");
    assert.equal(full.messageKey, "presence.error.room_full");
    assert.ok(full.messageZh);
    assert.equal(b.storage.getItem("anheli-room"), "lotus");
    assert.equal(b.connection.join("bamboo"), true);
    await b.wait(({ messages }) => messages.filter(message => message.type === "error" && message.code === "room_full").length === 2);
    assert.equal(b.storage.getItem("anheli-room"), "lotus");
    b.connection.join("moon");
    await b.wait(({ messages }) => messages.some(message => message.type === "joined" && message.roomId === "moon"));
    assert.equal(b.storage.getItem("anheli-room"), "moon");
  } finally {
    await fixtureData.close();
  }
});

test("a replaced browser connection stops reconnecting instead of taking the session back", async () => {
  const fixtureData = await fixture();
  try {
    const storage = memoryStorage();
    const first = fixtureData.client(storage);
    await first.wait(({ statuses }) => statuses.includes("connected"));
    const visitorId = first.messages.find(message => message.type === "joined").selfId;
    const second = fixtureData.client(storage);
    await second.wait(({ statuses }) => statuses.includes("connected"));
    await first.wait(({ statuses }) => statuses.includes("replaced"));
    assert.equal(second.messages.find(message => message.type === "joined").selfId, visitorId);
    assert.equal(first.connection.send({ type: "ping" }), false);
    const replacementTime = Date.now();
    await second.wait(({ messages }) => messages.some(message => message.type === "state" && message.serverTime >= replacementTime + 1700));
    assert.equal(first.requests.length, 1);
    assert.equal(first.statuses.at(-1), "replaced");
    assert.equal(second.statuses.at(-1), "connected");
    const state = second.messages.filter(message => message.type === "state").at(-1);
    assert.equal(state.players.length, 1);
  } finally {
    await fixtureData.close();
  }
});

test("an obsolete stored room does not trap the browser in failed authentication", async () => {
  const fixtureData = await fixture();
  try {
    const client = fixtureData.client(memoryStorage({ "anheli-room": "retired-courtyard" }));
    await client.wait(({ statuses }) => statuses.includes("connected"));
    assert.ok(client.messages.some(message => message.type === "error" && message.code === "unknown_room"));
    assert.equal(client.storage.getItem("anheli-room"), "bamboo");
    assert.equal(client.requests.length, 2);
  } finally {
    await fixtureData.close();
  }
});

test("a browser without storage still joins and does not send actions before the handshake", async () => {
  const fixtureData = await fixture();
  try {
    const inaccessibleStorage = {
      getItem() { throw new Error("Storage unavailable"); },
      setItem() { throw new Error("Storage unavailable"); },
      removeItem() { throw new Error("Storage unavailable"); },
    };
    const client = fixtureData.client(inaccessibleStorage);
    assert.equal(client.connection.send({ type: "move", x: 1, z: 1, yaw: 0, action: "walk" }), false);
    await client.wait(({ statuses }) => statuses.includes("connected"));
    assert.equal(client.connection.send({ type: "ping" }), true);
    await client.wait(({ messages }) => messages.some(message => message.type === "pong"));
  } finally {
    await fixtureData.close();
  }
});
