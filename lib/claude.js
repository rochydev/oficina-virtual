'use strict';
// Fuente: sesiones de Claude Code (CLI, app de escritorio, IDE) y sus subagentes.
// Solo LEE los registros que Claude ya guarda en ~/.claude. No modifica nada.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { Tail, short, baseName, describeTool, newAgent, pushEvent, addRecent, addUsage, touchFile, midnight } = require('./util');

const HOME = path.join(os.homedir(), '.claude');
const PROJECTS = path.join(HOME, 'projects');
const SESSIONS = path.join(HOME, 'sessions');

// Herramientas que pueden tardar mucho por sí solas: su espera no implica que falte un permiso.
const LONG = /^(Bash|PowerShell|Agent|Task|Workflow|WebFetch|WebSearch|Skill|Monitor)$/;

function pidAlive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

class ClaudeSource {
  constructor(cfg) {
    this.window = (cfg.ventanaHoras || 8) * 3600e3;
    this.subWindow = 3 * 3600e3;
    this.tracked = new Map(); // id -> { ag, tail, file, sid }
    this.registry = new Map(); // sessionId -> entrada de ~/.claude/sessions
    this.tick = 0;
    this.available = fs.existsSync(PROJECTS);
  }

  readRegistry() {
    const map = new Map();
    let names = [];
    try { names = fs.readdirSync(SESSIONS); } catch { /* sin registro */ }
    for (const f of names) {
      if (!f.endsWith('.json')) continue;
      try {
        const o = JSON.parse(fs.readFileSync(path.join(SESSIONS, f), 'utf8'));
        if (o && o.sessionId && pidAlive(o.pid)) map.set(o.sessionId, o);
      } catch { /* archivo a medio escribir */ }
    }
    this.registry = map;
  }

  track(id, file, sid, parentSid) {
    const ag = newAgent(id, 'claude');
    if (parentSid) {
      ag.kind = 'sub';
      ag.parentId = 'claude:' + parentSid;
      try {
        const meta = JSON.parse(fs.readFileSync(file.replace(/\.jsonl$/, '.meta.json'), 'utf8'));
        ag.title = meta.description || '';
        ag.role = meta.agentType || '';
        ag.model = meta.model || '';
      } catch { /* sin metadatos */ }
    }
    this.tracked.set(id, { ag, tail: new Tail(file), file, sid });
  }

  discover(now) {
    let dirs = [];
    try { dirs = fs.readdirSync(PROJECTS, { withFileTypes: true }); } catch { return; }
    for (const d of dirs) {
      if (!d.isDirectory()) continue;
      const dir = path.join(PROJECTS, d.name);
      let entries = [];
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
      for (const e of entries) {
        if (!e.isFile() || !e.name.endsWith('.jsonl')) continue;
        const sid = e.name.slice(0, -6);
        const id = 'claude:' + sid;
        if (!this.tracked.has(id)) {
          let st;
          try { st = fs.statSync(path.join(dir, e.name)); } catch { continue; }
          if (this.registry.has(sid) || now - st.mtimeMs < this.window) {
            this.track(id, path.join(dir, e.name), sid, null);
            const ag = this.tracked.get(id).ag;
            ag.project = d.name.split('-').filter(Boolean).pop() || d.name;
          }
        }
        if (this.tracked.has(id)) this.discoverSubs(now, path.join(dir, sid, 'subagents'), sid);
      }
    }
    // Olvida lo que ya no es relevante.
    for (const [id, tr] of this.tracked) {
      const age = now - (tr.tail.mtime || now);
      if (tr.ag.kind === 'sub') { if (age > this.subWindow) this.tracked.delete(id); }
      else if (!this.registry.has(tr.sid) && age > this.window) this.tracked.delete(id);
    }
  }

  discoverSubs(now, subDir, parentSid) {
    let files = [];
    try { files = fs.readdirSync(subDir); } catch { return; }
    for (const f of files) {
      if (!f.startsWith('agent-') || !f.endsWith('.jsonl')) continue;
      const id = 'claude:sub:' + f.slice(6, -6);
      if (this.tracked.has(id)) continue;
      let st;
      try { st = fs.statSync(path.join(subDir, f)); } catch { continue; }
      if (now - st.mtimeMs < this.subWindow) this.track(id, path.join(subDir, f), null, parentSid);
    }
  }

  onLine(ag, line) {
    if (line.charCodeAt(0) !== 123) return;
    // Líneas enormes de depuración que no aportan nada a la oficina.
    if (line.startsWith('{"type":"api-request') || line.startsWith('{"type":"file-history')) return;
    const o = JSON.parse(line);
    if (o.type === 'custom-title' && o.customTitle) { ag.title = o.customTitle; return; }
    if (o.type === 'agent-name' && o.agentName) { if (!ag.title) ag.title = o.agentName; return; }
    if (o.cwd) { ag.cwd = o.cwd; ag.project = baseName(o.cwd) || ag.project; }
    if (o.gitBranch && o.gitBranch !== 'HEAD') ag.branch = o.gitBranch;
    const t = o.timestamp ? Date.parse(o.timestamp) : 0;
    if (!t) return;
    if (!ag.startedAt) ag.startedAt = t;
    const m = o.message;

    if (o.type === 'user' && m) {
      let prompt = '';
      let hadResult = false;
      if (typeof m.content === 'string') {
        if (!o.isMeta) prompt = m.content;
      } else if (Array.isArray(m.content)) {
        for (const c of m.content) {
          if (c.type === 'tool_result') {
            hadResult = true;
            const p = ag._pending.get(c.tool_use_id);
            ag._pending.delete(c.tool_use_id);
            if (c.is_error) {
              ag.errors++;
              addRecent(ag, t, 'error', 'Falló: ' + (p ? p.detail : 'una herramienta'));
            }
          } else if (c.type === 'text' && !o.isMeta && !prompt) {
            prompt = c.text || '';
          }
        }
      }
      prompt = prompt.trim();
      if (prompt.startsWith('[Request interrupted')) {
        ag._pending.clear();
        ag._turnEnded = true;
        pushEvent(ag, t, 'idle', 'idle', 'Interrumpido por ti');
        addRecent(ag, t, 'info', 'Interrumpido');
      } else if (prompt && !prompt.startsWith('<') && !prompt.startsWith('This session is being continued')) {
        ag.lastPrompt = short(prompt, 400);
        ag._pending.clear();
        ag._turnEnded = false;
        pushEvent(ag, t, 'think', 'thinking', 'Leyendo el encargo');
        addRecent(ag, t, 'prompt', prompt);
      } else if (hadResult && ag._pending.size === 0 && !ag._turnEnded) {
        pushEvent(ag, t, 'think', 'thinking', 'Pensando el siguiente paso');
      }
      ag.lastActiveAt = t;
      return;
    }

    if (m && m.role === 'assistant' && Array.isArray(m.content)) {
      if (m.model && m.model[0] !== '<') ag.model = m.model;
      if (m.id && !ag._seen.has(m.id)) { ag._seen.add(m.id); addUsage(ag, t, m.usage); }
      ag._turnEnded = false;
      for (const c of m.content) {
        if (c.type === 'thinking') {
          pushEvent(ag, t, 'think', 'thinking', 'Pensando');
        } else if (c.type === 'text' && c.text && c.text.trim()) {
          ag.lastText = short(c.text, 400);
          pushEvent(ag, t, 'talk', 'working', 'Redactando su respuesta');
          addRecent(ag, t, 'say', c.text);
        } else if (c.type === 'tool_use') {
          const d = describeTool(c.name, c.input);
          ag._pending.set(c.id, { name: c.name, t, detail: d.detail, ask: !!d.ask });
          ag.tools++;
          if (t >= midnight()) ag.toolsToday++;
          if (d.file) touchFile(ag, t, d.file);
          pushEvent(ag, t, d.activity, 'working', d.detail);
          addRecent(ag, t, 'tool', d.detail);
        }
      }
      if (m.stop_reason === 'end_turn' || m.stop_reason === 'stop_sequence') {
        ag._turnEnded = true;
        pushEvent(ag, t, 'idle', 'idle', 'Ha terminado su turno');
      }
      ag.lastActiveAt = t;
      return;
    }

    if (o.type === 'system') {
      if (o.subtype === 'stop_hook_summary') {
        if (!o.preventedContinuation && ag._pending.size === 0) {
          ag._turnEnded = true;
          pushEvent(ag, t, 'idle', 'idle', 'Ha terminado su turno');
        }
      } else if (o.level === 'error' || /error/i.test(o.subtype || '')) {
        ag.errors++;
        addRecent(ag, t, 'error', o.content || o.subtype || 'Error');
      }
      ag.lastActiveAt = Math.max(ag.lastActiveAt, t);
    }
  }

  /** Decide el estado visible ahora mismo combinando registro en vivo + transcripción. */
  derive(tr, now) {
    const ag = tr.ag;
    const quiet = now - Math.max(ag.lastActiveAt, tr.tail.mtime || 0);

    if (ag.kind === 'sub') {
      const parent = this.tracked.get(ag.parentId);
      if (parent) { ag.project = parent.ag.project; ag.cwd = ag.cwd || parent.ag.cwd; }
      ag.live = !ag._turnEnded && quiet < 4 * 60e3;
      if (!ag.live) { ag.state = 'done'; if (ag._turnEnded) ag.detail = 'Entregó su trabajo'; return; }
      ag.state = ag._pending.size ? 'working' : (ag._pstate === 'working' ? 'working' : 'thinking');
      return;
    }

    const reg = this.registry.get(tr.sid);
    ag.live = !!reg;
    if (reg) {
      if (reg.name && !ag.title) ag.title = reg.name;
      if (reg.cwd && !ag.cwd) { ag.cwd = reg.cwd; ag.project = baseName(reg.cwd) || ag.project; }
      ag.role = reg.entrypoint === 'claude-desktop' ? 'App de escritorio' : (reg.entrypoint || reg.kind || '');
    }
    const regStatus = reg ? String(reg.status || '') : '';

    let state;
    let waitingWhy = '';
    if (ag._pending.size) {
      state = 'working';
      for (const p of ag._pending.values()) {
        const age = now - p.t;
        if (p.ask) { state = 'waiting'; waitingWhy = p.detail; break; }
        const limit = LONG.test(p.name) ? Infinity : (p.name.startsWith('mcp__') ? 30e3 : 10e3);
        if (age > limit) { state = 'waiting'; waitingWhy = 'Espera tu permiso: ' + p.detail; break; }
      }
    } else if (ag._turnEnded) {
      state = 'idle';
    } else {
      state = (quiet < 3 * 60e3 || regStatus === 'busy') ? (ag._pstate === 'working' ? 'working' : 'thinking') : 'idle';
    }
    if (/wait|permission|input|block|approv/i.test(regStatus) && state !== 'idle') {
      state = 'waiting';
      waitingWhy = waitingWhy || 'Espera tu respuesta';
    }
    if (!reg) {
      // Sin proceso vivo conocido: nos fiamos solo de la actividad del archivo.
      if (quiet > 10 * 60e3) state = 'offline';
      else if (state !== 'idle' && quiet > 3 * 60e3) state = 'idle';
    }

    if (state === 'waiting') {
      if (ag.state !== 'waiting') {
        pushEvent(ag, now, 'ask', 'waiting', waitingWhy);
        addRecent(ag, now, 'wait', waitingWhy);
      }
    } else if (ag.state === 'waiting' && ag.activity === 'ask' && state !== 'idle') {
      pushEvent(ag, now, 'think', state, 'Vuelve al trabajo');
    }
    if (state === 'idle' && ag.activity !== 'idle') pushEvent(ag, now, 'idle', 'idle', 'A la espera de un nuevo encargo');
    if (state === 'offline') { ag.activity = 'idle'; ag.detail = 'Fuera de la oficina'; }
    ag.state = state;
  }

  poll(now) {
    if (!this.available) return;
    if (this.tick % 2 === 0) this.readRegistry();
    if (this.tick % 5 === 0) this.discover(now);
    this.tick++;
    for (const tr of this.tracked.values()) tr.tail.read((line) => this.onLine(tr.ag, line));
    for (const tr of this.tracked.values()) if (tr.ag.kind !== 'sub') this.derive(tr, now);
    for (const tr of this.tracked.values()) if (tr.ag.kind === 'sub') this.derive(tr, now);
  }

  agents(now) {
    const out = [];
    for (const tr of this.tracked.values()) {
      const ag = tr.ag;
      if (!ag.startedAt && !ag.live) continue;
      // Los becarios que ya entregaron solo se conservan un rato.
      if (ag.kind === 'sub' && ag.state === 'done' && now - ag.lastActiveAt > 15 * 60e3) continue;
      out.push(ag);
    }
    return out;
  }
}

module.exports = { ClaudeSource };
