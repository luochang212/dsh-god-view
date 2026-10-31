# AGENTS.md

## What this repository is

A DSH (DeepSeek Harness) plugin plus a small CLI for parallel agents working in one or more repositories.

It has exactly three jobs:

1. Show who is active and their one-line focus.
2. Lease files so two agents do not edit the same path at the same time.
3. Show a claim/release timeline (who held which file, from when, until when).

Version: 0.3.0. Protocol: 3. The plugin has no build step; runtime is plain ESM JavaScript on Node >= 20. The separate `site/` project builds the ADR archive with Astro.

Read README.md (Chinese) or README.en.md (English) and docs/protocol.md before changing behavior.

## Non-negotiable product shape

- Coordination is on by default and only a human changes it. With the switch off the plugin is dormant: no board directory, no presence, no leases, no history, no prompt context, and no write guard. One switch in the panel header turns it off and on. See [ADR 20](adr/implemented/20-turn-coordination-on-by-default.md); it supersedes ADR 9's default.
- The panel is read-only apart from that one switch. There is no data input and no refresh button; the panel polls by itself. Project rows are navigation buttons. Do not add a composer, message box, reply box, question queue, or human input.
- There are no messages. There is no team_send, inbox, needsReply, read state, reply_to, message TTL, or "Agent questions" section. Do not reintroduce them without an explicit request.
- Focus is a property of the current session at the current time. It is not a message and has no lifecycle.
- Boards are per repository. A claim in repo A must never block repo B.
- The global project index only aggregates status. It must not merge claims, timelines, or leases across repositories.
- There are exactly three tools: team_status, team_roster, team_claim. Adding a tool is a product decision, not a small refactor.
- The browser panel is a two-pane master-detail layout: project detail on the left, full-height project rail on the right, collapsible to zero from the topbar. The rail carries no brand block. The panel's name lives on the host sidebar entry. Do not move the project list back to large cards above the Gantt, and do not move the rail back to the left edge (the host's own sidebar is there).
- The rail lists active boards only: a working or blocked session, a live lease, or real activity within the last 30 minutes. A session whose only sign of life is the heartbeat is not active. Idle boards are hidden; with none active the page is one quiet blank state, never empty section boxes. See [ADR 11](adr/implemented/11-list-active-projects-only-and-give-an-empty-board-one-quiet-blank-page.md) and [ADR 16](adr/implemented/16-define-active-as-recent-work-with-a-30-minute-window.md).
- The rail is a list and nothing else: no caption, no count, no footer. Per-project numbers live on the rows; there is no panel-level total. The rail must reach the bottom of the panel; do not let it float or stop after the last project row.
- The Gantt is the only timeline surface in the panel. Exact times come from the bar tooltip; the full event record lives in the CLI. Do not add an event list under the Gantt. See [ADR 14](adr/implemented/14-show-the-gantt-only-and-move-exact-times-into-the-bar-tooltip.md).

## Architecture

### Files

| Path                        | Responsibility                                                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| lib/store.js                | Shared file format and all local persistence. Source of truth for presence, claims, changes, timeline, project summaries, global registry. |
| lib/index.js                | DSH host plugin. Lifecycle, tools, write guard, prompt context, HTTP routes, project discovery.                                            |
| lib/client.js               | Browser bundle loaded through window.**ModuleLoader**. Read-only project rail, sessions, Gantt.                                            |
| bin/dsh-god-view.mjs        | Dependency-free CLI over the same store.                                                                                                   |
| test/store.test.mjs         | Store, timeline, registry, concurrency, CLI tests.                                                                                         |
| test/host-smoke.mjs         | Host lifecycle, dormant/enabled coordination, tools, write guard, HTTP routes.                                                             |
| test/client-locale.test.mjs | Client language source, live locale switching, and the coordination switch, driven through the real browser bundle.                        |
| test/ui-flow.cjs            | Read-only assertions and screenshots against the running desktop host.                                                                     |
| test/ui-lang.cjs            | Cold-start language regression against the running desktop host (delayed native locale bridge).                                            |
| test/ui-shot.cjs            | Screenshot helper.                                                                                                                         |
| examples/cordis.patch.yml   | Profile install example.                                                                                                                   |
| docs/protocol.md            | Wire and file formats, HTTP surface, migration notes.                                                                                      |
| adr/                        | Architecture decision records maintained with adr-kit. Read relevant implemented records before changing scoped behavior.                  |
| site/                       | Private Astro project that publishes the ADR archive to GitHub Pages. Generated atlas pages and src/data/decisions.json are not committed. |
| .github/workflows/site.yml  | Rebuilds the atlas and deploys site/dist to GitHub Pages on pushes that touch site/, adr/, or the manifests.                               |

### Data layout

Per repository:

```text
<repo>/.dsh/parallel/
  config.json
  agents/<agent-id>.json
  claims/<sha1(repo-relative-path)>.json
  changes/<change-id>.json
```

Global index and switch:

```text
~/.dsh/parallel/projects.json
~/.dsh/parallel/state.json      # the coordination switch is { "enabled": true|false }
```

The registry is only a recent-project index. Each board remains the source of truth.

### Runtime flow

- The host reads the coordination switch from the registry dir before anything writes. When it is off the host only tracks sessions in memory and refreshes the project index; it never creates a board, a presence row, a lease, or a change.
- The host resolves a board root from each agent's session cwd. config.root is optional and empty by default; if set, it forces one repository for compatibility.
- track() registers the root in the global index.
- presence is written per agent; focus is updated from the first user/subagent prompt and by team_status. Every user/subagent prompt also touches `updatedAt`, which is the activity clock.
- The heartbeat (`heartbeatAt` + TTL) only proves the host process is alive and drops stale rows. `updatedAt`, claim timestamps, and change timestamps are the activity signals. projectSummary counts a board active when a session is working or blocked, a lease is live, or `lastActivityAt` is within `ACTIVE_WINDOW_MS` (30 minutes); the heartbeat is never used as activity.
- write/edit goes through tools/pre-execute. A live claim owned by another agent is denied. The configured claimPolicy controls auto/advisory/require/off behavior.
- claim creates or extends the agent's active change and appends claim events to its timeline.
- release removes the lease, appends release events, and marks the change done when no leases remain.
- idle releases auto claims; status done releases all of that agent's claims; session disposal releases all.
- expiry removes leases and appends expire events.
- GET /projects merges known roots and the global registry, then calls projectSummary() on each board.
- GET /state?root=<abs> returns one board plus the coordination status. The browser uses that for the detail pane.
- GET /coordination returns the switch state and how many sessions the host tracks; POST /coordination {enabled} flips it, backfills presence when turning on, and releases this host's auto leases when turning off.

### Browser plugin

- package.json declares dsh.client.platform = web.
- lib/client.js registers sidebar.panellist and main through ctx.slots.
- The panel is mounted under the 上帝视角 / God's Eye sidebar entry.
- The header carries the coordination switch (role=switch, data-coordination=on|off|unavailable). It POSTs /coordination and re-reads state; when the running host predates the route the switch renders disabled instead of breaking the panel.
- UI language comes from the injected `locale` service (`ctx.locale.getSnapshot()` / `ctx.locale.subscribe`), never from a module-time read of `<html lang>`; see [ADR 8](adr/implemented/8-take-the-client-ui-language-from-the-host-locale-service.md). The sidebar label is registration metadata, so it is re-registered when the language changes.
- Client code must use only browser APIs and the module loader; no Node imports.
- The plugin has no bundler step. A page refresh loads the latest client.js. The separate site/ project has an Astro build for the published archive.
- The panel is a full-bleed app shell: a 56px topbar (project name/path and the coordination switch), one scrolling content area, and a 264px rail on the right that is a bare list of active projects and collapses to zero. Rail fill is `--dsw-specific-sidebar-fill`. The rail toggle is pinned to the panel's top-right corner (14px inset) so it does not move when the rail collapses; the rail opens with a 56px top band (the topbar's height, leaving 20px between the button and the first row) and the topbar reserves 44px at its right edge so neither runs under the toggle. The content area, not the topbar's column, is the scroll container.

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
- [ADR 8](adr/implemented/8-take-the-client-ui-language-from-the-host-locale-service.md): UI language comes from the injected locale service, not the served document.
- [ADR 9](adr/implemented/9-default-coordination-off-behind-one-panel-switch.md): one panel switch owns the mode; its off-by-default choice is superseded by ADR 20.
- [ADR 10](adr/implemented/10-treat-the-panel-as-an-app-shell-with-logo-rail-topbar-and-scrolling-content.md): the panel is a full-bleed app shell with a 56px topbar, independently scrolling content, and a rail (now on the right with no brand block, per ADR 17 and ADR 19).
- [ADR 11](adr/implemented/11-list-active-projects-only-and-give-an-empty-board-one-quiet-blank-page.md): the rail lists active projects only; an empty board is one quiet blank page.
- [ADR 12](adr/implemented/12-use-a-repo-owned-radiant-eye-mark-instead-of-a-library-icon.md): the brand mark is a repo-owned radiant eye, not a library icon.
- [ADR 13](adr/implemented/13-let-the-topbar-carry-only-the-coordination-switch.md): the topbar carries only the switch. There is no live indicator and no label.
- [ADR 14](adr/implemented/14-show-the-gantt-only-and-move-exact-times-into-the-bar-tooltip.md): the Gantt is the only timeline surface; no event list under it.
- [ADR 15](adr/implemented/15-compose-the-content-area-as-two-section-cards-on-a-tinted-page.md): the content area is section cards with in-card headers and hairline rows, not outlined boxes; ADR 17 replaced the page tint with the host bg-base.
- [ADR 16](adr/implemented/16-define-active-as-recent-work-with-a-30-minute-window.md): active means recent work (30 minutes), working/blocked, or a live lease; the heartbeat only filters dead hosts.
- [ADR 17](adr/implemented/17-put-the-rail-on-the-right-collapse-it-to-zero-and-borrow-host-chrome.md): the rail sits on the right, collapses to zero, and the chrome uses host tokens and the host Switch.
- [ADR 18](adr/implemented/18-drop-the-coordination-off-banner.md): no coordination-off banner; the switch alone carries the state.
- [ADR 19](adr/implemented/19-strip-the-rail-to-a-bare-list-and-pin-the-toggle-to-the-panel-corner.md): the rail is one bare list, and the rail toggle is pinned to the panel corner.
- [ADR 20](adr/implemented/20-turn-coordination-on-by-default.md): coordination is on by default; a human turns it off.
- [ADR 21](adr/implemented/21-publish-the-decision-archive-as-a-separate-astro-site-on-github-pages.md): the ADR archive is a separate Astro site on GitHub Pages; generated atlas files are not committed.

When a choice is already shipped, use adrkit record with --raised-by and --decided-by. When it is not shipped, use adrkit propose, then adrkit implement after it ships. Do not edit a numbered record to change its choice; supersede or archive it with a new record. Run adrkit validate --all before finishing.

## Commands

```sh
npm test                                  # store + client-locale tests (test/*.test.mjs)
node --test test/store.test.mjs           # explicit store/timeline/concurrency/CLI tests
node test/host-smoke.mjs                  # host tools, guard, /projects, /claim, /release
node test/ui-flow.cjs                     # read-only UI + the one switch; needs the desktop host + Playwright
node test/ui-lang.cjs                     # cold-start language regression; needs the desktop host + Playwright
node test/ui-shot.cjs                     # write ignored screenshots/local/01-panel.png and 03-dark.png
npm run site:build                        # generate the atlas and build site/dist; run npm ci in site first
npm run site:dev                          # local preview at the Pages base path
```

Syntax check before finishing:

```sh
for f in lib/store.js lib/index.js lib/client.js bin/dsh-god-view.mjs test/store.test.mjs test/host-smoke.mjs; do node --check "$f"; done
```

The UI tests assume the desktop DSH GUI is already running at the configured URL, Playwright is available through the machine-level node_modules, and the desktop auth cookie is available. The helper scripts handle that environment; do not hardcode secrets into documentation or source.

UI tests write to screenshots/local/, which is ignored. Never commit those captures: they contain live session data. The READMEs carry no panel screenshot while the UI is still changing fast.

Enable the local pre-commit hook once per clone:

```sh
git config core.hooksPath .githooks
```

The hook runs format:check, lint, store tests, host smoke, and adr validate. CI runs the same checks plus npm ci on Node 24. The separate site workflow builds and deploys the archive on pushes that touch site/ or adr/.

## Local install and reload

Typical profile install:

```sh
PROFILE="$HOME/.dsh/profiles/desktop"
mkdir -p "$PROFILE/node_modules"
ln -sfn /absolute/path/to/dsh-god-view "$PROFILE/node_modules/dsh-god-view"
```

Profile row:

```yaml
- insert:
    - id: dsh-god-view
      name: dsh-god-view
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
- The project rail is full-height and fixed; the detail pane is the scroll container. The list scrolls independently and runs to the bottom of the rail; there is no footer to keep anchored any more (ADR 19).
- The rail must show status at a glance: dot, name, working/blocked/claims/change counts, last activity.
- The rail lists only boards with a working/blocked session, a live lease, or activity within 30 minutes; a heartbeat alone is not a reason to list a board. When the selected board goes idle, selection moves to the first active board; with none, the blank page renders and the content has zero sections. Do not add a filter control, a second list, or a placeholder box to bring idle boards back.
- The panel has exactly two controls, both chrome: the coordination switch (mode) and the rail toggle (layout). The UI test asserts one switch, one toggle, and zero inputs/selects/textareas. Never put a control inside the rail: collapsing it must not hide a decision.
- Turning coordination off must release this host's auto leases; explicit leases are left to their owner. The switch never flips itself: it starts on (ADR 20) and only a human turns it off.
- A dormant host must leave no board behind. If a change makes the plugin write to .dsh/parallel while the switch is off, that is a bug.
- A page refresh is required after client changes; a host reload is required after lib/index.js changes.
- Protocol changes are breaking. If a file shape or route changes incompatibly, bump PROTOCOL and update README, docs/protocol.md, tests, and the migration section.
- Protocol 2 boards may still exist. Old messages are ignored and can be deleted. Presence/claim/change files without timelines get a fallback timeline from createdAt/releasedAt.
- The global registry is capped at 200 entries. Clean up demo roots rather than leaving fake projects in it.
- Do not leave active claims after verification. Run node bin/dsh-god-view.mjs claims and release what you created.
- Do not put volatile live state (current PIDs, session ids, claim counts) into README or AGENTS.md.

## Editing rules

- Keep the runtime dependency-free. Store, host, CLI, and client should use only Node/browser built-ins plus the DSH/Cordis APIs already in use.
- Keep the host/client split. The browser must not import lib/store.js or any Node module.
- Use atomic JSON writes (writeJsonAtomic) for board files and the registry.
- Prefer small, explicit functions over generic frameworks. This plugin intentionally has three concepts.
- Do not add a build system to the plugin runtime, a database, a daemon, or a second websocket. The separate site/ project may use Astro, and its dependencies stay in site/package.json.
- When changing the UI, verify both light and dark themes and take a screenshot at 1280x900.
- When changing the store or host, add or update a test that fails before the change and passes after.
- Keep README.md, README.en.md, and docs/protocol.md in sync with behavior. If you remove a concept, remove its docs and tests in the same change.
- Chinese UI labels and English fallbacks are required. Use the L() helper.

## UI conventions

- Type uses the --pt-fs-\* tokens; do not add one-off 11.5/12.5/13.5 sizes for new UI.
- Spacing uses the --pt-gap-\* tokens; keep section, row, and rail rhythm consistent.
- Any name, path, focus, or meta line that can overflow must be single-line ellipsized with a title or accessible tooltip. Do not let a row reflow or grow unpredictably.
- Action buttons are 30px high, use icon + label by default, and have a visible :focus-visible ring. Icon-only actions need an aria-label and title.
- The coordination switch is a copy of the host's own `Switch`: a role=switch button, 36x20, 2px padding, 999px radius, `corner-shape: round` on track and thumb (the host sets a global superellipse and the switch opts out), no shadow on the thumb, no track transition, `border-l3` track, `brand-primary` when on, a 16px thumb (`switch-thumb` off, `label-primary-foreground` on) travelling 16px with a 120ms transform, and a 2px `focus-ring` outline falling back to `state-business-primary`. Never a checkbox input; the read-only test counts input/select/textarea and requires zero.
- A selected rail row is marked by the host's `bg-multi-select` fill only: no accent bar, side marker, or border on the row. Section and rail headers use the shared Icon component; status dots use one vocabulary. A project dot breathes only while a session is working (red blocked, amber claimed, grey recent-only), and the motion stops with a prefers-reduced-motion off switch.
- UI labels are 会话 / 进行中 / 受阻 / 占用 / 变更, plus the umbrella 活跃项目. Never label a heartbeat or a live session as 在线 or 活跃.
- The content area is section cards, not boxes: one card per concept with its header inside, rows divided by `border-l1` hairlines, `elevation-soft` plus a 12px radius instead of a 1px border, on the host's plain `bg-base` (no hand-mixed page tint). Do not give individual rows their own border, radius or shadow; do not add a card where there is nothing to show (ADR 15, ADR 17).
- The brand mark is the repo's own radiant eye (24x24, ring r=4.4, pupil r=1.4, eight rays r=8.2-10.6, 1.7 stroke); it appears only on the host sidebar entry and on the blank page, never in the rail header. It is not a lucide icon; do not swap it for a library glyph without a decision record, and re-check 18-19px legibility if you change the ray count.
- Keep the project rail and session rows stable in height; text length must not change the layout of neighboring rows.

## Definition of done

Before reporting completion:

1. node --check passes for every changed .js/.mjs file.
2. node --test test/store.test.mjs passes.
3. node test/host-smoke.mjs passes.
4. node test/ui-flow.cjs reports CONTROLS 0, SWITCHES 1, HAS_PROJECTS true, and no console errors. It also asserts one rail toggle and that the rail collapses to zero and restores. When it also prints ACTIVE_ROWS true, HAS_TIMELINE must be true; with no active project the blank page renders instead. When it prints SWITCH_STATE unavailable, the running host predates the coordination route: restart the host and rerun before calling the UI verified.
5. node bin/dsh-god-view.mjs claims reports no active claims, or every remaining claim is intentional and explained.
6. Screenshots are refreshed when UI changed.
7. README.md, README.en.md, and docs/protocol.md reflect the final behavior.
8. No message/inbox/question code has been reintroduced.
9. adrkit validate --all passes; update or add an ADR when a key decision changes.
10. When site/, adr/, or the site workflow changed, run npm run site:build and confirm the archive builds.
