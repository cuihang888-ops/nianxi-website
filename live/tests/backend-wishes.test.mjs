import assert from 'node:assert/strict';
import { mkdtemp, rmdir, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { createWishes } from '../lib/wishes.mjs';

const owner = { actor: 'owner-browser', name: '播后复盘小组' };
const colleague = { actor: 'colleague-browser', name: '灯光搭档' };
const moderator = { canModerate: true };
const now = () => new Date('2026-11-27T16:01:00Z');
const publicFields = ['date', 'fulfilled', 'hasContact', 'id', 'kind', 'mine', 'name', 'text'];
const failedWith = status => error => error.status === status;

function useWishes(db) {
  db.exec('PRAGMA foreign_keys=ON');
  return createWishes({ store: { db }, now });
}

test('wishes and private contact persist separately, and only admin can read contacts or set status', async t => {
  const temp = await mkdtemp(resolve(tmpdir(), 'wishes-'));
  const filename = resolve(temp, 'wishes.sqlite');
  let db = new DatabaseSync(filename);
  t.after(async () => {
    db.close();
    await unlink(filename);
    await rmdir(temp);
  });
  const phone = '+1 (202) 555-0123';
  let wishes = useWishes(db);
  wishes.post({ kind: 'year', text: '和同事完成一份新人练习册。' }, colleague);
  const posted = wishes.post({ kind: 'today', text: '今天想练习新的开场。', phone }, owner);
  const [first, second] = posted.wishes;
  assert.deepEqual(Object.keys(first).sort(), publicFields);
  assert.equal(first.date, '2026-11-28');
  assert.equal(first.name, owner.name);
  assert.equal(first.mine, true);
  assert.equal(first.hasContact, true);
  assert.equal(second.mine, false);
  assert.equal(second.hasContact, false);
  assert.throws(() => wishes.contact(first.id, owner), failedWith(403));
  assert.throws(() => wishes.status(first.id, { fulfilled: true }, colleague), failedWith(403));
  assert.throws(() => wishes.contact('missing', moderator), failedWith(404));
  assert.throws(() => wishes.status('missing', { fulfilled: true }, moderator), failedWith(404));
  assert.throws(() => wishes.status(first.id, { fulfilled: 'false' }, moderator), failedWith(400));
  const updated = wishes.status(first.id, { fulfilled: true }, moderator);
  assert.equal(updated.wishes[0].fulfilled, true);
  const phoneText = '+12025550123';
  for (const response of [posted, wishes.list(), wishes.list(moderator), updated]) {
    assert(!JSON.stringify(response).includes(phoneText));
    assert(JSON.stringify(response).includes('hasContact'));
    assert(!JSON.stringify(response).includes(owner.actor));
  }

  db.close();
  db = new DatabaseSync(filename);
  wishes = useWishes(db);
  assert.deepEqual(wishes.contact(first.id, moderator), { phone: phoneText });
  assert.deepEqual(wishes.contact(second.id, moderator), { phone: null });
  assert.equal(wishes.list(owner).wishes[0].mine, true);
  assert.equal(wishes.status(first.id, { fulfilled: false }, moderator).wishes[0].fulfilled, false);
});

test('public telephone text and malformed contacts are rejected before any wish is published', t => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  const wishes = useWishes(db);
  const valid = { kind: 'today', text: '想提前十分钟准备设备。' };
  assert.throws(() => wishes.post(valid), failedWith(401));
  for (const input of [
    { ...valid, text: '请拨＇＋１（２０２）５５５－０１２３＇。' },
    { ...valid, text: '请拨202\u200b-555-0123。' },
    { ...valid, text: '请拨 ၂၀၂ ၅၅၅ ၀၁၂၃。' },
    { ...valid, text: '好'.repeat(501) },
    { ...valid, kind: 'week' },
    { ...valid, phone: '测试号码' },
    { ...valid, phone: '123456' },
    { ...valid, phone: '1'.repeat(16) },
    { ...valid, '2025550123': 'unexpected' }
  ]) assert.throws(() => wishes.post(input, owner), error => error.status === 400 && !error.message.includes('2025550123'));
  assert.throws(() => wishes.post(valid, { ...owner, name: '电话202.555.0123' }), failedWith(400));
  assert.deepEqual(wishes.list().wishes, []);
  assert.equal(wishes.post({ ...valid, text: '希望在2026-11-28完成。', phone: '' }, owner).wishes[0].hasContact, false);
});

test('wish and contact writes are atomic', t => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  const wishes = useWishes(db);
  db.exec(`CREATE TRIGGER reject_contact BEFORE INSERT ON tearoom_wish_contacts BEGIN
    SELECT RAISE(ABORT, 'Synthetic SQLite failure');
  END;`);
  assert.throws(() => wishes.post({ kind: 'year', text: '整理培训资料。', phone: '2025550123' }, owner));
  assert.deepEqual(wishes.list().wishes, []);
  assert.equal(wishes.post({ kind: 'year', text: '整理培训资料。' }, owner).wishes.length, 1);
});
