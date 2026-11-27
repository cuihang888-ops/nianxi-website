const form = document.querySelector('#wish-form');
const kind = document.querySelector('#wish-kind');
const text = document.querySelector('#wish-text');
const phone = document.querySelector('#wish-phone');
const submit = document.querySelector('#wish-submit');
const retry = document.querySelector('#wish-retry');
const feedback = document.querySelector('#wish-feedback');
const lists = {
  today: document.querySelector('#wish-list-today'),
  year: document.querySelector('#wish-list-year')
};
const examples = { today: '例如：今天想喝一杯拿铁', year: '例如：今年想收到一本画册' };
const dateFormat = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', month: 'long', day: 'numeric'
});
let ready = false;
let busy = false;
let canModerate = false;

async function api(path, payload) {
  const response = await fetch(new URL('../api/tearoom/' + path, document.baseURI), {
    credentials: 'same-origin',
    cache: 'no-store',
    ...(payload === undefined ? {} : {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || data.message || '暂时无法连接，请重试。');
    error.status = response.status;
    throw error;
  }
  return data;
}

function element(tag, className, label) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (label !== undefined) node.textContent = label;
  return node;
}

function button(label, action) {
  const node = element('button', 'btn ghost small', label);
  node.type = 'button';
  node.dataset.action = action;
  return node;
}

function wishCard(wish) {
  const card = element('article', 'card');
  card.dataset.id = wish.id;
  const body = element('p', '', wish.text);
  const meta = element('div', 'meta');
  const date = new Date(wish.date);
  const dateText = Number.isNaN(date.valueOf()) ? '' : dateFormat.format(date);
  meta.append(
    element('span', '', [wish.name, dateText].filter(Boolean).join(' · ')),
    element('span', wish.fulfilled ? 'status done' : 'status wait', wish.fulfilled ? '已实现' : '待实现')
  );
  card.append(body, meta);
  if (canModerate) {
    const controls = element('div', 'wish-control-row');
    if (wish.hasContact) controls.append(button('查看联系电话', 'contact'));
    const toggle = button(wish.fulfilled ? '标为待实现' : '标为已实现', 'status');
    toggle.dataset.fulfilled = String(!wish.fulfilled);
    controls.append(toggle);
    const contact = element('div', 'wish-contact');
    contact.hidden = true;
    card.append(controls, contact);
  }
  return card;
}

function render(data) {
  if (!Array.isArray(data.wishes)) throw new Error('愿望墙暂时无法读取，请重试。');
  canModerate = data.canModerate === true;
  for (const [key, list] of Object.entries(lists)) {
    const wishes = data.wishes.filter(wish => wish.kind === key);
    const cards = wishes.length ? wishes.map(wishCard) : [element('p', 'empty', '暂无愿望')];
    list.replaceChildren(...cards);
  }
}

async function loadWall() {
  ready = false;
  submit.disabled = true;
  retry.hidden = true;
  feedback.textContent = '正在打开愿望墙…';
  try {
    await api('session', {});
    render(await api('wishes'));
    ready = true;
    feedback.textContent = '';
  } catch (error) {
    feedback.textContent = error.message || '愿望墙暂时无法读取。';
    retry.hidden = false;
  } finally {
    submit.disabled = !ready;
  }
}

async function run(trigger, work) {
  if (!ready || busy) return;
  busy = true;
  trigger.disabled = true;
  submit.disabled = true;
  feedback.textContent = '';
  try {
    await work();
  } catch (error) {
    if (error.status === 401) {
      await loadWall();
      if (ready) feedback.textContent = '连接已恢复，请重试操作。';
    } else {
      feedback.textContent = error.message || '操作失败，请重试。';
    }
  } finally {
    busy = false;
    trigger.disabled = false;
    submit.disabled = !ready;
  }
}

kind.addEventListener('change', () => { text.placeholder = examples[kind.value]; });
retry.addEventListener('click', loadWall);

form.addEventListener('submit', event => {
  event.preventDefault();
  const wishText = text.value.trim();
  if (!wishText) {
    feedback.textContent = '请填写愿望。';
    text.focus();
    return;
  }
  const payload = { kind: kind.value, text: wishText };
  if (phone.value.trim()) payload.phone = phone.value.trim();
  run(submit, async () => {
    render(await api('wishes', payload));
    text.value = '';
    phone.value = '';
    feedback.textContent = '愿望已发布。';
  });
});

for (const list of Object.values(lists)) {
  list.addEventListener('click', event => {
    const trigger = event.target.closest('button[data-action]');
    const card = trigger?.closest('[data-id]');
    if (!card || !canModerate) return;
    const path = 'wishes/' + encodeURIComponent(card.dataset.id);
    const contact = card.querySelector('.wish-contact');
    if (trigger.dataset.action === 'contact' && !contact.hidden) {
      contact.textContent = '';
      contact.hidden = true;
      trigger.textContent = '查看联系电话';
      return;
    }
    run(trigger, async () => {
      if (trigger.dataset.action === 'contact') {
        const data = await api(path + '/contact');
        contact.textContent = data.phone || '未填写电话';
        contact.hidden = false;
        trigger.textContent = '收起联系电话';
      } else {
        const fulfilled = trigger.dataset.fulfilled === 'true';
        render(await api(path + '/status', { fulfilled }));
        feedback.textContent = fulfilled ? '已标为实现。' : '已标为待实现。';
      }
    });
  });
}

loadWall();
