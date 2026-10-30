import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import * as S from '../lib/store.js';

function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-store-'));
  fs.mkdirSync(path.join(dir, '.git'));
  fs.writeFileSync(path.join(dir, '.git', 'HEAD'), 'ref: refs/heads/main\n');
  return dir;
}

test('presence and one-line focus', () => {
  const root = repo();
  const alice = S.createAgent(root, { id: 'alice', name: 'Alice', focus: 'store' });
  assert.equal(alice.status, 'active');
  assert.equal(S.getAgent(root, 'alice').focus, 'store');
  S.updateAgent(root, 'alice', { status: 'blocked', focus: 'waiting for API' });
  const updated = S.findAgent(root, 'alice');
  assert.equal(updated.status, 'blocked');
  assert.equal(updated.focus, 'waiting for API');
});

test('claims conflict, release, and produce a claim/release timeline', () => {
  const root = repo();
  S.createAgent(root, { id: 'a', name: 'A' });
  S.createAgent(root, { id: 'b', name: 'B' });
  let result = S.claimPaths(root, 'a', ['lib/x.ts'], { intent: 'refactor x', sessionId: 'session-a' });
  assert.equal(result.claimed.length, 1);
  assert.equal(result.change.intent, 'refactor x');
  assert.equal(result.change.sessionId, 'session-a');
  assert.equal(result.change.timeline[0].type, 'claim');
  assert.equal(result.change.timeline[0].path, 'lib/x.ts');
  result = S.claimPaths(root, 'b', ['lib/x.ts']);
  assert.equal(result.conflicts.length, 1);
  S.renewClaims(root, 'a');
  result = S.releasePaths(root, 'a', ['lib/x.ts'], { summary: 'x finished' });
  assert.equal(result.released.length, 1);
  assert.equal(S.listClaims(root).length, 0);
  const done = S.listChanges(root, { state: 'done' })[0];
  assert.equal(done.summary, 'x finished');
  assert.ok(
    done.timeline.some(
      (event) => event.type === 'release' && event.path === 'lib/x.ts' && event.summary === 'x finished',
    ),
  );
});

test('expired lease marks the change expired and appends an expire event', () => {
  const root = repo();
  S.createAgent(root, { id: 'a', name: 'A' });
  S.claimPaths(root, 'a', ['src/expire.ts'], { intent: 'temporary work' });
  const file = path.join(S.paths(root).claims, S.hash('src/expire.ts') + '.json');
  const claim = JSON.parse(fs.readFileSync(file, 'utf8'));
  claim.expiresAt = Date.now() - 1;
  fs.writeFileSync(file, JSON.stringify(claim));
  assert.equal(S.expireClaims(root), 1);
  const change = S.listChanges(root)[0];
  assert.equal(change.state, 'expired');
  assert.ok(change.timeline.some((event) => event.type === 'expire' && event.path === 'src/expire.ts'));
});

test('snapshot exposes presence, claims, changes, and no message queue', () => {
  const root = repo();
  S.createAgent(root, { id: 'a', name: 'A', focus: 'work' });
  S.createAgent(root, { id: 'b', name: 'B' });
  S.claimPaths(root, 'a', ['src/a.ts']);
  const snap = S.snapshot(root);
  assert.equal(snap.protocol, 3);
  assert.equal(snap.stats.agents, 2);
  assert.equal(snap.stats.claims, 1);
  assert.equal(snap.stats.changes, 1);
  assert.equal(snap.changes[0].paths[0], 'src/a.ts');
  assert.ok(Array.isArray(snap.changes[0].timeline));
  assert.equal('messages' in snap, false);
  assert.equal(snap.agents.find((agent) => agent.id === 'a').activeChanges, 1);
});

test('project registry and summaries are separate from the board', () => {
  const root = repo();
  const registry = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-reg-'));
  S.createAgent(root, { id: 'a', name: 'A', focus: 'work' });
  S.registerProject(registry, { root, name: path.basename(root) });
  const projects = S.listRegisteredProjects(registry);
  assert.equal(projects.length, 1);
  assert.equal(projects[0].root, root);
  const summary = S.projectSummary(root);
  assert.equal(summary.name, path.basename(root));
  assert.equal(summary.status, 'active');
});

test('activity recency is separate from heartbeat liveness', () => {
  const root = repo();
  const now = Date.now();
  const old = now - S.ACTIVE_WINDOW_MS - 60_000;
  S.createAgent(root, { id: 'old', name: 'Old', now: old, status: 'idle' });
  S.heartbeat(root, 'old');
  let summary = S.projectSummary(root);
  assert.equal(summary.status, 'idle', 'a live host is not recent activity');
  assert.equal(summary.working, 0);
  assert.equal(summary.lastActivityAt, old, 'last activity ignores the heartbeat');

  S.updateAgent(root, 'old', { status: 'idle', now });
  summary = S.projectSummary(root);
  assert.equal(summary.status, 'active', 'recent activity keeps the board listed');
  assert.equal(summary.working, 0);

  S.updateAgent(root, 'old', { status: 'active', now });
  summary = S.projectSummary(root);
  assert.equal(summary.status, 'active');
  assert.equal(summary.working, 1, 'working sessions are counted');

  const blockedRoot = repo();
  S.createAgent(blockedRoot, { id: 'b', name: 'B', now: old, status: 'blocked' });
  S.heartbeat(blockedRoot, 'b');
  summary = S.projectSummary(blockedRoot);
  assert.equal(summary.status, 'active', 'a blocked session stays listed after the window');
  assert.equal(summary.blocked, 1);

  const claimedRoot = repo();
  S.createAgent(claimedRoot, { id: 'c', name: 'C', now: old, status: 'idle' });
  S.heartbeat(claimedRoot, 'c');
  S.claimPaths(claimedRoot, 'c', ['src/a.ts']);
  summary = S.projectSummary(claimedRoot);
  assert.equal(summary.status, 'claimed');
  S.releasePaths(claimedRoot, 'c', ['src/a.ts'], { summary: 'done' });
  summary = S.projectSummary(claimedRoot);
  assert.equal(summary.status, 'active', 'a fresh release is recent activity');
  assert.equal(summary.claims, 0);
});

test('concurrent processes create agents and claims without corruption', async () => {
  const root = repo();
  S.createAgent(root, { id: 'hub', name: 'Hub' });
  const worker = path.join(root, 'worker.mjs');
  const storeUrl = 'file://' + path.resolve('lib/store.js');
  fs.writeFileSync(
    worker,
    [
      'import { createAgent, claimPaths } from ' + JSON.stringify(storeUrl) + ';',
      'const root = process.argv[2];',
      'const index = Number(process.argv[3]);',
      'const id = "conc-" + index;',
      'createAgent(root, { id, name: "Conc " + index, focus: "worker " + index });',
      'claimPaths(root, id, ["src/file-" + index + ".ts"]);',
      '',
    ].join('\n'),
  );
  const children = [];
  for (let i = 0; i < 8; i++) {
    children.push(
      new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [worker, root, String(i)], { stdio: 'inherit' });
        child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error('worker ' + i + ' exited ' + code))));
        child.on('error', reject);
      }),
    );
  }
  await Promise.all(children);
  const snap = S.snapshot(root, { changeLimit: 100 });
  assert.equal(snap.stats.agents, 9);
  assert.equal(snap.stats.claims, 8);
  assert.equal(snap.stats.changes, 8);
  const dirs = [S.paths(root).agents, S.paths(root).claims, S.paths(root).changes];
  let jsonCount = 0;
  for (const dir of dirs) {
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith('.json')) continue;
      JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
      jsonCount++;
    }
  }
  assert.ok(jsonCount >= 9 + 8 + 8);
  const tmp = [];
  for (const dir of [S.paths(root).base, ...dirs]) {
    for (const name of fs.readdirSync(dir)) if (name.endsWith('.tmp')) tmp.push(name);
  }
  assert.deepEqual(tmp, []);
});

test('CLI claim conflict and release timeline', () => {
  const root = repo();
  const cli = path.resolve('bin/dsh-god-view.mjs');
  const a = spawnSync(process.execPath, [cli, 'join', '--repo', root, '--name', 'a'], { encoding: 'utf8' });
  const b = spawnSync(process.execPath, [cli, 'join', '--repo', root, '--name', 'b'], { encoding: 'utf8' });
  const aid = /export DSH_PARALLEL_AGENT_ID=(.+)/.exec(a.stdout)[1].trim();
  const bid = /export DSH_PARALLEL_AGENT_ID=(.+)/.exec(b.stdout)[1].trim();
  assert.equal(
    spawnSync(process.execPath, [cli, 'claim', '--repo', root, '--id', aid, '--paths', 'x.ts', '--intent', 'fix x'], {
      encoding: 'utf8',
    }).status,
    0,
  );
  const changes = spawnSync(process.execPath, [cli, 'changes', '--repo', root], { encoding: 'utf8' });
  assert.match(changes.stdout, /Active changes/);
  assert.match(changes.stdout, /x\.ts/);
  const conflict = spawnSync(process.execPath, [cli, 'claim', '--repo', root, '--id', bid, '--paths', 'x.ts'], {
    encoding: 'utf8',
  });
  assert.equal(conflict.status, 0);
  assert.match(conflict.stdout, /CONFLICT x\.ts/);
  const release = spawnSync(
    process.execPath,
    [cli, 'release', '--repo', root, '--id', aid, '--paths', 'x.ts', '--summary', 'fixed'],
    { encoding: 'utf8' },
  );
  assert.equal(release.status, 0, release.stderr);
  const recent = spawnSync(process.execPath, [cli, 'changes', '--repo', root], { encoding: 'utf8' });
  assert.match(recent.stdout, /Recent changes/);
  assert.match(recent.stdout, /fixed/);
});

test('CLI status done and leave release owned claims', () => {
  const root = repo();
  const cli = path.resolve('bin/dsh-god-view.mjs');
  const join = spawnSync(process.execPath, [cli, 'join', '--repo', root, '--name', 'a'], { encoding: 'utf8' });
  const aid = /export DSH_PARALLEL_AGENT_ID=(.+)/.exec(join.stdout)[1].trim();
  assert.equal(
    spawnSync(process.execPath, [cli, 'claim', '--repo', root, '--id', aid, '--paths', 'done.ts'], {
      encoding: 'utf8',
    }).status,
    0,
  );
  const done = spawnSync(process.execPath, [cli, 'status', '--repo', root, '--id', aid, '--status', 'done'], {
    encoding: 'utf8',
  });
  assert.equal(done.status, 0, done.stderr);
  assert.match(
    spawnSync(process.execPath, [cli, 'claims', '--repo', root], { encoding: 'utf8' }).stdout,
    /no active claims/,
  );
  assert.match(
    spawnSync(process.execPath, [cli, 'changes', '--repo', root], { encoding: 'utf8' }).stdout,
    /status done/,
  );

  const joinB = spawnSync(process.execPath, [cli, 'join', '--repo', root, '--name', 'b'], { encoding: 'utf8' });
  const bid = /export DSH_PARALLEL_AGENT_ID=(.+)/.exec(joinB.stdout)[1].trim();
  assert.equal(
    spawnSync(process.execPath, [cli, 'claim', '--repo', root, '--id', bid, '--paths', 'left.ts'], {
      encoding: 'utf8',
    }).status,
    0,
  );
  const leave = spawnSync(process.execPath, [cli, 'leave', '--repo', root, '--id', bid], { encoding: 'utf8' });
  assert.equal(leave.status, 0, leave.stderr);
  assert.match(
    spawnSync(process.execPath, [cli, 'claims', '--repo', root], { encoding: 'utf8' }).stdout,
    /no active claims/,
  );
  assert.match(
    spawnSync(process.execPath, [cli, 'changes', '--repo', root], { encoding: 'utf8' }).stdout,
    /agent left/,
  );
});
test('coordination is off by default and the switch persists in the registry dir', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-switch-'));
  assert.equal(S.readCoordination(dir).enabled, false);
  const on = S.writeCoordination(dir, true, { now: 1000 });
  assert.equal(on.enabled, true);
  assert.equal(S.readCoordination(dir).enabled, true);
  S.writeCoordination(dir, false, { now: 2000 });
  assert.equal(S.readCoordination(dir).enabled, false);
  fs.writeFileSync(path.join(dir, 'state.json'), 'not json');
  assert.equal(S.readCoordination(dir).enabled, false);
});

test('reading a board that does not exist creates nothing', () => {
  const root = repo();
  const snap = S.snapshot(root);
  assert.equal(snap.stats.agents, 0);
  assert.equal(fs.existsSync(path.join(root, '.dsh')), false);
  const summary = S.projectSummary(root);
  assert.equal(summary.agents, 0);
  assert.equal(fs.existsSync(path.join(root, '.dsh')), false);
});
