---
status: implemented
date: 2026-10-31
description: Read when changing which projects the rail lists, how an idle or empty board is presented, or the rail's empty state.
raised-by: human
decided-by: human
created: 2026-10-31
paths: [packages/dsh-god-view/lib/client.js, packages/dsh-god-view/test/client-locale.test.mjs, packages/dsh-god-view/test/ui-flow.cjs]
---

# ADR: 11 List active projects only, and give an empty board one quiet blank page

## Problem

The rail listed every repository in the registry, grouped into Active and Idle. Most of those idle rows were boards with no presence, no lease, and no change at all. They existed only because a session had once been opened there. Opening one produced a page that was structurally complete and informationally empty: an empty Sessions box, an empty Gantt box, an empty details list. That is noise that invites a click and then repays it with nothing.

Grouping active and idle did not help: the idle group was the larger half of the rail, and the empty pages behind it looked identical to a working project whose board had simply not loaded yet.

## Decision

The rail lists only boards with current activity. Such a board has status `active` (a live presence) or `claimed` (a live lease). An idle board is not rendered at all. The caption counts what is listed ("活跃项目 N").

Selection follows that rule: if the selected board goes idle, the client moves to the first active board on the next poll instead of keeping a dead page open. If no board is active, the panel shows one blank page: the brand glyph at low opacity and a single line explaining that projects appear once a session works here (or, with coordination off, that the switch above turns it on). The topbar reads "没有活跃项目" and drops the path line. There are no section headers, no empty boxes, no dashed placeholders.

Per-section empty states that can still occur (for example an active board with claims but no live session) are plain muted text, not boxed placeholders.

This supersedes three details of earlier records, without changing their decisions:

- ADR 4 grouped rows into Active / Idle. The full-height rail, the footer counts, and the navigation-button rows stay; the idle group is gone.
- ADR 9 kept the project index so the panel could "list recent repositories". The index still feeds discovery and the switch, but the rail no longer lists idle repositories; a dormant panel therefore shows the blank page plus the switch.
- ADR 10 described a section caption for "recent projects". The caption survives as "Active projects" and counts only active rows.

## Alternatives considered

**Keep both groups and style the empty page better.** That was the first idea, but the click is the problem, not only the styling: a row that opens nothing is a trap. Hiding the row removes the trap.

**Hide only boards that are completely empty (no agents, no claims, no changes).** Closer to the literal complaint, and it would keep idle boards that still hold a history. It was rejected because it needs a second definition of "empty" that drifts from the status dot, and because an idle board with history is still not what the rail is for: the rail answers "who is working now". The cost is that an idle board's frozen timeline is not reachable from the rail while it is idle; that is the accepted trade-off, and the data is still on disk and in the CLI.

**Count a tracked session as activity even without a lease.** The host knows which sessions are attached, so this would keep open-but-quiet conversations in the rail. Rejected: it makes "active" mean "a window is open", and with coordination off it would show rows whose detail page is empty again.

**A filter toggle in the rail.** Rejected: the panel has exactly one control; a second one buys discoverability for a list the product deliberately hides.

## Consequences

- A dormant install shows the blank page, not a repository list. The blank copy points at the switch, which is the only action available.
- Finished work leaves the rail as soon as presence goes stale and no lease remains; its timeline is then reachable through the CLI (`dsh-god-view changes`), not the panel. Revisit this if reviewing finished work in the panel becomes a requirement.
- The rail is usually short; the empty space below it now reads as calm rather than as a missing list.
- Tests assert both rules: idle boards are filtered out of the rendered list, and an empty board renders `pt-blank` with zero sections.
