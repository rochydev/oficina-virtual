// Oficina Virtual — lógica de la página: datos en directo, lista, fichas, avisos y línea de tiempo.
(function () {
  'use strict';
  const { Office, COLORS, ICONS, LABELS, look, portrait } = window.OV;
  const $ = (id) => document.getElementById(id);

  const STATE_LABEL = { working: 'Trabajando', thinking: 'Pensando', waiting: 'Te necesita', idle: 'Libre', offline: 'Ausente', done: 'Terminó' };
  const SOURCE_LABEL = { claude: 'Claude Code', codex: 'Codex', ollama: 'Ollama' };
  const FEED_ICON = { prompt: '🗣️', say: '💬', tool: '🔧', error: '❌', wait: '✋', info: 'ℹ️' };

  const prefs = (() => { try { return JSON.parse(localStorage.getItem('oficina') || '{}'); } catch { return {}; } })();
  const savePrefs = () => { try { localStorage.setItem('oficina', JSON.stringify(prefs)); } catch { /* sin almacenamiento */ } };

  const S = {
    snap: null, selected: null, first: true,
    prevState: new Map(), prevConflicts: new Set(),
    showAway: !!prefs.away, sound: prefs.sound !== false, notify: !!prefs.notify,
    tl: { open: false, hours: 3, data: null, T: null, playing: false },
    sideHtml: '', chipsHtml: '', tickerKey: '', tickerFirst: '',
    mood: ['auto', 'day', 'night'].includes(prefs.mood) ? prefs.mood : 'auto',
    pulse: new Array(30).fill(0), pulseLast: null, pulseBucket: null,
  };

  const office = new Office($('office'));
  office.onSelect = (id) => select(id);
  office.mood = S.mood;
  if (prefs.cine) document.body.classList.add('cine');

  // ---------- utilidades ----------
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function dur(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) return s + ' s';
    const m = Math.floor(s / 60);
    if (m < 60) return m + ' min';
    return Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0');
  }
  function tok(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace('.', ',') + ' M';
    if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e5 ? 0 : 1).replace('.', ',') + ' k';
    return String(n || 0);
  }
  const hhmm = (t, secs) => new Date(t).toLocaleTimeString('es-ES', secs ? { hour: '2-digit', minute: '2-digit', second: '2-digit' } : { hour: '2-digit', minute: '2-digit' });
  const colorOf = (a) => a.state === 'waiting' ? COLORS.ask : (a.state === 'idle' || a.state === 'offline' || a.state === 'done') ? COLORS.idle : (COLORS[a.activity] || COLORS.tool);
  const iconOf = (a) => a.state === 'waiting' ? ICONS.ask : a.state === 'offline' ? '🚪' : a.state === 'done' ? '✅' : a.state === 'idle' ? ICONS.idle : (ICONS[a.activity] || '🔧');
  const nameOf = (a) => look(a).nick;
  const titleOf = (a) => a.title || (a.kind === 'sub' ? 'Becario' : a.project || 'Sin título');

  // ---------- sonido y avisos ----------
  let audio = null;
  function beep(notes) {
    if (!S.sound) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      let t = audio.currentTime;
      for (const [f, d] of notes) {
        const o = audio.createOscillator(), g = audio.createGain();
        o.type = 'triangle'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        o.connect(g).connect(audio.destination);
        o.start(t); o.stop(t + d + 0.02);
        t += d * 0.8;
      }
    } catch { /* el navegador aún no deja sonar */ }
  }
  function toast(title, text, color, id) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.style.setProperty('--c', color);
    el.innerHTML = '<b>' + esc(title) + '</b>' + (text ? '<span>' + esc(text) + '</span>' : '');
    el.onclick = () => { if (id) select(id); el.remove(); };
    $('toasts').appendChild(el);
    while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
    setTimeout(() => el.remove(), 9000);
  }
  function desktop(title, text) {
    if (!S.notify || !('Notification' in window) || Notification.permission !== 'granted') return;
    if (document.hasFocus()) return;
    try { new Notification(title, { body: text || '', tag: title }); } catch { /* no disponible */ }
  }

  function detectChanges(snap) {
    const seen = new Map();
    const arrivals = [];
    for (const a of snap.agents) {
      seen.set(a.id, a.state);
      if (a.kind === 'sub') continue;
      const prev = S.prevState.get(a.id);
      if (S.first || prev === a.state) continue;
      const who = nameOf(a) + ' · ' + titleOf(a);
      if (a.state === 'waiting') {
        toast('✋ ' + nameOf(a) + ' te necesita', a.detail, COLORS.ask, a.id);
        desktop('✋ ' + who, a.detail);
        beep([[784, 0.16], [1047, 0.28]]);
      } else if (a.state === 'idle' && (prev === 'working' || prev === 'thinking' || prev === 'waiting')) {
        toast('✅ ' + nameOf(a) + ' ha terminado', titleOf(a), COLORS.run, a.id);
        office.celebrate(a.id);
        desktop('✅ ' + who, 'Ha terminado su turno');
        beep([[659, 0.14], [523, 0.3]]);
      } else if (prev === undefined && a.state !== 'offline') {
        arrivals.push(a);
      }
    }
    // Si llegan muchos de golpe (al arrancar o con la demo) no se llena la pantalla de avisos.
    if (arrivals.length <= 2) for (const a of arrivals) toast('👋 ' + nameOf(a) + ' ha llegado', titleOf(a) + ' · ' + (a.project || ''), COLORS.read, a.id);
    const keys = new Set();
    for (const c of snap.conflicts) {
      const k = c.file + '|' + [...c.agents].sort().join(',');
      keys.add(k);
      if (!S.first && !S.prevConflicts.has(k)) {
        toast('⚡ Dos agentes tocan el mismo archivo', c.file.split('/').pop(), '#ff4d6d', c.agents[0]);
        beep([[220, 0.2], [196, 0.3]]);
      }
    }
    S.prevConflicts = keys;
    S.prevState = seen;
    S.first = false;
  }

  // ---------- rebobinado: reconstruir la oficina en un instante pasado ----------
  function agentsAt(T) {
    const out = [];
    const live = new Map((S.snap ? S.snap.agents : []).map((a) => [a.id, a]));
    for (const l of (S.tl.data ? S.tl.data.agents : [])) {
      let e = null;
      for (const ev of l.events) { if (ev.t <= T) e = ev; else break; }
      if (!e) continue;
      const age = T - e.t;
      let state = e.s, activity = e.a, detail = e.d;
      if ((state === 'working' || state === 'thinking') && age > 5 * 60e3) { state = 'idle'; activity = 'idle'; detail = 'Sin actividad'; }
      if (state === 'idle' && (age > 20 * 60e3 || l.kind === 'sub')) continue;
      const base = live.get(l.id) || { tokens: { in: 0, out: 0, cacheRead: 0, cacheWrite: 0 }, tokensToday: 0, tools: 0, errors: 0, files: [], recent: [], lastPrompt: '', lastText: '', startedAt: l.events[0].t, cwd: '', branch: '' };
      out.push(Object.assign({}, base, { id: l.id, source: l.source, kind: l.kind, parentId: l.parentId, title: l.title, project: l.project, role: l.role, model: l.model, state, activity, detail, since: e.t, lastActiveAt: e.t }));
    }
    return out;
  }

  function viewAgents() {
    if (S.tl.T) return agentsAt(S.tl.T);
    return S.snap ? S.snap.agents : [];
  }

  // ---------- pintado ----------
  function render() {
    if (!S.snap) return;
    const now = S.tl.T || Date.now();
    const all = viewAgents();
    const present = all.filter((a) => a.state !== 'offline' && !(a.state === 'done' && now - a.lastActiveAt > 25e3));
    office.selected = S.selected;
    office.setData(present, S.tl.T ? [] : S.snap.conflicts, S.tl.T);

    const st = S.snap.stats;
    const working = present.filter((a) => a.state === 'working' || a.state === 'thinking').length;
    const waiting = present.filter((a) => a.state === 'waiting').length;
    const idle = present.filter((a) => a.state === 'idle').length;
    const perMin = S.pulse.slice(-12).reduce((x, y) => x + y, 0);
    const chips =
      (waiting ? '<div class="chip alert"><b>✋ ' + waiting + '</b><span>te ' + (waiting === 1 ? 'necesita' : 'necesitan') + '</span></div>' : '') +
      '<div class="chip work"><b><i class="eq' + (working ? '' : ' off') + '"><s></s><s></s><s></s></i>' + working + '</b><span>trabajando</span></div>' +
      '<div class="chip"><b>' + idle + '</b><span>libres</span></div>' +
      '<div class="chip" title="Acciones de los agentes en el último minuto"><b>' + sparkSvg() + perMin + '</b><span>ritmo / min</span></div>' +
      '<div class="chip" title="Tokens nuevos de hoy (sin contar lecturas de caché)"><b>' + tok(st.tokensToday) + '</b><span>tokens hoy</span></div>' +
      '<div class="chip"><b>' + st.toolsToday + '</b><span>acciones hoy</span></div>' +
      (st.costToday != null ? '<div class="chip" title="Estimación según los precios de config.json"><b>$' + st.costToday.toFixed(2) + '</b><span>estimado</span></div>' : '') +
      (st.errors ? '<div class="chip"><b>' + st.errors + '</b><span>' + (st.errors === 1 ? 'tropiezo' : 'tropiezos') + '</span></div>' : '');
    if (chips !== S.chipsHtml) { S.chipsHtml = chips; $('chips').innerHTML = chips; }

    document.title = (waiting ? '(' + waiting + ' ✋) ' : working ? '(' + working + ') ' : '') + 'Oficina Virtual';
    $('empty').hidden = present.length > 0 || !!S.tl.T;
    $('needFrame').hidden = !waiting;
    $('btnDemo').classList.toggle('on', !!S.snap.demo);
    $('btnAway').classList.toggle('on', S.showAway);
    $('btnSound').classList.toggle('off', !S.sound);
    $('btnNotify').classList.toggle('on', S.notify);
    $('btnRewind').classList.toggle('on', S.tl.open);
    $('btnMood').classList.toggle('on', S.mood !== 'auto');
    $('moodTxt').textContent = { auto: 'Auto', day: 'Día', night: 'Noche' }[S.mood];
    const live = $('liveDot');
    live.className = 'live' + (S.tl.T ? ' past' : S.snap.demo ? ' demo' : '');
    live.lastElementChild.textContent = S.tl.T ? 'Pasado' : S.snap.demo ? 'Demo' : 'En directo';
    renderTicker(present);

    const cf = S.tl.T ? [] : S.snap.conflicts;
    $('banner').hidden = !cf.length;
    if (cf.length) {
      const c = cf[0];
      const names = c.agents.map((id) => all.find((a) => a.id === id)).filter(Boolean).map(nameOf).join(' y ');
      $('banner').innerHTML = '⚡ <b>' + esc(names || 'Varios agentes') + '</b> están tocando <code>' + esc(c.file.split('/').pop()) + '</code>' + (cf.length > 1 ? ' · y ' + (cf.length - 1) + ' archivo(s) más' : '');
    }
    $('rewindBadge').hidden = !S.tl.T;
    if (S.tl.T) $('rewindBadge').textContent = '⏪ Viendo las ' + hhmm(S.tl.T, true);

    renderSide(all, present, now);
    tickTimes();
  }

  // ---------- ritmo y teletipo ----------
  function sparkSvg() {
    const d = S.pulse, max = Math.max(3, ...d);
    const pts = d.map((v, i) => (i / (d.length - 1) * 60).toFixed(1) + ',' + (16 - v / max * 14).toFixed(1));
    const last = pts[pts.length - 1].split(',');
    return '<svg class="spark" viewBox="0 0 62 18"><polyline points="' + pts.join(' ') + '"/><circle cx="' + last[0] + '" cy="' + last[1] + '" r="1.8"/></svg>';
  }
  function trackPulse(snap) {
    const n = snap.stats.toolsToday || 0;
    const bucket = Math.floor(Date.now() / 5000);
    if (S.pulseBucket == null) S.pulseBucket = bucket;
    while (S.pulseBucket < bucket) { S.pulse.push(0); S.pulse.shift(); S.pulseBucket++; }
    if (S.pulseLast != null && n > S.pulseLast && n - S.pulseLast < 200) S.pulse[S.pulse.length - 1] += n - S.pulseLast;
    S.pulseLast = n;
  }
  function renderTicker(present) {
    const rows = [];
    if (!S.tl.T) for (const a of present) for (const r of (a.recent || []).slice(-4)) if (r.k !== 'info') rows.push({ a, r });
    rows.sort((x, y) => y.r.t - x.r.t);
    const seen = new Set(); // sin repetir la misma línea del mismo agente
    const top = rows.filter((x) => { const k = x.a.id + '|' + x.r.x; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 5);
    $('ticker').hidden = !top.length;
    const key = top.map((x) => x.a.id + x.r.t + x.r.x).join('|');
    if (key === S.tickerKey) return;
    const first = top[0] ? top[0].a.id + top[0].r.t + top[0].r.x : '';
    $('tickerList').innerHTML = top.map((x, i) =>
      '<li class="' + (i === 0 && first !== S.tickerFirst ? 'new' : '') + '" style="--c:' + (x.r.k === 'error' ? '#ff4d6d' : x.r.k === 'prompt' ? COLORS.ask : colorOf(x.a)) + '"><time>' + hhmm(x.r.t) + '</time><b>' + esc(nameOf(x.a)) + '</b><span class="x">' + (FEED_ICON[x.r.k] || '') + ' ' + esc(x.r.x) + '</span></li>').join('');
    S.tickerKey = key; S.tickerFirst = first;
  }

  function card(a, now, extra) {
    const c = colorOf(a);
    const busy = a.state === 'working' || a.state === 'thinking' || a.state === 'waiting';
    const text = a.state === 'offline' ? 'Se fue hace ' + dur(now - a.lastActiveAt) : (a.detail || STATE_LABEL[a.state]);
    return '<button class="card ' + (a.kind === 'sub' ? 'sub ' : '') + (a.state === 'waiting' ? 'waiting ' : '') + (a.state === 'working' || a.state === 'thinking' ? 'busy ' : '') + (a.state === 'offline' ? 'away ' : '') + (S.selected === a.id ? 'sel ' : '') + (extra || '') + '" data-id="' + esc(a.id) + '" style="--c:' + c + '">' +
      '<div class="ava" style="--img:url(' + portrait(a) + ')"></div>' +
      '<div><div class="l1"><span class="nick">' + esc(nameOf(a)) + '</span><span class="title">' + esc(titleOf(a)) + '</span>' +
      (busy && a.since ? '<span class="when" data-since="' + a.since + '"></span>' : '') + '</div>' +
      '<div class="l2"><em>' + iconOf(a) + '</em>' + esc(text) + '</div></div></button>';
  }

  function renderSide(all, present, now) {
    const sel = S.selected ? all.find((a) => a.id === S.selected) : null;
    let html;
    if (sel) html = detailHtml(sel, all, now);
    else {
      const list = S.showAway && !S.tl.T ? all.filter((a) => a.kind !== 'sub' || present.includes(a)) : present;
      const rank = { waiting: 0, working: 1, thinking: 1, idle: 2, done: 3, offline: 4 };
      const mains = list.filter((a) => a.kind !== 'sub' || !list.some((p) => p.id === a.parentId))
        .sort((a, b) => (rank[a.state] - rank[b.state]) || (b.lastActiveAt - a.lastActiveAt));
      const groups = new Map();
      for (const a of mains) { const p = a.project || 'Sin proyecto'; if (!groups.has(p)) groups.set(p, []); groups.get(p).push(a); }
      html = '<h3>Plantilla <small>' + present.length + ' en la oficina</small></h3>';
      if (!mains.length) html += '<p class="meta" style="padding:4px">Nadie por aquí todavía.</p>';
      for (const [p, arr] of groups) {
        const gc = window.OV.accent(p);
        html += '<div class="group"><i style="background:' + gc + ';color:' + gc + '"></i>' + esc(p) + '</div>';
        for (const a of arr) {
          html += card(a, now);
          for (const s of list.filter((x) => x.kind === 'sub' && x.parentId === a.id)) html += card(s, now);
        }
      }
    }
    if (html !== S.sideHtml) { S.sideHtml = html; $('side').innerHTML = html; }
  }

  function detailHtml(a, all, now) {
    const c = colorOf(a);
    const subs = all.filter((s) => s.parentId === a.id);
    const hot = new Set();
    if (S.snap) for (const cf of S.snap.conflicts) if (cf.agents.includes(a.id)) hot.add(cf.file);
    const t = a.tokens || {};
    const parent = a.parentId ? all.find((p) => p.id === a.parentId) : null;
    let h = '<button class="btn back" data-act="back">← Toda la plantilla</button>' +
      '<div class="hero" style="--c:' + c + '"><div class="ava" style="--img:url(' + portrait(a) + ')"></div><div>' +
      '<h2>' + esc(nameOf(a)) + '</h2><div class="sub2">' + esc(titleOf(a)) + '</div>' +
      '<div class="sub2">' + esc(SOURCE_LABEL[a.source] || a.source) + (a.role ? ' · ' + esc(a.role) : '') + (a.kind === 'sub' ? ' · becario' + (parent ? ' de ' + esc(nameOf(parent)) : '') : '') + '</div></div></div>' +
      '<div class="now" style="--c:' + c + '"><span class="pill" style="--c:' + c + '">' + iconOf(a) + ' ' + STATE_LABEL[a.state] + '</span> ' +
      '<span class="small">' + esc(a.state === 'waiting' || a.state === 'idle' || a.state === 'offline' || a.state === 'done' ? '' : (LABELS[a.activity] || '')) + ' <span data-since="' + (a.since || 0) + '" data-pre="desde hace "></span></span>' +
      '<div class="big">' + esc(a.detail || '—') + '</div></div>' +
      '<div class="kv">' +
      '<div><b>' + (a.tools || 0) + '</b><span>acciones</span></div>' +
      '<div title="Entrada ' + tok(t.in) + ' · salida ' + tok(t.out) + ' · caché leída ' + tok(t.cacheRead) + ' · caché escrita ' + tok(t.cacheWrite) + '"><b>' + tok((t.in || 0) + (t.out || 0) + (t.cacheWrite || 0)) + '</b><span>tokens</span></div>' +
      '<div><b>' + (a.errors || 0) + '</b><span>tropiezos</span></div>' +
      '<div><b>' + (a.startedAt ? dur(now - a.startedAt) : '—') + '</b><span>en la oficina</span></div>' +
      '<div><b>' + tok(t.out || 0) + '</b><span>tokens escritos</span></div>' +
      '<div><b>' + (a.cost != null ? '$' + a.cost.toFixed(2) : '—') + '</b><span>coste estimado</span></div>' +
      '</div>';
    if (a.lastPrompt) h += '<div class="block"><h4>Último encargo</h4><div class="quote">' + esc(a.lastPrompt) + '</div></div>';
    if (a.lastText) h += '<div class="block"><h4>Lo último que dijo</h4><div class="quote">' + esc(a.lastText) + '</div></div>';
    if (subs.length) h += '<div class="block"><h4>Sus becarios (' + subs.length + ')</h4>' + subs.map((s) => card(s, now, 'flat')).join('') + '</div>';
    if (a.files && a.files.length) {
      h += '<div class="block"><h4>Archivos que ha tocado</h4><ul class="files">' + a.files.map((f) =>
        '<li class="' + (hot.has(f.f) ? 'hot' : '') + '" title="' + esc(f.f) + '"><span>' + esc(f.f) + '&lrm;</span><span>×' + f.n + '</span><span>' + hhmm(f.t) + '</span></li>').join('') + '</ul></div>';
    }
    if (a.recent && a.recent.length) {
      h += '<div class="block"><h4>Actividad reciente</h4><ul class="feed">' + [...a.recent].reverse().map((r) =>
        '<li class="' + esc(r.k) + '"><time>' + hhmm(r.t) + '</time><span>' + (FEED_ICON[r.k] || '•') + '</span><span class="x">' + esc(r.x) + '</span></li>').join('') + '</ul></div>';
    }
    h += '<div class="block"><h4>Datos</h4><div class="meta">' +
      (a.project ? 'Proyecto: ' + esc(a.project) + '<br>' : '') +
      (a.cwd ? 'Carpeta: ' + esc(a.cwd) + '<br>' : '') +
      (a.branch ? 'Rama: ' + esc(a.branch) + '<br>' : '') +
      (a.model ? 'Modelo: ' + esc(a.model) + '<br>' : '') +
      'Id: ' + esc(a.id) + '</div>' +
      (a.cwd && a.kind !== 'sub' ? '<button class="btn" data-act="open" data-id="' + esc(a.id) + '" style="margin-top:6px">📂 Abrir su carpeta</button>' : '') + '</div>';
    return h;
  }

  function tickTimes() {
    const now = S.tl.T || Date.now();
    document.querySelectorAll('[data-since]').forEach((el) => {
      const s = Number(el.dataset.since);
      el.textContent = s ? (el.dataset.pre || '') + dur(now - s) : '';
    });
    $('clock').textContent = hhmm(Date.now());
  }

  function select(id) {
    S.selected = id || null;
    render();
    if (id) $('side').scrollTop = 0;
  }

  // ---------- línea de tiempo ----------
  const tlCv = $('tlCanvas');
  const LBL = 132;
  let lanes = [];

  async function loadTimeline() {
    try {
      const r = await fetch('/api/timeline?h=' + S.tl.hours);
      S.tl.data = await r.json();
      drawTimeline();
    } catch { /* se reintenta en el siguiente ciclo */ }
  }

  function drawTimeline() {
    const d = S.tl.data;
    if (!d || !S.tl.open) return;
    const order = [];
    const mains = d.agents.filter((a) => a.kind !== 'sub' || !d.agents.some((p) => p.id === a.parentId));
    mains.sort((a, b) => a.events[0].t - b.events[0].t);
    for (const m of mains) { order.push(m); for (const s of d.agents) if (s.kind === 'sub' && s.parentId === m.id) order.push(s); }
    lanes = order;
    const box = tlCv.parentElement.getBoundingClientRect();
    const w = Math.max(200, box.width), rowH = 20, top = 20;
    const h = Math.max(box.height - 2, top + order.length * rowH + 8);
    const dpr = window.devicePixelRatio || 1;
    tlCv.width = Math.round(w * dpr); tlCv.height = Math.round(h * dpr);
    tlCv.style.width = w + 'px'; tlCv.style.height = h + 'px';
    const ctx = tlCv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const lbl = w < 520 ? 84 : LBL;
    const X = (t) => lbl + (t - d.from) / (d.now - d.from) * (w - lbl - 10);
    tlCv._x = { lbl, w, from: d.from, to: d.now };

    // marcas de hora
    ctx.font = '11px "JetBrains Mono", monospace'; ctx.textBaseline = 'middle';
    const stepMin = S.tl.hours <= 1 ? 10 : S.tl.hours <= 3 ? 30 : 60;
    const first = new Date(d.from); first.setSeconds(0, 0); first.setMinutes(Math.ceil(first.getMinutes() / stepMin) * stepMin);
    for (let t = first.getTime(); t < d.now; t += stepMin * 60e3) {
      const x = X(t);
      ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(x, top - 4, 1, h);
      ctx.fillStyle = '#939bc0'; ctx.fillText(hhmm(t), x + 3, 9);
    }
    if (!order.length) { ctx.fillStyle = '#939bc0'; ctx.fillText('Todavía no hay actividad registrada en este tramo.', lbl, top + 20); }

    order.forEach((a, i) => {
      const y = top + i * rowH;
      const sub = a.kind === 'sub';
      ctx.fillStyle = i % 2 ? 'rgba(255,255,255,.025)' : 'transparent'; ctx.fillRect(0, y, w, rowH);
      ctx.font = (sub ? '500 11px' : '700 12.5px') + ' "Bricolage Grotesque", sans-serif';
      ctx.fillStyle = sub ? '#939bc0' : '#f5f1ea';
      let name = (sub ? '↳ ' : '') + look(a).nick + (lbl > 100 && a.project && !sub ? ' · ' + a.project : '');
      while (ctx.measureText(name).width > lbl - 10 && name.length > 3) name = name.slice(0, -2) + '…';
      ctx.fillText(name, 6, y + rowH / 2 + 1);
      for (let k = 0; k < a.events.length; k++) {
        const e = a.events[k];
        let t1 = k + 1 < a.events.length ? a.events[k + 1].t : d.now;
        const busy = e.s === 'working' || e.s === 'thinking';
        if (busy) t1 = Math.min(t1, e.t + 5 * 60e3);
        else if (e.s === 'idle') t1 = Math.min(t1, e.t + 20 * 60e3);
        if (t1 < d.from) continue;
        const x0 = X(Math.max(e.t, d.from)), x1 = Math.max(x0 + 1.2, X(t1));
        if (e.s === 'idle') { if (sub) continue; ctx.fillStyle = 'rgba(125,138,163,.35)'; ctx.fillRect(x0, y + rowH / 2 - 1, x1 - x0, 2); }
        else { ctx.fillStyle = e.s === 'waiting' ? COLORS.ask : (COLORS[e.a] || COLORS.tool); ctx.fillRect(x0, y + (sub ? 6 : 4), x1 - x0, rowH - (sub ? 12 : 8)); }
      }
    });
    const T = S.tl.T || d.now;
    const cx = X(Math.min(T, d.now));
    ctx.fillStyle = S.tl.T ? '#ffbe0b' : '#2ee6a0';
    ctx.fillRect(cx - 1, 0, 2, h);
    ctx.beginPath(); ctx.moveTo(cx - 6, 0); ctx.lineTo(cx + 6, 0); ctx.lineTo(cx, 8); ctx.closePath(); ctx.fill();
    $('tlTime').textContent = S.tl.T ? 'Viendo las ' + hhmm(S.tl.T, true) + '  ·  hace ' + dur(Date.now() - S.tl.T) : 'En directo';
    $('tlLive').hidden = !S.tl.T;
    $('tlPlay').textContent = S.tl.playing ? '⏸ Pausa' : '▶ Reproducir';
  }

  function scrub(e) {
    const m = tlCv._x;
    if (!m) return;
    const r = tlCv.getBoundingClientRect();
    const f = (e.clientX - r.left - m.lbl) / (m.w - m.lbl - 10);
    const T = m.from + Math.max(0, Math.min(1, f)) * (m.to - m.from);
    S.tl.T = f >= 0.995 ? null : T;
    S.tl.playing = false;
    S.sideHtml = '';
    render(); drawTimeline();
  }
  let scrubbing = false;
  tlCv.addEventListener('pointerdown', (e) => { scrubbing = true; tlCv.setPointerCapture(e.pointerId); scrub(e); });
  tlCv.addEventListener('pointermove', (e) => { if (scrubbing) scrub(e); });
  tlCv.addEventListener('pointerup', () => { scrubbing = false; });

  function goLive() { S.tl.T = null; S.tl.playing = false; S.sideHtml = ''; render(); drawTimeline(); }
  function openTimeline(open) {
    S.tl.open = open;
    $('timeline').hidden = !open;
    if (open) loadTimeline(); else goLive();
    render();
  }

  setInterval(() => { // reproducción: un minuto de oficina por segundo
    if (!S.tl.playing || !S.tl.T) return;
    S.tl.T += 6000;
    if (S.tl.T >= Date.now() - 2000) goLive(); else { render(); drawTimeline(); }
  }, 100);
  setInterval(() => { if (S.tl.open && !S.tl.T && !scrubbing) loadTimeline(); }, 15000);
  setInterval(tickTimes, 1000);
  new ResizeObserver(() => drawTimeline()).observe($('timeline'));

  // ---------- botones ----------
  $('btnRewind').onclick = () => openTimeline(!S.tl.open);
  $('tlClose').onclick = () => openTimeline(false);
  $('tlLive').onclick = goLive;
  $('tlPlay').onclick = () => {
    if (!S.tl.T && S.tl.data) S.tl.T = S.tl.data.from + 1000;
    S.tl.playing = !S.tl.playing;
    render(); drawTimeline();
  };
  $('tlRange').onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    S.tl.hours = Number(b.dataset.h);
    [...$('tlRange').children].forEach((x) => x.classList.toggle('on', x === b));
    S.tl.T = null;
    loadTimeline(); render();
  };
  $('btnAway').onclick = () => { S.showAway = prefs.away = !S.showAway; savePrefs(); render(); };
  $('btnSound').onclick = () => { S.sound = !S.sound; prefs.sound = S.sound; savePrefs(); render(); beep([[880, 0.12]]); };
  $('btnNotify').onclick = async () => {
    if (!S.notify && 'Notification' in window && Notification.permission !== 'granted') {
      const p = await Notification.requestPermission();
      if (p !== 'granted') { toast('Avisos bloqueados', 'El navegador no ha dado permiso para mostrar avisos.', '#ff4d6d'); return; }
    }
    S.notify = prefs.notify = !S.notify; savePrefs(); render();
    if (S.notify) toast('Avisos de escritorio activados', 'Te avisaré cuando alguien te necesite o termine, aunque estés en otra ventana.', COLORS.run);
  };
  $('btnMood').onclick = () => {
    S.mood = prefs.mood = { auto: 'day', day: 'night', night: 'auto' }[S.mood];
    office.mood = S.mood; savePrefs(); render();
  };
  const toggleCine = () => { prefs.cine = document.body.classList.toggle('cine'); savePrefs(); };
  $('btnCine').onclick = toggleCine;
  const toggleDemo = async () => {
    const on = !(S.snap && S.snap.demo);
    try { await fetch('/api/demo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ on }) }); } catch { /* servidor apagado */ }
    S.first = true;
  };
  $('btnDemo').onclick = toggleDemo;
  $('btnDemo2').onclick = toggleDemo;

  $('side').addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]');
    if (act) {
      if (act.dataset.act === 'back') select(null);
      if (act.dataset.act === 'open') {
        try {
          const r = await fetch('/api/open', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: act.dataset.id }) });
          if (!r.ok) toast('No se pudo abrir la carpeta', 'Puede que ya no exista.', '#ff4d6d');
        } catch { /* servidor apagado */ }
      }
      return;
    }
    const c = e.target.closest('.card');
    if (c) select(c.dataset.id);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (S.selected) select(null); else if (S.tl.T) goLive(); else if (document.body.classList.contains('cine')) toggleCine(); }
    else if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey && !e.altKey) toggleCine();
  });

  $('legend').innerHTML = ['edit', 'read', 'run', 'web', 'think', 'plan', 'delegate', 'ask'].map((k) => '<span><i style="background:' + COLORS[k] + ';color:' + COLORS[k] + '"></i>' + LABELS[k] + '</span>').join('');

  // ---------- opciones en la dirección: ?ambiente=noche&cine&rebobinar&ficha=Leo ----------
  function applyQuery() {
    const q = new URLSearchParams(location.search);
    const m = { dia: 'day', noche: 'night' }[q.get('ambiente')];
    if (m) S.mood = office.mood = m;
    if (q.has('cine')) document.body.classList.add('cine');
    if (q.has('rebobinar')) openTimeline(true);
    const f = (q.get('ficha') || '').toLowerCase();
    const who = f && S.snap.agents.find((x) => nameOf(x).toLowerCase() === f);
    if (who) select(who.id); else render();
  }

  // ---------- conexión en directo ----------
  function connect() {
    const es = new EventSource('/api/stream');
    es.onopen = () => { $('offline').hidden = true; };
    es.onmessage = (m) => {
      const snap = JSON.parse(m.data);
      S.snap = snap;
      trackPulse(snap);
      detectChanges(snap);
      render();
      if (!S.booted) { S.booted = true; applyQuery(); }
    };
    es.onerror = () => { $('offline').hidden = false; };
  }
  connect();
})();
