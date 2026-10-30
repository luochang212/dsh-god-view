#!/usr/bin/env node
/**
 * dsh-god-view: dependency-free CLI for the repo-local parallel-agent board.
 *
 * The CLI and the DSH plugin use the same files: presence, claims, changes,
 * and the claim/release timeline.
 */
import process from 'node:process';
import {
  DEFAULT_CLAIM_TTL_MS,
  agentIdForSession,
  claimPaths,
  createAgent,
  ensureStore,
  iso,
  listAgents,
  listClaims,
  listChanges,
  nowMs,
  releasePaths,
  removeAgent,
  resolveRepoRoot,
  snapshot,
  updateAgent,
} from '../lib/store.js';

const BOOL_OPTS = new Set(['json', 'help', 'stale', 'all', 'force']);
const VALUE_OPTS = new Set([
  'repo',
  'root',
  'id',
  'name',
  'role',
  'focus',
  'plan',
  'status',
  'session',
  'paths',
  'path',
  'mode',
  'reason',
  'intent',
  'summary',
  'ttl-minutes',
  'limit',
]);

function parse(argv) {
  const opts = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--') {
      opts._.push(...argv.slice(i + 1));
      break;
    }
    if (!token.startsWith('--')) {
      opts._.push(token);
      continue;
    }
    const body = token.slice(2);
    const eq = body.indexOf('=');
    const key = eq >= 0 ? body.slice(0, eq) : body;
    if (BOOL_OPTS.has(key)) {
      opts[key] = true;
      continue;
    }
    if (!VALUE_OPTS.has(key)) throw new Error('unknown option --' + key);
    const value = eq >= 0 ? body.slice(eq + 1) : argv[++i];
    if (value === undefined) throw new Error('missing value for --' + key);
    if (key === 'paths' || key === 'path') {
      const list = opts.paths || [];
      list.push(value);
      opts.paths = list;
    } else {
      opts[key] = value;
    }
  }
  return opts;
}

function repoRoot(opts) {
  const start = opts.repo || process.env.DSH_PARALLEL_REPO || process.cwd();
  return resolveRepoRoot(start, opts.root || process.env.DSH_PARALLEL_ROOT);
}

function agentId(opts) {
  const id = opts.id || process.env.DSH_PARALLEL_AGENT_ID;
  if (!id) throw new Error('missing --id (or set DSH_PARALLEL_AGENT_ID)');
  return id;
}

function ago(ms) {
  if (!ms) return '-';
  const seconds = Math.max(0, Math.round((nowMs() - ms) / 1000));
  if (seconds < 60) return seconds + 's';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes + 'm';
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return hours + 'h';
  return Math.floor(hours / 24) + 'd';
}

// The wire keeps the state name "done"; the display must not imply a commit.
// A closed session is "ended"; a change whose leases are gone is "released".
function displayAgentStatus(status) {
  return status === 'done' ? 'ended' : status;
}

function displayChangeState(state) {
  return state === 'done' ? 'released' : state;
}

function printAgents(agents) {
  if (agents.length === 0) {
    console.log('No active agents.');
    return;
  }
  for (const agent of agents) {
    const stale = agent.stale ? ' (stale)' : '';
    const dot =
      agent.status === 'active' ? '●' : agent.status === 'blocked' ? '▲' : agent.status === 'done' ? '✓' : '○';
    console.log(
      dot + ' ' + agent.name + '  ' + displayAgentStatus(agent.status) + '  ' + (agent.focus || '(no focus)') + stale,
    );
    console.log('  id=' + agent.id + '  seen=' + ago(agent.heartbeatAt) + ' ago');
  }
}

function commandHelp() {
  console.log(
    [
      'dsh-god-view - minimal repo-local board for parallel agents',
      '',
      'Usage:',
      '  dsh-god-view join   [--name NAME] [--id ID] [--focus TEXT] [--role ROLE]',
      '  dsh-god-view status --id ID [--status active|idle|blocked|done] [--focus TEXT] [--plan TEXT]',
      '  dsh-god-view leave  --id ID',
      '  dsh-god-view list   [--json] [--stale]',
      '  dsh-god-view claim  --id ID --paths FILE [--paths FILE2] [--mode edit|review] [--reason TEXT]',
      '  dsh-god-view release --id ID --paths FILE [--force]',
      '  dsh-god-view claims [--json]',
      '  dsh-god-view changes [--json]',
      '',
      'Global: --repo DIR (defaults cwd) or DSH_PARALLEL_REPO. Agent id: --id or DSH_PARALLEL_AGENT_ID.',
      'Presence is a one-line focus. Claims are leases; changes keep a claim/release timeline.',
    ].join('\n'),
  );
}

async function main() {
  const opts = parse(process.argv.slice(2));
  const command = opts._[0] || 'help';
  if (opts.help || command === 'help') {
    commandHelp();
    return;
  }
  const root = repoRoot(opts);

  switch (command) {
    case 'init': {
      const p = ensureStore(root);
      console.log('initialized ' + p.base);
      console.log('repo: ' + p.root);
      break;
    }
    case 'join': {
      const name = opts.name || (process.env.USER ? process.env.USER + '-agent' : 'agent');
      const id = opts.id
        ? opts.id
        : opts.session
          ? agentIdForSession(opts.session)
          : 'agent-' + Math.random().toString(16).slice(2, 8);
      const agent = createAgent(root, {
        id,
        name,
        role: opts.role,
        focus: opts.focus,
        status: 'active',
        cwd: root,
        pid: process.pid,
        sessionId: opts.session,
      });
      console.log('joined as ' + agent.name + ' (' + agent.id + ')');
      console.log('export DSH_PARALLEL_AGENT_ID=' + agent.id);
      console.log('export DSH_PARALLEL_REPO=' + JSON.stringify(root));
      if (opts.json) console.log(JSON.stringify(agent, null, 2));
      break;
    }
    case 'status': {
      const id = agentId(opts);
      const patch = {};
      if (opts.name) patch.name = opts.name;
      if (opts.focus !== undefined) patch.focus = opts.focus;
      if (opts.plan !== undefined) patch.plan = opts.plan;
      if (opts.status) patch.status = opts.status;
      const agent = updateAgent(root, id, patch);
      if (agent.status === 'done') {
        const owned = listClaims(root)
          .filter((claim) => claim.agent === id)
          .map((claim) => claim.path);
        if (owned.length > 0) releasePaths(root, id, owned, { summary: 'status done' });
      }
      console.log(agent.name + ' is ' + displayAgentStatus(agent.status) + (agent.focus ? ': ' + agent.focus : ''));
      if (opts.json) console.log(JSON.stringify(agent, null, 2));
      break;
    }
    case 'leave': {
      const id = agentId(opts);
      const owned = listClaims(root)
        .filter((claim) => claim.agent === id)
        .map((claim) => claim.path);
      if (owned.length > 0) releasePaths(root, id, owned, { summary: 'agent left' });
      const removed = removeAgent(root, id);
      console.log(removed ? 'left ' + id : 'unknown agent ' + id);
      break;
    }
    case 'list': {
      const agents = listAgents(root, { includeStale: opts.stale !== false });
      if (opts.json) {
        console.log(JSON.stringify(snapshot(root), null, 2));
      } else {
        console.log('repo: ' + root);
        printAgents(agents);
        const claims = listClaims(root);
        if (claims.length > 0) {
          console.log('\nFiles in use:');
          for (const claim of claims)
            console.log(
              '  ' +
                claim.path +
                '  ' +
                claim.agentName +
                ' (' +
                claim.mode +
                ', ' +
                Math.ceil(claim.remainingMs / 60000) +
                'm left)',
            );
        }
      }
      break;
    }
    case 'claim': {
      const id = agentId(opts);
      const paths = opts.paths || opts._.slice(1);
      if (paths.length === 0) throw new Error('missing --paths FILE');
      const result = claimPaths(root, id, paths, {
        mode: opts.mode,
        intent: opts.intent || opts.reason,
        reason: opts.reason,
        ttlMs: opts['ttl-minutes'] ? Number(opts['ttl-minutes']) * 60_000 : DEFAULT_CLAIM_TTL_MS,
      });
      if (opts.json) console.log(JSON.stringify(result, null, 2));
      else {
        for (const claim of result.claimed) console.log('claimed ' + claim.path + ' (' + claim.mode + ')');
        for (const claim of result.conflicts)
          console.log('CONFLICT ' + claim.path + ' is held by ' + claim.agentName + ' until ' + iso(claim.expiresAt));
        if (result.change)
          console.log(
            'change ' +
              result.change.id +
              ' [' +
              displayChangeState(result.change.state) +
              '] ' +
              result.change.intent +
              ' - ' +
              result.change.paths.join(', '),
          );
        if (result.claimed.length === 0 && result.conflicts.length === 0) console.log('nothing changed');
      }
      break;
    }
    case 'release': {
      const id = agentId(opts);
      const paths = opts.paths || opts._.slice(1);
      const result = releasePaths(root, id, paths, {
        force: Boolean(opts.force),
        summary: opts.summary || opts.reason || 'released',
      });
      if (opts.json) console.log(JSON.stringify(result, null, 2));
      else {
        for (const claim of result.released) console.log('released ' + claim.path);
        for (const claim of result.denied) console.log('DENIED ' + claim.path + ' is held by ' + claim.agentName);
        if (result.released.length === 0 && result.denied.length === 0) console.log('nothing released');
      }
      break;
    }
    case 'claims': {
      const claims = listClaims(root);
      if (opts.json) console.log(JSON.stringify(claims, null, 2));
      else if (claims.length === 0) console.log('no active claims');
      else
        for (const claim of claims)
          console.log(
            claim.path +
              '  ' +
              claim.agentName +
              ' (' +
              claim.mode +
              ', ' +
              Math.ceil(claim.remainingMs / 60000) +
              'm left)',
          );
      break;
    }
    case 'changes': {
      const all = listChanges(root, { limit: 50 });
      if (opts.json) {
        console.log(JSON.stringify(all, null, 2));
        break;
      }
      const active = all.filter((change) => change.state === 'claimed');
      const recent = all.filter((change) => change.state !== 'claimed').slice(0, 10);
      if (active.length === 0) console.log('No active changes.');
      else {
        console.log('Active changes:');
        for (const change of active)
          console.log(
            '  [' +
              displayChangeState(change.state) +
              '] ' +
              change.agentName +
              '  session=' +
              String(change.sessionId || 'cli').slice(0, 12) +
              '  ' +
              change.intent +
              '  -> ' +
              change.paths.join(', '),
          );
      }
      if (recent.length > 0) {
        console.log('Recent changes:');
        for (const change of recent)
          console.log(
            '  [' +
              displayChangeState(change.state) +
              '] ' +
              change.agentName +
              '  ' +
              change.intent +
              '  -> ' +
              change.paths.join(', ') +
              (change.summary ? '  (' + change.summary + ')' : ''),
          );
      }
      break;
    }
    default:
      throw new Error('unknown command: ' + command);
  }
}

main().catch((error) => {
  console.error('error: ' + (error && error.message ? error.message : String(error)));
  process.exitCode = 1;
});
