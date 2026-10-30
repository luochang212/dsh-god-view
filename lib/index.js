/**
 * dsh-god-view host plugin (protocol v3).
 *
 * Keeps only the three things parallel agents need:
 *  - presence + a one-line focus (automatic when the first prompt arrives);
 *  - short file leases with a write guard;
 *  - a claim/release timeline that keeps who changed what and when.
 *
 * The browser half is ./client.js. The shared file format is ./store.js and is
 * also used by bin/dsh-god-view.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import * as S from './store.js';

export const name = 'dsh-god-view';
export const inject = ['tools'];

const PACKAGE_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CLI_PATH = path.join(PACKAGE_ROOT, 'bin', 'dsh-god-view.mjs');
const ROUTE = '/plugins/dsh-god-view/api';
const MAX_HTTP_BODY = 64 * 1024;
const COORDINATION_OFF =
  "Coordination is off for this repository. The human turns it on from the God's Eye View panel; " +
  'until then nothing is recorded and no write is blocked. Continue your work normally.';

const DEFAULTS = {
  root: '',
  route: ROUTE,
  heartbeatMs: 20_000,
  ttlMs: S.DEFAULT_TTL_MS,
  namePrefix: 'agent',
  registryDir: path.join(os.homedir(), '.dsh', 'parallel'),
  autoTrack: true,
  prompt: true,
  maxPromptPeers: 8,
  claimPolicy: 'auto',
  autoClaimTtlMs: 10 * 60_000,
  releaseAutoOnIdle: true,
};

function readConfig(config) {
  const cfg = { ...DEFAULTS, ...(config && typeof config === 'object' ? config : {}) };
  cfg.heartbeatMs = clampNumber(cfg.heartbeatMs, 2_000, 300_000, DEFAULTS.heartbeatMs);
  cfg.ttlMs = clampNumber(cfg.ttlMs, 10_000, 3_600_000, DEFAULTS.ttlMs);
  cfg.maxPromptPeers = clampNumber(cfg.maxPromptPeers, 1, 30, DEFAULTS.maxPromptPeers);
  cfg.autoClaimTtlMs = clampNumber(cfg.autoClaimTtlMs, 60_000, 4 * 60 * 60_000, DEFAULTS.autoClaimTtlMs);
  let registryDir = typeof cfg.registryDir === 'string' && cfg.registryDir ? cfg.registryDir : DEFAULTS.registryDir;
  if (registryDir === '~') registryDir = os.homedir();
  else if (registryDir.startsWith('~' + path.sep)) registryDir = path.join(os.homedir(), registryDir.slice(2));
  cfg.registryDir = path.resolve(registryDir);
  cfg.route = typeof cfg.route === 'string' && cfg.route.startsWith('/') ? cfg.route.replace(/\/$/, '') : ROUTE;
  if (!['off', 'advisory', 'require', 'auto'].includes(cfg.claimPolicy)) cfg.claimPolicy = DEFAULTS.claimPolicy;
  cfg.releaseAutoOnIdle = cfg.releaseAutoOnIdle !== false;
  return cfg;
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function ago(ms) {
  if (!ms) return 'never';
  const seconds = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (seconds < 60) return seconds + 's';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes + 'm';
  const hours = Math.floor(minutes / 60);
  return hours + 'h';
}

function xmlEscape(text) {
  return String(text == null ? '' : text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function oneLine(text, max) {
  const value = String(text == null ? '' : text)
    .replace(/\s+/g, ' ')
    .trim();
  return value.length > max ? value.slice(0, max - 1) + '...' : value;
}

function basename(root) {
  try {
    return path.basename(root) || root;
  } catch {
    return root;
  }
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function optString(args, key, max) {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new Error(key + ' must be a string');
  return value.slice(0, max || 10_000);
}

function reqString(args, key, max) {
  const value = optString(args, key, max);
  if (!value || !value.trim()) throw new Error(key + ' must be a non-empty string');
  return value;
}

function optBool(args, key) {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'boolean') throw new Error(key + ' must be a boolean');
  return value;
}

function optInt(args, key, min, max) {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(key + ' must be a number');
  const n = Math.floor(value);
  if (n < min || n > max) throw new Error(key + ' must be between ' + min + ' and ' + max);
  return n;
}

function optStringArray(args, key, maxItems) {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(key + ' must be an array of strings');
  }
  return value.slice(0, maxItems || 50);
}

function objectSchema(properties, required = []) {
  return { type: 'object', additionalProperties: false, properties, required };
}

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: { text: { type: 'string' } },
  required: ['text'],
};

function textOutput(text) {
  return { text: String(text == null ? '' : text) };
}

function renderText(_args, value) {
  return [{ type: 'text', text: String(value && value.text ? value.text : '') }];
}

export function apply(ctx, config) {
  const runtime = new TeamRuntime(ctx, readConfig(config));
  ctx.effect(() => {
    runtime.start();
    return () => runtime.stop();
  }, 'dsh-god-view: lifecycle');
}

class TeamRuntime {
  constructor(ctx, cfg) {
    this.ctx = ctx;
    this.cfg = cfg;
    this.tracked = new Map();
    this.disposers = [];
    this.knownRoots = new Set();
    this.currentRoot = '';
    this.webHost = '';
    this.heartbeatTimer;
    this.pruneTimer;
    this.started = false;
    this.missingRepoWarned = new Set();
    this.coordinationMtime = -1;
    this.coordinationOn = false;
  }

  start() {
    if (this.started) return;
    this.started = true;
    if (this.cfg.root) {
      try {
        this.currentRoot = S.resolveRepoRoot(process.cwd(), this.cfg.root);
        this.knownRoots.add(this.currentRoot);
      } catch (error) {
        this.warn(error);
      }
    }
    this.registerTools();
    this.registerHttp();
    this.bindEvents();
    this.scanExistingAgents();
    this.heartbeatTimer = setInterval(() => this.heartbeat(), this.cfg.heartbeatMs);
    this.pruneTimer = setInterval(() => this.prune(), 6 * 60 * 60_000);
    if (this.heartbeatTimer.unref) this.heartbeatTimer.unref();
    if (this.pruneTimer.unref) this.pruneTimer.unref();
  }

  stop() {
    if (!this.started) return;
    this.started = false;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.pruneTimer) clearInterval(this.pruneTimer);
    this.heartbeatTimer = undefined;
    this.pruneTimer = undefined;
    for (const dispose of this.disposers.splice(0)) {
      try {
        dispose();
      } catch {}
    }
    for (const entry of this.tracked.values()) {
      try {
        if (entry.promptDispose) entry.promptDispose();
      } catch {}
    }
    this.tracked.clear();
  }

  warn(error) {
    const message = error && error.stack ? error.stack : String(error);
    console.warn('[dsh-god-view] ' + message);
  }

  bindEvents() {
    const on = (event, listener) => {
      try {
        this.disposers.push(this.ctx.on(event, listener));
      } catch (error) {
        this.warn(error);
      }
    };
    on('agent/status', (payload) => {
      try {
        this.onStatus(payload && payload.agent, payload && payload.status);
      } catch (error) {
        this.warn(error);
      }
    });
    on('agent/disposed', (payload) => {
      try {
        this.onDisposed(payload && payload.agent);
      } catch (error) {
        this.warn(error);
      }
    });
    on('tools/result', (exec) => {
      try {
        this.onToolResult(exec);
      } catch (error) {
        this.warn(error);
      }
    });
    on('tools/pre-execute', (exec, next) => this.beforeTool(exec, next));
    on('agent/inbox/inserted', (payload) => {
      try {
        this.onInboxInserted(payload && payload.agent, payload && payload.message);
      } catch (error) {
        this.warn(error);
      }
    });
  }

  scanExistingAgents() {
    try {
      this.ctx.inject(['agents'], (scoped) => {
        let agents;
        try {
          const registry = scoped.agents || (scoped.get && scoped.get('agents'));
          agents = registry && typeof registry.list === 'function' ? registry.list() : [];
        } catch {
          agents = [];
        }
        for (const agent of agents) {
          try {
            const cwd = this.agentCwd(agent);
            const root = S.resolveRepoRoot(cwd);
            const hadPresence = Boolean(S.getAgent(root, S.agentIdForSession(agent.session.id)));
            if (hadPresence || agent.status === 'running') this.track(agent);
          } catch (error) {
            this.warn(error);
          }
        }
      });
    } catch (error) {
      this.warn(error);
    }
  }

  agentCwd(agent) {
    try {
      const directories = this.ctx.get('workingDirectory');
      if (directories && typeof directories.get === 'function') {
        const cwd = directories.get(agent.session);
        if (cwd) return cwd;
      }
    } catch {}
    try {
      if (agent.session && agent.session.header && agent.session.header.cwd) return agent.session.header.cwd;
    } catch {}
    return process.cwd();
  }

  sessionTitle(agent) {
    try {
      const titles = this.ctx.get('sessionTitle');
      const snapshot = titles && typeof titles.get === 'function' ? titles.get(agent.session) : undefined;
      return snapshot && snapshot.title ? String(snapshot.title).slice(0, 200) : undefined;
    } catch {
      return undefined;
    }
  }

  autoName(agent) {
    if (process.env.DSH_PARALLEL_NAME) return process.env.DSH_PARALLEL_NAME;
    const parent = agent && agent.session && agent.session.header && agent.session.header.parentSession;
    const short =
      String((agent && agent.session && agent.session.id) || 'agent')
        .replace(/[^a-zA-Z0-9]/g, '')
        .slice(-6) || 'agent';
    return (parent ? 'sub-' : this.cfg.namePrefix + '-') + short;
  }

  hasRepoMarker(root) {
    try {
      return fs.existsSync(path.join(root, '.git')) || fs.existsSync(path.join(root, S.STORE_DIR));
    } catch {
      return false;
    }
  }

  registerProject(root) {
    try {
      S.registerProject(this.cfg.registryDir, { root, name: basename(root), lastSeenAt: Date.now() });
    } catch (error) {
      this.warn(error);
    }
  }

  /**
   * The switch is a file in the registry dir, so the CLI and every host process
   * see the same value. Re-read it when its mtime changes; a stat per write is
   * cheap enough to stay honest, and a cache keeps the dormant path free of I/O.
   */
  coordinationEnabled() {
    let mtimeMs;
    try {
      mtimeMs = fs.statSync(S.coordinationFile(this.cfg.registryDir)).mtimeMs;
    } catch {
      mtimeMs = 0;
    }
    if (mtimeMs !== this.coordinationMtime) {
      this.coordinationMtime = mtimeMs;
      this.coordinationOn = S.readCoordination(this.cfg.registryDir).enabled;
    }
    return this.coordinationOn === true;
  }

  coordinationStatus() {
    const roots = new Set();
    for (const entry of this.tracked.values()) roots.add(entry.root);
    return {
      enabled: this.coordinationEnabled(),
      trackedSessions: this.tracked.size,
      roots: [...roots],
    };
  }

  setCoordination(enabled) {
    const on = enabled === true;
    S.writeCoordination(this.cfg.registryDir, on);
    this.coordinationOn = on;
    this.coordinationMtime = -1;
    if (on) this.materializeTracked();
    else this.dematerializeTracked();
    return this.coordinationStatus();
  }

  /** Turning the switch on backfills presence for sessions that were dormant. */
  materializeTracked() {
    for (const entry of this.tracked.values()) {
      try {
        S.ensureStore(entry.root);
        entry.presence = S.createAgent(entry.root, {
          id: entry.id,
          role: entry.role,
          status: entry.agent && entry.agent.status === 'idle' ? 'idle' : 'active',
          sessionId: entry.sessionId,
          sessionTitle: this.sessionTitle(entry.agent),
          parentId: entry.parentId,
          cwd: entry.cwd,
          pid: process.pid,
          hostname: os.hostname(),
          ttlMs: this.cfg.ttlMs,
        });
        this.installPrompt(entry);
      } catch (error) {
        this.warn(error);
      }
    }
  }

  /** Turning it off stops the prompt hook and drops the auto leases this host holds. */
  dematerializeTracked() {
    for (const entry of this.tracked.values()) {
      try {
        if (entry.promptDispose) {
          entry.promptDispose();
          entry.promptDispose = undefined;
        }
        const claims = S.listClaims(entry.root).filter((claim) => claim.agent === entry.id && claim.auto === true);
        if (claims.length > 0) {
          S.releasePaths(
            entry.root,
            entry.id,
            claims.map((claim) => claim.path),
            { summary: 'coordination disabled' },
          );
        }
        entry.presence = undefined;
      } catch (error) {
        this.warn(error);
      }
    }
  }

  track(agent, options = {}) {
    if (!agent || !agent.session) return undefined;
    const sessionId = String(agent.session.id);
    const existingEntry = this.tracked.get(sessionId);
    if (existingEntry) {
      if (existingEntry.presence === undefined && !this.coordinationEnabled()) return existingEntry;
      if (S.getAgent(existingEntry.root, existingEntry.id)) return existingEntry;
      this.tracked.delete(sessionId);
    }
    const cwd = this.agentCwd(agent);
    let root;
    try {
      root = S.resolveRepoRoot(cwd);
    } catch (error) {
      this.warn(error);
      return undefined;
    }
    if (!options.force && !this.hasRepoMarker(root)) {
      if (!this.missingRepoWarned.has(root)) {
        this.missingRepoWarned.add(root);
        console.warn(
          '[dsh-god-view] skipping auto-presence for non-repo directory ' + root + ' (set config.root to override)',
        );
      }
      return undefined;
    }
    this.knownRoots.add(root);
    this.currentRoot = root;
    this.registerProject(root);
    const id = S.agentIdForSession(sessionId);
    const parentSession = agent.session.header && agent.session.header.parentSession;
    const role = parentSession ? 'subagent' : 'agent';
    const parentId = parentSession ? S.agentIdForSession(parentSession) : undefined;
    // Dormant by default: keep the session in memory so the panel can offer the
    // switch, but write no board state until coordination is turned on.
    if (!this.coordinationEnabled()) {
      const dormant = {
        agent,
        sessionId,
        id,
        root,
        role,
        parentId,
        cwd,
        presence: undefined,
        promptDispose: undefined,
      };
      this.tracked.set(sessionId, dormant);
      return dormant;
    }
    try {
      S.ensureStore(root);
    } catch (error) {
      this.warn(error);
      return undefined;
    }
    let presence = S.getAgent(root, id);
    try {
      presence = S.createAgent(root, {
        id,
        name: presence ? undefined : this.autoName(agent),
        role,
        status: agent.status === 'idle' ? 'idle' : 'active',
        focus: presence ? undefined : 'starting',
        sessionId,
        sessionTitle: this.sessionTitle(agent),
        parentId,
        cwd,
        pid: process.pid,
        hostname: os.hostname(),
        ttlMs: this.cfg.ttlMs,
      });
    } catch (error) {
      this.warn(error);
      return undefined;
    }
    const entry = { agent, sessionId, id, root, presence, promptDispose: undefined };
    this.tracked.set(sessionId, entry);
    this.installPrompt(entry);
    return entry;
  }

  installPrompt(entry) {
    if (!this.cfg.prompt) return;
    try {
      const prompt = entry.agent.ctx && entry.agent.ctx.get ? entry.agent.ctx.get('systemPrompt') : undefined;
      if (!prompt || typeof prompt.context !== 'function') return;
      entry.promptDispose = entry.agent.ctx.effect(
        () =>
          prompt.context({
            name: 'parallel',
            order: 9000,
            required: true,
            interpolate: false,
            text: () => {
              try {
                return this.promptFor(entry.agent);
              } catch {
                return '';
              }
            },
          }),
        'dsh-god-view: prompt-context',
      );
    } catch (error) {
      this.warn(error);
    }
  }

  ensureTracked(agent) {
    if (!agent || !agent.session) throw new Error('team tools require an owning agent session');
    const sessionId = String(agent.session.id);
    let entry = this.tracked.get(sessionId);
    if (entry) {
      try {
        if (!S.getAgent(entry.root, entry.id)) {
          this.tracked.delete(sessionId);
          entry = undefined;
        }
      } catch {
        this.tracked.delete(sessionId);
        entry = undefined;
      }
    }
    if (!entry) entry = this.track(agent, { force: true });
    if (!entry) throw new Error('could not resolve a dsh-god-view store for this session');
    return entry;
  }

  onStatus(agent, status) {
    if (!agent) return;
    let entry = this.tracked.get(String(agent.session.id));
    if (!entry && status === 'running') entry = this.track(agent);
    if (!entry) return;
    const next = status === 'running' ? 'active' : 'idle';
    try {
      const presence = S.getAgent(entry.root, entry.id);
      if (!presence) return;
      if (next === 'idle' && (presence.status === 'blocked' || presence.status === 'done')) return;
      const updated = S.updateAgent(entry.root, entry.id, { status: next });
      entry.presence = updated;
      if (next === 'idle') this.releaseAutoClaims(entry);
    } catch (error) {
      this.warn(error);
    }
  }

  onDisposed(agent) {
    if (!agent) return;
    const sessionId = String(agent.session.id);
    const entry = this.tracked.get(sessionId);
    if (!entry) return;
    try {
      S.updateAgent(entry.root, entry.id, { status: 'done', lastAction: 'session closed' });
      this.releaseAutoClaims(entry, true, true, 'session closed');
    } catch (error) {
      this.warn(error);
    }
    this.tracked.delete(sessionId);
  }

  onToolResult(exec) {
    if (!exec || !exec.agent) return;
    const entry = this.tracked.get(String(exec.agent.session.id));
    if (!entry) return;
    const tool = String(exec.name || '');
    if (!['write', 'edit', 'multi_edit', 'apply_patch', 'create_file', 'bash', 'run_code', 'read'].includes(tool))
      return;
    let file;
    const args = exec.arguments;
    if (isObject(args)) {
      if (typeof args.file_path === 'string') file = args.file_path;
      else if (typeof args.path === 'string') file = args.path;
      else if (Array.isArray(args.paths) && typeof args.paths[0] === 'string') file = args.paths[0];
    }
    const previous = this.pendingTouches.get(entry.sessionId);
    if (previous && previous.timer) clearTimeout(previous.timer);
    const item = { tool, file, at: Date.now(), timer: undefined };
    item.timer = setTimeout(() => {
      this.pendingTouches.delete(entry.sessionId);
      try {
        const presence = S.getAgent(entry.root, entry.id);
        if (!presence) return;
        let files = Array.isArray(presence.files) ? presence.files.slice() : [];
        if (file) {
          try {
            const rel = S.normalizeRepoPath(entry.root, file);
            if (rel) files = [rel, ...files.filter((value) => value !== rel)].slice(0, 20);
          } catch {}
        }
        S.updateAgent(entry.root, entry.id, {
          files,
          lastAction: tool + (file ? ' ' + oneLine(file, 100) : ''),
        });
      } catch (error) {
        this.warn(error);
      }
    }, 700);
    if (item.timer.unref) item.timer.unref();
    this.pendingTouches.set(entry.sessionId, item);
  }

  repoRel(entry, raw) {
    const cwd = this.agentCwd(entry.agent);
    const absolute = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(cwd, raw);
    return S.normalizeRepoPath(entry.root, absolute);
  }

  claimDenial(claim, rel) {
    const until = claim.expiresAt ? new Date(claim.expiresAt).toISOString() : 'soon';
    return {
      kind: 'deny',
      reason:
        'Blocked by the dsh-god-view maintenance area: ' +
        rel +
        ' is claimed by ' +
        (claim.agentName || claim.agent) +
        ' (' +
        claim.mode +
        (claim.auto ? ', auto' : '') +
        ') until ' +
        until +
        '. Do not edit it concurrently; wait for the claim to be released or coordinate through the shared focus/claim intent.',
    };
  }

  async beforeTool(exec, next) {
    if (!this.coordinationEnabled()) return next();
    if (this.cfg.claimPolicy === 'off' || this.cfg.claimPolicy === 'advisory') return next();
    if (!exec || !exec.agent || (exec.name !== 'write' && exec.name !== 'edit')) return next();
    const entry = this.tracked.get(String(exec.agent.session.id));
    if (!entry) return next();
    const raw = exec.arguments && exec.arguments.file_path;
    if (typeof raw !== 'string' || raw.length === 0) return next();
    let rel;
    try {
      rel = this.repoRel(entry, raw);
    } catch {
      return next();
    }
    if (!rel) return next();
    let claim;
    try {
      claim = S.getClaim(entry.root, rel);
    } catch {
      return next();
    }
    if (claim && claim.agent !== entry.id) return this.claimDenial(claim, rel);
    if (!claim) {
      if (this.cfg.claimPolicy === 'require') {
        return {
          kind: 'deny',
          reason:
            'Call team_claim(paths=["' +
            rel +
            '"]) before editing it. The repository has a shared maintenance area; the claim is how other agents see your intent.',
        };
      }
      try {
        const result = S.claimPaths(entry.root, entry.id, [rel], {
          auto: true,
          ttlMs: this.cfg.autoClaimTtlMs,
          intent: (entry.presence && entry.presence.focus) || 'auto ' + exec.name + ' ' + rel,
          sessionId: entry.agent && entry.agent.session && entry.agent.session.id,
          sessionTitle: (entry.presence && entry.presence.sessionTitle) || this.sessionTitle(entry.agent),
          reason: 'auto claim for ' + exec.name,
        });
        if (result.conflicts.length > 0) return this.claimDenial(result.conflicts[0], rel);
      } catch (error) {
        this.warn(error);
      }
    }
    return next();
  }

  releaseAutoClaims(entry, quiet = true, all = false, summary = 'turn ended') {
    if (!entry) return;
    if (!all && !this.cfg.releaseAutoOnIdle) return;
    try {
      const claims = S.listClaims(entry.root).filter(
        (claim) => claim.agent === entry.id && (all || claim.auto === true),
      );
      if (claims.length === 0) return;
      S.releasePaths(
        entry.root,
        entry.id,
        claims.map((claim) => claim.path),
        { summary },
      );
    } catch (error) {
      this.warn(error);
    }
  }

  onInboxInserted(agent, message) {
    if (!agent || !message) return;
    let entry = this.tracked.get(String(agent.session.id));
    if (!entry) entry = this.track(agent);
    if (!entry) return;
    if (!this.coordinationEnabled()) return;
    const source = message.source && message.source.kind;
    if (source !== 'user' && source !== 'subagent') return;
    const presence = S.getAgent(entry.root, entry.id);
    if (!presence) return;
    if (presence.focus && presence.focus !== 'starting') return;
    const text = (Array.isArray(message.content) ? message.content : [])
      .filter((block) => block && block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) return;
    const firstSentence = text.split(/[。！？!?]\s*|\.\s+/)[0] || text;
    try {
      S.updateAgent(entry.root, entry.id, { focus: oneLine(firstSentence, 160) });
    } catch (error) {
      this.warn(error);
    }
  }

  heartbeat() {
    if (!this.coordinationEnabled()) return;
    for (const entry of this.tracked.values()) {
      try {
        S.heartbeat(entry.root, entry.id);
        if (this.cfg.claimPolicy !== 'off' && entry.agent.status === 'running') S.renewClaims(entry.root, entry.id);
      } catch (error) {
        this.warn(error);
      }
    }
    this.expire();
  }

  expire() {
    for (const root of this.knownRoots) {
      try {
        S.expireClaims(root);
      } catch (error) {
        this.warn(error);
      }
    }
  }

  prune() {
    if (!this.coordinationEnabled()) return;
    for (const root of this.knownRoots) {
      try {
        S.prune(root);
      } catch (error) {
        this.warn(error);
      }
    }
  }

  promptFor(agent) {
    if (!this.coordinationEnabled()) return '';
    const entry = this.tracked.get(String(agent.session.id));
    if (!entry) return '';
    const root = entry.root;
    const agents = S.listAgents(root, { includeStale: false }).filter(
      (item) => item.id !== entry.id && item.status !== 'done',
    );
    const claims = S.listClaims(root).filter((claim) => claim.agent !== entry.id);
    if (agents.length === 0 && claims.length === 0) return '';
    const lines = [];
    lines.push('## Parallel agent team in ' + basename(root));
    lines.push('Other agents are working in this same repository. Their state is available; never guess it.');
    const shown = agents.slice(0, this.cfg.maxPromptPeers);
    for (const peer of shown) {
      const state = peer.stale ? 'stale' : peer.status;
      const focus = peer.focus || peer.lastAction || '(no focus)';
      lines.push(
        '- ' +
          peer.name +
          ' [' +
          state +
          '] ' +
          oneLine(focus, 160) +
          ' (id=' +
          peer.id +
          ', seen ' +
          ago(peer.heartbeatAt) +
          ' ago)',
      );
    }
    if (agents.length > shown.length) lines.push('- +' + (agents.length - shown.length) + ' more; call team_roster.');
    if (claims.length > 0) {
      const sample = claims
        .slice(0, 6)
        .map((claim) => claim.path + ' (' + claim.agentName + ')')
        .join(', ');
      lines.push(
        '- Files claimed by others: ' + sample + (claims.length > 6 ? ', +' + (claims.length - 6) + ' more' : ''),
      );
    }
    const change = S.listChanges(root, { agent: entry.id, state: 'claimed', limit: 1 })[0];
    if (change)
      lines.push(
        '- Your active change ' + change.id + ': ' + oneLine(change.intent, 160) + ' — ' + change.paths.join(', '),
      );
    const claimRule =
      this.cfg.claimPolicy === 'auto'
        ? 'writes to shared files are auto-claimed for the turn, so a live claim by another agent will block your write'
        : this.cfg.claimPolicy === 'require'
          ? 'call team_claim(paths=[...]) before writing a shared file'
          : 'call team_claim(paths=[...]) before editing shared files when you want to coordinate a lease';
    lines.push(
      'Protocol: announce focus with team_status; ' + claimRule + '; call team_status(status="done") when finished.',
    );
    return lines.join('\n');
  }

  registerTools() {
    const register = (definition) => {
      this.ctx.effect(() => this.ctx.tools.register(definition), 'dsh-god-view: tool ' + definition.name);
    };

    register({
      name: 'team_status',
      description:
        'Announce or update your one-line focus, status, and files on the shared repository board. Call this when you start, change focus, become blocked, or finish. It writes only your own presence row.',
      parameters: objectSchema({
        name: { type: 'string', description: 'Display name. Defaults to your current name.' },
        focus: { type: 'string', description: 'One line describing what you are doing now.' },
        status: {
          type: 'string',
          enum: ['active', 'idle', 'blocked', 'done'],
          description: 'active (working), idle (waiting), blocked (need help), done (finished).',
        },
        plan: { type: 'string', description: 'Optional longer plan or next steps.' },
        files: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional files you are working on; team_claim is what other agents see as a lease.',
        },
      }),
      output: { schema: OUTPUT_SCHEMA, render: renderText },
      execute: (args, exec) => {
        if (!this.coordinationEnabled()) return textOutput(COORDINATION_OFF);
        const entry = this.ensureTracked(exec.agent);
        const patch = {};
        const name = optString(args, 'name', 80);
        const focus = optString(args, 'focus', 500);
        const plan = optString(args, 'plan', 4000);
        const status = optString(args, 'status', 20);
        const files = optStringArray(args, 'files', 30);
        if (status !== undefined && !['active', 'idle', 'blocked', 'done'].includes(status))
          throw new Error('status must be active, idle, blocked, or done');
        if (name !== undefined) patch.name = name;
        if (focus !== undefined) patch.focus = focus;
        if (plan !== undefined) patch.plan = plan;
        if (files !== undefined) patch.files = files;
        if (status !== undefined) patch.status = status;
        const updated = S.updateAgent(entry.root, entry.id, patch);
        entry.presence = updated;
        if (status === 'done') {
          this.releaseAutoClaims(entry, true, true, 'status done');
        }
        const others = S.listAgents(entry.root, { includeStale: false }).filter(
          (item) => item.id !== entry.id && item.status !== 'done',
        );
        const claims = S.listClaims(entry.root).filter((claim) => claim.agent !== entry.id);
        const lines = [
          'You are ' +
            updated.name +
            ' (' +
            updated.id +
            ') in ' +
            entry.root +
            ' - ' +
            updated.status +
            (updated.focus ? ': ' + updated.focus : '') +
            '.',
          'Active peers: ' +
            (others.length
              ? others.map((item) => item.name + ' [' + item.status + '] ' + (item.focus || 'no focus')).join('; ')
              : 'none') +
            '.',
        ];
        if (claims.length)
          lines.push(
            'Files claimed by others: ' + claims.map((claim) => claim.path + ' (' + claim.agentName + ')').join(', '),
          );
        return textOutput(lines.join('\n'));
      },
    });

    register({
      name: 'team_roster',
      description:
        'Read the shared repository board: active agents and their one-line focus, file leases, and active/recent changes. Call this before starting work or when coordination is unclear. It never guesses.',
      parameters: objectSchema({
        include_stale: {
          type: 'boolean',
          description: 'Include agents whose heartbeat is older than the TTL. Default false.',
        },
      }),
      output: { schema: OUTPUT_SCHEMA, render: renderText },
      execute: (args, exec) => {
        if (!this.coordinationEnabled()) return textOutput(COORDINATION_OFF);
        const entry = this.ensureTracked(exec.agent);
        const includeStale = optBool(args, 'include_stale') === true;
        const agents = S.listAgents(entry.root, { includeStale });
        const claims = S.listClaims(entry.root);
        const lines = ['# Parallel team - ' + basename(entry.root) + ' (' + entry.root + ')'];
        lines.push(
          'Agents: ' +
            agents.length +
            ' total, ' +
            agents.filter((item) => !item.stale && item.status !== 'done').length +
            ' active-ish.',
        );
        for (const agent of agents) {
          const state = agent.stale ? 'stale' : agent.status;
          lines.push(
            '- ' +
              agent.name +
              ' [' +
              state +
              '] id=' +
              agent.id +
              ' - ' +
              oneLine(agent.focus || agent.lastAction || 'no focus', 220) +
              ' (seen ' +
              ago(agent.heartbeatAt) +
              ' ago' +
              (agent.branch ? ', branch ' + agent.branch : '') +
              ')',
          );
        }
        if (claims.length) {
          lines.push('Claims:');
          for (const claim of claims)
            lines.push(
              '- ' +
                claim.path +
                ' - ' +
                claim.agentName +
                ' (' +
                claim.mode +
                ', ' +
                Math.ceil(claim.remainingMs / 60000) +
                'm left)',
            );
        }
        const activeChanges = S.listChanges(entry.root, { state: 'claimed', limit: 10 });
        if (activeChanges.length) {
          lines.push('Active changes:');
          for (const change of activeChanges) {
            lines.push(
              '- [' +
                change.agentName +
                '] ' +
                oneLine(change.intent, 160) +
                ' - ' +
                change.paths.join(', ') +
                ' (session ' +
                String(change.sessionId || 'cli').slice(0, 8) +
                ')',
            );
          }
        }
        const recentChanges = S.listChanges(entry.root, { limit: 12 })
          .filter((change) => change.state !== 'claimed')
          .slice(0, 6);
        if (recentChanges.length) {
          lines.push('Recent changes:');
          for (const change of recentChanges) {
            lines.push(
              '- [' +
                change.state +
                '] ' +
                change.agentName +
                ': ' +
                oneLine(change.intent, 140) +
                ' - ' +
                change.paths.join(', ') +
                (change.summary ? ' (' + change.summary + ')' : ''),
            );
          }
        }
        return textOutput(lines.join('\n'));
      },
    });

    register({
      name: 'team_claim',
      description:
        'Coordinate file edits with other agents. Each claim is linked to the current conversation and records what is being changed, so the board can show which session is changing which file. Writes are auto-claimed for the turn by default; use this tool to reserve files for a plan, take a review lease, or release a lease early. Release marks the change done on the board.',
      parameters: objectSchema(
        {
          action: {
            type: 'string',
            enum: ['claim', 'release', 'list'],
            description: 'Claim paths, release paths, or list active claims.',
          },
          paths: {
            type: 'array',
            items: { type: 'string' },
            description: 'Repository-relative paths (or absolute paths inside the repo).',
          },
          mode: { type: 'string', enum: ['edit', 'review'], description: 'Claim mode. Default edit.' },
          reason: { type: 'string', description: 'What change this is (intent) or the release summary.' },
          ttl_minutes: { type: 'integer', description: 'Claim lifetime in minutes (1-240). Default 30.' },
        },
        ['action'],
      ),
      output: { schema: OUTPUT_SCHEMA, render: renderText },
      execute: (args, exec) => {
        if (!this.coordinationEnabled()) return textOutput(COORDINATION_OFF);
        const entry = this.ensureTracked(exec.agent);
        const action = reqString(args, 'action', 20);
        const paths = optStringArray(args, 'paths', 100) || [];
        const relPaths = paths.map((value) => {
          try {
            return this.repoRel(entry, value);
          } catch {
            return value;
          }
        });
        if (action === 'list') {
          const claims = S.listClaims(entry.root);
          if (claims.length === 0) return textOutput('No active file claims.');
          return textOutput(
            ['Active file claims:']
              .concat(
                claims.map(
                  (claim) =>
                    '- ' +
                    claim.path +
                    ' - ' +
                    claim.agentName +
                    ' (' +
                    claim.mode +
                    ', ' +
                    Math.ceil(claim.remainingMs / 60000) +
                    'm left)',
                ),
              )
              .join('\n'),
          );
        }
        if (action !== 'claim' && action !== 'release') throw new Error('action must be claim, release, or list');
        if (paths.length === 0) throw new Error('paths must contain at least one path');
        const ttlMinutes = optInt(args, 'ttl_minutes', 1, 240);
        if (action === 'release') {
          const result = S.releasePaths(entry.root, entry.id, relPaths, {
            summary: optString(args, 'reason', 500) || 'released',
          });
          const lines = [];
          for (const claim of result.released) lines.push('Released ' + claim.path + '.');
          for (const claim of result.denied)
            lines.push('Cannot release ' + claim.path + ': held by ' + claim.agentName + '.');
          if (lines.length === 0) lines.push('Nothing was released.');
          return textOutput(lines.join('\n'));
        }
        const reason = optString(args, 'reason', 500);
        const result = S.claimPaths(entry.root, entry.id, relPaths, {
          mode: optString(args, 'mode', 20),
          intent: reason || (entry.presence && entry.presence.focus) || 'claim',
          sessionId: entry.agent && entry.agent.session && entry.agent.session.id,
          sessionTitle: (entry.presence && entry.presence.sessionTitle) || this.sessionTitle(entry.agent),
          reason,
          ttlMs: ttlMinutes ? ttlMinutes * 60_000 : undefined,
        });
        const lines = [];
        for (const claim of result.claimed)
          lines.push(
            'Claimed ' +
              claim.path +
              ' (' +
              claim.mode +
              ', expires in ' +
              Math.ceil((claim.expiresAt - Date.now()) / 60000) +
              'm).',
          );
        if (result.change)
          lines.push(
            'Change ' +
              result.change.id +
              ' [' +
              result.change.state +
              ']: ' +
              result.change.intent +
              ' — ' +
              result.change.paths.join(', '),
          );
        for (const claim of result.conflicts)
          lines.push(
            'CONFLICT ' +
              claim.path +
              ' is already claimed by ' +
              claim.agentName +
              ' until ' +
              new Date(claim.expiresAt).toISOString() +
              '. Wait for the release before editing.',
          );
        if (result.claimed.length === 0 && result.conflicts.length === 0) lines.push('No paths changed.');
        return textOutput(lines.join('\n'));
      },
    });
  }

  registerHttp() {
    try {
      this.ctx.inject(['webServer'], (scoped) => {
        try {
          const web = scoped.webServer || (scoped.get && scoped.get('webServer'));
          if (!web) return;
          this.webHost = web.host;
          scoped.effect(
            () =>
              web.register({
                kind: 'prefix',
                path: this.cfg.route,
                handler: (req, res) => this.handleHttp(req, res),
              }),
            'dsh-god-view: http-api',
          );
          this.disposers.push(() => {
            this.webHost = '';
          });
        } catch (error) {
          this.warn(error);
        }
      });
    } catch (error) {
      this.warn(error);
    }
  }

  trusted(req) {
    const hostHeader = req.headers && req.headers.host;
    if (!hostHeader) return false;
    let hostUrl;
    try {
      hostUrl = new URL('http://' + hostHeader);
    } catch {
      return false;
    }
    const hostname = hostUrl.hostname.replace(/^\[|\]$/g, '');
    const loopback =
      hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1' || hostname === '0:0:0:0:0:0:0:1';
    const configured = this.webHost && (hostname === this.webHost || hostHeader === this.webHost);
    if (!loopback && !configured) return false;
    const origin = req.headers.origin;
    if (origin) {
      try {
        const originUrl = new URL(origin);
        if (originUrl.host !== hostUrl.host) return false;
      } catch {
        return false;
      }
    }
    if (String(req.headers['sec-fetch-site'] || '').toLowerCase() === 'cross-site') return false;
    return true;
  }

  handleHttp(req, res) {
    if (!this.trusted(req)) {
      this.sendJson(res, 403, { error: 'forbidden: untrusted Host/Origin' });
      return;
    }
    const url = new URL(req.url || '/', 'http://localhost');
    if (!url.pathname.startsWith(this.cfg.route)) {
      this.sendJson(res, 404, { error: 'not found' });
      return;
    }
    const route = url.pathname.slice(this.cfg.route.length) || '/';
    if (req.method === 'GET' && route === '/projects') {
      try {
        const registered = S.listRegisteredProjects(this.cfg.registryDir);
        const seen = new Map(registered.map((project) => [project.root, project.lastSeenAt || 0]));
        const roots = new Set([...this.knownRoots, ...registered.map((project) => project.root)]);
        const projects = [...roots]
          .map((root) => {
            const summary = S.projectSummary(root);
            if (!summary) return null;
            summary.lastSeenAt = seen.get(root) || 0;
            return summary;
          })
          .filter(Boolean)
          .sort((a, b) => (b.lastActivityAt || b.lastSeenAt) - (a.lastActivityAt || a.lastSeenAt));
        this.sendJson(res, 200, { currentRoot: this.currentRoot || '', route: this.cfg.route, projects });
      } catch (error) {
        this.sendJson(res, 400, { error: error && error.message ? error.message : String(error) });
      }
      return;
    }
    if (req.method === 'GET' && (route === '/' || route === '/state')) {
      try {
        const root = this.requestRoot(url);
        const snap = S.snapshot(root);
        this.sendJson(res, 200, {
          ...snap,
          coordination: this.coordinationStatus(),
          rootSource: this.cfg.root ? 'config' : this.currentRoot === root ? 'session' : 'query',
          knownRoots: [...this.knownRoots],
          hostPid: process.pid,
          hostname: os.hostname(),
          cliPath: CLI_PATH,
          route: this.cfg.route,
        });
      } catch (error) {
        this.sendJson(res, 400, { error: error && error.message ? error.message : String(error) });
      }
      return;
    }
    if (req.method === 'GET' && route === '/coordination') {
      this.sendJson(res, 200, this.coordinationStatus());
      return;
    }
    if (req.method === 'GET' && route === '/health') {
      this.sendJson(res, 200, { ok: true, pid: process.pid, root: this.currentRoot, route: this.cfg.route });
      return;
    }
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      this.sendJson(res, 405, { error: 'method not allowed' });
      return;
    }
    this.readBody(req)
      .then((body) => {
        if (!isObject(body)) throw new Error('body must be a JSON object');
        if (route === '/coordination') {
          if (typeof body.enabled !== 'boolean') throw new Error('enabled must be a boolean');
          this.sendJson(res, 200, { ok: true, ...this.setCoordination(body.enabled) });
          return;
        }
        if (route === '/presence') {
          const root = this.requestRoot(url, body.root);
          const id = reqString(body, 'id', 120);
          const patch = isObject(body.patch) ? body.patch : body;
          const updated = S.updateAgent(root, id, {
            name: typeof patch.name === 'string' ? patch.name : undefined,
            focus: typeof patch.focus === 'string' ? patch.focus : undefined,
            plan: typeof patch.plan === 'string' ? patch.plan : undefined,
            status: typeof patch.status === 'string' ? patch.status : undefined,
          });
          this.sendJson(res, 200, { ok: true, agent: updated });
          return;
        }
        if (route === '/claim' || route === '/release') {
          const root = this.requestRoot(url, body.root);
          const agent = reqString(body, 'agent', 120);
          const paths = optStringArray(body, 'paths', 100) || [];
          if (paths.length === 0) throw new Error('paths must contain at least one path');
          if (route === '/claim') {
            const result = S.claimPaths(root, agent, paths, { mode: body.mode, reason: body.reason });
            this.sendJson(res, 200, { ok: true, ...result });
          } else {
            const result = S.releasePaths(root, agent, paths, { force: body.force === true });
            this.sendJson(res, 200, { ok: true, ...result });
          }
          return;
        }
        this.sendJson(res, 404, { error: 'not found' });
      })
      .catch((error) => {
        this.sendJson(res, 400, { error: error && error.message ? error.message : String(error) });
      });
  }

  requestRoot(url, body) {
    const query = url && url.searchParams ? url.searchParams.get('root') : undefined;
    const requested = (body && typeof body.root === 'string' && body.root) || query;
    if (requested) {
      if (!path.isAbsolute(requested)) throw new Error('root must be an absolute path');
      let stat;
      try {
        stat = fs.statSync(requested);
      } catch {
        throw new Error('root does not exist: ' + requested);
      }
      if (!stat.isDirectory()) throw new Error('root is not a directory: ' + requested);
      const root = S.resolveRepoRoot(requested);
      this.knownRoots.add(root);
      return root;
    }
    if (this.cfg.root) return S.resolveRepoRoot(process.cwd(), this.cfg.root);
    if (this.currentRoot) return this.currentRoot;
    const first = this.tracked.values().next();
    if (!first.done && first.value.root) return first.value.root;
    throw new Error('no repository root configured yet; pass ?root=/absolute/repo or set config.root');
  }

  readBody(req) {
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      req.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_HTTP_BODY) {
          reject(new Error('request body too large'));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => {
        if (chunks.length === 0) {
          resolve({});
          return;
        }
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch {
          reject(new Error('invalid JSON body'));
        }
      });
      req.on('error', reject);
    });
  }

  sendJson(res, status, value) {
    if (res.writableEnded) return;
    const body = JSON.stringify(value);
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(body);
  }
}
