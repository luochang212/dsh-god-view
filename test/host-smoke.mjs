import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { apply } from '../lib/index.js';
import * as S from '../lib/store.js';

const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-host-'));
fs.mkdirSync(path.join(repo, '.git'));
fs.writeFileSync(path.join(repo, '.git', 'HEAD'), 'ref: refs/heads/main\n');
const second = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-host2-'));
fs.mkdirSync(path.join(second, '.git'));
fs.writeFileSync(path.join(second, '.git', 'HEAD'), 'ref: refs/heads/main\n');
const registry = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-reg-'));

const handlers = new Map();
const tools = new Map();
let httpHandler;
const webServer = {
  host: '127.0.0.1',
  register(route) {
    httpHandler = route.handler;
    return () => {
      httpHandler = undefined;
    };
  },
};
const ctx = {
  tools: {
    register(definition) {
      tools.set(definition.name, definition);
      return () => tools.delete(definition.name);
    },
  },
  effect(fn) {
    return fn();
  },
  on(event, listener) {
    const list = handlers.get(event) || [];
    list.push(listener);
    handlers.set(event, list);
    return () => {};
  },
  get(name) {
    return name === 'webServer' ? webServer : name === 'agents' ? { list: () => [] } : undefined;
  },
  inject(deps, callback) {
    callback(ctx);
  },
};

apply(ctx, { root: repo, registryDir: registry, heartbeatMs: 60_000, prompt: true });

function emit(event, payload) {
  for (const listener of handlers.get(event) || []) listener(payload);
}

function makeAgent(id) {
  const promptContexts = [];
  return {
    promptContexts,
    session: { id, header: { cwd: repo } },
    status: 'idle',
    ctx: {
      get(name) {
        if (name !== 'systemPrompt') return undefined;
        return {
          context(entry) {
            promptContexts.push(entry);
            return () => {};
          },
        };
      },
      effect(fn) {
        return fn();
      },
    },
    inject() {},
    followup() {},
  };
}
const alice = makeAgent('session-alice-123456');
const bob = makeAgent('session-bob-654321');
const aliceId = S.agentIdForSession('session-alice-123456');
const bobId = S.agentIdForSession('session-bob-654321');

// Default is on. A human turns it off from the panel switch; the off path below
// is exercised explicitly so it keeps its assertions.
assert.equal(S.readCoordination(registry).enabled, true, 'coordination is on by default');
assert.equal(tools.size, 3, 'a host that starts coordinated registers the team tools');
const liveStatusTool = tools.get('team_status');
S.writeCoordination(registry, false);

// Switched off: the host keeps sessions in memory, writes nothing, blocks nothing,
// and removes the team tools from the model's catalog.
// 'agent/status' running is a real track attempt (there is no 'agent/created'
// listener), so these assertions exercise the dormant path, not a no-op emit.
emit('agent/status', { agent: alice, status: 'running' });
assert.equal(fs.existsSync(path.join(repo, '.dsh')), false, 'a dormant host writes no board');
assert.equal(tools.size, 0, 'a dormant host registers no team tools');
// A call admitted before the switch flipped still gets the off notice.
let offOut = await liveStatusTool.execute({ focus: 'dormant' }, { agent: alice });
assert.match(offOut.text, /Coordination is off/);
const pre = handlers.get('tools/pre-execute')[0];
assert.ok(pre, 'pre-execute guard registered');
const offDecision = await pre({ name: 'write', agent: alice, arguments: { file_path: 'src/off.ts' } }, async () => ({
  kind: 'allow',
}));
assert.equal(offDecision.kind, 'allow', 'a dormant host does not block writes');
assert.equal(S.getClaim(repo, 'src/off.ts'), undefined, 'a dormant host records no lease');
assert.equal(fs.existsSync(path.join(repo, '.dsh')), false, 'a dormant host writes no board while working');

// Turn coordination on; the next coordination check re-registers the tools.
S.writeCoordination(registry, true);
emit('agent/inbox/inserted', {
  agent: alice,
  message: { source: { kind: 'user' }, content: [{ type: 'text', text: 'back on' }] },
});
assert.equal(tools.size, 3, 'turning coordination on restores the team tools');
emit('agent/status', { agent: alice, status: 'running' });
emit('agent/status', { agent: bob, status: 'running' });

const status = tools.get('team_status');
const roster = tools.get('team_roster');
const claim = tools.get('team_claim');
assert.deepEqual([...tools.keys()].sort(), ['team_claim', 'team_roster', 'team_status']);
assert.ok(status && roster && claim);

let out = await status.execute({ name: 'Alice', focus: 'wiring the panel.' }, { agent: alice });
assert.match(out.text, /Alice/);
out = await status.execute({ name: 'Bob', focus: 'writing tests' }, { agent: bob });
assert.match(out.text, /Alice/);

out = await roster.execute({}, { agent: bob });
assert.match(out.text, /Parallel team/);
assert.match(out.text, /wiring the panel/);

const allow = { kind: 'allow' };
let decision = await pre({ name: 'write', agent: alice, arguments: { file_path: 'src/auto.ts' } }, async () => allow);
assert.equal(decision.kind, 'allow');
const autoClaim = S.getClaim(repo, 'src/auto.ts');
assert.ok(autoClaim && autoClaim.auto === true && autoClaim.agent === aliceId);
const autoChange = S.listChanges(repo, { state: 'claimed' })[0];
assert.ok(autoChange);
assert.equal(autoChange.sessionId, alice.session.id);
assert.match(autoChange.intent, /wiring the panel/);
assert.ok(autoChange.timeline.some((event) => event.type === 'claim' && event.path === 'src/auto.ts'));
// A focus that already ends a sentence must not gain a second stop before "Paths:".
const promptEntry = alice.promptContexts.at(-1);
assert.ok(promptEntry, 'the prompt context is installed');
const promptText = promptEntry.text();
assert.match(promptText, /Your active change .+: wiring the panel\. Paths: src\/auto\.ts/);
assert.doesNotMatch(promptText, /\.\. Paths/);
decision = await pre({ name: 'write', agent: bob, arguments: { file_path: 'src/auto.ts' } }, async () => allow);
assert.equal(decision.kind, 'deny');
assert.match(decision.reason, /File lease conflict/);
// A tool result must update the session's lastAction and files (this used to
// throw on an uninitialized pendingTouches map and silently skip the update).
emit('tools/result', { name: 'write', agent: alice, arguments: { file_path: 'src/auto.ts' } });
await new Promise((resolve) => setTimeout(resolve, 900));
const touched = S.getAgent(repo, aliceId);
assert.match(touched.lastAction, /^write src\/auto\.ts/);
assert.ok(touched.files.includes('src/auto.ts'));
emit('agent/status', { agent: alice, status: 'idle' });
await new Promise((resolve) => setTimeout(resolve, 20));
assert.equal(S.getClaim(repo, 'src/auto.ts'), undefined, 'auto claim released on idle');
const releasedChange = S.listChanges(repo, { state: 'done' }).find((change) => change.id === autoChange.id);
assert.ok(releasedChange);
assert.equal(releasedChange.summary, 'turn ended');
assert.ok(releasedChange.timeline.some((event) => event.type === 'release' && event.path === 'src/auto.ts'));
decision = await pre({ name: 'write', agent: bob, arguments: { file_path: 'src/auto.ts' } }, async () => allow);
assert.equal(decision.kind, 'allow');
assert.equal(S.getClaim(repo, 'src/auto.ts').agent, bobId);
S.releasePaths(repo, bobId, ['src/auto.ts']);

const carol = makeAgent('session-carol-999999');
emit('agent/status', { agent: carol, status: 'running' });
emit('agent/inbox/inserted', {
  agent: carol,
  message: {
    source: { kind: 'user' },
    content: [{ type: 'text', text: 'Investigate the guard race before editing. Then stop.' }],
  },
});
const carolPresence = S.getAgent(repo, S.agentIdForSession('session-carol-999999'));
assert.ok(carolPresence);
assert.match(carolPresence.focus, /Investigate the guard race/);

S.createAgent(second, { id: 'peer', name: 'Peer', focus: 'other project' });
S.registerProject(registry, { root: second });

const server = http.createServer((req, res) => httpHandler(req, res));
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const base = 'http://127.0.0.1:' + port + '/plugins/dsh-god-view/api';
let response = await fetch(base + '/projects');
assert.equal(response.status, 200);
let projects = await response.json();
assert.ok(projects.projects.some((project) => project.root === repo));
assert.ok(projects.projects.some((project) => project.root === second));
const repoSummary = projects.projects.find((project) => project.root === repo);
assert.equal(typeof repoSummary.working, 'number', 'the summary exposes a working count');
assert.ok(repoSummary.lastActivityAt > 0, 'the summary exposes real activity');
assert.equal(repoSummary.status, 'active', 'recent activity keeps the project active');

response = await fetch(base + '/state?root=' + encodeURIComponent(repo));
assert.equal(response.status, 200);
let snapshot = await response.json();
assert.equal(snapshot.root, repo);
assert.equal(snapshot.stats.agents, 3);
assert.equal('protocol' in snapshot, false, 'the snapshot carries no protocol version');
assert.equal('messages' in snapshot, false);
assert.equal(path.basename(snapshot.cliPath), 'dsh-god-view.mjs', 'the advertised CLI is the renamed binary');
assert.ok(fs.existsSync(snapshot.cliPath), 'the CLI path the host advertises exists on disk');

// The board-writing routes are gone; reads and the switch are the whole HTTP surface.
response = await fetch(base + '/claim', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ root: repo, agent: aliceId, paths: ['src/http.ts'], reason: 'http claim' }),
});
assert.equal(response.status, 404);
assert.equal(S.getClaim(repo, 'src/http.ts'), undefined, 'the removed route writes nothing');

// A POST body must be JSON, so a cross-site text/plain form cannot reach the handler.
response = await fetch(base + '/coordination', {
  method: 'POST',
  headers: { 'content-type': 'text/plain' },
  body: JSON.stringify({ enabled: false }),
});
assert.equal(response.status, 400);
assert.equal(
  (await (await fetch(base + '/coordination')).json()).enabled,
  true,
  'the rejected body does not flip the switch',
);

// The panel switch flips the whole mode off and on through HTTP.
response = await fetch(base + '/coordination');
assert.equal(response.status, 200);
let coordination = await response.json();
assert.equal(coordination.enabled, true);
assert.equal(coordination.trackedSessions, 3);

response = await fetch(base + '/coordination', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ enabled: false }),
});
assert.equal(response.status, 200);
coordination = await response.json();
assert.equal(coordination.enabled, false);
assert.equal((await (await fetch(base + '/coordination')).json()).enabled, false);
assert.equal(tools.size, 0, 'the panel switch removes the team tools');
decision = await pre({ name: 'write', agent: bob, arguments: { file_path: 'src/while-off.ts' } }, async () => allow);
assert.equal(decision.kind, 'allow', 'switching off stops blocking writes');
assert.equal(S.getClaim(repo, 'src/while-off.ts'), undefined, 'switching off records no lease');
snapshot = await (await fetch(base + '/state?root=' + encodeURIComponent(repo))).json();
assert.equal(snapshot.coordination.enabled, false);

response = await fetch(base + '/coordination', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ enabled: true }),
});
assert.equal((await response.json()).enabled, true);
assert.equal(tools.size, 3, 'the panel switch restores the team tools');

const cross = await fetch(base + '/state', { headers: { origin: 'http://evil.example' } });
assert.equal(cross.status, 403);

// A done status releases every lease the agent holds, explicit ones included.
// The idle path above only exercises the default all=false; this pins the
// (entry, all, summary) argument order of releaseAutoClaims.
const claimTool = tools.get('team_claim');
await claimTool.execute({ action: 'claim', paths: ['src/done.ts'], reason: 'planned lease' }, { agent: bob });
const explicitLease = S.getClaim(repo, 'src/done.ts');
assert.ok(explicitLease && explicitLease.auto !== true, 'team_claim creates an explicit lease');
await tools.get('team_status').execute({ status: 'done' }, { agent: bob });
assert.equal(S.getClaim(repo, 'src/done.ts'), undefined, 'done releases explicit leases too');
const doneChange = S.listChanges(repo, { state: 'done' }).find((change) => change.summary === 'status done');
assert.ok(doneChange, 'the release records the status-done summary');

await new Promise((resolve) => server.close(resolve));

// A host that boots while the switch is off starts with an empty tool catalog,
// so a restart never leaks the tools back into a dormant profile.
const offRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-host-off-'));
fs.mkdirSync(path.join(offRepo, '.git'));
fs.writeFileSync(path.join(offRepo, '.git', 'HEAD'), 'ref: refs/heads/main\n');
const offRegistry = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-reg-off-'));
S.writeCoordination(offRegistry, false);
const offTools = new Map();
const offCtx = {
  tools: {
    register(definition) {
      offTools.set(definition.name, definition);
      return () => offTools.delete(definition.name);
    },
  },
  effect(fn) {
    return fn();
  },
  on() {
    return () => {};
  },
  get() {
    return undefined;
  },
  inject(deps, callback) {
    callback(offCtx);
  },
};
apply(offCtx, { root: offRepo, registryDir: offRegistry, heartbeatMs: 60_000 });
assert.equal(offTools.size, 0, 'a host that boots dormant registers no tools');
assert.equal(fs.existsSync(path.join(offRepo, '.dsh')), false, 'a host that boots dormant writes no board');
fs.rmSync(offRepo, { recursive: true, force: true });
fs.rmSync(offRegistry, { recursive: true, force: true });

console.log('host smoke ok', repo, S.listAgents(repo).length, tools.size);
