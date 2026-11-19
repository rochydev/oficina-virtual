'use strict';
// Utilidades compartidas por todas las fuentes de agentes.
const fs = require('fs');
const { StringDecoder } = require('string_decoder');

/** Lee un archivo que crece (JSONL) de forma incremental, línea a línea. */
class Tail {
  constructor(file, maxInitialBytes = 48 * 1024 * 1024) {
    this.file = file;
    this.offset = 0;
    this.rest = '';
    this.first = true;
    this.max = maxInitialBytes;
    this.skipPartial = false;
    this.mtime = 0;
    this.dec = new StringDecoder('utf8');
  }

  /** Llama a onLine por cada línea nueva. Devuelve true si había datos nuevos. */
  read(onLine) {
    let st;
    try { st = fs.statSync(this.file); } catch { return false; }
    this.mtime = st.mtimeMs;
    if (st.size < this.offset) { this.offset = 0; this.rest = ''; }
    if (this.first) {
      this.first = false;
      if (st.size > this.max) { this.offset = st.size - this.max; this.skipPartial = true; }
    }
    if (st.size === this.offset) return false;
    let fd;
    try { fd = fs.openSync(this.file, 'r'); } catch { return false; }
    try {
      const buf = Buffer.allocUnsafe(Math.min(4 << 20, st.size - this.offset));
      while (this.offset < st.size) {
        const n = fs.readSync(fd, buf, 0, Math.min(buf.length, st.size - this.offset), this.offset);
        if (n <= 0) break;
        this.offset += n;
        const chunk = this.rest + this.dec.write(buf.subarray(0, n));
        let start = 0, i;
        while ((i = chunk.indexOf('\n', start)) >= 0) {
          const line = chunk.slice(start, i);
          start = i + 1;
          if (this.skipPartial) { this.skipPartial = false; continue; }
          if (line.length > 1) {
            try { onLine(line); } catch { /* una línea rara no debe tumbar el lector */ }
          }
        }
        this.rest = chunk.slice(start);
      }
    } finally {
      fs.closeSync(fd);
    }
    return true;
  }
}

function short(s, l = 60) {
  s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  return s.length > l ? s.slice(0, l - 1) + '…' : s;
}

function baseName(p) {
  return p ? String(p).split(/[\\/]/).filter(Boolean).pop() || '' : '';
}

function host(u) {
  try { return new URL(u).host; } catch { return short(u, 40); }
}

/** Traduce una llamada a herramienta en actividad de oficina + texto legible. */
function describeTool(name, input) {
  const n = String(name || '');
  const i = input && typeof input === 'object' ? input : {};
  if (/^(Edit|MultiEdit|NotebookEdit)$/.test(n)) {
    const f = i.file_path || i.notebook_path;
    return { activity: 'edit', detail: 'Editando ' + baseName(f), file: f };
  }
  if (n === 'Write') return { activity: 'edit', detail: 'Escribiendo ' + baseName(i.file_path), file: i.file_path };
  if (n === 'apply_patch') return { activity: 'edit', detail: 'Aplicando cambios al código' };
  if (n === 'Read') return { activity: 'read', detail: 'Leyendo ' + baseName(i.file_path) };
  if (n === 'Grep') return { activity: 'search', detail: 'Buscando «' + short(i.pattern, 34) + '»' };
  if (n === 'Glob') return { activity: 'search', detail: 'Buscando archivos ' + short(i.pattern, 30) };
  if (n === 'ToolSearch') return { activity: 'search', detail: 'Buscando herramientas' };
  if (/^(Bash|PowerShell|shell|shell_command|local_shell|exec_command)$/.test(n)) {
    let cmd = i.description || i.command || i.cmd || '';
    if (Array.isArray(cmd)) cmd = cmd.join(' ');
    return { activity: 'run', detail: 'Ejecutando: ' + short(cmd, 52) };
  }
  if (n === 'WebFetch') return { activity: 'web', detail: 'Consultando ' + host(i.url) };
  if (n === 'WebSearch' || n === 'web_search') return { activity: 'web', detail: 'Buscando en la web: ' + short(i.query, 36) };
  if (n === 'Agent' || n === 'Task') return { activity: 'delegate', detail: 'Delegando: ' + short(i.description || i.prompt, 44) };
  if (n === 'Workflow') return { activity: 'delegate', detail: 'Coordinando un equipo de agentes' };
  if (n === 'AskUserQuestion') return { activity: 'ask', detail: 'Te está haciendo una pregunta', ask: true };
  if (n === 'ExitPlanMode') return { activity: 'ask', detail: 'Espera que apruebes su plan', ask: true };
  if (/^(TodoWrite|EnterPlanMode|TaskCreate|TaskUpdate|TaskList|update_plan)$/.test(n) || /update_plan|wrap_up|mark_chapter/.test(n)) {
    return { activity: 'plan', detail: 'Organizando el plan de trabajo' };
  }
  if (n === 'Skill') return { activity: 'read', detail: 'Consultando el manual: ' + short(i.skill, 30) };
  if (n === 'Artifact') return { activity: 'edit', detail: 'Publicando una página' };
  if (/browser|chrome|computer|navigate|screenshot/i.test(n)) return { activity: 'web', detail: 'Usando el navegador' };
  if (n.startsWith('mcp__')) {
    const parts = n.split('__');
    return { activity: 'tool', detail: 'Usando ' + short(parts[parts.length - 1].replace(/[_-]+/g, ' '), 40) };
  }
  return { activity: 'tool', detail: 'Usando ' + short(n, 40) };
}

function newAgent(id, source) {
  return {
    id, source, kind: 'main', parentId: null,
    title: '', role: '', project: '', cwd: '', branch: '', model: '',
    state: 'idle', activity: 'idle', detail: '', since: 0,
    lastPrompt: '', lastText: '',
    startedAt: 0, lastActiveAt: 0, live: false,
    tokens: { in: 0, out: 0, cacheRead: 0, cacheWrite: 0 },
    tokensToday: 0, tools: 0, toolsToday: 0, errors: 0,
    files: new Map(), recent: [], events: [],
    _pending: new Map(), _turnEnded: true, _seen: new Set(), _pstate: 'idle',
  };
}

function midnight() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Registra un cambio de actividad en la línea de tiempo del agente. */
function pushEvent(ag, t, activity, state, detail) {
  ag.activity = activity;
  ag.detail = detail;
  ag._pstate = state;
  const last = ag.events[ag.events.length - 1];
  if (last && last.a === activity && last.d === detail && last.s === state) return;
  ag.since = t;
  ag.events.push({ t, a: activity, s: state, d: detail });
  if (ag.events.length > 1600) ag.events.splice(0, 400);
}

function addRecent(ag, t, kind, text) {
  ag.recent.push({ t, k: kind, x: short(text, 220) });
  if (ag.recent.length > 40) ag.recent.splice(0, ag.recent.length - 40);
}

function addUsage(ag, t, u) {
  if (!u) return;
  const i = u.input_tokens || 0, o = u.output_tokens || 0;
  const cr = u.cache_read_input_tokens || u.cached_input_tokens || 0;
  const cw = u.cache_creation_input_tokens || 0;
  ag.tokens.in += i; ag.tokens.out += o; ag.tokens.cacheRead += cr; ag.tokens.cacheWrite += cw;
  if (t >= midnight()) ag.tokensToday += i + o + cw;
}

function touchFile(ag, t, file) {
  if (!file) return;
  const key = String(file).replace(/\\/g, '/');
  const cur = ag.files.get(key) || { n: 0, t: 0 };
  cur.n++; cur.t = t;
  ag.files.set(key, cur);
  if (ag.files.size > 200) ag.files.delete(ag.files.keys().next().value);
}

/** Versión del agente que se envía al navegador. */
function publicAgent(ag) {
  const files = [...ag.files.entries()]
    .sort((a, b) => b[1].t - a[1].t).slice(0, 14)
    .map(([f, v]) => ({ f, n: v.n, t: v.t }));
  return {
    id: ag.id, source: ag.source, kind: ag.kind, parentId: ag.parentId,
    title: ag.title, role: ag.role, project: ag.project, cwd: ag.cwd, branch: ag.branch, model: ag.model,
    state: ag.state, activity: ag.activity, detail: ag.detail, since: ag.since,
    lastPrompt: ag.lastPrompt, lastText: ag.lastText,
    startedAt: ag.startedAt, lastActiveAt: ag.lastActiveAt, live: ag.live,
    tokens: ag.tokens, tokensToday: ag.tokensToday, tools: ag.tools, toolsToday: ag.toolsToday, errors: ag.errors,
    files, recent: ag.recent.slice(-30),
  };
}

module.exports = { Tail, short, baseName, describeTool, newAgent, pushEvent, addRecent, addUsage, touchFile, publicAgent, midnight };
