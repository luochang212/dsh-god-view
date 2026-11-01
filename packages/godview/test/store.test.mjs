import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as S from '../lib/store.js';

const STORE_URL = pathToFileURL(fileURLToPath(new URL('../lib/store.js', import.meta.url))).href;
const CLI_PATH = fileURLToPath(new URL('../bin/godview.mjs', import.meta.url));

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
  assert.equal('protocol' in snap, false, 'the snapshot carries no protocol version');
  const config = JSON.parse(fs.readFileSync(S.paths(root).config, 'utf8'));
  assert.equal('protocol' in config, false, 'the board config carries no version field');
  const changeFile = path.join(S.paths(root).changes, snap.changes[0].id + '.json');
  assert.equal('protocol' in JSON.parse(fs.readFileSync(changeFile, 'utf8')), false, 'changes carry no version field');
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
  assert.equal(
    'version' in JSON.parse(fs.readFileSync(S.registryFile(registry), 'utf8')),
    false,
    'the index carries no version',
  );
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
  const storeUrl = STORE_URL;
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
  const cli = CLI_PATH;
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
  assert.match(recent.stdout, /\[released\]/, 'a released change is not displayed as done');
  assert.doesNotMatch(recent.stdout, /\[done\]/);
});

test('CLI list hides stale agents unless --stale is passed', () => {
  const root = repo();
  const cli = CLI_PATH;
  const join = spawnSync(process.execPath, [cli, 'join', '--repo', root, '--name', 'ghost'], { encoding: 'utf8' });
  const id = /export DSH_PARALLEL_AGENT_ID=(.+)/.exec(join.stdout)[1].trim();
  // Age the presence past its TTL so it counts as stale.
  const file = path.join(S.paths(root).agents, id + '.json');
  const agent = JSON.parse(fs.readFileSync(file, 'utf8'));
  agent.heartbeatAt = Date.now() - (agent.ttlMs + 60_000);
  fs.writeFileSync(file, JSON.stringify(agent));
  assert.match(
    spawnSync(process.execPath, [cli, 'list', '--repo', root], { encoding: 'utf8' }).stdout,
    /No active agents/,
  );
  const stale = spawnSync(process.execPath, [cli, 'list', '--repo', root, '--stale'], { encoding: 'utf8' });
  assert.match(stale.stdout, /ghost/);
  assert.match(stale.stdout, /\(stale\)/);
});

test('CLI status done and leave release owned claims', () => {
  const root = repo();
  const cli = CLI_PATH;
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
test('taking over an expired lease records an expire event on the old change', () => {
  const root = repo();
  S.createAgent(root, { id: 'a', name: 'A' });
  S.createAgent(root, { id: 'b', name: 'B' });
  S.claimPaths(root, 'a', ['lib/takeover.ts'], { intent: 'work one' });
  const file = path.join(S.paths(root).claims, S.hash('lib/takeover.ts') + '.json');
  const claim = JSON.parse(fs.readFileSync(file, 'utf8'));
  claim.expiresAt = Date.now() - 1000;
  fs.writeFileSync(file, JSON.stringify(claim));
  // No host swept the expiry; B claims the path directly.
  const result = S.claimPaths(root, 'b', ['lib/takeover.ts'], { intent: 'work two' });
  assert.equal(result.claimed.length, 1);
  const oldChange = S.listChanges(root, { agent: 'a' })[0];
  assert.equal(oldChange.state, 'expired', 'the previous change is finished, not left open');
  assert.ok(
    oldChange.timeline.some((event) => event.type === 'expire' && event.path === 'lib/takeover.ts'),
    'the gantt gets a closing event instead of a forever-held bar',
  );
  // Re-claiming your own expired lease is a renewal, not an expiry.
  const renewal = S.claimPaths(root, 'b', ['lib/takeover.ts'], { intent: 'still mine' });
  assert.equal(renewal.change.timeline.filter((event) => event.type === 'expire').length, 0);
});

test('two agents racing for the same expired lease produce exactly one owner', async () => {
  const root = repo();
  for (const id of ['old', 'a', 'b']) S.createAgent(root, { id, name: id.toUpperCase() });
  S.claimPaths(root, 'old', ['lib/race.ts'], { intent: 'gone' });
  const file = path.join(S.paths(root).claims, S.hash('lib/race.ts') + '.json');
  const claim = JSON.parse(fs.readFileSync(file, 'utf8'));
  claim.expiresAt = Date.now() - 1000;
  fs.writeFileSync(file, JSON.stringify(claim));

  // Two workers align on a flag file and claim the same expired lease at the
  // same moment. The exclusive (wx) create must decide the single owner: the
  // loser sees a conflict and keeps no open change. Before the fix both
  // processes overwrote the lease file and each believed it had claimed.
  const storeUrl = STORE_URL;
  const worker = path.join(root, 'race-worker.mjs');
  fs.writeFileSync(
    worker,
    [
      "import fs from 'node:fs';",
      `import { claimPaths } from ${JSON.stringify(storeUrl)};`,
      'const root = process.argv[2];',
      'const id = process.argv[3];',
      'const flag = process.argv[4];',
      'function exists(f) {',
      '  try {',
      '    fs.statSync(f);',
      '    return true;',
      '  } catch {',
      '    return false;',
      '  }',
      '}',
      'while (!exists(flag)) {}',
      'const result = claimPaths(root, id, ["lib/race.ts"], { intent: "race " + id });',
      'process.stdout.write(JSON.stringify({ id, claimed: result.claimed.length, conflicts: result.conflicts.length }));',
      '',
    ].join('\n'),
  );
  const flag = path.join(root, 'start-flag');
  const run = (id) =>
    new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [worker, root, id, flag], { stdio: ['ignore', 'pipe', 'inherit'] });
      let out = '';
      child.stdout.on('data', (data) => (out += data));
      child.on('exit', (code) =>
        code === 0 ? resolve(JSON.parse(out)) : reject(new Error('worker ' + id + ' exited ' + code)),
      );
      child.on('error', reject);
    });
  const pending = [run('a'), run('b')];
  await new Promise((resolve) => setTimeout(resolve, 400));
  fs.writeFileSync(flag, 'go');
  const results = await Promise.all(pending);

  const finalClaim = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.ok(['a', 'b'].includes(finalClaim.agent), 'the lease has a real owner');
  const loser = finalClaim.agent === 'a' ? 'b' : 'a';
  const winnerResult = results.find((result) => result.id === finalClaim.agent);
  const loserResult = results.find((result) => result.id === loser);
  assert.equal(winnerResult.claimed, 1, 'the winner claims the lease');
  assert.equal(loserResult.claimed, 0, 'the loser does not also claim it');
  assert.equal(loserResult.conflicts, 1, 'the loser sees a conflict');
  assert.equal(
    S.listChanges(root, { agent: loser, state: 'claimed' }).length,
    0,
    'the loser keeps no open change with no lease pointing at it',
  );
  const oldChange = S.listChanges(root, { agent: 'old' })[0];
  assert.equal(oldChange.state, 'expired', 'the previous owner still gets its closing event');
  assert.equal(
    oldChange.timeline.filter((event) => event.type === 'expire').length,
    1,
    'the expiry is recorded exactly once',
  );
});

test('releasePaths never rewrites the closing state of an already-finished change', () => {
  const root = repo();
  S.createAgent(root, { id: 'a', name: 'A' });
  S.claimPaths(root, 'a', ['r1.ts'], { intent: 'first' });
  S.releasePaths(root, 'a', ['r1.ts'], { summary: 'released' });
  const change = S.listChanges(root)[0];
  assert.equal(change.state, 'done');
  assert.equal(change.summary, 'released');
  // A lease file that points at an already-finished change (damaged or
  // migrated data) must not reopen or re-close the change on release.
  const crafted = {
    path: 'r1.ts',
    agent: 'a',
    agentName: 'A',
    changeId: change.id,
    mode: 'edit',
    createdAt: Date.now(),
    ttlMs: 60_000,
    expiresAt: Date.now() + 60_000,
  };
  fs.writeFileSync(path.join(S.paths(root).claims, S.hash('r1.ts') + '.json'), JSON.stringify(crafted));
  assert.doesNotThrow(() => S.releasePaths(root, 'a', ['r1.ts'], { summary: 'again' }));
  const after = S.listChanges(root)[0];
  assert.equal(after.state, 'done', 'the final state survives');
  assert.equal(after.summary, 'released', 'the original closing summary survives');
});

test('a change with an expired unswept sibling lease keeps a single final state', () => {
  const root = repo();
  S.createAgent(root, { id: 'a', name: 'A' });
  S.claimPaths(root, 'a', ['p1.ts', 'p2.ts'], { intent: 'two files' });
  const file = path.join(S.paths(root).claims, S.hash('p2.ts') + '.json');
  const claim = JSON.parse(fs.readFileSync(file, 'utf8'));
  claim.expiresAt = Date.now() - 1000;
  fs.writeFileSync(file, JSON.stringify(claim));
  // Release only p1 while p2's lease file still exists on disk.
  S.releasePaths(root, 'a', ['p1.ts'], { summary: 'p1 done' });
  let change = S.listChanges(root)[0];
  assert.equal(change.state, 'claimed', 'the change stays open while a lease file remains');
  S.expireClaims(root);
  change = S.listChanges(root)[0];
  assert.equal(change.state, 'expired', 'the sweep ends the change exactly once');
  assert.equal(change.timeline.filter((event) => event.type === 'expire').length, 1);
  // A change already done must not flip back through a later sweep.
  const doneRoot = repo();
  S.createAgent(doneRoot, { id: 'a', name: 'A' });
  S.claimPaths(doneRoot, 'a', ['q.ts'], { intent: 'q' });
  S.releasePaths(doneRoot, 'a', ['q.ts'], { summary: 'released properly' });
  S.expireClaims(doneRoot);
  const done = S.listChanges(doneRoot)[0];
  assert.equal(done.state, 'done', 'a released change keeps its final state');
  assert.equal(done.summary, 'released properly');
});

test('a legacy change without a paths array does not break claim or release', () => {
  const root = repo();
  S.createAgent(root, { id: 'a', name: 'A' });
  S.claimPaths(root, 'a', ['legacy.ts'], { intent: 'legacy' });
  S.releasePaths(root, 'a', ['legacy.ts']);
  const change = S.getChange(root, S.listChanges(root)[0].id);
  delete change.paths;
  delete change.timeline;
  fs.writeFileSync(path.join(S.paths(root).changes, change.id + '.json'), JSON.stringify(change));
  assert.doesNotThrow(() => S.claimPaths(root, 'a', ['legacy.ts'], { intent: 'after legacy' }));
  assert.doesNotThrow(() => S.releasePaths(root, 'a', ['legacy.ts'], { summary: 'ok' }));
  const repaired = S.listChanges(root)[0];
  assert.ok(Array.isArray(repaired.paths) && repaired.paths.includes('legacy.ts'));
});

test('coordination is on by default and the switch persists in the registry dir', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-switch-'));
  assert.equal(S.readCoordination(dir).enabled, true, 'no state file reads as on');
  const off = S.writeCoordination(dir, false, { now: 1000 });
  assert.equal(off.enabled, false);
  assert.equal(S.readCoordination(dir).enabled, false);
  S.writeCoordination(dir, true, { now: 2000 });
  assert.equal(S.readCoordination(dir).enabled, true);
  assert.equal(
    'version' in JSON.parse(fs.readFileSync(S.coordinationFile(dir), 'utf8')),
    false,
    'the switch file carries no version',
  );
  fs.writeFileSync(path.join(dir, 'state.json'), 'not json');
  assert.equal(S.readCoordination(dir).enabled, true, 'unreadable state reads as on');
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
