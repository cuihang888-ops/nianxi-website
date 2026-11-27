const app = document.querySelector('#entry-app');
const dialog = document.querySelector('#entry-editor');
const toastElement = document.querySelector('#entry-toast');
const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const state = { date: today, accountId: '', directory: null, editing: null, busy: false, completeness: null };
const definitions = {
  orderAmount: ['业绩（元）', ''],
  orders: ['单量', '单'],
  impressions: ['浏览量', '次'],
  shares: ['分享次数', '次'],
  newFollowers: ['关注数', '人']
};
const rawKeys = [...Object.keys(definitions), 'durationHours', 'durationMinutes'];
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
// Lucide icon paths. Copyright (c) 2026 Lucide Icons and Contributors.
// See the ISC license at public/vendor/LUCIDE-LICENSE.txt.
const entryIcons = {
  check: '<path d="M20 6 9 17l-5-5"/>',
  'chevron-left': '<path d="m15 18-6-6 6-6"/>',
  'chevron-right': '<path d="m9 18 6-6-6-6"/>',
  'notebook-pen': `
    <path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4"/>
    <path d="M2 6h4"/>
    <path d="M2 10h4"/>
    <path d="M2 14h4"/>
    <path d="M2 18h4"/>
    <path d="M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z"/>`,
  'refresh-cw': `
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
    <path d="M21 3v5h-5"/>
    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
    <path d="M8 16H3v5"/>`,
  'shield-check': `
    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>
    <path d="m9 12 2 2 4-4"/>`,
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'
};
const icon = name => `<svg xmlns="http://www.w3.org/2000/svg" class="lucide lucide-${name}" width="24" height="24"
  viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
  stroke-linejoin="round" aria-hidden="true">${entryIcons[name]}</svg>`;
const activeOnDate = anchor => (!anchor.activeFrom || anchor.activeFrom <= state.date) && (!anchor.activeTo || anchor.activeTo >= state.date);
const numberPattern = /^\d+$/;
const amountPattern = /^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/;
const draftPrefix = 'cooperation-trial-entry:' + location.pathname + ':';
const draftKey = (anchor, date) => draftPrefix + JSON.stringify([date, anchor.accountId, anchor.slotId, anchor.id]);

async function api(path, data) {
  const headers = new Headers({ 'X-Command-Scope': 'public-entry' });
  if (data !== undefined) headers.set('Content-Type', 'application/json');
  const response = await fetch(new URL(path, document.baseURI), {
    method: data === undefined ? 'GET' : 'POST', credentials: 'same-origin', headers,
    body: data === undefined ? undefined : JSON.stringify(data)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error || result.message || '暂时无法连接，请稍后重试');
    error.status = response.status;
    error.code = result.code;
    throw error;
  }
  return result;
}

function readDraft(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return Object.fromEntries(rawKeys.map(field => [field, typeof value?.[field] === 'string' ? value[field].slice(0, 24) : '']));
  } catch {
    return {};
  }
}

function hasDraft(raw) {
  return rawKeys.some(key => raw[key]?.trim());
}

function persistDraft(form) {
  const editing = state.editing;
  const raw = readRawFields(form);
  const notice = form.querySelector('.draft-notice');
  try {
    if (hasDraft(raw)) localStorage.setItem(editing.key, JSON.stringify(raw));
    else localStorage.removeItem(editing.key);
    editing.draftUnavailable = false;
    notice.textContent = hasDraft(raw) ? '草稿已保存在本浏览器' : '填写时自动保存草稿';
  } catch {
    editing.draftUnavailable = hasDraft(raw);
    notice.textContent = '浏览器无法保存草稿，请在关闭前提交。';
  }
}

function toast(message) {
  toastElement.textContent = message;
  toastElement.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => {
    toastElement.classList.remove('show');
    toastElement.textContent = '';
  }, 3800);
}

function header() {
  return `<header class="entry-header">
    <div class="entry-brand"><span class="brand-mark">${icon('notebook-pen')}</span><div><h1>数据录入</h1><p>直播场次登记</p></div></div>
  </header>`;
}

function showLoadError(message) {
  app.innerHTML = `${header()}<main class="entry-main">
    <div class="entry-error" role="alert"><p>${esc(message)}</p><button type="button" data-action="refresh">重试</button></div>
  </main>`;
}

async function loadDirectory() {
  const { accounts, anchors } = await api('api/entry/bootstrap');
  state.directory = { accounts, anchors };
  if (!accounts.some(account => account.id === state.accountId)) state.accountId = accounts[0]?.id || '';
  renderPage();
}

function renderPage() {
  const { accounts, anchors } = state.directory;
  const account = accounts.find(item => item.id === state.accountId);
  const available = anchors.filter(anchor => anchor.accountId === state.accountId && activeOnDate(anchor));
  app.innerHTML = `${header()}<main class="entry-main">
    <div class="entry-notice">${icon('shield-check')}<span>提交后如需更正，请联系负责人。</span></div>
    <div class="entry-controls">
      <div class="date-navigation">
        <button type="button" class="icon-button" data-action="previous-date" aria-label="前一天" title="前一天">${icon('chevron-left')}</button>
        <input type="date" id="entry-date" data-testid="entry-date" value="${esc(state.date)}" min="2000-01-01" max="2100-12-31" aria-label="录入日期">
        <button type="button" class="icon-button" data-action="next-date" aria-label="后一天" title="后一天">${icon('chevron-right')}</button>
      </div>
      <button type="button" data-action="today" class="today-button">今天</button>
      <button type="button" data-action="refresh" class="icon-button refresh-button" title="刷新场次名单" aria-label="刷新场次名单">${icon('refresh-cw')}</button>
    </div>
    <section class="entry-reminder" id="entry-reminder" aria-label="录入提醒"></section>
    <nav class="account-tabs" aria-label="直播间">${accounts.map(item => `<button type="button" aria-pressed="${item.id === state.accountId}" data-account-id="${esc(item.id)}">${esc(item.name)}</button>`).join('')}</nav>
    <div class="entry-list-heading"><h2>${esc(account?.name || '直播间')} · 场次</h2><span>${esc(state.date)}</span></div>
    ${available.length ? `<div class="entry-cards">${available.map(anchor => `
      <button type="button" class="entry-session-card" data-testid="entry-session-card" data-anchor-id="${esc(anchor.id)}">
        <span class="card-top">
          <span class="slot-caption">${esc(anchor.slotLabel || '直播场次')}</span>
          <span class="card-badges"><span class="comp-badge" data-comp-badge="${esc(anchor.id)}" hidden></span>${hasDraft(readDraft(draftKey(anchor, state.date))) ? '<span class="card-status draft-badge">本机草稿</span>' : ''}</span>
        </span>
        <span class="card-body"><strong>${esc(anchor.name)}</strong><span class="card-arrow">${icon('chevron-right')}</span></span>
      </button>`).join('')}</div>` : '<div class="entry-empty">该日期暂无适用的主播场次</div>'}
  </main>`;
  loadCompleteness();
}

const completenessStatusText = session => session.status === 'complete' ? '已录齐'
  : session.status === 'stopped' ? '停播/取消 · 不计缺项'
  : session.status === 'empty' ? '未录入 · 缺 ' + session.missing.join('、')
  : '待补 · 缺 ' + session.missing.join('、');

// 缺项名称与录入字段的对应（与服务端 completeness 口径一致），编辑器内标示缺项字段时用。
const missingKeyByLabel = { '业绩': 'orderAmount', '单量': 'orders', '直播时长': 'actualMinutes', '浏览量': 'impressions', '分享次数': 'shares', '关注数': 'newFollowers' };
const dateLabelFor = value => value === today ? '今日' : value;

function findSession(comp, accountId, anchorId) {
  return comp?.accounts.find(group => group.accountId === accountId)
    ?.sessions.find(session => session.anchorId === anchorId) ?? null;
}

async function fetchCompleteness(targetDate) {
  const result = await api('api/entry/completeness?date=' + encodeURIComponent(targetDate));
  if (result.date === targetDate) state.completeness = result;
  return result;
}

// 编辑器与提交回执共用：优先用已缓存的当日状态，没有就现取一次。
async function ensureCompleteness() {
  if (state.completeness?.date === state.date) return state.completeness;
  try { return await fetchCompleteness(state.date); } catch { return null; }
}

// 录入提醒只显示状态与缺项名称，不显示任何往期数字。
// 页面顶部汇总条 + 按直播间分组的待补清单 + 场次卡片状态标，三处共用同一份状态数据。
async function loadCompleteness() {
  const section = document.querySelector('#entry-reminder');
  if (!section) return;
  const targetDate = state.date;
  try {
    const result = await fetchCompleteness(targetDate);
    if (state.date !== targetDate || !document.querySelector('#entry-reminder')) return;
    renderReminder(result);
    applyCardBadges(result);
  } catch {
    if (state.date !== targetDate || !document.querySelector('#entry-reminder')) return;
    section.innerHTML = '<p class="reminder-error">暂时无法读取录入状态，录入与提交不受影响。</p>';
  }
}

function renderReminder(result) {
  const section = document.querySelector('#entry-reminder');
  if (!section) return;
  const { summary } = result;
  const unfinished = summary.partial + summary.empty;
  const label = dateLabelFor(result.date);
  let bar;
  if (summary.expected === 0) {
    bar = `<div class="reminder-bar is-done" role="status">${icon('check')}<span><strong>${esc(label)}没有需要录入的场次</strong></span></div>`;
  } else if (unfinished === 0) {
    bar = `<div class="reminder-bar is-done" role="status">${icon('check')}<span><strong>${esc(label)}已全部录完</strong>（共 ${summary.expected} 场${summary.stopped ? '，含停播/取消 ' + summary.stopped + ' 场，不计缺项' : ''}）</span></div>`;
  } else {
    const parts = [];
    if (summary.empty) parts.push(summary.empty + ' 场未录');
    if (summary.partial) parts.push(summary.partial + ' 场缺项');
    bar = `<div class="reminder-bar is-warning" role="alert">${icon('notebook-pen')}<span><strong>${esc(label)}还有 ${unfinished} 场待补</strong>：${esc(parts.join('、'))}，点下方任意一场可直接补录。</span></div>`;
  }
  const groups = result.accounts.map(group => {
    const pending = group.sessions.filter(session => session.status === 'empty' || session.status === 'partial');
    if (!pending.length) return '';
    return `<div class="completeness-group"><h3>${esc(group.accountName)} · 待补 ${pending.length} 场</h3>
      ${pending.map(session => `<button type="button" class="completeness-row" data-comp-account="${esc(group.accountId)}" data-comp-anchor="${esc(session.anchorId || '')}" ${session.anchorId ? '' : 'disabled'}>
        <span class="completeness-who"><strong>${esc(session.anchorName)}</strong><em>${esc(session.slotLabel)}</em></span>
        <span class="completeness-status is-${esc(session.status)}">${esc(completenessStatusText(session))}</span>
      </button>`).join('')}</div>`;
  }).join('');
  section.innerHTML = bar + (groups ? `<div class="reminder-list">${groups}</div>` : '');
}

// 场次卡片本身带状态标，不用滚到别处才知道哪场没录齐。
function applyCardBadges(result) {
  const group = result.accounts.find(item => item.accountId === state.accountId);
  for (const badge of app.querySelectorAll('[data-comp-badge]')) {
    const session = group?.sessions.find(item => item.anchorId === badge.dataset.compBadge);
    if (!session) { badge.hidden = true; continue; }
    badge.hidden = false;
    badge.className = 'comp-badge is-' + session.status;
    badge.textContent = session.status === 'complete' ? '已完整'
      : session.status === 'stopped' ? '停播'
      : session.status === 'empty' ? '未录入'
      : '缺：' + session.missing.join('、');
    badge.title = completenessStatusText(session);
  }
}

function metricInput(key, draft) {
  const [label, unit] = definitions[key];
  return `<label data-field="${key}"><span class="field-label"><span>${label}</span>${unit ? `<em>${unit}</em>` : ''}</span>
    <input name="${key}" type="text" inputmode="${key === 'orderAmount' ? 'decimal' : 'numeric'}" maxlength="24" value="${esc(draft[key])}" autocomplete="off">
  </label>`;
}

function durationInputs(draft) {
  return `<fieldset class="duration-field" data-field="actualMinutes">
    <legend>时长</legend>
    <div class="duration-inputs">
      <label><input name="durationHours" type="text" inputmode="numeric" maxlength="2" value="${esc(draft.durationHours)}" autocomplete="off" aria-label="时长小时"><span>小时</span></label>
      <label><input name="durationMinutes" type="text" inputmode="numeric" maxlength="2" value="${esc(draft.durationMinutes)}" autocomplete="off" aria-label="时长分钟"><span>分钟</span></label>
    </div>
  </fieldset>`;
}

function openEditor(anchorId) {
  const { accounts, anchors } = state.directory;
  const anchor = anchors.find(item => item.id === anchorId && activeOnDate(item) && item.accountId === state.accountId);
  if (!anchor) return;
  const account = accounts.find(item => item.id === anchor.accountId);
  const key = draftKey(anchor, state.date);
  const draft = readDraft(key);
  state.editing = { anchor, date: state.date, key, draftUnavailable: false };
  dialog.innerHTML = `<form id="entry-form" data-testid="entry-form">
    <div class="editor-header">
      <div><h2 id="entry-editor-title">${esc(anchor.name)} · 场次登记</h2><p>${esc(account?.name)} · ${esc(state.date)} · ${esc(anchor.slotLabel || '直播场次')}</p></div>
      <div class="cooperation-dialog-actions">
        <a class="cooperation-dialog-link" href="./" data-action="return-home">返回协作中心</a>
        <button type="button" class="icon-button editor-close" data-action="close-editor" aria-label="关闭" autofocus>${icon('x')}</button>
      </div>
    </div>
    <div class="entry-form-body">
      <div class="editor-hint" id="editor-hint" hidden></div>
      <fieldset class="field-grid simple-entry" aria-label="场次指标">
        ${metricInput('orderAmount', draft)}
        ${metricInput('orders', draft)}
        ${durationInputs(draft)}
        ${metricInput('impressions', draft)}
        ${metricInput('shares', draft)}
        ${metricInput('newFollowers', draft)}
      </fieldset>
      <p class="form-notice">浏览量填写平台曝光总数。待补指标可留空，已确认没有的指标请填 0。</p>
      <p class="draft-notice" role="status">${hasDraft(draft) ? '已恢复本浏览器中的草稿' : '填写时自动保存草稿'}</p>
      <p id="entry-form-error" class="form-error" role="alert" tabindex="-1"></p>
      <div class="confirmation-panel" hidden>
        <p id="amount-confirmation-label" role="alert"></p>
        <button type="button" data-action="check-amount">返回检查</button>
        <button type="button" class="primary" data-action="confirm-amount" aria-describedby="amount-confirmation-label">确认提交</button>
      </div>
    </div>
    <div class="editor-actions">
      <button type="button" data-action="close-editor">关闭</button>
      <button type="submit" class="primary" data-testid="entry-submit">${icon('check')}提交登记</button>
    </div>
  </form>`;
  if (!dialog.open) dialog.showModal();
  applyEditorHints(anchor, draft);
  void ensureCompleteness().then(comp => {
    if (comp && state.editing?.anchor.id === anchor.id && dialog.open) applyEditorHints(anchor, draft, comp);
  });
}

// 编辑器内提示：打开场次先说清本场还缺哪几项，缺项字段直接标出来（已录齐/停播也给明确状态）。
// 只显示状态与缺项名，不显示已录数值；不改变既有填写与校验逻辑。
function applyEditorHints(anchor, draft, comp = state.completeness) {
  const hint = dialog.querySelector('#editor-hint');
  if (!hint) return;
  const session = findSession(comp, anchor.accountId, anchor.id);
  if (!session) { hint.hidden = true; return; }
  hint.hidden = false;
  if (session.status === 'complete') {
    hint.className = 'editor-hint is-complete';
    hint.textContent = '本场六项已全部录入，无需重复提交；如需更正数值，请联系负责人。';
  } else if (session.status === 'stopped') {
    hint.className = 'editor-hint is-stopped';
    hint.textContent = '本场为停播/取消场次，按口径不计缺项，一般无需录入。';
  } else {
    hint.className = 'editor-hint is-missing';
    hint.textContent = '本场还缺：' + session.missing.join('、') + '。已录入的项不用重填，只补缺项即可；确认没有的指标请填 0。';
  }
  const missingKeys = new Set(session.missing.map(label => missingKeyByLabel[label]).filter(Boolean));
  for (const wrapper of dialog.querySelectorAll('[data-field]')) {
    const key = wrapper.dataset.field;
    const tagHost = wrapper.querySelector('.field-label') ?? wrapper.querySelector('legend');
    wrapper.classList.remove('field-missing', 'field-draft');
    tagHost?.querySelector('.field-tag')?.remove();
    if (!missingKeys.has(key)) continue;
    const draftValue = key === 'actualMinutes' ? (draft.durationHours || draft.durationMinutes) : draft[key];
    const tag = document.createElement('span');
    if (draftValue) {
      wrapper.classList.add('field-draft');
      tag.className = 'field-tag is-draft';
      tag.textContent = '草稿待提交';
    } else {
      wrapper.classList.add('field-missing');
      tag.className = 'field-tag is-missing';
      tag.textContent = '未录';
    }
    tagHost?.append(tag);
  }
}

function readRawFields(form) {
  return Object.fromEntries(rawKeys.map(key => [key, form.elements.namedItem(key).value]));
}

function closeEditor() {
  if (state.busy) return false;
  if (!state.editing) { dialog.close(); renderPage(); return true; }
  if (state.editing.draftUnavailable && !window.confirm('浏览器无法保存草稿。确定关闭并放弃填写内容？')) return false;
  const anchorId = state.editing.anchor.id;
  dialog.close();
  state.editing = null;
  renderPage();
  Array.from(app.querySelectorAll('[data-anchor-id]')).find(card => card.dataset.anchorId === anchorId)?.focus();
  return true;
}

function buildPayload(form) {
  const raw = readRawFields(form);
  const payload = {};
  const invalid = (message, key) => {
    const error = new Error(message);
    error.field = key;
    throw error;
  };
  for (const [key, [label]] of Object.entries(definitions)) {
    const value = raw[key].trim();
    if (!value) continue;
    const amount = key === 'orderAmount';
    const pattern = amount ? amountPattern : numberPattern;
    if (!pattern.test(value) || Number(value) > 1e12) {
      invalid(amount ? '业绩请填写非负金额，最多两位小数。' : label + '请填写有效的非负整数。', key);
    }
    payload[key] = Number(value);
  }
  const [hours, minutes] = [raw.durationHours.trim(), raw.durationMinutes.trim()];
  if (hours || minutes) {
    if ((hours && !numberPattern.test(hours)) || (minutes && !numberPattern.test(minutes)) || Number(minutes) > 59 || Number(hours) * 60 + Number(minutes) > 1440) {
      invalid('请填写整数时长。分钟须为 0 至 59，单场最长 24 小时。', 'durationHours');
    }
    payload.actualMinutes = Number(hours) * 60 + Number(minutes);
  }
  if (Object.keys(payload).length === 0) invalid('请至少填写一项指标。');
  return payload;
}

function showFormError(form, message, field) {
  const errorElement = form.querySelector('.form-error');
  errorElement.textContent = message;
  const input = field && form.elements.namedItem(field);
  if (input) {
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', 'entry-form-error');
    input.focus();
  } else errorElement.focus();
}

function setBusy(form, busy) {
  state.busy = busy;
  const button = form.querySelector('[data-testid="entry-submit"]');
  for (const control of form.querySelectorAll('button, input')) control.disabled = busy;
  button.innerHTML = busy ? '正在提交…' : icon('check') + '提交登记';
}

async function submitEntry(form, confirmAmount = false) {
  if (state.busy || !state.editing) return;
  const panel = form.querySelector('.confirmation-panel');
  if (!panel.hidden && !confirmAmount) return;
  panel.hidden = true;
  form.querySelector('.form-error').textContent = '';
  let metrics;
  try {
    metrics = buildPayload(form);
  } catch (error) {
    showFormError(form, error.message, error.field);
    return;
  }
  const { date, anchor, key } = state.editing;
  const submittedDraft = JSON.stringify(readRawFields(form));
  setBusy(form, true);
  try {
    const result = await api('api/entry/sessions', {
      date, accountId: anchor.accountId, anchorId: anchor.id, ...metrics,
      ...(confirmAmount ? { confirmAmount: true } : {})
    });
    if (result.ok !== true) throw new Error('未收到提交回执，请联系负责人核对。');
    try {
      // A second tab may have written a newer local draft while the request was running.
      if (JSON.stringify(readDraft(key)) === submittedDraft) localStorage.removeItem(key);
    } catch {}
    state.editing.draftUnavailable = false;
    setBusy(form, false);
    state.editing = null;
    await showReceipt(anchor, date);
  } catch (error) {
    setBusy(form, false);
    if (error.code === 'ENTRY_CONFIRM_AMOUNT') {
      panel.querySelector('p').textContent = '填写的业绩金额较高，请核对元和小数点后再提交。';
      panel.hidden = false;
      panel.querySelector('[data-action="check-amount"]').focus();
    } else {
      showFormError(form, error.status === 409 ? '该场已有记录：补录只能填写缺项，与已录数值不一致会被拦截；如需更正数值请联系负责人。' : error.message);
    }
  }
}

// 提交回执：明确本场提交后的状态、本间当日剩余未完成场次，并给出「继续补下一场」直达入口。
async function showReceipt(anchor, date) {
  let comp = null;
  try { comp = await fetchCompleteness(date); } catch {}
  const group = comp?.accounts.find(item => item.accountId === anchor.accountId);
  const mine = group?.sessions.find(item => item.anchorId === anchor.id) ?? null;
  const remaining = (group?.sessions ?? []).filter(item => item.status === 'empty' || item.status === 'partial');
  const next = remaining.find(item => item.anchorId && item.anchorId !== anchor.id) ?? remaining[0] ?? null;
  const accountName = state.directory.accounts.find(item => item.id === anchor.accountId)?.name ?? '';
  const mineText = !mine ? '已记入系统。'
    : mine.status === 'complete' ? '本场已完整，六项全部录入。'
    : mine.status === 'stopped' ? '本场为停播/取消场次，不计缺项。'
    : '本场还缺：' + mine.missing.join('、') + '，可以继续补录。';
  dialog.innerHTML = `<div class="receipt">
    <div class="editor-header">
      <div><h2 id="entry-editor-title">提交回执</h2><p>${esc(accountName)} · ${esc(date)} · ${esc(anchor.name)} · ${esc(anchor.slotLabel || '直播场次')}</p></div>
      <div class="cooperation-dialog-actions">
        <button type="button" class="icon-button editor-close" data-action="receipt-done" aria-label="关闭">${icon('x')}</button>
      </div>
    </div>
    <div class="entry-form-body">
      <p class="receipt-status ${mine?.status === 'complete' ? 'is-complete' : 'is-partial'}">${icon('check')}<span><strong>登记已提交</strong> — ${esc(mineText)}</span></p>
      <p class="receipt-remaining">${group
        ? (remaining.length ? `本间${date === today ? '今日' : '当日'}还剩 ${remaining.length} 场未完成。` : '本间已全部录完，辛苦了。')
        : '暂时无法读取本间剩余场次状态，可返回列表查看顶部提醒。'}</p>
    </div>
    <div class="editor-actions">
      <button type="button" data-action="receipt-done">返回列表</button>
      ${next ? `<button type="button" class="primary" data-action="receipt-next" data-anchor-id="${esc(next.anchorId)}">${next.anchorId === anchor.id ? '继续补本场' : '继续补下一场：' + esc(next.anchorName)}</button>` : ''}
    </div>
  </div>`;
  if (!dialog.open) dialog.showModal();
  dialog.querySelector('[data-action="receipt-done"]')?.focus();
}

function renderDate(value, action) {
  const parsed = new Date(value + 'T12:00:00Z');
  if (Number.isNaN(parsed.valueOf()) || value < '2000-01-01' || value > '2100-12-31' || parsed.toISOString().slice(0, 10) !== value) return;
  state.date = value;
  renderPage();
  (action ? app.querySelector('[data-action="' + action + '"]') : app.querySelector('#entry-date'))?.focus();
}

app.addEventListener('change', event => {
  if (event.target.id === 'entry-date') renderDate(event.target.value);
});

app.addEventListener('click', async event => {
  const compRow = event.target.closest('[data-comp-anchor]');
  if (compRow?.dataset.compAnchor) {
    state.accountId = compRow.dataset.compAccount || state.accountId;
    renderPage();
    openEditor(compRow.dataset.compAnchor);
    return;
  }
  const accountButton = event.target.closest('[data-account-id]');
  if (accountButton) {
    state.accountId = accountButton.dataset.accountId;
    const index = Array.from(app.querySelectorAll('[data-account-id]')).indexOf(accountButton);
    renderPage();
    app.querySelectorAll('[data-account-id]')[index]?.focus();
    return;
  }
  const card = event.target.closest('[data-anchor-id]');
  if (card) { openEditor(card.dataset.anchorId); return; }
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action === 'previous-date' || action === 'next-date') {
    const date = new Date(state.date + 'T12:00:00Z');
    date.setUTCDate(date.getUTCDate() + (action === 'previous-date' ? -1 : 1));
    renderDate(date.toISOString().slice(0, 10), action);
  }
  if (action === 'today') renderDate(today, action);
  if (action === 'refresh') {
    const button = event.target.closest('button');
    button.disabled = true;
    try {
      await loadDirectory();
      toast('场次名单已刷新');
    } catch (error) {
      if (state.directory) toast(error.message);
      else showLoadError(error.message);
    } finally {
      button.disabled = false;
      app.querySelector('[data-action="refresh"]')?.focus();
    }
  }
});

dialog.addEventListener('input', event => {
  if (!rawKeys.includes(event.target.name)) return;
  const form = event.target.form;
  // 缺项字段一旦开始填写，去掉「未录」标示，避免提示与实际填写状态脱节。
  const wrapper = event.target.closest('[data-field]');
  if (wrapper && event.target.value.trim()) {
    wrapper.classList.remove('field-missing');
    wrapper.querySelector('.field-tag.is-missing')?.remove();
  }
  form.querySelector('.confirmation-panel').hidden = true;
  form.querySelector('.form-error').textContent = '';
  const invalid = form.querySelector('[aria-invalid]');
  invalid?.removeAttribute('aria-invalid');
  invalid?.removeAttribute('aria-describedby');
  persistDraft(form);
});
dialog.addEventListener('submit', event => {
  event.preventDefault();
  submitEntry(event.target);
});
dialog.addEventListener('click', event => {
  const control = event.target.closest('[data-action]');
  const action = control?.dataset.action;
  if (action === 'return-home' && !closeEditor()) event.preventDefault();
  if (action === 'close-editor') closeEditor();
  if (action === 'receipt-done') { dialog.close(); renderPage(); }
  if (action === 'receipt-next') openEditor(control.dataset.anchorId);
  if (action === 'confirm-amount' && !control.closest('.confirmation-panel').hidden) submitEntry(control.form, true);
  if (action === 'check-amount') {
    const form = control.form;
    form.querySelector('.confirmation-panel').hidden = true;
    form.elements.namedItem('orderAmount').focus();
  }
});
dialog.addEventListener('cancel', event => { event.preventDefault(); closeEditor(); });
window.addEventListener('beforeunload', event => {
  if (state.busy || state.editing?.draftUnavailable) { event.preventDefault(); event.returnValue = ''; }
});

try {
  await loadDirectory();
} catch (error) {
  showLoadError(error.message);
}
