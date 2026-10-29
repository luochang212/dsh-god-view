# AGENTS.md

## What this repository is

A DSH (DeepSeek Harness) plugin plus a small CLI for parallel agents working in one or more repositories.

It has exactly three jobs:

1. Show who is active and their one-line focus.
2. Lease files so two agents do not edit the same path at the same time.
3. Show a claim/release timeline (who held which file, from when, until when).

Version: 0.3.0. Protocol: 3. No build step. Runtime is plain ESM JavaScript on Node >= 20.

Read README.md (Chinese) or README.en.md (English) and docs/protocol.md before changing behavior.

## Non-negotiable product shape

- The panel is read-only. There is no data input. Refresh is the only action button; project rows are navigation buttons. Do not add a composer, message box, reply box, question queue, or human input.
- There are no messages. There is no team_send, inbox, needsReply, read state, reply_to, message TTL, or "Agent questions" section. Do not reintroduce them without an explicit request.
- Focus is a property of the current session at the current time. It is not a message and has no lifecycle.
- Boards are per repository. A claim in repo A must never block repo B.
- The global project index only aggregates status. It must not merge claims, timelines, or leases across repositories.
- There are exactly three tools: team_status, team_roster, team_claim. Adding a tool is a product decision, not a small refactor.
- The browser panel is a two-pane master-detail layout: full-height project rail on the left, selected project detail on the right. Do not move the project list back to large cards above the Gantt.
- The project rail footer shows the selected project's active-session and files-in-use counts. The rail must reach the bottom of the panel; do not let it float or stop after the last project row.
- The Gantt is the primary timeline view. Keep an exact-time detail list available under the details element.

## Architecture

### Files

| Path                      | Responsibility                                                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| lib/store.js              | Shared file format and all local persistence. Source of truth for presence, claims, changes, timeline, project summaries, global registry. |
| lib/index.js              | DSH host plugin. Lifecycle, tools, write guard, prompt context, HTTP routes, project discovery.                                            |
| lib/client.js             | Browser bundle loaded through window.**ModuleLoader**. Read-only project rail, sessions, Gantt, details.                                   |
| bin/dsh-parallel.mjs      | Dependency-free CLI over the same store.                                                                                                   |
| test/store.test.mjs       | Store, timeline, registry, concurrency, CLI tests.                                                                                         |
| test/host-smoke.mjs       | Host lifecycle, tools, write guard, projects endpoint.                                                                                     |
| test/ui-flow.cjs          | Read-only assertions and screenshots against the running desktop host.                                                                     |
| test/ui-shot.cjs          | Screenshot helper.                                                                                                                         |
| examples/cordis.patch.yml | Profile install example.                                                                                                                   |
| docs/protocol.md          | Wire and file formats, HTTP surface, migration notes.                                                                                      |
| adr/                      | Architecture decision records maintained with adr-kit. Read relevant implemented records before changing scoped behavior.                  |

### Data layout

Per repository:

```text
<repo>/.dsh/parallel/
  config.json
  agents/<agent-id>.json
  claims/<sha1(repo-relative-path)>.json
  changes/<change-id>.json
```

Global index:

```text
~/.dsh/parallel/projects.json
```

The registry is only a recent-project index. Each board remains the source of truth.

### Runtime flow

- The host resolves a board root from each agent's session cwd. config.root is optional and empty by default; if set, it forces one repository for compatibility.
- track() registers the root in the global index.
- presence is written per agent; focus is updated from the first user/subagent prompt and by team_status.
- write/edit goes through tools/pre-execute. A live claim owned by another agent is denied. The configured claimPolicy controls auto/advisory/require/off behavior.
- claim creates or extends the agent's active change and appends claim events to its timeline.
- release removes the lease, appends release events, and marks the change done when no leases remain.
- idle releases auto claims; status done releases all of that agent's claims; session disposal releases all.
- expiry removes leases and appends expire events.
- GET /projects merges known roots and the global registry, then calls projectSummary() on each board.
- GET /state?root=<abs> returns one board. The browser uses that for the detail pane.

### Browser plugin

- package.json declares dsh.client.platform = web.
- lib/client.js registers sidebar.panellist and main through ctx.slots.
- The panel is mounted under the Agent 协作台 / Agents sidebar entry.
- Client code must use only browser APIs and the module loader; no Node imports.
- There is no bundler step in this repository. A page refresh loads the latest client.js.

## Architecture decisions

This repository uses adr-kit. Decisions live in adr/implemented/, proposals in adr/proposed/, rejected anti-patterns in adr/rejected/, and frozen history in adr/archived/.

At the start of a task:

1. Run adrkit list.
2. Read the relevant implemented/ records in full; do not filter by title alone.
3. Check relevant proposed/ records for intent and rejected/ records for known bad cases.
4. Consult archived/ only when a record or task cites history.
5. When a task targets files, run adrkit relevant <path> to find scoped records.

Current implemented decisions cover:

- [ADR 1](adr/implemented/1-use-per-repository-coordination-boards-with-a-global-read-only-project-index.md): per-repository boards and the global project index.
- [ADR 2](adr/implemented/2-drop-inter-agent-messages-keep-focus-claims-and-timeline.md): no messages, no inbox, no human input; focus is a property.
- [ADR 3](adr/implemented/3-model-occupancy-as-a-claim-release-timeline-rendered-as-a-per-file-gantt.md): timeline and Gantt as the occupancy model.
- [ADR 4](adr/implemented/4-make-the-project-list-a-full-height-navigation-rail-not-page-content.md): full-height project rail as navigation.
- [ADR 5](adr/implemented/5-keep-the-board-to-one-read-only-screen-and-three-concepts.md): one read-only screen and three concepts; no tabs, cards, feeds, setup, or composer.
- [ADR 6](adr/implemented/6-record-conversation-identity-intent-paths-and-release-state-on-every-change.md): change records carry conversation identity, intent, paths, and release state.
- [ADR 7](adr/implemented/7-use-short-lived-auto-leases-plus-explicit-planned-leases.md): auto leases for writes, explicit leases for planned work, idle release and TTL.

When a choice is already shipped, use adrkit record with --raised-by and --decided-by. When it is not shipped, use adrkit propose, then adrkit implement after it ships. Do not edit a numbered record to change its choice; supersede or archive it with a new record. Run adrkit validate --all before finishing.

## Commands

```sh
npm test                                  # store tests only (test/*.test.mjs)
node --test test/store.test.mjs           # explicit store/timeline/concurrency/CLI tests
node test/host-smoke.mjs                  # host tools, guard, /projects, /claim, /release
node test/ui-flow.cjs                     # read-only UI; needs the desktop host + Playwright
node test/ui-shot.cjs                     # write ignored screenshots/local/01-panel.png and 03-dark.png
```

Syntax check before finishing:

```sh
for f in lib/store.js lib/index.js lib/client.js bin/dsh-parallel.mjs test/store.test.mjs test/host-smoke.mjs; do node --check "$f"; done
```

The UI tests assume the desktop DSH GUI is already running at the configured URL, Playwright is available through the machine-level node_modules, and the desktop auth cookie is available. The helper scripts handle that environment; do not hardcode secrets into documentation or source.

UI tests write to screenshots/local/, which is ignored. Never commit those captures: they contain live session data. The README image at screenshots/01-panel.png is a sanitized demo illustration and must be updated deliberately, never by a test run.

Enable the local pre-commit hook once per clone:

```sh
git config core.hooksPath .githooks
```

The hook runs format:check, lint, store tests, host smoke, and adr validate. CI runs the same checks plus npm ci on Node 24.

## Local install and reload

Typical profile install:

```sh
PROFILE="$HOME/.dsh/profiles/desktop"
mkdir -p "$PROFILE/node_modules"
ln -sfn /absolute/path/to/dsh-parallel "$PROFILE/node_modules/dsh-parallel"
```

Profile row:

```yaml
- insert:
    - id: parallel
      name: dsh-parallel
      config:
        heartbeatMs: 15000
        ttlMs: 60000
        claimPolicy: auto
        autoClaimTtlMs: 600000
        releaseAutoOnIdle: true
```

Keep root empty for multi-project monitoring. Set registryDir only if the default ~/.dsh/parallel is wrong.

Reloading:

- Host changes: update the profile patch timestamp or restart the host, then refresh the page.
- Client changes: refresh the page. No build step.
- The panel polls /projects and /state about every 2.5 seconds.

## Invariants and pitfalls

- Do not add a global lock. Parallel work across different repositories is intentional.
- Do not make the project index a second source of truth. It stores roots and lastSeenAt; board data comes from each .dsh/parallel.
- Do not merge claims from different roots in the UI.
- Claims are exact paths. No directories or globs.
- The write guard covers write/edit, not arbitrary bash or run_code shell edits.
- Paths are normalized against the repository root. Never allow absolute paths outside the repo or .. escapes.
- Timeline events are append-only per change. Claim, release, and expire events must include at, agentName, path, and intent/summary.
- One active change per agent. A new claim joins the active change; release the old change before starting a new one.
- Auto claims release on idle. Explicit claims need an explicit release or TTL expiry. If a claim looks stale, check whether the owning session is still running before forcing a release.
- Focus and claims are separate. A file is not leased just because it appears in focus or files.
- The project rail is full-height and sticky. The project list scrolls; the footer stays at the bottom.
- The rail must show status at a glance: dot, name, active/claims/active-change counts, last activity.
- Keep the read-only control count at zero. The UI test asserts controls = 0.
- A page refresh is required after client changes; a host reload is required after lib/index.js changes.
- Protocol changes are breaking. If a file shape or route changes incompatibly, bump PROTOCOL and update README, docs/protocol.md, tests, and the migration section.
- Protocol 2 boards may still exist. Old messages are ignored and can be deleted. Presence/claim/change files without timelines get a fallback timeline from createdAt/releasedAt.
- The global registry is capped at 200 entries. Clean up demo roots rather than leaving fake projects in it.
- Do not leave active claims after verification. Run node bin/dsh-parallel.mjs claims and release what you created.
- Do not put volatile live state (current PIDs, session ids, claim counts) into README or AGENTS.md.

## Editing rules

- Keep the runtime dependency-free. Store, host, CLI, and client should use only Node/browser built-ins plus the DSH/Cordis APIs already in use.
- Keep the host/client split. The browser must not import lib/store.js or any Node module.
- Use atomic JSON writes (writeJsonAtomic) for board files and the registry.
- Prefer small, explicit functions over generic frameworks. This plugin intentionally has three concepts.
- Do not add a build system, a database, a daemon, or a second websocket.
- When changing the UI, verify both light and dark themes and take a screenshot at 1280x900.
- When changing the store or host, add or update a test that fails before the change and passes after.
- Keep README.md, README.en.md, and docs/protocol.md in sync with behavior. If you remove a concept, remove its docs and tests in the same change.
- Chinese UI labels and English fallbacks are required. Use the L() helper.

## Definition of done

Before reporting completion:

1. node --check passes for every changed .js/.mjs file.
2. node --test test/store.test.mjs passes.
3. node test/host-smoke.mjs passes.
4. node test/ui-flow.cjs reports CONTROLS 0, HAS_PROJECTS true, HAS_TIMELINE true, and no console errors.
5. node bin/dsh-parallel.mjs claims reports no active claims, or every remaining claim is intentional and explained.
6. Screenshots are refreshed when UI changed.
7. README.md, README.en.md, and docs/protocol.md reflect the final behavior.
8. No message/inbox/question code has been reintroduced.
9. adrkit validate --all passes; update or add an ADR when a key decision changes.
