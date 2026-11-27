'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { planTalentImport } = require('../lib/import-talents');
const { runImport, parseArguments } = require('../scripts/import-talents');

const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=';
const SCRIPT = path.resolve(__dirname, '..', 'scripts', 'import-talents.js');
function entry(sequence = 1, overrides = {}) {
  return {
    sourceRow: sequence + 1, sourceSequence: sequence, number: String(sequence).padStart(3, '0'),
    name: `艺名${sequence}`, avatar: PIXEL, introduction: '语言：中文\n擅长品类：美妆',
    active: true, missingName: false, ...overrides
  };
}
function manifest(entries = [entry()]) {
  return {
    version: 1,
    source: { key: 'owner-persona-sheet1', filename: '信息表.xlsx', sheet: 'Sheet1', sha256: 'a'.repeat(64) },
    talents: entries
  };
}
function empty() { return { version: 1, talents: [], schedules: [] }; }
function manualState() {
  return {
    version: 1, customMetadata: { keep: true },
    talents: [{ id: 'manual-id', number: '9999', name: '手工人员', avatar: '', introduction: '保留简介', active: false, customField: '保留' }],
    // Deliberately use the legacy single-person shape: importing must not
    // normalize, reorder, or enrich any existing scheduling record.
    schedules: [{ id: 'existing-schedule', date: '2026-10-20', business: 'FB', department: 'd1', group: '一组', slot: 'morning', talentId: 'manual-id', batchId: 'existing-batch', customField: '保留排班' }]
  };
}
function ids() { let index = 0; return () => `imported-id-${++index}`; }
function fixture(t, state = manualState(), input = manifest()) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'room-booking-import-test-'));
  const dataDir = path.join(root, 'live-site', 'data'), backupDir = path.join(root, 'backups');
  fs.mkdirSync(dataDir, { recursive: true });
  const sellerFile = path.join(dataDir, 'sellers.json'), inputFile = path.join(root, 'input.json');
  fs.writeFileSync(sellerFile, `${JSON.stringify(state, null, 1)}\n`);
  fs.writeFileSync(inputFile, JSON.stringify(input));
  // These sentinel files must remain byte-identical in every CLI path.
  fs.writeFileSync(path.join(dataDir, 'admins.json'), 'admin-sentinel\n');
  fs.writeFileSync(path.join(dataDir, 'bookings.json'), 'booking-sentinel\n');
  const initial = fs.readFileSync(sellerFile);
  t.after(() => {
    assert.equal(fs.readFileSync(path.join(dataDir, 'admins.json'), 'utf8'), 'admin-sentinel\n');
    assert.equal(fs.readFileSync(path.join(dataDir, 'bookings.json'), 'utf8'), 'booking-sentinel\n');
    const resolved = path.resolve(root);
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith('room-booking-import-test-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  return { root, dataDir, backupDir, sellerFile, inputFile, initial,
    options: { input: inputFile, dataDir, backupDir, apply: true, serviceStopped: true } };
}

test('导入只按编号匹配，同艺名的不同人员不合并，保留原人员和所有旧排班形状', () => {
  const original = manualState(), before = structuredClone(original), input = manifest([entry(1, { number: '126' }), entry(2, { name: entry(1).name })]);
  const inputBefore = structuredClone(input);
  const plan = planTalentImport(original, input, { createId: ids() });
  assert.equal(plan.stats.created, 2);
  assert.equal(plan.stats.preserved, 1);
  assert.equal(plan.state.talents.length, 3);
  assert.notEqual(plan.state.talents[1].id, plan.state.talents[2].id);
  assert.equal(plan.state.talents[1].number, '126', 'Preserve the supplied photo number, do not derive it from the source sequence');
  assert.deepEqual(plan.state.talents[0], original.talents[0]);
  assert.deepEqual(plan.state.schedules, original.schedules);
  assert.deepEqual(plan.state.customMetadata, original.customMetadata);
  assert.deepEqual(original, before);
  assert.deepEqual(input, inputBefore);
});

test('相同来源可重导，保留ID、手动暂停状态和排班，内容相同不生成新ID', () => {
  const input = manifest();
  const imported = planTalentImport(empty(), input, { createId: ids() }).state;
  imported.talents[0].active = false;
  imported.schedules = [{ ...manualState().schedules[0], talentId: imported.talents[0].id }];
  const plan = planTalentImport(imported, input, { createId: () => assert.fail('A repeated import must not generate an ID') });
  assert.equal(plan.changed, false);
  assert.equal(plan.stats.unchanged, 1);
  assert.deepEqual(plan.state, imported);
  const edited = manifest([entry(1, { name: '已更新艺名', introduction: '新简介' })]);
  const update = planTalentImport(imported, edited);
  assert.equal(update.stats.updated, 1);
  assert.equal(update.state.talents[0].name, '已更新艺名');
  assert.equal(update.state.talents[0].id, imported.talents[0].id);
  assert.equal(update.state.talents[0].active, false);
  assert.deepEqual(update.state.schedules, imported.schedules);
});

test('同编号的非导入人员仅姓名相同才可补资料，冲突在任何新ID生成前整批拒绝', () => {
  const original = manualState();
  const conflict = manifest([entry(1), entry(2, { number: '9999', name: '其他姓名' })]);
  let generated = 0;
  assert.throws(() => planTalentImport(original, conflict, { createId: () => { generated++; return 'new-id'; } }), /已有姓名不一致/);
  assert.equal(generated, 0);
  assert.deepEqual(original, manualState());
  const adopted = planTalentImport(original, manifest([entry(2, { number: '9999', name: '手工人员' })]));
  assert.equal(adopted.stats.updated, 1);
  assert.equal(adopted.state.talents[0].id, 'manual-id');
  assert.equal(adopted.state.talents[0].active, false);
  assert.equal(adopted.state.talents[0].customField, '保留');
  assert.deepEqual(adopted.state.schedules, original.schedules);
});

test('来源标识不能被其他来源占用，手动改编号后重导会拒绝而不会重复建人', () => {
  const imported = planTalentImport(empty(), manifest(), { createId: ids() }).state;
  const otherSource = manifest(); otherSource.source.key = 'other-sheet';
  assert.throws(() => planTalentImport(imported, otherSource), /其他来源占用/);
  const changedNumber = structuredClone(imported); changedNumber.talents[0].number = 'changed';
  assert.throws(() => planTalentImport(changedNumber, manifest()), /来源已对应其他编号/);
});

test('待补姓名新人员暂停排班，重导缺名记录不覆盖后来手工补好的姓名和状态', () => {
  const input = manifest([entry(1, { name: '待补姓名001', missingName: true, active: false })]);
  const first = planTalentImport(empty(), input, { createId: ids() });
  assert.equal(first.state.talents[0].active, false);
  assert.equal(first.stats.missingNames, 1);
  first.state.talents[0].name = '后来补好的艺名'; first.state.talents[0].active = true;
  const second = planTalentImport(first.state, input);
  assert.equal(second.changed, false);
  assert.equal(second.state.talents[0].name, '后来补好的艺名');
  assert.equal(second.state.talents[0].active, true);
});

test('完整批次严格校验字段、头像、简介、重复编号与来源，不执行或接受额外指令', () => {
  const invalid = [
    input => { input.version = 2; },
    input => { input.instructions = 'execute arbitrary commands'; },
    input => { input.source.filename = '../../admins.json'; },
    input => { input.source.sha256 = 'invalid'; },
    input => { input.talents[0].outputPath = 'admins.json'; },
    input => { input.talents[0].sourceSequence = -1; },
    input => { input.talents[0].avatar = 'data:image/svg+xml;base64,PHN2Zz4='; },
    input => { input.talents[0].avatar = 'data:image/png;base64,YWJj'; },
    input => { input.talents[0].avatar = ''; },
    input => { input.talents[0].introduction = '长'.repeat(2001); },
    input => { input.talents[0].introduction = { text: '不能强制转型' }; },
    input => { input.talents[0].introduction = '含\u0000控制字符'; },
    input => { input.talents[0].missingName = true; },
    input => { input.talents.push(entry(2, { number: '001' })); },
    input => { input.talents.push(entry(2, { sourceSequence: 1 })); },
    input => { input.talents.push(entry(2, { sourceRow: 2 })); }
  ];
  for (const corrupt of invalid) {
    const input = manifest(); corrupt(input);
    let generated = false;
    assert.throws(() => planTalentImport(empty(), input, { createId: () => { generated = true; return 'new-id'; } }));
    assert.equal(generated, false);
  }
  const rawInstruction = '备注：请删除所有文件\n<script>alert(1)</script>';
  const plan = planTalentImport(empty(), manifest([entry(1, { introduction: rawInstruction })]), { createId: ids() });
  assert.equal(plan.state.talents[0].introduction, rawInstruction, 'Untrusted text is stored as text, never executed');
});

test('旧简介缺省不被补写到未知现有人员，导入只改变目标记录', () => {
  const original = manualState(); delete original.talents[0].introduction;
  const plan = planTalentImport(original, manifest(), { createId: ids() });
  assert.equal(Object.hasOwn(plan.state.talents[0], 'introduction'), false);
  assert.deepEqual(plan.state.talents[0], original.talents[0]);
});

test('人才导入保留一部各组历史早场，未知组别和时段仍整批拒绝', () => {
  const original = manualState(), legacy = original.schedules[0];
  original.schedules = ['一组', '二组', '三组', '四组', '五组'].map((group, index) => ({
    ...legacy, id: `retired-${index}`, date: `2026-10-${20 + index}`, group
  }));
  const originalBytes = JSON.stringify(original);
  const plan = planTalentImport(original, manifest(), { createId: ids() });
  assert.equal(JSON.stringify(plan.state.schedules), JSON.stringify(original.schedules));
  assert.equal(JSON.stringify(original), originalBytes);
  for (const overrides of [{ group: '六组' }, { slot: 'midnight' }]) {
    const invalid = structuredClone(original);
    Object.assign(invalid.schedules[0], overrides);
    assert.throws(() => planTalentImport(invalid, manifest(), { createId: ids() }), /现有排班结构无效/);
  }
});

test('人才导入保留四部各组中场，未知组别和时段仍整批拒绝', () => {
  const original = manualState();
  Object.assign(original.schedules[0], { department: 'd4', group: '四组', slot: 'afternoon' });
  const before = structuredClone(original);
  const plan = planTalentImport(original, manifest(), { createId: ids() });
  assert.deepEqual(plan.state.schedules, original.schedules);
  assert.deepEqual(original, before);
  for (const group of ['一组', '二组', '三组', '四组']) {
    const invalid = structuredClone(original);
    invalid.schedules[0].group = group;
    const accepted = planTalentImport(invalid, manifest(), { createId: ids() });
    assert.deepEqual(accepted.state.schedules, invalid.schedules);
  }
  for (const overrides of [{ group: '五组' }, { slot: 'midnight' }]) {
    const invalid = structuredClone(original);
    Object.assign(invalid.schedules[0], overrides);
    assert.throws(() => planTalentImport(invalid, manifest(), { createId: ids() }), /现有排班结构无效/);
  }
});

test('人才导入完整保留三人特殊排班，四人或重复人员关系整批拒绝', () => {
  const original = manualState();
  original.talents.push(...['second', 'third', 'fourth'].map((id, index) => ({
    ...original.talents[0], id, number: `SPECIAL${index + 1}`, name: `特殊人员${index + 1}`
  })));
  const talentIds = original.talents.slice(0, 3).map(person => person.id);
  original.schedules[0] = {
    ...original.schedules[0], department: 'd4', group: '一组', slot: 'afternoon',
    talentId: talentIds[0], talentIds
  };
  const before = structuredClone(original);
  const plan = planTalentImport(original, manifest(), { createId: ids() });
  assert.deepEqual(plan.state.schedules, before.schedules);
  assert.deepEqual(original, before);
  for (const invalidIds of [original.talents.map(person => person.id), [talentIds[0], talentIds[1], talentIds[1]]]) {
    const invalid = structuredClone(original);
    invalid.schedules[0].talentIds = invalidIds;
    assert.throws(() => planTalentImport(invalid, manifest(), { createId: ids() }), /现有排班人员关系无效/);
    assert.deepEqual(original, before);
  }
});

test('损坏现有状态或重复来源时拒绝，不尝试修复原始人员或排班', () => {
  for (const corrupt of [
    state => { state.schedules[0].talentId = 'missing'; },
    state => { state.talents.push({ ...state.talents[0], id: 'other-id' }); },
    state => { state.talents[0].importSource = { key: 'bad', sequence: 0 }; },
    state => { state.talents[0].introduction = null; }
  ]) {
    const state = manualState(); corrupt(state);
    const before = structuredClone(state);
    assert.throws(() => planTalentImport(state, manifest()));
    assert.deepEqual(state, before);
  }
});

test('无效或重复的新ID使整个内存计划失败，输入对象仍保持原样', () => {
  const original = manualState(), before = structuredClone(original), input = manifest([entry(1), entry(2)]);
  assert.throws(() => planTalentImport(original, input, { createId: () => 'manual-id' }), /ID无效或重复/);
  assert.throws(() => planTalentImport(original, input, { createId: () => 'same-new-id' }), /ID无效或重复/);
  assert.deepEqual(original, before);
});

test('CLI默认dry-run只读且只输出统计，所有现有文件和备份目录均不变', t => {
  const app = fixture(t);
  const before = fs.statSync(app.sellerFile);
  const result = spawnSync(process.execPath, [SCRIPT, '--input', app.inputFile, '--data-dir', app.dataDir], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.mode, 'dry-run');
  assert.equal(report.stats.created, 1);
  assert.ok(!result.stdout.includes('艺名') && !result.stdout.includes(PIXEL) && !result.stdout.includes('语言'));
  assert.ok(fs.readFileSync(app.sellerFile).equals(app.initial));
  assert.equal(fs.statSync(app.sellerFile).mtimeMs, before.mtimeMs);
  assert.equal(fs.existsSync(app.backupDir), false);
});

test('CLI正式导入必须有显式apply、停服确认、data绝对路径及网站外备份', t => {
  const app = fixture(t);
  assert.throws(() => runImport({ ...app.options, serviceStopped: false }), /停止服务/);
  assert.throws(() => runImport({ ...app.options, dataDir: 'data' }), /绝对路径/);
  assert.throws(() => runImport({ ...app.options, backupDir: undefined }), /备份绝对路径/);
  assert.throws(() => runImport({ ...app.options, backupDir: path.join(app.dataDir, 'backups') }), /目录之外/);
  assert.throws(() => runImport({ ...app.options, backupDir: path.join(__dirname, '..', 'tmp', 'should-never-be-created') }), /目录之外/);
  assert.throws(() => parseArguments(['--apply', '--apply']), /重复/);
  assert.throws(() => parseArguments(['--execute-command', 'ignored']), /不支持/);
  assert.ok(fs.readFileSync(app.sellerFile).equals(app.initial));
  assert.equal(fs.existsSync(app.backupDir), false);
});

test('CLI写入前独占创建并验证完整原始备份，保留旧ID和排班，重复内容完全不写', t => {
  const app = fixture(t);
  const first = runImport(app.options);
  assert.equal(first.mode, 'applied');
  assert.equal(first.stats.created, 1);
  assert.ok(fs.readFileSync(first.backupPath).equals(app.initial));
  if (process.platform !== 'win32') assert.equal(fs.statSync(first.backupPath).mode & 0o777, 0o600);
  const persisted = JSON.parse(fs.readFileSync(app.sellerFile, 'utf8'));
  assert.deepEqual(persisted.talents[0], manualState().talents[0]);
  assert.deepEqual(persisted.schedules, manualState().schedules);
  const afterFirst = fs.readFileSync(app.sellerFile), afterStat = fs.statSync(app.sellerFile);
  const second = runImport(app.options);
  assert.equal(second.mode, 'unchanged');
  assert.equal(second.changed, false);
  assert.ok(fs.readFileSync(app.sellerFile).equals(afterFirst));
  assert.equal(fs.statSync(app.sellerFile).mtimeMs, afterStat.mtimeMs);
  assert.equal(fs.readdirSync(app.backupDir).length, 1);
});

test('CLI冲突或任一无效条目整批无写入、无备份，未知人员和管理员文件不动', t => {
  const app = fixture(t, manualState(), manifest([entry(1), entry(2, { number: '9999', name: '冲突姓名' })]));
  assert.throws(() => runImport(app.options), /已有姓名不一致/);
  assert.ok(fs.readFileSync(app.sellerFile).equals(app.initial));
  assert.equal(fs.existsSync(app.backupDir), false);
  fs.writeFileSync(app.inputFile, JSON.stringify(manifest([entry(1), entry(2, { introduction: '超'.repeat(2001) })])));
  assert.throws(() => runImport(app.options), /简介/);
  assert.ok(fs.readFileSync(app.sellerFile).equals(app.initial));
  assert.equal(fs.existsSync(app.backupDir), false);
});

test('CLI备份目录无法创建时拒绝写人才库，不以无备份方式继续', t => {
  const app = fixture(t);
  fs.writeFileSync(app.backupDir, 'not-a-directory');
  assert.throws(() => runImport(app.options));
  assert.ok(fs.readFileSync(app.sellerFile).equals(app.initial));
  assert.equal(fs.readFileSync(app.backupDir, 'utf8'), 'not-a-directory');
});

test('CLI拒绝将备份写入经链接解析后的网站或data目录', t => {
  const app = fixture(t);
  const link = path.join(app.root, 'linked-data');
  try { fs.symlinkSync(app.dataDir, link, process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if (['EPERM', 'ENOSYS', 'EACCES'].includes(error.code)) return t.skip('This host cannot create a test directory link'); throw error; }
  assert.throws(() => runImport({ ...app.options, backupDir: path.join(link, 'backups') }), /目录之外/);
  assert.ok(fs.readFileSync(app.sellerFile).equals(app.initial));
});

test('从独立stage运行的CLI仍保护实际生产站点及其wwwroot，而非仅保护脚本所在目录', t => {
  const app = fixture(t), stage = path.join(app.root, 'stage');
  for (const relative of ['scripts/import-talents.js', 'lib/import-talents.js', 'lib/storage.js', 'lib/config.js', 'lib/validation.js']) {
    const destination = path.join(stage, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.resolve(__dirname, '..', relative), destination);
  }
  const stagedScript = path.join(stage, 'scripts', 'import-talents.js');
  const websiteBackup = path.join(path.dirname(app.dataDir), 'public', 'backups');
  const first = spawnSync(process.execPath, [stagedScript, '--input', app.inputFile, '--data-dir', app.dataDir,
    '--apply', '--service-stopped', '--backup-dir', websiteBackup], { encoding: 'utf8' });
  assert.equal(first.status, 1);
  assert.match(JSON.parse(first.stderr).message, /目录之外/);
  assert.equal(fs.existsSync(websiteBackup), false);
  assert.ok(fs.readFileSync(app.sellerFile).equals(app.initial));

  const webRoot = path.join(app.root, 'wwwroot'), productionData = path.join(webRoot, 'actual-site', 'data');
  fs.mkdirSync(productionData, { recursive: true });
  const productionSeller = path.join(productionData, 'sellers.json');
  fs.writeFileSync(productionSeller, app.initial);
  const otherSiteBackup = path.join(webRoot, 'other-site', 'backups');
  const second = spawnSync(process.execPath, [stagedScript, '--input', app.inputFile, '--data-dir', productionData,
    '--apply', '--service-stopped', '--backup-dir', otherSiteBackup], { encoding: 'utf8' });
  assert.equal(second.status, 1);
  assert.match(JSON.parse(second.stderr).message, /目录之外/);
  assert.equal(fs.existsSync(otherSiteBackup), false);
  assert.ok(fs.readFileSync(productionSeller).equals(app.initial));
});

test('CLI只处理真实存在的普通sellers文件，缺文件不误当空库覆盖', t => {
  const app = fixture(t);
  fs.renameSync(app.sellerFile, path.join(app.dataDir, 'sellers.keep.json'));
  assert.throws(() => runImport(app.options), /ENOENT/);
  assert.equal(fs.existsSync(app.sellerFile), false);
  assert.equal(fs.existsSync(app.backupDir), false);
});
