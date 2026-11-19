'use strict';
// Fuente: sesiones de Codex (CLI / extensión de VS Code), leídas de ~/.codex/sessions.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { Tail, short, baseName, describeTool, newAgent, pushEvent, addRecent, touchFile, midnight } = require('./util');

const ROOT = path.join(os.homedir(), '.codex', 'sessions');

function pad(n) { return String(n).padStart(2, '0'); }

class CodexSource {
  constructor(cfg) {
    this.window = (cfg.ventanaHoras || 8) * 3600e3;
    this.tracked = new Map();
    this.tick = 0;
    this.available = fs.existsSync(ROOT);
  }

  discover(now) {
    // Las sesiones se guardan en carpetas por fecha: miramos hoy y ayer.
    for (const off of [0, 1]) {
      const d = new Date(now - off * 86400e3);
      const dir = path.join(ROOT, String(d.getFullYear()), pad(d.getMonth() + 1), pad(d.getDate()));
      let files = [];
      try { files = fs.readdirSync(dir); } catch { continue; }
      for (const f of files) {
        if (!f.endsWith('.jsonl')) continue;
        const id = 'codex:' + f.slice(0, -6);
        if (this.tracked.has(id)) continue;
        let st;
        try { st = fs.statSync(path.join(dir, f)); } catch { continue; }
        if (now - st.mtimeMs < this.window) {
          const ag = newAgent(id, 'codex');
          ag.role = 'Codex';
          this.tracked.set(id, { ag, tail: new Tail(path.join(dir, f)) });
        }
      }
    }
    for (const [id, tr] of this.tracked) {
      if (now - (tr.tail.mtime || now) > this.window) this.tracked.delete(id);
    }
  }

  onLine(ag, line) {
    if (line.charCodeAt(0) !== 123) return;
    const o = JSON.parse(line);
    const t = o.timestamp ? Date.parse(o.timestamp) : 0;
    const p = o.payload || {};
    if (!t) return;
    if (!ag.startedAt) ag.startedAt = t;
    ag.lastActiveAt = t;

    if (o.type === 'session_meta') {
      if (p.cwd) { ag.cwd = p.cwd; ag.project = baseName(p.cwd); }
      if (p.originator) ag.role = /vscode/i.test(p.originator) ? 'Codex en VS Code' : 'Codex CLI';
      return;
    }
    if (o.type === 'turn_context') {
      if (p.model) ag.model = p.model;
      if (p.cwd) { ag.cwd = p.cwd; ag.project = baseName(p.cwd); }
      return;
    }
    if (o.type === 'event_msg') {
      if (p.type === 'user_message') {
        let msg = String(p.message || '');
        const cut = msg.lastIndexOf('## My request for Codex:');
        if (cut >= 0) msg = msg.slice(cut + 24);
        ag.lastPrompt = short(msg, 400);
        if (!ag.title) ag.title = short(msg, 48);
        ag._turnEnded = false;
        ag._pending.clear();
        pushEvent(ag, t, 'think', 'thinking', 'Leyendo el encargo');
        addRecent(ag, t, 'prompt', msg);
      } else if (p.type === 'agent_reasoning') {
        ag._turnEnded = false;
        pushEvent(ag, t, 'think', 'thinking', short(String(p.text || 'Pensando').replace(/\*\*/g, ''), 60));
      } else if (p.type === 'agent_message') {
        ag.lastText = short(p.message, 400);
        addRecent(ag, t, 'say', p.message);
        pushEvent(ag, t, 'talk', 'working', 'Redactando su respuesta');
      } else if (p.type === 'task_complete' || p.type === 'turn_complete' || p.type === 'turn_aborted') {
        ag._turnEnded = true;
        ag._pending.clear();
        pushEvent(ag, t, 'idle', 'idle', p.type === 'turn_aborted' ? 'Interrumpido por ti' : 'Ha terminado su turno');
      } else if (p.type === 'token_count' && p.info && p.info.total_token_usage) {
        const u = p.info.total_token_usage;
        const prev = ag.tokens.in + ag.tokens.out;
        ag.tokens.in = (u.input_tokens || 0) - (u.cached_input_tokens || 0);
        ag.tokens.cacheRead = u.cached_input_tokens || 0;
        ag.tokens.out = u.output_tokens || 0;
        if (t >= midnight()) ag.tokensToday += Math.max(0, ag.tokens.in + ag.tokens.out - prev);
      }
      return;
    }
    if (o.type === 'response_item') {
      if (p.type === 'function_call' || p.type === 'custom_tool_call' || p.type === 'local_shell_call') {
        let input = {};
        if (typeof p.arguments === 'string') { try { input = JSON.parse(p.arguments); } catch { /* texto libre */ } }
        if (p.action && p.action.command) input = { command: p.action.command };
        const d = describeTool(p.name || 'shell', input);
        if (p.name === 'apply_patch' && typeof p.input === 'string') {
          const m = /\*\*\* (?:Add|Update|Delete) File: (.+)/.exec(p.input);
          if (m) { d.detail = 'Editando ' + baseName(m[1].trim()); d.file = path.resolve(ag.cwd || '.', m[1].trim()); }
        }
        ag._turnEnded = false;
        if (p.call_id) ag._pending.set(p.call_id, { name: p.name, t, detail: d.detail });
        ag.tools++;
        if (t >= midnight()) ag.toolsToday++;
        if (d.file) touchFile(ag, t, d.file);
        pushEvent(ag, t, d.activity, 'working', d.detail);
        addRecent(ag, t, 'tool', d.detail);
      } else if (/_output$/.test(p.type || '')) {
        ag._pending.delete(p.call_id);
        if (ag._pending.size === 0 && !ag._turnEnded) pushEvent(ag, t, 'think', 'thinking', 'Pensando el siguiente paso');
      }
    }
  }

  derive(tr, now) {
    const ag = tr.ag;
    const quiet = now - Math.max(ag.lastActiveAt, tr.tail.mtime || 0);
    // Codex no publica qué procesos siguen vivos: lo deducimos de la actividad reciente.
    ag.live = quiet < 15 * 60e3;
    let state;
    if (quiet > 15 * 60e3) state = 'offline';
    else if (ag._turnEnded) state = 'idle';
    else if (quiet > 3 * 60e3) state = ag._pending.size ? 'waiting' : 'idle';
    else state = ag._pstate === 'working' ? 'working' : 'thinking';
    if (state === 'waiting' && ag.state !== 'waiting') pushEvent(ag, now, 'ask', 'waiting', 'Parece esperar tu aprobación');
    if (state === 'idle' && ag.activity !== 'idle') pushEvent(ag, now, 'idle', 'idle', 'A la espera de un nuevo encargo');
    if (state === 'offline') { ag.activity = 'idle'; ag.detail = 'Fuera de la oficina'; }
    ag.state = state;
  }

  poll(now) {
    if (!this.available) return;
    if (this.tick % 5 === 0) this.discover(now);
    this.tick++;
    for (const tr of this.tracked.values()) {
      tr.tail.read((line) => this.onLine(tr.ag, line));
      this.derive(tr, now);
    }
  }

  agents() {
    return [...this.tracked.values()].map((tr) => tr.ag).filter((a) => a.startedAt);
  }
}

module.exports = { CodexSource };
