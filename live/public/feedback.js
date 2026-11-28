const selector = '[data-feedback-root]';
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));
const todayText = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date());

async function shrinkImage(file) {
  if (file.size > 20 * 1024 * 1024) throw new Error('请选择 20 MB 以内的照片。');
  const image = new Image();
  try {
    image.src = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener('load', () => resolve(reader.result), { once: true });
      reader.addEventListener('error', () => reject(reader.error), { once: true });
      reader.readAsDataURL(file);
    });
    await image.decode();
  } catch {
    throw new Error('无法读取照片，请尝试 JPEG、PNG 或 WebP 图片。');
  }
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 720 / Math.max(image.naturalWidth, image.naturalHeight));
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const preview = canvas.getContext('2d');
  preview.fillStyle = '#fff';
  preview.fillRect(0, 0, canvas.width, canvas.height);
  preview.drawImage(image, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.85, 0.7, 0.55]) {
    const encoded = canvas.toDataURL('image/jpeg', quality);
    if (encoded.length <= 350_000) return encoded;
  }
  throw new Error('照片压缩后仍然过大，请换一张尺寸较小的照片。');
}

function slaLabel(item) {
  if (!item.pending) return '<span class="fb-chip done">已处理</span>';
  const hours = Math.floor(Math.abs(item.remainingMs) / 3_600_000);
  const minutes = Math.floor((Math.abs(item.remainingMs) % 3_600_000) / 60_000);
  if (item.overdue) return `<span class="fb-chip overdue">已超时 ${hours} 小时${minutes ? ' ' + minutes + ' 分' : ''} · 请尽快处理</span>`;
  return `<span class="fb-chip wait">待处理 · 还剩 ${hours} 小时${minutes ? ' ' + minutes + ' 分' : ''}</span>`;
}

export function setupFeedback(api) {
  let mounted = null;
  let feedback = null;
  let compRange = null;
  let compDay = null;
  let honors = [];
  let compDate = '';
  let compDayMessage = '';
  let compDayRequest = 0;
  let message = '';

  async function load(slot) {
    try {
      const managing = slot.dataset.feedbackRoot === 'manage';
      const [nextRange, nextFeedback, nextHonors] = await Promise.all([
        api('/api/dashboard/completeness'),
        ...(managing ? [api('/api/dashboard/feedback'), api('/api/dashboard/honors')] : [])
      ]);
      if (mounted !== slot) return;
      compRange = nextRange;
      feedback = nextFeedback;
      honors = nextHonors?.honors || [];
    } catch (error) {
      if (mounted !== slot) return;
      message = error.message || '暂时无法加载，请刷新重试。';
    } finally {
      if (mounted === slot) render();
    }
  }

  function countSummary(summary) {
    const counts = [`共 ${summary.expected} 场`, `已录齐 ${summary.complete}`, `缺项 ${summary.partial}`, `未录入 ${summary.empty}`];
    if (summary.stopped) counts.push(`停播 ${summary.stopped}`);
    if (summary.upcoming) counts.push(`未到录入时间 ${summary.upcoming}`);
    return counts.join(' · ');
  }

  function pendingSummary(summary) {
    return `待补 ${summary.partial + summary.empty} 场${summary.empty ? ' · 未录入 ' + summary.empty : ''}${summary.partial ? ' · 缺项 ' + summary.partial : ''}`;
  }

  function dayDetail() {
    if (compDayMessage) return `<p class="fb-note">${esc(compDayMessage)}</p>`;
    if (!compDay) return '<p class="fb-note">点上方某一天的「查看明细」，或选择日期。</p>';
    const pendingSessions = compDay.accounts.flatMap(group =>
      group.sessions.filter(session => session.status === 'partial' || session.status === 'empty')
        .map(session => ({ group, session })));
    return `<p class="fb-note">${esc(compDay.date)} · ${countSummary(compDay.summary)}</p>
      ${pendingSessions.length ? `<ul class="fb-missing">${pendingSessions.map(({ group, session }) => `<li>
        <b>${esc(group.accountName)}</b> · ${esc(session.anchorName)}（${esc(session.slotLabel)}）
        <span class="${session.status === 'empty' ? 'fb-over' : 'fb-wait'}">${session.status === 'empty' ? '未录入' : '待补'}：缺 ${esc(session.missing.join('、'))}</span>
      </li>`).join('')}</ul>` : `<p class="fb-note">${compDay.summary.expected ? '该日暂无待补场次。' : '该日暂无场次。'}</p>`}`;
  }

  function render() {
    if (!mounted) return;
    const managing = mounted.dataset.feedbackRoot === 'manage';
    if (!compRange || (managing && !feedback)) {
      mounted.innerHTML = `<p class="fb-note" role="status">${esc(message || '正在读取…')}</p>`;
      return;
    }
    const hasPending = item => item.summary.partial + item.summary.empty > 0;
    const pendingAccounts = compRange.accounts.filter(hasPending);
    const pendingDays = compRange.days.filter(hasPending).reverse();
    const notice = message ? `<p class="fb-message" role="status">${esc(message)}</p>` : '';
    const completenessBlock = `
    <section class="fb-block">
      <h2>录入完整性总览（本月）</h2>
      <p class="fb-note">${esc(compRange.from)} 至 ${esc(compRange.to)} · ${countSummary(compRange.summary)}</p>
      ${pendingAccounts.length ? `<ul class="fb-missing">${pendingAccounts.map(group => `<li>
        <b>${esc(group.accountName)}</b> · <span class="${group.summary.empty ? 'fb-over' : 'fb-wait'}">${pendingSummary(group.summary)}</span>
      </li>`).join('')}</ul>` : `<p class="fb-note">${compRange.summary.expected ? '本月暂无待补场次。' : '本月暂无场次。'}</p>`}
      ${pendingDays.length ? `<ul class="fb-missing fb-day-list">${pendingDays.map(day => `<li>
        <b>${esc(day.date)}</b> · <span class="${day.summary.empty ? 'fb-over' : 'fb-wait'}">${pendingSummary(day.summary)}</span>
        <button type="button" class="fb-toggle fb-day-button" data-feedback-day="${esc(day.date)}" aria-label="查看 ${esc(day.date)} 明细">查看明细</button>
      </li>`).join('')}</ul>` : ''}
      <div class="fb-row fb-day-detail">
        <label>查看某日明细 <input type="date" data-feedback-date value="${esc(compDate)}" max="${esc(compRange.to)}"></label>
      </div>
      <div data-feedback-day-detail role="status">${dayDetail()}</div>
    </section>
`;
    if (!managing) {
      mounted.innerHTML = notice + completenessBlock;
      return;
    }

    const counts = feedback.counts;
    mounted.innerHTML = `
    ${notice}
    <div class="fb-summary">
      <div class="fb-stat"><strong>${counts.suggestionsPending}</strong><span>待处理建议</span></div>
      <div class="fb-stat ${counts.suggestionsOverdue ? 'danger' : ''}"><strong>${counts.suggestionsOverdue}</strong><span>已超时（48 小时）</span></div>
      <div class="fb-stat"><strong>${counts.coordinatesOpen}</strong><span>待协调事项</span></div>
      <div class="fb-stat"><strong>${counts.ventsLast7Days}</strong><span>近 7 天心声</span></div>
    </div>
    ${completenessBlock}
    <section class="fb-block">
      <h2>优化建议（48 小时内给出调整动作或处理进展）</h2>
      ${feedback.suggestions.length ? feedback.suggestions.map(item => `<article class="fb-card ${item.overdue ? 'is-overdue' : ''}">
        <div class="fb-meta"><span>${esc(item.code)}</span><span>${item.anonymous ? '匿名' : '实名 · ' + esc(item.authorName || '')}</span><span>${esc(item.time)}</span>${slaLabel(item)}</div>
        <p class="fb-body">${esc(item.body)}</p>
        ${item.reply ? `<p class="fb-reply"><b>${item.status === '已调整' ? '调整动作' : '处理进展/回复'}：</b>${esc(item.reply)}</p>` : ''}
        <form class="fb-form" data-feedback-suggestion="${esc(item.code)}">
          <label>状态 <select name="status">${['已收到', '处理中', '已调整', '已回复'].map(status => `<option${item.status === status ? ' selected' : ''}>${status}</option>`).join('')}</select></label>
          <input type="text" name="reply" maxlength="1500" placeholder="处理中可记进展；已调整/已回复必填动作或回复" value="">
          <button type="submit">保存处理</button>
        </form>
      </article>`).join('') : '<p class="fb-note">暂无建议。</p>'}
    </section>

    <section class="fb-block">
      <h2>协调事项（仅看板可见）</h2>
      ${feedback.coordinates.length ? feedback.coordinates.map(item => `<article class="fb-card">
        <div class="fb-meta"><span>${esc(item.who)}</span><span>${esc(item.time)}</span><span class="fb-chip ${item.status === '已解决' ? 'done' : 'wait'}">${esc(item.status)}</span></div>
        <h3>${esc(item.title)}</h3>
        <p class="fb-body">${esc(item.body)}</p>
        <form class="fb-form" data-feedback-coordinate="${esc(item.id)}">
          <label>状态 <select name="status">${['已收到', '协调中', '已解决'].map(status => `<option${item.status === status ? ' selected' : ''}>${status}</option>`).join('')}</select></label>
          <button type="submit">更新状态</button>
        </form>
      </article>`).join('') : '<p class="fb-note">暂无协调事项。</p>'}
    </section>

    <section class="fb-block">
      <h2>吐槽墙同步</h2>
      ${feedback.vents.length ? feedback.vents.map(item => `<article class="fb-card ${item.hidden ? 'is-hidden-post' : ''}">
        <div class="fb-meta"><span>${esc(item.who)}</span><span>${esc(item.time)}</span>${item.hidden ? '<span class="fb-chip done">已下架</span>' : ''}</div>
        <p class="fb-body">${esc(item.body)}</p>
        <button type="button" class="fb-toggle" data-feedback-vent="${esc(item.id)}" data-hidden="${item.hidden ? 'false' : 'true'}">${item.hidden ? '恢复展示' : '下架这条'}</button>
      </article>`).join('') : '<p class="fb-note">暂无吐槽。</p>'}
    </section>

    <section class="fb-block">
      <h2>荣誉墙发布</h2>
      <form class="fb-form fb-honor-form" data-feedback-honor>
        <label>周期 <select name="periodType"><option value="month">月度之星</option><option value="week">本周之星</option><option value="yesterday">昨日之星</option></select></label>
        <label>获奖人 <input type="text" name="personName" maxlength="40" required placeholder="昵称"></label>
        <label>颁奖词 <input type="text" name="citation" maxlength="200" required placeholder="一句话颁奖词"></label>
        <label>上传照片 <input type="file" name="photoFile" accept="image/*"></label>
        <label>或照片地址（可空）<input type="text" name="photoUrl" maxlength="500" placeholder="HTTPS 照片链接或站内地址"></label>
        <button type="submit">发布到荣誉墙</button>
        <p class="fb-honor-error" data-honor-error role="alert"></p>
      </form>
      ${honors.length ? `<ul class="fb-honors">${honors.map(item => `<li><span class="fb-chip wait">${esc(item.periodLabel)}</span> <b>${esc(item.personName)}</b> · ${esc(item.citation)} <span class="fb-note">${esc(item.time)}</span></li>`).join('')}</ul>` : '<p class="fb-note">尚未发布过荣誉。</p>'}
    </section>`;
  }

  function mount() {
    const slot = document.querySelector(selector);
    if (slot === mounted) return;
    mounted = slot;
    if (slot) {
      feedback = null;
      compRange = null;
      compDay = null;
      compDate = '';
      compDayMessage = '';
      honors = [];
      message = '';
      render();
      load(slot);
    }
  }
  new MutationObserver(mount).observe(document.body, { childList: true, subtree: true });
  mount();

  async function loadDayDetail(slot, date) {
    const input = slot.querySelector('[data-feedback-date]');
    const display = slot.querySelector('[data-feedback-day-detail]');
    if (!input || !display) return;
    if (date > (compRange?.to || todayText)) {
      input.value = compDate;
      return;
    }
    const request = ++compDayRequest;
    compDate = date;
    compDay = null;
    compDayMessage = date ? '正在读取单日明细…' : '';
    input.value = date;
    display.innerHTML = dayDetail();
    if (!date) return;
    try {
      const result = await api('/api/dashboard/completeness?date=' + encodeURIComponent(date));
      if (mounted !== slot || request !== compDayRequest) return;
      compDay = result;
      compDayMessage = '';
    } catch (error) {
      if (mounted !== slot || request !== compDayRequest) return;
      compDayMessage = error.message || '暂时无法加载，请重试。';
    }
    slot.querySelector('[data-feedback-day-detail]').innerHTML = dayDetail();
  }

  document.addEventListener('change', event => {
    const slot = mounted;
    if (!event.target.matches?.('[data-feedback-date]') || !slot?.contains(event.target)) return;
    loadDayDetail(slot, event.target.value);
  });

  document.addEventListener('click', async event => {
    const slot = mounted;
    const dayButton = event.target.closest('[data-feedback-day]');
    if (dayButton && slot?.contains(dayButton)) {
      loadDayDetail(slot, dayButton.dataset.feedbackDay);
      slot.querySelector('[data-feedback-date]')?.focus();
      return;
    }
    const button = event.target.closest('[data-feedback-vent]');
    if (!button || slot?.dataset.feedbackRoot !== 'manage' || !slot.contains(button)) return;
    button.disabled = true;
    try {
      const updated = await api('/api/dashboard/feedback/vents/' + encodeURIComponent(button.dataset.feedbackVent) + '/visibility',
        { hidden: button.dataset.hidden === 'true' }, 'POST');
      if (mounted !== slot) return;
      feedback = updated;
      message = button.dataset.hidden === 'true' ? '已下架这条吐槽。' : '已恢复展示。';
    } catch (error) {
      if (mounted !== slot) return;
      message = error.message;
    }
    render();
  });

  document.addEventListener('submit', async event => {
    const form = event.target;
    const slot = mounted;
    if (slot?.dataset.feedbackRoot !== 'manage' || !slot.contains(form)) return;
    const suggestion = form.dataset.feedbackSuggestion;
    const coordinate = form.dataset.feedbackCoordinate;
    const isHonor = form.hasAttribute('data-feedback-honor');
    if (!suggestion && !coordinate && !isHonor) return;
    event.preventDefault();
    const button = form.querySelector('[type="submit"]');
    const honorError = form.querySelector('[data-honor-error]');
    if (honorError) honorError.textContent = '';
    if (button) button.disabled = true;
    try {
      if (suggestion) {
        const updated = await api('/api/dashboard/feedback/suggestions/' + encodeURIComponent(suggestion) + '/status',
          { status: form.elements.status.value, reply: form.elements.reply.value.trim() || undefined }, 'POST');
        if (mounted !== slot) return;
        feedback = updated;
        message = '建议处理已保存。';
      } else if (coordinate) {
        const updated = await api('/api/dashboard/feedback/coordinates/' + encodeURIComponent(coordinate) + '/status',
          { status: form.elements.status.value }, 'POST');
        if (mounted !== slot) return;
        feedback = updated;
        message = '协调状态已更新。';
      } else {
        const photoUrl = form.elements.photoUrl.value.trim();
        const file = form.elements.photoFile?.files?.[0];
        const photoData = file ? await shrinkImage(file) : '';
        const published = await api('/api/dashboard/honors', {
          periodType: form.elements.periodType.value,
          personName: form.elements.personName.value.trim(),
          citation: form.elements.citation.value.trim(),
          ...(photoData ? { photoData } : photoUrl ? { photoUrl } : {})
        }, 'POST');
        if (mounted !== slot) return;
        honors = [published, ...honors];
        message = '荣誉已发布到茶水间荣誉墙。';
      }
    } catch (error) {
      if (mounted !== slot) return;
      if (honorError) {
        honorError.textContent = error.message;
        if (button) button.disabled = false;
        return;
      }
      message = error.message;
    }
    render();
  });
}
