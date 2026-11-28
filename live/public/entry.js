const app = document.querySelector('#entry-app');
const dialog = document.querySelector('#entry-editor');
const toastElement = document.querySelector('#entry-toast');
const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '2000-01-01' || value > '2100-12-31') return false;
  const parsed = new Date(value + 'T12:00:00Z');
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

const linkedDate = new URLSearchParams(location.search).get('date');
const state = { date: validDate(linkedDate) ? linkedDate : today, accountId: '', directory: null, editing: null, busy: false, completeness: null, month: null, loadError: '' };
const definitions = {
  orderAmount: ['业绩（元）', ''],
  orders: ['单量', '单'],
  impressions: ['浏览量', '次'],
  shares: ['分享次数', '次'],
  newFollowers: ['关注数', '人']
};
const rawKeys = [...Object.keys(definitions), 'durationHours', 'durationMinutes'];
const metricsKeys = ['orderAmount', 'orders', 'actualMinutes', 'impressions', 'shares', 'newFollowers'];
const savedLabels = { orderAmount: '业绩', orders: '单量', actualMinutes: '直播时长', impressions: '浏览量', shares: '分享次数', newFollowers: '关注数' };
let directoryRequest;
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

async function api(path, data, signal) {
  const headers = new Headers({ 'X-Command-Scope': 'public-entry' });
  if (data !== undefined) headers.set('Content-Type', 'application/json');
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timeout = setTimeout(abort, 12000);
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  let response;
  let result;
  try {
    response = await fetch(new URL(path, document.baseURI), {
      method: data === undefined ? 'GET' : 'POST', credentials: 'same-origin', headers,
      body: data === undefined ? undefined : JSON.stringify(data),
      signal: controller.signal
    });
    result = await response.json();
  } catch (error) {
    if (signal?.aborted) throw error;
    const message = data === undefined ? '读取超时或连接中断，请重试。' : '暂时无法确认提交结果，正在重新核对录入状态。';
    throw Object.assign(new Error(message), { uncertain: data !== undefined });
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
  if (!response.ok) {
    const error = new Error(result.error || result.message || '暂时无法连接，请稍后重试');
    error.status = response.status;
    error.code = result.code;
    error.completeness = result.completeness;
    error.month = result.month;
    error.assignmentChanged = result.assignmentChanged === true;
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

function applicableDraft(draft, missing) {
  return Object.fromEntries(rawKeys.map(key => [key,
    missing.includes(key.startsWith('duration') ? 'actualMinutes' : key) ? draft[key] || '' : ''
  ]));
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

function applyCompleteness(completeness, month, date = state.date) {
  if (completeness?.date !== date || !Array.isArray(completeness.accounts) || !completeness.summary) return false;
  state.completeness = completeness;
  if (Array.isArray(month?.days) && Array.isArray(month.accounts) && month.summary) state.month = month;
  state.loadError = '';
  return true;
}

async function loadDirectory({ paint = true } = {}) {
  const date = state.date;
  directoryRequest?.abort();
  const request = new AbortController();
  directoryRequest = request;
  state.loadError = '';
  if (paint && state.directory) renderPage();
  try {
    const { accounts, anchors, slots, completeness, month } = await api('api/entry/bootstrap?date=' + encodeURIComponent(date) + '&completeness=1', undefined, request.signal);
    if (request.signal.aborted || state.date !== date) return false;
    if (!Array.isArray(accounts) || !Array.isArray(anchors) || !applyCompleteness(completeness, month, date)) {
      throw new Error('暂时无法读取录入状态，请重试。');
    }
    state.directory = { accounts, anchors, slots };
    if (!accounts.some(account => account.id === state.accountId)) state.accountId = accounts[0]?.id || '';
    return true;
  } catch (error) {
    if (request.signal.aborted) return false;
    state.loadError = error.message;
    if (!state.directory) showLoadError(error.message);
    return false;
  } finally {
    if (directoryRequest === request) {
      directoryRequest = null;
      if (paint && state.directory) renderPage();
    }
  }
}

function sessionFor(anchor) {
  if (state.completeness?.date !== state.date || state.loadError) return null;
  const group = state.completeness.accounts.find(group => group.accountId === anchor.accountId);
  const matching = group?.sessions.filter(row => row.anchorId === anchor.id && (row.slotId == null || row.slotId === anchor.slotId)) || [];
  return matching.find(row => row.canEnter) || matching[0] || null;
}

function editableKeys(session) {
  if (!session?.canEnter || session.ambiguous || session.historicalReference) return [];
  return (session.missingKeys || []).filter(key => metricsKeys.includes(key));
}

function missingBadge(count, description) {
  if (!count) return '';
  const label = description.replace('{count}', count);
  return `<span class="entry-count-badge" title="${label}" aria-label="${label}">+${count}</span>`;
}

function currentMonthDay(date) {
  const monthStart = state.month?.from || today.slice(0, 8) + '01';
  const monthEnd = state.month?.to || today;
  return date >= monthStart && date <= monthEnd;
}

function dateUrl(date, shift) {
  const url = new URL(location.href);
  url.searchParams.set('date', date);
  for (const key of ['accountId', 'anchorId', 'slotId']) {
    if (shift?.[key]) url.searchParams.set(key, shift[key]);
    else url.searchParams.delete(key);
  }
  return url.href;
}

function renderMonthlyReminder() {
  const month = state.month;
  const to = month?.to || today;
  if (state.date > to) return '';
  if (!currentMonthDay(state.date)) {
    return '<p class="entry-month-info">当前查看的是往月场次。如需补录，可打开对应场次。</p>';
  }
  if (!month) return '';
  const pendingTotal = month.summary.partial + month.summary.empty;
  const days = month.days.filter(day => day.summary.partial + day.summary.empty > 0)
    .sort((a, b) => b.date.localeCompare(a.date));
  const breakdown = summary => [summary.empty ? `未录 ${summary.empty} 场` : '', summary.partial ? `缺项 ${summary.partial} 场` : '']
    .filter(Boolean).join(' · ');
  return `<section class="entry-month" aria-labelledby="entry-month-title">
    <div class="entry-month-head"><h2 id="entry-month-title">本月待补总览</h2><span>${esc(month.from)} 至 ${esc(month.to)}</span></div>
    ${pendingTotal ? `<p class="entry-month-count"><strong>共 ${pendingTotal} 场待补</strong><span>${breakdown(month.summary)}</span></p>
    <ul class="entry-month-rooms">${month.accounts.filter(group => group.summary.partial + group.summary.empty > 0).map(group =>
      `<li><strong>${esc(group.accountName)}</strong> ${breakdown(group.summary)}</li>`).join('')}</ul>
    <ul class="entry-month-days" aria-label="待补日期">${days.map(day => `<li>
      <a href="${esc(dateUrl(day.date))}" data-month-date="${esc(day.date)}"${day.date === state.date ? ' aria-current="date"' : ''}>
        <time datetime="${esc(day.date)}">${esc(day.date)}${day.date === to ? '（今日）' : ''}</time>
        <span>${breakdown(day.summary)}</span>
      </a>${renderPendingShifts(day)}</li>`).join('')}</ul>` : '<p class="entry-month-info">本月暂无待补场次。</p>'}
  </section>`;
}

function renderPendingShifts(day) {
  if (!day.pendingShifts?.length) return '';
  const names = new Map(state.directory.accounts.map(account => [account.id, account.name]));
  return `<ul class="entry-month-shifts">${day.pendingShifts.map(shift => {
    const { accountId, anchorId, slotId, slotLabel, anchorName } = shift;
    return `<li><a href="${esc(dateUrl(day.date, shift))}" data-month-date="${esc(day.date)}"
      data-month-account="${esc(accountId)}" data-month-anchor="${esc(anchorId)}" data-month-slot="${esc(slotId)}">
        <span>${esc([names.get(accountId), slotLabel, anchorName].filter(Boolean).join(' · '))}</span>
        ${missingBadge(shift.missingKeys?.length, '{count} 项待补录')}
      </a></li>`;
  }).join('')}</ul>`;
}

function renderPage() {
  const { accounts, anchors } = state.directory;
  const account = accounts.find(item => item.id === state.accountId);
  const available = anchors.filter(anchor => anchor.accountId === state.accountId && activeOnDate(anchor));
  const loading = Boolean(directoryRequest);
  const showBadges = currentMonthDay(state.date);
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
    <nav class="account-tabs" aria-label="直播间">${accounts.map(item => {
      const shifts = loading || !showBadges ? [] : anchors.filter(anchor => anchor.accountId === item.id && activeOnDate(anchor));
      const count = shifts.filter(anchor => editableKeys(sessionFor(anchor)).length).length;
      return `<button type="button" aria-pressed="${item.id === state.accountId}" data-account-id="${esc(item.id)}"><span class="entry-account-name">${esc(item.name)}</span>${missingBadge(count, '{count} 场待补录')}</button>`;
    }).join('')}</nav>
    <div class="entry-list-heading"><h2>${esc(account?.name || '直播间')} · 场次</h2><span>${esc(state.date)}</span></div>
    ${loading ? '<div class="entry-empty" role="status">正在读取录入状态…</div>'
      : state.loadError ? `<div class="entry-error" role="alert">${esc(state.loadError)}</div>`
      : available.length ? `<div class="entry-cards">${available.map(anchor => {
        const session = sessionFor(anchor);
        const missing = editableKeys(session);
        const draft = applicableDraft(readDraft(draftKey(anchor, state.date)), missing);
        return `<button type="button" class="entry-session-card" data-testid="entry-session-card" data-anchor-id="${esc(anchor.id)}" ${missing.length ? '' : 'disabled'}>
        <span class="card-top">
          <span class="slot-caption">${esc(anchor.slotLabel || '直播场次')}</span>
          <span class="card-indicators">${hasDraft(draft) ? '<span class="card-status draft-badge">本机草稿</span>' : ''}${showBadges ? missingBadge(missing.length, '{count} 项待补录') : ''}</span>
        </span>
        <span class="card-body"><strong>${esc(anchor.name)}</strong>${missing.length ? `<span class="card-arrow">${icon('chevron-right')}</span>` : ''}</span>
        ${missing.length ? '' : `<span class="card-status">${esc(completenessStatusText(session))}</span>`}
      </button>`;
      }).join('')}</div>` : '<div class="entry-empty">该日期暂无适用的主播场次</div>'}
    ${!loading && !state.loadError ? renderMonthlyReminder() : ''}
  </main>`;
}

function completenessStatusText(session) {
  if (!session) return '录入状态待确认';
  if (session.ambiguous || session.status === 'ambiguous') return '场次安排或记录待核对 · 请联系负责人';
  if (session.historicalReference) return '历史记录归属待核对 · 请联系负责人';
  if (session.status === 'complete') return '已录齐';
  if (session.status === 'stopped') return '停播/取消 · 不计缺项';
  if (session.status === 'upcoming') return '尚未开播';
  if (session.status === 'empty') return session.canEnter ? '未录入' : '未录入 · 请联系负责人';
  return '待补录 · 请联系负责人';
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
  const missing = editableKeys(sessionFor(anchor));
  if (!missing.length) return;
  const key = draftKey(anchor, state.date);
  const draft = applicableDraft(readDraft(key), missing);
  state.editing = { anchor, account: accounts.find(item => item.id === anchor.accountId), date: state.date, key, missing, draftUnavailable: false };
  renderEditor(draft);
  dialog.showModal();
}

function renderEditor(draft) {
  const { anchor, account, date, missing } = state.editing;
  const saved = metricsKeys.filter(key => !missing.includes(key));
  dialog.innerHTML = `<form id="entry-form" data-testid="entry-form">
    <div class="editor-header">
      <div><h2 id="entry-editor-title">${esc(anchor.name)} · 场次登记</h2><p>${esc(account?.name)} · ${esc(date)} · ${esc(anchor.slotLabel || '直播场次')}</p></div>
      <div class="cooperation-dialog-actions">
        <a class="cooperation-dialog-link" href="./" data-action="return-home">返回协作中心</a>
        <button type="button" class="icon-button editor-close" data-action="close-editor" aria-label="关闭" autofocus>${icon('x')}</button>
      </div>
    </div>
    <div class="entry-form-body">
      ${saved.length ? `<p class="saved-fields">已录入 ${saved.map(key => savedLabels[key]).join('、')}</p>` : ''}
      <fieldset class="field-grid simple-entry" aria-label="场次指标">
        ${missing.map(key => key === 'actualMinutes' ? durationInputs(draft) : metricInput(key, draft)).join('')}
      </fieldset>
      <p class="form-notice">浏览量填写平台曝光总数。待补指标可留空，已确认没有的指标请填 0。</p>
      <p class="draft-notice" role="status">${hasDraft(draft) ? '已恢复本浏览器中的草稿' : '填写时自动保存草稿'}</p>
      <p id="entry-form-error" class="form-error" role="alert" tabindex="-1"></p>
      <button type="button" data-action="refresh-editor" hidden>重新核对录入状态</button>
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
}

function readRawFields(form) {
  return Object.fromEntries(rawKeys.map(key => [key, form.elements.namedItem(key)?.value || '']));
}

function closeEditor() {
  if (state.busy) return false;
  if (state.editing?.draftUnavailable && !window.confirm('浏览器无法保存草稿。确定关闭并放弃填写内容？')) return false;
  const anchorId = state.editing?.anchor.id;
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
  button.disabled = busy || Boolean(state.editing?.needsRefresh);
  button.innerHTML = busy ? '正在提交…' : icon('check') + '提交登记';
}

async function submitEntry(form, confirmAmount = false) {
  if (state.busy || !state.editing || state.editing.needsRefresh) return;
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
  const submittedDraft = JSON.stringify(readDraft(key));
  setBusy(form, true);
  try {
    const result = await api('api/entry/sessions?status=1', {
      date, accountId: anchor.accountId, anchorId: anchor.id, slotId: anchor.slotId, ...metrics,
      ...(confirmAmount ? { confirmAmount: true } : {})
    });
    if (result.ok !== true) throw Object.assign(new Error('暂时无法确认提交结果，正在重新核对录入状态。'), { uncertain: true });
    try {
      // A second tab may have written a newer local draft while the request was running.
      if (JSON.stringify(readDraft(key)) === submittedDraft) localStorage.removeItem(key);
    } catch {}
    if (!applyCompleteness(result.completeness, result.month, date)) await loadDirectory({ paint: false });
    state.editing.draftUnavailable = false;
    setBusy(form, false);
    closeEditor();
    toast('登记已提交');
  } catch (error) {
    if (error.code === 'ENTRY_CONFLICT' || error.uncertain) {
      await reconcileEditor(form, error);
      return;
    }
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

async function reconcileEditor(form, error) {
  const editing = state.editing;
  const draft = readRawFields(form);
  const storedDraft = JSON.stringify(readDraft(editing.key));
  setBusy(form, true);
  showFormError(form, error?.message || '正在重新核对录入状态…');
  const hasStatus = applyCompleteness(error?.completeness, error?.month, editing.date);
  const refreshed = (hasStatus && !error?.assignmentChanged && sessionFor(editing.anchor)) ||
    await loadDirectory({ paint: false });
  if (!refreshed) {
    editing.needsRefresh = true;
    setBusy(form, false);
    form.querySelector('[data-action="refresh-editor"]').hidden = false;
    showFormError(form, '录入状态暂时无法核对。草稿已保留，请先重新核对。');
    return;
  }
  const anchor = state.directory.anchors.find(item => item.id === editing.anchor.id &&
    item.accountId === editing.anchor.accountId && item.slotId === editing.anchor.slotId);
  const session = anchor && sessionFor(anchor);
  const missing = editableKeys(session);
  if (!missing.length) {
    editing.draftUnavailable = false;
    setBusy(form, false);
    closeEditor();
    toast(session ? completenessStatusText(session) : '场次已变更，请联系负责人核对。');
    return;
  }
  editing.missing = missing;
  editing.needsRefresh = false;
  const remaining = applicableDraft(draft, missing);
  renderEditor(remaining);
  const refreshedForm = dialog.querySelector('form');
  if (JSON.stringify(readDraft(editing.key)) === storedDraft) persistDraft(refreshedForm);
  setBusy(refreshedForm, false);
  showFormError(refreshedForm, error?.code === 'ENTRY_CONFLICT'
    ? '本次数据未保存。请检查待补指标与草稿，仍无法提交时联系负责人。'
    : '已核对当前录入状态。请检查待补指标和草稿后再提交。');
}

async function renderDate(value, action, updateUrl = true, shift) {
  if (!validDate(value)) return;
  const nextUrl = dateUrl(value, shift);
  if (updateUrl && location.href !== nextUrl) history.pushState(null, '', nextUrl);
  const needsLoad = state.date !== value || state.loadError || state.completeness?.date !== value;
  const restoreFocus = () => (action && action !== 'month' ? app.querySelector('[data-action="' + action + '"]') : app.querySelector('#entry-date'))?.focus();
  if (needsLoad) {
    state.date = value;
    const pending = loadDirectory();
    restoreFocus();
    if (!await pending || state.date !== value) return;
  }
  if (shift) openLinkedShift(shift);
  else if (action === 'month' || (needsLoad && document.activeElement === document.body)) restoreFocus();
}

function openLinkedShift({ accountId, anchorId, slotId }) {
  const anchor = state.directory.anchors.find(item => item.id === anchorId &&
    item.accountId === accountId && (!slotId || item.slotId === slotId));
  if (anchor) {
    state.accountId = accountId;
    renderPage();
    openEditor(anchor.id);
    if (!state.editing) toast(completenessStatusText(sessionFor(anchor)));
  } else {
    toast('场次已变更，请联系负责人核对。');
  }
}

function linkedShift(params) {
  const accountId = params.get('accountId');
  const anchorId = params.get('anchorId');
  return accountId && anchorId ? { accountId, anchorId, slotId: params.get('slotId') } : undefined;
}

app.addEventListener('change', event => {
  if (event.target.id === 'entry-date') renderDate(event.target.value);
});

app.addEventListener('click', async event => {
  const dateLink = event.target.closest('[data-month-date]');
  if (dateLink && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
    event.preventDefault();
    const { monthDate, monthAccount, monthAnchor, monthSlot } = dateLink.dataset;
    const shift = monthAnchor ? { accountId: monthAccount, anchorId: monthAnchor, slotId: monthSlot } : undefined;
    void renderDate(monthDate, 'month', true, shift);
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
    if (directoryRequest) return;
    if (await loadDirectory()) toast('场次状态已刷新');
    app.querySelector('[data-action="refresh"]')?.focus();
  }
});

window.addEventListener('popstate', () => {
  const params = new URLSearchParams(location.search);
  const linked = params.get('date');
  if (state.editing && !closeEditor()) {
    history.replaceState(null, '', dateUrl(state.date));
    return;
  }
  void renderDate(validDate(linked) ? linked : today, undefined, false, linkedShift(params));
});

dialog.addEventListener('input', event => {
  if (!rawKeys.includes(event.target.name)) return;
  const form = event.target.form;
  form.querySelector('.confirmation-panel').hidden = true;
  if (!state.editing?.needsRefresh) form.querySelector('.form-error').textContent = '';
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
  if (action === 'refresh-editor' && !state.busy && state.editing) void reconcileEditor(control.form);
  if (action === 'confirm-amount' && !control.closest('.confirmation-panel').hidden) submitEntry(control.form, true);
  if (action === 'check-amount') {
    const form = control.form;
    form.querySelector('.confirmation-panel').hidden = true;
    form.elements.namedItem('orderAmount')?.focus();
  }
});
dialog.addEventListener('cancel', event => { event.preventDefault(); closeEditor(); });
window.addEventListener('beforeunload', event => {
  if (state.busy || state.editing?.draftUnavailable) { event.preventDefault(); event.returnValue = ''; }
});

if (await loadDirectory()) {
  const shift = linkedShift(new URLSearchParams(location.search));
  if (shift) openLinkedShift(shift);
}
