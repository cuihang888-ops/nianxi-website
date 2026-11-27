'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { once } = require('node:events');
const { createServer } = require('../server');
const { initializeAdmins } = require('../lib/auth');
const { atomicWrite, deriveAvatar } = require('../lib/storage');

const OWNER = 'Avatar-test-owner-2026!';
const pngBytes = Buffer.concat([fs.readFileSync(path.join(__dirname, 'avatar-test.png')), Buffer.alloc(65536, 0x3a)]);
const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x11, 0x22, 0xff, 0xd9]);
const webpBytes = Buffer.from('RIFF\x04\x00\x00\x00WEBPtest', 'binary');
const dataImage = (type, bytes) => `data:${type};base64,${bytes.toString('base64')}`;
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

async function fixture(t) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'room-avatar-performance-'));
  const sellerFile = path.join(dataDir, 'sellers.json'), legacyFile = path.join(dataDir, 'bookings.json');
  const state = { version: 1, talents: [
    { id: 'person-png', name: '卖手甲', number: '0001', active: true, avatar: dataImage('image/png', pngBytes), introduction: '原有简介\n下一行', extra: 'preserved' },
    { id: 'person-jpeg', name: '卖手乙', number: '0002', active: true, avatar: dataImage('image/jpeg', jpegBytes), introduction: '' },
    { id: 'person-webp', name: '卖手丙', number: '0003', active: false, avatar: dataImage('image/webp', webpBytes), introduction: '' },
    { id: 'person-empty', name: '无图卖手', number: '0004', active: true, avatar: '' },
    { id: 'person-legacy', name: '旧记录', number: '0005', active: true, avatar: 'https://invalid.example/avatar.jpg' }
  ], schedules: [] };
  atomicWrite(sellerFile, state);
  atomicWrite(legacyFile, { version: 2, bookings: [] });
  initializeAdmins(dataDir, { ownerPassword: OWNER, staffPassword: 'Avatar-test-staff-2026!' });
  const protectedFiles = [sellerFile, legacyFile, path.join(dataDir, 'admins.json')];
  const protectedBytes = protectedFiles.map(filename => fs.readFileSync(filename));
  const server = createServer({ dataDir, legacyFile });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    const closed = new Promise(resolve => server.close(resolve));
    server.closeAllConnections?.(); await closed;
    const resolved = fs.realpathSync(dataDir);
    assert.equal(path.dirname(resolved), fs.realpathSync(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith('room-avatar-performance-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  async function get(route, headers = {}) {
    const response = await fetch(base + route, { headers });
    const bytes = Buffer.from(await response.arrayBuffer());
    let json; try { json = JSON.parse(bytes.toString('utf8')); } catch (_) {}
    return { status: response.status, headers: response.headers, bytes, json };
  }
  async function patch(body) {
    const login = await fetch(base + '/api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: OWNER })
    });
    assert.equal(login.status, 200);
    const session = await login.json();
    return fetch(base + '/api/talents/person-png', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: login.headers.get('set-cookie').split(';')[0], 'X-CSRF-Token': session.csrfToken },
      body: JSON.stringify(body)
    });
  }
  function assertBusinessFilesUnchanged() {
    protectedFiles.forEach((filename, index) => assert.deepEqual(fs.readFileSync(filename), protectedBytes[index]));
  }
  return { dataDir, sellerFile, state, get, patch, assertBusinessFilesUnchanged };
}

test('轻量卖手接口保留原字段、替换头像地址，旧接口仍返回原始数据且不缓存', async t => {
  const app = await fixture(t);
  const full = await app.get('/api/talents', { 'If-None-Match': '*' });
  assert.equal(full.status, 200);
  assert.equal(full.headers.get('cache-control'), 'no-store');
  assert.equal(full.headers.get('etag'), null);
  assert.equal(full.json.talents[0].avatar, app.state.talents[0].avatar);
  const summary = await app.get('/api/talents?view=summary');
  assert.equal(summary.status, 200);
  assert.equal(summary.headers.get('cache-control'), 'private, no-cache');
  assert.match(summary.headers.get('etag'), /^"talents-[a-f0-9]{64}"$/);
  assert.ok(summary.bytes.length < full.bytes.length / 10, 'summary must avoid transferring base64 portraits');
  summary.json.talents.forEach((person, index) => {
    const { avatar: original, ...fields } = full.json.talents[index];
    const { avatar: url, ...summaryFields } = person;
    assert.deepEqual(summaryFields, fields);
    if (index < 3) assert.match(url, /^\/api\/talents\/person-[a-z]+\/avatar\?v=[a-f0-9]{64}$/);
    else assert.equal(url, '');
  });
  assert.equal(summary.headers.get('x-frame-options'), 'DENY');
  assert.equal(summary.headers.get('x-content-type-options'), 'nosniff');
  assert.ok(summary.headers.get('content-security-policy').includes("frame-ancestors 'none'"));
  app.assertBusinessFilesUnchanged();
});

test('头像以原文件字节、正确MIME及内容hash返回，支持私有缓存和条件GET', async t => {
  const app = await fixture(t);
  const summary = await app.get('/api/talents?view=summary');
  for (const [index, [mime, bytes]] of [
    ['image/png', pngBytes], ['image/jpeg', jpegBytes], ['image/webp', webpBytes]
  ].entries()) {
    const url = summary.json.talents[index].avatar;
    assert.equal(new URL(url, 'http://local').searchParams.get('v'), hash(bytes));
    const response = await app.get(url);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), mime);
    assert.equal(response.headers.get('cache-control'), 'private, max-age=86400, immutable');
    assert.equal(response.headers.get('etag'), `"${hash(bytes)}"`);
    assert.deepEqual(response.bytes, bytes, 'original bytes must not be recompressed or re-encoded');
    for (const condition of [response.headers.get('etag'), `W/${response.headers.get('etag')}`, `"other", ${response.headers.get('etag')}`, '*']) {
      const unchanged = await app.get(url, { 'If-None-Match': condition });
      assert.equal(unchanged.status, 304);
      assert.equal(unchanged.bytes.length, 0);
      assert.equal(unchanged.headers.get('etag'), response.headers.get('etag'));
      assert.equal(unchanged.headers.get('cache-control'), response.headers.get('cache-control'));
    }
    const changed = await app.get(url, { 'If-None-Match': '"different"' });
    assert.equal(changed.status, 200);
    assert.deepEqual(changed.bytes, bytes);
  }
  const unchangedSummary = await app.get('/api/talents?view=summary', { 'If-None-Match': `W/${summary.headers.get('etag')}` });
  assert.equal(unchangedSummary.status, 304);
  assert.equal(unchangedSummary.bytes.length, 0);
  assert.equal(unchangedSummary.headers.get('cache-control'), 'private, no-cache');
  app.assertBusinessFilesUnchanged();
});

test('无头像、旧hash、重复版本和恶意路径都不返回图片、不缓存也不泄露文件路径', async t => {
  const app = await fixture(t);
  for (const route of [
    `/api/talents/person-png/avatar?v=${'0'.repeat(64)}`,
    '/api/talents/person-png/avatar',
    `/api/talents/person-png/avatar?v=${hash(pngBytes)}&v=${hash(pngBytes)}`,
    `/api/talents/person-empty/avatar?v=${hash(pngBytes)}`,
    `/api/talents/person-legacy/avatar?v=${hash(pngBytes)}`,
    `/api/talents/not-present/avatar?v=${hash(pngBytes)}`,
    `/api/talents/%2e%2e%2fadmins.json/avatar?v=${hash(pngBytes)}`,
    `/api/talents/%00/avatar?v=${hash(pngBytes)}`,
    `/api/talents/..%5cadmins/avatar?v=${hash(pngBytes)}`
  ]) {
    const response = await app.get(route, { 'If-None-Match': '*' });
    assert.equal(response.status, 404, route);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('etag'), null);
    assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
    assert.ok(!response.bytes.toString('utf8').includes(app.dataDir));
    assert.ok(!response.bytes.toString('utf8').includes('"hash"'));
  }
  app.assertBusinessFilesUnchanged();
});

test('管理员更新姓名和头像后summary立刻变化，并发旧hash请求不能取得新图或304', async t => {
  const app = await fixture(t);
  const original = await app.get('/api/talents?view=summary');
  const oldUrl = original.json.talents[0].avatar;
  await app.get(oldUrl);
  const newBytes = Buffer.concat([pngBytes, Buffer.from('replacement-original-bytes')]);
  const update = await app.patch({ name: '更新后的卖手', avatar: dataImage('image/png', newBytes) });
  assert.equal(update.status, 200);
  const updated = await app.get('/api/talents?view=summary', { 'If-None-Match': original.headers.get('etag') });
  assert.equal(updated.status, 200);
  assert.notEqual(updated.headers.get('etag'), original.headers.get('etag'));
  assert.equal(updated.json.talents[0].name, '更新后的卖手');
  const newUrl = updated.json.talents[0].avatar;
  assert.notEqual(newUrl, oldUrl);
  const concurrent = await Promise.all(Array.from({ length: 12 }, (_, index) =>
    app.get(index % 2 ? newUrl : oldUrl, index % 2 ? {} : { 'If-None-Match': `"${hash(pngBytes)}"` })));
  concurrent.forEach((result, index) => {
    if (index % 2) {
      assert.equal(result.status, 200);
      assert.deepEqual(result.bytes, newBytes);
    } else {
      assert.equal(result.status, 404);
      assert.equal(result.headers.get('cache-control'), 'no-store');
      assert.equal(result.headers.get('etag'), null);
    }
  });
  const full = await app.get('/api/talents');
  assert.equal(full.json.talents[0].avatar, dataImage('image/png', newBytes));
  assert.deepEqual(JSON.parse(fs.readFileSync(app.sellerFile, 'utf8')).talents[0].avatar, dataImage('image/png', newBytes));
});

test('读缓存避免每张头像重新解析整库，外部原子替换也立即使缓存失效', async t => {
  const app = await fixture(t);
  const originalReadFile = fs.readFileSync;
  let sellerReads = 0;
  fs.readFileSync = function countedRead(filename, ...arguments_) {
    if (String(filename) === app.sellerFile) sellerReads++;
    return originalReadFile.call(this, filename, ...arguments_);
  };
  try {
    const first = await app.get('/api/talents?view=summary');
    const avatars = first.json.talents.map(person => person.avatar).filter(Boolean);
    await Promise.all(Array.from({ length: 4 }, () => avatars).flat().map(url => app.get(url)));
    await app.get('/api/talents?view=summary', { 'If-None-Match': first.headers.get('etag') });
    assert.equal(sellerReads, 1, 'summary and image requests should share one validated snapshot');
    app.state.talents[0].name = '外部更新名称';
    atomicWrite(app.sellerFile, app.state);
    const next = await app.get('/api/talents?view=summary', { 'If-None-Match': first.headers.get('etag') });
    assert.equal(next.status, 200);
    assert.equal(next.json.talents[0].name, '外部更新名称');
    assert.equal(sellerReads, 2);
  } finally { fs.readFileSync = originalReadFile; }
});

test('磁盘资料损坏后绝不回落到旧snapshot或错误返回304，恢复文件后可以重新读取', async t => {
  const app = await fixture(t);
  const first = await app.get('/api/talents?view=summary');
  const oldUrl = first.json.talents[0].avatar;
  await app.get(oldUrl);
  fs.writeFileSync(app.sellerFile, '{"version":1,"talents":');
  const brokenSummary = await app.get('/api/talents?view=summary', { 'If-None-Match': first.headers.get('etag') });
  assert.equal(brokenSummary.status, 500);
  assert.equal(brokenSummary.headers.get('cache-control'), 'no-store');
  const brokenImage = await app.get(oldUrl, { 'If-None-Match': `"${hash(pngBytes)}"` });
  assert.equal(brokenImage.status, 500);
  assert.equal(brokenImage.headers.get('cache-control'), 'no-store');
  atomicWrite(app.sellerFile, app.state);
  const restored = await app.get('/api/talents?view=summary');
  assert.equal(restored.status, 200);
  assert.equal(restored.headers.get('etag'), first.headers.get('etag'));
  assert.equal((await app.get(oldUrl)).status, 200);
});

test('头像派生复用相同字符串的字节和hash，不改变原数据', () => {
  const original = dataImage('image/png', pngBytes);
  const derived = deriveAvatar(original);
  assert.ok(derived);
  assert.equal(deriveAvatar(original.slice(0)), derived, 'repeat requests should reuse decoded bytes and digest');
  assert.deepEqual(derived.bytes, pngBytes);
  assert.equal(derived.hash, hash(pngBytes));
  assert.equal(deriveAvatar(''), null);
  assert.equal(deriveAvatar('https://invalid.example/photo.jpg'), null);
  assert.equal(deriveAvatar('data:image/svg+xml;base64,PHN2Zz4='), null);
  assert.equal(original, dataImage('image/png', pngBytes));
});
