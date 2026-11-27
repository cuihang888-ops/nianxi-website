const names = { accounts: '直播间', anchors: '主播', slots: '直播场次' };
const periods = {
  early: { label: '早场', hours: '08:00–13:40' },
  middle: { label: '中场', hours: '14:00–19:40' },
  late: { label: '晚场', hours: '20:00–次日02:00' }
};
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const periodLabel = key => periods[key] ? `${periods[key].label} ${periods[key].hours}` : '时段待确认';
const slotLabel = slot => !slot ? '场次待确认' : slot.name === periods[slot.period]?.label
  ? periodLabel(slot.period) : `${slot.name} · ${periodLabel(slot.period)}`;

export function setupDirectory({ api, dialog, toast, reload, render, isAdmin }) {
  let records;
  let group = 'accounts';
  let scope = 'active';
  let loadError = '';
  let loading = false;

  async function load() {
    if (!isAdmin() || loading) return;
    loading = true;
    try {
      records = await api('/api/directory');
      loadError = '';
    } catch (error) {
      loadError = error.message;
    } finally {
      loading = false;
      render();
    }
  }

  const status = row => row.archived ? '已删除' : row.active === false ? '已停用' : '启用中';
  const roomName = id => records?.accounts.find(room => room.id === id)?.name || '未分配直播间';
  const findSlot = (accountId, slotId) => records?.slots.find(slot => slot.accountId === accountId && slot.id === slotId);
  const endpoint = (kind, row) => `/api/${kind}${row ? `/${encodeURIComponent(row.id)}${kind === 'slots' ? `?accountId=${encodeURIComponent(row.accountId)}` : ''}` : ''}`;

  function page() {
    if (!isAdmin()) return '<h1>直播名录管理</h1><p>请使用管理员账号进入。</p>';
    if (!records && !loading && !loadError) void load();
    const rows = (records?.[group] || []).filter(row => scope === 'active' ? row.active !== false && !row.archived : row.active === false || row.archived);
    return `<section class="directory" data-testid="live-directory">
      <header class="directory-title"><div><h1>直播名录管理</h1><p>停用或删除后，员工录入页会隐藏该项。历史数据仍可在看板查看。</p></div>
        <button type="button" class="primary" data-directory-command="add" ${records ? '' : 'disabled'}>新增${names[group]}</button>
      </header>
      <div class="directory-filters">
        <div role="group" aria-label="名录分类">${Object.entries(names).map(([id, label]) =>
          `<button type="button" data-directory-group="${id}" aria-pressed="${id === group}">${label}</button>`).join('')}</div>
        <div role="group" aria-label="状态筛选">
          <button type="button" data-directory-scope="active" aria-pressed="${scope === 'active'}">启用中</button>
          <button type="button" data-directory-scope="inactive" aria-pressed="${scope === 'inactive'}">停用和已删除</button>
        </div>
      </div>
      ${loadError ? `<p role="alert">${escapeHtml(loadError)} <button type="button" data-directory-command="refresh">重试</button></p>` :
        !records ? '<p role="status">正在读取名录…</p>' : rows.length ? `<ul class="directory-list">${rows.map(row => `
          <li><div><strong>${escapeHtml(row.name)}</strong><small>${escapeHtml([
            group === 'accounts' ? row.page : roomName(row.accountId),
            group === 'anchors' ? slotLabel(findSlot(row.accountId, row.slotId)) : group === 'slots' ? periodLabel(row.period) : '',
            status(row)
          ].filter(Boolean).join(' · '))}</small></div>
          <div class="directory-actions">
            <button type="button" data-directory-command="edit" data-id="${escapeHtml(row.id)}" data-room="${escapeHtml(row.accountId)}">编辑</button>
            ${row.active === false || row.archived ? `<button type="button" data-directory-command="restore" data-id="${escapeHtml(row.id)}" data-room="${escapeHtml(row.accountId)}">恢复</button>` :
              `<button type="button" data-directory-command="pause" data-id="${escapeHtml(row.id)}" data-room="${escapeHtml(row.accountId)}">停用</button>`}
            ${row.archived ? '' : `<button type="button" data-directory-command="delete" data-id="${escapeHtml(row.id)}" data-room="${escapeHtml(row.accountId)}">删除</button>`}
          </div></li>`).join('')}</ul>` : '<p class="directory-empty">当前没有符合条件的项目。</p>'}
    </section>`;
  }

  function open(kind, row) {
    const rooms = records.accounts.filter(room => room.active !== false || room.id === row?.accountId);
    const chosenRoom = row?.accountId || rooms[0]?.id;
    const roomOptions = rooms.map(room => `<option value="${escapeHtml(room.id)}" ${room.id === chosenRoom ? 'selected' : ''}>${escapeHtml(room.name)}</option>`).join('');
    if (kind !== 'accounts' && !rooms.length) throw new Error('请先新增一个启用的直播间。');
    dialog.innerHTML = `<form id="directory-form">
      <header class="dialog-head"><h2>${row ? '编辑' : '新增'}${names[kind]}</h2><button type="button" data-close aria-label="关闭">关闭</button></header>
      <div class="dialog-body directory-form">
        <label>名称<input name="name" required maxlength="120" value="${escapeHtml(row?.name)}"></label>
        ${kind === 'accounts' ? `<label>主页标识或说明<input name="page" maxlength="300" value="${escapeHtml(row?.page)}"></label>` :
          `<div><label for="directory-account">直播间</label><select id="directory-account" name="accountId" required ${kind === 'slots' && row ? 'disabled' : ''}>${roomOptions}</select></div>`}
        ${kind === 'anchors' ? '<div><label for="directory-slot">直播场次</label><select id="directory-slot" name="slotId" required></select></div>' : ''}
        ${kind === 'slots' ? '<div><label for="directory-period">直播时段</label><select id="directory-period" name="period" required></select></div>' : ''}
        ${kind === 'anchors' ? `<div class="directory-dates">
          <label>生效日期（选填）<input type="date" name="activeFrom" value="${escapeHtml(row?.activeFrom)}"></label>
          <label>结束日期（含当天，选填）<input type="date" name="activeTo" value="${escapeHtml(row?.activeTo)}"></label>
        </div>` : ''}
        <p class="dialog-error error" role="alert" hidden></p>
      </div>
      <footer class="dialog-footer"><button type="button" data-close>取消</button><button type="submit" class="primary">保存</button></footer>
    </form>`;
    const form = dialog.querySelector('form');
    if (kind === 'anchors') {
      const updateSlots = () => {
        const select = form.elements.slotId;
        const room = form.elements.accountId.value;
        const slots = records.slots.filter(slot => slot.accountId === room &&
          (slot.active !== false || (room === row?.accountId && slot.id === row.slotId)));
        select.innerHTML = slots.length
          ? slots.map(slot => `<option value="${escapeHtml(slot.id)}" ${room === row?.accountId && slot.id === row?.slotId ? 'selected' : ''}>${escapeHtml(slotLabel(slot))}</option>`).join('')
          : '<option value="">请先在此直播间新增场次</option>';
      };
      form.elements.accountId.addEventListener('change', updateSlots);
      updateSlots();
    }
    if (kind === 'slots') {
      const select = form.elements.period;
      const updatePeriods = () => {
        const occupied = new Set(records.slots.filter(slot => (
          slot.accountId === form.elements.accountId.value && slot.id !== row?.id && slot.active !== false && !slot.archived
        )).map(slot => slot.period));
        const available = Object.keys(periods).filter(period => !occupied.has(period) || period === row?.period);
        const choice = available.includes(select.value) ? select.value : row?.period ?? '';
        const placeholder = available.length ? '请选择早、中或晚场' : '该直播间的早、中、晚场已齐全';
        select.innerHTML = `<option value="">${placeholder}</option>` + available.map(period =>
          `<option value="${period}" ${period === choice ? 'selected' : ''}>${periodLabel(period)}</option>`).join('');
      };
      form.elements.accountId.addEventListener('change', updatePeriods);
      updatePeriods();
    }
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const submit = form.querySelector('[type=submit]');
      const errorBox = form.querySelector('[role=alert]');
      submit.disabled = true;
      errorBox.hidden = true;
      try {
        const payload = Object.fromEntries(new FormData(form));
        if (kind === 'anchors') {
          for (const key of ['activeFrom', 'activeTo']) {
            const value = payload[key] || null;
            if (value === (row?.[key] ?? null)) delete payload[key];
            else payload[key] = value;
          }
        }
        if (row) payload.version = row.version;
        await api(endpoint(kind, row), payload, row ? 'PUT' : 'POST');
        dialog.close();
        toast('名录已保存');
        await Promise.all([load(), reload()]);
      } catch (error) {
        errorBox.hidden = false;
        errorBox.textContent = error.message;
      } finally {
        submit.disabled = false;
      }
    });
    dialog.showModal();
  }

  document.addEventListener('click', async event => {
    const button = event.target.closest('.directory button');
    if (!button || button.disabled || !isAdmin()) return;
    if (button.dataset.directoryGroup) {
      group = button.dataset.directoryGroup;
      render();
      return;
    }
    if (button.dataset.directoryScope) {
      scope = button.dataset.directoryScope;
      render();
      return;
    }
    const command = button.dataset.directoryCommand;
    if (!command) return;
    if (command === 'refresh') {
      await load();
      return;
    }
    const row = records?.[group]?.find(item => item.id === button.dataset.id &&
      (group !== 'slots' || item.accountId === button.dataset.room));
    if (command !== 'add' && !row) return;
    try {
      if (command === 'edit' || command === 'add') {
        open(group, row);
        return;
      }
      if (command === 'delete' && !window.confirm(`删除「${row.name}」？历史记录将保留，可在「停用和已删除」中恢复。`)) return;
      button.disabled = true;
      const payload = command === 'delete' ? { version: row.version } : { version: row.version, active: command === 'restore' };
      await api(endpoint(group, row), payload, command === 'delete' ? 'DELETE' : 'PUT');
      toast({ restore: '已恢复', pause: '已停用', delete: '已删除，可恢复' }[command]);
      await Promise.all([load(), reload()]);
    } catch (error) {
      toast(error.message);
    } finally {
      button.disabled = false;
    }
  });

  return { page, reset: () => { records = null; loadError = ''; } };
}
