'use strict';
// Modo demo: agentes inventados para ver la oficina en marcha sin tener agentes reales trabajando.
const { newAgent, pushEvent, addRecent, touchFile } = require('./util');

const SCRIPT = [
  ['think', 'thinking', 'Pensando', 3],
  ['read', 'working', 'Leyendo {f}', 3],
  ['search', 'working', 'Buscando «{w}»', 2],
  ['edit', 'working', 'Editando {f}', 5],
  ['run', 'working', 'Ejecutando: npm test', 6],
  ['think', 'thinking', 'Pensando el siguiente paso', 2],
  ['web', 'working', 'Consultando developer.mozilla.org', 3],
  ['edit', 'working', 'Editando {f}', 4],
  ['plan', 'working', 'Organizando el plan de trabajo', 2],
  ['talk', 'working', 'Redactando su respuesta', 3],
];
const FILES = ['carrito.js', 'api/pedidos.php', 'estilos.css', 'Login.tsx', 'README.md', 'db/esquema.sql', 'rutas.js'];
const WORDS = ['calcularTotal', 'TODO', 'useEffect', 'session_start', 'fetchPedidos'];

const CAST = [
  { id: 'demo:1', source: 'claude', title: 'Rediseño del carrito', project: 'tienda-online', model: 'claude-opus', role: 'Terminal' },
  { id: 'demo:2', source: 'claude', title: 'Arreglar login', project: 'tienda-online', model: 'claude-sonnet', role: 'VS Code', waits: true },
  { id: 'demo:3', source: 'claude', title: 'Migración de base de datos', project: 'panel-admin', model: 'claude-sonnet', role: 'App de escritorio', subs: 2 },
  { id: 'demo:4', source: 'codex', title: 'Tests de la API', project: 'panel-admin', model: 'gpt-codex', role: 'Codex CLI' },
  { id: 'demo:5', source: 'claude', title: 'Landing de verano', project: 'portfolio', model: 'claude-haiku', role: 'Terminal', lazy: true },
  { id: 'demo:6', source: 'ollama', title: 'llama3.2:3b', project: 'Modelos locales', model: 'llama3.2:3b', role: 'Ollama · 3B' },
];

class DemoSource {
  constructor() {
    this.on = false;
    this.list = [];
  }

  enable(on) {
    this.on = on;
    this.list = [];
    if (!on) return;
    const now = Date.now();
    for (const c of CAST) {
      const ag = this.make(c, now - 40 * 60e3);
      this.list.push({ ag, c, step: Math.floor(Math.random() * SCRIPT.length), until: 0, phase: 'work', loops: 0 });
      for (let i = 0; i < (c.subs || 0); i++) {
        const s = this.make({ id: c.id + ':sub' + i, source: 'claude', title: i ? 'Revisar migraciones' : 'Explorar el esquema', project: c.project, model: 'claude-haiku', role: i ? 'general-purpose' : 'Explore' }, now - 60e3);
        s.kind = 'sub';
        s.parentId = c.id;
        this.list.push({ ag: s, c: {}, step: i * 3, until: 0, phase: 'work', loops: 0 });
      }
    }
    // Un pasado inventado para que la línea de tiempo tenga algo que enseñar.
    for (const it of this.list) {
      let t = now - 38 * 60e3;
      while (t < now - 5e3) {
        const s = SCRIPT[it.step++ % SCRIPT.length];
        pushEvent(it.ag, t, s[0], s[1], this.fill(s[2], it.step));
        t += s[3] * 1000 * (4 + Math.random() * 10);
      }
    }
  }

  make(c, started) {
    const ag = newAgent(c.id, c.source);
    Object.assign(ag, { title: c.title, project: c.project, model: c.model, role: c.role, cwd: 'C:\\proyectos\\' + c.project });
    ag.startedAt = started;
    ag.live = true;
    ag.lastPrompt = 'Encargo de ejemplo: ' + c.title.toLowerCase() + ' y deja los tests en verde.';
    return ag;
  }

  fill(s, n) {
    return s.replace('{f}', FILES[n % FILES.length]).replace('{w}', WORDS[n % WORDS.length]);
  }

  poll(now) {
    if (!this.on) return;
    for (const it of this.list) {
      const ag = it.ag;
      if (now < it.until) continue;
      if (it.phase === 'wait' || it.phase === 'rest') { it.phase = 'work'; it.loops = 0; }
      it.loops++;
      if (it.c.waits && it.loops % 9 === 0) {
        it.phase = 'wait';
        it.until = now + 14e3;
        ag.state = 'waiting';
        pushEvent(ag, now, 'ask', 'waiting', 'Espera tu permiso: Ejecutando: git push');
        addRecent(ag, now, 'wait', 'Espera tu permiso');
        continue;
      }
      if (it.loops % (it.c.lazy ? 5 : 14) === 0) {
        it.phase = 'rest';
        it.until = now + (it.c.lazy ? 30e3 : 9e3);
        ag.state = 'idle';
        ag.lastText = 'Listo. He terminado lo que me pediste y los tests pasan.';
        pushEvent(ag, now, 'idle', 'idle', 'Ha terminado su turno');
        addRecent(ag, now, 'say', ag.lastText);
        continue;
      }
      const s = SCRIPT[it.step++ % SCRIPT.length];
      const detail = this.fill(s[2], it.step);
      ag.state = s[1];
      ag.lastActiveAt = now;
      ag.tools++; ag.toolsToday++;
      ag.tokens.in += 900; ag.tokens.out += 350; ag.tokens.cacheRead += 22000; ag.tokensToday += 1250;
      // Dos agentes del mismo proyecto tocan el mismo archivo: así se ve un choque.
      if (s[0] === 'edit') {
        const shared = ag.project === 'tienda-online' && it.step % 3 === 0;
        touchFile(ag, now, 'C:/proyectos/' + ag.project + '/' + (shared ? 'carrito.js' : ag.id.replace(/\W/g, '') + '/' + FILES[it.step % FILES.length]));
      }
      pushEvent(ag, now, s[0], s[1], detail);
      addRecent(ag, now, 'tool', detail);
      it.until = now + s[3] * 1000 * (0.7 + Math.random() * 0.8);
    }
  }

  agents() {
    return this.on ? this.list.map((it) => it.ag) : [];
  }
}

module.exports = { DemoSource };
