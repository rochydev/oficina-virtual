// Oficina Virtual — dibujo de la oficina isométrica en un <canvas>.
// Todo se pinta con código (sin imágenes), así no hay nada que descargar.
(function () {
  'use strict';

  const TW = 64, TH = 32, ZH = 32; // tamaño de una baldosa y altura de una unidad
  const WALL = 1.75;
  const FONT = '"Bricolage Grotesque", "Trebuchet MS", system-ui, sans-serif';
  const MONO = '"JetBrains Mono", ui-monospace, Consolas, monospace';

  const COLORS = {
    edit: '#ff6b4a', read: '#4db8ff', search: '#8b8cff', run: '#2ee6a0', web: '#22d3ee',
    think: '#c792ff', talk: '#ffd35c', plan: '#ffa24c', delegate: '#ff8fd0', tool: '#8fe3c0',
    ask: '#ffbe0b', idle: '#8792b0',
  };
  const ICONS = {
    edit: '✏️', read: '📖', search: '🔍', run: '⚙️', web: '🌐', think: '💭', talk: '💬',
    plan: '📋', delegate: '🤝', tool: '🔧', ask: '✋', idle: '☕',
  };
  const LABELS = {
    edit: 'Escribiendo código', read: 'Leyendo', search: 'Buscando', run: 'Ejecutando', web: 'En la web',
    think: 'Pensando', talk: 'Respondiendo', plan: 'Planificando', delegate: 'Delegando', tool: 'Con herramientas',
    ask: 'Te necesita', idle: 'Libre',
  };
  const NAMES = ['Lucía', 'Mateo', 'Vera', 'Hugo', 'Noa', 'Íker', 'Alma', 'Leo', 'Carla', 'Bruno', 'Inés', 'Dani', 'Sara', 'Teo', 'Olga', 'Marc', 'Nuria', 'Pau', 'Elsa', 'Gael', 'Rita', 'Unai', 'Maia', 'Izan', 'Cleo', 'Jon', 'Aina', 'Ciro'];
  const ROBOTS = ['Bit', 'Chip', 'Volt', 'Píxel', 'Tuerca', 'Nano', 'Byte', 'Zeta'];
  const SKINS = ['#f6d2b0', '#eebd96', '#d99e75', '#b97a52', '#8d5a3b', '#fbe0c8'];
  const HAIRS = ['#2b2118', '#5a3a22', '#8a5a2b', '#c98f3c', '#e6c36a', '#b5462f', '#3b3f58', '#d9d9e3', '#7a4fa3', '#1f6f78'];
  const PANTS = ['#2b3358', '#3a3350', '#27405a', '#40364a', '#1f2a44'];
  const SHIRTS = { claude: '#e8703f', codex: '#1fae8e', ollama: '#8a98bd' };
  const GLYPHS = ['{', '}', '<', '>', '/', ';', '=', '0', '1', '()', '=>', '#', '*', '+'];
  const CONFETTI = ['#ff6b4a', '#ffbe0b', '#2ee6a0', '#4db8ff', '#c792ff', '#ff8fd0', '#ffffff'];

  function hash(s) {
    let h = 2166136261;
    s = String(s);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  const hueOf = (name) => hash(name) % 360;
  const accent = (name, a, l, s) => 'hsla(' + hueOf(name) + ',' + (s || 82) + '%,' + (l || 64) + '%,' + (a == null ? 1 : a) + ')';
  const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')'; };

  function look(a) {
    const h = hash(a.id);
    const robot = a.source === 'ollama';
    return {
      robot,
      nick: robot ? ROBOTS[h % ROBOTS.length] : NAMES[h % NAMES.length],
      skin: SKINS[(h >>> 5) % SKINS.length],
      hair: HAIRS[(h >>> 9) % HAIRS.length],
      style: (h >>> 14) % 6,
      acc: (h >>> 18) % 5,
      pants: PANTS[(h >>> 21) % PANTS.length],
      shirt: a.kind === 'sub' ? '#f1c7a2' : (SHIRTS[a.source] || '#e8703f'),
      source: a.source,
      seed: (h % 1000) / 100,
      k: a.kind === 'sub' ? 0.78 : 1,
    };
  }

  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const c = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
    return 'rgb(' + c(n >> 16) + ',' + c((n >> 8) & 255) + ',' + c(n & 255) + ')';
  }

  function sky(h) {
    if (h < 5.5 || h >= 21.5) return { top: '#060a22', bot: '#1b2660', dark: 0.44, phase: 'night' };
    if (h < 8) return { top: '#f58f6c', bot: '#ffdca8', dark: 0.14, phase: 'dawn' };
    if (h < 18) return { top: '#4fb0f0', bot: '#c9edff', dark: 0, phase: 'day' };
    if (h < 20) return { top: '#ee7a5c', bot: '#ffcf8a', dark: 0.16, phase: 'dusk' };
    return { top: '#2a2a6c', bot: '#a8587a', dark: 0.36, phase: 'late' };
  }

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /** Dibuja un trabajador. (0,0) son sus pies. */
  function drawWorker(ctx, o) {
    const t = o.t + o.seed;
    const sit = o.sit;
    const by = sit ? 7 : 0;
    const bob = o.walk ? Math.abs(Math.sin(t * 9)) * 1.8 : Math.sin(t * 2) * 0.6;
    const dark = shade(o.shirt, 0.68), lite = shade(o.shirt, 1.16);
    const skinD = shade(o.skin, 0.86);
    const fillR = (x, y, w, h, r) => { rr(ctx, x, y, w, h, r); ctx.fill(); };
    const dot = (x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); };
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    ctx.fillStyle = 'rgba(12,8,34,.3)';
    ctx.beginPath(); ctx.ellipse(0, 0.5, 12, 4.8, 0, 0, 7); ctx.fill();

    if (sit) { // silla
      ctx.fillStyle = '#1b2140'; fillR(-11.5, -33 + by, 23, 27, 7);
      ctx.fillStyle = '#2d3766'; fillR(-9.5, -31 + by, 19, 22, 5);
    } else {
      const sw = o.walk ? Math.sin(t * 9) * 2.6 : 0;
      ctx.fillStyle = o.robot ? '#4c5673' : o.pants;
      fillR(-6.6, -11 - Math.max(0, sw), 5.4, 10, 2.2); fillR(1.2, -11 - Math.max(0, -sw), 5.4, 10, 2.2);
      ctx.fillStyle = o.robot ? '#2a3147' : '#171a2c';
      fillR(-7.4, -2.8 - Math.max(0, sw), 6.6, 3.3, 1.6); fillR(0.8, -2.8 - Math.max(0, -sw), 6.6, 3.3, 1.6);
    }

    const top = -28 + by - bob;
    const g = ctx.createLinearGradient(0, top, 0, top + 20);
    g.addColorStop(0, lite); g.addColorStop(0.55, o.shirt); g.addColorStop(1, dark);
    ctx.fillStyle = g; fillR(-9.2, top, 18.4, 19.8, 6.8);
    if (!o.robot) { ctx.fillStyle = skinD; fillR(-2.6, top - 2.6, 5.2, 4.6, 2); }

    if (o.robot) { // barra de luz en el pecho
      ctx.fillStyle = '#19213d'; fillR(-5.5, top + 6, 11, 4.4, 2);
      ctx.fillStyle = '#5df2d6'; fillR(-4.5, top + 7, 3 + (Math.sin(t * 4) * 0.5 + 0.5) * 6, 2.4, 1.2);
    } else if (o.sub) { // acreditación de becario
      ctx.strokeStyle = '#3a4a7a'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(-4, top + 1); ctx.lineTo(0, top + 9); ctx.lineTo(4, top + 1); ctx.stroke();
      ctx.fillStyle = '#fff'; fillR(-2.6, top + 8, 5.2, 5.6, 1);
      ctx.fillStyle = '#ff8fd0'; ctx.fillRect(-1.6, top + 9.2, 3.2, 1.4);
    } else if (o.source === 'codex') {
      ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.arc(4.2, top + 6.6, 2.1, 0, 7); ctx.stroke();
    } else { // chispa en el pecho
      ctx.strokeStyle = 'rgba(255,255,255,.92)'; ctx.lineWidth = 1.2;
      for (let i = 0; i < 3; i++) {
        const an = i * Math.PI / 3;
        ctx.beginPath(); ctx.moveTo(4.2 - Math.cos(an) * 2.4, top + 6.6 - Math.sin(an) * 2.4); ctx.lineTo(4.2 + Math.cos(an) * 2.4, top + 6.6 + Math.sin(an) * 2.4); ctx.stroke();
      }
    }

    // brazos y lo que llevan en las manos
    const hand = (x, y) => { ctx.fillStyle = o.robot ? '#d5ddee' : o.skin; dot(x, y, 2.8); };
    const arm = (x0, y0, x1, y1) => { ctx.strokeStyle = dark; ctx.lineWidth = 4.6; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.strokeStyle = o.shirt; ctx.lineWidth = 3.4; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); hand(x1, y1); };
    const sh = top + 5;
    const pose = o.walk ? 'walk' : o.pose;
    if (pose === 'type') {
      const j = Math.sin(t * 17) * 1.4;
      arm(-8, sh, -5.5, top + 15 + j); arm(8, sh, 5.5, top + 15 - j);
    } else if (pose === 'think') {
      arm(-8, sh, -7, top + 15); arm(8, sh, 4.5, top - 1 + Math.sin(t * 2) * 0.6);
    } else if (pose === 'wave') {
      arm(-8, sh, -9, top + 15);
      arm(8, sh, 13.5 + Math.sin(t * 9) * 2.6, top - 13);
    } else if (pose === 'book') {
      arm(-8, sh, -5, top + 10); arm(8, sh, 5, top + 10);
      ctx.fillStyle = '#2f7fd0'; fillR(-7.5, top + 3.5, 15, 10, 1.6);
      ctx.fillStyle = '#f2f8ff'; ctx.fillRect(-6, top + 5, 12, 7);
      ctx.fillStyle = '#2f7fd0'; ctx.fillRect(-0.5, top + 3.5, 1, 10);
      ctx.fillStyle = 'rgba(40,60,110,.35)';
      for (let i = 0; i < 3; i++) { ctx.fillRect(-5, top + 6.4 + i * 1.9, 3.6, 0.7); ctx.fillRect(1.4, top + 6.4 + i * 1.9, 3.6, 0.7); }
    } else if (pose === 'coffee') {
      arm(-8, sh, -9, top + 15); arm(8, sh, 9, top + 9);
      ctx.fillStyle = '#fff'; fillR(6.5, top + 3.5, 6, 6.5, 1.5);
      ctx.fillStyle = '#ff6b4a'; ctx.fillRect(6.5, top + 6, 6, 1.6);
      ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(9.5, top + 2); ctx.quadraticCurveTo(11.5 + Math.sin(t * 3) * 1.5, top - 2, 9.5, top - 6); ctx.stroke();
    } else if (pose === 'operate') {
      arm(-8, sh, -9, top + 15); arm(8, sh, 14, top + 3 + Math.sin(t * 6) * 1.5);
    } else if (pose === 'point') {
      arm(-8, sh, -9, top + 15); arm(8, sh, 13, top - 9 + Math.sin(t * 3) * 1.5);
    } else if (pose === 'tablet') {
      arm(-8, sh, -5, top + 11); arm(8, sh, 5 + Math.sin(t * 12) * 1, top + 10);
      ctx.fillStyle = '#161c36'; fillR(-7, top + 5.5, 14, 9.5, 1.8);
      ctx.fillStyle = o.glow || '#8fe3c0'; ctx.fillRect(-5.6, top + 7, 11.2, 6.4);
      ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(-4.6, top + 8.2, 5 + Math.sin(t * 5) * 2, 0.9); ctx.fillRect(-4.6, top + 10.4, 7, 0.9);
    } else if (pose === 'walk') {
      const s = Math.sin(t * 9) * 4;
      arm(-8, sh, -9 - s * 0.3, top + 14 + s * 0.4); arm(8, sh, 9 + s * 0.3, top + 14 - s * 0.4);
    } else {
      arm(-8, sh, -9, top + 15); arm(8, sh, 9, top + 15);
    }

    // cabeza
    const hy = top - 8;
    if (o.robot) {
      ctx.strokeStyle = '#aab6d1'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, hy - 8); ctx.lineTo(0, hy - 14); ctx.stroke();
      ctx.fillStyle = Math.sin(t * 5) > 0 ? '#5df2d6' : '#2b8f7f'; dot(0, hy - 15, 2.3);
      const hg = ctx.createLinearGradient(0, hy - 9, 0, hy + 8);
      hg.addColorStop(0, '#e6ecf8'); hg.addColorStop(1, '#a9b5d0');
      ctx.fillStyle = hg; fillR(-10, hy - 9, 20, 17.5, 5.5);
      ctx.fillStyle = '#8f9cba'; fillR(-11.8, hy - 3, 2.6, 6, 1.2); fillR(9.2, hy - 3, 2.6, 6, 1.2);
      ctx.fillStyle = '#131a36'; fillR(-7.6, hy - 5.4, 15.2, 10.6, 3.4);
      ctx.fillStyle = '#5df2d6';
      const blink = (t % 3.7) < 0.12;
      fillR(-5, hy - (blink ? 1.4 : 3.2), 3, blink ? 1 : 3.4, 1); fillR(2, hy - (blink ? 1.4 : 3.2), 3, blink ? 1 : 3.4, 1);
      for (let i = 0; i < 4; i++) ctx.fillRect(-3.4 + i * 1.9, hy + 2.6 - (pose === 'type' ? Math.abs(Math.sin(t * 9 + i)) * 1.2 : 0), 1.1, 1 + (pose === 'type' ? Math.abs(Math.sin(t * 9 + i)) * 1.2 : 0));
    } else {
      if (o.style === 4) { ctx.fillStyle = o.hair; dot(0, hy - 2.2, 12); dot(-8, hy - 6, 5); dot(8, hy - 6, 5); }
      if (o.style === 2) { ctx.fillStyle = o.hair; fillR(-10.4, hy - 4, 20.8, 15, 5); }
      ctx.fillStyle = skinD; dot(-9.2, hy + 1.2, 2.1); dot(9.2, hy + 1.2, 2.1);
      ctx.fillStyle = o.skin; dot(0, hy, 9.4);
      ctx.fillStyle = o.hair;
      if (o.style === 5) { // gorra
        ctx.fillStyle = dark;
        ctx.beginPath(); ctx.arc(0, hy - 1.4, 9.8, Math.PI * 1.03, Math.PI * 1.97); ctx.closePath(); ctx.fill();
        fillR(-2 + o.face * 2, hy - 4.6, 12.5, 2.8, 1.4);
        ctx.fillStyle = 'rgba(255,255,255,.75)'; dot(0, hy - 7.4, 1.3);
      } else {
        ctx.beginPath(); ctx.arc(0, hy - 0.8, 9.8, Math.PI * 1.02, Math.PI * 1.98); ctx.closePath(); ctx.fill();
        if (o.style === 0) { ctx.fillRect(-9.8, hy - 2.5, 3.2, 6.5); ctx.fillRect(6.6, hy - 2.5, 3.2, 6.5); }
        else if (o.style === 1) { dot(0, hy - 11, 4.5); }
        else if (o.style === 3) { ctx.beginPath(); ctx.moveTo(-9.4, hy - 3); ctx.quadraticCurveTo(-2, hy - 0.4, 6.4, hy - 6); ctx.lineTo(-6, hy - 9.4); ctx.closePath(); ctx.fill(); }
        ctx.fillStyle = 'rgba(255,255,255,.16)'; // brillo del pelo
        ctx.beginPath(); ctx.ellipse(-3.4, hy - 6.6, 3.6, 1.5, -0.5, 0, 7); ctx.fill();
      }
      const blink = (t % 4.3) < 0.13;
      const ex = o.face * 0.9, ey = pose === 'think' ? -0.8 : 0;
      ctx.fillStyle = '#1a1f33';
      if (blink) { ctx.fillRect(-4.6 + ex, hy + 1.6, 2.8, 0.9); ctx.fillRect(1.8 + ex, hy + 1.6, 2.8, 0.9); }
      else {
        ctx.beginPath(); ctx.ellipse(-3.2 + ex, hy + 1.7 + ey, 1.35, 1.6, 0, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.ellipse(3.2 + ex, hy + 1.7 + ey, 1.35, 1.6, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#fff'; dot(-2.8 + ex, hy + 1.1 + ey, 0.5); dot(3.6 + ex, hy + 1.1 + ey, 0.5);
      }
      ctx.fillStyle = 'rgba(235,90,80,.26)'; dot(-5.8, hy + 4.2, 1.9); dot(5.8, hy + 4.2, 1.9);
      // boca
      if (pose === 'wave') { ctx.fillStyle = '#7a2b2b'; ctx.beginPath(); ctx.arc(ex, hy + 4.6, 2, 0, Math.PI); ctx.closePath(); ctx.fill(); }
      else if (pose === 'think') { ctx.fillStyle = '#7a2b2b'; dot(1 + ex, hy + 5.4, 0.9); }
      else { ctx.strokeStyle = 'rgba(90,35,35,.75)'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.arc(ex, hy + 4.2, 1.9, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke(); }
      if (o.acc === 1) { // gafas
        ctx.strokeStyle = '#1a1f33'; ctx.lineWidth = 0.9;
        ctx.beginPath(); ctx.arc(-3.2 + ex, hy + 1.7, 2.7, 0, 7); ctx.stroke();
        ctx.beginPath(); ctx.arc(3.2 + ex, hy + 1.7, 2.7, 0, 7); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-0.5 + ex, hy + 1.5); ctx.lineTo(0.5 + ex, hy + 1.5); ctx.stroke();
      } else if (o.acc === 2 && o.style !== 5) { // cascos
        ctx.strokeStyle = '#1a1f33'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, hy - 0.5, 10.4, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke();
        ctx.fillStyle = '#1a1f33'; fillR(-12, hy - 2.2, 4, 7.4, 1.8); fillR(8, hy - 2.2, 4, 7.4, 1.8);
        ctx.fillStyle = '#ff6b4a'; ctx.fillRect(-11.4, hy + 0.6, 1.2, 2); ctx.fillRect(10.2, hy + 0.6, 1.2, 2);
      }
    }
  }

  const portraits = new Map();
  /** Retrato pequeño de un agente (para la lista lateral). */
  function portrait(a) {
    const key = a.id + '|' + a.kind + '|' + a.source;
    if (portraits.has(key)) return portraits.get(key);
    const c = document.createElement('canvas');
    c.width = c.height = 112;
    const ctx = c.getContext('2d');
    const L = look(a);
    ctx.translate(56, 128);
    ctx.scale(2.75, 2.75);
    drawWorker(ctx, Object.assign({ t: 1, sit: false, pose: 'rest', walk: false, face: 0, sub: a.kind === 'sub' }, L, { seed: 0.5 }));
    const url = c.toDataURL();
    portraits.set(key, url);
    return url;
  }

  class Office {
    constructor(canvas) {
      this.cv = canvas;
      this.ctx = canvas.getContext('2d');
      this.agents = [];
      this.conflicts = [];
      this.rooms = [];
      this.order = [];
      this.vis = new Map();
      this.rs = new Map(); // estado que sobrevive entre refrescos, por sala
      this.fx = [];
      this.bursts = [];
      this.cam = { x: 0, y: 0, z: 1 };
      this.userView = false;
      this.selected = null;
      this.hover = null;
      this.hits = [];
      this.viewTime = null;
      this.mood = 'auto'; // auto | day | night
      this.onSelect = null;
      this.t0 = 0; this.tNow = 0; this.dt = 0.016;
      this.w = 300; this.h = 200;
      this.bind();
      new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
      this.resize();
      requestAnimationFrame((ts) => this.frame(ts));
    }

    resize() {
      const r = this.cv.parentElement.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      this.w = Math.max(50, r.width); this.h = Math.max(50, r.height);
      this.cv.width = Math.round(this.w * dpr); this.cv.height = Math.round(this.h * dpr);
      this.cv.style.width = this.w + 'px'; this.cv.style.height = this.h + 'px';
      this.dpr = dpr;
    }

    bind() {
      const cv = this.cv;
      let down = null, moved = false;
      cv.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, cx: this.cam.x, cy: this.cam.y }; moved = false; cv.setPointerCapture(e.pointerId); });
      cv.addEventListener('pointermove', (e) => {
        const r = cv.getBoundingClientRect();
        const mx = e.clientX - r.left, my = e.clientY - r.top;
        if (down) {
          const dx = e.clientX - down.x, dy = e.clientY - down.y;
          if (Math.abs(dx) + Math.abs(dy) > 5) moved = true;
          if (moved) { this.userView = true; this.cam.x = down.cx - dx / this.cam.z; this.cam.y = down.cy - dy / this.cam.z; cv.style.cursor = 'grabbing'; }
        } else {
          const hit = this.hitAt(mx, my);
          this.hover = hit;
          cv.style.cursor = hit ? 'pointer' : 'grab';
        }
      });
      cv.addEventListener('pointerup', (e) => {
        if (down && !moved) {
          const r = cv.getBoundingClientRect();
          const hit = this.hitAt(e.clientX - r.left, e.clientY - r.top);
          if (this.onSelect) this.onSelect(hit);
        }
        down = null; cv.style.cursor = 'grab';
      });
      cv.addEventListener('pointerleave', () => { this.hover = null; });
      cv.addEventListener('wheel', (e) => { // acerca hacia donde está el cursor
        e.preventDefault();
        this.userView = true;
        const r = cv.getBoundingClientRect();
        const mx = e.clientX - r.left - this.w / 2, my = e.clientY - r.top - this.h / 2;
        const z0 = this.cam.z;
        const z1 = Math.max(0.3, Math.min(3, z0 * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
        this.cam.x += mx / z0 - mx / z1; this.cam.y += my / z0 - my / z1; this.cam.z = z1;
      }, { passive: false });
      cv.addEventListener('dblclick', () => { this.userView = false; });
    }

    hitAt(x, y) {
      for (let i = this.hits.length - 1; i >= 0; i--) {
        const h = this.hits[i];
        if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h.id;
      }
      return null;
    }

    /** Lluvia de confeti sobre un agente (cuando termina su turno). */
    celebrate(id) { this.bursts.push(id); }

    /** Recibe los agentes a mostrar y recalcula salas y mesas. */
    setData(agents, conflicts, viewTime) {
      this.agents = agents;
      this.conflicts = conflicts || [];
      this.viewTime = viewTime || null;
      const byProject = new Map();
      const ids = new Set(agents.map((a) => a.id));
      const byId = new Map(agents.map((a) => [a.id, a]));
      for (const a of agents) {
        let p = a.project || 'Sin proyecto';
        if (a.kind === 'sub' && byId.has(a.parentId)) p = byId.get(a.parentId).project || p;
        if (!byProject.has(p)) byProject.set(p, []);
        byProject.get(p).push(a);
      }
      this.order = this.order.filter((p) => byProject.has(p));
      for (const p of byProject.keys()) if (!this.order.includes(p)) this.order.push(p);

      const rooms = this.order.map((name) => {
        const list = byProject.get(name);
        const mains = list.filter((a) => a.kind !== 'sub' || !ids.has(a.parentId))
          .sort((a, b) => (a.startedAt - b.startedAt) || (a.id < b.id ? -1 : 1));
        const n = Math.max(1, mains.length);
        const rows = n <= 3 ? 1 : 2;
        const cols = Math.ceil(n / rows);
        const W = Math.max(8, Math.ceil(3.2 + cols * 2.3 + 1));
        const D = rows === 1 ? 6 : 8.5;
        const desks = new Map();
        mains.forEach((a, i) => desks.set(a.id, { x: 3.1 + (i % cols) * 2.3, y: 2.5 + Math.floor(i / cols) * 2.9, a }));
        return { name, list, mains, W, D, desks, ox: 0, oy: 0 };
      });
      if (!rooms.length) rooms.push({ name: 'Oficina', list: [], mains: [], W: 8, D: 6, desks: new Map(), ox: 0, oy: 0, empty: true });

      // Las salas se colocan en una cuadrícula.
      // Se prueba cada reparto y se queda el que más grande se ve en esta ventana.
      // «shear» desplaza cada fila para que quede justo debajo de la anterior en pantalla
      // (sin él las filas bajan en diagonal), lo que aprovecha mejor las ventanas altas.
      const place = (perRow, shear) => {
        let oy = 0, sx = 0;
        for (let r = 0; r * perRow < rooms.length; r++) {
          const row = rooms.slice(r * perRow, (r + 1) * perRow);
          let ox = sx, maxD = 0;
          for (const room of row) { room.ox = ox; room.oy = oy; ox += room.W + 2; maxD = Math.max(maxD, room.D); }
          oy += maxD + (shear ? 3.3 : 2.4);
          if (shear) sx += maxD + 3.3;
        }
      };
      this.rooms = rooms;
      let best = [1, 0], bestZ = 0;
      for (let pr = 1; pr <= rooms.length; pr++) for (let sh = 0; sh < 2; sh++) {
        place(pr, sh);
        const z = this.fit().z;
        if (z > bestZ + 0.001) { bestZ = z; best = [pr, sh]; }
      }
      place(best[0], best[1]);

      // las salas nuevas suben desde abajo, una detrás de otra
      for (const k of [...this.rs.keys()]) if (!rooms.some((r) => r.name === k)) this.rs.delete(k);
      let fresh = 0;
      for (const room of rooms) {
        if (!this.rs.has(room.name)) this.rs.set(room.name, { born: this.tNow + 0.15 + (fresh++) * 0.14, rb: (hash(room.name) % 100) / 10 });
        room.st = this.rs.get(room.name);
      }

      for (const id of [...this.vis.keys()]) if (!ids.has(id)) this.vis.delete(id);
      for (const room of rooms) {
        room.list.forEach((a, idx) => {
          let v = this.vis.get(a.id);
          if (!v) {
            const pv = a.kind === 'sub' ? this.vis.get(a.parentId) : null;
            v = { x: pv ? pv.x : room.W / 2, y: pv ? pv.y + 0.6 : room.D - 0.4, alpha: 0, walk: false, face: 0, key: '', want: '', wantAt: 0, room: room.name, L: look(a), poof: true, glyphAt: 0 };
            this.vis.set(a.id, v);
          }
          if (v.room !== room.name) { v.room = room.name; v.x = room.W / 2; v.y = room.D - 0.4; }
          v.a = a; v.idx = idx; v.roomRef = room;
        });
      }
    }

    /** Dónde debe estar un agente y qué postura tiene, según lo que está haciendo. */
    targetFor(a, room, v, now) {
      const slot = v.idx % 3;
      const isSub = a.kind === 'sub' && !room.desks.has(a.id);
      let desk = room.desks.get(a.id);
      let seat;
      if (isSub) {
        const pd = room.desks.get(a.parentId);
        const sibs = room.list.filter((s) => s.parentId === a.parentId && s.kind === 'sub');
        const k = sibs.indexOf(a);
        seat = pd ? { x: pd.x + 0.1 + (k % 3) * 0.62, y: pd.y + 1.6 + Math.floor(k / 3) * 0.55, sit: false, pose: 'tablet' }
          : { x: 2 + k * 0.6, y: room.D - 1, sit: false, pose: 'tablet' };
      } else {
        desk = desk || { x: 3.1, y: 2.5 };
        seat = { x: desk.x + 0.75, y: desk.y - 0.42, sit: true, pose: 'type' };
      }
      if (a.state === 'waiting') return isSub ? seat : { x: desk.x + 0.75, y: desk.y + 1.5, sit: false, pose: 'wave' };
      if (a.state === 'idle' || a.state === 'done') {
        if (!isSub && now - (a.since || 0) > 90e3) return { x: 1.55 + slot * 0.6, y: room.D - 1.15, sit: false, pose: 'coffee' };
        return Object.assign({}, seat, { pose: 'rest' });
      }
      switch (a.activity) {
        case 'read': case 'search': return { x: 1.2, y: 2.1 + slot * 0.62, sit: false, pose: 'book' };
        case 'run': return { x: room.W - 1.55 - slot * 0.6, y: 1.75, sit: false, pose: 'operate' };
        case 'plan': return { x: 3.0 + slot * 0.62, y: 1.05, sit: false, pose: 'point' };
        case 'think': return Object.assign({}, seat, { pose: isSub ? 'tablet' : 'think' });
        default: return seat;
      }
    }

    update(dt, now) {
      for (const v of this.vis.values()) {
        const a = v.a, room = v.roomRef;
        if (!a || !room) continue;
        const want = a.state + '|' + a.activity;
        if (want !== v.want) { v.want = want; v.wantAt = now; }
        // Un pequeño retardo evita que corran de un lado a otro por acciones de un segundo.
        if (v.key !== v.want && (now - v.wantAt > 650 || a.state === 'waiting' || !v.key)) v.key = v.want;
        const tk = v.key + room.W + '|' + v.idx + (now - (a.since || 0) > 90e3);
        if (!v.target || v.targetKey !== tk) {
          const [st, ac] = v.key.split('|');
          v.target = this.targetFor(Object.assign({}, a, { state: st, activity: ac }), room, v, now);
          v.targetKey = tk;
        }
        const dx = v.target.x - v.x, dy = v.target.y - v.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 0.04) {
          const step = Math.min(dist, 2.6 * dt);
          v.x += dx / dist * step; v.y += dy / dist * step;
          v.walk = true;
          v.face = (dx - dy) > 0.01 ? 1 : (dx - dy) < -0.01 ? -1 : 0;
        } else { v.walk = false; v.face = 0; }
        v.alpha = Math.min(1, v.alpha + dt * 2.5);
      }
    }

    fit() {
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const r of this.rooms) {
        for (const [x, y, z] of [[0, 0, WALL + 1.1], [r.W, 0, WALL], [0, r.D, WALL], [r.W, r.D, -0.6]]) {
          const gx = r.ox + x, gy = r.oy + y;
          const px = (gx - gy) * TW / 2, py = (gx + gy) * TH / 2 - z * ZH;
          x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
        }
      }
      const z = Math.max(0.3, Math.min(1.8, Math.min(this.w / (x1 - x0 + 80), this.h / (y1 - y0 + 120))));
      return { x: (x0 + x1) / 2, y: (y0 + y1) / 2 - 8, z };
    }

    frame(ts) {
      const t = ts / 1000;
      const dt = Math.min(0.05, t - this.t0 || 0.016);
      this.t0 = t; this.tNow = t; this.dt = dt;
      const now = this.viewTime || Date.now();
      this.update(dt, now);
      if (!this.userView) {
        const f = this.fit();
        const k = Math.min(1, dt * 4);
        this.cam.x += (f.x - this.cam.x) * k; this.cam.y += (f.y - this.cam.y) * k; this.cam.z += (f.z - this.cam.z) * k;
      }
      this.draw(t, now);
      requestAnimationFrame((n) => this.frame(n));
    }

    spawn(p) { if (this.fx.length < 500) this.fx.push(p); }

    draw(t, now) {
      const ctx = this.ctx, dpr = this.dpr, cam = this.cam, dt = this.dt;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.cv.width, this.cv.height);
      const ox = this.w / 2 - cam.x * cam.z, oy = this.h / 2 - cam.y * cam.z;
      ctx.setTransform(dpr * cam.z, 0, 0, dpr * cam.z, dpr * ox, dpr * oy);
      const toScreen = (p) => [ox + p[0] * cam.z, oy + p[1] * cam.z];

      const d = new Date(now);
      const hour = this.mood === 'day' ? 13 : this.mood === 'night' ? 23.5 : d.getHours() + d.getMinutes() / 60;
      const S = sky(hour);
      const dark = S.dark, night = dark > 0.3;
      const over = []; // bocadillos y etiquetas, siempre por encima
      const glows = []; // luces que se suman al final
      const glow = (p, r, c) => glows.push({ x: p[0], y: p[1], r, c });
      const heads = new Map();
      this.hits = [];
      const real = new Date();

      const rooms = [...this.rooms].sort((a, b) => (a.ox + a.oy) - (b.ox + b.oy));
      for (const room of rooms) {
        const st = room.st || { born: 0, rb: 0 };
        const e = Math.max(0, Math.min(1, (t - st.born) / 0.9));
        if (e <= 0) continue;
        const ease = 1 - Math.pow(1 - e, 3);
        const lift = (1 - ease) * 2.4;
        const fade = Math.min(1, e * 1.6);
        const GA = (x) => { ctx.globalAlpha = fade * x; };
        GA(1);
        const P = (x, y, z) => { const gx = room.ox + x, gy = room.oy + y; return [(gx - gy) * TW / 2, (gx + gy) * TH / 2 - ((z || 0) - lift) * ZH]; };
        const poly = (pts, fill, stroke, lw) => {
          ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
          for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
          ctx.closePath();
          if (fill) { ctx.fillStyle = fill; ctx.fill(); }
          if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); }
        };
        const line = (a, b, c, lw) => { ctx.strokeStyle = c; ctx.lineWidth = lw || 1; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); };
        const lin = (a, b, c0, c1) => { const g = ctx.createLinearGradient(a[0], a[1], b[0], b[1]); g.addColorStop(0, c0); g.addColorStop(1, c1); return g; };
        const box = (x, y, z, w, dd, h, c) => {
          poly([P(x, y + dd, z), P(x + w, y + dd, z), P(x + w, y + dd, z + h), P(x, y + dd, z + h)], shade(c, 0.8));
          poly([P(x + w, y, z), P(x + w, y + dd, z), P(x + w, y + dd, z + h), P(x + w, y, z + h)], shade(c, 0.62));
          poly([P(x, y, z + h), P(x + w, y, z + h), P(x + w, y + dd, z + h), P(x, y + dd, z + h)], c);
        };
        const shadow = (x, y, w, dd, a) => poly([P(x - 0.06, y + 0.1), P(x + w + 0.16, y + 0.1), P(x + w + 0.16, y + dd + 0.16), P(x - 0.06, y + dd + 0.16)], 'rgba(40,24,60,' + (a || 0.16) + ')');
        const { W, D } = room;
        const ac = (a, l, s) => accent(room.name, a, l, s);

        // resplandor bajo la plataforma, losa y borde de neón
        const cg = P(W / 2, D / 2, -1.1);
        const ug = ctx.createRadialGradient(cg[0], cg[1], 10, cg[0], cg[1], (W + D) * 26);
        ug.addColorStop(0, ac(0.5, 60)); ug.addColorStop(0.5, ac(0.12, 60)); ug.addColorStop(1, ac(0, 60));
        ctx.save(); ctx.translate(cg[0], cg[1]); ctx.scale(1, 0.5); ctx.translate(-cg[0], -cg[1]);
        ctx.fillStyle = ug; ctx.beginPath(); ctx.arc(cg[0], cg[1], (W + D) * 26, 0, 7); ctx.fill(); ctx.restore();
        const SL = -0.5;
        poly([P(0, D, 0), P(W, D, 0), P(W, D, SL), P(0, D, SL)], lin(P(0, D, 0), P(0, D, SL), '#2a2f58', '#12152c'));
        poly([P(W, 0, 0), P(W, D, 0), P(W, D, SL), P(W, 0, SL)], lin(P(W, D, 0), P(W, D, SL), '#1e2244', '#0c0e20'));
        line(P(0, D, -0.12), P(W, D, -0.12), ac(0.28), 5); line(P(W, D, -0.12), P(W, 0, -0.12), ac(0.2), 5);
        line(P(0, D, -0.12), P(W, D, -0.12), ac(1, 74), 1.4); line(P(W, D, -0.12), P(W, 0, -0.12), ac(0.8, 70), 1.4);
        glow(P(W / 2, D, -0.12), 120, ac(0.13));

        // suelo de tablones
        const FL = ['#ecdcc0', '#e4d1b0', '#dbc6a1'];
        const c0 = P(0, 0), c1 = P(W, 0), c2 = P(W, D), c3 = P(0, D);
        poly([c0, c1, c2, c3], FL[0]);
        ctx.save();
        ctx.beginPath(); ctx.moveTo(c0[0], c0[1]); ctx.lineTo(c1[0], c1[1]); ctx.lineTo(c2[0], c2[1]); ctx.lineTo(c3[0], c3[1]); ctx.closePath(); ctx.clip();
        for (let y = 0, i = 0; y < D; y += 0.5, i++) {
          const off = (i % 3) * 0.9;
          for (let x = -off, j = 0; x < W; x += 2.7, j++) {
            poly([P(Math.max(0, x), y), P(Math.min(W, x + 2.7), y), P(Math.min(W, x + 2.7), y + 0.5), P(Math.max(0, x), y + 0.5)], FL[(i * 7 + j * 3) % 3], 'rgba(140,100,55,.14)');
          }
        }
        // alfombra del color del proyecto
        poly([P(2.4, 1.6), P(W - 0.8, 1.6), P(W - 0.8, D - 0.6), P(2.4, D - 0.6)], ac(0.5, 60, 62));
        poly([P(2.58, 1.78), P(W - 0.98, 1.78), P(W - 0.98, D - 0.78), P(2.58, D - 0.78)], null, 'rgba(255,255,255,.45)', 1.2);
        poly([P(2.76, 1.96), P(W - 1.16, 1.96), P(W - 1.16, D - 0.96), P(2.76, D - 0.96)], ac(0.22, 78, 70));
        // luz que entra por las ventanas
        const lightC = S.phase === 'day' ? '255,250,225' : S.phase === 'night' ? '120,150,255' : '255,196,140';
        const lightA = S.phase === 'day' ? 0.5 : S.phase === 'night' ? 0.2 : 0.42;
        for (let x = 5.1; x + 1.2 <= W - 1.3; x += 1.7) {
          poly([P(x, 0), P(x + 1.2, 0), P(x + 2.2, 3.3), P(x + 1.0, 3.3)], lin(P(x + 0.6, 0), P(x + 1.6, 3.3), 'rgba(' + lightC + ',' + lightA + ')', 'rgba(' + lightC + ',0)'));
        }
        // rincones más oscuros
        const cc = P(W / 2 + 0.6, D / 2 + 0.6), R = (W + D) * 20;
        const vg = ctx.createRadialGradient(cc[0], cc[1], R * 0.35, cc[0], cc[1], R);
        vg.addColorStop(0, 'rgba(60,30,80,0)'); vg.addColorStop(1, 'rgba(60,30,80,.3)');
        ctx.fillStyle = vg; ctx.fillRect(cc[0] - R, cc[1] - R, R * 2, R * 2);
        poly([P(0, 0), P(W, 0), P(W, 0.5), P(0, 0.5)], lin(P(0, 0), P(0.5, 0.5), 'rgba(30,20,60,.28)', 'rgba(30,20,60,0)'));
        poly([P(0, 0), P(0.5, 0), P(0.5, D), P(0, D)], lin(P(0, 0), P(0.5, -0.5), 'rgba(30,20,60,.28)', 'rgba(30,20,60,0)'));
        ctx.restore();

        // paredes
        poly([P(0, 0, 0), P(0, D, 0), P(0, D, WALL), P(0, 0, WALL)], lin(P(0, 0, 1), P(0, D, 1), '#262d5c', '#3a4683'));
        poly([P(0, 0, 0), P(W, 0, 0), P(W, 0, WALL), P(0, 0, WALL)], lin(P(0, 0, 1), P(W, 0, 1), '#38458a', '#5568b8'));
        poly([P(0, 0, 0), P(0, D, 0), P(0, D, 0.5), P(0, 0, 0.5)], 'rgba(12,14,44,.26)');
        poly([P(0, 0, 0), P(W, 0, 0), P(W, 0, 0.5), P(0, 0, 0.5)], 'rgba(12,14,44,.22)');
        line(P(0, 0, 0.5), P(0, D, 0.5), 'rgba(255,255,255,.16)', 1); line(P(0, 0, 0.5), P(W, 0, 0.5), 'rgba(255,255,255,.2)', 1);
        poly([P(0, 0, 0), P(W, 0, 0), P(W, 0, 0.12), P(0, 0, 0.12)], '#232b55');
        poly([P(0, 0, 0), P(0, D, 0), P(0, D, 0.12), P(0, 0, 0.12)], '#1c2348');
        poly([P(0, 0, WALL), P(W, 0, WALL), P(W, -0.16, WALL), P(-0.16, -0.16, WALL), P(-0.16, D, WALL), P(0, D, WALL)], '#8195dc');
        poly([P(0, D, WALL), P(-0.16, D, WALL), P(-0.16, D, 0), P(0, D, 0)], '#1a2044');
        poly([P(W, 0, WALL), P(W, -0.16, WALL), P(W, -0.16, 0), P(W, 0, 0)], '#2b3570');
        line(P(0, 0, 0), P(0, 0, WALL), 'rgba(10,12,40,.35)', 2);

        // pizarra en la pared del fondo
        ctx.save();
        const wb = P(2.4, 0, 1.42);
        ctx.transform(1, 0.5, 0, 1, wb[0], wb[1]);
        ctx.fillStyle = '#c3cbe0'; rr(ctx, -1.5, -1.5, 70, 31.5, 2.5); ctx.fill();
        ctx.fillStyle = '#fbfcff'; ctx.fillRect(0, 0, 67, 27);
        ctx.fillStyle = '#9aa5c4'; ctx.fillRect(4, 28, 59, 2.4);
        ctx.lineWidth = 1.4; ctx.lineCap = 'round';
        [['#ff6b4a', 5, 6, 22], ['#4db8ff', 5, 11, 30], ['#2ee6a0', 5, 16, 17], ['#8b8cff', 5, 21, 25]].forEach(([c, x, y, len]) => { ctx.strokeStyle = c; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + len, y); ctx.stroke(); });
        ctx.strokeStyle = '#3a4683'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(40, 22); ctx.lineTo(40, 6); ctx.moveTo(40, 22); ctx.lineTo(62, 22); ctx.stroke();
        ctx.strokeStyle = '#ff6b4a'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(41, 20); ctx.lineTo(46, 16); ctx.lineTo(50, 18); ctx.lineTo(55, 11); ctx.lineTo(61, 8); ctx.stroke();
        [['#ffd35c', 31, 15], ['#ff8fd0', 36.5, 4]].forEach(([c, x, y]) => { ctx.fillStyle = c; ctx.fillRect(x, y, 5.5, 5.5); });
        ctx.restore();

        // ventanas con ciudad al fondo
        let wi = 0;
        for (let x = 5.1; x + 1.2 <= W - 1.3; x += 1.7, wi++) {
          const w0 = P(x, 0, 1.47);
          ctx.save();
          ctx.transform(1, 0.5, 0, 1, w0[0], w0[1]);
          const ww = 38.4, wh = 29.5;
          ctx.fillStyle = '#e8eefc'; rr(ctx, -2, -2, ww + 4, wh + 4, 2.5); ctx.fill();
          ctx.save();
          ctx.beginPath(); ctx.rect(0, 0, ww, wh); ctx.clip();
          const g = ctx.createLinearGradient(0, 0, 0, wh);
          g.addColorStop(0, S.top); g.addColorStop(1, S.bot);
          ctx.fillStyle = g; ctx.fillRect(0, 0, ww, wh);
          const hs = hash(room.name + wi);
          if (S.phase === 'night' || S.phase === 'late') {
            ctx.fillStyle = '#fff';
            for (let i = 0; i < 9; i++) { const sx = (hs >>> i) % 37, sy = ((hs >>> (i + 3)) % 15); ctx.globalAlpha = fade * (0.4 + 0.6 * Math.abs(Math.sin(t * 1.3 + i * 2.1))); ctx.fillRect(sx, sy, 1.1, 1.1); }
            GA(1);
            if (wi === 0) { ctx.fillStyle = '#fdf6d8'; ctx.beginPath(); ctx.arc(27, 8, 4.2, 0, 7); ctx.fill(); ctx.fillStyle = S.top; ctx.beginPath(); ctx.arc(25.2, 7, 3.6, 0, 7); ctx.fill(); }
          } else {
            if (wi === 0) {
              const sy = S.phase === 'day' ? 7 : 17;
              ctx.fillStyle = 'rgba(255,240,190,.4)'; ctx.beginPath(); ctx.arc(27, sy, 7.5, 0, 7); ctx.fill();
              ctx.fillStyle = '#fff6cf'; ctx.beginPath(); ctx.arc(27, sy, 4.4, 0, 7); ctx.fill();
            }
            ctx.fillStyle = 'rgba(255,255,255,.85)';
            const cx = ((t * 1.6 + hs % 60) % 62) - 12;
            ctx.beginPath(); ctx.ellipse(cx, 9 + (hs % 5), 6.5, 2.4, 0, 0, 7); ctx.ellipse(cx + 5, 7.6 + (hs % 5), 4.5, 2.6, 0, 0, 7); ctx.fill();
          }
          // edificios
          const lit = S.phase === 'night' || S.phase === 'late';
          for (let i = 0; i < 7; i++) {
            const bh = 6 + ((hs >>> (i * 3)) % 13), bx = i * 5.6;
            ctx.fillStyle = lit ? '#0d1338' : S.phase === 'day' ? '#8fb6dc' : '#7a4a6e';
            ctx.fillRect(bx, wh - bh, 5.2, bh);
            if (lit) {
              ctx.fillStyle = '#ffd98a';
              for (let k = 0; k < 4; k++) if ((hs >>> (i + k * 2)) & 1) ctx.fillRect(bx + 1 + (k % 2) * 2.2, wh - bh + 2 + Math.floor(k / 2) * 3.4, 1.1, 1.4);
            }
          }
          const rg = ctx.createLinearGradient(0, 0, ww, wh);
          rg.addColorStop(0.3, 'rgba(255,255,255,0)'); rg.addColorStop(0.42, 'rgba(255,255,255,.2)'); rg.addColorStop(0.5, 'rgba(255,255,255,0)');
          ctx.fillStyle = rg; ctx.fillRect(0, 0, ww, wh);
          ctx.restore();
          ctx.fillStyle = '#e8eefc'; ctx.fillRect(ww / 2 - 0.8, 0, 1.6, wh); ctx.fillRect(0, wh * 0.42, ww, 1.4);
          ctx.fillStyle = '#c9d2ea'; ctx.fillRect(-3, wh + 2, ww + 6, 2.6);
          ctx.restore();
          if (lit) glow(P(x + 0.6, 0, 1), 44, 'rgba(120,150,255,.16)');
        }

        // reloj de pared (hora real) y cuadro en la pared izquierda
        ctx.save();
        const ck = P(0, 0.78, 1.26);
        ctx.transform(1, -0.5, 0, 1, ck[0], ck[1]);
        ctx.fillStyle = '#12173a'; ctx.beginPath(); ctx.arc(0, 0, 9, 0, 7); ctx.fill();
        ctx.fillStyle = '#fbfcff'; ctx.beginPath(); ctx.arc(0, 0, 7.4, 0, 7); ctx.fill();
        const hA = (real.getHours() % 12 + real.getMinutes() / 60) / 12 * Math.PI * 2, mA = real.getMinutes() / 60 * Math.PI * 2, sA = real.getSeconds() / 60 * Math.PI * 2;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#12173a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.sin(hA) * 3.6, -Math.cos(hA) * 3.6); ctx.stroke();
        ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.sin(mA) * 5.6, -Math.cos(mA) * 5.6); ctx.stroke();
        ctx.strokeStyle = '#ff6b4a'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.sin(sA) * 6.2, -Math.cos(sA) * 6.2); ctx.stroke();
        ctx.restore();
        ctx.save();
        const pf = P(0, D - 0.45, 1.6);
        ctx.transform(1, -0.5, 0, 1, pf[0], pf[1]);
        ctx.fillStyle = '#12173a'; rr(ctx, -1.5, -1.5, 37, 20, 2); ctx.fill();
        const pg = ctx.createLinearGradient(0, 0, 0, 17);
        pg.addColorStop(0, ac(1, 72, 85)); pg.addColorStop(1, '#ffd9a8');
        ctx.fillStyle = pg; ctx.fillRect(0, 0, 34, 17);
        ctx.fillStyle = '#fff6cf'; ctx.beginPath(); ctx.arc(24, 8, 3.4, 0, 7); ctx.fill();
        ctx.fillStyle = ac(1, 34, 50); ctx.beginPath(); ctx.moveTo(0, 17); ctx.lineTo(9, 7); ctx.lineTo(16, 13); ctx.lineTo(22, 9); ctx.lineTo(34, 17); ctx.closePath(); ctx.fill();
        ctx.restore();

        // rótulo de neón con el nombre del proyecto
        ctx.save();
        const lp = P(0, D - 0.3, WALL + 0.72);
        ctx.transform(1, -0.5, 0, 1, lp[0], lp[1]);
        ctx.font = '700 15px ' + FONT;
        let label = room.name.length > 22 ? room.name.slice(0, 21) + '…' : room.name;
        const maxW = (D - 0.9) * 32 - 20;
        while (ctx.measureText(label).width > maxW && label.length > 4) label = label.slice(0, -2) + '…';
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = '#39447f'; ctx.fillRect(9, 8, 2.5, 16); ctx.fillRect(tw + 10, 8, 2.5, 16);
        ctx.fillStyle = '#0b0e24'; rr(ctx, 0, -16, tw + 22, 25, 7); ctx.fill();
        const flick = (hash(room.name) + Math.floor(t * 9)) % 83 === 0 ? 0.45 : 1;
        ctx.strokeStyle = ac(0.9 * flick, 68); ctx.lineWidth = 1.3; rr(ctx, 1.5, -14.5, tw + 19, 22, 5.5); ctx.stroke();
        ctx.shadowColor = ac(1, 60); ctx.shadowBlur = 9;
        ctx.globalAlpha = fade * flick;
        ctx.fillStyle = ac(1, 86, 100); ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillText(label, 11, -3);
        ctx.restore();
        GA(1);
        glow(P(0, D - 0.3 - (tw + 22) / 64, WALL + 0.72), 60, ac(0.2));

        // muebles y personas, ordenados por profundidad
        const items = [];
        const add = (depth, fn) => items.push({ depth, fn });

        add(0.4 + 2.6, () => { // estantería
          shadow(0.08, 1.5, 0.55, 2.2);
          box(0.08, 1.5, 0, 0.55, 2.2, 1.5, '#8b6444');
          const cols = ['#ff6b4a', '#4db8ff', '#ffd35c', '#2ee6a0', '#c792ff', '#ff8fd0', '#ffa24c', '#f3efe8'];
          for (let s = 0; s < 3; s++) {
            poly([P(0.63, 1.56, 0.1 + s * 0.46), P(0.63, 3.64, 0.1 + s * 0.46), P(0.63, 3.64, 0.5 + s * 0.46), P(0.63, 1.56, 0.5 + s * 0.46)], '#4f3623');
            for (let b = 0; b < 9; b++) {
              const y = 1.6 + b * 0.22, z = 0.12 + s * 0.46, hh = 0.28 + ((b * 7 + s) % 3) * 0.045;
              if ((b + s * 2) % 7 === 6) continue;
              poly([P(0.63, y, z), P(0.63, y + 0.17, z), P(0.63, y + 0.17, z + hh), P(0.63, y, z + hh)], cols[(b + s * 3) % cols.length]);
              line(P(0.63, y + 0.04, z + hh * 0.7), P(0.63, y + 0.13, z + hh * 0.7), 'rgba(255,255,255,.5)', 0.8);
            }
          }
          const pt = P(0.35, 1.95, 1.5);
          ctx.fillStyle = '#f3efe8'; rr(ctx, pt[0] - 4, pt[1] - 6, 8, 6.5, 1.6); ctx.fill();
          [['#2f9e6b', -4, -11], ['#3ddc97', 4, -12], ['#27835a', 0, -15]].forEach(([c, lx, ly]) => { ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(pt[0] + lx, pt[1] + ly, 3, 5, lx * 0.1, 0, 7); ctx.fill(); });
        });

        add(W - 0.7 + 0.65, () => { // armario de servidores
          shadow(W - 1.15, 0.22, 0.9, 0.85, 0.2);
          box(W - 1.15, 0.22, 0, 0.9, 0.85, 1.5, '#2c3558');
          poly([P(W - 1.1, 1.07, 0.1), P(W - 0.3, 1.07, 0.1), P(W - 0.3, 1.07, 1.44), P(W - 1.1, 1.07, 1.44)], '#0f1430');
          let lit = 0;
          for (let i = 0; i < 6; i++) {
            const z = 0.18 + i * 0.2;
            poly([P(W - 1.05, 1.072, z), P(W - 0.35, 1.072, z), P(W - 0.35, 1.072, z + 0.14), P(W - 1.05, 1.072, z + 0.14)], '#1d2548');
            for (let k = 0; k < 5; k++) {
              const on = Math.sin(t * (2.5 + ((i * 3 + k) % 5)) + i * 2 + k + hash(room.name) % 7) > -0.2;
              const l = P(W - 0.98 + k * 0.1, 1.074, z + 0.07);
              ctx.fillStyle = on ? (k === 4 ? '#ffbe0b' : k === 3 ? '#4db8ff' : '#2ee6a0') : '#18304a';
              ctx.fillRect(l[0] - 0.9, l[1] - 0.9, 1.9, 1.9);
              if (on) lit++;
            }
          }
          glow(P(W - 0.7, 1.08, 0.8), 46, 'rgba(46,230,160,' + (0.1 + lit / 300) + ')');
        });

        add(0.6 + D - 1.3, () => { // rincón del café
          shadow(0.2, D - 1.75, 0.75, 0.9);
          box(0.2, D - 1.75, 0, 0.75, 0.9, 0.55, '#d9c4a0');
          poly([P(0.95, D - 1.7, 0.08), P(0.95, D - 0.9, 0.08), P(0.95, D - 0.9, 0.48), P(0.95, D - 1.7, 0.48)], null, 'rgba(90,60,30,.3)');
          box(0.3, D - 1.58, 0.55, 0.46, 0.46, 0.52, '#e04e38');
          poly([P(0.76, D - 1.5, 0.66), P(0.76, D - 1.2, 0.66), P(0.76, D - 1.2, 0.92), P(0.76, D - 1.5, 0.92)], '#1a1f3a');
          const led = P(0.765, D - 1.35, 0.99);
          ctx.fillStyle = Math.sin(t * 2) > 0 ? '#2ee6a0' : '#ffbe0b'; ctx.fillRect(led[0] - 1, led[1] - 1, 2, 2);
          const c = P(0.72, D - 1.0, 0.55);
          ctx.fillStyle = '#fff'; rr(ctx, c[0] - 2.7, c[1] - 5.4, 5.4, 5.6, 1.2); ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1; ctx.lineCap = 'round';
          for (let k = 0; k < 2; k++) { ctx.beginPath(); ctx.moveTo(c[0] - 1 + k * 2, c[1] - 6.5); ctx.quadraticCurveTo(c[0] - 1 + k * 2 + Math.sin(t * 2.4 + k * 2) * 3, c[1] - 11, c[0] - 1 + k * 2, c[1] - 16); ctx.stroke(); }
        });
        add(0.42 + D - 0.34, () => { // lámpara de pie
          const b = P(0.42, D - 0.34, 0), tp = P(0.42, D - 0.34, 1.5);
          ctx.fillStyle = 'rgba(40,24,60,.2)'; ctx.beginPath(); ctx.ellipse(b[0], b[1], 7, 3.2, 0, 0, 7); ctx.fill();
          ctx.fillStyle = '#20264a'; ctx.beginPath(); ctx.ellipse(b[0], b[1] - 1, 5, 2.3, 0, 0, 7); ctx.fill();
          line(b, tp, '#20264a', 1.8);
          ctx.fillStyle = dark > 0.1 ? '#ffe2a8' : '#f3e6cc';
          ctx.beginPath(); ctx.moveTo(tp[0] - 5, tp[1] - 9); ctx.lineTo(tp[0] + 5, tp[1] - 9); ctx.lineTo(tp[0] + 8.5, tp[1] + 3); ctx.lineTo(tp[0] - 8.5, tp[1] + 3); ctx.closePath(); ctx.fill();
          if (dark > 0.1) { glow([tp[0], tp[1] + 2], 90, 'rgba(255,206,130,' + (0.2 + dark * 0.5) + ')'); glow([b[0] + 14, b[1]], 70, 'rgba(255,206,130,' + (dark * 0.35) + ')'); }
        });

        add(W - 0.6 + D - 0.6, () => { // planta
          shadow(W - 0.85, D - 0.85, 0.5, 0.5);
          box(W - 0.85, D - 0.85, 0, 0.5, 0.5, 0.4, '#e8e3da');
          const p = P(W - 0.6, D - 0.6, 0.4);
          const sway = Math.sin(t * 1.3 + room.ox) * 1.6;
          [['#1f7a52', -11, -15, 10, -0.6], ['#2ea36f', 10, -18, 10, 0.6], ['#27835a', -5, -27, 11, -0.2], ['#3ddc97', 5, -30, 10, 0.25], ['#48c98c', -2, -11, 8, 0], ['#2ea36f', 12, -8, 7, 1]].forEach(([c, lx, ly, r, rot]) => {
            const x = p[0] + lx + sway * (-ly / 28), y = p[1] + ly;
            ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(x, y, r * 0.55, r, rot, 0, 7); ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = 0.8;
            ctx.beginPath(); ctx.moveTo(x + Math.sin(rot) * r * 0.7, y - Math.cos(rot) * r * 0.7); ctx.lineTo(x - Math.sin(rot) * r * 0.7, y + Math.cos(rot) * r * 0.7); ctx.stroke();
          });
        });

        // robot aspirador que patrulla el pasillo de delante
        const span = Math.max(0.5, W - 4.2);
        const rbp = (t * 0.55 + st.rb) % (span * 2);
        const rbx = 2.5 + (rbp < span ? rbp : span * 2 - rbp), rby = D - 0.36;
        add(rbx + rby, () => {
          const p = P(rbx, rby, 0);
          ctx.fillStyle = 'rgba(40,24,60,.22)'; ctx.beginPath(); ctx.ellipse(p[0], p[1] + 1, 9, 4.4, 0, 0, 7); ctx.fill();
          ctx.fillStyle = '#12173a'; ctx.beginPath(); ctx.ellipse(p[0], p[1] - 1.5, 8, 4, 0, 0, 7); ctx.fill();
          ctx.fillStyle = '#2b3566'; ctx.beginPath(); ctx.ellipse(p[0], p[1] - 3.4, 8, 4, 0, 0, 7); ctx.fill();
          ctx.fillStyle = '#3d4a8a'; ctx.beginPath(); ctx.ellipse(p[0], p[1] - 3.6, 4, 2, 0, 0, 7); ctx.fill();
          ctx.fillStyle = Math.sin(t * 6) > 0 ? '#2ee6a0' : '#168a5e'; ctx.beginPath(); ctx.arc(p[0] + (rbp < span ? 5 : -5), p[1] - 3.2, 1.1, 0, 7); ctx.fill();
        });

        // el gato de la oficina (solo en la primera sala)
        if (room.name === this.order[0] || room.empty) {
          const cx = W - 1.75, cy = D - 1.2;
          add(cx + cy, () => {
            const p = P(cx, cy, 0);
            const hs = hash(room.name);
            const fur = ['#f0a04a', '#5a5f78', '#2a2a36', '#e9dfd0'][hs % 4], furD = shade(fur, 0.78);
            const awake = (t + hs % 50) % 46 > 38;
            ctx.fillStyle = 'rgba(40,24,60,.2)'; ctx.beginPath(); ctx.ellipse(p[0], p[1] + 1, 11, 4.4, 0, 0, 7); ctx.fill();
            ctx.strokeStyle = fur; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(p[0] + 8, p[1] - 2); ctx.quadraticCurveTo(p[0] + 15, p[1] - 3 + Math.sin(t * 2.2) * 2, p[0] + 13, p[1] - 9 - Math.sin(t * 2.2) * 2); ctx.stroke();
            if (awake) {
              ctx.fillStyle = fur; ctx.beginPath(); ctx.ellipse(p[0] + 1, p[1] - 6, 6.5, 7, 0, 0, 7); ctx.fill();
              ctx.beginPath(); ctx.arc(p[0] - 2, p[1] - 14, 5, 0, 7); ctx.fill();
              ctx.fillStyle = furD; ctx.beginPath(); ctx.moveTo(p[0] - 6.5, p[1] - 16); ctx.lineTo(p[0] - 5.5, p[1] - 21); ctx.lineTo(p[0] - 2.5, p[1] - 18); ctx.closePath(); ctx.fill();
              ctx.beginPath(); ctx.moveTo(p[0] + 2.5, p[1] - 16); ctx.lineTo(p[0] + 1.5, p[1] - 21); ctx.lineTo(p[0] - 1.5, p[1] - 18); ctx.closePath(); ctx.fill();
              ctx.fillStyle = '#b7f36a'; ctx.fillRect(p[0] - 4.6, p[1] - 15, 1.6, 1.8); ctx.fillRect(p[0] - 1, p[1] - 15, 1.6, 1.8);
            } else {
              ctx.fillStyle = fur; ctx.beginPath(); ctx.ellipse(p[0], p[1] - 3.6 - Math.sin(t * 1.6) * 0.4, 9.5, 5 + Math.sin(t * 1.6) * 0.4, 0, 0, 7); ctx.fill();
              ctx.beginPath(); ctx.arc(p[0] - 7, p[1] - 3.6, 4.4, 0, 7); ctx.fill();
              ctx.fillStyle = furD; ctx.beginPath(); ctx.moveTo(p[0] - 10.5, p[1] - 6); ctx.lineTo(p[0] - 10, p[1] - 10.5); ctx.lineTo(p[0] - 7.2, p[1] - 7.6); ctx.closePath(); ctx.fill();
              ctx.beginPath(); ctx.moveTo(p[0] - 6.4, p[1] - 7.6); ctx.lineTo(p[0] - 4.6, p[1] - 10.5); ctx.lineTo(p[0] - 3.4, p[1] - 6.4); ctx.closePath(); ctx.fill();
              ctx.strokeStyle = 'rgba(20,20,40,.7)'; ctx.lineWidth = 0.8;
              ctx.beginPath(); ctx.moveTo(p[0] - 9.4, p[1] - 3.4); ctx.lineTo(p[0] - 7.8, p[1] - 3); ctx.moveTo(p[0] - 6.2, p[1] - 3); ctx.lineTo(p[0] - 4.6, p[1] - 3.4); ctx.stroke();
              ctx.font = '700 7px ' + FONT; ctx.fillStyle = 'rgba(255,255,255,.75)';
              const zz = (t * 0.5) % 1;
              ctx.globalAlpha = fade * (1 - zz); ctx.fillText('z', p[0] - 3 + zz * 5, p[1] - 12 - zz * 10); GA(1);
            }
          });
        }

        for (const desk of room.desks.values()) {
          const a = desk.a;
          const v = this.vis.get(a.id);
          const atDesk = v && v.target && v.target.sit && !v.walk;
          const dx0 = desk.x, dy0 = desk.y;
          add(dx0 + 0.75 + dy0 + 0.4, () => {
            shadow(dx0, dy0, 1.5, 0.82, 0.2);
            box(dx0, dy0, 0, 1.5, 0.82, 0.42, '#c9945a');
            poly([P(dx0 - 0.04, dy0 - 0.04, 0.42), P(dx0 + 1.54, dy0 - 0.04, 0.42), P(dx0 + 1.54, dy0 + 0.86, 0.42), P(dx0 - 0.04, dy0 + 0.86, 0.42)], lin(P(dx0, dy0, 0.42), P(dx0 + 1.5, dy0 + 0.82, 0.42), '#f0c88f', '#deb078'));
            poly([P(dx0 - 0.04, dy0 + 0.86, 0.42), P(dx0 + 1.54, dy0 + 0.86, 0.42), P(dx0 + 1.54, dy0 + 0.86, 0.37), P(dx0 - 0.04, dy0 + 0.86, 0.37)], '#b98248');
            // cajones
            poly([P(dx0 + 0.08, dy0 + 0.82, 0.06), P(dx0 + 0.52, dy0 + 0.82, 0.06), P(dx0 + 0.52, dy0 + 0.82, 0.33), P(dx0 + 0.08, dy0 + 0.82, 0.33)], null, 'rgba(70,40,15,.4)');
            line(P(dx0 + 0.08, dy0 + 0.82, 0.2), P(dx0 + 0.52, dy0 + 0.82, 0.2), 'rgba(70,40,15,.4)');
            line(P(dx0 + 0.25, dy0 + 0.82, 0.27), P(dx0 + 0.35, dy0 + 0.82, 0.27), '#f3e6cc', 1.4); line(P(dx0 + 0.25, dy0 + 0.82, 0.13), P(dx0 + 0.35, dy0 + 0.82, 0.13), '#f3e6cc', 1.4);

            const waiting = a.state === 'waiting';
            const active = atDesk && (a.state === 'working' || a.state === 'thinking');
            const col = waiting ? COLORS.ask : (COLORS[a.activity] || COLORS.idle);
            const typing = active && (a.activity === 'edit' || a.activity === 'talk');
            // teclado
            poly([P(dx0 + 0.5, dy0 + 0.1, 0.425), P(dx0 + 1.0, dy0 + 0.1, 0.425), P(dx0 + 1.0, dy0 + 0.3, 0.425), P(dx0 + 0.5, dy0 + 0.3, 0.425)], '#1c2242');
            if (typing) for (let k = 0; k < 3; k++) { const kk = P(dx0 + 0.56 + ((Math.floor(t * 14) * 7 + k * 5) % 9) * 0.045, dy0 + 0.14 + ((Math.floor(t * 14) + k) % 3) * 0.05, 0.425); ctx.fillStyle = hexA(col, 0.9); ctx.fillRect(kk[0] - 1, kk[1] - 0.6, 2.2, 1.2); }
            // taza y papeles
            const mug = P(dx0 + 1.3, dy0 + 0.36, 0.42);
            ctx.fillStyle = '#fff'; rr(ctx, mug[0] - 2.6, mug[1] - 5.2, 5.2, 5.6, 1.2); ctx.fill();
            ctx.fillStyle = col; ctx.fillRect(mug[0] - 2.6, mug[1] - 3.2, 5.2, 1.4);
            poly([P(dx0 + 0.1, dy0 + 0.2, 0.425), P(dx0 + 0.36, dy0 + 0.2, 0.425), P(dx0 + 0.36, dy0 + 0.5, 0.425), P(dx0 + 0.1, dy0 + 0.5, 0.425)], '#fffdf7');
            line(P(dx0 + 0.14, dy0 + 0.28, 0.425), P(dx0 + 0.32, dy0 + 0.28, 0.425), 'rgba(40,60,110,.3)', 0.8); line(P(dx0 + 0.14, dy0 + 0.36, 0.425), P(dx0 + 0.28, dy0 + 0.36, 0.425), 'rgba(40,60,110,.3)', 0.8);
            // flexo
            const lb = P(dx0 + 0.16, dy0 + 0.68, 0.42), lt = P(dx0 + 0.16, dy0 + 0.68, 0.74), lh = P(dx0 + 0.34, dy0 + 0.6, 0.8);
            ctx.fillStyle = '#20264a'; ctx.beginPath(); ctx.ellipse(lb[0], lb[1], 3.4, 1.6, 0, 0, 7); ctx.fill();
            line(lb, lt, '#20264a', 1.4); line(lt, lh, '#20264a', 1.4);
            ctx.fillStyle = dark > 0.1 ? '#ffe2a8' : '#ff6b4a'; ctx.beginPath(); ctx.ellipse(lh[0], lh[1], 4, 2.4, 0.4, 0, 7); ctx.fill();
            if (dark > 0.1) glow(P(dx0 + 0.6, dy0 + 0.45, 0.45), 40, 'rgba(255,206,130,' + (dark * 0.5) + ')');

            // pantalla holográfica
            const hx0 = dx0 + 0.36, hx1 = dx0 + 1.14, hy = dy0 + 0.54;
            box(dx0 + 0.6, dy0 + 0.49, 0.42, 0.3, 0.1, 0.035, '#1c2242');
            const on = active || waiting;
            const blinkA = waiting ? 0.55 + 0.45 * Math.sin(t * 6) : 1;
            const pane = [P(hx0, hy, 0.5), P(hx1, hy, 0.5), P(hx1, hy, 1.02), P(hx0, hy, 1.02)];
            poly(pane, lin(P(hx0, hy, 1.02), P(hx0, hy, 0.5), on ? hexA(col, 0.34 * blinkA) : 'rgba(150,165,220,.2)', on ? hexA(col, 0.1) : 'rgba(150,165,220,.06)'), on ? hexA(col, 0.95 * blinkA) : 'rgba(160,175,230,.5)', 1.1);
            const scroll = on && !waiting ? Math.floor(t * 4) : 0;
            const hs = hash(a.id);
            for (let i = 0; i < 5; i++) {
              const z = 0.94 - i * 0.09;
              const r = (hs + (i + scroll) * 2654435761) >>> 0;
              const ind = ((r >>> 3) % 3) * 0.08, len = 0.16 + ((r >>> 7) % 5) * 0.08;
              line(P(hx0 + 0.07 + ind, hy, z), P(Math.min(hx1 - 0.06, hx0 + 0.07 + ind + len), hy, z), on ? (i === 2 ? 'rgba(255,255,255,.9)' : hexA(col, 0.95 * blinkA)) : 'rgba(170,185,235,.4)', 1.5);
            }
            if (on) {
              glow(P(dx0 + 0.75, hy, 0.76), night ? 58 : 42, hexA(col, night ? 0.4 : 0.2));
              if (active && t > (v.glyphAt || 0)) {
                v.glyphAt = t + 0.22 + Math.random() * 0.3;
                const sp = P(hx0 + 0.1 + Math.random() * 0.6, hy, 1.04);
                this.spawn({ kind: 'glyph', x: sp[0], y: sp[1], vx: (Math.random() - 0.5) * 6, vy: -14 - Math.random() * 10, life: 1.7, fade: 1.2, c: col, ch: GLYPHS[(Math.random() * GLYPHS.length) | 0] });
              }
            }
          });
        }

        for (const a of room.list) {
          const v = this.vis.get(a.id);
          if (!v) continue;
          add(v.x + v.y, () => {
            const p = P(v.x, v.y, 0);
            const L = v.L;
            const sit = v.target && v.target.sit && !v.walk;
            if (v.poof) {
              v.poof = false;
              for (let i = 0; i < 14; i++) { const an = i / 14 * Math.PI * 2; this.spawn({ kind: 'spark', x: p[0], y: p[1] - 20, vx: Math.cos(an) * 46, vy: Math.sin(an) * 30 - 10, life: 0.7, fade: 0.7, c: i % 2 ? '#fff' : '#ffd35c', s: 2.4 }); }
            }
            if (a.state === 'waiting') { // ondas en el suelo
              for (let k = 0; k < 2; k++) {
                const u = (t * 0.8 + k * 0.5) % 1;
                ctx.strokeStyle = hexA(COLORS.ask, (1 - u) * 0.9); ctx.lineWidth = 2;
                ctx.beginPath(); ctx.ellipse(p[0], p[1], (12 + u * 24) * L.k, (5 + u * 10) * L.k, 0, 0, 7); ctx.stroke();
              }
              glow([p[0], p[1] - 16], 70, hexA(COLORS.ask, 0.26 + 0.1 * Math.sin(t * 6)));
            }
            const sel = this.selected === a.id;
            if (sel || this.hover === a.id) {
              ctx.save();
              ctx.strokeStyle = sel ? '#ffbe0b' : 'rgba(255,255,255,.9)';
              ctx.lineWidth = 2; ctx.setLineDash(sel ? [6, 5] : []); ctx.lineDashOffset = -t * 14;
              ctx.beginPath(); ctx.ellipse(p[0], p[1], 16 * L.k, 7 * L.k, 0, 0, 7); ctx.stroke();
              ctx.restore();
              if (sel) glow([p[0], p[1] - 10], 60, 'rgba(255,190,11,.2)');
            }
            ctx.save();
            ctx.translate(p[0], p[1]); ctx.scale(L.k, L.k);
            ctx.globalAlpha = fade * v.alpha;
            drawWorker(ctx, Object.assign({ t, sit, pose: v.target ? v.target.pose : 'rest', walk: v.walk, face: v.face, sub: a.kind === 'sub', glow: COLORS[a.activity] }, L));
            ctx.restore();
            const headY = p[1] - (sit ? 41 : 49) * L.k;
            heads.set(a.id, [p[0], headY]);
            over.push({ a, v, L, foot: toScreen(p), head: toScreen([p[0], headY]) });
          });
        }

        items.sort((x, y) => x.depth - y.depth);
        for (const it of items) it.fn();
        ctx.globalAlpha = 1;
      }

      // hilos entre un agente y sus becarios, con paquetes que viajan
      for (const a of this.agents) {
        if (a.kind !== 'sub') continue;
        const h0 = heads.get(a.parentId), h1 = heads.get(a.id);
        if (!h0 || !h1) continue;
        const ax = h0[0], ay = h0[1] + 14, bx = h1[0], by = h1[1] + 12, mx = (ax + bx) / 2, my = Math.min(h0[1], h1[1]) - 12;
        ctx.setLineDash([3, 4]); ctx.lineWidth = 1.3; ctx.strokeStyle = 'rgba(255,143,208,.7)';
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(mx, my, bx, by); ctx.stroke();
        ctx.setLineDash([]);
        if (a.state === 'working' || a.state === 'thinking') {
          const u = (t * 0.7 + (hash(a.id) % 10) / 10) % 1, w = 1 - u;
          const px = w * w * ax + 2 * w * u * mx + u * u * bx, py = w * w * ay + 2 * w * u * my + u * u * by;
          ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px, py, 2, 0, 7); ctx.fill();
          glow([px, py], 12, 'rgba(255,143,208,.7)');
        }
      }

      // noche: se oscurece todo y luego se encienden las luces
      if (dark > 0) {
        ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = 'rgba(8,10,46,' + dark + ')';
        ctx.fillRect(0, 0, this.cv.width, this.cv.height);
        ctx.restore();
      }
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (const g of glows) {
        const gr = ctx.createRadialGradient(g.x, g.y, 1, g.x, g.y, g.r);
        gr.addColorStop(0, g.c); gr.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(g.x, g.y, g.r, 0, 7); ctx.fill();
      }
      ctx.restore();

      // confeti para quien acaba de terminar
      for (const id of this.bursts) {
        const h = heads.get(id);
        if (!h) continue;
        for (let i = 0; i < 46; i++) {
          const an = -Math.PI / 2 + (Math.random() - 0.5) * 2.2, sp = 60 + Math.random() * 110;
          this.spawn({ kind: 'conf', x: h[0], y: h[1], vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, g: 190, life: 1.6 + Math.random() * 0.8, fade: 0.6, c: CONFETTI[i % CONFETTI.length], s: 3 + Math.random() * 3, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14 });
        }
      }
      this.bursts.length = 0;

      // partículas
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      let n = 0;
      for (const p of this.fx) {
        p.life -= dt;
        if (p.life <= 0) continue;
        p.vy += (p.g || 0) * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        this.fx[n++] = p;
        const al = Math.min(1, p.life / p.fade);
        ctx.globalAlpha = al;
        ctx.fillStyle = p.c;
        if (p.kind === 'glyph') { ctx.font = '700 9px ' + MONO; ctx.fillText(p.ch, p.x, p.y); }
        else if (p.kind === 'conf') { p.rot += p.vr * dt; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore(); }
        else { ctx.beginPath(); ctx.arc(p.x, p.y, p.s * al, 0, 7); ctx.fill(); }
      }
      this.fx.length = n;
      ctx.globalAlpha = 1;

      // rayos entre agentes que tocan el mismo archivo
      const clash = new Set();
      for (const c of this.conflicts) {
        const pts = c.agents.map((id) => heads.get(id)).filter(Boolean);
        c.agents.forEach((id) => clash.add(id));
        for (let i = 1; i < pts.length; i++) {
          const a = pts[0], b = pts[i];
          const path = () => {
            ctx.beginPath(); ctx.moveTo(a[0], a[1]);
            for (let s = 1; s < 9; s++) {
              const k = s / 9;
              const j = Math.sin(Math.floor(t * 18) * 3.7 + s * 5.1) * 8;
              ctx.lineTo(a[0] + (b[0] - a[0]) * k - j * 0.4, a[1] + (b[1] - a[1]) * k + j);
            }
            ctx.lineTo(b[0], b[1]);
          };
          ctx.lineJoin = 'round';
          ctx.strokeStyle = 'rgba(255,77,109,.3)'; ctx.lineWidth = 7; path(); ctx.stroke();
          ctx.strokeStyle = '#ff4d6d'; ctx.lineWidth = 2.4; path(); ctx.stroke();
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.9; path(); ctx.stroke();
        }
      }

      // capa superior en píxeles de pantalla: bocadillos y nombres
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const z = cam.z;
      over.sort((p, q) => p.foot[1] - q.foot[1]);
      for (const o of over) {
        const { a, L } = o;
        const sub = a.kind === 'sub';
        const focus = this.hover === a.id || this.selected === a.id;
        const hw = 15 * z * L.k, hh = 54 * z * L.k;
        this.hits.push({ id: a.id, x: o.foot[0] - hw, y: o.foot[1] - hh, w: hw * 2, h: hh + 6 });
        ctx.globalAlpha = o.v.alpha;

        const waiting = a.state === 'waiting';
        const busy = a.state === 'working' || a.state === 'thinking';
        const stCol = waiting ? COLORS.ask : (a.state === 'idle' || a.state === 'done') ? COLORS.idle : (COLORS[a.activity] || '#fff');
        if (!sub || focus) {
          ctx.font = '600 ' + (z < 0.7 ? 10.5 : 12) + 'px ' + FONT;
          const txt = L.nick;
          const w = ctx.measureText(txt).width + 23;
          const x = o.foot[0] - w / 2, y = o.foot[1] + 6 * z;
          ctx.fillStyle = 'rgba(8,10,28,.86)'; rr(ctx, x, y, w, 18, 4); ctx.fill();
          ctx.fillStyle = stCol;
          ctx.beginPath(); ctx.arc(x + 9, y + 9, 3.2 + (busy ? Math.sin(t * 5 + L.seed) * 0.7 : 0), 0, 7); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
          ctx.fillText(txt, x + 16, y + 9.5);
        }

        if (!waiting && !busy && !clash.has(a.id) && !focus) continue;
        const act = waiting ? 'ask' : busy ? a.activity : 'idle';
        const hot = clash.has(a.id) && !waiting;
        const icon = hot ? '⚡' : (ICONS[act] || '•');
        const icCol = hot ? '#ff4d6d' : (COLORS[act] || COLORS.idle);
        let text = '';
        if ((!sub || focus) && (z > 0.62 || focus || waiting)) {
          text = waiting ? (a.detail || 'Te necesita') : a.detail || '';
          const max = focus ? 60 : 30;
          if (text.length > max) text = text.slice(0, max - 1) + '…';
        }
        ctx.font = '500 11px ' + MONO;
        const tw = text ? ctx.measureText(text).width : 0;
        const bw = 26 + (text ? tw + 11 : 0), bh = 24;
        const pulse = waiting ? 1 + Math.sin(t * 6) * 0.06 : 1;
        const bx = o.head[0], byy = o.head[1] - 12 * z - (waiting ? Math.abs(Math.sin(t * 3)) * 5 : 0);
        ctx.save();
        ctx.translate(bx, byy); ctx.scale(pulse, pulse);
        ctx.shadowColor = waiting ? 'rgba(255,190,11,.65)' : 'rgba(4,4,20,.5)'; ctx.shadowBlur = waiting ? 18 : 10; ctx.shadowOffsetY = waiting ? 0 : 3;
        ctx.fillStyle = waiting ? '#ffbe0b' : hot ? '#ffe3e8' : '#fffdf8';
        rr(ctx, -bw / 2, -bh, bw, bh, 6); ctx.fill();
        ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
        ctx.beginPath(); ctx.moveTo(-5, -1); ctx.lineTo(0, 6); ctx.lineTo(5, -1); ctx.closePath(); ctx.fill();
        ctx.fillStyle = waiting ? 'rgba(255,255,255,.45)' : hexA(icCol, 0.28);
        ctx.beginPath(); ctx.arc(-bw / 2 + 12, -bh / 2, 9, 0, 7); ctx.fill();
        ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
        ctx.font = '11.5px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
        ctx.fillStyle = '#1a1f33';
        ctx.fillText(icon, -bw / 2 + 12, -bh / 2 + 1);
        if (text) {
          ctx.textAlign = 'left';
          ctx.font = (waiting ? '600' : '500') + ' 11px ' + MONO;
          ctx.fillStyle = waiting ? '#2a1d00' : '#1a1f33';
          ctx.fillText(text, -bw / 2 + 25, -bh / 2 + 0.5);
        }
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }
  }

  window.OV = { Office, COLORS, ICONS, LABELS, look, portrait, hash, accent, FONT, MONO };
})();
