'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { createServer } = require('../server');
const { initializeAdmins } = require('../lib/auth');

const NOW = new Date('2026-10-13T04:00:00.000Z');
const OWNER_PASSWORD = 'Owner-test-only-7X!';
const STAFF_PASSWORD = 'Staff-test-only-8Y!';
const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=';

async function fixture(t, options = {}) {
  // Every test uses its own directory. The project's bookings.json is never opened.
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'room-booking-test-'));
  const legacyFile = path.join(dataDir, 'bookings.json');
  fs.writeFileSync(legacyFile, options.legacy ?? '{}', 'utf8');
  initializeAdmins(dataDir, { ownerPassword: OWNER_PASSWORD, staffPassword: STAFF_PASSWORD });
  let server;
  t.after(async () => {
    if (server?.listening) {
      const closed = new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      server.closeAllConnections?.();
      await closed;
    }
    const resolved = path.resolve(dataDir);
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith('room-booking-test-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  server = createServer({ dataDir, legacyFile, now: () => new Date(NOW) });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  let base = `http://127.0.0.1:${server.address().port}`;
  async function restart() {
    const closed = new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    server.closeAllConnections?.();
    await closed;
    server = createServer({ dataDir, legacyFile, now: () => new Date(NOW) });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    base = `http://127.0.0.1:${server.address().port}`;
  }
  async function request(method, pathname, body, session, extraHeaders = {}) {
    const headers = { ...extraHeaders };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (session?.cookie) headers.Cookie = session.cookie;
    if (session?.csrfToken) headers['X-CSRF-Token'] = session.csrfToken;
    const response = await fetch(base + pathname, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual'
    });
    const text = await response.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { text }; }
    return { status: response.status, json, headers: response.headers };
  }
  async function login(username = 'owner', password = OWNER_PASSWORD) {
    const result = await request('POST', '/api/login', { username, password });
    assert.equal(result.status, 200, JSON.stringify(result.json));
    const cookie = result.headers.get('set-cookie')?.split(';')[0];
    assert.ok(cookie, 'Login issues a session cookie');
    const me = await request('GET', '/api/me', undefined, { cookie });
    assert.equal(me.status, 200);
    const csrfToken = result.json.csrfToken || me.json.csrfToken;
    assert.ok(csrfToken, 'Authenticated session includes a CSRF token');
    return { cookie, csrfToken };
  }
  async function talent(session, number = '0001', name = '测试卖手') {
    const result = await request('POST', '/api/talents', { number, name, avatar: PIXEL }, session);
    assert.equal(result.status, 201, JSON.stringify(result.json));
    assert.ok(result.json.talent?.id);
    return result.json.talent;
  }
  async function schedules(from = '2026-10-13', to = '2026-11-30') {
    const result = await request('GET', `/api/schedules?from=${from}&to=${to}`);
    assert.equal(result.status, 200, JSON.stringify(result.json));
    assert.ok(Array.isArray(result.json.schedules));
    return result.json.schedules;
  }
  return { dataDir, legacyFile, request, login, talent, schedules, restart };
}

function assignment(talentId, overrides = {}) {
  return {
    talentId, startDate: '2026-10-20', days: 3,
    business: 'FB', department: 'd2', group: '一组', slot: 'morning',
    ...overrides
  };
}

test('卖手剧情独立保存、最新优先、编辑保留历史且重启后可读取', async t => {
  const app = await fixture(t), owner = await app.login(), staff = await app.login('staff', STAFF_PASSWORD);
  const person = await app.talent(owner), other = await app.talent(owner, '0002');
  const route = `/api/talents/${person.id}/stories`, file = path.join(app.dataDir, 'talent-stories.json');
  const sellerBytes = fs.readFileSync(path.join(app.dataDir, 'sellers.json'));
  assert.deepEqual((await app.request('GET', route)).json, { stories: [] });
  assert.equal(fs.existsSync(file), false, 'Empty reads must not create a production data file');
  const older = await app.request('POST', route, { title: '之前剧情', date: '2026-10-12', content: '第一段\r\n第二段' }, owner);
  const newer = await app.request('POST', route, { title: '最新剧情', date: '2026-10-18', content: '<script>示例纯文本</script>\n新剧情' }, staff);
  assert.equal(older.status, 201);assert.equal(newer.status, 201);
  assert.deepEqual((await app.request('GET', route)).json.stories.map(s => s.id), [newer.json.story.id, older.json.story.id]);
  assert.equal(older.json.story.content, '第一段\n第二段');
  assert.deepEqual((await app.request('GET', `/api/talents/${other.id}/stories`)).json.stories, []);
  const updated = await app.request('PATCH', `${route}/${older.json.story.id}`, { title: '修正旧剧情', date: '2026-10-12', content: '已修正', revision: 1 }, staff);
  assert.equal(updated.status, 200);assert.equal(updated.json.story.revision, 2);
  assert.equal((await app.request('PATCH', `${route}/${older.json.story.id}`, { title: '覆盖', date: '2026-10-19', content: '过期修改', revision: 1 }, owner)).status, 409);
  const before = fs.readFileSync(file);
  assert.equal((await app.request('PATCH', `/api/talents/${other.id}/stories/${older.json.story.id}`, { title: '串卖手', date: '2026-10-19', content: '不允许', revision: 2 }, owner)).status, 404);
  assert.deepEqual(fs.readFileSync(file), before);
  await app.restart();
  assert.deepEqual((await app.request('GET', route)).json.stories.map(s => s.title), ['最新剧情', '修正旧剧情']);
  assert.deepEqual(fs.readFileSync(file), before);
  assert.deepEqual(fs.readFileSync(path.join(app.dataDir, 'sellers.json')), sellerBytes);
});

test('公开可看剧情但只有管理员加CSRF可写；校验失败不改动原文件', async t => {
  const app = await fixture(t), owner = await app.login(), person = await app.talent(owner);
  const route = `/api/talents/${person.id}/stories`, body = { title: '剧情', date: '2026-10-18', content: '剧情正文' };
  assert.equal((await app.request('POST', route, body)).status, 401);
  assert.equal((await app.request('POST', route, body, { cookie: owner.cookie })).status, 403);
  assert.equal((await app.request('POST', route, body, owner, { Origin: 'https://other.example' })).status, 403);
  const story = (await app.request('POST', route, body, owner)).json.story;
  const file = path.join(app.dataDir, 'talent-stories.json'), before = fs.readFileSync(file);
  for (const bad of [{ title: '' }, { title: '字'.repeat(81) }, { date: '2026-02-30' }, { content: '' }, { content: '字'.repeat(12001) }, { content: '坏\u0000字符' }, { content: {} }]) {
    assert.equal((await app.request('POST', route, { ...body, ...bad }, owner)).status, 400);
    assert.deepEqual(fs.readFileSync(file), before);
  }
  assert.equal((await app.request('PATCH', `${route}/${story.id}`, { ...body, revision: 1 })).status, 401);
  assert.equal((await app.request('POST', '/api/view-events', { kind: 'talent-stories', id: person.id })).status, 200);
  const logs = await app.request('GET', '/api/audit?category=view&day=2026-10-13', undefined, owner);
  assert.ok(logs.json.entries.some(e => e.action === '查看卖手剧情' && e.detail.includes(person.number)));
});

test('剧情文件损坏时拒绝读取和写入并保留原文件', async t => {
  const app = await fixture(t), owner = await app.login(), person = await app.talent(owner);
  const file = path.join(app.dataDir, 'talent-stories.json'), route = `/api/talents/${person.id}/stories`;
  for (const invalid of ['{broken', '{"version":1,"stories":[{}]}']) {
    fs.writeFileSync(file, invalid);
    assert.equal((await app.request('GET', route)).status, 500);
    assert.equal((await app.request('POST', route, { title: '新剧情', date: '2026-10-18', content: '正文' }, owner)).status, 500);
    assert.equal(fs.readFileSync(file, 'utf8'), invalid);
  }
});

test('访客能查看排班，但身份选择不赋予人才或排班写入权限', async t => {
  const app = await fixture(t);
  for (const pathname of ['/api/config', '/api/talents', '/api/schedules?from=2026-10-13&to=2026-10-31']) {
    assert.equal((await app.request('GET', pathname)).status, 200);
  }
  for (const [method, pathname, body] of [
    ['POST', '/api/talents', { number: '0001', name: '未授权写入', avatar: PIXEL }],
    ['PATCH', '/api/talents/fake-id', { name: '未授权修改' }],
    ['POST', '/api/schedules', assignment('fake-id')],
    ['PATCH', '/api/schedules/fake-id', { talentId: 'other' }],
    ['DELETE', '/api/schedules/fake-id', undefined]
  ]) {
    const result = await app.request(method, pathname, body, undefined, { 'X-Role': 'admin' });
    assert.equal(result.status, 401, `${method} ${pathname}: ${JSON.stringify(result.json)}`);
  }
});

test('统一早中晚班次时间，晚场明确跨至次日且沿用原排班日期和时段ID', async t => {
  const app = await fixture(t);
  const config = await app.request('GET', '/api/config');
  assert.deepEqual(config.json.slots, [
    { id: 'morning', name: '早场', start: '08:00', end: '13:30' },
    { id: 'afternoon', name: '中场', start: '14:00', end: '19:30' },
    { id: 'evening', name: '晚场', start: '20:00', end: '01:30', endDayOffset: 1 }
  ]);
  const owner = await app.login(), person = await app.talent(owner);
  const evening = await app.request('POST', '/api/schedules', assignment(person.id, { days: 1, slot: 'evening' }), owner);
  const nextMorning = await app.request('POST', '/api/schedules', assignment(person.id, { startDate: '2026-10-21', days: 1 }), owner);
  assert.equal(evening.status, 201);
  assert.equal(nextMorning.status, 201);
  assert.equal(evening.json.schedules[0].date, '2026-10-20');
  assert.equal(evening.json.schedules[0].slot, 'evening');
});

test('两个管理员账号可登录，错误密码被拒绝，登录 cookie 不能代替 CSRF 校验', async t => {
  const app = await fixture(t);
  assert.equal((await app.request('POST', '/api/login', { username: 'owner', password: 'wrong-password' })).status, 401);
  assert.equal((await app.request('POST', '/api/login', { username: 'intruder', password: OWNER_PASSWORD })).status, 401);
  const owner = await app.login();
  const staff = await app.login('staff', STAFF_PASSWORD);
  assert.notEqual(owner.cookie, staff.cookie);
  const storedAdmins = fs.readFileSync(path.join(app.dataDir, 'admins.json'), 'utf8');
  assert.equal(JSON.parse(storedAdmins).admins.length, 2);
  assert.ok(!storedAdmins.includes(OWNER_PASSWORD) && !storedAdmins.includes(STAFF_PASSWORD));
  assert.throws(() => initializeAdmins(app.dataDir, { ownerPassword: 'replacement-password', staffPassword: 'replacement-staff' }));
  assert.equal(fs.readFileSync(path.join(app.dataDir, 'admins.json'), 'utf8'), storedAdmins);
  const body = { number: '0001', name: '测试卖手', avatar: PIXEL };
  assert.equal((await app.request('POST', '/api/talents', body, { cookie: owner.cookie })).status, 403);
  assert.equal((await app.request('POST', '/api/talents', body, { ...owner, csrfToken: 'incorrect' })).status, 403);
  assert.equal((await app.request('POST', '/api/talents', body, { ...owner, csrfToken: 'é'.repeat(43) })).status, 403);
  await app.talent(owner, '0001');
  await app.talent(staff, '0002');
  const visible = await app.request('GET', '/api/talents');
  assert.equal(visible.json.talents.length, 2);
  assert.equal((await app.request('POST', '/api/logout', {}, { cookie: owner.cookie })).status, 403);
  assert.equal((await app.request('POST', '/api/logout', {}, owner)).status, 200);
  assert.equal((await app.request('POST', '/api/talents', { ...body, number: '0003' }, owner)).status, 401);
});

test('仅输入密码能登录对应管理员，错误继续限流，原凭据和写入权限不变', async t => {
  const app = await fixture(t);
  const adminFile = path.join(app.dataDir, 'admins.json');
  const before = fs.readFileSync(adminFile);
  const body = { number: '0001', name: '密码登录测试', avatar: PIXEL };
  assert.equal((await app.request('POST', '/api/talents', body)).status, 401);
  const sessions = [];
  for (const [password, username, displayName] of [
    [OWNER_PASSWORD, 'owner', '负责人'],
    [STAFF_PASSWORD, 'staff', '排班工作人员']
  ]) {
    const result = await app.request('POST', '/api/login', { password });
    assert.equal(result.status, 200, JSON.stringify(result.json));
    assert.deepEqual(result.json.user, { username, displayName });
    const cookie = result.headers.get('set-cookie')?.split(';')[0];
    assert.ok(cookie);
    assert.ok(result.json.csrfToken);
    const me = await app.request('GET', '/api/me', undefined, { cookie });
    assert.deepEqual(me.json.user, { username, displayName });
    assert.equal(me.json.csrfToken, result.json.csrfToken);
    assert.equal((await app.request('POST', '/api/talents', body, { cookie })).status, 403);
    sessions.push({ cookie, csrfToken: result.json.csrfToken });
  }
  assert.notEqual(sessions[0].cookie, sessions[1].cookie);
  await app.talent(sessions[0], '0001');
  await app.talent(sessions[1], '0002');
  for (let i = 0; i < 8; i++) {
    const result = await app.request('POST', '/api/login', { password: 'wrong-password' });
    assert.equal(result.status, 401);
    assert.equal(result.json.message, '密码错误');
  }
  assert.equal((await app.request('POST', '/api/login', { password: OWNER_PASSWORD })).status, 429);
  assert.deepEqual(fs.readFileSync(adminFile), before, 'Password-only login never rewrites admin credentials');
});

test('卖手简介可选，支持多行与制表符，访客可读取且重启后保留', async t => {
  const app = await fixture(t);
  const owner = await app.login();
  const withoutBio = await app.talent(owner, '0001');
  assert.equal(withoutBio.introduction, '');
  const introduction = '擅长女装直播\n经验：\t三年\n原文：<b>保留为纯文本</b>';
  const created = await app.request('POST', '/api/talents', {
    number: '0002', name: '简介测试', avatar: PIXEL,
    introduction: ` \r\n${introduction.replace(/\n/g, '\r\n')}\r\n `
  }, owner);
  assert.equal(created.status, 201, JSON.stringify(created.json));
  assert.equal(created.json.talent.introduction, introduction);
  const visible = await app.request('GET', '/api/talents');
  assert.equal(visible.status, 200);
  assert.equal(visible.json.talents.find(item => item.id === created.json.talent.id).introduction, introduction);
  const filename = path.join(app.dataDir, 'sellers.json');
  const saved = fs.readFileSync(filename);
  assert.equal(JSON.parse(saved).talents.find(item => item.id === created.json.talent.id).introduction, introduction);
  await app.restart();
  const reloaded = await app.request('GET', '/api/talents');
  assert.equal(reloaded.status, 200);
  assert.deepEqual(reloaded.json.talents, visible.json.talents);
  assert.deepEqual(fs.readFileSync(filename), saved, 'Reading a bio does not write the data file');
});

test('简介支持独立修改、2000字边界、未传保留与空串清空', async t => {
  const app = await fixture(t);
  const owner = await app.login();
  const staff = await app.login('staff', STAFF_PASSWORD);
  const created = await app.request('POST', '/api/talents', {
    number: '0001', name: '卖手', avatar: PIXEL, introduction: '简'.repeat(2000)
  }, owner);
  assert.equal(created.status, 201, JSON.stringify(created.json));
  assert.equal(created.json.talent.introduction.length, 2000);
  const route = `/api/talents/${created.json.talent.id}`;
  const renamed = await app.request('PATCH', route, { name: '新名字' }, owner);
  assert.equal(renamed.status, 200, JSON.stringify(renamed.json));
  assert.equal(renamed.json.talent.introduction, '简'.repeat(2000));
  const updated = await app.request('PATCH', route, { introduction: `首\r\n${'文'.repeat(1998)}` }, staff);
  assert.equal(updated.status, 200, JSON.stringify(updated.json));
  assert.equal(updated.json.talent.introduction, `首\n${'文'.repeat(1998)}`);
  assert.equal(updated.json.talent.introduction.length, 2000);
  assert.equal(updated.json.talent.name, '新名字');
  await app.restart();
  const visible = await app.request('GET', '/api/talents');
  assert.equal(visible.json.talents[0].introduction, updated.json.talent.introduction);
  const freshOwner = await app.login();
  const cleared = await app.request('PATCH', route, { introduction: '' }, freshOwner);
  assert.equal(cleared.status, 200, JSON.stringify(cleared.json));
  assert.equal(cleared.json.talent.introduction, '');
  assert.equal(JSON.parse(fs.readFileSync(path.join(app.dataDir, 'sellers.json'), 'utf8')).talents[0].introduction, '');
});

test('无效简介的创建和编辑均拒绝，已有文件和其他字段保持原样', async t => {
  const app = await fixture(t);
  const owner = await app.login();
  const created = await app.request('POST', '/api/talents', {
    number: '0001', name: '原名字', introduction: '原简介'
  }, owner);
  assert.equal(created.status, 201);
  const filename = path.join(app.dataDir, 'sellers.json');
  const before = fs.readFileSync(filename);
  const invalidControls = Array.from({ length: 32 }, (_, code) => code)
    .filter(code => ![9, 10].includes(code))
    .concat([127, 128, 159])
    .map(code => `前${String.fromCharCode(code)}后`);
  for (const introduction of [null, 3, false, {}, [], ['简介'], '字'.repeat(2001), ...invalidControls]) {
    const post = await app.request('POST', '/api/talents', { number: '0002', name: '不应添加', introduction }, owner);
    assert.equal(post.status, 400, JSON.stringify({ introduction, result: post.json }));
    assert.deepEqual(fs.readFileSync(filename), before);
    const patch = await app.request('PATCH', `/api/talents/${created.json.talent.id}`, { name: '不应修改', introduction }, owner);
    assert.equal(patch.status, 400, JSON.stringify({ introduction, result: patch.json }));
    assert.deepEqual(fs.readFileSync(filename), before);
  }
});

test('旧卖手缺少简介时公开读取返回空串，重启和查询不改变原文件字节', async t => {
  const app = await fixture(t);
  const filename = path.join(app.dataDir, 'sellers.json');
  const original = '\uFEFF' + JSON.stringify({
    version: 1,
    talents: [
      { id: 'legacy-person', number: '0001', name: '旧卖手', avatar: '', active: true, legacyNote: '保留原字段' },
      { id: 'existing-bio', number: '0002', name: '已有简介', avatar: '', active: true, introduction: ' 第一行\r\n第二行\t信息 ' }
    ],
    schedules: [{
      id: 'legacy-assignment', date: '2026-10-20', business: 'FB', department: 'd2', group: '一组',
      slot: 'morning', batchId: 'legacy-batch', talentId: 'legacy-person'
    }]
  }, null, '\t') + '\r\n';
  fs.writeFileSync(filename, original, 'utf8');
  const before = fs.readFileSync(filename);
  for (let pass = 0; pass < 2; pass++) {
    const visible = await app.request('GET', '/api/talents');
    assert.equal(visible.status, 200, JSON.stringify(visible.json));
    assert.equal(visible.json.talents[0].introduction, '');
    assert.equal(visible.json.talents[0].legacyNote, '保留原字段');
    assert.equal(visible.json.talents[1].introduction, '第一行\n第二行\t信息');
    assert.deepEqual((await app.schedules())[0].talentIds, ['legacy-person']);
    assert.deepEqual(fs.readFileSync(filename), before);
    if (pass === 0) await app.restart();
  }
});

test('已有简介字段无效时停止读写，不把损坏数据清空为默认简介', async t => {
  const app = await fixture(t);
  const owner = await app.login();
  const person = await app.talent(owner);
  const filename = path.join(app.dataDir, 'sellers.json');
  const valid = JSON.parse(fs.readFileSync(filename, 'utf8'));
  for (const introduction of [null, 12, {}, [], '字'.repeat(2001), '不可\u0000清理', '单独\r回车']) {
    const data = structuredClone(valid);
    data.talents[0].introduction = introduction;
    const broken = JSON.stringify(data, null, 3) + '\n';
    fs.writeFileSync(filename, broken, 'utf8');
    const before = fs.readFileSync(filename);
    assert.equal((await app.request('GET', '/api/talents')).status, 500);
    assert.equal((await app.request('PATCH', `/api/talents/${person.id}`, { introduction: '不能覆盖坏数据' }, owner)).status, 500);
    assert.equal((await app.request('POST', '/api/talents', { number: '0002', name: '不能新增' }, owner)).status, 500);
    assert.deepEqual(fs.readFileSync(filename), before);
  }
});

test('简介编辑仍需管理员与CSRF，未授权操作不改变人才数据', async t => {
  const app = await fixture(t);
  const owner = await app.login();
  const person = await app.talent(owner);
  const filename = path.join(app.dataDir, 'sellers.json');
  const before = fs.readFileSync(filename);
  const edits = [
    ['POST', '/api/talents', { number: '0002', name: '未经授权', introduction: '不能新增' }],
    ['PATCH', `/api/talents/${person.id}`, { introduction: '不能修改' }]
  ];
  for (const [method, route, body] of edits) {
    assert.equal((await app.request(method, route, body)).status, 401);
    assert.equal((await app.request(method, route, body, { cookie: owner.cookie })).status, 403);
    assert.equal((await app.request(method, route, body, { ...owner, csrfToken: 'incorrect' })).status, 403);
    assert.deepEqual(fs.readFileSync(filename), before);
  }
  const publicRead = await app.request('GET', '/api/talents');
  assert.equal(publicRead.status, 200);
  assert.equal(publicRead.json.talents[0].introduction, '');
});

test('默认三天排班包含开始日，跨月日期连续且永久保存', async t => {
  const app = await fixture(t);
  const owner = await app.login();
  const person = await app.talent(owner);
  const body = assignment(person.id, { startDate: '2026-10-30' });
  delete body.days;
  const result = await app.request('POST', '/api/schedules', body, owner);
  assert.equal(result.status, 201, JSON.stringify(result.json));
  assert.deepEqual(result.json.schedules.map(item => item.date).sort(), ['2026-10-30', '2026-10-31', '2026-11-01']);
  assert.equal(new Set(result.json.schedules.map(item => item.id)).size, 3);
  const saved = await app.schedules();
  assert.equal(saved.length, 3);
  assert.ok(saved.every(item => item.talentId === person.id && item.slot === 'morning'));
  const file = JSON.parse(fs.readFileSync(path.join(app.dataDir, 'sellers.json'), 'utf8'));
  assert.equal(file.schedules.length, 3);
  await app.restart();
  assert.deepEqual((await app.schedules()).map(item => item.id).sort(), saved.map(item => item.id).sort());
});

test('同一个卖手同日同场次不能跨业务或部门重复安排，另一时段允许', async t => {
  const app = await fixture(t);
  const owner = await app.login();
  const person = await app.talent(owner);
  assert.equal((await app.request('POST', '/api/schedules', assignment(person.id), owner)).status, 201);
  const collision = await app.request('POST', '/api/schedules', assignment(person.id, { business: '虾皮', department: 'd3', group: '二组' }), owner);
  assert.equal(collision.status, 409, JSON.stringify(collision.json));
  assert.equal((await app.schedules()).length, 3);
  const otherSlot = await app.request('POST', '/api/schedules', assignment(person.id, { business: '国内', department: 'd3', slot: 'evening' }), owner);
  assert.equal(otherSlot.status, 201, JSON.stringify(otherSlot.json));
  assert.equal((await app.schedules()).length, 6);
});

test('同一直播间组别同日同场不能通过换业务重复占用', async t => {
  const app = await fixture(t);
  const owner = await app.login();
  const first = await app.talent(owner, '0001');
  const second = await app.talent(owner, '0002');
  assert.equal((await app.request('POST', '/api/schedules', assignment(first.id), owner)).status, 201);
  const result = await app.request('POST', '/api/schedules', assignment(second.id, { business: '国内' }), owner);
  assert.equal(result.status, 409, JSON.stringify(result.json));
  assert.equal((await app.schedules()).length, 3);
});

test('单场支持最多三位卖手，仍按每人同日同时段检查冲突并拒绝第四位', async t => {
  const app = await fixture(t);
  const owner = await app.login();
  const first = await app.talent(owner, '0001');
  const second = await app.talent(owner, '0002');
  const third = await app.talent(owner, '0003');
  const fourth = await app.talent(owner, '0004');
  const created = await app.request('POST', '/api/schedules', {
    ...assignment(first.id),
    talentIds: [first.id, second.id]
  }, owner);
  assert.equal(created.status, 201, JSON.stringify(created.json));
  assert.deepEqual(created.json.schedules[0].talentIds, [first.id, second.id]);
  assert.equal(created.json.schedules[0].talentId, first.id, 'legacy first talentId remains available');
  assert.equal((await app.schedules()).length, 3);
  const collision = await app.request('POST', '/api/schedules', {
    ...assignment(third.id, { business: '虾皮', department: 'd3', group: '二组' }),
    talentIds: [third.id, second.id]
  }, owner);
  assert.equal(collision.status, 409, JSON.stringify(collision.json));
  const acceptedThree = await app.request('POST', '/api/schedules', {
    ...assignment(third.id, { startDate: '2026-11-01' }),
    talentIds: [first.id, second.id, third.id]
  }, owner);
  assert.equal(acceptedThree.status, 201, JSON.stringify(acceptedThree.json));
  assert.equal(acceptedThree.json.schedules[0].talentIds.length, 3);
  const thirdPersonCollision = await app.request('POST', '/api/schedules', {
    ...assignment(third.id, { startDate: '2026-11-01', department: 'd3' }),
    talentIds: [fourth.id, third.id]
  }, owner);
  assert.equal(thirdPersonCollision.status, 409, JSON.stringify(thirdPersonCollision.json));
  const duplicate = await app.request('POST', '/api/schedules', {
    ...assignment(third.id, { startDate: '2026-12-01' }),
    talentIds: [first.id, third.id, third.id]
  }, owner);
  assert.equal(duplicate.status, 400, JSON.stringify(duplicate.json));
  const tooMany = await app.request('POST', '/api/schedules', {
    ...assignment(fourth.id, { startDate: '2026-12-01' }),
    talentIds: [first.id, second.id, third.id, fourth.id]
  }, owner);
  assert.equal(tooMany.status, 400, JSON.stringify(tooMany.json));
  const updated = await app.request('PATCH', `/api/schedules/${created.json.schedules[0].id}`, {
    talentIds: [first.id, third.id]
  }, owner);
  assert.equal(updated.status, 200, JSON.stringify(updated.json));
  assert.deepEqual(updated.json.schedule.talentIds, [first.id, third.id]);
  assert.equal(updated.json.schedule.talentId, first.id);
  await app.restart();
  assert.deepEqual((await app.schedules())[0].talentIds, [first.id, third.id]);
});

test('三天中间一天冲突时整个批次拒绝，不留下首日或尾日记录', async t => {
  const app = await fixture(t);
  const owner = await app.login();
  const first = await app.talent(owner, '0001');
  const second = await app.talent(owner, '0002');
  assert.equal((await app.request('POST', '/api/schedules', assignment(first.id, { startDate: '2026-10-21', days: 1 }), owner)).status, 201);
  const before = fs.readFileSync(path.join(app.dataDir, 'sellers.json'), 'utf8');
  const result = await app.request('POST', '/api/schedules', assignment(second.id), owner);
  assert.equal(result.status, 409, JSON.stringify(result.json));
  assert.equal(fs.readFileSync(path.join(app.dataDir, 'sellers.json'), 'utf8'), before);
  assert.deepEqual((await app.schedules()).map(item => item.date), ['2026-10-21']);
});

test('两名管理员并发争抢同一批次只有一次成功，不产生重复排班', async t => {
  const app = await fixture(t);
  const owner = await app.login();
  const staff = await app.login('staff', STAFF_PASSWORD);
  const first = await app.talent(owner, '0001');
  const second = await app.talent(staff, '0002');
  const results = await Promise.all([
    app.request('POST', '/api/schedules', assignment(first.id), owner),
    app.request('POST', '/api/schedules', assignment(second.id), staff)
  ]);
  assert.deepEqual(results.map(result => result.status).sort(), [201, 409]);
  const saved = await app.schedules();
  assert.equal(saved.length, 3);
  assert.equal(new Set(saved.map(item => item.talentId)).size, 1);
});

test('单日替换与单日取消只修改选中日期，其他两天保持原排班', async t => {
  const app = await fixture(t);
  const owner = await app.login();
  const first = await app.talent(owner, '0001');
  const replacement = await app.talent(owner, '0002');
  const created = await app.request('POST', '/api/schedules', assignment(first.id), owner);
  assert.equal(created.status, 201);
  const middle = created.json.schedules.find(item => item.date === '2026-10-21');
  const update = await app.request('PATCH', `/api/schedules/${middle.id}`, { talentId: replacement.id, business: '虾皮' }, owner);
  assert.equal(update.status, 200, JSON.stringify(update.json));
  let saved = await app.schedules();
  assert.equal(saved.length, 3);
  assert.equal(saved.find(item => item.date === '2026-10-21').talentId, replacement.id);
  for (const date of ['2026-10-20', '2026-10-22']) {
    assert.equal(saved.find(item => item.date === date).talentId, first.id);
    assert.equal(saved.find(item => item.date === date).business, 'FB');
  }
  assert.equal((await app.request('DELETE', `/api/schedules/${middle.id}`, undefined, owner)).status, 200);
  saved = await app.schedules();
  assert.deepEqual(saved.map(item => item.date).sort(), ['2026-10-20', '2026-10-22']);
});

test('单日替换也检查卖手跨部门冲突，并保留原记录', async t => {
  const app = await fixture(t);
  const owner = await app.login();
  const first = await app.talent(owner, '0001');
  const second = await app.talent(owner, '0002');
  const original = await app.request('POST', '/api/schedules', assignment(first.id, { days: 1 }), owner);
  assert.equal(original.status, 201);
  assert.equal((await app.request('POST', '/api/schedules', assignment(second.id, { days: 1, department: 'd3' }), owner)).status, 201);
  const result = await app.request('PATCH', `/api/schedules/${original.json.schedules[0].id}`, { talentId: second.id }, owner);
  assert.equal(result.status, 409, JSON.stringify(result.json));
  const saved = await app.schedules();
  assert.equal(saved.find(item => item.id === original.json.schedules[0].id).talentId, first.id);
});

test('一部全部五组取消早场，中晚场可排，其他部门原班次保持不变', async t => {
  const app = await fixture(t), owner = await app.login();
  const person = await app.talent(owner);
  const config = (await app.request('GET', '/api/config')).json;
  const firstDepartment = config.departments.find(item => item.id === 'd1');
  assert.deepEqual(firstDepartment.slots, ['afternoon', 'evening']);
  assert.deepEqual(firstDepartment.retiredSlots, ['morning']);
  assert.equal(config.release.version, '1.2.4');
  const filename = path.join(app.dataDir, 'sellers.json');
  const originalBytes = fs.readFileSync(filename);
  for (const group of firstDepartment.groups) {
    const rejected = await app.request('POST', '/api/schedules', assignment(person.id, { department: 'd1', group }), owner);
    assert.equal(rejected.status, 400, JSON.stringify(rejected.json));
    assert.match(rejected.json.message, /一部已取消早场/);
    assert.deepEqual(fs.readFileSync(filename), originalBytes);
  }
  for (const [index, group] of firstDepartment.groups.entries()) {
    for (const slot of ['afternoon', 'evening']) {
      const created = await app.request('POST', '/api/schedules', assignment(person.id, {
        department: 'd1', group, slot, startDate: `2026-10-${20 + index}`, days: 1
      }), owner);
      assert.equal(created.status, 201, JSON.stringify(created.json));
    }
  }
  for (const department of ['d2', 'd3', 'd4', 'd5']) {
    const created = await app.request('POST', '/api/schedules', assignment(person.id, {
      department, startDate: `2026-11-0${Number(department.slice(1))}`, days: 1
    }), owner);
    assert.equal(created.status, 201, JSON.stringify(created.json));
  }
  assert.equal((await app.schedules()).length, 14);
});

test('管理员可开放式增加或删减组别场次，配置持久化且不删除历史排班', async t => {
  const app = await fixture(t), owner = await app.login();
  const first = await app.talent(owner, '0001'), second = await app.talent(owner, '0002'), third = await app.talent(owner, '0003');
  const file = path.join(app.dataDir, 'schedule-config.json');
  assert.equal(fs.existsSync(file), false, '只读配置不应创建场次配置文件');
  const initial = await app.request('GET', '/api/slot-config');
  assert.equal(initial.status, 200, JSON.stringify(initial.json));
  assert.deepEqual(initial.json.departments.find(item => item.id === 'd4').slots, ['morning', 'afternoon', 'evening']);
  assert.equal((await app.request('PATCH', '/api/slot-config', {
    department: 'd2', group: '一组', slots: ['morning']
  })).status, 401);
  const changed = await app.request('PATCH', '/api/slot-config', {
    department: 'd2', group: '一组', slots: ['morning']
  }, owner);
  assert.equal(changed.status, 200, JSON.stringify(changed.json));
  assert.deepEqual(changed.json.slots, ['morning']);
  assert.equal(fs.existsSync(file), true);
  const current = await app.request('GET', '/api/config');
  const d2 = current.json.departments.find(item => item.id === 'd2');
  assert.deepEqual(d2.groupSlots['一组'], ['morning']);
  assert.equal(current.json.release.version, '1.2.4');
  const rejected = await app.request('POST', '/api/schedules', assignment(first.id, {
    department: 'd2', group: '一组', slot: 'afternoon', days: 1
  }), owner);
  assert.equal(rejected.status, 400, JSON.stringify(rejected.json));
  const created = await app.request('POST', '/api/schedules', assignment(first.id, {
    department: 'd2', group: '一组', slot: 'morning', talentIds: [first.id, second.id, third.id], days: 1
  }), owner);
  assert.equal(created.status, 201, JSON.stringify(created.json));
  assert.equal(created.json.schedules[0].talentIds.length, 3);
  const beforeRestart = fs.readFileSync(file);
  await app.restart();
  assert.deepEqual(fs.readFileSync(file), beforeRestart);
  assert.deepEqual((await app.request('GET', '/api/config')).json.departments.find(item => item.id === 'd2').groupSlots['一组'], ['morning']);
  const relogin = await app.login();
  assert.equal((await app.request('POST', '/api/slot-config', {
    department: 'd2', group: '一组', slot: 'evening'
  }, relogin)).status, 200);
  const removed = await app.request('DELETE', '/api/slot-config', {
    department: 'd2', group: '一组', slot: 'morning'
  }, relogin);
  assert.equal(removed.status, 200, JSON.stringify(removed.json));
  assert.deepEqual(removed.json.slots, ['evening']);
  assert.deepEqual((await app.schedules()).map(item => item.id), [created.json.schedules[0].id]);
  assert.equal((await app.request('POST', '/api/schedules', assignment(second.id, {
    department: 'd2', group: '一组', slot: 'morning', days: 1
  }), relogin)).status, 400);
  const restored = await app.request('POST', '/api/slot-config', {
    department: 'd2', group: '一组', slot: 'evening'
  }, relogin);
  assert.equal(restored.status, 200, JSON.stringify(restored.json));
  assert.deepEqual(restored.json.slots, ['evening']);
  assert.deepEqual((await app.request('GET', '/api/slot-config')).json.departments.find(item => item.id === 'd2').groupSlots['一组'], ['evening']);
});

test('场次修改必须有管理员和CSRF，拒绝清空或无效字段且不改变任何业务文件', async t => {
  const app = await fixture(t), owner = await app.login(), staff = await app.login('staff', STAFF_PASSWORD);
  const person = await app.talent(owner);
  assert.equal((await app.request('POST', '/api/schedules', assignment(person.id), owner)).status, 201);
  const slotFile = path.join(app.dataDir, 'schedule-config.json'), sellerFile = path.join(app.dataDir, 'sellers.json');
  const sellerBefore = fs.readFileSync(sellerFile), bookingsBefore = fs.readFileSync(app.legacyFile);
  const administratorBefore = fs.readFileSync(path.join(app.dataDir, 'admins.json'));
  const target = { department: 'd2', group: '一组' };
  for (const [method, payload] of [
    ['PATCH', { ...target, slots: ['evening'] }],
    ['POST', { ...target, slot: 'evening' }],
    ['DELETE', { ...target, slot: 'morning' }]
  ]) {
    assert.equal((await app.request(method, '/api/slot-config', payload)).status, 401);
    assert.equal((await app.request(method, '/api/slot-config', payload, { cookie: owner.cookie })).status, 403);
    assert.equal((await app.request(method, '/api/slot-config', payload, { ...owner, csrfToken: 'x'.repeat(43) })).status, 403);
  }
  for (const payload of [
    { ...target, slots: [] }, { ...target, slots: ['morning', 'morning'] },
    { ...target, slots: ['midnight'] }, { ...target, slots: 'morning' },
    { ...target, slots: ['morning'], unexpected: true },
    { ...target, group: '不存在的组', slots: ['morning'] }
  ]) {
    assert.equal((await app.request('PATCH', '/api/slot-config', payload, owner)).status, 400);
    assert.equal(fs.existsSync(slotFile), false);
  }
  const changed = await app.request('PATCH', '/api/slot-config', { ...target, slots: ['evening'] }, staff);
  assert.equal(changed.status, 200, JSON.stringify(changed.json));
  const before = fs.readFileSync(slotFile);
  const rejected = await app.request('DELETE', '/api/slot-config', { ...target, slot: 'evening' }, owner);
  assert.equal(rejected.status, 400, JSON.stringify(rejected.json));
  assert.match(rejected.json.message, /至少保留一个/);
  assert.deepEqual(fs.readFileSync(slotFile), before);
  assert.deepEqual(fs.readFileSync(sellerFile), sellerBefore);
  assert.deepEqual(fs.readFileSync(app.legacyFile), bookingsBefore);
  assert.deepEqual(fs.readFileSync(path.join(app.dataDir, 'admins.json')), administratorBefore);
  assert.ok(fs.readFileSync(path.join(app.dataDir, 'security', 'audit.jsonl'), 'utf8')
    .split('\n').filter(Boolean).map(line => JSON.parse(line))
    .some(event => event.action === '维护场次' && event.actor.role === 'staff' && event.outcome === 'success'));
});

test('损坏的场次配置拒绝修改且不回落到旧缓存，已有空配置可读取后恢复', async t => {
  const app = await fixture(t), owner = await app.login();
  const file = path.join(app.dataDir, 'schedule-config.json');
  const target = { department: 'd2', group: '一组' };
  assert.equal((await app.request('PATCH', '/api/slot-config', { ...target, slots: ['evening'] }, owner)).status, 200);
  assert.equal((await app.request('GET', '/api/config')).status, 200);
  for (const damaged of [
    '{"version":1,"groups":', JSON.stringify({ version: 1, groups: { d2: { 一组: ['midnight'] } } })
  ]) {
    fs.writeFileSync(file, damaged);
    const bytes = fs.readFileSync(file);
    assert.equal((await app.request('GET', '/api/slot-config')).status, 500);
    assert.equal((await app.request('GET', '/api/config')).status, 500);
    assert.equal((await app.request('PATCH', '/api/slot-config', { ...target, slots: ['morning'] }, owner)).status, 500);
    assert.deepEqual(fs.readFileSync(file), bytes);
  }
  const oldEmpty = JSON.stringify({ version: 1, groups: { d2: { 一组: [] } } });
  fs.writeFileSync(file, oldEmpty);
  const empty = await app.request('GET', '/api/slot-config');
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.json.departments.find(item => item.id === 'd2').groupSlots['一组'], []);
  assert.equal(fs.readFileSync(file, 'utf8'), oldEmpty);
  const restored = await app.request('POST', '/api/slot-config', { ...target, slot: 'morning' }, owner);
  assert.equal(restored.status, 200);
  assert.deepEqual(restored.json.slots, ['morning']);
});

test('一部历史早场可读取搜索且不改文件，不能继续调整，管理员可取消当天以后旧安排', async t => {
  const app = await fixture(t), owner = await app.login();
  const person = await app.talent(owner);
  const filename = path.join(app.dataDir, 'sellers.json');
  const state = JSON.parse(fs.readFileSync(filename, 'utf8'));
  state.schedules = [
    { id: 'retired-past', date: '2026-10-10', business: 'FB', department: 'd1', group: '五组',
      slot: 'morning', talentId: person.id, batchId: 'retired-batch', customField: '保留原记录' },
    { id: 'retired-future', date: '2026-10-20', business: 'FB', department: 'd1', group: '一组',
      slot: 'morning', talentIds: [person.id], talentId: person.id, batchId: 'retired-batch' }
  ];
  fs.writeFileSync(filename, `${JSON.stringify(state, null, 1)}\n`);
  const originalBytes = fs.readFileSync(filename);
  for (const restart of [false, true]) {
    if (restart) await app.restart();
    assert.equal((await app.schedules('2026-10-01')).length, 2);
    const search = await app.request('GET', '/api/talent-search?q=0001');
    assert.equal(search.status, 200, JSON.stringify(search.json));
    assert.deepEqual(search.json.results[0].upcoming.map(item => item.id), ['retired-future']);
    assert.deepEqual(search.json.results[0].recent.map(item => item.id), ['retired-past']);
    assert.deepEqual(fs.readFileSync(filename), originalBytes);
  }
  const session = await app.login();
  const rejected = await app.request('PATCH', '/api/schedules/retired-future', { business: '国内' }, session);
  assert.equal(rejected.status, 400, JSON.stringify(rejected.json));
  assert.match(rejected.json.message, /一部已取消早场/);
  assert.deepEqual(fs.readFileSync(filename), originalBytes);
  assert.equal((await app.request('DELETE', '/api/schedules/retired-future')).status, 401);
  assert.deepEqual(fs.readFileSync(filename), originalBytes);
  assert.equal((await app.request('DELETE', '/api/schedules/retired-future', undefined, session)).status, 200);
  const remaining = await app.schedules('2026-10-01');
  assert.deepEqual(remaining.map(item => item.id), ['retired-past']);
  assert.equal(remaining[0].customField, '保留原记录');
});

test('历史班次兼容仍拒绝未知组别和时段，不让损坏排班被覆盖', async t => {
  const app = await fixture(t), owner = await app.login();
  const person = await app.talent(owner);
  const filename = path.join(app.dataDir, 'sellers.json');
  const state = JSON.parse(fs.readFileSync(filename, 'utf8'));
  for (const overrides of [{ group: '六组' }, { slot: 'midnight' }]) {
    state.schedules = [{
      id: 'invalid-history', date: '2026-10-20', business: 'FB', department: 'd1', group: '一组',
      slot: 'morning', talentId: person.id, batchId: 'history-batch', ...overrides
    }];
    fs.writeFileSync(filename, JSON.stringify(state));
    const originalBytes = fs.readFileSync(filename);
    assert.equal((await app.request('GET', '/api/schedules?from=2026-10-01&to=2026-10-31')).status, 500);
    assert.equal((await app.request('POST', '/api/schedules', assignment(person.id), owner)).status, 500);
    assert.deepEqual(fs.readFileSync(filename), originalBytes);
  }
});

test('四部各组中场支持连续三天、重启读取和单日调整，原早晚安排保持不变', async t => {
  const app = await fixture(t), owner = await app.login();
  const first = await app.talent(owner, '0001'), second = await app.talent(owner, '0002');
  const publicConfig = (await app.request('GET', '/api/config')).json;
  const fourthDepartment = publicConfig.departments.find(item => item.id === 'd4');
  assert.deepEqual(fourthDepartment.slots, ['morning', 'afternoon', 'evening']);
  assert.equal(fourthDepartment.groupSlots, undefined);
  assert.equal(publicConfig.release.version, '1.2.4');
  for (const [day, group, slot] of [['23', '一组', 'morning'], ['23', '二组', 'evening'], ['24', '三组', 'morning'], ['24', '四组', 'evening']]) {
    const oldShift = await app.request('POST', '/api/schedules', assignment(first.id, {
      department: 'd4', group, slot, startDate: `2026-10-${day}`, days: 1
    }), owner);
    assert.equal(oldShift.status, 201, JSON.stringify(oldShift.json));
  }
  const prior = structuredClone(await app.schedules());
  const created = await app.request('POST', '/api/schedules', assignment(first.id, {
    department: 'd4', group: '四组', slot: 'afternoon'
  }), owner);
  assert.equal(created.status, 201, JSON.stringify(created.json));
  assert.deepEqual(created.json.schedules.map(item => item.date), ['2026-10-20', '2026-10-21', '2026-10-22']);
  const beforeRestart = fs.readFileSync(path.join(app.dataDir, 'sellers.json'));
  await app.restart();
  const loaded = await app.schedules();
  assert.deepEqual(fs.readFileSync(path.join(app.dataDir, 'sellers.json')), beforeRestart);
  assert.equal(loaded.length, 7);
  const middle = created.json.schedules.find(item => item.date === '2026-10-21');
  const relogin = await app.login();
  const edited = await app.request('PATCH', `/api/schedules/${middle.id}`, { talentId: second.id, business: '国内' }, relogin);
  assert.equal(edited.status, 200, JSON.stringify(edited.json));
  const after = await app.schedules();
  assert.equal(after.find(item => item.id === middle.id).talentId, second.id);
  for (const original of [...prior, ...created.json.schedules.filter(item => item.id !== middle.id)]) {
    assert.deepEqual(after.find(item => item.id === original.id), original);
  }
});

test('四部四组中场仍拒绝直播间及卖手冲突，不写入部分批次或覆盖单日', async t => {
  const app = await fixture(t), owner = await app.login();
  const first = await app.talent(owner, '0001'), second = await app.talent(owner, '0002');
  const fourth = assignment(first.id, { department: 'd4', group: '四组', slot: 'afternoon' });
  const created = await app.request('POST', '/api/schedules', fourth, owner);
  assert.equal(created.status, 201);
  const elsewhere = await app.request('POST', '/api/schedules', assignment(second.id, { slot: 'afternoon', days: 1 }), owner);
  assert.equal(elsewhere.status, 201);
  const before = fs.readFileSync(path.join(app.dataDir, 'sellers.json'));
  for (const body of [
    { ...fourth, talentId: second.id },
    { ...fourth, department: 'd3', group: '二组' }
  ]) {
    assert.equal((await app.request('POST', '/api/schedules', body, owner)).status, 409);
    assert.deepEqual(fs.readFileSync(path.join(app.dataDir, 'sellers.json')), before);
  }
  const changed = await app.request('PATCH', `/api/schedules/${created.json.schedules[0].id}`, { talentId: second.id }, owner);
  assert.equal(changed.status, 409);
  assert.deepEqual(fs.readFileSync(path.join(app.dataDir, 'sellers.json')), before);
});

test('四部各组支持中场；非法组别、业务、日期和过去日期不能落库', async t => {
  const app = await fixture(t);
  const owner = await app.login();
  const person = await app.talent(owner);
  const valid = await app.request('POST', '/api/schedules', assignment(person.id, {
    department: 'd4', group: '一组', slot: 'afternoon', days: 1
  }), owner);
  assert.equal(valid.status, 201, JSON.stringify(valid.json));
  for (const overrides of [
    { department: 'd5', group: '二组' },
    { business: '不存在的业务' }, { startDate: '2026-02-30' },
    { startDate: '2026-10-12' }, { days: 0 }
  ]) {
    const result = await app.request('POST', '/api/schedules', assignment(person.id, overrides), owner);
    assert.equal(result.status, 400, `${JSON.stringify(overrides)}: ${JSON.stringify(result.json)}`);
  }
  assert.equal((await app.schedules()).length, 1);
});

test('编号保留前导零且唯一，编辑也不能撞号', async t => {
  const app = await fixture(t);
  const owner = await app.login();
  const first = await app.talent(owner, '0001', '张三');
  assert.equal(first.number, '0001');
  assert.equal((await app.request('POST', '/api/talents', { number: '0001', name: '李四', avatar: PIXEL }, owner)).status, 409);
  const second = await app.talent(owner, '0002');
  assert.equal((await app.request('PATCH', `/api/talents/${second.id}`, { number: '0001' }, owner)).status, 409);
  const result = await app.request('GET', '/api/talents');
  assert.deepEqual(result.json.talents.map(item => item.number).sort(), ['0001', '0002']);
});

test('停用卖手的原排班可单日改业务，但不能新排或替换其他卖手', async t => {
  const app = await fixture(t);
  const owner = await app.login();
  const paused = await app.talent(owner, '0001');
  const active = await app.talent(owner, '0002');
  const original = await app.request('POST', '/api/schedules', assignment(paused.id, { days: 1 }), owner);
  const other = await app.request('POST', '/api/schedules', assignment(active.id, { days: 1, startDate: '2026-10-21' }), owner);
  assert.equal(original.status, 201);
  assert.equal(other.status, 201);
  assert.equal((await app.request('PATCH', `/api/talents/${paused.id}`, { active: false }, owner)).status, 200);
  const changed = await app.request('PATCH', `/api/schedules/${original.json.schedules[0].id}`, { business: '国内' }, owner);
  assert.equal(changed.status, 200, JSON.stringify(changed.json));
  assert.equal(changed.json.schedule.talentId, paused.id);
  assert.equal(changed.json.schedule.business, '国内');
  assert.equal((await app.request('POST', '/api/schedules', assignment(paused.id, { days: 1, startDate: '2026-10-22' }), owner)).status, 400);
  assert.equal((await app.request('PATCH', `/api/schedules/${other.json.schedules[0].id}`, { talentId: paused.id }, owner)).status, 400);
  const saved = await app.schedules();
  assert.equal(saved.length, 2);
  assert.equal(saved.find(item => item.date === '2026-10-21').talentId, active.id);
});

test('原日期→房间→时段预约结构可读取，新增预约不会丢失原预约', async t => {
  const legacy = JSON.stringify({
    '2026-10-20': {
      '一期五号直播间': { morning: { department: '老部门', bookerName: '老预约人', updatedAt: '2026/10/12 08:00:00' } }
    }
  });
  const app = await fixture(t, { legacy });
  const owner = await app.login();
  const old = await app.request('GET', '/api/bookings?date=2026-10-20');
  assert.equal(old.status, 200, JSON.stringify(old.json));
  assert.equal(old.json.bookings.length, 1);
  assert.equal(old.json.bookings[0].department, '老部门');
  assert.equal(fs.readFileSync(app.legacyFile, 'utf8'), legacy, 'Read-only access never rewrites source data');
  const created = await app.request('POST', '/api/book', {
    date: '2026-10-20', room: '一期五号直播间', slot: 'evening',
    department: '新部门', bookerName: '新预约人', clientId: 'test-client-one'
  }, owner);
  assert.equal(created.status, 201, JSON.stringify(created.json));
  const after = await app.request('GET', '/api/bookings?date=2026-10-20');
  assert.equal(after.json.bookings.length, 2);
  assert.equal(after.json.bookings.find(item => item.slot === 'morning').bookerName, '老预约人');
  assert.ok(after.json.bookings.every(item => !Object.hasOwn(item, 'clientId')));
  const backupDir = path.join(app.dataDir, 'backups');
  const backups = fs.readdirSync(backupDir).filter(name => name.startsWith('bookings.before-migration.'));
  assert.equal(backups.length, 1);
  assert.equal(fs.readFileSync(path.join(backupDir, backups[0]), 'utf8'), legacy);
  const duplicate = await app.request('POST', '/api/book', {
    date: '2026-10-20', room: '一期五号直播间', slot: 'morning',
    department: '重复部门', bookerName: '重复预约人', clientId: 'test-client-two'
  }, owner);
  assert.equal(duplicate.status, 409);
});

test('损坏的排班数据不能被下一次写操作默默清空覆盖', async t => {
  const app = await fixture(t);
  const owner = await app.login();
  await app.talent(owner);
  const filename = path.join(app.dataDir, 'sellers.json');
  const broken = '{"version":1,"talents": [truncated';
  fs.writeFileSync(filename, broken, 'utf8');
  const result = await app.request('POST', '/api/talents', { number: '0002', name: '不应保存', avatar: PIXEL }, owner);
  assert.equal(result.status, 500, JSON.stringify(result.json));
  assert.equal(fs.readFileSync(filename, 'utf8'), broken);
});

test('损坏的房间预约文件不能被新预约覆盖', async t => {
  const app = await fixture(t);
  const owner = await app.login();
  const broken = '{"2026-10-20": broken';
  fs.writeFileSync(app.legacyFile, broken, 'utf8');
  const result = await app.request('POST', '/api/book', {
    date: '2026-10-20', room: '一期五号直播间', slot: 'morning',
    department: '测试', bookerName: '测试', clientId: 'test-client'
  }, owner);
  assert.equal(result.status, 500, JSON.stringify(result.json));
  assert.equal(fs.readFileSync(app.legacyFile, 'utf8'), broken);
});

test('合法 JSON 但未知数据结构也会拒绝覆盖', async t => {
  const app = await fixture(t);
  const owner = await app.login();
  const filename = path.join(app.dataDir, 'sellers.json');
  const unknown = JSON.stringify({ oldVersion: true, records: [{ number: '1234' }] });
  fs.writeFileSync(filename, unknown, 'utf8');
  const result = await app.request('POST', '/api/talents', { number: '0001', name: '测试', avatar: PIXEL }, owner);
  assert.equal(result.status, 500);
  assert.equal(fs.readFileSync(filename, 'utf8'), unknown);
});

test('网站静态路径不暴露管理员凭据、人才文件和旧预约原文件', async t => {
  const app = await fixture(t);
  const owner = await app.login();
  await app.talent(owner);
  for (const pathname of ['/data/admins.json', '/data/sellers.json', '/bookings.json', '/lib/auth.js', '/%2e%2e%2fdata%2fadmins.json']) {
    const result = await app.request('GET', pathname);
    assert.ok([400, 403, 404].includes(result.status), `${pathname}: ${result.status}`);
    assert.ok(!JSON.stringify(result.json).includes('"hash"'));
  }
});

test('按 ID 存储的旧预约保留 ID，取消仅管理员可操作，未知房间并入清单', async t => {
  const booking = {
    id: 'existing-booking-id', date: '2026-10-20', room: '现有自定义直播间', slot: 'morning',
    department: '原部门', bookerName: '原预约人', clientId: 'original-device', note: '原备注',
    createdAt: '2026-10-12T02:00:00.000Z'
  };
  const app = await fixture(t, { legacy: JSON.stringify({ __placeholder__: true, [booking.id]: booking }) });
  const owner = await app.login();
  const rooms = await app.request('GET', '/api/rooms');
  assert.equal(rooms.status, 200);
  assert.ok(rooms.json.rooms.includes(booking.room));
  const list = await app.request('GET', '/api/bookings?date=2026-10-20');
  assert.equal(list.json.bookings[0].id, booking.id);
  assert.equal(list.json.bookings[0].note, booking.note);
  assert.equal((await app.request('POST', '/api/cancel', { id: booking.id, clientId: 'other-device' })).status, 401);
  assert.equal((await app.request('POST', '/api/cancel', { id: booking.id, clientId: booking.clientId })).status, 401);
  assert.equal((await app.request('POST', '/api/cancel', { id: booking.id }, owner)).status, 200);
  assert.equal((await app.request('GET', '/api/bookings?date=2026-10-20')).json.bookings.length, 0);
});

test('场地管理保持历史预约和稳定ID，停用后拒绝新预约且能够恢复', async t => {
  const booking = {
    id: 'legacy-room-booking', date: '2026-10-20', room: '现有定制场地', slot: 'morning',
    department: '原部门', bookerName: '原预约人', note: '历史备注'
  };
  const legacy = JSON.stringify({ version: 2, bookings: [booking] });
  const app = await fixture(t, { legacy });
  const request = app.request;
  const route = '/api/rooms';
  const configFile = path.join(app.dataDir, 'room-directory.json');
  const initial = await request('GET', route);
  const original = initial.json.roomDirectory.find(room => room.name === booking.room);
  assert.ok(original.id);
  assert.equal(fs.existsSync(configFile), false);
  const admin = await app.login('staff', STAFF_PASSWORD);
  const endpoint = route + '/' + original.id;
  const place = (slot, roomFields) => request('POST', '/api/book', {
    date: booking.date, slot, department: '新部门', bookerName: '新预约人', clientId: 'room-test', ...roomFields
  }, admin);
  assert.equal((await request('POST', route, { name: '新建场地' })).status, 401);
  assert.equal((await request('PATCH', endpoint, { name: '改名场地' }, { cookie: admin.cookie })).status, 403);
  assert.equal((await request('POST', route, { name: '新建场地' }, admin)).status, 201);
  const renamed = await request('PATCH', endpoint, { name: '改名场地' }, admin);
  assert.equal(renamed.status, 200);
  assert.equal(renamed.json.room.id, original.id);
  assert.equal((await request('POST', route, { name: booking.room }, admin)).status, 409);
  assert.equal((await place('morning', { roomId: original.id })).status, 409);
  assert.equal((await place('morning', { room: booking.room })).status, 409);
  const stopped = await request('PATCH', endpoint, { active: false }, admin);
  assert.deepEqual(stopped.json.room, { ...original, name: '改名场地', active: false });
  assert.equal(stopped.json.rooms.includes('改名场地'), false);
  assert.equal((await place('afternoon', { roomId: original.id })).status, 400);
  const archived = await request('DELETE', endpoint, undefined, admin);
  assert.equal(archived.status, 200);
  assert.equal(archived.json.room.archived, true);
  assert.equal((await request('PATCH', endpoint, { active: true }, admin)).status, 409);
  assert.equal(fs.readFileSync(app.legacyFile, 'utf8'), legacy);
  await app.restart();
  const history = await request('GET', '/api/bookings?date=' + booking.date);
  assert.equal(history.json.bookings[0].id, booking.id);
  assert.equal(history.json.bookings[0].room, booking.room);
  assert.equal(history.json.bookings[0].roomId, original.id);
  Object.assign(admin, await app.login('staff', STAFF_PASSWORD));
  const restored = await request('POST', endpoint + '/restore', undefined, admin);
  assert.equal(restored.status, 200);
  assert.equal(restored.json.room.active, true);
  const created = await place('evening', { roomId: original.id });
  assert.equal(created.status, 201);
  assert.equal(created.json.booking.room, '改名场地');
  assert.equal(created.json.booking.roomId, original.id);
  assert.equal((await request('GET', '/api/bookings?date=' + booking.date)).json.bookings.length, 2);
  assert.equal((await request('DELETE', endpoint, undefined, admin)).status, 200);
  assert.equal((await request('POST', '/api/cancel', { id: created.json.booking.id }, admin)).status, 200);
});

test('归档卖手与直播间部门维持剧情和历史排班，恢复后重新开放排班', async t => {
  const app = await fixture(t);
  const owner = await app.login();
  const seller = await app.talent(owner, '0001', '归档测试');
  const route = '/api/talents/' + seller.id;
  const createdStory = await app.request('POST', route + '/stories', { title: '历史剧情', date: '2026-10-13', content: '排班历史仍可查看' }, owner);
  assert.equal(createdStory.status, 201);
  const createdSchedule = await app.request('POST', '/api/schedules', assignment(seller.id, { days: 1 }), owner);
  assert.equal(createdSchedule.status, 201);
  const sellerFile = path.join(app.dataDir, 'sellers.json');
  const prevSchedules = JSON.parse(fs.readFileSync(sellerFile, 'utf8')).schedules;
  assert.equal((await app.request('DELETE', route)).status, 401);
  assert.equal((await app.request('DELETE', route, undefined, { cookie: owner.cookie })).status, 403);
  const archive = await app.request('DELETE', route, undefined, owner);
  assert.equal(archive.status, 200);
  assert.equal(archive.json.talent.active, false);
  assert.equal(archive.json.talent.archived, true);
  assert.equal((await app.request('PATCH', route, { active: true }, owner)).status, 409);
  assert.equal((await app.request('POST', '/api/schedules', assignment(seller.id, { startDate: '2026-10-24' }), owner)).status, 400);
  assert.equal((await app.request('GET', route + '/stories')).json.stories[0].id, createdStory.json.story.id);
  assert.equal((await app.request('DELETE', '/api/departments/d2', undefined, owner)).status, 200);
  const restored = await app.request('POST', '/api/departments/d2/restore', undefined, owner);
  assert.equal(restored.status, 200);
  assert.equal(restored.json.department.id, 'd2');
  assert.ok(restored.json.department.groups.includes('一组'));
  assert.deepEqual(JSON.parse(fs.readFileSync(sellerFile, 'utf8')).schedules, prevSchedules);
  const reactivated = await app.request('POST', route + '/restore', undefined, owner);
  assert.equal(reactivated.status, 200);
  assert.equal(reactivated.json.talent.active, true);
  assert.equal(reactivated.json.talent.archived, false);
  assert.equal((await app.request('POST', '/api/schedules', assignment(seller.id, { startDate: '2026-10-24' }), owner)).status, 201);
});
