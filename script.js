(function () {
  'use strict';

  var STORE_KEY = 'lessons-planner-v1';
  var DAY_NAMES = ['Понеділок', 'Вівторок', 'Середа', 'Четвер', 'Пʼятниця', 'Субота', 'Неділя'];
  var MONTHS = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];
  var MONTHS_SHORT = ['січ', 'лют', 'бер', 'кві', 'тра', 'чер', 'лип', 'сер', 'вер', 'жов', 'лис', 'гру'];
  var WEEK_LABEL = { red: 'Червоний', green: 'Зелений' };

  var ICONS = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    edit: '<path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3z"/><path d="M13.5 6.5l3 3"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    up: '<path d="M6 15l6-6 6 6"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    left: '<path d="M15 5l-7 7 7 7"/>',
    right: '<path d="M9 5l7 7-7 7"/>',
    ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'
  };

  /* ---------- helpers ---------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }

  function icon(name, size) {
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('width', size || 18);
    s.setAttribute('height', size || 18);
    s.setAttribute('fill', 'none');
    s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', '2');
    s.setAttribute('stroke-linecap', 'round');
    s.setAttribute('stroke-linejoin', 'round');
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = ICONS[name];
    return s;
  }

  function h(tag, props) {
    var el = document.createElement(tag);
    var p = props || {};
    Object.keys(p).forEach(function (k) {
      var v = p[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    });
    var kids = [].slice.call(arguments, 2);
    (function add(list) {
      list.forEach(function (kid) {
        if (kid === null || kid === undefined || kid === false) return;
        if (Array.isArray(kid)) return add(kid);
        el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
      });
    })(kids);
    return el;
  }

  /* ---------- dates & weeks ---------- */
  function addDays(d, n) { var x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; }
  function mondayOf(d) { var wd = (d.getDay() + 6) % 7; return addDays(d, -wd); }
  // Number of weeks since the first Monday of 1970 — used only for even/odd alternation.
  function weekIdx(monday) {
    var days = Math.floor(Date.UTC(monday.getFullYear(), monday.getMonth(), monday.getDate()) / 864e5);
    return Math.round((days - 4) / 7);
  }
  function parity(n) { return ((n % 2) + 2) % 2; }
  function weekColor(monday) {
    var p = state.redParity === null ? parity(weekIdx(mondayOf(new Date()))) : state.redParity;
    return parity(weekIdx(monday)) === p ? 'red' : 'green';
  }
  function setCurrentWeek(color) {
    var idx = parity(weekIdx(mondayOf(new Date())));
    state.redParity = color === 'red' ? idx : 1 - idx;
    save();
  }
  function fmtRange(mon) {
    var sun = addDays(mon, 6);
    if (mon.getMonth() === sun.getMonth()) return mon.getDate() + '–' + sun.getDate() + ' ' + MONTHS[sun.getMonth()] + ' ' + sun.getFullYear();
    return mon.getDate() + ' ' + MONTHS[mon.getMonth()] + ' – ' + sun.getDate() + ' ' + MONTHS[sun.getMonth()] + ' ' + sun.getFullYear();
  }
  function todayKey() { var n = new Date(); return n.getFullYear() + '-' + n.getMonth() + '-' + n.getDate(); }

  /* ---------- links ---------- */
  function normalizeLink(v) {
    v = String(v || '').trim();
    if (!v) return '';
    if (!/^[a-z][a-z0-9+.-]*:/i.test(v)) v = 'https://' + v;
    try {
      var u = new URL(v);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
      return u.href;
    } catch (e) { return null; }
  }
  function hostOf(link) { try { return new URL(link).hostname.replace(/^www\./, ''); } catch (e) { return ''; } }

  /* ---------- state ---------- */
  function defaultState() { return { redParity: null, days: [[], [], [], [], [], [], []] }; }

  function normalize(s) {
    if (!s || typeof s !== 'object' || !Array.isArray(s.days)) throw new Error('bad data');
    var out = { redParity: (s.redParity === 0 || s.redParity === 1) ? s.redParity : null, days: [] };
    for (var i = 0; i < 7; i++) {
      var slots = Array.isArray(s.days[i]) ? s.days[i] : [];
      var clean = [];
      slots.forEach(function (sl) {
        var raw = (sl && Array.isArray(sl.lessons)) ? sl.lessons.slice(0, 2) : [];
        var lessons = raw.map(function (l) {
          l = l || {};
          return {
            id: uid(),
            name: String(l.name || 'Без назви').slice(0, 120),
            link: normalizeLink(l.link) || '',
            time: String(l.time || '').slice(0, 30),
            week: (l.week === 'red' || l.week === 'green') ? l.week : null
          };
        });
        if (lessons.length) clean.push({ id: uid(), lessons: lessons });
      });
      out.days.push(clean);
    }
    return out;
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw) return normalize(JSON.parse(raw));
    } catch (e) { /* storage empty or unavailable */ }
    return defaultState();
  }
  var state = load();
  function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ } }
  function snapshot() { return JSON.stringify(state); }
  function restore(snap) { state = normalize(JSON.parse(snap)); save(); render(); }

  var offset = 0;

  function findLesson(id) {
    for (var d = 0; d < 7; d++) {
      for (var s = 0; s < state.days[d].length; s++) {
        var slot = state.days[d][s];
        for (var k = 0; k < slot.lessons.length; k++) {
          if (slot.lessons[k].id === id) return { lesson: slot.lessons[k], slot: slot, dayIdx: d };
        }
      }
    }
    return null;
  }
  function opposite(w) { return w === 'red' ? 'green' : 'red'; }

  /* ---------- actions ---------- */
  function addLesson(dayIdx, slotId, data) {
    var lesson = { id: uid(), name: data.name, link: data.link, time: data.time, week: null };
    if (slotId) {
      var slot = state.days[dayIdx].filter(function (s) { return s.id === slotId; })[0];
      if (!slot) return;
      if (slot.lessons[0] && slot.lessons[0].week) lesson.week = opposite(slot.lessons[0].week);
      slot.lessons.push(lesson);
    } else {
      state.days[dayIdx].push({ id: uid(), lessons: [lesson] });
    }
  }

  function applyWeek(found, week) {
    found.lesson.week = week;
    found.slot.lessons.forEach(function (l) {
      if (l !== found.lesson) l.week = week ? opposite(week) : null;
    });
  }

  function deleteLesson(id) {
    var f = findLesson(id);
    if (!f) return;
    var snap = snapshot();
    f.slot.lessons = f.slot.lessons.filter(function (x) { return x.id !== id; });
    if (!f.slot.lessons.length) state.days[f.dayIdx] = state.days[f.dayIdx].filter(function (s) { return s !== f.slot; });
    save(); render();
    var nm = f.lesson.name.length > 40 ? f.lesson.name.slice(0, 40) + '…' : f.lesson.name;
    toast('Урок «' + nm + '» видалено', function () { restore(snap); });
  }

  function moveSlot(dayIdx, slotId, dir) {
    var arr = state.days[dayIdx];
    var i = arr.findIndex(function (s) { return s.id === slotId; });
    var j = i + dir;
    if (i < 0 || j < 0 || j >= arr.length) return;
    var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    save(); render();
  }

  /* ---------- toast ---------- */
  var toastTimer = null;
  function hideToast() { $('#toast').hidden = true; }
  function toast(msg, undo) {
    var root = $('#toast');
    root.replaceChildren(h('span', { text: msg }));
    if (undo) root.append(h('button', { type: 'button', class: 'toast-btn', text: 'Скасувати', onclick: function () { hideToast(); undo(); } }));
    root.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, 6000);
  }

  /* ---------- modal ---------- */
  var modalCleanup = null;
  function closeModal() { if (modalCleanup) { var f = modalCleanup; modalCleanup = null; f(); } }

  function openModal(title, sub, content, opts) {
    opts = opts || {};
    closeModal();
    var prev = document.activeElement;
    var box = h('div', { class: 'modal' + (opts.wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'modal-title' },
      h('h2', { class: 'modal-title', id: 'modal-title', text: title }),
      sub ? h('p', { class: 'modal-sub', text: sub }) : null,
      content);
    var overlay = h('div', { class: 'overlay' }, box);
    var dismissible = opts.dismissible !== false;
    overlay.addEventListener('mousedown', function (e) { if (dismissible && e.target === overlay) closeModal(); });
    function onKey(e) {
      if (e.key === 'Escape' && dismissible) { closeModal(); return; }
      if (e.key === 'Tab') {
        var f = [].slice.call(box.querySelectorAll('button:not([disabled]), input, textarea, a[href]'));
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', onKey);
    document.body.append(overlay);
    document.body.classList.add('modal-open');
    modalCleanup = function () {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('modal-open');
      if (prev && prev.isConnected && prev.focus) prev.focus();
    };
    var first = box.querySelector('input, textarea, .choice, button');
    if (first) first.focus();
  }

  /* ---- lesson form ---- */
  function openLessonForm(ctx) {
    var found = ctx.lessonId ? findLesson(ctx.lessonId) : null;
    var cur = found ? found.lesson : { name: '', link: '', time: '' };
    var dayIdx = found ? found.dayIdx : ctx.dayIdx;

    var nameIn = h('input', { type: 'text', id: 'f-name', maxlength: '120', value: cur.name, placeholder: 'Наприклад: Математика', autocomplete: 'off' });
    var linkIn = h('input', { type: 'text', id: 'f-link', value: cur.link, placeholder: 'https://…', inputmode: 'url', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
    var timeIn = h('input', { type: 'text', id: 'f-time', maxlength: '30', value: cur.time, placeholder: '08:30', autocomplete: 'off' });
    var err = h('p', { class: 'field-err', role: 'alert' });

    var form = h('form', { novalidate: true, onsubmit: function (e) {
      e.preventDefault();
      var name = nameIn.value.trim();
      if (!name) { err.textContent = 'Введіть назву уроку.'; nameIn.focus(); return; }
      var link = normalizeLink(linkIn.value);
      if (link === null) { err.textContent = 'Перевірте посилання: це має бути адреса сайту, наприклад https://zoom.us/j/123.'; linkIn.focus(); return; }
      var time = timeIn.value.trim();
      if (found) {
        found.lesson.name = name; found.lesson.link = link; found.lesson.time = time;
      } else {
        addLesson(dayIdx, ctx.slotId || null, { name: name, link: link, time: time });
      }
      save(); closeModal(); render();
    } },
      h('div', { class: 'field' }, h('label', { for: 'f-name', text: 'Назва' }), nameIn),
      h('div', { class: 'field' }, h('label', { for: 'f-link', text: 'Посилання на урок' }), linkIn),
      h('div', { class: 'field' }, h('label', { for: 'f-time', text: 'Час (необовʼязково)' }), timeIn),
      err,
      h('div', { class: 'modal-actions' },
        h('button', { type: 'button', class: 'btn', text: 'Скасувати', onclick: closeModal }),
        h('button', { type: 'submit', class: 'btn primary', text: found ? 'Зберегти' : 'Додати' })));

    var title = found ? 'Редагувати урок' : (ctx.slotId ? 'Другий урок на цей час' : 'Новий урок');
    openModal(title, DAY_NAMES[dayIdx], form);
  }

  /* ---- week picker ---- */
  function openWeekPicker(lessonId) {
    var f = findLesson(lessonId);
    if (!f) return;
    var opts = [
      ['red', 'Червоний тиждень', 'Урок проходить лише в червоні тижні'],
      ['green', 'Зелений тиждень', 'Урок проходить лише в зелені тижні'],
      [null, 'Кожного тижня', 'Без чергування']
    ];
    var list = h('div', { class: 'choices' }, opts.map(function (o) {
      var val = o[0];
      return h('button', { type: 'button', class: 'choice c-' + (val || 'any'), 'aria-pressed': String(f.lesson.week === val),
        onclick: function () { applyWeek(f, val); save(); closeModal(); render(); } },
        h('span', { class: 'dot d-' + (val || 'any') }),
        h('span', { class: 'choice-text' }, h('strong', { text: o[1] }), h('small', { text: o[2] })));
    }));
    var body = h('div', {}, list,
      f.slot.lessons.length > 1 ? h('p', { class: 'note', text: 'Другий урок на цей час автоматично стане на протилежний тиждень і буде сірим, коли не проходить.' }) : null,
      h('div', { class: 'modal-actions' }, h('button', { type: 'button', class: 'btn', text: 'Закрити', onclick: closeModal })));
    openModal('Коли проходить цей урок?', f.lesson.name, body);
  }

  /* ---- which week is it now ---- */
  function openCalibrate(first) {
    var monday = mondayOf(new Date());
    var current = state.redParity === null ? null : weekColor(monday);
    function pick(color) { setCurrentWeek(color); closeModal(); render(); }
    var list = h('div', { class: 'choices' }, ['red', 'green'].map(function (c) {
      return h('button', { type: 'button', class: 'choice c-' + c, 'aria-pressed': String(current === c), onclick: function () { pick(c); } },
        h('span', { class: 'dot d-' + c }),
        h('span', { class: 'choice-text' }, h('strong', { text: WEEK_LABEL[c] + ' тиждень' })));
    }));
    var body = h('div', {}, list,
      h('p', { class: 'note', text: 'Далі тижні змінюватимуться самі: червоний, зелений, червоний…' }),
      first ? null : h('div', { class: 'modal-actions' }, h('button', { type: 'button', class: 'btn', text: 'Закрити', onclick: closeModal })));
    openModal('Який тиждень зараз?', 'Тиждень ' + fmtRange(monday) + ' у вашому розкладі', body, { dismissible: !first });
  }

  /* ---- backup ---- */
  function openBackup() {
    var ta = h('textarea', { id: 'bk', rows: '9', spellcheck: 'false', 'aria-label': 'Дані розкладу' });
    ta.value = snapshot();
    var status = h('p', { class: 'bk-status', role: 'status' });
    function setStatus(t, bad) { status.textContent = t; status.className = 'bk-status' + (bad ? ' err' : ''); }

    var copyBtn = h('button', { type: 'button', class: 'btn', text: 'Скопіювати', onclick: function () {
      ta.value = snapshot(); ta.focus(); ta.select();
      var done = function (ok) { setStatus(ok ? 'Скопійовано. Збережіть цей текст у нотатках.' : 'Не вдалося скопіювати автоматично. Виділіть текст і скопіюйте вручну.', !ok); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(ta.value).then(function () { done(true); }, function () {
          var ok = false; try { ok = document.execCommand('copy'); } catch (e) { /* ignore */ } done(ok);
        });
      } else {
        var ok = false; try { ok = document.execCommand('copy'); } catch (e) { /* ignore */ } done(ok);
      }
    } });
    var restoreBtn = h('button', { type: 'button', class: 'btn primary', text: 'Відновити з тексту', onclick: function () {
      try {
        var next = normalize(JSON.parse(ta.value));
        var snap = snapshot();
        state = next; save(); closeModal(); render();
        toast('Розклад відновлено', function () { restore(snap); });
      } catch (e) {
        setStatus('Не вдалося прочитати текст. Вставте копію повністю, без змін.', true);
      }
    } });

    var body = h('div', {},
      h('div', { class: 'field' }, ta),
      status,
      h('div', { class: 'modal-actions' },
        h('button', { type: 'button', class: 'btn', text: 'Закрити', onclick: closeModal }), copyBtn, restoreBtn),
      h('p', { class: 'note', text: 'Дані зберігаються в цьому браузері. Скопіюйте текст вище, щоб перенести розклад на інший пристрій: там вставте його в це поле й натисніть «Відновити з тексту».' }));
    openModal('Резервна копія', null, body, { wide: true });
  }

  /* ---------- rendering ---------- */
  function lessonEl(l, dayIdx, color) {
    var active = !l.week || l.week === color;
    var chipLabel = l.week ? WEEK_LABEL[l.week] + ' тиждень' : 'Кожного тижня';
    return h('article', { class: 'lesson' + (l.week ? ' w-' + l.week : '') + (active ? '' : ' off') },
      h('div', { class: 'l-main' },
        l.time ? h('span', { class: 'l-time', text: l.time }) : null,
        h('h3', { class: 'l-name', text: l.name })),
      active ? null : h('p', { class: 'l-off', text: 'Цього тижня не проходить' }),
      l.link
        ? h('div', { class: 'l-link' },
            h('a', { class: 'open', href: l.link, target: '_blank', rel: 'noopener noreferrer' }, icon('ext', 15), h('span', { text: 'Відкрити' })),
            h('span', { class: 'host', text: hostOf(l.link) }))
        : h('span', { class: 'no-link', text: 'Посилання не додано' }),
      h('div', { class: 'l-actions' },
        h('button', { type: 'button', class: 'chip', 'aria-label': 'Тиждень для уроку «' + l.name + '»: ' + chipLabel, onclick: function () { openWeekPicker(l.id); } },
          h('span', { class: 'dot d-' + (l.week || 'any') }), chipLabel),
        h('span', { class: 'spacer' }),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Редагувати урок «' + l.name + '»', onclick: function () { openLessonForm({ lessonId: l.id }); } }, icon('edit', 16)),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Видалити урок «' + l.name + '»', onclick: function () { deleteLesson(l.id); } }, icon('trash', 16))));
  }

  function slotEl(dayIdx, slot, n, total, color) {
    var paired = slot.lessons.length > 1;
    var body = h('div', { class: 'slot-body' });
    slot.lessons.forEach(function (l, k) {
      if (k > 0) body.append(h('div', { class: 'or', 'aria-hidden': 'true' }, h('span', { text: 'або' })));
      body.append(lessonEl(l, dayIdx, color));
    });
    if (!paired) {
      body.append(h('button', { type: 'button', class: 'add-alt', onclick: function () { openLessonForm({ dayIdx: dayIdx, slotId: slot.id }); } },
        icon('plus', 14), 'Другий урок на цей час'));
    }
    return h('div', { class: 'slot' + (paired ? ' paired' : '') },
      h('div', { class: 'rail' },
        h('button', { type: 'button', class: 'mv', 'aria-label': 'Перемістити вище', disabled: n === 0, onclick: function () { moveSlot(dayIdx, slot.id, -1); } }, icon('up', 14)),
        h('span', { class: 'num', text: String(n + 1), title: 'Порядковий номер уроку' }),
        h('button', { type: 'button', class: 'mv', 'aria-label': 'Перемістити нижче', disabled: n === total - 1, onclick: function () { moveSlot(dayIdx, slot.id, 1); } }, icon('down', 14))),
      body);
  }

  function dayEl(i, slots, monday, color, isToday) {
    var date = addDays(monday, i);
    return h('section', { class: 'day' + (isToday ? ' today' : ''), 'aria-labelledby': 'day-' + i },
      h('header', { class: 'day-head' },
        h('h2', { id: 'day-' + i, text: DAY_NAMES[i] }),
        h('span', { class: 'day-date', text: date.getDate() + ' ' + MONTHS_SHORT[date.getMonth()] }),
        isToday ? h('span', { class: 'today-badge', text: 'Сьогодні' }) : null),
      slots.length
        ? h('div', { class: 'slots' }, slots.map(function (s, n) { return slotEl(i, s, n, slots.length, color); }))
        : h('p', { class: 'day-empty', text: 'Уроків немає' }),
      h('button', { type: 'button', class: 'add-lesson', onclick: function () { openLessonForm({ dayIdx: i }); } }, icon('plus', 16), 'Додати урок'));
  }

  function render() {
    var now = new Date();
    var monday = addDays(mondayOf(now), offset * 7);
    var color = weekColor(monday);
    document.body.setAttribute('data-week', color);

    $('#week-title').textContent = WEEK_LABEL[color] + ' тиждень';
    $('#week-range').textContent = fmtRange(monday);
    var badges = { '0': 'Поточний', '1': 'Наступний', '-1': 'Минулий' };
    var b = $('#week-badge');
    b.textContent = badges[String(offset)] || '';
    b.hidden = !badges[String(offset)];
    $('#btn-today').hidden = offset === 0;

    var todayIdx = (now.getDay() + 6) % 7;
    $('#board').replaceChildren.apply($('#board'), state.days.map(function (slots, i) {
      return dayEl(i, slots, monday, color, offset === 0 && i === todayIdx);
    }));

    var total = 0, paired = 0;
    state.days.forEach(function (d) { d.forEach(function (s) { total += s.lessons.length; if (s.lessons.length > 1) paired++; }); });
    var hint = $('#hint');
    if (total === 0) {
      hint.textContent = 'Почніть з будь-якого дня: натисніть «Додати урок», вкажіть назву та посилання.';
      hint.hidden = false;
    } else if (paired === 0) {
      hint.textContent = 'Якщо на один час є два уроки на різні тижні, натисніть «Другий урок на цей час», а потім позначте один із них червоним або зеленим.';
      hint.hidden = false;
    } else {
      hint.hidden = true;
    }
  }

  /* ---------- init ---------- */
  $('#btn-prev').append(icon('left', 22));
  $('#btn-next').append(icon('right', 22));
  $('#btn-prev').addEventListener('click', function () { offset--; render(); });
  $('#btn-next').addEventListener('click', function () { offset++; render(); });
  $('#btn-today').addEventListener('click', function () { offset = 0; render(); });
  $('#btn-calib').addEventListener('click', function () { openCalibrate(false); });
  $('#btn-backup').addEventListener('click', openBackup);

  render();
  if (state.redParity === null) openCalibrate(true);

  // Keep the current week/day fresh if the page stays open across midnight or a week change.
  var lastKey = todayKey();
  function refreshIfNewDay() { var k = todayKey(); if (k !== lastKey) { lastKey = k; render(); } }
  setInterval(refreshIfNewDay, 60000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) refreshIfNewDay(); });
})();
