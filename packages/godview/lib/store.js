/**
 * godview shared store.
 *
 * Three concepts only:
 *   - presence: who is active and their one-line focus;
 *   - claim: a short file lease, guarded before write/edit;
 *   - change: the session/intent/paths record plus a claim/release timeline.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

export const STORE_DIR = path.join('.dsh', 'parallel');
export const DEFAULT_TTL_MS = 90_000;
export const DEFAULT_CLAIM_TTL_MS = 30 * 60_000;
// A project is still "active" for this long after its last real activity.
// This is deliberately separate from the heartbeat TTL: the TTL only filters a
// dead host, while this window answers "was anyone working here recently?".
export const ACTIVE_WINDOW_MS = 30 * 60_000;

const STATUSES = ['active', 'idle', 'blocked', 'done'];

export function nowMs() {
  return Date.now();
}

export function iso(ms) {
  return new Date(ms).toISOString();
}

export function hash(value) {
  return crypto.createHash('sha1').update(String(value)).digest('hex');
}

export function randomHex(bytes = 4) {
  return crypto.randomBytes(bytes).toString('hex');
}

export function safeId(value) {
  return String(value == null ? '' : value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function agentIdForSession(sessionId) {
  return 'dsh-' + hash(sessionId).slice(0, 10);
}

export function paths(root) {
  const base = path.join(path.resolve(root), STORE_DIR);
  return {
    root: path.resolve(root),
    base,
    agents: path.join(base, 'agents'),
    claims: path.join(base, 'claims'),
    changes: path.join(base, 'changes'),
    config: path.join(base, 'config.json'),
    readme: path.join(base, 'README.md'),
    gitignore: path.join(base, '.gitignore'),
  };
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
}

function writeJsonAtomic(file, value) {
  ensureDir(path.dirname(file));
  const tmp = file + '.' + process.pid + '.' + randomHex(4) + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
    fs.renameSync(tmp, file);
  } catch (error) {
    try {
      fs.unlinkSync(tmp);
    } catch {}
    throw error;
  }
}

function listJson(dir) {
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const out = [];
  for (const name of names) {
    if (!name.endsWith('.json') || name.startsWith('.')) continue;
    const value = readJson(path.join(dir, name));
    if (value !== undefined) out.push(value);
  }
  return out;
}

function isDir(dir) {
  try {
    return fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

function exists(target) {
  try {
    fs.statSync(target);
    return true;
  } catch {
    return false;
  }
}

export function resolveRepoRoot(start, explicit) {
  if (explicit) {
    const resolved = path.resolve(explicit);
    ensureDir(resolved);
    return resolved;
  }
  let current = path.resolve(start || process.cwd());
  const first = current;
  for (let i = 0; i < 30; i++) {
    if (exists(path.join(current, '.git')) || isDir(path.join(current, STORE_DIR))) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return first;
}

export function readBranch(root) {
  try {
    let gitDir = path.join(root, '.git');
    const stat = fs.statSync(gitDir);
    if (stat.isFile()) {
      const text = fs.readFileSync(gitDir, 'utf8');
      const match = /^gitdir:\s*(.+)$/m.exec(text);
      if (!match) return undefined;
      gitDir = path.resolve(root, match[1].trim());
    }
    const head = fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf8').trim();
    if (head.startsWith('ref:'))
      return head
        .slice(4)
        .trim()
        .replace(/^refs\/heads\//, '');
    return head.slice(0, 12);
  } catch {
    return undefined;
  }
}

const STORE_README = [
  '# Parallel team board',
  '',
  'Shared coordination state for agents working in the same repository.',
  'It is created automatically by godview and ignored by git.',
  '',
  'Layout:',
  '- agents/<id>.json    presence, one-line focus, heartbeat',
  '- claims/<hash>.json  short file leases',
  '- changes/<id>.json   session + intent + paths + released state',
  '',
  'Focus is a property. Claims are leases. Changes keep the claim/release',
  'timeline. There is no message queue or chat history here.',
  '',
].join('\n');

const STORE_GITIGNORE = ['*', '!.gitignore', '!README.md', ''].join('\n');

export function ensureStore(root, options = {}) {
  const p = paths(resolveRepoRoot(root));
  if (options.create === false) return p;
  ensureDir(p.base);
  for (const dir of [p.agents, p.claims, p.changes]) ensureDir(dir);
  if (!exists(p.readme)) fs.writeFileSync(p.readme, STORE_README, 'utf8');
  if (!exists(p.gitignore)) fs.writeFileSync(p.gitignore, STORE_GITIGNORE, 'utf8');
  const config = readJson(p.config);
  if (!config) {
    writeJsonAtomic(p.config, {
      createdAt: nowMs(),
      createdAtIso: iso(nowMs()),
      note: 'Repo-local agent coordination board. Safe to delete when no agents are running.',
    });
  }
  return p;
}

export function prune(root, options = {}) {
  const p = paths(root);
  const now = options.now || nowMs();
  const maxAgeMs = options.maxAgeMs || 7 * 24 * 60 * 60_000;
  const removed = { agents: 0, claims: 0, changes: 0, tmp: 0 };
  const sweep = (dir, kind) => {
    let names;
    try {
      names = fs.readdirSync(dir);
    } catch {
      return;
    }
    for (const name of names) {
      if (!name.endsWith('.json')) continue;
      const file = path.join(dir, name);
      try {
        const stat = fs.statSync(file);
        if (now - stat.mtimeMs > maxAgeMs) {
          fs.unlinkSync(file);
          removed[kind]++;
        }
      } catch {}
    }
  };
  sweep(p.claims, 'claims');
  sweep(p.changes, 'changes');
  sweep(p.agents, 'agents');
  for (const dir of [p.base, p.agents, p.claims, p.changes]) {
    let names;
    try {
      names = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (!name.endsWith('.tmp')) continue;
      const file = path.join(dir, name);
      try {
        const stat = fs.statSync(file);
        if (now - stat.mtimeMs > 60 * 60_000) {
          fs.unlinkSync(file);
          removed.tmp++;
        }
      } catch {}
    }
  }
  return removed;
}

export function listAgents(root, options = {}) {
  const p = paths(root);
  const now = options.now || nowMs();
  const ttlMs = options.ttlMs || DEFAULT_TTL_MS;
  const includeStale = options.includeStale !== false;
  const agents = listJson(p.agents).map((agent) => {
    const heartbeatAt = typeof agent.heartbeatAt === 'number' ? agent.heartbeatAt : agent.updatedAt || 0;
    const stale = now - heartbeatAt > (agent.ttlMs || ttlMs);
    return { ...agent, stale, heartbeatAt };
  });
  const filtered = includeStale ? agents : agents.filter((agent) => !agent.stale);
  filtered.sort((a, b) => {
    if (a.stale !== b.stale) return a.stale ? 1 : -1;
    if (a.status !== b.status) {
      const rank = { active: 0, blocked: 1, idle: 2, done: 3 };
      return (rank[a.status] ?? 9) - (rank[b.status] ?? 9);
    }
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });
  return filtered;
}

export function getAgent(root, id) {
  return readJson(path.join(paths(root).agents, safeId(id) + '.json'));
}

export function findAgent(root, ref) {
  if (!ref) return undefined;
  const raw = String(ref).trim();
  const agents = listAgents(root);
  const byId = agents.find((agent) => agent.id === safeId(raw));
  if (byId) return byId;
  const lower = raw.toLowerCase();
  const exact = agents.find((agent) => String(agent.name || '').toLowerCase() === lower);
  if (exact) return exact;
  const prefix = agents.filter(
    (agent) =>
      String(agent.name || '')
        .toLowerCase()
        .startsWith(lower) || agent.id.startsWith(lower),
  );
  if (prefix.length === 1) return prefix[0];
  return undefined;
}

function uniqueName(root, desired, exceptId) {
  const base =
    String(desired || '')
      .trim()
      .slice(0, 80) || 'agent';
  let candidate = base;
  let n = 2;
  const names = new Set(
    listAgents(root)
      .filter((agent) => agent.id !== exceptId)
      .map((agent) => String(agent.name || '').toLowerCase()),
  );
  while (names.has(candidate.toLowerCase())) {
    candidate = base + '-' + n;
    n++;
  }
  return candidate;
}

function normalizeStatus(value, fallback) {
  return STATUSES.includes(value) ? value : fallback;
}

export function createAgent(root, input = {}) {
  const p = ensureStore(root);
  const now = input.now || nowMs();
  const id = safeId(input.id) || 'agent-' + randomHex(4);
  const current = readJson(path.join(p.agents, id + '.json'));
  const name =
    input.name !== undefined ? uniqueName(root, input.name, id) : (current && current.name) || uniqueName(root, id, id);
  const ttlMs = Number(input.ttlMs) > 0 ? Number(input.ttlMs) : DEFAULT_TTL_MS;
  const agent = {
    id,
    name,
    role: input.role || (current && current.role) || 'agent',
    status: normalizeStatus(input.status, (current && current.status) || 'active'),
    focus: input.focus !== undefined ? String(input.focus).slice(0, 500) : (current && current.focus) || '',
    lastAction:
      input.lastAction !== undefined ? String(input.lastAction).slice(0, 200) : (current && current.lastAction) || '',
    plan: input.plan !== undefined ? String(input.plan).slice(0, 4000) : (current && current.plan) || '',
    sessionId: input.sessionId || (current && current.sessionId) || null,
    sessionTitle: input.sessionTitle || (current && current.sessionTitle) || null,
    parentId: input.parentId || (current && current.parentId) || null,
    pid: input.pid || (current && current.pid) || process.pid,
    hostname: input.hostname || (current && current.hostname) || os.hostname(),
    cwd: input.cwd || (current && current.cwd) || p.root,
    branch: input.branch !== undefined ? input.branch : (current && current.branch) || readBranch(p.root),
    files: Array.isArray(input.files) ? input.files.map(String).slice(0, 30) : (current && current.files) || [],
    startedAt: (current && current.startedAt) || now,
    updatedAt: now,
    heartbeatAt: now,
    ttlMs,
    expiresAt: now + ttlMs,
  };
  writeJsonAtomic(path.join(p.agents, id + '.json'), agent);
  return agent;
}

export function updateAgent(root, id, patch = {}) {
  const p = ensureStore(root);
  const current = getAgent(root, id);
  if (!current) throw new Error('unknown agent: ' + id);
  const now = patch.now || nowMs();
  const next = { ...current };
  if (patch.name !== undefined) next.name = uniqueName(root, patch.name, current.id);
  if (patch.focus !== undefined) next.focus = String(patch.focus).slice(0, 500);
  if (patch.lastAction !== undefined) next.lastAction = String(patch.lastAction).slice(0, 200);
  if (patch.plan !== undefined) next.plan = String(patch.plan).slice(0, 4000);
  if (patch.status !== undefined) next.status = normalizeStatus(patch.status, current.status);
  if (patch.role !== undefined) next.role = String(patch.role).slice(0, 80);
  if (patch.sessionTitle !== undefined)
    next.sessionTitle = patch.sessionTitle ? String(patch.sessionTitle).slice(0, 200) : null;
  if (patch.branch !== undefined) next.branch = patch.branch;
  if (patch.files !== undefined) next.files = (Array.isArray(patch.files) ? patch.files : []).map(String).slice(0, 30);
  if (patch.ttlMs !== undefined && Number(patch.ttlMs) > 0) {
    next.ttlMs = Number(patch.ttlMs);
    next.expiresAt = now + next.ttlMs;
  }
  next.updatedAt = now;
  next.heartbeatAt = now;
  // Keep expiresAt in step with the refreshed heartbeat so the field never
  // drifts into the past while the agent is clearly alive.
  next.expiresAt = now + (next.ttlMs || DEFAULT_TTL_MS);
  if (next.status === 'done' && !next.finishedAt) next.finishedAt = now;
  if (next.status !== 'done') delete next.finishedAt;
  writeJsonAtomic(path.join(p.agents, current.id + '.json'), next);
  return next;
}

export function heartbeat(root, id) {
  const p = paths(root);
  const current = getAgent(root, id);
  if (!current) return undefined;
  const now = nowMs();
  const next = { ...current, heartbeatAt: now, expiresAt: now + (current.ttlMs || DEFAULT_TTL_MS) };
  writeJsonAtomic(path.join(p.agents, current.id + '.json'), next);
  return next;
}

export function removeAgent(root, id) {
  const p = paths(root);
  const current = getAgent(root, id);
  if (!current) return false;
  try {
    fs.unlinkSync(path.join(p.agents, current.id + '.json'));
  } catch {
    return false;
  }
  return true;
}

// ---------------------------------------------------------------- claims

export function getClaim(root, rawPath) {
  const p = paths(root);
  let rel;
  try {
    rel = normalizeRepoPath(p.root, rawPath);
  } catch {
    return undefined;
  }
  if (!rel) return undefined;
  const claim = readJson(path.join(p.claims, hash(rel) + '.json'));
  if (!claim) return undefined;
  if ((claim.expiresAt || 0) <= nowMs()) return undefined;
  return claim;
}

export function listClaims(root) {
  const p = paths(root);
  const now = nowMs();
  return listJson(p.claims)
    .filter((claim) => claim && claim.path && (claim.expiresAt || 0) > now)
    .map((claim) => ({ ...claim, remainingMs: Math.max(0, (claim.expiresAt || 0) - now) }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

export function normalizeRepoPath(root, raw) {
  const rootResolved = path.resolve(root);
  let absolute;
  if (path.isAbsolute(String(raw))) absolute = path.resolve(String(raw));
  else absolute = path.resolve(rootResolved, String(raw));
  const rel = path.relative(rootResolved, absolute);
  if (!rel || rel === '.') return '';
  if (rel.startsWith('..' + path.sep) || rel === '..' || path.isAbsolute(rel)) {
    throw new Error('path is outside the repository: ' + raw);
  }
  return rel.split(path.sep).join('/');
}

function changeFile(root, id) {
  return path.join(paths(root).changes, safeId(id) + '.json');
}

export function getChange(root, id) {
  return readJson(changeFile(root, id));
}

export function listChanges(root, options = {}) {
  const limit = Math.max(0, Math.min(200, Number(options.limit) || 50));
  let changes = listJson(paths(root).changes);
  if (options.state) changes = changes.filter((change) => change.state === options.state);
  if (options.agent) changes = changes.filter((change) => change.agent === options.agent);
  changes.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return changes.slice(0, limit).map((change) => {
    if (Array.isArray(change.timeline) && change.timeline.length > 0) return change;
    const timeline = [
      {
        type: 'claim',
        at: change.createdAt,
        agent: change.agent,
        agentName: change.agentName,
        paths: change.paths,
        intent: change.intent,
      },
    ];
    if (change.state !== 'claimed' && change.releasedAt) {
      timeline.push({
        type: change.state === 'expired' ? 'expire' : 'release',
        at: change.releasedAt,
        agent: change.agent,
        agentName: change.agentName,
        paths: change.paths,
        summary: change.summary,
      });
    }
    return { ...change, timeline };
  });
}

export function activeChange(root, agentId) {
  return listChanges(root, { agent: agentId, state: 'claimed', limit: 1 })[0];
}

/**
 * Lease files still on disk for a change, without filtering by expiry. An
 * expired-but-unswept lease is still physically held and gets its own expire
 * event on the next sweep, so it must count as remaining until then; counting
 * only live leases would close the change prematurely and flip its state.
 */
function remainingLeaseFiles(root, changeId) {
  return listJson(paths(root).claims).filter((claim) => claim && claim.changeId === changeId);
}

/**
 * Bookkeeping when an expired lease leaves the board: append an expire event to
 * its change and finish the change when nothing is left. The caller must have
 * removed the lease file successfully (unlink decides who records), so this
 * only edits the change.
 */
function recordExpire(root, claim, now) {
  if (!claim.changeId) return;
  const change = getChange(root, claim.changeId);
  if (!change) return;
  const remaining = remainingLeaseFiles(root, claim.changeId);
  change.updatedAt = now;
  change.timeline = Array.isArray(change.timeline) ? change.timeline : [];
  change.timeline.push({
    type: 'expire',
    at: now,
    agent: claim.agent,
    agentName: claim.agentName,
    path: claim.path,
    summary: 'lease expired',
  });
  change.timeline = change.timeline.slice(-200);
  if (remaining.length === 0 && change.state === 'claimed') {
    change.state = 'expired';
    change.releasedAt = now;
    change.summary = 'lease expired';
  }
  writeJsonAtomic(changeFile(root, claim.changeId), change);
}

/**
 * Create a lease file exclusively. Returns true when this process created
 * the file; otherwise returns the claim another process put there (or
 * undefined when the file exists but cannot be read).
 */
function createLeaseFile(file, next) {
  let fd;
  try {
    fd = fs.openSync(file, 'wx', 0o600);
  } catch (error) {
    if (error && error.code === 'EEXIST') return readJson(file);
    throw error;
  }
  try {
    fs.writeFileSync(fd, JSON.stringify(next, null, 2) + '\n');
  } finally {
    try {
      fs.closeSync(fd);
    } catch {}
  }
  return true;
}

export function claimPaths(root, agentId, rawPaths, options = {}) {
  const p = ensureStore(root);
  const agent = getAgent(root, agentId);
  if (!agent) throw new Error('unknown agent: ' + agentId);
  const now = options.now || nowMs();
  const ttlMs = Math.max(60_000, Math.min(4 * 60 * 60_000, Number(options.ttlMs) || DEFAULT_CLAIM_TTL_MS));
  const mode = options.mode === 'review' ? 'review' : 'edit';
  const intent = String(options.intent || options.reason || agent.focus || 'edit').slice(0, 500);
  const sessionId = options.sessionId || agent.sessionId || null;
  const sessionTitle = options.sessionTitle || agent.sessionTitle || null;
  const claimed = [];
  const conflicts = [];
  let change = options.changeId ? getChange(p.root, options.changeId) : activeChange(p.root, agent.id);
  let createdChange = false;
  if (!change) {
    change = {
      id: 'ch-' + now.toString(36) + '-' + randomHex(4),
      agent: agent.id,
      agentName: agent.name,
      sessionId,
      sessionTitle,
      intent,
      paths: [],
      state: 'claimed',
      auto: options.auto === true,
      createdAt: now,
      updatedAt: now,
    };
    createdChange = true;
  } else {
    if (options.intent && (options.auto !== true || !change.intent)) change.intent = intent;
    if (sessionId) change.sessionId = sessionId;
    if (sessionTitle) change.sessionTitle = sessionTitle;
    change.updatedAt = now;
    change.auto = change.auto === true || options.auto === true;
  }
  for (const raw of rawPaths || []) {
    const rel = normalizeRepoPath(p.root, raw);
    if (!rel) continue;
    const file = path.join(p.claims, hash(rel) + '.json');
    const next = {
      path: rel,
      agent: agent.id,
      agentName: agent.name,
      changeId: change.id,
      sessionId,
      sessionTitle,
      mode,
      auto: options.auto === true,
      intent,
      reason: intent,
      createdAt: now,
      ttlMs,
      expiresAt: now + ttlMs,
    };
    let existing = readJson(file);
    if (existing && (existing.expiresAt || 0) > now && existing.agent !== agent.id) {
      conflicts.push(existing);
      continue;
    }
    if (existing && existing.agent === agent.id) {
      next.createdAt = existing.createdAt || now;
      writeJsonAtomic(file, next);
      claimed.push(next);
      continue;
    }
    // No lease yet, or an expired one held by someone else. Take the lease
    // through an exclusive create: when two agents race for the same expired
    // lease, only the process whose create succeeds owns it, and the loser
    // re-reads the winner's live claim and records a conflict instead of
    // silently overwriting the file (which would leave the loser's change
    // open forever with no lease pointing at it).
    // Only cross-agent takeovers are recorded: a lease re-claimed by its own
    // agent is a renewal and keeps its original createdAt. Unlink success
    // decides who records the previous owner's expiry, so concurrent claimers
    // cannot double-record it.
    const stale = readJson(file);
    if (stale && (stale.expiresAt || 0) <= now && stale.agent !== agent.id) {
      try {
        fs.unlinkSync(file);
        if (stale.changeId) recordExpire(p.root, stale, now);
      } catch {}
    }
    const taken = createLeaseFile(file, next);
    if (taken === true) {
      claimed.push(next);
    } else if (taken && taken.agent !== agent.id && (taken.expiresAt || 0) > now) {
      conflicts.push(taken);
    } else {
      // The winner is our own lease (a renewal raced with us) or the file is
      // unreadable; fall back to an atomic rewrite, as a single writer would.
      next.createdAt = (taken && taken.createdAt) || now;
      writeJsonAtomic(file, next);
      claimed.push(next);
    }
  }
  if (claimed.length === 0) {
    if (createdChange) {
      try {
        fs.unlinkSync(changeFile(p.root, change.id));
      } catch {}
    }
    return { claimed, conflicts, claims: listClaims(p.root), change: null };
  }
  change.paths = [
    ...new Set([...(Array.isArray(change.paths) ? change.paths : []), ...claimed.map((claim) => claim.path)]),
  ].slice(0, 100);
  change.timeline = Array.isArray(change.timeline) ? change.timeline : [];
  for (const claim of claimed) {
    change.timeline.push({
      type: 'claim',
      at: now,
      agent: agent.id,
      agentName: agent.name,
      path: claim.path,
      intent: claim.intent,
      auto: claim.auto,
    });
  }
  change.timeline = change.timeline.slice(-200);
  change.updatedAt = now;
  writeJsonAtomic(changeFile(p.root, change.id), change);
  try {
    const current = getAgent(p.root, agent.id);
    if (current) {
      const files = [...claimed.map((claim) => claim.path), ...(Array.isArray(current.files) ? current.files : [])]
        .filter((value, index, all) => value && all.indexOf(value) === index)
        .slice(0, 30);
      updateAgent(p.root, agent.id, { files });
    }
  } catch {}
  return { claimed, conflicts, claims: listClaims(p.root), change };
}

export function releasePaths(root, agentId, rawPaths, options = {}) {
  const p = ensureStore(root);
  const agent = getAgent(root, agentId);
  if (!agent) throw new Error('unknown agent: ' + agentId);
  const now = options.now || nowMs();
  const summary = String(options.summary || 'released').slice(0, 500);
  const released = [];
  const denied = [];
  for (const raw of rawPaths || []) {
    const rel = normalizeRepoPath(p.root, raw);
    if (!rel) continue;
    const file = path.join(p.claims, hash(rel) + '.json');
    const claim = readJson(file);
    if (!claim) continue;
    if (claim.agent !== agent.id && !options.force) {
      denied.push(claim);
      continue;
    }
    try {
      fs.unlinkSync(file);
      released.push(claim);
    } catch {}
  }
  const touched = new Set(released.map((claim) => claim.changeId).filter(Boolean));
  for (const id of touched) {
    const change = getChange(p.root, id);
    if (!change) continue;
    const remaining = remainingLeaseFiles(p.root, id);
    change.updatedAt = now;
    change.paths = [
      ...new Set([
        ...(Array.isArray(change.paths) ? change.paths : []),
        ...released.filter((claim) => claim.changeId === id).map((claim) => claim.path),
        ...remaining.map((claim) => claim.path),
      ]),
    ].slice(0, 100);
    change.timeline = Array.isArray(change.timeline) ? change.timeline : [];
    for (const claim of released.filter((item) => item.changeId === id)) {
      change.timeline.push({
        type: 'release',
        at: now,
        agent: claim.agent,
        agentName: options.actorName || agent.name,
        path: claim.path,
        summary,
      });
    }
    change.timeline = change.timeline.slice(-200);
    if (remaining.length === 0 && change.state === 'claimed') {
      change.state = 'done';
      change.releasedAt = now;
      change.summary = summary;
    }
    writeJsonAtomic(changeFile(p.root, id), change);
  }
  return { released, denied, claims: listClaims(p.root) };
}

export function expireClaims(root, options = {}) {
  const p = paths(root);
  const now = options.now || nowMs();
  const touched = new Set();
  let count = 0;
  const expiredByChange = new Map();
  for (const claim of listJson(p.claims)) {
    if (!claim || !claim.path) continue;
    if ((claim.expiresAt || 0) > now) continue;
    // Only the process whose unlink succeeds records the expiry, so
    // concurrent hosts sweeping the same batch cannot double-record events.
    try {
      fs.unlinkSync(path.join(p.claims, hash(claim.path) + '.json'));
    } catch {
      continue;
    }
    if (claim.changeId) {
      touched.add(claim.changeId);
      const list = expiredByChange.get(claim.changeId) || [];
      list.push(claim);
      expiredByChange.set(claim.changeId, list);
    }
    count++;
  }
  for (const id of touched) {
    const change = getChange(p.root, id);
    if (!change) continue;
    const remaining = remainingLeaseFiles(p.root, id);
    change.updatedAt = now;
    change.timeline = Array.isArray(change.timeline) ? change.timeline : [];
    for (const claim of expiredByChange.get(id) || []) {
      change.timeline.push({
        type: 'expire',
        at: now,
        agent: claim.agent,
        agentName: claim.agentName,
        path: claim.path,
        summary: 'lease expired',
      });
    }
    change.timeline = change.timeline.slice(-200);
    if (remaining.length === 0 && change.state === 'claimed') {
      change.state = 'expired';
      change.releasedAt = now;
      change.summary = 'lease expired';
    }
    writeJsonAtomic(changeFile(p.root, id), change);
  }
  return count;
}

export function renewClaims(root, agentId, options = {}) {
  const p = paths(root);
  const now = options.now || nowMs();
  let count = 0;
  for (const claim of listJson(p.claims)) {
    if (!claim || !claim.path || claim.agent !== agentId) continue;
    if (options.autoOnly && !claim.auto) continue;
    if ((claim.expiresAt || 0) <= now) continue;
    const duration = Number(claim.ttlMs) > 0 ? Number(claim.ttlMs) : DEFAULT_CLAIM_TTL_MS;
    const ttl = Math.min(4 * 60 * 60_000, Number(options.ttlMs) || duration);
    writeJsonAtomic(path.join(p.claims, hash(claim.path) + '.json'), {
      ...claim,
      expiresAt: now + ttl,
      renewedAt: now,
    });
    count++;
  }
  return count;
}

export function registryFile(registryDir) {
  return path.join(registryDir, 'projects.json');
}

export function registerProject(registryDir, entry) {
  if (!entry || !entry.root) return;
  const file = registryFile(registryDir);
  ensureDir(registryDir);
  let projects = [];
  try {
    const current = readJson(file);
    if (current && Array.isArray(current.projects)) projects = current.projects;
  } catch {}
  const root = path.resolve(entry.root);
  const next = { root, name: entry.name || path.basename(root), lastSeenAt: entry.lastSeenAt || nowMs() };
  const index = projects.findIndex((project) => project.root === root);
  if (index >= 0) projects[index] = { ...projects[index], ...next };
  else projects.push(next);
  projects = projects.slice(-200);
  writeJsonAtomic(file, { projects });
}

export function coordinationFile(registryDir) {
  return path.join(registryDir, 'state.json');
}

/**
 * Global coordination switch. Default is on: the plugin records leases and
 * guards writes until a human turns it off. Missing or unreadable state reads
 * as on; only an explicit `enabled: false` turns it off.
 */
export function readCoordination(registryDir) {
  const state = readJson(coordinationFile(registryDir));
  return {
    enabled: !(state && state.enabled === false),
    updatedAt: (state && Number(state.updatedAt)) || 0,
  };
}

export function writeCoordination(registryDir, enabled, options = {}) {
  const now = options.now || nowMs();
  ensureDir(registryDir);
  writeJsonAtomic(coordinationFile(registryDir), {
    enabled: enabled === true,
    updatedAt: now,
    updatedAtIso: iso(now),
  });
  return { enabled: enabled === true, updatedAt: now };
}

export function listRegisteredProjects(registryDir) {
  try {
    const current = readJson(registryFile(registryDir));
    return current && Array.isArray(current.projects) ? current.projects : [];
  } catch {
    return [];
  }
}

export function projectSummary(root) {
  try {
    const snap = snapshot(root, { changeLimit: 30, create: false });
    const now = nowMs();
    const liveAgents = snap.agents.filter((agent) => !agent.stale && agent.status !== 'done');
    const working = liveAgents.filter((agent) => agent.status === 'active').length;
    const blocked = liveAgents.filter((agent) => agent.status === 'blocked').length;
    // Activity is what the conversation did, not that its host is still running:
    // updatedAt moves on prompts, turn changes, tool results, and team_status,
    // while the heartbeat does not. A session left open for hours must not look
    // recently active just because its process still beats.
    let lastActivityAt = 0;
    for (const agent of liveAgents) lastActivityAt = Math.max(lastActivityAt, agent.updatedAt || 0);
    for (const claim of snap.claims) lastActivityAt = Math.max(lastActivityAt, claim.updatedAt || claim.createdAt || 0);
    for (const change of snap.changes) lastActivityAt = Math.max(lastActivityAt, change.updatedAt || 0);
    const recent = lastActivityAt > 0 && now - lastActivityAt <= ACTIVE_WINDOW_MS;
    const latest = snap.changes[0];
    return {
      root: snap.root,
      name: path.basename(snap.root),
      agents: snap.stats.agents,
      active: snap.stats.active,
      working,
      blocked,
      claims: snap.stats.claims,
      changes: snap.stats.changes,
      lastActivityAt,
      status: working > 0 || blocked > 0 ? 'active' : snap.stats.claims > 0 ? 'claimed' : recent ? 'active' : 'idle',
      lastSummary: latest ? latest.intent || latest.summary || '' : '',
    };
  } catch {
    return null;
  }
}

export function snapshot(root, options = {}) {
  const p = ensureStore(root, { create: options.create === true });
  const claims = listClaims(p.root);
  const changes = listChanges(p.root, { limit: options.changeLimit || 30 });
  const activeChanges = changes.filter((change) => change.state === 'claimed');
  const agents = listAgents(p.root, { includeStale: true }).map((agent) => ({
    ...agent,
    activeChanges: changes.filter((change) => change.agent === agent.id && change.state === 'claimed').length,
  }));
  const active = agents.filter((agent) => !agent.stale && agent.status !== 'done');
  const stats = {
    agents: agents.length,
    active: active.length,
    working: active.filter((agent) => agent.status === 'active').length,
    blocked: active.filter((agent) => agent.status === 'blocked').length,
    claims: claims.length,
    changes: activeChanges.length,
  };
  return {
    root: p.root,
    store: p.base,
    generatedAt: nowMs(),
    generatedAtIso: iso(nowMs()),
    stats,
    agents,
    claims,
    changes,
  };
}
