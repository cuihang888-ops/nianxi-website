'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { createServer } = require('../server');

const NOW = '2026-10-18T02:00:00.000Z'; // 10:00 in Shanghai.
function person(id, number, name, overrides = {}) {
  return { id, number, name, avatar: '', introduction: `PRIVATE-BIO-${id}`, active: true, ...overrides };
}
function assignment(id, day, talentIds, overrides = {}) {
  return { id, date: day, talentId: talentIds[0], talentIds, batchId: `batch-${id}`,
    department: 'd2', group: '一组', business: 'FB', slot: 'morning', ...overrides };
}
async function fixture(t, { talents = [], schedules = [], instant = NOW } = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'room-talent-search-'));
  const legacyFile = path.join(dataDir, 'bookings.json');
  fs.writeFileSync(legacyFile, '{"version":2,"bookings":[]}');
  fs.writeFileSync(path.join(dataDir, 'sellers.json'), JSON.stringify({ version: 1, talents, schedules }, null, 2));
  fs.writeFileSync(path.join(dataDir, 'talent-stories.json'), '{"version":1,"stories":[]}');
  let clock = new Date(instant);
  const server = createServer({ dataDir, legacyFile, now: () => new Date(clock) });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    const closed = new Promise(resolve => server.close(resolve));
    server.closeAllConnections?.();
    await closed;
    const resolved = fs.realpathSync(dataDir);
    assert.equal(path.dirname(resolved), fs.realpathSync(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith('room-talent-search-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  async function request(route, body) {
    const response = await fetch(base + route, body === undefined ? {} : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    return { status: response.status, json: await response.json() };
  }
  return { dataDir, request, setNow: value => { clock = new Date(value); },
    search: query => request(`/api/talent-search?q=${encodeURIComponent(query)}`) };
}

test('搜索在全部日期和直播间定位最近安排，并分别限制未来与历史列表', async t => {
  const talent = person('person-a', '0001', '小叶');
  const schedules = [
    assignment('future-nov', '2026-11-01', [talent.id], { department: 'd4', group: '四组', slot: 'evening', business: '虾皮' }),
    assignment('past-sep', '2026-09-30', [talent.id], { department: 'd1', group: '五组', slot: 'evening' }),
    assignment('ongoing', '2026-10-18', [talent.id]),
    assignment('past-oct', '2026-10-17', [talent.id], { department: 'd3', group: '二组', business: '国内' }),
    assignment('future-today', '2026-10-18', [talent.id], { slot: 'afternoon', department: 'd5' }),
    assignment('future-oct', '2026-10-31', [talent.id], { slot: 'evening' }),
    assignment('past-aug', '2026-08-31', [talent.id]),
    assignment('past-july', '2026-07-31', [talent.id])
  ];
  const app = await fixture(t, { talents: [talent], schedules });
  const result = await app.search('0001');
  assert.equal(result.status, 200);
  assert.equal(result.json.query, '0001');
  assert.equal(result.json.today, '2026-10-18');
  assert.equal(result.json.limit, 20);
  assert.equal(result.json.total, 1);
  const match = result.json.results[0];
  assert.deepEqual(match.talent, { id: 'person-a', number: '0001', name: '小叶', active: true });
  assert.deepEqual(match.upcoming.map(item => [item.id, item.status]),
    [['ongoing', 'ongoing'], ['future-today', 'upcoming'], ['future-oct', 'upcoming']]);
  assert.deepEqual(match.recent.map(item => [item.id, item.status]),
    [['past-oct', 'finished'], ['past-sep', 'finished'], ['past-aug', 'finished']]);
  assert.equal(match.upcomingTotal, 4);
  assert.equal(match.recentTotal, 4);
  assert.equal(match.upcoming[0].startsAt, '2026-10-18T00:00:00.000Z');
  assert.equal(match.upcoming[0].endsAt, '2026-10-18T05:30:00.000Z');
  assert.equal(match.recent[1].endsAt, '2026-09-30T17:30:00.000Z');
});

test('前一天晚场在上海次日凌晨仍进行中，开始包含而结束不包含', async t => {
  const talent = person('night', 'N001', '夜班卖手');
  const app = await fixture(t, {
    talents: [talent], instant: '2026-10-17T16:45:00Z',
    schedules: [assignment('night-shift', '2026-10-17', [talent.id], { slot: 'evening' }),
      assignment('morning-shift', '2026-10-18', [talent.id])]
  });
  let result = (await app.search('N001')).json;
  assert.equal(result.today, '2026-10-18');
  assert.deepEqual(result.results[0].upcoming.map(item => [item.id, item.status]),
    [['night-shift', 'ongoing'], ['morning-shift', 'upcoming']]);
  assert.equal(result.results[0].upcoming[0].endsAt, '2026-10-17T17:30:00.000Z');
  app.setNow('2026-10-17T17:30:00Z');
  result = (await app.search('N001')).json;
  assert.deepEqual(result.results[0].recent.map(item => item.id), ['night-shift']);
  app.setNow('2026-10-18T00:00:00Z');
  result = (await app.search('N001')).json;
  assert.equal(result.results[0].upcoming[0].status, 'ongoing');
  app.setNow('2026-10-18T05:30:00Z');
  result = (await app.search('N001')).json;
  assert.equal(result.results[0].upcoming.length, 0);
  assert.deepEqual(result.results[0].recent.map(item => item.id), ['morning-shift', 'night-shift']);
});

test('支持旧单人排班、双人场次及已停用卖手历史，不混淆同名人员', async t => {
  const first = person('same-a', '0001', '阿红', { active: false });
  const second = person('same-b', '0002', '阿红');
  const legacy = assignment('legacy', '2026-09-18', [first.id]);
  delete legacy.talentIds;
  const dual = assignment('dual', '2026-10-19', [first.id, second.id]);
  const app = await fixture(t, { talents: [second, first], schedules: [legacy, dual] });
  const result = (await app.search('阿红')).json;
  assert.equal(result.total, 2);
  assert.deepEqual(result.results.map(item => item.talent.number), ['0001', '0002']);
  assert.equal(result.results[0].talent.active, false);
  assert.deepEqual(result.results[0].recent[0].talentIds, ['same-a']);
  assert.deepEqual(result.results.map(item => item.upcoming[0].talentIds),
    [['same-a', 'same-b'], ['same-a', 'same-b']]);
  assert.equal(result.results[1].recentTotal, 0);
  const byNumber = (await app.search('0002')).json;
  assert.equal(byNumber.total, 1);
  assert.equal(byNumber.results[0].talent.id, 'same-b');
});

test('三人特殊场次可按第3位搜索，结果保留完整人员且读取不改写人才文件', async t => {
  const talents = [person('triple-a', 'T001', '常规甲'), person('triple-b', 'T002', '常规乙'), person('triple-c', 'T003', '特使丙')];
  const talentIds = talents.map(talent => talent.id);
  const schedule = assignment('special-three', '2026-10-19', talentIds, { department: 'd4', group: '三组', slot: 'afternoon' });
  const app = await fixture(t, { talents, schedules: [schedule] });
  const file = path.join(app.dataDir, 'sellers.json'), before = fs.readFileSync(file);
  for (const talent of talents) {
    const result = (await app.search(talent.number)).json;
    assert.equal(result.total, 1);
    assert.deepEqual(result.results[0].upcoming[0].talentIds, talentIds);
    assert.equal(result.results[0].upcoming[0].talentId, talentIds[0]);
  }
  assert.deepEqual(fs.readFileSync(file), before);
});

test('姓名和编号统一全半角及大小写，精确、前缀、包含按次序返回且稳定', async t => {
  const app = await fixture(t, { talents: [
    person('substring', 'XabcX', '包含'),
    person('prefix', 'ABC2', '前缀'),
    person('name-exact', 'Z001', 'ＡＢＣ'),
    person('number-exact', 'abc', '其他名字'),
    person('name-prefix', 'Z002', 'abc甲'),
    person('not-matched', 'Q0001', '无关')
  ] });
  const result = (await app.search('　ＡｂＣ  ')).json;
  assert.equal(result.query, 'AbC');
  assert.equal(result.total, 5);
  assert.deepEqual(result.results.map(item => item.talent.id),
    ['number-exact', 'name-exact', 'prefix', 'name-prefix', 'substring']);
  assert.deepEqual((await app.search('abc')).json.results, result.results);
  for (const item of result.results) {
    assert.deepEqual(item.upcoming, []);
    assert.deepEqual(item.recent, []);
    assert.equal(item.upcomingTotal, 0);
    assert.equal(item.recentTotal, 0);
  }
});

test('最多返回20位匹配卖手并给出真实匹配总数', async t => {
  const talents = Array.from({ length: 25 }, (_, index) => person(`limit-${index}`,
    `M${String(index).padStart(2, '0')}`, `同名${index}`)).reverse();
  const app = await fixture(t, { talents });
  const result = (await app.search('同名')).json;
  assert.equal(result.total, 25);
  assert.equal(result.limit, 20);
  assert.equal(result.results.length, 20);
  assert.deepEqual(result.results.map(item => item.talent.number),
    Array.from({ length: 20 }, (_, index) => `M${String(index).padStart(2, '0')}`));
});

test('空词不会枚举全部排班或创建业务文件，无匹配有明确空结果', async t => {
  const app = await fixture(t, { talents: [person('a', '0001', '小明')] });
  const empty = { query: '', today: '2026-10-18', limit: 20, total: 0, results: [] };
  assert.deepEqual((await app.request('/api/talent-search')).json, empty);
  assert.deepEqual((await app.search('　 ')).json, empty);
  assert.deepEqual((await app.search('未安排人员')).json,
    { ...empty, query: '未安排人员' });
  // An empty search does not require opening or repairing the seller database.
  fs.unlinkSync(path.join(app.dataDir, 'sellers.json'));
  assert.deepEqual((await app.search('')).json, empty);
  assert.equal(fs.existsSync(path.join(app.dataDir, 'sellers.json')), false);
});

test('拒绝重复关键词、超长词及控制字符，合法的64字词可以搜索', async t => {
  const app = await fixture(t);
  for (const suffix of ['?q=a&q=b', '?q=&q=', `?q=${'a'.repeat(65)}`,
    '?q=one%00two', '?q=one%09two', '?q=one%0Atwo', '?q=one%7Ftwo', '?q=one%C2%85two']) {
    const result = await app.request(`/api/talent-search${suffix}`);
    assert.equal(result.status, 400, suffix);
    assert.equal(result.json.results, undefined);
  }
  assert.equal((await app.search('Ａ'.repeat(64))).status, 200);
});

test('搜索和查看事件仅追加通用日志，原始查询、简介和业务文件不被写入', async t => {
  const talent = person('private', 'P001', '敏感查询名称');
  const app = await fixture(t, { talents: [talent],
    schedules: [assignment('private-shift', '2026-10-19', [talent.id])] });
  const businessFiles = ['bookings.json', 'sellers.json', 'talent-stories.json'];
  const before = businessFiles.map(filename => fs.readFileSync(path.join(app.dataDir, filename)));
  assert.equal((await app.search('敏感查询名称')).status, 200);
  const event = await app.request('/api/view-events', {
    kind: 'talent-search', q: 'BODY-SEARCH-SECRET', id: 'private', introduction: 'BODY-BIO-SECRET'
  });
  assert.equal(event.status, 200);
  await app.request('/api/talent-search?q=FAILED-QUERY-SECRET&q=x');
  for (let index = 0; index < businessFiles.length; index++) {
    assert.deepEqual(fs.readFileSync(path.join(app.dataDir, businessFiles[index])), before[index]);
  }
  const logs = fs.readFileSync(path.join(app.dataDir, 'security', 'audit.jsonl'), 'utf8');
  for (const secret of ['敏感查询名称', 'PRIVATE-BIO', 'BODY-SEARCH-SECRET', 'BODY-BIO-SECRET', 'FAILED-QUERY-SECRET']) {
    assert.equal(logs.includes(secret), false, secret);
  }
  const entries = logs.trim().split('\n').map(line => JSON.parse(line));
  assert.ok(entries.some(entry => entry.path === '/api/talent-search' && entry.category === 'view' &&
    entry.action === '读取数据' && entry.detail === '卖手排班搜索'));
  assert.ok(entries.some(entry => entry.path === '/api/view-events' && entry.category === 'view' &&
    entry.action === '搜索卖手排班' && entry.detail === ''));
  assert.ok(entries.some(entry => entry.path === '/api/talent-search' && entry.outcome === 'failed'));
});
