const selector = '[data-department-goals]';
const endpoint = '/api/department-goals';
const monthPattern = /^20\d{2}-(?:0[1-9]|1[0-2])$/;
const number = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 6 });
const percent = new Intl.NumberFormat('zh-CN', { style: 'percent', maximumFractionDigits: 1 });
const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));
const hasAmount = value => Number.isFinite(value);
const wan = value => number.format(value / 10000) + ' 万元';
const amountInput = value => hasAmount(value) ? String(Number((value / 10000).toFixed(6))) : '';

export function departmentGoalsSlot(month) {
  return monthPattern.test(month)
    ? `<section class="department-goals" data-department-goals="${month}" aria-label="部门月目标"></section>`
    : '';
}

function metric(title, target, actual, details, editingAllowed) {
  const comparable = hasAmount(target) && hasAmount(actual);
  const difference = comparable ? target - actual : null;
  const achievement = comparable && target > 0 ? actual / target : null;
  const completed = comparable && difference <= 0;
  const actualValue = hasAmount(actual) ? wan(actual) : '待补';
  const targetValue = hasAmount(target) ? wan(target) : '待设';
  const differenceLabel = difference < 0 ? '超出目标' : '距目标';
  const progressLabel = achievement !== null ? percent.format(achievement)
    : target === 0 ? '零目标' : '待计算';
  const progressStyle = completed ? ' department-goal-achieved' : '';
  return `<article class="department-goal-card${progressStyle}">
    <h3>${title}</h3>
    <dl>
      <div><dt>已完成</dt><dd>${actualValue}</dd></div>
      <div><dt>目标</dt><dd>${targetValue}</dd></div>
      <div><dt>${differenceLabel}</dt><dd>${comparable ? wan(Math.abs(difference)) : '待计算'}</dd></div>
      <div><dt>完成率</dt><dd>${progressLabel}</dd></div>
    </dl>
    ${achievement === null ? '' : `<progress aria-label="${title}完成率" value="${Math.min(achievement, 1)}" max="1"></progress>`}
    <p>${details}${!hasAmount(target) && editingAllowed ? ' · 可录入目标' : ''}</p>
  </article>`;
}

function salesDetails(data) {
  const parts = [];
  if (data.asOf) parts.push('截至 ' + escape(data.asOf));
  if (Number.isFinite(data.salesReported) && Number.isFinite(data.salesPending)) {
    parts.push(`已填 ${data.salesReported} 场 · 待补 ${data.salesPending} 场`);
  }
  let pace = '日均缺口待计算';
  if (hasAmount(data.salesTarget) && (hasAmount(data.salesActual) || !data.asOf)) {
    const gap = Math.max(0, data.salesTarget - (data.salesActual ?? 0));
    if (gap === 0) pace = '已达目标';
    else if (data.remainingDays > 0) pace = `剩 ${data.remainingDays} 天 · 日均需达 ${wan(gap / data.remainingDays)}`;
    else pace = '本月已结束';
  }
  parts.push(pace);
  return parts.join(' · ');
}

function adminForm(data) {
  return `<form class="department-goal-editor" data-goal-editor hidden>
    <label>销售目标（万元）<input name="salesTarget" type="number" inputmode="decimal" min="0" step="0.000001" value="${amountInput(data.salesTarget)}" placeholder="待设"></label>
    <label>签收目标（万元）<input name="signedTarget" type="number" inputmode="decimal" min="0" step="0.000001" value="${amountInput(data.signedTarget)}" placeholder="待设"></label>
    <label>实际签收（万元）<input name="signedActual" type="number" inputmode="decimal" min="0" step="0.000001" value="${amountInput(data.signedActual)}" placeholder="待补"></label>
    <label>签收数据截至<input name="signedAsOf" type="date" value="${escape(data.signedAsOf)}"></label>
    <div class="department-goal-form-actions">
      <button type="submit">保存月目标</button>
      <button type="button" data-goal-action="cancel">取消</button>
    </div>
  </form>`;
}

function renderSlot(slot, month, data, message = '', showRetry = false) {
  const manage = data?.canEdit === true;
  slot.innerHTML = `<header class="department-goals-heading">
    <h2>部门月目标</h2>
    <div>
      <label for="department-goal-month">月份</label>
      <input id="department-goal-month" type="month" min="2000-01" max="2099-12" value="${month}">
      ${manage ? '<button type="button" data-goal-action="edit" aria-expanded="false">编辑月目标</button>' : ''}
    </div>
  </header>
  ${data ? `<div class="department-goals-metrics">
    ${metric('销售', data.salesTarget, data.salesActual, salesDetails(data), manage)}
    ${metric('签收', data.signedTarget, data.signedActual, data.signedAsOf ? '截至 ' + escape(data.signedAsOf) : '实际签收由管理员录入', manage)}
  </div>${manage ? adminForm(data) : ''}` : ''}
  <p class="department-goal-feedback" data-goal-feedback role="status"${message ? '' : ' hidden'}>${escape(message)}</p>
  ${showRetry ? '<button type="button" data-goal-action="retry">重新读取月目标</button>' : ''}`;
}

function toYuan(value) {
  return value === '' ? null : Math.round(Number(value) * 1000000) / 100;
}

export function setupDepartmentGoals(api) {
  const cache = new Map();
  const pending = new Map();
  const hasOpenEditor = () => Boolean(mounted?.querySelector('[data-goal-editor]:not([hidden])'));
  let mounted;
  let selectedMonth;
  let requestId = 0;
  let refreshAfterEdit = false;

  async function load(force = false) {
    const slot = mounted;
    if (!slot) return;
    const month = selectedMonth;
    const request = ++requestId;
    const existing = cache.get(month);
    if (existing && !force) {
      renderSlot(slot, month, existing);
      return;
    }
    renderSlot(slot, month, existing, '正在读取月目标…');
    try {
      let fetchMonth = pending.get(month);
      if (!fetchMonth || force) {
        fetchMonth = api(endpoint + '?month=' + encodeURIComponent(month));
        pending.set(month, fetchMonth);
      }
      const data = await fetchMonth;
      if (request !== requestId) return;
      cache.set(month, data);
      renderSlot(slot, month, data);
    } catch (error) {
      if (request === requestId) renderSlot(slot, month, existing, error.message, true);
    } finally {
      if (request === requestId) pending.delete(month);
    }
  }

  function mount() {
    const slot = document.querySelector(selector);
    if (slot === mounted) return;
    if (slot && hasOpenEditor()) {
      slot.replaceWith(mounted);
      return;
    }
    mounted = slot;
    if (!slot) {
      requestId++;
      return;
    }
    selectedMonth ||= slot.dataset.departmentGoals;
    load();
  }

  const observer = new MutationObserver(mount);
  observer.observe(document.body, { childList: true, subtree: true });
  mount();

  function invalidate() {
    if (hasOpenEditor()) {
      refreshAfterEdit = true;
      return;
    }
    cache.clear();
    pending.clear();
    if (mounted) load(true);
  }
  window.addEventListener('monthly-invalidate', invalidate);
  window.addEventListener('department-goals-invalidate', invalidate);
  window.addEventListener('monthly-reset', () => {
    cache.clear();
    pending.clear();
    requestId++;
    selectedMonth = undefined;
    mounted = undefined;
    refreshAfterEdit = false;
  });

  document.addEventListener('change', event => {
    if (event.target.id !== 'department-goal-month' || !monthPattern.test(event.target.value)) return;
    selectedMonth = event.target.value;
    load();
  });

  document.addEventListener('click', event => {
    const control = event.target.closest('[data-goal-action]');
    const slot = control?.closest(selector);
    if (!slot) return;
    const action = control.dataset.goalAction;
    if (action === 'retry') {
      load(true);
      return;
    }
    const editor = slot.querySelector('form');
    const edit = slot.querySelector('[data-goal-action="edit"]');
    const opening = action === 'edit' && editor.hidden;
    editor.hidden = !opening;
    edit.setAttribute('aria-expanded', String(opening));
    if (opening) editor.elements.salesTarget.focus();
    else {
      edit.focus();
      if (refreshAfterEdit) {
        refreshAfterEdit = false;
        invalidate();
      }
    }
  });

  document.addEventListener('submit', async event => {
    const form = event.target;
    if (!form.matches('[data-goal-editor]')) return;
    event.preventDefault();
    const values = new FormData(form);
    const month = selectedMonth;
    const data = cache.get(month);
    if (!data?.canEdit) return;
    const slot = form.closest(selector);
    const button = form.querySelector('[type="submit"]');
    if (button.disabled) return;
    const message = slot.querySelector('[data-goal-feedback]');
    const payload = {
      month, version: data.version,
      salesTarget: toYuan(values.get('salesTarget')),
      signedTarget: toYuan(values.get('signedTarget')),
      signedActual: toYuan(values.get('signedActual')),
      signedAsOf: values.get('signedAsOf') || null
    };
    button.disabled = true;
    message.hidden = false;
    message.textContent = '正在保存月目标…';
    try {
      const saved = await api(endpoint, payload, 'PUT');
      if (selectedMonth === month && mounted) {
        requestId++;
        refreshAfterEdit = false;
        cache.set(month, saved);
        renderSlot(mounted, month, saved, '月目标已保存。');
      } else {
        cache.delete(month);
      }
    } catch (error) {
      message.textContent = error.status === 409
        ? '月目标已由其他同事更新。刷新后请核对最新值再保存。' : error.message;
    } finally {
      button.disabled = false;
    }
  });
}
