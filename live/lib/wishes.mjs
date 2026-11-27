import { randomUUID } from 'node:crypto';
import { chinaDate } from './seed.mjs';
import { ApiError, object, text } from './validation.mjs';

// Normalize full-width digits and ignore invisible separators before checking public text.
const normalized = value => value.normalize('NFKC').replace(/\p{Cf}/gu, '');
const phoneInText = /\p{Nd}(?:[\s().·‐‑–—+-]*\p{Nd}){6,}/u;
const isoDate = /(?<![+\p{Nd}])(?:19|20|21)[0-9]{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])(?!\p{Nd}|[.-]\p{Nd})/gu;
const privateLabel = '联系号码';

function assertPublicText(value, label) {
  if (phoneInText.test(normalized(value).replace(isoDate, item => {
    const date = new Date(item + 'T00:00:00Z');
    return date.toISOString().slice(0, 10) === item ? ' 日期 ' : item;
  }))) {
    throw new ApiError(400, label + '请勿填写电话号码。号码可填在私密联系方式栏。');
  }
}

function contactNumber(value) {
  const phone = normalized(text(value ?? '', privateLabel, 40));
  if (!phone) return null;
  if (!/^\+?[0-9\s().·‐‑–—-]+$/.test(phone)) throw new ApiError(400, '请填写有效的电话号码。');
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.length < 7 || digits.length > 15) throw new ApiError(400, '电话号码须包含 7 至 15 位数字。');
  return (phone.startsWith('+') ? '+' : '') + digits;
}

function requireModerator(context) {
  if (context.canModerate !== true) throw new ApiError(403, '请先登录管理员账号。');
}

function validateFields(value, fields) {
  object(value);
  // Do not echo unexpected user-supplied field names in errors.
  if (Object.keys(value).some(key => !fields.includes(key))) throw new ApiError(400, '提交内容格式无效。');
}

export function createWishes({ store, now = () => new Date() }) {
  const { db } = store;
  db.exec(`
    CREATE TABLE IF NOT EXISTS tearoom_wishes (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL CHECK (kind IN ('today', 'year')),
      text TEXT NOT NULL,
      name TEXT NOT NULL,
      actor TEXT NOT NULL,
      date TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      fulfilled INTEGER NOT NULL DEFAULT 0 CHECK (fulfilled IN (0, 1))
    );
    CREATE INDEX IF NOT EXISTS tearoom_wishes_created ON tearoom_wishes (createdAt DESC);
    CREATE TABLE IF NOT EXISTS tearoom_wish_contacts (
      wishId TEXT PRIMARY KEY REFERENCES tearoom_wishes(id) ON DELETE CASCADE,
      phone TEXT NOT NULL
    );
  `);

  const allWishes = db.prepare(`
    SELECT id, kind, text, name, date, fulfilled,
      EXISTS(SELECT 1 FROM tearoom_wish_contacts WHERE wishId = wish.id) AS hasContact,
      actor = ? AS mine
    FROM tearoom_wishes AS wish
    ORDER BY createdAt DESC, wish.rowid DESC
  `);
  const insertWish = db.prepare(`
    INSERT INTO tearoom_wishes (id, kind, text, name, actor, date, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertPhone = db.prepare('INSERT INTO tearoom_wish_contacts (wishId, phone) VALUES (?, ?)');
  const getPhone = db.prepare(`
    SELECT contact.phone FROM tearoom_wishes AS wish
    LEFT JOIN tearoom_wish_contacts AS contact ON contact.wishId = wish.id
    WHERE wish.id = ?
  `);
  const setStatus = db.prepare('UPDATE tearoom_wishes SET fulfilled = ? WHERE id = ?');

  function list({ actor = null, canModerate = false } = {}) {
    return {
      wishes: allWishes.all(actor).map(({ fulfilled, hasContact, mine, ...record }) => ({
        ...record, fulfilled: Boolean(fulfilled), hasContact: Boolean(hasContact), mine: Boolean(mine)
      })),
      canModerate: canModerate === true
    };
  }

  function post(input, context = {}) {
    const { actor, name } = context;
    if (typeof actor !== 'string' || !actor) throw new ApiError(401, '请进入茶水间后发布心愿。');
    validateFields(input, ['kind', 'text', 'phone']);
    if (input.kind !== 'today' && input.kind !== 'year') throw new ApiError(400, '请选择心愿类型。');
    const wish = text(input.text, '心愿', 500, true);
    const publicName = text(name, '昵称', 24, true);
    assertPublicText(wish, '心愿正文');
    assertPublicText(publicName, '昵称');
    const phone = contactNumber(input.phone);
    const id = randomUUID();
    const created = now();

    db.exec('BEGIN IMMEDIATE');
    try {
      insertWish.run(id, input.kind, wish, publicName, actor, chinaDate(created), created.getTime());
      if (phone) insertPhone.run(id, phone);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    return list(context);
  }

  function contact(id, context = {}) {
    requireModerator(context);
    const wish = getPhone.get(id);
    if (!wish) throw new ApiError(404, '找不到这条心愿。');
    return { phone: wish.phone };
  }

  function status(id, input, context = {}) {
    requireModerator(context);
    validateFields(input, ['fulfilled']);
    if (typeof input.fulfilled !== 'boolean') throw new ApiError(400, '心愿状态无效。');
    const result = setStatus.run(input.fulfilled ? 1 : 0, id);
    if (!result.changes) throw new ApiError(404, '找不到这条心愿。');
    return list(context);
  }

  return { list, post, contact, status };
}
