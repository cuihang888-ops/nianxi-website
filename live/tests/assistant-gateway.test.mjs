import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { assistantConfiguration, createAssistant } from '../lib/assistant.mjs';

const primary = {
  ASSISTANT_API_URL: 'https://example.invalid/v1',
  ASSISTANT_API_KEY: 'synthetic-primary-key',
  ASSISTANT_MODEL: 'translate-demo'
};
const person = { identity: 'synthetic-browser-id', secondaryIdentity: 'synthetic-address' };
const clock = () => new Date('2026-11-27T16:05:00.000Z');
const payload = { action: 'translate', text: '请把手镯放在自然光下。', source: 'zh', target: 'vi' };
const reply = (text = 'Vui lòng đặt vòng tay dưới ánh sáng tự nhiên.') => Response.json({
  choices: [{ message: { content: text } }], usage: { prompt_tokens: 36, completion_tokens: 12 }
});
const codeIs = code => error => error.details?.code === code;

function fixture(t, config, fetchImpl, overrides = {}) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  const assistant = createAssistant({ store: { db }, config, fetchImpl, now: clock, ...overrides });
  return { assistant, db };
}

test('provider addresses are canonicalized and credentials stay specific to the configured origin', () => {
  assert.equal(assistantConfiguration({}).primary, null);
  const config = assistantConfiguration({ ...primary, ASSISTANT_FALLBACK_MODEL: 'other-model' });
  assert.equal(config.primary.url, 'https://example.invalid/v1/chat/completions');
  assert.equal(config.fallback.url, config.primary.url);
  assert.equal(config.fallback.key, config.primary.key);
  assert.throws(() => assistantConfiguration({
    ...primary, ASSISTANT_FALLBACK_MODEL: 'other-model',
    ASSISTANT_FALLBACK_API_URL: 'https://example.invalid:8443/v1'
  }), /独立配置/);
  const secondary = assistantConfiguration({
    ...primary, ASSISTANT_FALLBACK_MODEL: 'other-model',
    ASSISTANT_FALLBACK_API_URL: 'https://other.invalid/v1/chat/completions',
    ASSISTANT_FALLBACK_API_KEY: 'synthetic-fallback-key'
  }).fallback;
  assert.equal(secondary.url, 'https://other.invalid/v1/chat/completions');
  assert.equal(secondary.key, 'synthetic-fallback-key');
  for (const url of ['http://example.invalid/v1', 'https://key@example.invalid/v1', 'https://example.invalid/v1?key=x']) {
    assert.throws(() => assistantConfiguration({ ...primary, ASSISTANT_API_URL: url }), /HTTPS/);
  }
  assert.throws(() => assistantConfiguration({ ...primary, ASSISTANT_FALLBACK_MODEL: primary.ASSISTANT_MODEL }), /不同模型/);
});

test('valid language requests are transformed and sensitive or unsupported input never reaches the provider', async t => {
  const messages = [];
  const { assistant, db } = fixture(t, assistantConfiguration(primary), async (url, options) => {
    assert.equal(url, 'https://example.invalid/v1/chat/completions');
    assert.equal(options.redirect, 'error');
    assert.equal(options.credentials, 'omit');
    const request = JSON.parse(options.body);
    messages.push(request.messages);
    return reply('本地测试结果');
  });
  for (const input of [
    { ...payload, text: '手机联系１３８​ ００１３ ８０００。' },
    { ...payload, text: 'โทร+95 912 345 678' },
    { ...payload, text: 'WeChat: synthetic_agent' },
    { ...payload, text: 'My email is person@example.invalid' },
    { ...payload, text: '今天销售额达到十万元' },
    { ...payload, text: 'Doanh thu 5000' },
    { ...payload, text: 'ဝင်ငွေ ၁၅၀' }
  ]) await assert.rejects(assistant.run(input, person), codeIs('ASSISTANT_SENSITIVE'));
  for (const input of [
    { ...payload, target: ['zh'] },
    { ...payload, target: 'fr' },
    { ...payload, action: 'summarize' },
    { ...payload, key: 'supplied-by-caller' },
    { ...payload, text: '练'.repeat(2001) }
  ]) await assert.rejects(assistant.run(input, person), error => error.status === 400);
  assert.equal(messages.length, 0);
  for (const target of ['zh', 'en', 'vi', 'my']) {
    assert.deepEqual(await assistant.run({ ...payload, target }, person), { text: '本地测试结果' });
  }
  const original = '请核对这只手镯的圈口 56 毫米。';
  await assistant.run({ action: 'polish', text: original }, person);
  await assistant.run({ ...payload, text: '练'.repeat(2000) }, person);
  assert.match(messages[3][0].content, /Translate.*Burmese/);
  assert.match(messages[4][0].content, /original language/);
  assert.equal(messages[4][1].content, original);
  const [usage] = assistant.usage().days;
  assert.equal(usage.date, '2026-11-28');
  assert.equal(usage.requests, 6);
  assert.equal(usage.providerInputTokens, 216);
  assert.equal(usage.providerOutputTokens, 72);
  assert.equal(usage.meteredAttempts, 6);
  const persisted = JSON.stringify([
    db.prepare('SELECT * FROM assistant_daily').all(),
    db.prepare('SELECT * FROM assistant_bucket').all()
  ]);
  assert(!persisted.includes(original));
  assert(!persisted.includes(primary.ASSISTANT_API_KEY));
  assert(!persisted.includes(person.identity));
  assert(!persisted.includes(person.secondaryIdentity));
});

test('fallback, aborted request and rejected output consume bounded accounted attempts', async t => {
  const providers = [];
  const config = assistantConfiguration({
    ...primary, ASSISTANT_TIMEOUT_MS: '100',
    ASSISTANT_FALLBACK_API_URL: 'https://secondary.invalid/v1',
    ASSISTANT_FALLBACK_API_KEY: 'synthetic-fallback-key',
    ASSISTANT_FALLBACK_MODEL: 'other-demo'
  });
  const { assistant } = fixture(t, config, (url, options) => {
    providers.push([new URL(url).host, options.headers.Authorization]);
    if (url.includes('example.invalid')) {
      return new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }));
    }
    return Promise.resolve(reply(providers.length === 4 ? '联系号码 13800138000' : '备用输出'));
  });
  assert.equal((await assistant.run(payload, person)).text, '备用输出');
  assert.deepEqual(providers, [
    ['example.invalid', 'Bearer synthetic-primary-key'],
    ['secondary.invalid', 'Bearer synthetic-fallback-key']
  ]);
  await assert.rejects(assistant.run(payload, person), codeIs('ASSISTANT_OUTPUT_BLOCKED'));
  const [usage] = assistant.usage().days;
  assert.equal(usage.requests, 2);
  assert.equal(usage.attempts, 4);
  assert.equal(usage.primaryAttempts, 2);
  assert.equal(usage.fallbackAttempts, 2);
  assert.equal(usage.meteredAttempts, 2);
  assert(usage.budgetUnits > usage.inputUnits + usage.outputUnits);
});

test('identity, address and total reservations are enforced durably for concurrent calls', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'assistant-usage-'));
  const path = resolve(directory, 'usage.sqlite');
  const config = assistantConfiguration({
    ...primary, ASSISTANT_IDENTITY_DAILY_REQUESTS: '1', ASSISTANT_ADDRESS_DAILY_REQUESTS: '2',
    ASSISTANT_GLOBAL_DAILY_REQUESTS: '3'
  });
  let requests = 0;
  const fetchImpl = async () => {
    requests++;
    return reply();
  };
  const open = () => {
    const db = new DatabaseSync(path);
    return { db, assistant: createAssistant({ store: { db }, config, fetchImpl, now: clock }) };
  };
  const first = open();
  try {
    const concurrent = await Promise.allSettled([first.assistant.run(payload, person), first.assistant.run(payload, person)]);
    assert.deepEqual(concurrent.map(item => item.status), ['fulfilled', 'rejected']);
    assert.equal(concurrent[1].reason.status, 429);
  } finally {
    first.db.close();
  }
  const restarted = open();
  try {
    await assert.rejects(restarted.assistant.run(payload, person), codeIs('ASSISTANT_LIMIT'));
    await restarted.assistant.run(payload, { ...person, identity: 'second identity' });
    await assert.rejects(restarted.assistant.run(payload, { ...person, identity: 'third identity' }), codeIs('ASSISTANT_LIMIT'));
    await restarted.assistant.run(payload, { identity: 'third identity', secondaryIdentity: 'second address' });
    await assert.rejects(restarted.assistant.run(payload, { identity: 'fourth identity' }), codeIs('ASSISTANT_LIMIT'));
    assert.equal(requests, 3);
    assert.equal(restarted.assistant.usage().days[0].requests, 3);
  } finally {
    restarted.db.close();
  }
});

test('fallback attempts cannot exceed the global unit budget and redirects stay disabled', async t => {
  let attempts = 0;
  const { assistant } = fixture(t, assistantConfiguration({
    ...primary, ASSISTANT_FALLBACK_MODEL: 'secondary-model', ASSISTANT_GLOBAL_DAILY_UNITS: '6500'
  }), async () => {
    attempts++;
    return Response.redirect('https://redirect.invalid/');
  });
  await assert.rejects(assistant.run(payload, person), codeIs('ASSISTANT_LIMIT'));
  assert.equal(attempts, 1);
  assert.equal(assistant.usage().days[0].attempts, 1);
  const disabled = fixture(t, assistantConfiguration({}), async () => assert.fail('unconfigured provider called')).assistant;
  assert.equal(disabled.available, false);
  await assert.rejects(disabled.run(payload, person), codeIs('ASSISTANT_UNAVAILABLE'));
});
