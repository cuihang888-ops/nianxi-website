'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { createServer } = require('../server');
const { initializeAdmins } = require('../lib/auth');
const { planTalentImport } = require('../lib/import-talents');
const { runImport } = require('../scripts/import-talents');

const NOW = new Date('2026-10-26T04:00:00.000Z');
const OWNER = 'Departments-test-owner-2026!';
const STAFF = 'Departments-test-staff-2026!';
const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=';
const ALL_SLOTS = ['morning', 'afternoon', 'evening'];
const CONFIG_FILE = 'schedule-config.json';
const BUSINESS_FILES = ['sellers.json', 'bookings.json', 'admins.json', 'talent-stories.json'];

async function fixture(t, options = {}) {
  // This suite never opens the workspace data directory or a production URL.
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'room-departments-test-'));
  const legacyFile = path.join(dataDir, 'bookings.json');
  fs.writeFileSync(legacyFile, JSON.stringify({ version: 2, bookings: [{
    id: 'preserved-room-reservation', date: '2026-10-27', room: '一期五号直播间', slot: 'afternoon',
    department: '原预约部门', bookerName: '原预约人', note: '部门维护不可改动', clientId: 'isolated-fixture'
  }] }) + '\n');
  fs.writeFileSync(path.join(dataDir, 'sellers.json'), '{"version":1,"talents":[],"schedules":[]}\n');
  fs.writeFileSync(path.join(dataDir, 'talent-stories.json'), '{"version":1,"stories":[]}\n');
  initializeAdmins(dataDir, { ownerPassword: OWNER, staffPassword: STAFF });
  if (options.scheduleConfig !== undefined) {
    fs.writeFileSync(path.join(dataDir, CONFIG_FILE),
      typeof options.scheduleConfig === 'string' ? options.scheduleConfig : JSON.stringify(options.scheduleConfig));
  }
  let server, base;
  async function stop() {
    if (!server?.listening) return;
    const closed = new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    server.closeAllConnections?.();
    await closed;
  }
  async function start() {
    server = createServer({ dataDir, legacyFile, now: () => new Date(NOW) });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    base = `http://127.0.0.1:${server.address().port}`;
  }
  t.after(async () => {
    await stop();
    const resolved = fs.realpathSync(dataDir);
    assert.equal(path.dirname(resolved), fs.realpathSync(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith('room-departments-test-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  await start();
  async function request(method, route, body, session, extraHeaders = {}, rawBody) {
    assert.ok(route.startsWith('/api/'), 'Only this isolated fixture API may be requested');
    const headers = { ...extraHeaders };
    if (body !== undefined || rawBody !== undefined) headers['Content-Type'] = 'application/json';
    if (session?.cookie) headers.Cookie = session.cookie;
    if (session?.csrfToken) headers['X-CSRF-Token'] = session.csrfToken;
    const response = await fetch(base + route, {
      method, headers, redirect: 'manual',
      body: rawBody !== undefined ? rawBody : body === undefined ? undefined : JSON.stringify(body)
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    let json;
    try { json = JSON.parse(bytes.toString('utf8')); } catch (_) {}
    return { status: response.status, headers: response.headers, bytes, json };
  }
  async function login(username = 'owner') {
    const result = await request('POST', '/api/login', {
      username, password: username === 'staff' ? STAFF : OWNER
    });
    assert.equal(result.status, 200, JSON.stringify(result.json));
    assert.ok(result.json.csrfToken);
    const cookie = result.headers.get('set-cookie')?.split(';')[0];
    assert.ok(cookie);
    return { cookie, csrfToken: result.json.csrfToken };
  }
  async function departments() {
    const result = await request('GET', '/api/departments');
    assert.equal(result.status, 200, JSON.stringify(result.json));
    assert.ok(Array.isArray(result.json.departments));
    assert.ok(Array.isArray(result.json.archivedDepartments));
    assert.ok(Array.isArray(result.json.slots));
    return result.json;
  }
  async function addDepartment(session, overrides = {}) {
    const body = { name: '六部', groups: ['特使组'], slots: ALL_SLOTS, ...overrides };
    const result = await request('POST', '/api/departments', body, session);
    assert.equal(result.status, 201, JSON.stringify(result.json));
    const listed = await departments();
    const department = listed.departments.find(item => item.name === body.name);
    assert.ok(department?.id, 'Created department appears in the active configuration');
    assert.deepEqual(department.groups, body.groups);
    return department;
  }
  async function addTalent(session, index) {
    const result = await request('POST', '/api/talents', {
      name: `动态部门卖手${index}`, number: `D${index}`, avatar: PIXEL
    }, session);
    assert.equal(result.status, 201, JSON.stringify(result.json));
    return result.json.talent;
  }
  async function addThree(session, department, overrides = {}) {
    const people = await Promise.all([1, 2, 3].map(index => addTalent(session, index)));
    const result = await request('POST', '/api/schedules', {
      department: department.id, group: department.groups[0], business: 'FB',
      startDate: '2026-10-28', days: 3, slot: 'morning',
      talentIds: people.map(person => person.id), ...overrides
    }, session);
    assert.equal(result.status, 201, JSON.stringify(result.json));
    assert.equal(result.json.schedules.length, 3);
    return { people, schedules: result.json.schedules };
  }
  async function schedules() {
    const result = await request('GET', '/api/schedules?from=2026-10-26&to=2026-11-30');
    assert.equal(result.status, 200, JSON.stringify(result.json));
    return result.json.schedules;
  }
  function snapshot(includeConfig = false) {
    return Object.fromEntries([...BUSINESS_FILES, ...(includeConfig ? [CONFIG_FILE] : [])].map(name => {
      const filename = path.join(dataDir, name);
      return [name, fs.existsSync(filename) ? fs.readFileSync(filename) : null];
    }));
  }
  function unchanged(before) {
    for (const [name, bytes] of Object.entries(before)) {
      const filename = path.join(dataDir, name);
      const current = fs.existsSync(filename) ? fs.readFileSync(filename) : null;
      assert.deepEqual(current, bytes, `${name} must remain byte-identical`);
    }
  }
  return {
    dataDir, legacyFile, request, login, departments, addDepartment, addTalent, addThree,
    schedules, snapshot, unchanged, restart: async () => { await stop(); await start(); }
  };
}

const departmentRoute = id => `/api/departments/${encodeURIComponent(id)}`;
const groupRoute = (id, group) => `${departmentRoute(id)}/groups/${encodeURIComponent(group)}`;
const groupSlots = (department, group) => department.groupSlots?.[group] || department.slots;
const scheduleIds = values => values.map(item => item.id).sort();
function importManifest() {
  return {
    version: 1,
    source: { key: 'departments-isolated-sheet', filename: '部门测试.xlsx', sheet: 'Sheet1', sha256: 'a'.repeat(64) },
    talents: [{
      sourceRow: 2, sourceSequence: 1, number: 'IMPORT999', name: '隔离导入卖手',
      avatar: PIXEL, introduction: '仅用于临时目录验证', active: true, missingName: false
    }]
  };
}
async function rejectsWithoutWriting(app, method, route, body, session, statuses = [400, 409], rawBody) {
  const before = app.snapshot(true);
  const result = await app.request(method, route, body, session, {}, rawBody);
  assert.ok(statuses.includes(result.status),
    `${method} ${route} should reject with ${statuses.join('/')} but returned ${result.status}: ${JSON.stringify(result.json)}`);
  app.unchanged(before);
  return result;
}

test('动态部门公开读取与默认配置一致，GET及重启不会创建配置或改写业务文件', async t => {
  const app = await fixture(t), before = app.snapshot(true);
  const listed = await app.departments();
  assert.equal(listed.departments.length, 5);
  assert.deepEqual(listed.archivedDepartments, []);
  for (const route of ['/api/config', '/api/slot-config']) {
    const result = await app.request('GET', route);
    assert.equal(result.status, 200);
    assert.deepEqual(result.json.departments, listed.departments);
    assert.deepEqual(result.json.archivedDepartments, listed.archivedDepartments);
  }
  app.unchanged(before);
  await app.restart();
  assert.deepEqual(await app.departments(), listed);
  app.unchanged(before);
});

test('部门、组别、场次写入均要求管理员和CSRF并拒绝跨站，负责人和工作人员同权', async t => {
  const app = await fixture(t), owner = await app.login(), staff = await app.login('staff');
  const department = await app.addDepartment(owner);
  const operations = [
    ['POST', '/api/departments', { name: '权限测试部', groups: ['一组'], slots: ['morning'] }],
    ['PATCH', departmentRoute(department.id), { name: '六部改名' }],
    ['DELETE', departmentRoute(department.id), undefined],
    ['POST', `${departmentRoute(department.id)}/groups`, { name: '二组', slots: ['morning'] }],
    ['DELETE', groupRoute(department.id, department.groups[0]), undefined],
    ['PATCH', '/api/slot-config', { department: department.id, group: '特使组', slots: ['evening'] }],
    ['POST', '/api/slot-config', { department: department.id, group: '特使组', slot: 'morning' }],
    ['DELETE', '/api/slot-config', { department: department.id, group: '特使组', slot: 'morning' }]
  ];
  for (const [method, route, body] of operations) {
    await rejectsWithoutWriting(app, method, route, body, undefined, [401]);
    await rejectsWithoutWriting(app, method, route, body, { cookie: owner.cookie }, [403]);
    await rejectsWithoutWriting(app, method, route, body, { cookie: owner.cookie, csrfToken: 'x'.repeat(43) }, [403]);
    const before = app.snapshot(true);
    const crossSite = await app.request(method, route, body, owner, { Origin: 'https://outside.invalid' });
    assert.equal(crossSite.status, 403);
    app.unchanged(before);
  }
  for (const [index, session] of [owner, staff].entries()) {
    const created = await app.addDepartment(session, { name: `同权测试部${index}`, groups: ['首组'] });
    const renamed = await app.request('PATCH', departmentRoute(created.id), { name: `已改名部门${index}` }, session);
    assert.equal(renamed.status, 200, JSON.stringify(renamed.json));
    const added = await app.request('POST', `${departmentRoute(created.id)}/groups`, { name: '特使/支援组', slots: ['evening'] }, session);
    assert.ok([200, 201].includes(added.status), JSON.stringify(added.json));
    assert.equal((await app.request('PATCH', '/api/slot-config', {
      department: created.id, group: '特使/支援组', slots: ['afternoon', 'evening']
    }, session)).status, 200);
    assert.equal((await app.request('DELETE', groupRoute(created.id, '特使/支援组'), undefined, session)).status, 200);
    assert.equal((await app.request('DELETE', departmentRoute(created.id), undefined, session)).status, 200);
  }
});

test('新增第六部及自定组可排连续三天三人，重启保留并检查第三人的跨部门冲突', async t => {
  const app = await fixture(t), owner = await app.login();
  const department = await app.addDepartment(owner, { groups: ['特使组', '机动组'] });
  const assigned = await app.addThree(owner, department);
  assert.deepEqual(assigned.schedules.map(item => item.date), ['2026-10-28', '2026-10-29', '2026-10-30']);
  for (const item of assigned.schedules) {
    assert.equal(item.department, department.id);
    assert.equal(item.group, '特使组');
    assert.deepEqual(item.talentIds, assigned.people.map(person => person.id));
  }
  await rejectsWithoutWriting(app, 'POST', '/api/schedules', {
    department: 'd2', group: '一组', slot: 'morning', business: '虾皮',
    talentIds: [assigned.people[2].id], startDate: '2026-10-29', days: 1
  }, owner, [409]);
  const before = app.snapshot(true);
  await app.restart();
  assert.deepEqual(scheduleIds(await app.schedules()), scheduleIds(assigned.schedules));
  const restored = (await app.departments()).departments.find(item => item.id === department.id);
  assert.equal(restored.name, '六部');
  assert.deepEqual(restored.groups, ['特使组', '机动组']);
  assert.deepEqual(groupSlots(restored, '特使组'), ALL_SLOTS);
  app.unchanged(before);
});

test('部门改名保持ID和原排班字节，配置与搜索可用新名称定位完整历史', async t => {
  const app = await fixture(t), owner = await app.login(), department = await app.addDepartment(owner);
  const assigned = await app.addThree(owner, department), before = app.snapshot();
  const renamed = await app.request('PATCH', departmentRoute(department.id), { name: '六部海外直播' }, owner);
  assert.equal(renamed.status, 200, JSON.stringify(renamed.json));
  app.unchanged(before);
  const listed = await app.departments();
  assert.equal(listed.departments.find(item => item.id === department.id).name, '六部海外直播');
  assert.equal(listed.departments.some(item => item.name === '六部'), false);
  const schedules = await app.schedules();
  assert.deepEqual(scheduleIds(schedules), scheduleIds(assigned.schedules));
  assert.ok(schedules.every(item => item.department === department.id));
  const search = await app.request('GET', `/api/talent-search?q=${assigned.people[2].number}`);
  assert.equal(search.status, 200);
  assert.deepEqual(scheduleIds(search.json.results[0].upcoming), scheduleIds(assigned.schedules));
  const config = await app.request('GET', '/api/config');
  assert.equal(config.json.departments.find(item => item.id === schedules[0].department).name, '六部海外直播');
  await app.restart();
  assert.equal((await app.departments()).departments.find(item => item.id === department.id).name, '六部海外直播');
  app.unchanged(before);
});

test('删除组只停用入口，既有排班可读取搜索取消，新增、沿用及单日换人均拒绝', async t => {
  const app = await fixture(t), owner = await app.login();
  const department = await app.addDepartment(owner, { groups: ['特使组', '保留组'] });
  const assigned = await app.addThree(owner, department);
  assert.equal((await app.request('POST', `/api/talents/${assigned.people[0].id}/stories`, {
    title: '删除组前剧情', date: '2026-10-28', content: '已有剧情内容需要保留'
  }, owner)).status, 201);
  const before = app.snapshot();
  assert.equal((await app.request('DELETE', groupRoute(department.id, '特使组'), undefined, owner)).status, 200);
  app.unchanged(before);
  const current = (await app.departments()).departments.find(item => item.id === department.id);
  assert.deepEqual(current.groups, ['保留组']);
  assert.deepEqual(scheduleIds(await app.schedules()), scheduleIds(assigned.schedules));
  const search = await app.request('GET', `/api/talent-search?q=${assigned.people[0].number}`);
  assert.equal(search.status, 200);
  assert.deepEqual(scheduleIds(search.json.results[0].upcoming), scheduleIds(assigned.schedules));
  for (const startDate of ['2026-10-28', '2026-10-31']) {
    await rejectsWithoutWriting(app, 'POST', '/api/schedules', {
      department: department.id, group: '特使组', slot: 'morning', business: 'FB',
      talentIds: assigned.people.map(person => person.id), startDate, days: 3
    }, owner, [400, 404]);
  }
  await rejectsWithoutWriting(app, 'PATCH', `/api/schedules/${assigned.schedules[0].id}`, { business: '国内' }, owner, [400, 404]);
  assert.equal((await app.request('DELETE', `/api/schedules/${assigned.schedules[0].id}`, undefined, owner)).status, 200);
  assert.deepEqual(scheduleIds(await app.schedules()), scheduleIds(assigned.schedules.slice(1)));
  for (const name of ['admins.json', 'bookings.json', 'talent-stories.json']) {
    assert.deepEqual(fs.readFileSync(path.join(app.dataDir, name)), before[name]);
  }
});

test('删除部门保留归档名称和所有业务数据，卖手维护及人才导入仍接受旧自定义部门排班', async t => {
  const app = await fixture(t), owner = await app.login(), department = await app.addDepartment(owner);
  const assigned = await app.addThree(owner, department);
  assert.equal((await app.request('POST', `/api/talents/${assigned.people[0].id}/stories`, {
    title: '删除部门前剧情', date: '2026-10-28', content: '部门归档也不可修改原剧情'
  }, owner)).status, 201);
  const before = app.snapshot();
  assert.equal((await app.request('DELETE', departmentRoute(department.id), undefined, owner)).status, 200);
  app.unchanged(before);
  const listed = await app.departments();
  assert.equal(listed.departments.some(item => item.id === department.id), false);
  assert.equal(listed.archivedDepartments.find(item => item.id === department.id).name, department.name);
  assert.deepEqual(scheduleIds(await app.schedules()), scheduleIds(assigned.schedules));
  for (const route of ['/api/config', '/api/slot-config']) {
    const result = await app.request('GET', route);
    assert.equal(result.status, 200);
    assert.ok(result.json.archivedDepartments.some(item => item.id === department.id));
  }
  await rejectsWithoutWriting(app, 'POST', '/api/schedules', {
    department: department.id, group: '特使组', slot: 'morning', business: 'FB',
    talentIds: assigned.people.map(person => person.id), startDate: '2026-11-01', days: 3
  }, owner, [400, 404]);
  const current = JSON.parse(fs.readFileSync(path.join(app.dataDir, 'sellers.json')));
  const scheduleConfig = JSON.parse(fs.readFileSync(path.join(app.dataDir, CONFIG_FILE)));
  const plan = planTalentImport(current, importManifest(), { scheduleConfig, createId: () => 'department-import-person' });
  assert.deepEqual(plan.state.schedules, current.schedules);
  const inputFile = path.join(app.dataDir, 'isolated-import.json');
  fs.writeFileSync(inputFile, JSON.stringify(importManifest()));
  const dryRun = runImport({ input: inputFile, dataDir: app.dataDir, apply: false });
  assert.equal(dryRun.ok, true);
  assert.equal(dryRun.stats.schedulesPreserved, 3);
  app.unchanged(before);
  const maintained = await app.request('PATCH', `/api/talents/${assigned.people[0].id}`, { introduction: '归档部门仍可维护卖手' }, owner);
  assert.equal(maintained.status, 200, JSON.stringify(maintained.json));
  assert.deepEqual(scheduleIds(await app.schedules()), scheduleIds(assigned.schedules));
  const search = await app.request('GET', `/api/talent-search?q=${assigned.people[2].number}`);
  assert.equal(search.status, 200);
  assert.deepEqual(scheduleIds(search.json.results[0].upcoming), scheduleIds(assigned.schedules));
  assert.equal((await app.request('DELETE', `/api/schedules/${assigned.schedules[1].id}`, undefined, owner)).status, 200);
  assert.deepEqual(scheduleIds(await app.schedules()), scheduleIds([assigned.schedules[0], assigned.schedules[2]]));
});

test('v1组别场次覆盖兼容读取且GET不迁移，新部门写入后旧设置仍保留', async t => {
  const legacy = '{"version":1,"groups":{"d2":{"一组":["evening"]},"d3":{"一组":[]}}}\n';
  const app = await fixture(t, { scheduleConfig: legacy }), before = app.snapshot(true);
  const listed = await app.departments();
  assert.deepEqual(groupSlots(listed.departments.find(item => item.id === 'd2'), '一组'), ['evening']);
  assert.deepEqual(groupSlots(listed.departments.find(item => item.id === 'd3'), '一组'), []);
  for (const route of ['/api/config', '/api/slot-config', '/api/talents?view=summary']) {
    assert.equal((await app.request('GET', route)).status, 200);
  }
  await app.restart();
  await app.departments();
  app.unchanged(before);
  const owner = await app.login();
  await app.addDepartment(owner);
  const after = await app.departments();
  assert.deepEqual(groupSlots(after.departments.find(item => item.id === 'd2'), '一组'), ['evening']);
  assert.deepEqual(groupSlots(after.departments.find(item => item.id === 'd3'), '一组'), []);
  for (const name of BUSINESS_FILES) assert.deepEqual(app.snapshot()[name], before[name]);
});

test('损坏动态配置使依赖GET和写入失败，summary条件缓存不能掩盖损坏且恢复后可读', async t => {
  const app = await fixture(t), owner = await app.login(), department = await app.addDepartment(owner);
  await app.addThree(owner, department);
  const configPath = path.join(app.dataDir, CONFIG_FILE), valid = fs.readFileSync(configPath);
  const initial = await app.request('GET', '/api/talents?view=summary');
  assert.equal(initial.status, 200);
  assert.ok(initial.headers.get('etag'));
  const invalidStructures = [
    '{broken-json',
    JSON.stringify({ version: 999, departments: [], archivedDepartments: [] }),
    JSON.stringify({ version: 2, departments: {}, archivedDepartments: [] }),
    JSON.stringify({ version: 2, departments: [department, department], archivedDepartments: [] }),
    JSON.stringify({ version: 2, departments: [], archivedDepartments: 'broken' }),
    '{"version":1,"groups":{"__proto__":{"一组":["morning"]}}}'
  ];
  for (const source of invalidStructures) {
    fs.writeFileSync(configPath, source);
    const before = app.snapshot(true);
    for (const route of ['/api/config', '/api/departments', '/api/slot-config', '/api/schedules?date=2026-10-28', '/api/talents']) {
      assert.equal((await app.request('GET', route)).status, 500, route);
    }
    const cached = await app.request('GET', '/api/talents?view=summary', undefined, undefined, {
      'If-None-Match': initial.headers.get('etag')
    });
    assert.equal(cached.status, 500, 'A warm seller cache must not hide invalid department configuration');
    for (const [method, route, body] of [
      ['POST', '/api/departments', { name: '不得创建', groups: ['一组'], slots: ['morning'] }],
      ['PATCH', departmentRoute(department.id), { name: '不得改名' }],
      ['DELETE', departmentRoute(department.id), undefined],
      ['POST', '/api/talents', { name: '不得创建卖手', number: 'BADCONFIG' }]
    ]) assert.equal((await app.request(method, route, body, owner)).status, 500, `${method} ${route}`);
    app.unchanged(before);
    fs.writeFileSync(configPath, valid);
    assert.equal((await app.request('GET', '/api/departments')).status, 200);
    assert.equal((await app.request('GET', '/api/talents?view=summary')).status, 200);
  }
});

test('重复名称、非法字段与原型键均拒绝且不写配置或业务文件', async t => {
  const app = await fixture(t), owner = await app.login();
  const department = await app.addDepartment(owner, { groups: ['特使组', '保留组'] });
  const valid = { name: '待创建部', groups: ['一组'], slots: ['morning'] };
  for (const body of [
    { ...valid, name: '' }, { ...valid, name: '   ' }, { ...valid, name: '部门\u0000' },
    { ...valid, name: [] }, { ...valid, name: '字'.repeat(201) },
    { ...valid, name: department.name }, { ...valid, name: ` ${department.name} ` },
    { ...valid, groups: [] }, { ...valid, groups: ['重复组', '重复组'] },
    { ...valid, groups: ['一组', ' 一组 '] }, { ...valid, groups: [''] },
    { ...valid, groups: ['__proto__'] }, { ...valid, groups: ['constructor'] },
    { ...valid, groups: ['prototype'] },
    { ...valid, groups: {} }, { ...valid, slots: [] }, { ...valid, slots: ['midnight'] },
    { ...valid, slots: ['morning', 'morning'] }, { ...valid, slots: {} },
    { ...valid, extra: '不支持的字段' }
  ]) await rejectsWithoutWriting(app, 'POST', '/api/departments', body, owner);
  await rejectsWithoutWriting(app, 'POST', '/api/departments', undefined, owner, [400],
    '{"name":"原型部","groups":["一组"],"slots":["morning"],"__proto__":{"polluted":true}}');
  for (const body of [
    { name: '' }, { name: '特使组', slots: ['morning'] },
    { name: '__proto__', slots: ['morning'] }, { name: 'constructor', slots: ['morning'] },
    { name: '新增组', slots: [] }, { name: '新增组', slots: ['wrong'] },
    { name: '新增组', slots: ['morning'], extra: true }
  ]) await rejectsWithoutWriting(app, 'POST', `${departmentRoute(department.id)}/groups`, body, owner);
  await rejectsWithoutWriting(app, 'PATCH', departmentRoute(department.id), { name: '二部' }, owner);
  await rejectsWithoutWriting(app, 'PATCH', departmentRoute(department.id), { groups: ['非法整体改组'] }, owner);
  await rejectsWithoutWriting(app, 'PATCH', departmentRoute(department.id), { name: '可用名', extra: 1 }, owner);
  await rejectsWithoutWriting(app, 'DELETE', groupRoute('d5', '一组'), undefined, owner, [400, 409]);
  assert.equal({}.polluted, undefined);
});

test('全部部门软删后公开数组可为空，重启仍为空且管理员可重新新建部门', async t => {
  const app = await fixture(t), owner = await app.login(), before = app.snapshot();
  const initial = await app.departments();
  for (const department of initial.departments) {
    const result = await app.request('DELETE', departmentRoute(department.id), undefined, owner);
    assert.equal(result.status, 200, JSON.stringify(result.json));
  }
  const empty = await app.departments();
  assert.deepEqual(empty.departments, []);
  assert.equal(empty.archivedDepartments.length, initial.departments.length);
  for (const route of ['/api/config', '/api/slot-config']) {
    const result = await app.request('GET', route);
    assert.equal(result.status, 200);
    assert.deepEqual(result.json.departments, []);
  }
  app.unchanged(before);
  await app.restart();
  assert.deepEqual((await app.departments()).departments, []);
  const staff = await app.login('staff');
  const recreated = await app.addDepartment(staff, { name: initial.departments[0].name, groups: ['恢复组'] });
  assert.notEqual(recreated.id, initial.departments[0].id, 'Recreating an archived name must not reuse its historical identity');
  assert.equal((await app.departments()).departments.length, 1);
  app.unchanged(before);
});
