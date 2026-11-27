import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { accountDefaults, anchorDefaults, demoData } from './seed.mjs';
import { ApiError } from './validation.mjs';

export function passwordHash(password) {
  const salt = randomUUID();
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function passwordMatches(password, stored) {
  const [salt, hash] = stored.split(':');
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export function publicUser(user) {
  return user && { id: user.id, name: user.name, username: user.username, role: user.role };
}

export class Store {
  constructor(path, config = {}) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,username TEXT NOT NULL COLLATE NOCASE UNIQUE,name TEXT NOT NULL,role TEXT NOT NULL,passwordHash TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS entities(kind TEXT NOT NULL,id TEXT NOT NULL,version INTEGER NOT NULL,data TEXT NOT NULL,PRIMARY KEY(kind,id));
      CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY,createdAt TEXT NOT NULL,userId TEXT NOT NULL,userName TEXT NOT NULL,action TEXT NOT NULL,kind TEXT NOT NULL,entityId TEXT NOT NULL,beforeData TEXT,afterData TEXT);`);
    const initialized = this.db.prepare('SELECT value FROM metadata WHERE key=?').get('initialized');
    if (!initialized) {
      this.db.exec('BEGIN IMMEDIATE');
      try {
        this.db.prepare('INSERT INTO metadata(key,value) VALUES(?,?)').run('demo', config.demo ? '1' : '0');
        for (const account of accountDefaults) this.insert('accounts', { ...account, version: 1 });
        for (const anchor of anchorDefaults) this.insert('anchors', { ...anchor, version: 1 });
        if (config.demo) {
          this.createUser({ username: 'demo', name: '演示管理员', role: 'admin', password: 'demo2026!' });
          this.createUser({ username: 'editor', name: '演示运营', role: 'editor', password: 'editor2026!' });
          this.createUser({ username: 'viewer', name: '演示查看', role: 'viewer', password: 'viewer2026!' });
          const seed = demoData(config.today);
          for (const kind of ['sessions', 'inventory', 'tasks']) for (const item of seed[kind]) this.insert(kind, item);
        } else {
          this.createUser({ username: config.adminUsername || 'admin', name: config.adminName || '管理员', role: 'admin', password: config.adminPassword });
        }
        this.db.prepare('INSERT INTO metadata(key,value) VALUES(?,?)').run('initialized', new Date().toISOString());
        this.db.exec('COMMIT');
      } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    }
    this.demo = this.db.prepare('SELECT value FROM metadata WHERE key=?').get('demo')?.value === '1';
    for (const kind of ['accounts', 'anchors']) {
      for (const item of this.list(kind)) if (!item.version) {
        item.version = 1;
        this.db.prepare('UPDATE entities SET data=? WHERE kind=? AND id=?').run(JSON.stringify(item), kind, item.id);
      }
    }
    if (!config.demo && this.demo) {
      this.db.close();
      throw new Error('生产模式不能使用演示数据库，请设置新的 DATA_DIR。');
    }
    if (config.mode === 'imported' && this.getDataset().kind !== 'imported') {
      this.db.close();
      throw new Error('本地导入预览须使用已标记 imported 的独立数据库，不能把演示库伪装为真实数据。');
    }
    if (config.demo && this.demo) this.backfillDemoHistory(config.today);
    if (config.demo && this.demo) this.ensureLocalEntryUsers();
  }
  list(kind) { return this.db.prepare('SELECT data FROM entities WHERE kind=? ORDER BY rowid').all(kind).map(row => JSON.parse(row.data)); }
  getDataset() {
    const row = this.db.prepare('SELECT value FROM metadata WHERE key=?').get('dataset');
    return row ? JSON.parse(row.value) : { kind: this.demo ? 'demo' : 'production', label: this.demo ? '演示数据' : '正式数据' };
  }
  setDataset(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || !['demo', 'imported', 'production'].includes(value.kind)) throw new Error('数据集元数据无效');
    this.db.prepare('INSERT INTO metadata(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('dataset', JSON.stringify(value));
    return this.getDataset();
  }
  get(kind, id) { const row = this.db.prepare('SELECT data FROM entities WHERE kind=? AND id=?').get(kind, id); return row ? JSON.parse(row.data) : undefined; }
  insert(kind, item) { this.db.prepare('INSERT INTO entities(kind,id,version,data) VALUES(?,?,?,?)').run(kind, item.id, item.version || 1, JSON.stringify(item)); return item; }
  backfillDemoHistory(today) {
    if (!this.demo) throw new Error('只允许补充演示数据库历史，不可写入正式业务数据。');
    if (this.getDataset().kind !== 'demo') return 0;
    const existing = this.list('sessions');
    if (!existing.length) return 0;
    for (const item of existing) {
      if (item.actualMinutes !== undefined || item.updatedBy !== '演示数据') continue;
      const minutes = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
      item.actualMinutes = minutes(item.end) - minutes(item.start);
      this.db.prepare('UPDATE entities SET data=? WHERE kind=? AND id=?').run(JSON.stringify(item), 'sessions', item.id);
    }
    const earliest = existing.reduce((value, item) => item.date < value ? item.date : value, existing[0].date);
    const occupied = new Set(existing.map(item => `${item.date}|${item.accountId}|${item.start}`));
    const additions = demoData(today).sessions.filter(item => item.date < earliest && !occupied.has(`${item.date}|${item.accountId}|${item.start}`) && !this.get('sessions', item.id));
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const item of additions) this.insert('sessions', item);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    return additions.length;
  }
  save(kind, item, expectedVersion, actor, { defaultRecord, preserveSlot } = {}) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const stored = this.get(kind, item.id);
      const before = stored ?? defaultRecord;
      if (expectedVersion !== undefined && (!before || before.version !== expectedVersion)) throw new ApiError(409, '其他成员已更新此记录，请刷新后再保存', { current: before });
      const saved = { ...item, version: before ? before.version + 1 : 1, updatedAt: new Date().toISOString(), updatedBy: actor.name };
      if (preserveSlot && !this.get('slots', preserveSlot.id)) this.insert('slots', preserveSlot);
      if (stored) this.db.prepare('UPDATE entities SET version=?,data=? WHERE kind=? AND id=?').run(saved.version, JSON.stringify(saved), kind, saved.id);
      else this.insert(kind, saved);
      this.recordAudit(actor, before ? 'update' : 'create', kind, saved.id, before, saved);
      this.db.exec('COMMIT');
      return saved;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  createUser({ username, name, role, password }) {
    const user = { id: randomUUID(), username, name, role, passwordHash: passwordHash(password) };
    try { this.db.prepare('INSERT INTO users(id,username,name,role,passwordHash) VALUES(?,?,?,?,?)').run(user.id, username, name, role, user.passwordHash); }
    catch (error) { if (error.code === 'ERR_SQLITE_ERROR' && /UNIQUE/.test(error.message)) throw new ApiError(409, '用户名已存在'); throw error; }
    return publicUser(user);
  }
  ensureLocalEntryUsers() {
    for (const user of [
      { username: 'recorder', name: '主播录入员', role: 'anchor_entry', password: 'record2026!' },
      { username: 'service', name: '客服录入员', role: 'service_entry', password: 'service2026!' },
      { username: 'manager', name: '主管', role: 'manager', password: 'manage2026!' }
    ]) if (!this.findUser(user.username)) this.createUser(user);
  }
  findUser(username) { return this.db.prepare('SELECT * FROM users WHERE username=? COLLATE NOCASE').get(username); }
  userById(id) { return publicUser(this.db.prepare('SELECT * FROM users WHERE id=?').get(id)); }
  users() { return this.db.prepare('SELECT id,username,name,role FROM users ORDER BY rowid').all(); }
  recordAudit(actor, action, kind, entityId, before, after) {
    this.db.prepare('INSERT INTO audit(id,createdAt,userId,userName,action,kind,entityId,beforeData,afterData) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(randomUUID(), new Date().toISOString(), actor.id, actor.name, action, kind, entityId, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null);
  }
  audit() {
    return this.db.prepare('SELECT * FROM audit ORDER BY rowid DESC LIMIT 100').all().map(({ beforeData, afterData, ...row }) => ({ ...row, before: beforeData ? JSON.parse(beforeData) : null, after: afterData ? JSON.parse(afterData) : null }));
  }
  close() { this.db.close(); }
}
