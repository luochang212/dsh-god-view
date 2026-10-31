<div align="right">
  <a href="README.md"><img src="https://img.shields.io/badge/-%E7%AE%80%E4%BD%93%E4%B8%AD%E6%96%87-545759?style=for-the-badge" alt="简体中文" /></a>
  <a href="README.en.md"><img src="https://img.shields.io/badge/-English-A31F34?style=for-the-badge" alt="English" /></a>
</div>

# God's Eye View

**dsh-god-view** · a read-only DSH board for parallel agents

<p>
  <img src="https://img.shields.io/badge/version-0.3.0-0e7490?style=flat-square" alt="version" />
  <img src="https://img.shields.io/badge/protocol-3-0e7490?style=flat-square" alt="protocol" />
  <img src="https://img.shields.io/badge/DSH-plugin-0e7490?style=flat-square" alt="DSH plugin" />
  <img src="https://img.shields.io/badge/node-%3E%3D20-0e7490?style=flat-square" alt="node" />
  <img src="https://img.shields.io/badge/license-MIT-0e7490?style=flat-square" alt="license" />
  <a href="https://github.com/luochang212/dsh-god-view/actions/workflows/ci.yml"><img src="https://github.com/luochang212/dsh-god-view/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
</p>

**Let multiple agents in one repository see each other, avoid editing the same file at the same time, and leave a reviewable occupancy timeline.**

It is not a chat tool and not a human control panel. It is a read-only coordination board:

- who is doing what (a one-line focus per session);
- which file is currently held, and by whom (a file lease);
- when it was claimed, when it was released, and by whom (a claim/release timeline).

## 🔌 On by default, off whenever you want

Coordination exists so parallel agents do not step on each other, so it is **on by default**: writes register leases and a file held by someone else is rejected.

When you do not need it, turn the coordination switch off in the panel header. While it is off the plugin does nothing: no board directory, no presence rows, no file leases, no write guard, and no prompt context. A single agent edits at full speed with no overhead.

- Turning it off releases the automatic leases this host holds and freezes the history instead of deleting it.
- Turning it back on does not back-claim files already being edited; protection starts at the next write.
- The switch never flips itself.

## ✨ What it solves

When several agents work in one repository, the hard part is usually not writing code. It is:

- not knowing what the others are doing;
- editing the same file and overwriting each other;
- being unable to say who touched which file, and when.

God's Eye View does exactly three things:

| Capability        | What it does                                               |
| ----------------- | ---------------------------------------------------------- |
| **Presence**      | One line of focus per session, visible to peers            |
| **Claim / Lease** | Reserve a file before writing; live conflicts are rejected |
| **Timeline**      | Record every claim, release, and expiry as a Gantt chart   |

There is no message queue, no inbox, and no "needs reply" state. Focus is a property of the current session: it needs no answer and has no lifecycle.

## 🧠 Three concepts

### Presence: one line saying "what I am doing"

Each DSH session has a presence row in its repository:

- focus: one line about current work;
- status: active / idle / blocked / done (the panel/CLI show done as "ended");
- heartbeat: proof that the session is alive;
- sessionTitle: the human-readable conversation title.

Focus is inferred from the first user/subagent prompt and can be updated with team_status.

### Claim: a lease on a file

An agent takes a lease before writing:

- default **auto**: the first write/edit creates an auto claim;
- a live claim owned by another agent denies the write;
- the same agent can renew its own claim;
- auto claims are released when the agent goes idle;
- explicit claims need an explicit release, or expire after their TTL.

Claims are exact file paths. Directories and globs are not supported.

### Change: the claim/release timeline

Every claim belongs to a change:

- which session (sessionId + sessionTitle);
- what is being changed (intent);
- which files (paths);
- current state (claimed / done / expired; done is shown as "released" and means the leases were released, not that the work was committed);
- the absolute time and actor of every claim / release / expiry.

The UI renders these events as a per-file Gantt chart. A bar runs from claim to release; an active lease extends to now and is striped.

## 🖥️ UI

One read-only screen rendered as a full-bleed app shell (no page padding):

- **Project rail (right, 264px, full height, collapsible to zero)**: the collapse choice is kept in localStorage across reloads. It is one list and nothing else — no caption, no count, no footer. A project is listed only when it has a working or blocked session, a live lease, or real activity within the last 30 minutes; an open session whose only sign of life is the host heartbeat is not active. Each row shows the status dot, working and blocked sessions, claims, active changes, and last activity. The dot breathes only while a session is working; blocked is red, claimed is amber, and a recent-but-idle board is grey. Motion stops under reduced-motion.
- **Topbar (56px)**: the selected project's name and repository path on the left; on the right the coordination switch in the host's own spec (36x20, brand colour when on, 2px focus ring). A 28x28 rail toggle is pinned to the panel's top-right corner: over the rail's top edge when open, over the topbar's right end when closed, in exactly the same place — one spot opens and closes.
- **Content**: scrolls independently — sessions and the claim Gantt, composed as two section cards directly on the host's bg-base. Cards use the host elevation token (0.5px hairline stroke plus a soft shadow) and a 12px radius; each header sits inside its card and rows are separated by hairlines. Bars expose a positioned tooltip on hover or keyboard focus with file, actor, start/end, duration, and intent/summary; the full event record stays in the CLI (`dsh-god-view changes`).
- **When nothing is active**: the page is one quiet blank state — a low-opacity glyph and a single line (no recent activity; projects appear once a session works here or claims a file; with coordination off it points at the switch). No empty sections, empty Gantt, or dashed placeholders, so the page can be read and left at a glance.
- **No inputs**: no composer, no message box, no reply/release button. Project rows are navigation buttons; the panel has two chrome controls only — the coordination switch (mode) and the rail toggle (layout).

UI rules: type and spacing use one shared scale; any name, path, or focus that can overflow is single-line ellipsized with the full value in a title/tooltip; action buttons are 30px high and prefer icon + label; status dots, groups, and section headers share one vocabulary.

Below 700px of panel width the shell stacks: the sidebar becomes a horizontal, scrollable project strip above the content.

## 🚀 Quick start

**Compatibility**: DSH `>=0.2.0 <0.3.0`, Node `>=20`; peer dependency `@deepseek-ai/cordis ~4.0.5`. Verified against DSH 0.2.1 with host smoke and UI tests.

### 1. Install into a DSH profile

```sh
PROFILE="$HOME/.dsh/profiles/desktop"
mkdir -p "$PROFILE/node_modules"
ln -sfn /absolute/path/to/dsh-god-view "$PROFILE/node_modules/dsh-god-view"
```

### 2. Add the plugin config

Append this to $PROFILE/cordis.patch.yml:

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

Leave root empty. Each agent resolves its repository from its session cwd. Setting root forces every session onto one board and is only useful for single-repository debugging.

### 3. Restart and open

Restart the DSH host, refresh the page, and open **Agents** in the left sidebar.

Every project tracked by the plugin on this DSH appears in the project rail. A project never opened with the plugin is not discovered automatically.

## 🧰 Tools and CLI

The runtime exposes exactly three tools:

| Tool            | Purpose                                                                          |
| --------------- | -------------------------------------------------------------------------------- |
| **team_status** | Update focus, status, plan, and files                                            |
| **team_roster** | Read active agents, claims, and active/recent changes for the current repository |
| **team_claim**  | Claim, release, or list paths; reason is the change intent or release summary    |

The CLI shares the same files:

```sh
node bin/dsh-god-view.mjs join    --name reviewer --focus "reviewing the guard"
node bin/dsh-god-view.mjs status  --id <id> --focus "reading the claim timeline"
node bin/dsh-god-view.mjs claim   --id <id> --paths lib/store.js --intent "timeline fix"
node bin/dsh-god-view.mjs release --id <id> --paths lib/store.js --summary "done"
node bin/dsh-god-view.mjs claims
node bin/dsh-god-view.mjs changes
node bin/dsh-god-view.mjs list
node bin/dsh-god-view.mjs leave --id <id>
```

## 📦 Data layout

Each repository has its own board:

```text
<repo>/.dsh/parallel/
  config.json
  agents/<agent-id>.json
  claims/<sha1(repo-relative-path)>.json
  changes/<change-id>.json
```

The global index only tracks recent projects:

```text
~/.dsh/parallel/projects.json
```

It stores root / name / lastSeenAt only. Presence, claims, and timelines always live in each repository's own .dsh/parallel. Claims are never merged across projects, and there is no cross-project lock.

## 🧭 Decisions

Key choices are recorded with [adr-kit](https://github.com/luochang212/adr-kit) under [adr/](adr/README.md). There are nineteen implemented decisions:

- **ADR 1**: one board per repository; the global project index only discovers and summarizes, and never introduces a cross-project lock.
- **ADR 2**: no messages, inbox, or question queue; focus is a session property; the panel is read-only.
- **ADR 3**: record occupancy as a claim/release timeline and render it as a per-file Gantt.
- **ADR 4**: the project list is navigation, not content; use a full-height project rail instead of cards above the Gantt.
- **ADR 5**: one read-only screen and three concepts; no tabs, cards, feeds, setup screen, or composer.
- **ADR 6**: every change records conversation identity, intent, paths, and release state.
- **ADR 7**: short-lived auto leases for writes; explicit leases for planned work, released on idle or after TTL.
- **ADR 8**: UI language comes from the host locale service, never from the served document language.
- **ADR 9**: coordination is off by default behind one panel-header switch; off writes no board state.
- **ADR 10**: the panel is a full-bleed app shell (logo rail + topbar + independently scrolling content), not a padded document page.
- **ADR 11**: the rail lists active projects only; with none active the page is one quiet blank state, not a row of empty boxes.
- **ADR 12**: the brand mark is a repo-drawn radiant eye (lens ring, pupil, eight rays) instead of a library eye icon.
- **ADR 13**: the topbar carries only the coordination switch — no live indicator, no switch label.
- **ADR 14**: no event list under the Gantt — exact times live in the bar tooltip, the full record in the CLI.
- **ADR 15**: the content area is two section cards (host elevation token, in-card headers, hairline rows); the brand tile grows to 36px. ADR 17 later removed the page tint in favour of the host bg-base.
- **ADR 16**: active means real activity in the last 30 minutes, a working/blocked session, or a live lease; the heartbeat only filters dead hosts and is never shown as activity.
- **ADR 17**: the rail sits on the right, collapses to zero, and the chrome uses host tokens and the host switch spec.
- **ADR 18**: no coordination-off banner under the topbar; the switch alone carries the state.
- **ADR 19**: the rail is one bare list with no header, count or footer; the rail toggle is pinned to the panel's top-right corner so it never moves.

Run **adrkit list** at task start and read the relevant implemented records. Use **adrkit relevant <path>** when a task targets specific files. Add or change decisions with **adrkit record** or **adrkit propose**, and run **adrkit validate --all** before finishing.

## ⚙️ Configuration

| Key               | Default         | Meaning                                                           |
| ----------------- | --------------- | ----------------------------------------------------------------- |
| root              | empty           | Optional forced repository. Empty means each session uses its cwd |
| registryDir       | ~/.dsh/parallel | Directory for the global project index                            |
| heartbeatMs       | 20000           | Presence renewal interval                                         |
| ttlMs             | 90000           | Presence TTL                                                      |
| claimPolicy       | auto            | off / advisory / require / auto                                   |
| autoClaimTtlMs    | 600000          | Auto-claim TTL                                                    |
| releaseAutoOnIdle | true            | Release auto claims when the turn ends                            |

claimPolicy values:

- **auto**: auto-claim on write/edit, deny conflicts;
- **require**: deny a write with no claim;
- **advisory**: warn but do not block;
- **off**: disable the write guard.

The write guard covers write/edit only. Shell redirection through bash or run_code is outside it.

## 🧪 Development and testing

There is no build step. The browser bundle is loaded directly by the DSH module loader.

```sh
node --test test/store.test.mjs   # store / timeline / registry / concurrency / CLI
node test/host-smoke.mjs          # tools / write guard / /projects / /claim / /release
node test/ui-flow.cjs             # read-only UI + screenshots
```

The UI test requires the desktop DSH host, Playwright, and the local desktop auth cookie. It asserts:

- CONTROLS 0
- HAS_PROJECTS true
- HAS_TIMELINE true
- HAS_SESSION true
- no console errors

Refresh the page after client changes; restart the host after host changes. Development rules are in [AGENTS.md](AGENTS.md); the file format is in [docs/protocol.md](docs/protocol.md).

## ⚠️ Limitations

- No cross-project lock; unrelated repositories can work in parallel.
- The project list comes from roots tracked by the host plus the global registry; a never-opened project does not appear.
- Claims are exact paths, not directories or globs.
- Auto claims release on idle; explicit claims need release or TTL expiry.
- One active change per agent; release the old change before starting a new one.
- The Gantt shows claim/release time, not git-diff or commit-level proof.
- Different git worktrees are different boards.
- Timeline history is kept for 7 days by default.

## 📜 License

[MIT](LICENSE)
