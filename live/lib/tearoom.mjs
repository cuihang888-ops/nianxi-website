import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { ApiError, keys, text } from './validation.mjs';

const SESSION_SECONDS = 12 * 60 * 60;
const BROWSER_SECONDS = 365 * 24 * 60 * 60;
const PROFILE_LIMIT = 120;
const PROFILE_WINDOW = 60 * 1000;
const WRITE_LIMIT = 30;
const WRITE_WINDOW = 60 * 1000;
const ACCESS_COOKIE = 'tearoom_session';
const BROWSER_COOKIE = 'tearoom_browser';
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const categories = ['砍价', '证书售后', '色名意境', '活动', '英文', '越南语', '其他'];
const marketTypes = ['拼车', '夜宵拼单', '二手闲置', '租房', '其他'];
const suggestionStates = ['已收到', '处理中', '已回复'];
const anonNames = ['晚场的一颗小翠', '匿名的助理', '路过的翻译', '夜班小太阳', '一颗冰种', '匿名的客服', '刚下播的主播', '茶水间常客', '匿名的卖手', '一颗晴底'];
const suggestedNames = [
  '镜头雕琢者', '现场节奏官', '选品策展人', '话术打磨师', '灯光造境师',
  '运营观察员', '成交复盘人', '直播场记', '场控搭档', '内容策划人',
  '直播剪辑人', '片段整理人', '色彩观察者', '镜头记录者', '试播记录者',
  '开场练习者', '提词板搭档', '评论观察员', '互动记录者', '上播协作者',
  '客户问答记录者', '选品记录者', '货盘观察员', '陈列搭档', '选题记录者',
  '案例整理人', '趋势观察员', '经验记录者', '场次分析员', '首饰细节观察者'
];
const sections = { script: 'scripts', case: 'cases', board: 'board', wall: 'wall', help: 'help', suggest: 'suggest', market: 'market' };
const formatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});

function parseCookie(request, name) {
  const prefix = name + '=';
  const value = (request.headers.cookie || '').split(';').map(item => item.trim()).find(item => item.startsWith(prefix))?.slice(prefix.length);
  return TOKEN.test(value || '') ? value : null;
}

function allowedValue(value, allowed, name) {
  if (!allowed.includes(value)) throw new ApiError(400, name + '无效');
  return value;
}

function fieldsFor(action, input, name) {
  switch (action) {
    case 'script':
      keys(input, ['action', 'cat', 'title', 'body']);
      return {
        cat: allowedValue(input.cat, categories, '话术分类'),
        title: text(input.title, '标题', 120, true), body: text(input.body, '话术正文', 3000, true),
        author: name
      };
    case 'case':
      keys(input, ['action', 'title', 'body']);
      return {
        title: text(input.title, '标题', 120, true), body: text(input.body, '案例内容', 3000, true),
        author: name
      };
    case 'board':
      keys(input, ['action', 'body']);
      return { body: text(input.body, '留言', 1000, true), who: anonNames[randomInt(anonNames.length)] };
    case 'wall':
      keys(input, ['action', 'body']);
      return { body: text(input.body, '励志句子', 400, true), who: name };
    case 'help':
      keys(input, ['action', 'title', 'body']);
      return { title: text(input.title, '问题', 120, true), body: text(input.body ?? '', '详情', 2000), who: name, solved: false };
    case 'suggest':
      keys(input, ['action', 'body']);
      return { body: text(input.body, '建议', 2000, true), status: '已收到', reply: '' };
    case 'market': {
      keys(input, ['action', 'type', 'title', 'contact']);
      const contact = text(input.contact ?? '', '内部称呼', 60);
      if (/\d(?:[\s()+.-]*\d){6}/.test(contact.normalize('NFKC'))) throw new ApiError(400, '联系栏请填写内部称呼');
      return { type: allowedValue(input.type, marketTypes, '集市分类'), title: text(input.title, '集市内容', 160, true), contact: contact || name };
    }
    default:
      throw new ApiError(400, '茶水间操作无效');
  }
}

function limit(attempts, key, limitCount, duration) {
  const now = Date.now();
  for (const [name, entry] of attempts) {
    if (entry.until <= now) attempts.delete(name);
  }
  const entry = attempts.get(key) || { count: 0, until: now + duration };
  if (entry.count >= limitCount || attempts.size >= 10000) throw new ApiError(429, '操作过于频繁，请稍后再试');
  entry.count++;
  attempts.set(key, entry);
}

export function createTearoom({ store, cookieSecure = false, seedScripts = [] }) {
  const profileCreations = new Map();
  const writeAttempts = new Map();
  const sessions = new Map();
  const db = store.db;

  db.exec(`
    CREATE TABLE IF NOT EXISTS tearoom_profiles (
      actor TEXT PRIMARY KEY,
      name TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tearoom_posts (
      id TEXT PRIMARY KEY,
      section TEXT NOT NULL,
      actor TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      data TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS tearoom_posts_section_date ON tearoom_posts (section, createdAt DESC);
    CREATE INDEX IF NOT EXISTS tearoom_posts_actor ON tearoom_posts (actor, section, createdAt DESC);
    CREATE TABLE IF NOT EXISTS tearoom_answers (
      id TEXT PRIMARY KEY,
      postId TEXT NOT NULL REFERENCES tearoom_posts(id),
      createdAt INTEGER NOT NULL,
      body TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS tearoom_answers_post_date ON tearoom_answers (postId, createdAt);
    CREATE TABLE IF NOT EXISTS tearoom_reactions (
      postId TEXT NOT NULL REFERENCES tearoom_posts(id),
      actor TEXT NOT NULL,
      PRIMARY KEY (postId, actor)
    );
  `);
  if (seedScripts.length) {
    const initial = seedScripts.map(({ id, cat, title, body, author = '茶水间示例' }) => ({
      id: text(id, '示例话术编号', 64, true),
      data: fieldsFor('script', { action: 'script', cat, title, body }, text(author, '话术来源', 60, true))
    }));
    const insert = db.prepare("INSERT OR IGNORE INTO tearoom_posts (id, section, actor, createdAt, data) VALUES (?, 'scripts', 'starter', ?, ?)");
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const { id, data } of initial) insert.run(id, Date.now(), JSON.stringify(data));
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  function saveProfile(actor, name) {
    db.prepare('INSERT INTO tearoom_profiles (actor, name) VALUES (?, ?) ON CONFLICT(actor) DO UPDATE SET name = excluded.name').run(actor, name);
  }

  function cookie(name, value, seconds) {
    return `${name}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${seconds}${cookieSecure ? '; Secure' : ''}`;
  }

  function session(request) {
    const token = parseCookie(request, ACCESS_COOKIE);
    const active = token && sessions.get(token);
    if (active?.expires > Date.now()) {
      const profile = db.prepare('SELECT name FROM tearoom_profiles WHERE actor = ?').get(active.actor);
      if (profile) return { actor: active.actor, name: profile.name };
    }
    if (token) sessions.delete(token);
    return null;
  }

  function state({ actor, name }, canModerate, extra = {}) {
    const data = { scripts: [], cases: [], board: [], wall: [], help: [], suggest: [], market: [], favScripts: {}, favCases: {}, cheered: {}, canModerate, name, suggestedNames };
    const reactions = db.prepare(`
      SELECT postId, COUNT(*) AS total, MAX(actor = ?) AS mine
      FROM tearoom_reactions GROUP BY postId
    `).all(actor);
    const byPost = new Map(reactions.map(reaction => [reaction.postId, reaction]));
    const answers = db.prepare('SELECT postId, createdAt, body FROM tearoom_answers ORDER BY createdAt, rowid').all();
    const byQuestion = new Map();
    for (const answer of answers) {
      const group = byQuestion.get(answer.postId) || [];
      const message = JSON.parse(answer.body);
      group.push({ ...message, createdAt: answer.createdAt, time: formatter.format(answer.createdAt) });
      byQuestion.set(answer.postId, group);
    }
    const recentPosts = db.prepare('SELECT id, actor, createdAt, data FROM tearoom_posts WHERE section = ? AND actor <> ? ORDER BY createdAt DESC, rowid DESC LIMIT 150');
    const referenceScripts = db.prepare("SELECT id, actor, createdAt, data FROM tearoom_posts WHERE section = 'scripts' AND actor = 'starter' ORDER BY rowid");
    for (const section of Object.values(sections).filter(name => name !== 'suggest')) {
      const posts = recentPosts.all(section, 'starter');
      if (section === 'scripts') posts.push(...referenceScripts.all());
      for (const row of posts) {
        const item = { id: row.id, createdAt: row.createdAt, time: formatter.format(row.createdAt), ...JSON.parse(row.data) };
        const reaction = byPost.get(row.id);
        if (section === 'scripts' || section === 'cases') {
          item.fav = reaction?.total ?? 0;
          if (reaction?.mine) data[section === 'scripts' ? 'favScripts' : 'favCases'][row.id] = true;
        }
        if (section === 'board' || section === 'wall') {
          item.cheers = reaction?.total ?? 0;
          if (reaction?.mine) data.cheered[row.id] = true;
        }
        if (section === 'help') {
          item.mine = row.actor === actor;
          item.answers = byQuestion.get(row.id) || [];
        }
        data[section].push(item);
      }
    }
    const suggestions = db.prepare(`
      SELECT id, actor, createdAt, data FROM tearoom_posts
      WHERE section = 'suggest' AND (? = 1 OR actor = ? OR json_extract(data, '$.status') = '已回复')
      ORDER BY createdAt DESC, rowid DESC LIMIT 300
    `).all(Number(canModerate), actor);
    for (const row of suggestions) {
      const item = JSON.parse(row.data);
      const mine = row.actor === actor;
      const time = formatter.format(row.createdAt);
      if (mine || canModerate) data.suggest.push({ code: row.id, ...item, mine, time });
      else data.suggest.push({ status: item.status, reply: item.reply, mine: false, time });
    }
    return { ...data, ...extra };
  }

  function applyAction(input, { actor, name }, canModerate) {
    const action = text(input.action, '操作', 40, true);
    if (Object.hasOwn(sections, action)) {
      const record = fieldsFor(action, input, name);
      const id = action === 'suggest' ? 'JY-' + randomBytes(8).toString('hex').toUpperCase() : randomUUID();
      db.prepare('INSERT INTO tearoom_posts (id, section, actor, createdAt, data) VALUES (?, ?, ?, ?, ?)').run(id, sections[action], actor, Date.now(), JSON.stringify(record));
      return action === 'suggest' ? { submittedCode: id } : undefined;
    }

    const id = text(input.id ?? input.code, '编号', 60, true);
    const row = db.prepare('SELECT section, actor, createdAt, data FROM tearoom_posts WHERE id = ?').get(id);
    if (!row) throw new ApiError(404, '记录不存在');

    if (action === 'favorite' || action === 'cheer') {
      keys(input, ['action', 'id', 'active']);
      const eligible = action === 'favorite' ? ['scripts', 'cases'] : ['board', 'wall'];
      if (!eligible.includes(row.section)) throw new ApiError(404, '记录不存在');
      if (typeof input.active !== 'boolean') throw new ApiError(400, '操作状态无效');
      if (input.active) db.prepare('INSERT OR IGNORE INTO tearoom_reactions (postId, actor) VALUES (?, ?)').run(id, actor);
      else db.prepare('DELETE FROM tearoom_reactions WHERE postId = ? AND actor = ?').run(id, actor);
      return;
    }

    if (action === 'answer' || action === 'solve') {
      if (row.section !== 'help') throw new ApiError(404, '求助记录不存在');
      if (action === 'answer') {
        keys(input, ['action', 'id', 'body']);
        const message = text(input.body, '回答', 1500, true);
        db.prepare('INSERT INTO tearoom_answers (id, postId, createdAt, body) VALUES (?, ?, ?, ?)').run(randomUUID(), id, Date.now(), JSON.stringify({ who: name, body: message }));
        return;
      }
      keys(input, ['action', 'id']);
      if (row.actor !== actor) throw new ApiError(403, '请由发帖人标为已解决');
      const record = { ...JSON.parse(row.data), solved: true };
      db.prepare('UPDATE tearoom_posts SET data = ? WHERE id = ?').run(JSON.stringify(record), id);
      return;
    }

    if (action === 'suggestLookup' || action === 'suggestReply') {
      if (row.section !== 'suggest') throw new ApiError(404, '找不到此编号');
      const record = JSON.parse(row.data);
      if (action === 'suggestLookup') {
        keys(input, ['action', 'code']);
        return { trackedSuggestion: { code: id, status: record.status, reply: record.reply, time: formatter.format(row.createdAt), mine: row.actor === actor } };
      }
      keys(input, ['action', 'code', 'status', 'reply']);
      if (!canModerate) throw new ApiError(403, '请先登录管理账号');
      record.status = allowedValue(input.status, suggestionStates, '建议状态');
      record.reply = record.status === '已回复' ? text(input.reply, '回复', 1500, true) : '';
      db.prepare('UPDATE tearoom_posts SET data = ? WHERE id = ?').run(JSON.stringify(record), id);
      return;
    }
    throw new ApiError(400, '茶水间操作无效');
  }

  return async function handleTearoom({ path, request, response, send, body, getAdmin }) {
    if (path !== '/api/tearoom' && !path.startsWith('/api/tearoom/')) return false;
    const method = request.method;
    const canModerate = () => getAdmin?.() === true;

    if (path === '/api/tearoom/session' && method === 'POST') {
      const input = await body(request);
      keys(input, []);
      const activeProfile = session(request);
      if (activeProfile) {
        send(response, 200, state(activeProfile, canModerate()));
        return true;
      }
      for (const [token, active] of sessions) {
        if (active.expires <= Date.now()) sessions.delete(token);
      }
      const browser = parseCookie(request, BROWSER_COOKIE) || randomBytes(32).toString('base64url');
      const actor = createHash('sha256').update(browser).digest('hex');
      const existing = db.prepare('SELECT name FROM tearoom_profiles WHERE actor = ?').get(actor);
      const name = existing?.name ?? suggestedNames[randomInt(suggestedNames.length)];
      if (!existing) {
        const address = request.socket.remoteAddress || 'unknown';
        limit(profileCreations, address, PROFILE_LIMIT, PROFILE_WINDOW);
        saveProfile(actor, name);
      }
      const token = randomBytes(32).toString('base64url');
      sessions.set(token, { actor, expires: Date.now() + SESSION_SECONDS * 1000 });
      send(response, 200, state({ actor, name }, canModerate()), {
        'Set-Cookie': [cookie(ACCESS_COOKIE, token, SESSION_SECONDS), cookie(BROWSER_COOKIE, browser, BROWSER_SECONDS)]
      });
      return true;
    }

    const profile = session(request);
    if (!profile) throw new ApiError(401, '请刷新页面继续使用茶水间');
    if (path === '/api/tearoom' && method === 'GET') {
      send(response, 200, state(profile, canModerate()));
      return true;
    }
    if (path === '/api/tearoom/profile' && method === 'POST') {
      const input = await body(request);
      keys(input, ['name']);
      const name = text(input.name, '名字', 24, true);
      saveProfile(profile.actor, name);
      send(response, 200, state({ ...profile, name }, canModerate()));
      return true;
    }
    if (path === '/api/tearoom/logout' && method === 'POST') {
      await body(request);
      sessions.delete(parseCookie(request, ACCESS_COOKIE));
      send(response, 200, { ok: true }, { 'Set-Cookie': cookie(ACCESS_COOKIE, '', 0) });
      return true;
    }
    if (path === '/api/tearoom/actions' && method === 'POST') {
      const input = await body(request);
      const moderator = canModerate();
      limit(writeAttempts, profile.actor, WRITE_LIMIT, WRITE_WINDOW);
      const extra = applyAction(input, profile, moderator);
      send(response, 200, state(profile, moderator, extra));
      return true;
    }
    throw new ApiError(404, '茶水间接口不存在');
  };
}

