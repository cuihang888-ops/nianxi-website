import assert from 'node:assert/strict';
import test from 'node:test';
import { assistantConfiguration } from '../lib/assistant.mjs';
import { createApplication } from '../server.mjs';

const config = assistantConfiguration({
  ASSISTANT_API_URL: 'https://example.invalid/v1',
  ASSISTANT_API_KEY: 'synthetic-rollout-key',
  ASSISTANT_MODEL: 'synthetic-rollout-model'
});
const statusPath = '/api/ai/status';
const pagePath = '/tearoom/assistant.html';
const teaRoomPath = '/tearoom/';
const usagePath = '/api/ai/usage';
const chatPath = '/api/ai/chat';
const input = { task: 'translate', text: '请把手镯放在自然光下。', target: 'en' };
const modelOutput = 'Please place the bangle in natural light.';
const modelResponse = () => Response.json({ choices: [{ message: { content: modelOutput } }] });

async function fixture(t, assistantAccess, provider = modelResponse) {
  let providerCalls = 0;
  const app = createApplication({
    dbPath: ':memory:', host: '127.0.0.1', port: 0, demo: true, today: '2026-11-25',
    assistantConfig: config, assistantDemo: false,
    ...(assistantAccess ? { assistantAccess } : {}),
    assistantFetch: async () => {
      providerCalls++;
      return provider();
    }
  });
  const { port } = await app.listen();
  t.after(() => app.close());
  const base = 'http://127.0.0.1:' + port;

  function request(path, { cookie, data, method = data === undefined ? 'GET' : 'POST', signal } = {}) {
    const headers = {
      ...(cookie && { Cookie: cookie }),
      ...(data !== undefined && { 'Content-Type': 'application/json' })
    };
    return fetch(base + path, { method, headers, body: data === undefined ? undefined : JSON.stringify(data), signal });
  }

  async function login(username, password) {
    const response = await request('/api/login', { data: { username, password } });
    assert.equal(response.status, 200);
    return response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  }

  async function joinTeaRoom() {
    const response = await request('/api/tearoom/session', { data: {} });
    assert.equal(response.status, 200);
    return response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  }

  const assistantTables = () => app.store.db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('assistant_daily', 'assistant_bucket') ORDER BY name"
  ).all().map(row => row.name);
  return { request, login, joinTeaRoom, assistantTables, providerCalls: () => providerCalls };
}

test('provider configuration alone keeps assistant routes closed', async t => {
  const { request, login, joinTeaRoom, assistantTables, providerCalls } = await fixture(t);
  const admin = await login('demo', 'demo2026!');
  const teaRoom = await joinTeaRoom();
  for (const cookie of [undefined, admin, teaRoom]) {
    for (const path of [statusPath, pagePath, usagePath]) {
      const response = await request(path, { cookie });
      assert.equal(response.status, 404, path);
    }
    const chat = await request(chatPath, { cookie, data: input });
    assert.equal(chat.status, 404);
  }
  assert.deepEqual(assistantTables(), []);
  assert.equal(providerCalls(), 0);
});

test('assistant pilot requires an administrator and accepts their existing account session', async t => {
  const { request, login, joinTeaRoom, assistantTables, providerCalls } = await fixture(t, 'pilot');
  const admin = await login('demo', 'demo2026!');
  const manager = await login('manager', 'manage2026!');
  const teaRoom = await joinTeaRoom();
  for (const cookie of [undefined, manager, teaRoom]) {
    for (const path of [statusPath, pagePath, usagePath, '/tearoom/assistant.js', '/tearoom/assistant.css']) {
      const response = await request(path, { cookie });
      assert.equal(response.status, 404, path);
    }
    assert.equal((await request(chatPath, { cookie, data: input })).status, 404);
  }

  const publicTea = await request(teaRoomPath, { cookie: teaRoom });
  assert.equal(publicTea.status, 200);
  assert.equal(publicTea.headers.get('cache-control'), 'private, no-store');
  assert.doesNotMatch(await publicTea.text(), /href="\.\/assistant\.html"/);
  const adminTea = await request(teaRoomPath, { cookie: admin });
  assert.equal(adminTea.status, 200);
  assert.equal(adminTea.headers.get('cache-control'), 'private, no-store');
  assert.match(await adminTea.text(), /href="\.\/assistant\.html"/);
  const dedicatedPage = await request(pagePath, { cookie: admin });
  assert.equal(dedicatedPage.status, 200);
  assert.equal(dedicatedPage.headers.get('cache-control'), 'private, no-store');
  const sharedStyles = await request('/tearoom/styles.css');
  assert.equal(sharedStyles.status, 200);
  assert.doesNotMatch(await sharedStyles.text(), /assistant|\.ai-/i);
  assert.deepEqual(assistantTables(), []);

  const status = await request(statusPath, { cookie: admin });
  assert.equal(status.status, 200);
  assert.deepEqual(await status.json(), { mode: 'pilot', canViewUsage: true, needsTeaSession: false });
  assert.equal((await request(usagePath, { cookie: admin })).status, 200);
  assert.equal(providerCalls(), 0);
  const chat = await request(chatPath, { cookie: admin, data: input });
  assert.equal(chat.status, 200);
  assert.deepEqual(await chat.json(), { text: modelOutput, mode: 'pilot' });
  assert.deepEqual(assistantTables(), ['assistant_bucket', 'assistant_daily']);
  assert.equal(providerCalls(), 1);
});

test('employee rollout exposes the page and gates chat behind a tea room session', async t => {
  const { request, login, joinTeaRoom, providerCalls } = await fixture(t, 'employees');
  const teaHome = await request(teaRoomPath);
  assert.equal(teaHome.status, 200);
  const html = await teaHome.text();
  assert.match(html, /href="\.\/assistant\.html"/);
  assert.doesNotMatch(html, /<(?:script|link)\b[^>]*(?:assistant\.js|assistant\.css)/i);
  assert.equal(providerCalls(), 0);
  const status = await request(statusPath);
  assert.equal(status.status, 200);
  assert.deepEqual(await status.json(), { mode: 'live', canViewUsage: false, needsTeaSession: true });
  assert.equal((await request(pagePath)).status, 200);
  assert.equal((await request(chatPath, { data: input })).status, 401);
  const teaRoom = await joinTeaRoom();
  const admin = await login('demo', 'demo2026!');
  assert.equal((await request(usagePath, { cookie: teaRoom })).status, 401);
  assert.equal((await request(usagePath, { cookie: admin })).status, 200);
  assert.equal(providerCalls(), 0);
  const chat = await request(chatPath, { cookie: teaRoom, data: input });
  assert.equal(chat.status, 200);
  assert.deepEqual(await chat.json(), { text: modelOutput, mode: 'live' });
  assert.equal(providerCalls(), 1);
});

test('health and entry roster respond while a model request is waiting', async t => {
  const modelEntered = Promise.withResolvers();
  const modelComplete = Promise.withResolvers();
  const { request, joinTeaRoom } = await fixture(t, 'employees', () => {
    modelEntered.resolve();
    return modelComplete.promise;
  });
  const cookie = await joinTeaRoom();
  const chat = request(chatPath, { cookie, data: input });
  try {
    const first = await Promise.race([modelEntered.promise, chat]);
    assert.equal(first, undefined, 'the model request is active');
    const [health, entry] = await Promise.all([
      request('/api/health', { signal: AbortSignal.timeout(3000) }),
      request('/api/entry/bootstrap', { signal: AbortSignal.timeout(3000) })
    ]);
    assert.deepEqual(await health.json(), { ok: true });
    assert.equal(entry.status, 200);
    assert.ok((await entry.json()).anchors.length > 0);
  } finally {
    modelComplete.resolve(modelResponse());
    const response = await chat;
    assert.equal(response.status, 200);
  }
});
