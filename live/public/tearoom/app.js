
const byId = id => document.getElementById(id);
const content = byId('room-content');
const status = byId('room-status');
const pending = byId('room-pending');
const navigation = document.querySelector('nav.bottom');
const categories = ['全部', '砍价', '证书售后', '色名意境', '活动', '英文', '越南语', '采购沟通', '缅语', '其他'];
const views = new Set(['home', 'scripts', 'cases', 'board', 'wall', 'help', 'suggest', 'market', 'gratitude', 'goals', 'search']);
const apiRoot = new URL('../api/tearoom', document.baseURI);
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));
const empty = message => `<div class="empty">${message}</div>`;
const value = id => byId(id).value.trim();
const chinaDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
});
const recordTime = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
});

let view = 'home';
let scriptCat = categories[0];
let state;
let tracked;
let toastTimer;
let starting;

async function api(suffix = '', data) {
  let response;
  try {
    response = await fetch(apiRoot.href + suffix, {
      credentials: 'same-origin',
      cache: 'no-store',
      ...(data === undefined ? {} : {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
    });
  } catch {
    const message = suffix === '/session'
      ? '茶水间连接失败，请重试。'
      : '连接中断。请先刷新确认结果，再重试。';
    throw new Error(message);
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error || '茶水间暂时无法连接，请重试。');
    error.status = response.status;
    throw error;
  }
  return result;
}

function toast(message) {
  const element = byId('toast');
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove('show'), 3500);
}

function showRoom() {
  byId('room-loading').hidden = true;
  byId('profile-toggle').disabled = false;
  for (const button of content.querySelectorAll('button[type="submit"]:disabled')) {
    button.disabled = false;
  }
  renderProfile();
  go(view, false);
}

function renderProfile() {
  byId('profile-name').textContent = state.name;
  byId('profile-input').value = state.name;
  byId('profile-options').innerHTML = (state.suggestedNames || []).map(name =>
    `<button type="button" class="pill" data-name="${escape(name)}" aria-pressed="false">${escape(name)}</button>`
  ).join('');
}

function toggleProfile(open) {
  byId('profile-form').hidden = !open;
  byId('profile-toggle').setAttribute('aria-expanded', String(open));
  if (open) {
    renderProfile();
    byId('profile-input').focus();
  } else {
    byId('profile-toggle').focus();
  }
}

function go(next, scroll = true) {
  if (!views.has(next)) return;
  view = next;
  for (const name of views) byId('view-' + name).classList.toggle('hidden', name !== next);
  for (const button of navigation.querySelectorAll('[data-go]')) {
    if (button.dataset.go === next) {
      button.classList.add('on');
      button.setAttribute('aria-current', 'page');
    } else {
      button.classList.remove('on');
      button.removeAttribute('aria-current');
    }
  }
  renderView();
  if (scroll) window.scrollTo(0, 0);
}

function displayTime(raw) {
  const date = new Date(raw);
  return raw && Number.isFinite(date.valueOf()) ? recordTime.format(date) : String(raw ?? '');
}

function stamp(row) {
  return row.createdAt ?? row.time;
}

function topQuote() {
  const today = chinaDay.format(new Date());
  return state.wall.filter(row => {
    const timestamp = stamp(row);
    const date = new Date(timestamp);
    if (timestamp && Number.isFinite(date.valueOf())) return chinaDay.format(date) === today;
    const time = String(timestamp ?? '').match(/^(\d{1,2})[-/](\d{1,2})\s/);
    if (!time) return false;
    return today.slice(5) === time.slice(1).map(part => part.padStart(2, '0')).join('-');
  }).sort((a, b) => b.cheers - a.cheers)[0];
}

function action(label, data) {
  return `<button type="button" class="act${data.active ? ' on' : ''}" data-action="${data.action}" data-id="${escape(data.id)}"
      ${data.active === undefined ? '' : `aria-pressed="${data.active}"`}>${escape(label)}</button>`;
}

function favorite(row, kind) {
  const selected = Boolean((kind === 'script' ? state.favScripts : state.favCases)[row.id]);
  return action(`${selected ? '已收藏' : '收藏'} ${row.fav}`, { action: 'favorite', id: row.id, active: selected });
}

function cheer(row) {
  const selected = Boolean(state.cheered[row.id]);
  return action(`${selected ? '已加油' : '加油'} ${row.cheers}`, { action: 'cheer', id: row.id, active: selected });
}

function caseCard(row) {
  return `<article class="card"><h3>${escape(row.title)}</h3><p>${escape(row.body)}</p>
    <div class="meta"><span>${escape(row.author || '匿名同事')} · ${escape(displayTime(stamp(row)))}</span>${favorite(row, 'case')}</div></article>`;
}

function messageCard(row, isQuote = false) {
  return `<article class="card"><p>${isQuote ? `<b>“${escape(row.body)}”</b>` : `<b>${escape(row.who)}：</b>${escape(row.body)}`}</p>
    <div class="meta"><span>${isQuote ? escape(row.who) + ' · ' : ''}${escape(displayTime(stamp(row)))}</span>${cheer(row)}</div></article>`;
}

function helpCard(row, compact) {
  const status = row.solved ? '已解决' : row.handler ? '已认领' : '待回答';
  const assignment = row.handler ? `<span>认领人 ${escape(row.handler)}</span>` : '';
  const claimControl = !row.solved && !row.mine
    ? row.claimedByMe ? action('撤回认领', { action: 'unclaim', id: row.id })
      : row.handler ? '' : action('认领求助', { action: 'claim', id: row.id })
    : '';
  const thanksControl = row.mine && row.solved && row.handler
    ? row.thanked ? '<span class="status done">已发送感谢</span>' : action('一键感谢', { action: 'helpThank', id: row.id })
    : '';
  return `<article class="card"><h3>${escape(row.title)}</h3>${!compact && row.body ? `<p>${escape(row.body)}</p>` : ''}
    <div class="meta"><span>${escape(row.who)} · ${escape(displayTime(stamp(row)))}</span>
    <span class="status ${row.solved ? 'done' : 'wait'}">${status}</span>${assignment}
    ${compact ? `<span>${row.answers.length} 个回答</span>` : ''}
    ${row.mine && !row.solved && !compact ? action('标为已解决', { action: 'solve', id: row.id }) : ''}
    ${compact ? '' : claimControl + thanksControl}</div>
    ${compact ? '' : row.answers.map(answer => `<div class="answer"><p><b>${escape(answer.who)}：</b>${escape(answer.body)}</p>
      <div class="meta">${escape(displayTime(stamp(answer)))}</div></div>`).join('')}
    ${compact || row.solved ? '' : `<form class="pub answer-form" data-answer="${escape(row.id)}"><div class="row">
      <input type="text" name="answer" aria-label="回复求助" maxlength="1000" placeholder="写个回答帮帮 TA" required>
      <button class="btn small" type="submit">回答</button></div></form>`}
  </article>`;
}

function renderHome() {
  const quote = topQuote();
  byId('dailyQuote').innerHTML = quote ? `<div class="tag">每日一句</div>
    <div class="text">“${escape(quote.body)}”</div><div class="from">${escape(quote.who)}</div>
    <div class="quote-action">${cheer(quote)}</div>` : `<div class="tag">每日一句</div><div class="from">今天还没有励志留言</div>
    <button class="btn warm small quote-action" type="button" data-go="wall">去励志墙</button>`;
  byId('homeCases').innerHTML = state.cases.slice(0, 2).map(caseCard).join('') || empty('暂无案例');
  byId('homeBoard').innerHTML = state.board.slice(0, 3).map(row => messageCard(row)).join('') || empty('暂无留言');
  byId('homeHelp').innerHTML = state.help.slice(0, 2).map(row => helpCard(row, true)).join('') || empty('暂无求助');
}

function renderScripts() {
  if (!state) return;
  const keyword = value('scriptSearch').toLocaleLowerCase();
  byId('scriptCats').innerHTML = categories.map(category =>
    `<button type="button" class="pill${category === scriptCat ? ' warm' : ''}" data-cat="${category}" aria-pressed="${category === scriptCat}">${category}</button>`
  ).join('');
  const matching = state.scripts.filter(row => (
    (scriptCat === '全部' || scriptCat === row.cat)
    && (!keyword || (row.title + row.body + row.cat).toLocaleLowerCase().includes(keyword))
  )).sort((a, b) => b.fav - a.fav);
  byId('scriptList').innerHTML = matching.map(scriptCard).join('') || empty(keyword ? '暂无匹配的话术' : '暂无话术');
}

function scriptCard(row) {
  return `<article class="card"><h3><span class="pill">${escape(row.cat)}</span>
    ${row.sample ? '<span class="pill warm">培训示例</span>' : ''}${escape(row.title)}</h3><p>${escape(row.body)}</p>
    <div class="meta"><span>${escape(row.author || '匿名同事')} · ${escape(displayTime(stamp(row)))}</span>
    ${action('复制话术', { action: 'copy', id: row.id })}${favorite(row, 'script')}</div></article>`;
}

function renderResourceSearch() {
  if (!state) return;
  const keyword = value('resourceSearch').toLocaleLowerCase();
  if (!keyword) {
    byId('resourceResults').innerHTML = '';
    return;
  }
  const groups = [
    ['话术库', state.scripts, scriptCard],
    ['优秀案例', state.cases, caseCard],
    ['求助台', state.help, row => helpCard(row, false)]
  ];
  const results = groups.map(([label, rows, render]) => {
    const matching = rows.filter(row => [row.title, row.body, row.cat, ...(row.answers || []).map(answer => answer.body)]
      .join(' ').toLocaleLowerCase().includes(keyword));
    return matching.length ? `<h3 class="resource-heading">${label} · ${matching.length} 条</h3>${matching.map(render).join('')}` : '';
  });
  byId('resourceResults').innerHTML = results.join('') || empty('暂无匹配内容');
}

function renderGratitude() {
  byId('gratitudeList').innerHTML = (state.gratitude || []).map(row => {
    const liked = Boolean(state.likedGratitude[row.id]);
    return `<article class="card"><h3>${escape(row.from)} 感谢 ${escape(row.recipient)}</h3><p>${escape(row.body)}</p>
      <div class="meta"><span>${escape(displayTime(stamp(row)))}</span>
      ${action(`${liked ? '已点赞' : '点赞'} ${row.likes}`, { action: 'gratitudeLike', id: row.id, active: liked })}</div></article>`;
  }).join('') || empty('暂无感谢');
}

function renderGoals() {
  byId('goalForm').hidden = !state.canModerate;
  byId('goalList').innerHTML = (state.goals || []).map(row => `<article class="card">
    <h3>${escape(row.title)}</h3><p>${escape(row.body)}</p>
    <div class="meta"><span>负责人 ${escape(row.owner)}</span>${row.due ? `<span>${escape(row.due)} 前</span>` : ''}
      <span class="status ${row.status === '已完成' ? 'done' : 'wait'}">${escape(row.status)}</span></div>
    ${state.canModerate ? `<details class="goal-edit"><summary>编辑协作目标</summary>
      <form class="pub" data-goal-id="${escape(row.id)}">
        <input name="title" aria-label="协作目标" maxlength="100" value="${escape(row.title)}" required>
        <textarea name="body" aria-label="协作说明" maxlength="500" required>${escape(row.body)}</textarea>
        <input name="owner" aria-label="负责人" maxlength="40" value="${escape(row.owner)}" required>
        <label class="goal-date">完成日期 <input name="due" type="date" value="${escape(row.due)}"></label>
        <label class="goal-date">进度 <select name="status">${['待开始', '进行中', '已完成'].map(status => `<option${row.status === status ? ' selected' : ''}>${status}</option>`).join('')}</select></label>
        <button type="submit" class="btn small">保存目标</button>
      </form></details>` : ''}
  </article>`).join('') || empty('暂无协作目标');
}

function suggestionCard(row, isPublic = false) {
  return `<article class="card">
    ${isPublic ? '' : `<h3>${escape(row.code)}</h3><p>${escape(row.body)}</p>`}
    <div class="meta"><span>${escape(displayTime(stamp(row)))}</span>
      <span class="status ${row.status === '已回复' ? 'done' : 'wait'}">${escape(row.status)}</span></div>
    ${row.reply ? `<p class="reply"><b>回复</b> ${escape(row.reply)}</p>` : ''}
  </article>`;
}

function renderSuggestions() {
  const mine = state.suggest.filter(row => row.mine);
  const personal = tracked && !mine.some(row => row.code === tracked.code) ? [tracked, ...mine] : mine;
  byId('mySuggest').innerHTML = personal.length ? `<h2>建议进度</h2>${personal.map(row => suggestionCard(row)).join('')}` : '';
  const published = state.suggest.filter(row => row.status === '已回复' && row.reply && row.public !== false);
  byId('suggestPublic').innerHTML = published.map(row => suggestionCard(row, true)).join('') || empty('暂无公开回复');
  byId('suggest-admin').hidden = !state.canModerate;
  if (!state.canModerate) return;
  byId('suggest-admin-list').innerHTML = state.suggest.map(row => `<div class="moderator-item">
    ${suggestionCard(row)}
    <form class="pub" data-suggestion-reply="${escape(row.code)}">
      <label>进度 <select name="status"><option${row.status === '已收到' ? ' selected' : ''}>已收到</option>
        <option${row.status === '处理中' ? ' selected' : ''}>处理中</option>
        <option${row.status === '已回复' ? ' selected' : ''}>已回复</option></select></label>
      <textarea name="reply" maxlength="1000" aria-label="建议回复" placeholder="填写回复">${escape(row.reply)}</textarea>
      <button class="btn small" type="submit">保存答复</button>
    </form></div>`).join('') || empty('暂无建议');
}

function renderView() {
  if (!state) return;
  if (view === 'home') renderHome();
  else if (view === 'scripts') renderScripts();
  else if (view === 'search') renderResourceSearch();
  else if (view === 'gratitude') renderGratitude();
  else if (view === 'goals') renderGoals();
  else if (view === 'cases') byId('caseList').innerHTML = state.cases.map(caseCard).join('') || empty('暂无案例');
  else if (view === 'board') byId('boardList').innerHTML = state.board.map(row => messageCard(row)).join('') || empty('暂无留言');
  else if (view === 'wall') {
    const top = topQuote();
    const rows = top ? [top, ...state.wall.filter(row => row.id !== top.id)] : state.wall;
    byId('wallList').innerHTML = rows.map(row => messageCard(row, true)).join('') || empty('暂无励志留言');
  } else if (view === 'help') byId('helpList').innerHTML = state.help.map(row => helpCard(row, false)).join('') || empty('暂无求助');
  else if (view === 'suggest') renderSuggestions();
  else if (view === 'market') byId('marketList').innerHTML = state.market.map(row => `<article class="card">
    <h3><span class="pill">${escape(row.type)}</span>${escape(row.title)}</h3>
    <div class="meta"><span>联系 ${escape(row.contact || '请联系发帖人')}</span><span>${escape(displayTime(stamp(row)))}</span></div>
  </article>`).join('') || empty('暂无集市消息');
}

async function doAction(data, success, form) {
  const updated = await api('/actions', data);
  state = updated;
  if (tracked && data.action === 'suggestReply' && data.code === tracked.code) {
    tracked = undefined;
  }
  if (form) form.reset();
  if (updated.submittedCode) {
    byId('suggest-receipt').innerHTML = `<article class="card"><p>已提交。请保存编号 <strong>${escape(updated.submittedCode)}</strong></p></article>`;
  }
  renderView();
  if (success) toast(success);
}

async function withBusy(button, label, work) {
  if (!button || button.disabled || pending.textContent) return;
  button.disabled = true;
  pending.textContent = label;
  try {
    await work();
  } catch (error) {
    if (error.status === 401) {
      const recovered = await start();
      toast(recovered ? '连接已恢复，请重新试一次。' : '连接失败，请刷新后再试。');
    } else toast(error.message);
  } finally {
    pending.textContent = '';
    button.disabled = false;
  }
}

async function copyScript(id) {
  const script = state.scripts.find(row => row.id === id);
  if (!script) return;
  try {
    await navigator.clipboard.writeText(script.body);
    toast('话术已复制');
  } catch {
    const area = document.createElement('textarea');
    area.value = script.body;
    area.className = 'copy-source';
    document.body.append(area);
    area.select();
    const copied = document.execCommand('copy');
    area.remove();
    toast(copied ? '话术已复制' : '复制失败，请长按话术正文复制');
  }
}

const publishForms = {
  scriptForm: ['script', { cat: 'scriptCat', title: 'scriptTitle', body: 'scriptBody' }, '话术已发布'],
  caseForm: ['case', { title: 'caseTitle', body: 'caseBody' }, '案例已分享'],
  boardForm: ['board', { body: 'boardBody' }, '已匿名发布'],
  wallForm: ['wall', { body: 'wallBody' }, '已贴上励志墙'],
  helpForm: ['help', { title: 'helpTitle', body: 'helpBody' }, '求助已发布'],
  suggestForm: ['suggest', { body: 'suggestBody' }, '建议已提交'],
  marketForm: ['market', { type: 'marketType', title: 'marketTitle' }, '集市消息已发布'],
  gratitudeForm: ['gratitude', { recipient: 'gratitudeRecipient', body: 'gratitudeBody' }, '感谢已发布'],
  goalForm: ['goal', { title: 'goalTitle', body: 'goalBody', owner: 'goalOwner', due: 'goalDue' }, '目标已添加']
};

document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.go) {
    if (button.dataset.cat) {
      scriptCat = button.dataset.cat;
      byId('scriptSearch').value = '';
    }
    go(button.dataset.go);
    return;
  }
  if (!state) return;
  if (button.dataset.cat) {
    scriptCat = button.dataset.cat;
    renderScripts();
    return;
  }
  const name = button.dataset.action;
  if (button.dataset.name) {
    byId('profile-input').value = button.dataset.name;
    setSuggestedNameSelection();
    return;
  }
  if (name === 'open-profile') {
    toggleProfile(byId('profile-form').hidden);
    return;
  }
  if (name === 'close-profile') {
    toggleProfile(false);
    return;
  }
  if (name === 'copy') copyScript(button.dataset.id);
  else if (['claim', 'unclaim', 'solve', 'helpThank'].includes(name)) {
    const result = { claim: '已认领求助', unclaim: '已撤回认领', solve: '已标为解决', helpThank: '感谢已发布到感谢墙' }[name];
    withBusy(button, '正在保存…', () => doAction({ action: name, id: button.dataset.id }, result));
  } else if (['favorite', 'cheer', 'gratitudeLike'].includes(name)) {
    withBusy(button, '正在更新…', () => doAction({ action: name, id: button.dataset.id, active: button.getAttribute('aria-pressed') !== 'true' }));
  }
});

document.addEventListener('submit', event => {
  const form = event.target;
  event.preventDefault();
  const button = event.submitter || form.querySelector('button[type="submit"]');
  if (!state) return;
  if (form.id === 'profile-form') {
    withBusy(button, '正在保存昵称…', async () => {
      state = await api('/profile', { name: value('profile-input') });
      renderProfile();
      toggleProfile(false);
      renderView();
      toast('昵称已更新');
    });
    return;
  }
  if (form.dataset.answer) {
    withBusy(button, '正在发布回答…', () => doAction({ action: 'answer', id: form.dataset.answer, body: form.elements.answer.value.trim() }, '回答已发布', form));
    return;
  }
  if (form.dataset.goalId) {
    const fields = Object.fromEntries(new FormData(form));
    withBusy(button, '正在保存目标…', () => doAction({ action: 'goalUpdate', id: form.dataset.goalId, ...fields }, '协作目标已更新'));
    return;
  }
  if (form.dataset.suggestionReply) {
    withBusy(button, '正在保存答复…', () => doAction({
      action: 'suggestReply', code: form.dataset.suggestionReply,
      status: form.elements.status.value, reply: form.elements.reply.value.trim()
    }, '建议进度已更新'));
    return;
  }
  if (form.id === 'suggestLookup') {
    withBusy(button, '正在查询…', async () => {
      const code = value('lookupCode').toUpperCase();
      const result = await api('/actions', { action: 'suggestLookup', code });
      state = result;
      tracked = result.trackedSuggestion;
      renderSuggestions();
    });
    return;
  }
  const definition = publishForms[form.id];
  if (!definition) return;
  const [name, fields, success] = definition;
  const data = Object.fromEntries(Object.entries(fields).map(([key, id]) => [key, value(id)]));
  const label = name === 'suggest' ? '正在提交建议…' : '正在发布…';
  withBusy(button, label, () => doAction({ action: name, ...data }, success, form));
});

byId('scriptSearch').addEventListener('input', renderScripts);
byId('resourceSearch').addEventListener('input', renderResourceSearch);
function homeSearch() {
  byId('resourceSearch').value = value('homeSearch');
  go('search');
  byId('resourceSearch').focus();
}
byId('homeSearchBtn').addEventListener('click', homeSearch);
byId('homeSearch').addEventListener('keydown', event => {
  if (event.key === 'Enter') homeSearch();
});

function setSuggestedNameSelection() {
  const current = value('profile-input');
  for (const button of byId('profile-options').querySelectorAll('button')) {
    const selected = button.dataset.name === current;
    button.classList.toggle('warm', selected);
    button.setAttribute('aria-pressed', String(selected));
  }
}

async function loadRoom() {
  const retry = byId('room-retry');
  retry.hidden = true;
  byId('room-loading').hidden = false;
  status.textContent = '正在打开茶水间…';
  try {
    state = await api('/session', {});
    showRoom();
    return true;
  } catch (error) {
    status.textContent = error.message;
    retry.hidden = false;
    return false;
  }
}

function start() {
  starting ??= loadRoom().finally(() => { starting = undefined; });
  return starting;
}

byId('profile-input').addEventListener('input', setSuggestedNameSelection);
byId('room-retry').addEventListener('click', start);
start();
