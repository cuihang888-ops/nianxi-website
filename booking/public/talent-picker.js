(function () {
  'use strict';

  const selectSelector = 'select[name="talentId1"], select[name="talentId2"], select[name="talentId3"]';
  const peopleById = new Map();
  let avatarRenderer = null;
  let nextId = 0;

  function escapeHTML(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[character]));
  }

  function selectsWithin(root) {
    if (!root || !root.querySelectorAll) return [];
    return [
      ...(root.matches && root.matches(selectSelector) ? [root] : []),
      ...root.querySelectorAll(selectSelector)
    ];
  }

  function selectFor(picker) {
    return picker && picker.closest('.tp-field')?.querySelector(selectSelector);
  }

  function pickerFor(select) {
    return select.closest('.tp-field')?.querySelector('.tp-picker');
  }

  function scopeFor(select) {
    return select.form || select.closest('dialog') || select.parentElement;
  }

  function optionPerson(option) {
    return peopleById.get(String(option.value)) || {
      id: option.value,
      name: option.textContent.replace(/（[^（）]*）\s*$/, '').trim(),
      number: ''
    };
  }

  function avatarHTML(person) {
    if (avatarRenderer) {
      try { return String(avatarRenderer(person)); } catch (_) {}
    }
    return `<span class="tp-avatar-fallback">${escapeHTML(String(person.name || '待').slice(0, 1))}</span>`;
  }

  function otherSelected(select, value) {
    return Boolean(value && selectsWithin(scopeFor(select)).some(other => other !== select && other.value === value));
  }

  function disabledReason(select, option) {
    if (select.disabled) return '当前不可修改';
    if (otherSelected(select, option.value)) return '已选为另一位';
    if (!option.disabled) return '';
    const reason = option.textContent.match(/[（(]([^（）()]*)[）)]\s*$/);
    return reason ? reason[1] : '当前不可选择';
  }

  function fieldNumber(select) {
    return select.name === 'talentId3' ? '第3位' : select.name === 'talentId2' ? '第2位' : '第1位';
  }

  function optionEntries(select, query) {
    const normalizedQuery = String(query || '').trim().toLocaleLowerCase().replace(/\s+/g, '');
    return [...select.options].filter(option => option.value).map((option, index) => {
      const person = optionPerson(option);
      const reason = disabledReason(select, option);
      const searchText = `${person.name} ${person.number} ${option.textContent}`.toLocaleLowerCase().replace(/\s+/g, '');
      return { option, person, reason, index, matches: !normalizedQuery || searchText.includes(normalizedQuery) };
    }).filter(entry => entry.matches).sort((left, right) =>
      Number(Boolean(left.reason)) - Number(Boolean(right.reason)) ||
      Number(right.option.value === select.value) - Number(left.option.value === select.value) ||
      left.index - right.index
    );
  }

  function renderResults(picker, select) {
    const input = picker.querySelector('.tp-search');
    const list = picker.querySelector('.tp-results');
    const entries = optionEntries(select, input.value);
    const availableCount = entries.filter(entry => !entry.reason).length;
    const unavailableCount = entries.length - availableCount;
    picker.querySelector('.tp-count').textContent = entries.length
      ? `${availableCount} 位可选${unavailableCount ? ` · ${unavailableCount} 位不可选` : ''}`
      : '';
    if (!entries.length) {
      const text = input.value.trim()
        ? '没有找到这位卖手，请换个姓名或编号'
        : [...select.options].find(option => !option.value)?.textContent || '暂无可排班人员';
      list.innerHTML = `<p class="tp-empty">${escapeHTML(text)}</p>`;
      return;
    }
    list.innerHTML = entries.map(({ option, person, reason }) => {
      const selected = option.value === select.value;
      return `<button type="button" class="tp-result${selected ? ' tp-result-selected' : ''}" data-tp-value="${escapeHTML(option.value)}" ${reason ? 'disabled' : ''} aria-pressed="${selected}" aria-label="${escapeHTML(`${person.name}${person.number ? '，编号' + person.number : ''}${reason ? '，' + reason : selected ? '，已选择' : ''}`)}"><span class="tp-face" aria-hidden="true">${avatarHTML(person)}</span><span class="tp-person"><strong>${escapeHTML(person.name)}</strong>${person.number ? `<small>编号 ${escapeHTML(person.number)}</small>` : ''}${reason ? `<span class="tp-reason">${escapeHTML(reason)}</span>` : ''}</span>${selected ? '<span class="tp-check" aria-hidden="true">✓</span>' : ''}</button>`;
    }).join('');
  }

  function renderSummary(picker, select) {
    const option = [...select.options].find(item => item.value && item.value === select.value);
    const toggle = picker.querySelector('.tp-toggle');
    const clear = picker.querySelector('.tp-clear');
    const number = fieldNumber(select);
    toggle.disabled = select.disabled;
    clear.disabled = select.disabled;
    clear.hidden = !option;
    if (option) {
      const person = optionPerson(option);
      toggle.classList.remove('tp-is-empty');
      toggle.innerHTML = `<span class="tp-face" aria-hidden="true">${avatarHTML(person)}</span><span class="tp-person"><strong>${escapeHTML(person.name)}</strong><small>${person.number ? '编号 ' + escapeHTML(person.number) : '已选卖手'}</small></span><span class="tp-toggle-hint" aria-hidden="true">更换</span>`;
      toggle.setAttribute('aria-label', `${number}卖手：${person.name}${person.number ? '，编号' + person.number : ''}，点击更换`);
    } else {
      const emptyText = select.name === 'talentId3' ? '特殊场次加第3位' : select.name === 'talentId2' ? '待补第2位' : '选择第1位卖手';
      toggle.classList.add('tp-is-empty');
      toggle.innerHTML = `<span class="tp-face tp-empty-face" aria-hidden="true">＋</span><span class="tp-person"><strong>${emptyText}</strong><small>${select.name === 'talentId1' ? '点头像选人 · 支持搜索' : select.name === 'talentId3' ? '选填 · 常规两位无需添加' : '可稍后补充'}</small></span><span class="tp-toggle-hint" aria-hidden="true">选择</span>`;
      toggle.setAttribute('aria-label', emptyText);
    }
  }

  function setOpen(picker, open, focus) {
    const panel = picker.querySelector('.tp-panel');
    const toggle = picker.querySelector('.tp-toggle');
    if (open) {
      document.querySelectorAll('.tp-picker.tp-is-open').forEach(other => {
        if (other !== picker) setOpen(other, false, false);
      });
    }
    panel.hidden = !open;
    picker.classList.toggle('tp-is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    if (open) {
      const select = selectFor(picker);
      const input = picker.querySelector('.tp-search');
      input.value = '';
      renderResults(picker, select);
      if (focus) input.focus({ preventScroll: true });
    } else if (focus) {
      toggle.focus({ preventScroll: true });
    }
  }

  function enhanceSelect(select) {
    if (pickerFor(select)) return;
    const label = select.parentElement;
    const field = document.createElement('div');
    field.className = 'tp-field';
    const title = document.createElement('div');
    title.className = 'tp-label';
    title.textContent = `${fieldNumber(select)}卖手${select.name === 'talentId3' ? '（选填）' : ''}`;
    if (label?.tagName === 'LABEL') {
      field.className += label.className ? ' ' + label.className : '';
      label.replaceWith(field);
      field.append(title, select);
    } else {
      select.before(field);
      field.append(title, select);
    }
    select.dataset.tpNative = 'true';
    select.dataset.tpWasRequired = String(select.required);
    select.required = false;
    select.hidden = true;
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');
    const id = `tp-picker-${++nextId}`;
    const picker = document.createElement('div');
    picker.className = 'tp-picker';
    picker.innerHTML = `<div class="tp-selected"><button type="button" class="tp-toggle" aria-expanded="false" aria-controls="${id}-panel"></button><button type="button" class="tp-clear" aria-label="清空${fieldNumber(select)}卖手" hidden>清空</button></div><div class="tp-panel" id="${id}-panel" hidden><label class="tp-search-label" for="${id}-search">搜索${fieldNumber(select)}卖手的姓名或编号</label><input id="${id}-search" class="tp-search" type="search" placeholder="搜索姓名 / 编号" autocomplete="off" maxlength="64"><div class="tp-count" role="status" aria-live="polite"></div><div class="tp-results" role="group" aria-label="${fieldNumber(select)}卖手候选列表"></div><small class="tp-list-help">已占用或已选为另一位的卖手不可重复选择</small></div>`;
    field.append(picker);
  }

  function refreshAll(root) {
    selectsWithin(root || document).forEach(select => {
      const picker = pickerFor(select);
      if (!picker) return;
      renderSummary(picker, select);
      if (picker.classList.contains('tp-is-open')) renderResults(picker, select);
      if (select.disabled && picker.classList.contains('tp-is-open')) setOpen(picker, false, false);
    });
  }

  function enhanceAll(root, people, renderAvatar) {
    if (Array.isArray(people)) {
      people.forEach(person => {
        if (person && person.id != null) peopleById.set(String(person.id), person);
      });
    }
    if (typeof renderAvatar === 'function') avatarRenderer = renderAvatar;
    selectsWithin(root || document).forEach(enhanceSelect);
    refreshAll(root || document);
  }

  function choose(picker, value) {
    const select = selectFor(picker);
    if (!select || select.disabled) return;
    const option = [...select.options].find(item => item.value === value);
    if (!option || (value && disabledReason(select, option))) return;
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    refreshAll(scopeFor(select));
    setOpen(picker, false, true);
  }

  document.addEventListener('click', event => {
    if (!(event.target instanceof Element)) return;
    const picker = event.target.closest('.tp-picker');
    if (!picker) {
      document.querySelectorAll('.tp-picker.tp-is-open').forEach(other => setOpen(other, false, false));
      return;
    }
    const toggle = event.target.closest('.tp-toggle');
    if (toggle && !toggle.disabled) {
      setOpen(picker, !picker.classList.contains('tp-is-open'), true);
      return;
    }
    const clear = event.target.closest('.tp-clear');
    if (clear && !clear.disabled) return choose(picker, '');
    const result = event.target.closest('.tp-result');
    if (result && !result.disabled) choose(picker, result.dataset.tpValue);
  });

  document.addEventListener('input', event => {
    const input = event.target;
    if (!(input instanceof Element) || !input.matches('.tp-search') || event.isComposing || input.dataset.tpComposing === 'true') return;
    const picker = input.closest('.tp-picker');
    renderResults(picker, selectFor(picker));
  });

  document.addEventListener('compositionstart', event => {
    if (event.target instanceof Element && event.target.matches('.tp-search')) event.target.dataset.tpComposing = 'true';
  });

  document.addEventListener('compositionend', event => {
    const input = event.target;
    if (!(input instanceof Element) || !input.matches('.tp-search')) return;
    delete input.dataset.tpComposing;
    const picker = input.closest('.tp-picker');
    renderResults(picker, selectFor(picker));
  });

  document.addEventListener('change', event => {
    if (event.target instanceof Element && event.target.matches(selectSelector)) refreshAll(scopeFor(event.target));
  });

  document.addEventListener('reset', event => {
    const form = event.target;
    if (form instanceof Element && form.querySelector(selectSelector)) queueMicrotask(() => refreshAll(form));
  });

  document.addEventListener('keydown', event => {
    if (!(event.target instanceof Element)) return;
    const picker = event.target.closest('.tp-picker.tp-is-open');
    if (!picker) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(picker, false, true);
      return;
    }
    if (event.isComposing || event.target.dataset.tpComposing === 'true') return;
    if (event.key === 'Enter' && event.target.matches('.tp-search')) {
      event.preventDefault();
      return;
    }
    if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    if (!event.target.matches('.tp-search, .tp-result')) return;
    const results = [...picker.querySelectorAll('.tp-result:not(:disabled)')];
    if (!results.length) return;
    event.preventDefault();
    const current = results.indexOf(document.activeElement);
    const next = current < 0
      ? (event.key === 'ArrowDown' ? 0 : results.length - 1)
      : (current + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
    results[next].focus();
  });

  window.TalentPicker = Object.freeze({ enhanceAll, refreshAll });
}());
