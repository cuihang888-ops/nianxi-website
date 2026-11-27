import { randomUUID } from 'node:crypto';
import { chinaDate } from './seed.mjs';
import { ApiError, keys, object, text } from './validation.mjs';

export const SUGGESTION_STATES = ['已收到', '处理中', '已调整', '已回复'];
export const COORDINATE_STATES = ['已收到', '协调中', '已解决'];
export const HONOR_TYPES = { month: '月度之星', week: '本周之星', yesterday: '昨日之星' };
export const SUGGESTION_SLA_MS = 48 * 60 * 60 * 1000;

const formatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});

// 建议的待处理/逾期口径：状态未到「已调整/已回复」即待处理；
// 自提交起超过 48 小时仍待处理即逾期，需要管理层给出调整动作或处理进展。
export function suggestionTiming(record, createdAt, nowMs) {
  const pending = ['已收到', '处理中'].includes(record.status);
  const elapsedMs = Math.max(0, nowMs - createdAt);
  return {
    pending,
    overdue: pending && elapsedMs > SUGGESTION_SLA_MS,
    remainingMs: pending ? SUGGESTION_SLA_MS - elapsedMs : null
  };
}

function isoWeekKey(dateText) {
  const parsed = new Date(`${dateText}T12:00:00Z`);
  const day = (parsed.getUTCDay() + 6) % 7;
  parsed.setUTCDate(parsed.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(parsed.getUTCFullYear(), 0, 4));
  const firstDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 3);
  const week = 1 + Math.round((parsed - firstThursday) / (7 * 86400000));
  return `${parsed.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function honorPeriodKey(periodType, today = chinaDate()) {
  if (periodType === 'month') return today.slice(0, 7);
  if (periodType === 'week') return isoWeekKey(today);
  if (periodType === 'yesterday') {
    const parsed = new Date(`${today}T12:00:00Z`);
    parsed.setUTCDate(parsed.getUTCDate() - 1);
    return parsed.toISOString().slice(0, 10);
  }
  throw new ApiError(400, '荣誉周期无效');
}

export function createFeedback({ store, now = () => new Date() }) {
  const { db } = store;
  db.exec(`
    CREATE TABLE IF NOT EXISTS honors (
      id TEXT PRIMARY KEY,
      periodType TEXT NOT NULL CHECK (periodType IN ('month', 'week', 'yesterday')),
      periodKey TEXT NOT NULL,
      personName TEXT NOT NULL,
      citation TEXT NOT NULL,
      photoUrl TEXT,
      publishedBy TEXT NOT NULL,
      publishedAt INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS honors_period ON honors (periodType, publishedAt DESC);
  `);

  const rowsOf = section => db.prepare(
    'SELECT id, actor, createdAt, data FROM tearoom_posts WHERE section = ? ORDER BY createdAt DESC, rowid DESC'
  ).all(section);
  const parse = row => { try { return JSON.parse(row.data); } catch { return {}; } };

  function dashboardFeedback() {
    const nowMs = now().getTime();
    const suggestions = rowsOf('suggest').map(row => {
      const record = parse(row);
      return {
        code: row.id,
        body: record.body ?? '',
        status: record.status ?? '已收到',
        reply: record.reply ?? '',
        anonymous: record.anonymous !== false,
        authorName: record.anonymous === false ? (record.authorName ?? '') : null,
        createdAt: row.createdAt,
        time: formatter.format(row.createdAt),
        ...suggestionTiming(record, row.createdAt, nowMs)
      };
    });
    const vents = rowsOf('vents').map(row => {
      const record = parse(row);
      return {
        id: row.id, body: record.body ?? '', who: record.who ?? '匿名同事',
        createdAt: row.createdAt, time: formatter.format(row.createdAt),
        hidden: record.hidden === true
      };
    });
    const coordinates = rowsOf('coordinates').map(row => {
      const record = parse(row);
      return {
        id: row.id, title: record.title ?? '', body: record.body ?? '',
        who: record.who ?? '', status: record.status ?? '已收到',
        createdAt: row.createdAt, time: formatter.format(row.createdAt)
      };
    });
    const weekAgo = nowMs - 7 * 86400000;
    return {
      suggestions, vents, coordinates,
      counts: {
        suggestionsPending: suggestions.filter(item => item.pending).length,
        suggestionsOverdue: suggestions.filter(item => item.overdue).length,
        coordinatesOpen: coordinates.filter(item => item.status !== '已解决').length,
        ventsLast7Days: vents.filter(item => !item.hidden && item.createdAt >= weekAgo).length
      }
    };
  }

  function updatePost(id, section, mutate) {
    const row = db.prepare('SELECT data FROM tearoom_posts WHERE id = ? AND section = ?').get(id, section);
    if (!row) throw new ApiError(404, '记录不存在');
    const record = parse(row);
    mutate(record);
    db.prepare('UPDATE tearoom_posts SET data = ? WHERE id = ?').run(JSON.stringify(record), id);
  }

  function updateSuggestion(code, input) {
    object(input);
    keys(input, ['status', 'reply']);
    if (!SUGGESTION_STATES.includes(input.status)) throw new ApiError(400, '建议状态无效');
    const reply = input.reply === undefined ? undefined : text(input.reply, '处理进展', 1500);
    if (['已调整', '已回复'].includes(input.status) && !reply) {
      throw new ApiError(400, input.status === '已调整' ? '标记已调整时请填写调整动作' : '标记已回复时请填写回复内容');
    }
    updatePost(code, 'suggest', record => {
      record.status = input.status;
      if (reply !== undefined) record.reply = reply;
      record.handledAt = now().getTime();
    });
    return dashboardFeedback();
  }

  function setVentHidden(id, input) {
    object(input);
    keys(input, ['hidden']);
    if (typeof input.hidden !== 'boolean') throw new ApiError(400, '显示状态无效');
    updatePost(id, 'vents', record => { record.hidden = input.hidden; });
    return dashboardFeedback();
  }

  function updateCoordinate(id, input) {
    object(input);
    keys(input, ['status']);
    if (!COORDINATE_STATES.includes(input.status)) throw new ApiError(400, '协调状态无效');
    updatePost(id, 'coordinates', record => { record.status = input.status; });
    return dashboardFeedback();
  }

  const publicHonor = row => ({
    id: row.id,
    periodType: row.periodType,
    periodLabel: HONOR_TYPES[row.periodType],
    periodKey: row.periodKey,
    personName: row.personName,
    citation: row.citation,
    photoUrl: row.photoUrl,
    publishedAt: row.publishedAt,
    time: formatter.format(row.publishedAt)
  });

  function listHonors() {
    return db.prepare('SELECT * FROM honors ORDER BY publishedAt DESC, rowid DESC').all().map(publicHonor);
  }

  function publishHonor(input, actorName) {
    object(input);
    keys(input, ['periodType', 'personName', 'citation', 'photoUrl']);
    if (!Object.hasOwn(HONOR_TYPES, input.periodType ?? '')) throw new ApiError(400, '荣誉周期无效');
    const personName = text(input.personName, '获奖人', 40, true);
    const citation = text(input.citation, '颁奖词', 200, true);
    let photoUrl = null;
    if (input.photoUrl !== undefined && input.photoUrl !== null && input.photoUrl !== '') {
      photoUrl = text(input.photoUrl, '照片地址', 500, true);
      if (!/^(https?:\/\/|\/|\.\/)/.test(photoUrl)) throw new ApiError(400, '照片地址无效');
    }
    const honor = {
      id: randomUUID(), periodType: input.periodType, periodKey: honorPeriodKey(input.periodType),
      personName, citation, photoUrl, publishedBy: actorName || '管理层', publishedAt: now().getTime()
    };
    db.prepare(`INSERT INTO honors (id, periodType, periodKey, personName, citation, photoUrl, publishedBy, publishedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      honor.id, honor.periodType, honor.periodKey, honor.personName,
      honor.citation, honor.photoUrl, honor.publishedBy, honor.publishedAt);
    return publicHonor(honor);
  }

  // 员工端荣誉墙：每类最新一条为「当前之星」，其余按时间留档回看。
  // 返回字段只有姓名、称号、颁奖词、照片与发布时间，不含任何业绩数字。
  function honorsForTearoom() {
    const all = listHonors();
    const current = {};
    for (const type of Object.keys(HONOR_TYPES)) {
      current[type] = all.find(item => item.periodType === type) ?? null;
    }
    return { current, history: all };
  }

  // 茶水间首页「最新动态」：轻量聚合，只返回最近约 20 条的动作描述，
  // 不带任何帖子正文。隐私口径：
  // - 协调事项（coordinates）绝不进动态，连计数都不出现；
  // - 建议只报「有同事提交了一条新建议」，不带正文、身份与编号；
  // - 吐槽只报「有同事发表了心声」，不带正文与身份；
  // - 已下架的吐槽不进动态。
  function activityFeed(limit = 20) {
    const items = [];
    const push = (kind, actorName, text, createdAt, view) => items.push({ kind, actorName, text, createdAt, view });
    const recent = db.prepare(`
      SELECT id, section, createdAt, data FROM tearoom_posts
      WHERE section IN ('market', 'board', 'wall', 'gratitude', 'help', 'cases', 'suggest', 'vents')
      ORDER BY createdAt DESC, rowid DESC LIMIT 120
    `).all();
    for (const row of recent) {
      const record = parse(row);
      if (row.section === 'market') {
        push('market', record.contact ?? null, `发起了「${record.type ?? '集市'}」${record.title ? '：' + record.title : ''}`, row.createdAt, 'market');
      } else if (row.section === 'board') {
        push('board', record.who ?? null, '在留言板发了一条留言', row.createdAt, 'board');
      } else if (row.section === 'wall') {
        push('wall', record.who ?? null, '在励志墙贴了一句打气的话', row.createdAt, 'wall');
      } else if (row.section === 'gratitude') {
        push('gratitude', record.from ?? null, `向 ${record.recipient ?? '同事'} 表达了感谢`, row.createdAt, 'gratitude');
      } else if (row.section === 'help') {
        push('help', record.who ?? null, `发起了求助${record.title ? '：' + record.title : ''}`, row.createdAt, 'help');
      } else if (row.section === 'cases') {
        push('case', record.author ?? null, '分享了一个优秀案例', row.createdAt, 'cases');
      } else if (row.section === 'suggest') {
        push('suggest', null, '有同事提交了一条新建议', row.createdAt, 'suggest');
      } else if (row.section === 'vents') {
        if (record.hidden === true) continue;
        push('vent', null, '有同事在吐槽墙发表了心声', row.createdAt, 'vents');
      }
    }
    const wishes = db.prepare('SELECT name, kind, createdAt FROM tearoom_wishes ORDER BY createdAt DESC, rowid DESC LIMIT 20').all();
    for (const wish of wishes) {
      push('wish', wish.name, wish.kind === 'year' ? '发布了今年的心愿' : '发布了今日小愿望', wish.createdAt, 'wishes');
    }
    for (const honor of listHonors().slice(0, 10)) {
      push('honor', null, `荣誉墙更新：${honor.periodLabel}是 ${honor.personName}`, honor.publishedAt, 'honors');
    }
    items.sort((a, b) => b.createdAt - a.createdAt);
    return { items: items.slice(0, Math.max(1, Math.min(50, limit))) };
  }

  return { dashboardFeedback, updateSuggestion, setVentHidden, updateCoordinate, listHonors, publishHonor, honorsForTearoom, activityFeed };
}
