---
status: implemented
date: 2026-11-02
description: Add a native Pi coding-agent adapter over the generic godview board,
  reusing the store and exposing a TUI-only panel.
raised-by: agent
decided-by: human
created: 2026-11-02
commit: 9f1f09d
paths:
  - package.json
  - packages/pi-god-view/package.json
  - packages/pi-god-view/extensions/pi-god-view.js
  - packages/pi-god-view/lib/session.js
  - packages/pi-god-view/lib/tools.js
  - packages/pi-god-view/lib/guard.js
  - packages/pi-god-view/test/pi-god-view.test.mjs
  - packages/pi-god-view/README.md
  - packages/pi-god-view/README.en.md
  - .changeset/config.json
  - AGENTS.md
  - README.md
  - README.en.md
  - docs/protocol.md
---

# ADR: 26 Add a native Pi coding agent adapter

## Problem

The DSH adapter is host-specific: it needs Cordis, a DSH profile, and a browser
module loader. The generic store is deliberately host-neutral, and the Pi coding
agent is another TUI-first host that can run parallel sessions in one repository.
Those sessions need the same presence, file leases, and claim/release timeline,
but the DSH host and browser panel cannot run inside Pi. Copying the store into a
second host adapter would create two sources of truth and two incompatible boards.

## Decision

Add `packages/pi-god-view` as a third public workspace package. It is a native Pi
extension, not a browser app and not a DSH bundle:

- The extension entry is declared through `pi.extensions` and the package carries
  the `pi-package` keyword. It is plain ESM JavaScript with no build step and
  imports only `godview`; it never imports DSH, Cordis, React, or browser modules.
- `session_start` maps one Pi session to one board agent named
  `pi-<hash(sessionId)>`, writes presence into the repository's `.dsh/parallel/`,
  registers the root in the global index, and starts a heartbeat. The first user
  prompt supplies the one-line focus. `agent_settled` marks the session idle and
  releases its automatic leases; `session_shutdown` releases all of its leases
  and leaves a `done` row.
- The extension registers exactly the same three tools as the DSH adapter:
  `team_status`, `team_roster`, and `team_claim`, with plain JSON Schemas. They
  operate on the same store and the same per-repository board.
- Pi's `tool_call` event guards `write` and `edit`: a live claim held by another
  agent blocks the call, and an unclaimed in-repository path is auto-claimed.
  Reads, shell commands, and paths outside the repository are not guarded.
- `/godview` toggles a read-only TUI widget and status line for the current
  repository, refreshed every 2.5 seconds. v1 has no browser panel, project rail,
  Gantt, or coordination switch. `/godview off` hides the widget only; the
  extension coordinates while it is installed.
- `pi-god-view` joins the fixed changeset group with `godview` and
  `dsh-god-view`. Its registry dependency on `godview` is the same `^0.1.0` line
  the DSH adapter uses, so the two hosts render one board rather than two.

## Alternatives considered

- Reuse the DSH host and browser client inside Pi: rejected because the host
  needs Cordis and a DSH profile, and the client is a browser bundle. It would
  pull a large host dependency tree into Pi and still would not fit the TUI.
- Fork the store into `pi-god-view`: rejected because presence, claims, changes,
  and timelines would diverge. The shared `.dsh/parallel/` format is the point of
  the core split in ADR 25.
- Deliver a browser panel through `pi-web` or Pi RPC first: rejected for v1
  because those are third-party or extra surfaces; a native TUI widget is the
  smallest useful adapter and can be verified without a second server.
- Build a full-screen custom TUI: rejected because a widget and one status line
  already answer who is active, what is leased, and what changed; a custom screen
  adds navigation and rendering code without changing the board semantics.
- Put the adapter in a separate repository: rejected because it evolves with the
  store and must be released in lockstep with the fixed group.

## Consequences

### Verification

- `npm run test -w pi-god-view` passes seven tests: presence start/stop, focus
  from a prompt, conflicting write denial, auto-claim on a free path, the three
  tools, panel lines, extension registration, and the package manifest.
- `npm test` passes all three workspace suites, and `npm run lint` passes.
- The package declares `pi.extensions` and the `pi-package` keyword, depends on
  `godview@^0.1.0`, and has no DSH, Cordis, React, or browser import.
- `node --check` passes for the extension, session, tools, guard, and test files.
- `npm pack --workspace pi-god-view` produced eight files with the extension,
  three lib modules, both READMEs, LICENSE, and package.json. A temporary npm
  project installed the tarball, resolved `godview@0.1.0`, and loaded the
  extension; it registered the three tools and `/godview`.
- Pi CLI 1.4.0 recognized the local package through `pi install` and `pi list
  --approve`. An RPC `get_commands` returned `godview` both with an explicit
  `-e` path and through project package discovery. `session_start` wrote a
  `pi-...` presence row and shutdown left it `status: done`.
- An RPC prompt for `/godview` returned `disposition: handled` and emitted
  `setWidget` (key `godview`, two lines) plus `setStatus`; the TUI panel path is
  exercised without a model.
- `adrkit validate --all` passes, and `adrkit relevant` can retrieve this record
  for the Pi package paths.

### Trade-offs

- The Pi adapter is active while the extension is installed. Unlike the DSH host
  it has no coordination switch in v1; users remove the extension to stop it.
  This is a deliberate scope cut, not a dormant mode.
- The TUI panel shows the current repository only. The global project index is
  still written, but the Pi panel does not render a project rail across repos.
- The write/edit guard is not a sandbox: shell edits and `run_code` remain
  outside the lease system, exactly as with the DSH adapter.
- The fixed group means a core-only change still releases all three packages.
  That is intentional while the board format is shared.
- `agentIdForSession` in the core still hardcodes the DSH prefix. The Pi adapter
  computes its own `pi-` id instead of changing the generic helper, so existing
  DSH board rows keep their ids.
