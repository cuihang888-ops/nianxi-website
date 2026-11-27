const app = document.querySelector('#entry-app');
const dialog = document.querySelector('#entry-editor');
const toastElement = document.querySelector('#entry-toast');
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const state = { date: today, accountId: '', data: null, requestId: 0, editing: null, busy: false };
const definitions = {
  orderAmount: ['业绩（元）', ''],
  orders: ['单量', '单'],
  impressions: ['浏览量', '次'],
  shares: ['分享次数', '次'],
  newFollowers: ['关注数', '人']
};
const rawKeys = ['orderAmount', 'orders', 'durationHours', 'durationMinutes', 'impressions', 'shares', 'newFollowers'];
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const icon = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;
const icons = () => window.lucide?.createIcons();
const hasValue = value => value !== null && value !== undefined && value !== '';
const shiftDate = (value, days) => { const date = new Date(`${value}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); };
const activeOnDate = anchor => (!anchor.activeFrom || anchor.activeFrom <= state.date) && (!anchor.activeTo || anchor.activeTo >= state.date);

async function api(path, data, method = 'GET') {
  const headers = new Headers({ 'X-Command-Scope': 'public-entry' });
  if (data !== undefined) headers.set('Content-Type', 'application/json');
  const response = await fetch(new URL(path.replace(/^\//, ''), document.baseURI), {
    method, credentials: 'same-origin', headers, body: data === undefined ? undefined : JSON.stringify(data)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(result.error || result.message || '暂时无法连接，请稍后重试'); error.status = response.status; throw error; }
  return result;
}

function toast(message) {
  toastElement.textContent = message;
  toastElement.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => toastElement.classList.remove('show'), 3200);
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
  icons();
}

async function loadData(render = true) {
  const requestId = ++state.requestId;
  const data = await api(`/api/entry/bootstrap?date=${encodeURIComponent(state.date)}`);
  if (requestId !== state.requestId) return false;
  state.data = { ...data, accounts: data.accounts || [], anchors: data.anchors || [], sessions: data.sessions || [] };
  if (!state.data.accounts.some(account => account.id === state.accountId)) state.accountId = state.data.accounts[0]?.id || '';
  if (render) renderPage();
  return true;
}

function cardsForAccount() {
  const anchors = state.data.anchors.filter(anchor => anchor.accountId === state.accountId && activeOnDate(anchor));
  return anchors.flatMap(anchor => {
    const sessions = state.data.sessions.filter(session => session.accountId === state.accountId && session.anchorId === anchor.id && session.date === state.date);
    return sessions.length ? sessions.map(session => ({ anchor, session })) : [{ anchor, session: null }];
  });
}

function renderPage() {
  const data = state.data;
  if (!data) return;
  const account = data.accounts.find(item => item.id === state.accountId);
  const cards = cardsForAccount();
  app.innerHTML = `${header()}<main class="entry-main"><div class="entry-notice">${icon('shield-check')}<span>仅基础数据录入</span><span class="dataset-label">${esc(data.dataset?.label || '团队共享数据')}</span></div><div class="entry-controls"><div class="date-navigation"><button type="button" class="icon-button" data-action="previous-date" aria-label="前一天" title="前一天">${icon('chevron-left')}</button><input type="date" id="entry-date" data-testid="entry-date" value="${esc(state.date)}" aria-label="录入日期"><button type="button" class="icon-button" data-action="next-date" aria-label="后一天" title="后一天">${icon('chevron-right')}</button></div><button type="button" data-action="today" class="today-button">今天</button><button type="button" data-action="refresh" class="icon-button refresh-button" title="刷新记录" aria-label="刷新记录">${icon('refresh-cw')}</button></div><nav class="account-tabs" role="tablist" aria-label="直播间">${data.accounts.map(item => `<button type="button" role="tab" aria-selected="${item.id === state.accountId}" data-account-id="${esc(item.id)}">${esc(item.name)}</button>`).join('')}</nav><div class="entry-list-heading"><h2>${esc(account?.name || '直播间')} · 场次</h2><span>${esc(state.date)}</span></div>${cards.length ? `<div class="entry-cards">${cards.map(({ anchor, session }) => {
    const filled = ['orderAmount', 'orders', 'actualMinutes', 'impressions', 'shares', 'newFollowers'].some(key => hasValue(session?.[key]));
    const slot = session?.slotLabel || anchor.slotLabel || '时段待补';
    const updated = session?.updatedAt && filled ? `最近登记 ${formatUpdated(session.updatedAt)}` : '';
    return `<button type="button" class="entry-session-card" data-testid="entry-session-card" data-anchor-id="${esc(anchor.id)}" ${session ? `data-session-id="${esc(session.id)}"` : ''}><div class="card-top"><span class="slot-caption">${esc(slot)}</span><span class="card-status${filled ? ' filled' : ''}">${icon(filled ? 'check-circle-2' : 'circle-dashed')}${filled ? '已登记' : '待登记'}</span></div><div class="card-body"><div><strong>${esc(anchor.name)}</strong><small><span class="card-updated">${esc(updated)}</span></small></div><span class="card-arrow">${icon('chevron-right')}</span></div></button>`;
  }).join('')}</div>` : '<div class="entry-empty">该日期暂无适用的主播场次</div>'}</main>`;
  icons();
}

function formatUpdated(value) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? '' : new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
}

function metricInput(key, session) {
  const [label, unit] = definitions[key];
  const sales = key === 'orderAmount';
  const value = session?.[key] ?? '';
  return `<label><span class="field-label"><span>${label}</span>${unit ? `<em>${unit}</em>` : ''}</span>
    <input name="${key}" type="number" min="0" step="${sales ? '0.01' : '1'}" inputmode="${sales ? 'decimal' : 'numeric'}" placeholder="未登记" value="${esc(value)}" autocomplete="off">
  </label>`;
}

function durationInputs(value) {
  const hours = hasValue(value) ? Math.floor(value / 60) : '';
  const minutes = hasValue(value) ? value % 60 : '';
  return `<fieldset class="duration-field">
    <legend>时长</legend>
    <div class="duration-inputs">
      <label><input name="durationHours" type="number" min="0" max="24" step="1" inputmode="numeric" placeholder="—" value="${esc(hours)}" autocomplete="off" aria-label="时长小时"><span>小时</span></label>
      <label><input name="durationMinutes" type="number" min="0" max="59" step="1" inputmode="numeric" placeholder="—" value="${esc(minutes)}" autocomplete="off" aria-label="时长分钟"><span>分钟</span></label>
    </div>
  </fieldset>`;
}

function openEditor(anchorId, sessionId) {
  const anchor = state.data.anchors.find(item => item.id === anchorId && activeOnDate(item));
  if (!anchor) return;
  const session = sessionId ? state.data.sessions.find(item => String(item.id) === sessionId) : null;
  const account = state.data.accounts.find(item => item.id === anchor.accountId);
  state.editing = { anchor, session, date: state.date, accountId: anchor.accountId };
  state.busy = false;
  dialog.innerHTML = `<form id="entry-form" data-testid="entry-form">
    <div class="editor-header">
      <div><h2 id="entry-editor-title">${esc(anchor.name)} · 场次登记</h2><p>${esc(account?.name || '')} · ${esc(state.date)} · ${esc(session?.slotLabel || anchor.slotLabel || '时段待补')}</p></div>
      <div class="cooperation-dialog-actions">
        <a class="cooperation-dialog-link" href="./" data-action="return-home">返回协作中心</a>
        <button type="button" class="icon-button editor-close" data-action="close-editor" title="关闭" aria-label="关闭">${icon('x')}</button>
      </div>
    </div>
    <div class="entry-form-body">
      <div class="field-grid simple-entry">
        ${metricInput('orderAmount', session)}
        ${metricInput('orders', session)}
        ${durationInputs(session?.actualMinutes)}
        ${metricInput('impressions', session)}
        ${metricInput('shares', session)}
        ${metricInput('newFollowers', session)}
      </div>
      <p class="form-notice">浏览量填写平台曝光总数。待补指标可留空，已确认没有的指标请填 0。</p>
      <p class="form-error" role="alert"></p>
      <div id="entry-conflict" hidden class="conflict-panel"><p>这条记录已被其他同事修改。载入最新记录后，请核对你填写的内容再保存。</p><button type="button" data-action="refresh-record" data-testid="entry-refresh-record">${icon('refresh-cw')}载入最新记录</button></div>
    </div>
    <div class="editor-actions"><button type="button" data-action="close-editor">取消</button><button type="submit" class="primary" data-testid="entry-submit">${icon('check')}保存登记</button></div>
  </form>`;
  if (!dialog.open) dialog.showModal();
  icons();
  const form = dialog.querySelector('form');
  form.dataset.original = JSON.stringify(readRawFields(form));
}

function readRawFields(form) {
  return Object.fromEntries(rawKeys.map(key => [key, form.elements.namedItem(key)?.value ?? '']));
}

function closeEditor() {
  if (state.busy) return false;
  const form = dialog.querySelector('form');
  if (form && JSON.stringify(readRawFields(form)) !== form.dataset.original && !window.confirm('放弃尚未保存的内容？')) return false;
  dialog.close();
  state.editing = null;
  return true;
}

async function saveEntry(form) {
  if (state.busy || !state.editing) return;
  const errorElement = form.querySelector('.form-error');
  errorElement.textContent = '';
  const raw = readRawFields(form);
  const original = JSON.parse(form.dataset.original);
  const editing = state.editing;
  const payloadFields = {};
  for (const [key, [label]] of Object.entries(definitions)) {
    const value = raw[key].trim();
    if (raw[key] === original[key]) continue;
    const valid = key === 'orderAmount' ? /^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(value) : /^\d+$/.test(value);
    if (value && (!valid || !Number.isFinite(Number(value)))) {
      errorElement.textContent = key === 'orderAmount' ? '业绩请填写非负金额，最多两位小数' : `${label}请填写非负整数`;
      form.elements.namedItem(key).focus();
      return;
    }
    payloadFields[key] = value ? Number(value) : null;
  }
  if (raw.durationHours !== original.durationHours || raw.durationMinutes !== original.durationMinutes) {
    const hours = Number(raw.durationHours);
    const minutes = Number(raw.durationMinutes);
    const total = hours * 60 + minutes;
    if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || minutes < 0 || minutes > 59 || total > 1440) {
      errorElement.textContent = '请填写整数时长。分钟须为 0 至 59，单场最长 24 小时。';
      return;
    }
    payloadFields.actualMinutes = raw.durationHours || raw.durationMinutes ? total : null;
  }
  if (!Object.keys(payloadFields).length) {
    dialog.close();
    state.editing = null;
    toast('内容未变更');
    return;
  }
  const button = form.querySelector('[data-testid="entry-submit"]');
  state.busy = true;
  button.disabled = true;
  button.textContent = '正在保存…';
  try {
    if (editing.session) await api(`/api/entry/sessions/${encodeURIComponent(editing.session.id)}`, { version: editing.session.version, ...payloadFields }, 'PUT');
    else await api('/api/entry/sessions', { date: editing.date, accountId: editing.accountId, anchorId: editing.anchor.id, ...payloadFields }, 'POST');
    dialog.close();
    state.editing = null;
    toast('登记已保存');
    try { await loadData(); } catch (error) { toast(`已保存，刷新暂未完成：${error.message}`); }
  } catch (error) {
    errorElement.textContent = error.status === 409 ? '保存未完成，请先核对最新记录后再提交。' : error.message;
    if (error.status === 409) {
      const conflict = form.querySelector('#entry-conflict');
      conflict.hidden = false;
      conflict.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } else errorElement.scrollIntoView({ block: 'center', behavior: 'smooth' });
  } finally {
    state.busy = false;
    button.disabled = false;
    button.innerHTML = `${icon('check')}保存登记`;
    icons();
  }
}

async function refreshRecord() {
  const editing = state.editing;
  if (state.busy || !editing) return;
  const form = dialog.querySelector('form');
  const raw = readRawFields(form);
  const original = JSON.parse(form.dataset.original);
  const draftKeys = new Set(rawKeys.filter(key => raw[key] !== original[key]));
  if (draftKeys.has('durationHours') || draftKeys.has('durationMinutes')) {
    draftKeys.add('durationHours');
    draftKeys.add('durationMinutes');
  }
  const button = form.querySelector('[data-testid="entry-refresh-record"]');
  button.disabled = true;
  state.busy = true;
  try {
    await loadData(false);
    const current = state.data.sessions.find(session => editing.session
      ? session.id === editing.session.id
      : session.anchorId === editing.anchor.id && session.accountId === editing.accountId && session.date === editing.date);
    if (editing.session && !current) throw new Error('找不到这条场次记录，请核对日期和直播间。');
    openEditor(editing.anchor.id, current ? String(current.id) : null);
    const refreshed = dialog.querySelector('form');
    for (const key of draftKeys) refreshed.elements.namedItem(key).value = raw[key];
    renderPage();
    toast(draftKeys.size ? '已载入最新记录，已保留你的修改，请核对后保存。' : '已载入最新记录');
  } catch (error) { dialog.querySelector('.form-error').textContent = error.message; }
  finally {
    button.disabled = false;
    state.busy = false;
  }
}

async function changeDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
  const previousDate = state.date;
  state.date = value;
  try {
    await loadData();
  } catch (error) {
    if (state.date === value) {
      state.date = previousDate;
      renderPage();
    }
    toast(error.message);
  }
}

app.addEventListener('change', event => { if (event.target.id === 'entry-date') changeDate(event.target.value); });
app.addEventListener('click', async event => {
  const accountButton = event.target.closest('[data-account-id]');
  if (accountButton) { state.accountId = accountButton.dataset.accountId; renderPage(); return; }
  const card = event.target.closest('[data-testid="entry-session-card"]');
  if (card) { openEditor(card.dataset.anchorId, card.dataset.sessionId || null); return; }
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (!action) return;
  if (action === 'previous-date') await changeDate(shiftDate(state.date, -1));
  if (action === 'next-date') await changeDate(shiftDate(state.date, 1));
  if (action === 'today') await changeDate(today);
  if (action === 'refresh') {
    try {
      await loadData();
      toast('记录已刷新');
    } catch (error) {
      if (state.data) toast(error.message);
      else showLoadError(error.message);
    }
  }
});

dialog.addEventListener('submit', event => { if (event.target.id === 'entry-form') { event.preventDefault(); saveEntry(event.target); } });
dialog.addEventListener('click', event => {
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action === 'return-home' && !closeEditor()) event.preventDefault();
  if (action === 'close-editor') closeEditor();
  if (action === 'refresh-record') refreshRecord();
});
dialog.addEventListener('cancel', event => { event.preventDefault(); closeEditor(); });
window.addEventListener('beforeunload', event => {
  const form = dialog.querySelector('form');
  if (dialog.open && form && JSON.stringify(readRawFields(form)) !== form.dataset.original) { event.preventDefault(); event.returnValue = ''; }
});

try {
  await loadData();
} catch (error) {
  showLoadError(error.message);
}
