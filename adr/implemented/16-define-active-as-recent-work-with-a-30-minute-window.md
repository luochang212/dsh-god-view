---
status: implemented
date: 2026-10-31
description: Read when changing what counts as an active project, how recency is computed, or how the rail labels sessions and activity.
raised-by: human
decided-by: human
created: 2026-10-31
paths: [packages/godview/lib/store.js, packages/dsh-god-view/lib/index.js, packages/dsh-god-view/lib/client.js, packages/godview/test/store.test.mjs, packages/dsh-god-view/test/client-locale.test.mjs, docs/protocol.md, README.md, README.en.md]
---

# ADR: 16 Define active as recent work, not host liveness

## Problem

The rail called a board "active" when it had a live presence or a live lease (ADR 11), and presence counted any non-stale agent whose status was not `done`. That sounds reasonable until you look at what a heartbeat is: every tracked session in one desktop host is refreshed by the same timer, the sidebar has no "close conversation" action, and `done` only happens on session disposal. So while the app is open, every session is "online", including conversations abandoned hours ago. The count said "2 active" next to a row labelled "idle", and `lastActivityAt` took the maximum heartbeat, so the rail printed "1s" forever for work that stopped two hours earlier.

The code was measuring the host, not the conversation. "Online" was the wrong word and the wrong filter.

## Decision

Split the signals and give exactly one of them a time window:

- **Liveness**: heartbeat + TTL. Used only to drop rows from a dead host. Never shown as activity and never counted as "active".
- **Activity**: `updatedAt` on presence, plus claim and change timestamps. A user/subagent prompt, a turn start/end, a tool result, a claim, or a release moves it. Heartbeats do not.
- **Work**: `status = active | idle | blocked | done`. Event-driven; no time window.
- **Occupancy**: a live lease. Independent of presence.

A project is **active** when any of these is true:

1. a live session is `active` or `blocked`;
2. it has a live lease;
3. its last activity is within **30 minutes** (`ACTIVE_WINDOW_MS`).

Otherwise it is idle and the rail hides it; with no active project the panel shows the blank page (ADR 11).

`lastActivityAt` now means activity, not heartbeat. `projectSummary` exposes `working` and `blocked` counts alongside `claims`. The UI stops using "online"/"活跃" for session counts: the footer and card header say **会话 / 进行中**, project rows say **进行中 · 受阻 · 占用 · 变更** plus the last activity time.

The project dot is a work mark, not a liveness mark: **breathing green** when a session is working, **red** when blocked, **amber** when only claimed, **grey** when the board is recent but nobody is working or holding anything. Motion stops under `prefers-reduced-motion`; the title text carries the same state.

This supersedes the "active = live presence" clause of [ADR 11](11-list-active-projects-only-and-give-an-empty-board-one-quiet-blank-page.md) and the "active-session" footer wording in [ADR 10](10-treat-the-panel-as-an-app-shell-with-logo-rail-topbar-and-scrolling-content.md). ADR 11's active-only rail and quiet blank page stand.

## Alternatives considered

**List only working or blocked sessions and claims.** This is the strictest reading of "active" and makes the rail a live activity monitor. Rejected: `status` flips at every turn boundary, so a board you are reading disappears the moment its agent finishes a turn, and an idle conversation that is still open and useful becomes unreachable. The rail is navigation, not a CPU meter.

**Keep presence, add a second "working" flag.** This is what the code had before the labels were fixed. Rejected: the count still calls an abandoned conversation active, and `lastActivityAt` still prints the heartbeat as "1s". Renaming alone would hide the bug.

**Use "recent activity" only, with no working or blocked state.** Rejected: a long turn would vanish after the window if it produced no tool results, and a blocked agent would drop out after 30 minutes exactly when it needs attention.

**A separate idle timeout that marks parked sessions done.** Rejected for now: it needs another clock, writes more presence churn, and TTL already handles a dead host. A session left open is allowed to be idle; it just must not be called active.

## Consequences

- A conversation that has not done anything for 30 minutes leaves the rail even though its host is alive. Sending a prompt brings it back immediately; its full history stays in the CLI.
- `lastActivityAt` is now a useful sort key and tooltip; values no longer move every 20 seconds.
- The selected board can drop out at the 30-minute boundary; selection follows ADR 11 (first active board, or the blank page).
- `/projects` and `/state` gain `working` (and `blocked` in the summary) as additive fields. `active` remains the count of live non-done sessions for compatibility, but the UI no longer presents it as "active"; the docs call it sessions.
- The 30-minute window is a product constant, not a per-profile setting. Change it here and in `ACTIVE_WINDOW_MS` together if the definition moves.
- The host must be restarted (not just the page refreshed) after this change, because the summary is computed in the host process.
