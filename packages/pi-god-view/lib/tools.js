/**
 * The three team tools exposed by the Pi extension.
 *
 * The definitions use plain JSON Schema, so this package does not import the
 * Pi host at runtime. The host supplies the model catalog and validation.
 */

const STATUSES = ['active', 'idle', 'blocked', 'done'];
const MODES = ['edit', 'review'];

function text(value, details) {
  return {
    content: [{ type: 'text', text: String(value) }],
    details: details || {},
  };
}

function asPaths(value) {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

function boardFor(getBoard, ctx) {
  const board = getBoard(ctx);
  if (!board || !board.started) throw new Error('godview is not active in this Pi session');
  return board;
}

function claimReport(board, result) {
  const lines = [];
  for (const claim of result.claimed || []) {
    lines.push('claimed ' + claim.path + ' (' + claim.mode + ')');
  }
  if (result.change) {
    lines.push('change ' + result.change.id + ': ' + result.change.intent);
  }
  for (const claim of result.conflicts || []) {
    lines.push(
      'CONFLICT ' +
        claim.path +
        ' is already claimed by ' +
        (claim.agentName || claim.agent) +
        ' until ' +
        new Date(claim.expiresAt).toISOString() +
        '. Wait for release before editing.',
    );
  }
  if (lines.length === 0) lines.push('No paths changed.');
  return text(lines.join('\n'), {
    claimed: (result.claimed || []).map((claim) => claim.path),
    conflicts: (result.conflicts || []).map((claim) => claim.path),
    change: result.change ? result.change.id : null,
  });
}

export function createTools(getBoard) {
  const teamStatus = {
    name: 'team_status',
    label: 'Team status',
    description:
      'Publish your current status, one-line focus, plan, and files on the shared godview board. Call this when you start, change focus, become blocked, or finish. Status done releases all your file leases.',
    parameters: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: STATUSES,
          description: 'active, idle, blocked, or done',
        },
        focus: { type: 'string', description: 'One-line focus for this session' },
        plan: { type: 'string', description: 'Optional longer plan' },
        files: {
          type: 'array',
          items: { type: 'string' },
          description: 'Files you are currently working on (not leases)',
        },
      },
      additionalProperties: false,
    },
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const board = boardFor(getBoard, ctx);
      const patch = {};
      if (params.status !== undefined) {
        if (!STATUSES.includes(params.status)) {
          throw new Error('status must be one of ' + STATUSES.join(', '));
        }
        patch.status = params.status;
      }
      if (params.focus !== undefined) patch.focus = String(params.focus).slice(0, 240);
      if (params.plan !== undefined) patch.plan = String(params.plan).slice(0, 1500);
      if (params.files !== undefined) {
        patch.files = asPaths(params.files).slice(0, 30);
      }
      const updated = Object.keys(patch).length > 0 ? board.update(patch) : board.presence;
      if (params.status === 'done') board.releaseAll('status done');
      return text(board.statusText(updated), {
        agent: board.id,
        status: updated ? updated.status : undefined,
      });
    },
  };

  const teamRoster = {
    name: 'team_roster',
    label: 'Team roster',
    description:
      'Read the shared godview board: active and recently active agents, their focus, live file leases, and recent changes. Use this before claiming a file or when you need to know who is working where.',
    parameters: {
      type: 'object',
      properties: {
        include_stale: {
          type: 'boolean',
          description: 'Include agents whose heartbeat has expired',
        },
      },
      additionalProperties: false,
    },
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const board = boardFor(getBoard, ctx);
      return text(board.rosterText(params.include_stale === true), {
        root: board.root,
      });
    },
  };

  const teamClaim = {
    name: 'team_claim',
    label: 'Team claim',
    description:
      'Claim or release exact repository-relative file paths so two agents do not edit the same file at once. Claims are exact paths, not directories or globs. Auto claims cover write/edit; use this tool for planned work or explicit releases.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['claim', 'release', 'list'],
          description: 'claim paths, release paths, or list the current leases',
        },
        paths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Exact repository-relative file paths',
        },
        mode: {
          type: 'string',
          enum: MODES,
          description: 'edit (default) or review',
        },
        reason: {
          type: 'string',
          description: 'Short intent for the change record',
        },
        ttl_minutes: {
          type: 'number',
          minimum: 1,
          maximum: 240,
          description: 'Lease lifetime in minutes (default 30, max 240)',
        },
      },
      required: ['action'],
      additionalProperties: false,
    },
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const board = boardFor(getBoard, ctx);
      const action = String(params.action || '');
      if (action === 'list') return text(board.rosterText(false), { root: board.root });
      const paths = asPaths(params.paths);
      if (action === 'claim') {
        if (paths.length === 0) throw new Error('team_claim claim needs at least one path');
        if (params.mode !== undefined && !MODES.includes(params.mode)) {
          throw new Error('mode must be edit or review');
        }
        const minutes = Number(params.ttl_minutes);
        const ttlMs = Number.isFinite(minutes) ? Math.max(1, Math.min(240, minutes)) * 60_000 : undefined;
        const result = board.claim(paths, {
          mode: params.mode === 'review' ? 'review' : 'edit',
          ttlMs,
          reason: params.reason,
          intent: params.reason,
        });
        return claimReport(board, result);
      }
      if (action === 'release') {
        if (paths.length === 0) {
          board.releaseAll(params.reason || 'released');
          return text('Released all of your file leases.', { released: 'all' });
        }
        const result = board.release(paths, params.reason || 'released');
        const lines = [];
        for (const claim of result.released || []) lines.push('released ' + claim.path);
        for (const claim of result.denied || []) {
          lines.push('DENIED ' + claim.path + ' is owned by ' + (claim.agentName || claim.agent));
        }
        if (lines.length === 0) lines.push('No matching leases.');
        return text(lines.join('\n'), {
          released: (result.released || []).map((claim) => claim.path),
          denied: (result.denied || []).map((claim) => claim.path),
        });
      }
      throw new Error('team_claim action must be claim, release, or list');
    },
  };

  return [teamStatus, teamRoster, teamClaim];
}
