const app = document.querySelector('#entry-app');
const dialog = document.querySelector('#entry-editor');
const toastElement = document.querySelector('#entry-toast');
const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const state = { date: today, accountId: '', directory: null, editing: null, busy: false };
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
    <nav class="account-tabs" aria-label="直播间">${accounts.map(item => `<button type="button" aria-pressed="${item.id === state.accountId}" data-account-id="${esc(item.id)}">${esc(item.name)}</button>`).join('')}</nav>
    <div class="entry-list-heading"><h2>${esc(account?.name || '直播间')} · 场次</h2><span>${esc(state.date)}</span></div>
    ${available.length ? `<div class="entry-cards">${available.map(anchor => `
      <button type="button" class="entry-session-card" data-testid="entry-session-card" data-anchor-id="${esc(anchor.id)}">
        <span class="card-top">
          <span class="slot-caption">${esc(anchor.slotLabel || '直播场次')}</span>
          ${hasDraft(readDraft(draftKey(anchor, state.date))) ? '<span class="card-status draft-badge">本机草稿</span>' : ''}
        </span>
        <span class="card-body"><strong>${esc(anchor.name)}</strong><span class="card-arrow">${icon('chevron-right')}</span></span>
      </button>`).join('')}</div>` : '<div class="entry-empty">该日期暂无适用的主播场次</div>'}
  </main>`;
}

function metricInput(key, draft) {
  const [label, unit] = definitions[key];
  return `<label><span class="field-label"><span>${label}</span>${unit ? `<em>${unit}</em>` : ''}</span>
    <input name="${key}" type="text" inputmode="${key === 'orderAmount' ? 'decimal' : 'numeric'}" maxlength="24" value="${esc(draft[key])}" autocomplete="off">
  </label>`;
}

function durationInputs(draft) {
  return `<fieldset class="duration-field">
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
  dialog.showModal();
}

function readRawFields(form) {
  return Object.fromEntries(rawKeys.map(key => [key, form.elements.namedItem(key).value]));
}

function closeEditor() {
  if (state.busy) return false;
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
    closeEditor();
    toast('登记已提交');
  } catch (error) {
    setBusy(form, false);
    if (error.code === 'ENTRY_CONFIRM_AMOUNT') {
      panel.querySelector('p').textContent = '填写的业绩金额较高，请核对元和小数点后再提交。';
      panel.hidden = false;
      panel.querySelector('[data-action="check-amount"]').focus();
    } else {
      showFormError(form, error.status === 409 ? '提交未完成，请联系负责人核对场次。' : error.message);
    }
  }
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
