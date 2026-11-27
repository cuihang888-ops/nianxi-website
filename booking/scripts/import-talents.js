#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { atomicWrite, loadScheduleConfig } = require('../lib/storage');
const { ImportError, planTalentImport } = require('../lib/import-talents');

const HELP = `用法：
  node scripts/import-talents.js --input <导入JSON> --data-dir <现有data绝对路径>
  node scripts/import-talents.js --input <导入JSON> --data-dir <现有data绝对路径> --apply --service-stopped --backup-dir <网站外备份绝对路径>

默认只读预览，仅输出数量统计，不写入任何文件。
正式写入前必须先停止所有会修改该人才库的服务；--service-stopped 是调用方对已停服的明确确认，本脚本不会停止或启动服务。
仅处理指定data目录内已存在的sellers.json；管理员、场地预约、其他数据文件均不操作。
`;
function fail(message) { throw new ImportError(message); }
function parseArguments(args) {
  const options = { apply: false, serviceStopped: false };
  const flags = new Set();
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (flags.has(argument)) fail('命令参数重复');
    flags.add(argument);
    if (argument === '--help' || argument === '-h') options.help = true;
    else if (argument === '--apply') options.apply = true;
    else if (argument === '--service-stopped') options.serviceStopped = true;
    else if (['--input', '--data-dir', '--backup-dir'].includes(argument)) {
      const value = args[++index];
      if (!value || value.startsWith('--')) fail('命令参数缺少路径值');
      options[argument === '--input' ? 'input' : argument === '--data-dir' ? 'dataDir' : 'backupDir'] = value;
    } else fail('包含不支持的命令参数');
  }
  return options;
}
function within(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}
function resolvedFuturePath(value) {
  const suffix = [];
  let ancestor = path.resolve(value);
  while (!fs.existsSync(ancestor)) {
    const parent = path.dirname(ancestor);
    if (parent === ancestor) fail('备份路径无法定位');
    suffix.unshift(path.basename(ancestor)); ancestor = parent;
  }
  return path.join(fs.realpathSync(ancestor), ...suffix);
}
function ensureBackupOutside(backupDir, dataDir) {
  if (typeof backupDir !== 'string' || !path.isAbsolute(backupDir)) fail('正式导入须指定网站外的备份绝对路径');
  const applicationRoot = fs.realpathSync(path.join(__dirname, '..'));
  const dataApplicationRoot = path.dirname(dataDir);
  const roots = [applicationRoot, dataApplicationRoot, dataDir];
  for (const appRoot of [applicationRoot, dataApplicationRoot]) {
    const applicationParent = path.dirname(appRoot);
    if (path.basename(applicationParent).toLowerCase() === 'wwwroot') roots.push(applicationParent);
  }
  const canonicalBackup = resolvedFuturePath(backupDir);
  if (roots.some(root => within(root, canonicalBackup))) fail('备份目录须位于网站及data目录之外');
  return canonicalBackup;
}
function parseJson(bytes, label) {
  try { return JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, '')); }
  catch (_) { fail(`${label}不是有效的JSON，原文件未修改`); }
}
function exactFile(filename, expected) {
  const info = fs.lstatSync(filename);
  if (!info.isFile() || info.isSymbolicLink()) fail('人才库必须是普通文件，禁止通过链接写入其他路径');
  if (!fs.readFileSync(filename).equals(expected)) fail('人才库在导入期间发生变化，已停止写入');
}
function writeVerifiedBackup(backupDir, original) {
  const filename = path.join(backupDir, `sellers.before-import.${new Date().toISOString().replace(/[:.]/g, '-')}.${crypto.randomBytes(8).toString('hex')}.json`);
  const handle = fs.openSync(filename, 'wx', 0o600);
  try { fs.writeFileSync(handle, original); fs.fsyncSync(handle); }
  finally { fs.closeSync(handle); }
  const info = fs.lstatSync(filename);
  if (!info.isFile() || info.isSymbolicLink() || !fs.readFileSync(filename).equals(original)) fail('备份完整性核对失败，人才库未修改');
  return filename;
}
function runImport(options) {
  if (!options || typeof options !== 'object') fail('导入参数无效');
  if (options.help) return { help: HELP };
  if (typeof options.input !== 'string' || !options.input) fail('须指定--input导入文件');
  if (typeof options.dataDir !== 'string' || !path.isAbsolute(options.dataDir)) fail('须显式指定--data-dir现有data绝对路径');
  if (options.apply && options.serviceStopped !== true) fail('正式导入前须停止服务，并显式传入--service-stopped');
  const dataDir = fs.realpathSync(options.dataDir);
  if (!fs.statSync(dataDir).isDirectory()) fail('data路径不是目录');
  // Never derive a write destination from manifest content or a source filename.
  const sellerFile = path.join(dataDir, 'sellers.json');
  const sellerInfo = fs.lstatSync(sellerFile);
  if (!sellerInfo.isFile() || sellerInfo.isSymbolicLink()) fail('人才库必须是已存在的普通文件');
  if (sellerInfo.size > 256 * 1024 * 1024) fail('现有人才库过大，请先人工核对');
  const inputFile = path.resolve(options.input), inputInfo = fs.statSync(inputFile);
  if (!inputInfo.isFile() || inputInfo.size > 128 * 1024 * 1024) fail('导入文件须为不超过128 MB的普通JSON文件');
  const original = fs.readFileSync(sellerFile);
  const current = parseJson(original, '现有人才库');
  const manifest = parseJson(fs.readFileSync(inputFile), '导入文件');
  const scheduleConfig = loadScheduleConfig(path.join(dataDir, 'schedule-config.json'));
  const plan = planTalentImport(current, manifest, { scheduleConfig });
  if (!options.apply) return { ok: true, mode: 'dry-run', changed: plan.changed, stats: plan.stats };
  const backupDir = ensureBackupOutside(options.backupDir, dataDir);
  exactFile(sellerFile, original);
  if (!plan.changed) return { ok: true, mode: 'unchanged', changed: false, stats: plan.stats };
  fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  if (fs.realpathSync(backupDir) !== backupDir || !fs.statSync(backupDir).isDirectory()) fail('备份目录解析发生变化，已停止写入');
  ensureBackupOutside(backupDir, dataDir);
  const backupPath = writeVerifiedBackup(backupDir, original);
  exactFile(sellerFile, original);
  atomicWrite(sellerFile, plan.state);
  const persisted = parseJson(fs.readFileSync(sellerFile), '导入结果');
  if (!isDeepStrictEqual(persisted, plan.state) || !isDeepStrictEqual(persisted.schedules, current.schedules)) fail('导入后的完整性核对失败；已保留备份，请保持停服并人工核对');
  return { ok: true, mode: 'applied', changed: true, stats: plan.stats, backupPath };
}

if (require.main === module) {
  try {
    const result = runImport(parseArguments(process.argv.slice(2)));
    if (result.help) process.stdout.write(result.help);
    else console.log(JSON.stringify(result));
  } catch (error) {
    console.error(JSON.stringify({ ok: false, message: error.message }));
    process.exitCode = 1;
  }
}
module.exports = { parseArguments, runImport };
