import { DatabaseSync, backup } from 'node:sqlite';
import { mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(process.env.DATA_DIR || resolve(root, 'data'), 'command-center.sqlite');
const destination = resolve(process.env.BACKUP_DIR || resolve(root, 'backups'));
await mkdir(destination, { recursive: true });
const target = resolve(destination, `command-center-${new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')}.sqlite`);
const db = new DatabaseSync(source, { readOnly: true });
try { await backup(db, target); console.log(`已完成一致性备份：${target}`); } finally { db.close(); }
