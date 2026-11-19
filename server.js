'use strict';
// Oficina Virtual — servidor local sin dependencias.
// Lee los registros de tus agentes (solo lectura) y los envía en directo al navegador.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { publicAgent } = require('./lib/util');
const { ClaudeSource } = require('./lib/claude');
const { CodexSource } = require('./lib/codex');
const { OllamaSource } = require('./lib/ollama');
const { DemoSource } = require('./lib/demo');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');

let cfg = { puerto: 4317, ventanaHoras: 8, ollamaUrl: 'http://127.0.0.1:11434', fuentes: { claude: true, codex: true, ollama: true }, precios: {} };
try { cfg = Object.assign(cfg, JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'))); } catch { /* valores por defecto */ }
const PORT = Number(process.env.PORT) || cfg.puerto;
// --solo-demo: no lee ningún agente real, solo los de ejemplo (útil para capturas o para enseñarla)
const SOLO_DEMO = process.argv.includes('--solo-demo');
const fuentes = SOLO_DEMO ? { claude: false, codex: false, ollama: false } : Object.assign({ claude: true, codex: true, ollama: true }, cfg.fuentes);

const claude = fuentes.claude ? new ClaudeSource(cfg) : null;
const codex = fuentes.codex ? new CodexSource(cfg) : null;
const ollama = fuentes.ollama ? new OllamaSource(cfg) : null;
const demo = new DemoSource();
if (SOLO_DEMO || process.argv.includes('--demo')) demo.enable(true);

let current = []; // agentes internos del último ciclo
let snapshot = { now: Date.now(), agents: [], conflicts: [], stats: {}, sources: {}, demo: false };
let lastSent = '';
let lastSentAt = 0;
const clients = new Set();

function cost(ag) {
  const key = Object.keys(cfg.precios || {}).find((k) => ag.model && ag.model.toLowerCase().includes(k.toLowerCase()));
  if (!key) return null;
  const p = cfg.precios[key];
  const t = ag.tokens;
  return (t.in * (p.entrada || 0) + t.out * (p.salida || 0) + t.cacheRead * (p.cacheLectura || 0) + t.cacheWrite * (p.cacheEscritura || 0)) / 1e6;
}

function findConflicts(agents, now) {
  const byFile = new Map();
  for (const ag of agents) {
    if (ag.state === 'offline') continue;
    for (const [f, v] of ag.files) {
      if (now - v.t > 10 * 60e3) continue;
      const k = f.toLowerCase();
      if (!byFile.has(k)) byFile.set(k, { file: f, t: 0, agents: [] });
      const e = byFile.get(k);
      e.agents.push(ag.id);
      e.t = Math.max(e.t, v.t);
    }
  }
  return [...byFile.values()].filter((e) => e.agents.length > 1).sort((a, b) => b.t - a.t).slice(0, 8);
}

function cycle() {
  const now = Date.now();
  try { if (claude) claude.poll(now); } catch (e) { console.error('[claude]', e.message); }
  try { if (codex) codex.poll(now); } catch (e) { console.error('[codex]', e.message); }
  if (ollama) ollama.poll(now).catch(() => {});
  demo.poll(now);

  current = [
    ...(claude ? claude.agents(now) : []),
    ...(codex ? codex.agents() : []),
    ...(ollama ? ollama.agents() : []),
    ...demo.agents(),
  ];
  const agents = current.map((ag) => {
    const p = publicAgent(ag);
    p.cost = cost(ag);
    return p;
  });
  const visible = agents.filter((a) => a.state !== 'offline' && a.state !== 'done');
  const stats = {
    active: visible.filter((a) => a.state === 'working' || a.state === 'thinking').length,
    waiting: visible.filter((a) => a.state === 'waiting').length,
    idle: visible.filter((a) => a.state === 'idle').length,
    present: visible.length,
    tokensToday: agents.reduce((s, a) => s + a.tokensToday, 0),
    toolsToday: agents.reduce((s, a) => s + a.toolsToday, 0),
    errors: agents.reduce((s, a) => s + a.errors, 0),
    costToday: agents.some((a) => a.cost != null) ? agents.reduce((s, a) => s + (a.cost || 0), 0) : null,
  };
  snapshot = {
    agents,
    conflicts: findConflicts(current, now),
    stats,
    sources: {
      claude: !!(claude && claude.available),
      codex: !!(codex && codex.available),
      ollama: !!(ollama && ollama.available),
    },
    demo: demo.on,
  };
  const body = JSON.stringify(snapshot);
  if (body !== lastSent || now - lastSentAt > 5000) {
    lastSent = body;
    lastSentAt = now;
    const msg = 'data: ' + JSON.stringify(Object.assign({ now }, snapshot)) + '\n\n';
    for (const res of clients) res.write(msg);
  }
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve) => {
    let b = '';
    req.on('data', (c) => { b += c; if (b.length > 1e5) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(b || '{}')); } catch { resolve({}); } });
  });
}

const okHosts = new Set(['localhost:' + PORT, '127.0.0.1:' + PORT]);

const server = http.createServer(async (req, res) => {
  // Solo se atiende a esta misma máquina: lo que se muestra son tus conversaciones.
  if (!okHosts.has(String(req.headers.host || '').toLowerCase())) { res.writeHead(403); res.end('Prohibido'); return; }
  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'POST') {
    const origin = req.headers.origin;
    if (origin && !okHosts.has(origin.replace(/^https?:\/\//, ''))) { res.writeHead(403); res.end(); return; }
    const body = await readBody(req);
    if (url.pathname === '/api/demo') {
      demo.enable(!!body.on);
      cycle();
      return sendJson(res, 200, { demo: demo.on });
    }
    if (url.pathname === '/api/open') {
      const ag = current.find((a) => a.id === body.id);
      let ok = false;
      try { ok = !!ag && !!ag.cwd && fs.statSync(ag.cwd).isDirectory(); } catch { /* carpeta inexistente */ }
      if (ok) {
        const cmd = process.platform === 'win32' ? 'explorer.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
        spawn(cmd, [ag.cwd], { detached: true, stdio: 'ignore' }).unref();
      }
      return sendJson(res, ok ? 200 : 404, { ok });
    }
    res.writeHead(404); res.end(); return;
  }

  if (url.pathname === '/api/stream') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    res.write('retry: 2000\n\n');
    res.write('data: ' + JSON.stringify(Object.assign({ now: Date.now() }, snapshot)) + '\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  if (url.pathname === '/api/state') return sendJson(res, 200, Object.assign({ now: Date.now() }, snapshot));
  if (url.pathname === '/api/timeline') {
    const hours = Math.min(24, Math.max(0.25, Number(url.searchParams.get('h')) || 3));
    const now = Date.now();
    const from = now - hours * 3600e3;
    const out = [];
    for (const ag of current) {
      const ev = ag.events;
      let i = ev.findIndex((e) => e.t >= from);
      if (i < 0) i = ev.length;
      const slice = ev.slice(Math.max(0, i - 1));
      if (!slice.length || slice[slice.length - 1].t < from - 20 * 60e3) continue;
      out.push({ id: ag.id, source: ag.source, kind: ag.kind, parentId: ag.parentId, title: ag.title, project: ag.project, role: ag.role, model: ag.model, events: slice });
    }
    return sendJson(res, 200, { now, from, agents: out });
  }

  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('No encontrado'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

/** Abre la oficina en el navegador: normal (--abrir) o como ventana estrecha para un lado (--lateral). */
function openBrowser() {
  const url = 'http://localhost:' + PORT;
  const lateral = process.argv.includes('--lateral');
  if (!lateral && !process.argv.includes('--abrir')) return;
  try {
    if (process.platform === 'win32') {
      const args = lateral ? ['/c', 'start', '', 'msedge', '--app=' + url, '--window-size=440,1000', '--window-position=0,0'] : ['/c', 'start', '', url];
      spawn('cmd', args, { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
    }
  } catch { /* se puede abrir a mano */ }
}

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\n  La oficina ya estaba encendida (puerto ${PORT}). La abro en el navegador.\n`);
    openBrowser();
    setTimeout(() => process.exit(0), 800);
    return;
  }
  console.error(e);
  process.exit(1);
});

server.listen(PORT, '127.0.0.1', () => {
  openBrowser();
  cycle();
  setInterval(cycle, 1000);
  console.log(`\n  Oficina Virtual abierta en  http://localhost:${PORT}`);
  console.log(`  Fuentes: Claude Code ${claude && claude.available ? 'si' : 'no'} | Codex ${codex && codex.available ? 'si' : 'no'} | Ollama (se detecta al vuelo)`);
  console.log('  Cierra esta ventana o pulsa Ctrl+C para apagarla.\n');
});
