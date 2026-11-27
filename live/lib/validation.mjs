export class ApiError extends Error {
  constructor(status, message, details) { super(message); this.status = status; this.details = details; }
}

const fail = message => { throw new ApiError(400, message); };
export const moneyFields = ['target', 'orderAmount', 'received', 'refunds', 'cogs', 'adSpend', 'shipping', 'fees', 'otherCost'];
export const countFields = ['reach', 'views', 'viewers', 'impressions', 'peak', 'watchSeconds', 'interactions', 'reactions', 'comments', 'shares', 'linkClicks', 'newFollowers', 'messages', 'qualified', 'orders', 'paidOrders', 'refundOrders', 'units'];
const sessionFields = ['date', 'accountId', 'anchorId', 'start', 'end', 'endDayOffset', 'status', 'scheduleUnknown', 'actualMinutes', 'actualStart', 'actualEnd', ...moneyFields, ...countFields, 'notes'];
const inventoryFields = ['sku', 'name', 'size', 'supplier', 'purchaseDate', 'cost', 'askingPrice', 'state', 'sessionId', 'notes'];
const taskFields = ['title', 'sessionId', 'owner', 'due', 'status', 'evidence', 'action', 'acceptance'];

export function object(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('请求内容必须是对象');
  return value;
}
export function keys(value, allowed) {
  object(value);
  const extra = Object.keys(value).filter(key => !allowed.includes(key));
  if (extra.length) fail(`未知字段：${extra.join('、')}`);
}
export function text(value, label, max = 500, required = false) {
  if (typeof value !== 'string' || value.length > max || /\u0000/.test(value)) fail(`${label}格式无效或过长`);
  if (required && !value.trim()) fail(`请填写${label}`);
  return value.trim();
}
export function numeric(value, label, integer = false) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1e12 || (integer && !Number.isSafeInteger(value))) fail(`${label}须为非负${integer ? '整数' : '数字'}`);
  return integer ? value : Math.round(value * 100) / 100;
}
export function date(value, label = '日期') {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail(`${label}格式须为 YYYY-MM-DD`);
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value || value < '2000-01-01' || value > '2100-12-31') fail(`${label}无效`);
  return value;
}
function time(value, label) {
  if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) fail(`${label}格式须为 HH:mm`);
  return value;
}
function scheduledRange(item) {
  const day = Date.parse(item.date + 'T00:00:00Z') / 60000;
  const minutes = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  return { start: day + minutes(item.start), end: day + minutes(item.end) + (item.endDayOffset ?? 0) * 1440 };
}
function oneOf(value, values, label) {
  if (!values.includes(value)) fail(`${label}无效`);
  return value;
}
export function version(value) {
  if (!Number.isSafeInteger(value) || value < 1) fail('更新时须提供有效 version');
  return value;
}

export function sessionInput(input, existing, known) {
  keys(input, [...sessionFields, 'version']);
  const item = existing ? { ...existing } : Object.fromEntries([...moneyFields, ...countFields].map(key => [key, null]));
  if (!existing) Object.assign(item, { status: 'planned', notes: '', actualMinutes: null, actualStart: null, actualEnd: null });
  for (const key of sessionFields) {
    if (!Object.hasOwn(input, key)) continue;
    if (key === 'scheduleUnknown') {
      if (typeof input[key] !== 'boolean') fail('时段待补标记须为布尔值');
      item[key] = input[key];
    }
    else if (key === 'endDayOffset') item[key] = oneOf(input[key], [0, 1], '结束日期偏移');
    else if (key === 'actualStart' || key === 'actualEnd') item[key] = input[key] === null ? null : text(input[key], key, 16);
    else if (key === 'actualMinutes') item[key] = input[key] === null ? null : numeric(input[key], '实际直播时长');
    else if (moneyFields.includes(key)) item[key] = input[key] === null ? null : numeric(input[key], key);
    else if (countFields.includes(key)) item[key] = input[key] === null ? null : numeric(input[key], key, true);
    else item[key] = text(input[key], key, key === 'notes' ? 4000 : 160);
  }
  date(item.date);
  if (Object.hasOwn(input, 'actualStart') || Object.hasOwn(input, 'actualEnd')) {
    if (!Object.hasOwn(input, 'actualStart') || !Object.hasOwn(input, 'actualEnd')) fail('请同时登记实际开播与下播时间');
    if (item.actualStart === null && item.actualEnd === null) item.actualMinutes = null;
    else {
      if (!item.actualStart || !item.actualEnd) fail('请同时登记实际开播与下播时间');
      const parse = (value, label) => {
        if (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) fail(`${label}格式须为 YYYY-MM-DDTHH:mm`);
        date(value.slice(0, 10), label);
        return Date.parse(value + ':00+08:00');
      };
      const start = parse(item.actualStart, '实际开播时间');
      const end = parse(item.actualEnd, '实际下播时间');
      if (item.actualStart.slice(0, 10) !== item.date) fail('实际开播日期须与场次归属日期一致');
      const minutes = Math.round((end - start) / 60000);
      if (minutes <= 0 || minutes > 1440) fail('实际下播须晚于开播，单场时长最长 24 小时');
      item.actualMinutes = minutes;
    }
  }
  time(item.start, '开始时间'); time(item.end, '结束时间');
  if (!item.scheduleUnknown) {
    const range = scheduledRange(item);
    if (range.end <= range.start || range.end - range.start > 1440) fail('结束时间须晚于开始时间，单场排期最长 24 小时');
  }
  if (!known.accounts.some(account => account.id === item.accountId)) fail('请选择有效账号');
  if (!known.anchors.some(anchor => anchor.id === item.anchorId)) fail('请选择有效主播');
  oneOf(item.status, ['planned', 'live', 'completed'], '场次状态');
  const exceeds = (left, right) => Number.isFinite(item[left]) && Number.isFinite(item[right]) && item[left] > item[right];
  if (exceeds('qualified', 'messages')) fail('有效询单数不可大于私信人数');
  if (exceeds('paidOrders', 'orders')) fail('付款订单数不可大于确认订单数');
  if (exceeds('refundOrders', 'paidOrders')) fail('退款订单数不可大于付款订单数');
  if (exceeds('refunds', 'received')) fail('累计退款不可大于本场累计回款，请归属原销售场次');
  if (exceeds('received', 'orderAmount')) fail('累计回款不可大于确认成交额');
  if (exceeds('peak', 'viewers')) fail('峰值在线不可大于本场观看人数');
  return item;
}

export function inventoryInput(input, existing, sessions) {
  keys(input, [...inventoryFields, 'version']);
  if (!existing && !Object.hasOwn(input, 'cost')) fail('请填写现金采购成本');
  const item = existing ? { ...existing } : { cost: 0, askingPrice: 0, state: 'in_stock', sessionId: '', notes: '', size: '', supplier: '' };
  for (const key of inventoryFields) {
    if (!Object.hasOwn(input, key)) continue;
    item[key] = ['cost', 'askingPrice'].includes(key) ? numeric(input[key], key) : text(input[key], key, key === 'notes' ? 4000 : 200);
  }
  text(item.sku, '货号', 80, true); text(item.name, '货品名称', 200, true);
  date(item.purchaseDate, '采购日期');
  oneOf(item.state, ['in_stock', 'reserved', 'sold', 'returned'], '库存状态');
  if (item.sessionId && !sessions.some(session => session.id === item.sessionId)) fail('关联场次不存在');
  return item;
}

export function taskInput(input, existing, sessions) {
  keys(input, [...taskFields, 'version']);
  const item = existing ? { ...existing } : { sessionId: '', owner: '', status: 'open', evidence: '', action: '', acceptance: '' };
  for (const key of taskFields) if (Object.hasOwn(input, key)) item[key] = text(input[key], key, ['evidence', 'action', 'acceptance'].includes(key) ? 4000 : 240);
  text(item.title, '复盘任务标题', 240, true); text(item.owner, '责任人', 100, true);
  date(item.due, '截止日期');
  oneOf(item.status, ['open', 'doing', 'done'], '任务状态');
  if (item.sessionId && !sessions.some(session => session.id === item.sessionId)) fail('关联场次不存在');
  return item;
}

export function conflict(item, sessions) {
  if (item.scheduleUnknown || item.cancelled) return;
  const range = scheduledRange(item);
  const collision = sessions.find(other => {
    if (other.cancelled || other.scheduleUnknown || other.id === item.id ||
      (other.accountId !== item.accountId && other.anchorId !== item.anchorId)) return false;
    const otherRange = scheduledRange(other);
    return otherRange.start < range.end && range.start < otherRange.end;
  });
  if (collision) throw new ApiError(409, collision.accountId === item.accountId ? '该账号在此时段已有排期' : '该主播在此时段已有排期', { conflictId: collision.id });
}
