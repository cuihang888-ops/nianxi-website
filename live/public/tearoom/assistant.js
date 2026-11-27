const form = document.querySelector('#ai-form');
const task = document.querySelector('#ai-task');
const language = document.querySelector('#ai-language');
const target = document.querySelector('#ai-target');
const source = document.querySelector('#ai-source');
const count = document.querySelector('#ai-count');
const submit = document.querySelector('#ai-submit');
const retry = document.querySelector('#ai-retry');
const service = document.querySelector('#ai-service');
const feedback = document.querySelector('#ai-feedback');
const result = document.querySelector('#ai-result');
const output = document.querySelector('#ai-output');
const resultMode = document.querySelector('#ai-result-mode');
const copy = document.querySelector('#ai-copy');
const copyStatus = document.querySelector('#ai-copy-status');
const usagePanel = document.querySelector('#ai-usage-panel');
const usageToggle = document.querySelector('#ai-usage-toggle');
const usageDetails = document.querySelector('#ai-usage-details');
const usageFeedback = document.querySelector('#ai-usage-feedback');
const usageTable = document.querySelector('#ai-usage-table');
const usageBody = usageTable.querySelector('tbody');
const labels = { translate: '开始翻译', polish: '开始润色' };
const serviceLabels = {
  demo: '演示模式 · 返回模拟结果',
  pilot: '管理员试用',
  live: '服务已连接',
  off: '服务未启用'
};
let mode = 'off';
let needsTeaSession = false;
let busy = false;

async function api(path, payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 35000);
  const options = { credentials: 'same-origin', cache: 'no-store', signal: controller.signal };
  if (payload !== undefined) {
    options.method = 'POST';
    options.headers = { 'Content-Type': 'application/json' };
    options.body = JSON.stringify(payload);
  }
  try {
    const response = await fetch(new URL('../api/' + path, document.baseURI), options);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(body.error || body.message || '暂时无法连接，请重试。');
      error.status = response.status;
      throw error;
    }
    return body;
  } catch (error) {
    if (controller.signal.aborted) throw new Error('服务响应超时，请重试。');
    if (error instanceof TypeError) throw new Error('连接中断，请重试。');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function refreshControls() {
  language.hidden = task.value !== 'translate';
  target.disabled = language.hidden || busy;
  task.disabled = busy;
  source.readOnly = busy;
  submit.disabled = busy || mode === 'off';
  submit.textContent = busy ? '正在处理…' : labels[task.value];
  count.textContent = source.value.length + ' / 2000 字';
}

async function checkService() {
  retry.hidden = true;
  usagePanel.hidden = true;
  mode = 'off';
  needsTeaSession = false;
  refreshControls();
  service.textContent = '正在检查服务…';
  feedback.textContent = '';
  try {
    const status = await api('ai/status');
    mode = Object.hasOwn(serviceLabels, status.mode) ? status.mode : 'off';
    needsTeaSession = (mode === 'demo' || mode === 'live') && status.needsTeaSession === true;
    service.textContent = serviceLabels[mode];
    usagePanel.hidden = status.canViewUsage !== true;
  } catch (error) {
    const closed = error.status === 404;
    service.textContent = closed ? serviceLabels.off : '服务连接失败';
    retry.hidden = closed;
  } finally {
    refreshControls();
  }
}

task.addEventListener('change', refreshControls);
source.addEventListener('input', refreshControls);
retry.addEventListener('click', checkService);

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (busy || mode === 'off') return;
  const text = source.value.trim();
  if (!text) {
    feedback.textContent = '请填写要处理的文字。';
    source.focus();
    return;
  }
  const payload = { task: task.value, text };
  if (task.value === 'translate') payload.target = target.value;
  busy = true;
  refreshControls();
  feedback.textContent = '正在处理，请稍候。';
  result.hidden = true;
  copyStatus.textContent = '';
  try {
    if (needsTeaSession) {
      await api('tearoom/session', {});
      needsTeaSession = false;
    }
    const reply = await api('ai/chat', payload);
    if (typeof reply.text !== 'string' || !reply.text.trim()) throw new Error('未收到处理结果，请重试。');
    output.value = reply.text;
    resultMode.hidden = reply.mode !== 'demo';
    result.hidden = false;
    feedback.textContent = '处理完成。';
  } catch (error) {
    if ([401, 403, 404].includes(error.status)) {
      await checkService();
      feedback.textContent = mode === 'off' ? error.message : '请重新提交原文。';
    } else {
      feedback.textContent = error.message || '暂时无法处理，请重试。';
    }
  } finally {
    busy = false;
    refreshControls();
  }
});

copy.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(output.value);
    copyStatus.textContent = '已复制';
  } catch {
    output.focus();
    output.select();
    let copied = false;
    try { copied = document.execCommand('copy'); } catch {}
    copyStatus.textContent = copied ? '已复制' : '结果已选中，请手动复制';
  }
});

usageToggle.addEventListener('click', async () => {
  const expanded = usageDetails.hidden;
  usageDetails.hidden = !expanded;
  usageToggle.setAttribute('aria-expanded', String(expanded));
  usageToggle.textContent = expanded ? '收起每日用量' : '查看每日用量';
  if (!expanded) return;
  usageToggle.disabled = true;
  usageTable.hidden = true;
  usageFeedback.textContent = '正在读取每日用量…';
  try {
    const data = await api('ai/usage');
    const days = Array.isArray(data.days) ? data.days : [];
    const columns = ['date', 'requests', 'primaryAttempts', 'fallbackAttempts', 'providerInputTokens', 'providerOutputTokens', 'meteredAttempts'];
    const rows = days.map(day => {
      const row = document.createElement('tr');
      for (const field of columns) {
        const value = row.insertCell();
        value.textContent = day[field] ?? '—';
      }
      return row;
    });
    usageBody.replaceChildren(...rows);
    usageTable.hidden = !rows.length;
    usageFeedback.textContent = rows.length ? '' : '暂无用量记录。';
  } catch (error) {
    usageFeedback.textContent = error.message;
  } finally {
    usageToggle.disabled = false;
  }
});

checkService();
