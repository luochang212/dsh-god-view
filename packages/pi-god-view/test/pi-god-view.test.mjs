import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import * as S from 'godview';
import plugin from '../extensions/pi-god-view.js';
import { installGuard } from '../lib/guard.js';
import { PiBoard } from '../lib/session.js';
import { createTools } from '../lib/tools.js';

function fixture(id, suffix = '') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-god-view-'));
  fs.mkdirSync(path.join(root, '.git'));
  const ctx = {
    cwd: root,
    sessionManager: {
      getSessionId: () => id,
      getSessionName: () => 'session-' + id + suffix,
    },
  };
  return { root, ctx };
}

function cleanup(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

function makeBoardAt(root, id) {
  const ctx = {
    cwd: root,
    sessionManager: {
      getSessionId: () => id,
      getSessionName: () => 'session-' + id,
    },
  };
  const board = new PiBoard(ctx, {
    registryDir: path.join(root, 'registry'),
    heartbeatMs: 60_000,
    ttlMs: 60_000,
  });
  board.start();
  return board;
}

function makeBoard(id, options = {}) {
  const { root, ctx } = fixture(id, options.suffix || '');
  const board = new PiBoard(ctx, {
    registryDir: path.join(root, 'registry'),
    heartbeatMs: 60_000,
    ttlMs: 60_000,
    ...options,
  });
  board.start();
  return { root, ctx, board };
}

test('session start writes presence and stop leaves a done row', () => {
  const { root, board } = makeBoard('s1');
  const first = S.snapshot(root);
  assert.equal(first.agents.length, 1);
  assert.equal(first.agents[0].id, 'pi-' + S.hash('s1').slice(0, 10));
  assert.equal(first.agents[0].status, 'active');
  assert.equal(first.agents[0].focus, 'starting');
  assert.equal(first.agents[0].role, 'pi');

  board.setFocusFromPrompt('Fix the parser bug. Then update the docs.');
  assert.equal(S.getAgent(root, board.id).focus, 'Fix the parser bug');

  board.claim(['src/parser.js'], { reason: 'fix parser' });
  assert.equal(S.listClaims(root).length, 1);
  board.stop('test done');

  const after = S.snapshot(root);
  assert.equal(after.agents[0].status, 'done');
  assert.equal(after.claims.length, 0);
  cleanup(root);
});

test('a conflicting write is blocked and an unclaimed write auto-claims', () => {
  const { root, board: a } = makeBoard('a');
  const b = makeBoardAt(root, 'b');
  a.claim(['src/shared.js'], { reason: 'A owns it' });

  const blocked = b.checkWrite('src/shared.js', 'write');
  assert.match(blocked, /claimed by session-a/);
  assert.match(blocked, /src\/shared\.js/);

  assert.equal(b.checkWrite('src/other.js', 'edit'), undefined);
  assert.equal(S.getClaim(root, 'src/other.js').agent, b.id);

  a.stop('test');
  b.stop('test');
  cleanup(root);
});

test('guard returns block for a live lease held by another agent', async () => {
  const { root, board: a } = makeBoard('a');
  const b = makeBoardAt(root, 'b');
  a.claim(['src/blocked.js'], { reason: 'A owns it' });

  const handlers = {};
  installGuard(
    {
      on: (name, handler) => {
        handlers[name] = handler;
      },
    },
    () => b,
  );
  const result = await handlers.tool_call({
    toolName: 'write',
    input: { path: 'src/blocked.js', content: 'nope' },
  });
  assert.equal(result.block, true);
  assert.match(result.reason, /File lease conflict/);

  assert.equal(await handlers.tool_call({ toolName: 'read', input: { path: 'src/blocked.js' } }), undefined);
  assert.equal(await handlers.tool_call({ toolName: 'write', input: { path: 'src/new.js' } }), undefined);
  assert.equal(S.getClaim(root, 'src/new.js').agent, b.id);

  a.stop('test');
  b.stop('test');
  cleanup(root);
});

test('the three tools claim, list, release, and report status', async () => {
  const { root, board } = makeBoard('tools');
  const tools = createTools(() => board);
  assert.deepEqual(
    tools.map((tool) => tool.name),
    ['team_status', 'team_roster', 'team_claim'],
  );
  const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool]));

  const status = await byName.team_status.execute(
    'id',
    { status: 'blocked', focus: 'blocked on tests' },
    null,
    null,
    {},
  );
  assert.match(status.content[0].text, /blocked/);
  assert.match(status.content[0].text, /blocked on tests/);

  const claimed = await byName.team_claim.execute(
    'id',
    { action: 'claim', paths: ['src/a.js'], reason: 'work' },
    null,
    null,
    {},
  );
  assert.match(claimed.content[0].text, /claimed src\/a\.js/);
  assert.deepEqual(claimed.details.claimed, ['src/a.js']);

  const roster = await byName.team_roster.execute('id', {}, null, null, {});
  assert.match(roster.content[0].text, /src\/a\.js/);
  assert.match(roster.content[0].text, /blocked/);

  const released = await byName.team_claim.execute('id', { action: 'release', paths: ['src/a.js'] }, null, null, {});
  assert.match(released.content[0].text, /released src\/a\.js/);
  assert.equal(S.listClaims(root).length, 0);

  await byName.team_status.execute('id', { status: 'done' }, null, null, {});
  assert.equal(S.getAgent(root, board.id).status, 'done');
  board.stop('test');
  cleanup(root);
});

test('panel lines are derived from the shared store', () => {
  const { root, board } = makeBoard('panel');
  board.claim(['src/panel.js'], { reason: 'panel work' });
  const lines = board.panelLines();
  assert.match(lines[0], /godview/);
  assert.match(lines[0], /1 active/);
  assert.ok(lines.some((line) => line.includes('src/panel.js')));
  assert.match(board.summaryLine(), /GV 1a\/1c/);
  board.stop('test');
  cleanup(root);
});

test('extension registers three tools, the guard, and /godview', () => {
  const tools = [];
  const commands = {};
  const events = {};
  const pi = {
    registerTool: (tool) => tools.push(tool),
    registerCommand: (name, options) => {
      commands[name] = options;
    },
    on: (name, handler) => {
      events[name] = handler;
    },
  };
  plugin(pi);
  assert.deepEqual(
    tools.map((tool) => tool.name),
    ['team_status', 'team_roster', 'team_claim'],
  );
  assert.equal(typeof commands.godview.handler, 'function');
  for (const event of [
    'session_start',
    'session_shutdown',
    'input',
    'before_agent_start',
    'agent_start',
    'agent_settled',
    'tool_call',
  ]) {
    assert.equal(typeof events[event], 'function', event);
  }
});

test('package manifest exposes a pi extension and the pi-package keyword', () => {
  const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.name, 'pi-god-view');
  assert.equal(pkg.version, '0.1.0');
  assert.ok(pkg.keywords.includes('pi-package'));
  assert.deepEqual(pkg.pi.extensions, ['./extensions/pi-god-view.js']);
  assert.equal(pkg.dependencies.godview, '^0.1.0');
});
