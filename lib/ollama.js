'use strict';
// Fuente: modelos locales cargados en Ollama (http://localhost:11434).
// Ollama solo dice qué modelos están en memoria, no qué escriben: mostramos
// cada modelo cargado como un trabajador y detectamos actividad de forma aproximada.
const http = require('http');
const { newAgent, pushEvent, addRecent } = require('./util');

function getJson(url, timeout = 1500) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; if (body.length > 2e6) req.destroy(); });
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve(null); } });
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(null));
  });
}

class OllamaSource {
  constructor(cfg) {
    this.url = (cfg.ollamaUrl || 'http://127.0.0.1:11434').replace(/\/$/, '');
    this.tracked = new Map(); // nombre de modelo -> { ag, expires, lastBump }
    this.available = false;
    this.busy = false;
    this.last = 0;
  }

  async poll(now) {
    if (this.busy || now - this.last < 4000) return;
    this.busy = true;
    this.last = now;
    try {
      const ps = await getJson(this.url + '/api/ps');
      this.available = !!ps;
      const seen = new Set();
      for (const m of (ps && ps.models) || []) {
        const name = m.name || m.model;
        if (!name) continue;
        seen.add(name);
        let tr = this.tracked.get(name);
        if (!tr) {
          const ag = newAgent('ollama:' + name, 'ollama');
          ag.title = name;
          ag.model = name;
          ag.project = 'Modelos locales';
          ag.role = 'Ollama' + (m.details && m.details.parameter_size ? ' · ' + m.details.parameter_size : '');
          ag.startedAt = now;
          ag.live = true;
          tr = { ag, expires: m.expires_at, lastBump: now };
          this.tracked.set(name, tr);
          pushEvent(ag, now, 'think', 'working', 'Modelo cargado en memoria');
          addRecent(ag, now, 'info', 'Modelo cargado en memoria');
        } else if (m.expires_at !== tr.expires) {
          // Cada petición renueva la caducidad: es nuestra pista de que está respondiendo.
          tr.expires = m.expires_at;
          tr.lastBump = now;
          tr.ag.tools++;
          tr.ag.toolsToday++;
          addRecent(tr.ag, now, 'tool', 'Atendió una petición');
        }
        const ag = tr.ag;
        ag.lastActiveAt = tr.lastBump;
        if (now - tr.lastBump < 12e3) {
          ag.state = 'working';
          pushEvent(ag, now, 'talk', 'working', 'Generando una respuesta');
        } else {
          ag.state = 'idle';
          pushEvent(ag, now, 'idle', 'idle', 'Cargado y a la espera');
        }
      }
      for (const name of [...this.tracked.keys()]) if (!seen.has(name)) this.tracked.delete(name);
    } finally {
      this.busy = false;
    }
  }

  agents() {
    return [...this.tracked.values()].map((tr) => tr.ag);
  }
}

module.exports = { OllamaSource };
