// 看板「员工反馈」视图：汇总茶水间的优化建议、吐槽与协调事项，外加录入完整性总览与荣誉发布。
// 数据全部走看板权限接口（/api/dashboard/*），未解锁看板的会话在服务端就拿不到正文。
const selector = '[data-feedback-root]';
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));
const todayText = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date());

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
  let compDate = todayText;
  let message = '';
  let loading = false;

  async function load(force = false) {
    if (!mounted || loading) return;
    loading = true;
    try {
      const [nextFeedback, nextRange, nextHonors] = await Promise.all([
        api('/api/dashboard/feedback'),
        api('/api/dashboard/completeness'),
        api('/api/dashboard/honors')
      ]);
      feedback = nextFeedback;
      compRange = nextRange;
      honors = nextHonors.honors || [];
      if (!force) message = '';
    } catch (error) {
      message = error.message || '员工反馈暂时无法加载';
    } finally {
      loading = false;
      render();
    }
  }

  function render() {
    if (!mounted) return;
    if (!feedback) {
      mounted.innerHTML = `<p class="fb-note">${esc(message || '正在读取员工反馈…')}</p>`;
      return;
    }
    const counts = feedback.counts;
    const pendingSessions = (compDay?.accounts || []).flatMap(group =>
      group.sessions.filter(session => session.status === 'partial' || session.status === 'empty')
        .map(session => ({ group, session })));
    const rangePendingDays = (compRange?.days || []).filter(day => day.summary.partial + day.summary.empty > 0);
    const rangePendingAccounts = (compRange?.accounts || []).filter(group => group.summary.partial + group.summary.empty > 0);
    mounted.innerHTML = `
    ${message ? `<p class="fb-message" role="status">${esc(message)}</p>` : ''}
    <div class="fb-summary">
      <div class="fb-stat"><strong>${counts.suggestionsPending}</strong><span>待处理建议</span></div>
      <div class="fb-stat ${counts.suggestionsOverdue ? 'danger' : ''}"><strong>${counts.suggestionsOverdue}</strong><span>已超时（48 小时）</span></div>
      <div class="fb-stat"><strong>${counts.coordinatesOpen}</strong><span>待协调事项</span></div>
      <div class="fb-stat"><strong>${counts.ventsLast7Days}</strong><span>近 7 天心声</span></div>
    </div>

    <section class="fb-block">
      <h2>录入完整性总览（本月）</h2>
      <div class="fb-row">
        ${compRange ? `<span class="fb-note">${esc(compRange.from)} 至 ${esc(compRange.to)} · 共 ${compRange.summary.expected} 场 · 已录齐 ${compRange.summary.complete} · 待补 ${compRange.summary.partial} · 未录入 ${compRange.summary.empty}${compRange.summary.stopped ? ' · 停播 ' + compRange.summary.stopped : ''}（跨月不再提醒）</span>` : '<span class="fb-note">正在读取…</span>'}
      </div>
      ${compRange && !(compRange.summary.partial + compRange.summary.empty) ? '<p class="fb-note">本月各场次均已录齐。</p>' : ''}
      ${rangePendingAccounts.length ? `<ul class="fb-missing">${rangePendingAccounts.map(group => `<li>
        <b>${esc(group.accountName)}</b>
        <span class="${group.summary.empty ? 'fb-over' : 'fb-wait'}">本月待补 ${group.summary.partial + group.summary.empty} 场${group.summary.empty ? ' · 未录入 ' + group.summary.empty : ''}${group.summary.partial ? ' · 缺项 ' + group.summary.partial : ''}</span>
      </li>`).join('')}</ul>` : ''}
      ${rangePendingDays.length ? `<ul class="fb-missing">${rangePendingDays.slice().reverse().map(day => `<li>
        <b>${esc(day.date)}</b>
        <span class="${day.summary.empty ? 'fb-over' : 'fb-wait'}">待补 ${day.summary.partial + day.summary.empty} 场${day.summary.empty ? ' · 未录入 ' + day.summary.empty : ''}${day.summary.partial ? ' · 缺项 ' + day.summary.partial : ''}</span>
        <button type="button" class="fb-toggle fb-day-button" data-feedback-day="${esc(day.date)}">查看明细</button>
      </li>`).join('')}</ul>` : ''}
      <div class="fb-row">
        <label>查看某日明细 <input type="date" data-feedback-date value="${esc(compDate)}"></label>
        ${compDay ? `<span class="fb-note">${esc(compDay.date)} · 共 ${compDay.summary.expected} 场 · 已录齐 ${compDay.summary.complete} · 待补 ${compDay.summary.partial} · 未录入 ${compDay.summary.empty}${compDay.summary.stopped ? ' · 停播 ' + compDay.summary.stopped : ''}</span>` : '<span class="fb-note">点上方某一天的「查看明细」或选日期，看当天待补场次。</span>'}
      </div>
      ${compDay ? (pendingSessions.length ? `<ul class="fb-missing">${pendingSessions.map(({ group, session }) => `<li>
        <b>${esc(group.accountName)}</b> · ${esc(session.anchorName)}（${esc(session.slotLabel)}）
        <span class="${session.status === 'empty' ? 'fb-over' : 'fb-wait'}">${session.status === 'empty' ? '未录入' : '待补'}：缺 ${esc(session.missing.join('、'))}</span>
      </li>`).join('')}</ul>` : '<p class="fb-note">该日各场次均已录齐。</p>') : ''}
    </section>

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
        <label>或照片地址（可空）<input type="text" name="photoUrl" maxlength="500" placeholder="https://… 或 / 开头"></label>
        <button type="submit">发布到荣誉墙</button>
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
      render();
      load();
    }
  }
  new MutationObserver(mount).observe(document.body, { childList: true, subtree: true });
  mount();

  function loadDayDetail(targetDate) {
    compDate = targetDate;
    api('/api/dashboard/completeness?date=' + encodeURIComponent(targetDate))
      .then(result => { compDay = result; render(); })
      .catch(error => { message = error.message; render(); });
  }

  document.addEventListener('change', event => {
    if (event.target.matches?.('[data-feedback-date]')) {
      loadDayDetail(event.target.value || todayText);
    }
  });

  document.addEventListener('click', async event => {
    const dayButton = event.target.closest('[data-feedback-day]');
    if (dayButton && mounted?.contains(dayButton)) {
      loadDayDetail(dayButton.dataset.feedbackDay);
      return;
    }
    const button = event.target.closest('[data-feedback-vent]');
    if (!button || !mounted?.contains(button)) return;
    button.disabled = true;
    try {
      feedback = await api('/api/dashboard/feedback/vents/' + encodeURIComponent(button.dataset.feedbackVent) + '/visibility',
        { hidden: button.dataset.hidden === 'true' }, 'POST');
      message = button.dataset.hidden === 'true' ? '已下架这条吐槽。' : '已恢复展示。';
    } catch (error) {
      message = error.message;
    }
    render();
  });

  document.addEventListener('submit', async event => {
    const form = event.target;
    if (!mounted?.contains(form)) return;
    const suggestion = form.dataset.feedbackSuggestion;
    const coordinate = form.dataset.feedbackCoordinate;
    const isHonor = form.hasAttribute('data-feedback-honor');
    if (!suggestion && !coordinate && !isHonor) return;
    event.preventDefault();
    const button = form.querySelector('[type="submit"]');
    if (button) button.disabled = true;
    try {
      if (suggestion) {
        feedback = await api('/api/dashboard/feedback/suggestions/' + encodeURIComponent(suggestion) + '/status',
          { status: form.elements.status.value, reply: form.elements.reply.value.trim() || undefined }, 'POST');
        message = '建议处理已保存。';
      } else if (coordinate) {
        feedback = await api('/api/dashboard/feedback/coordinates/' + encodeURIComponent(coordinate) + '/status',
          { status: form.elements.status.value }, 'POST');
        message = '协调状态已更新。';
      } else {
        const photoUrl = form.elements.photoUrl.value.trim();
        const file = form.elements.photoFile?.files?.[0];
        const photoData = file ? await shrinkImage(file) : '';
        await api('/api/dashboard/honors', {
          periodType: form.elements.periodType.value,
          personName: form.elements.personName.value.trim(),
          citation: form.elements.citation.value.trim(),
          ...(photoData ? { photoData } : photoUrl ? { photoUrl } : {})
        }, 'POST');
        honors = (await api('/api/dashboard/honors')).honors || [];
        message = '荣誉已发布到茶水间荣誉墙。';
      }
    } catch (error) {
      message = error.message;
    }
    render();
  });
}
