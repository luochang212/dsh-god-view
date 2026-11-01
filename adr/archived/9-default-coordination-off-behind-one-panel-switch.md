---
status: superseded
date: 2026-10-31
description: Coordination is off by default and one panel switch turns it on; dormant means no board writes, no leases, and no write guard.
raised-by: human
decided-by: human
created: 2026-10-30
commit: 0a5ca5e
paths: [packages/dsh-god-view/lib/index.js, packages/dsh-god-view/lib/client.js, packages/godview/lib/store.js, packages/dsh-god-view/test/host-smoke.mjs, packages/dsh-god-view/test/ui-flow.cjs]
superseded-by: 20
archived: 2026-10-31
archive-reason: coordination is on by default (ADR 20); this record still documents what a switched-off host does
---

# ADR: 9 Default coordination off behind one panel switch

> **Superseded by [ADR 20](../implemented/20-turn-coordination-on-by-default.md) (2026-10-31):
> coordination is on by default.** The dormant-host behavior described here still
> governs what an explicitly switched-off host does; only the default flipped.

## Problem

Coordination only pays off when two or more agents share one repository. In
practice most sessions are a single agent, and for those sessions the plugin is
pure overhead:

- every write/edit pays a guard that reads the board (measured at roughly 3-5 ms
  per write on a normal board, and higher once a few hundred lease files
  accumulate);
- presence heartbeats rewrite a presence file every few seconds;
- each work burst appends a change record and timeline events nobody reads.

The cost is small per event but permanent, and it is paid in the common case to
protect the rare one. "Start only when a second agent shows up" does not work:
the thing that blocks a second agent's first write is the _first_ agent's live
lease, which must already exist. Starting at the moment the second agent appears
is one write too late.

## Decision

Coordination is off by default. Dormant means the plugin writes nothing:
no board directory, no presence, no leases, no change records, no prompt
context, and no write guard. It keeps two cheap things: the in-memory session
map (so the panel can tell the human what is running) and the global project
index (so the panel can list recent repositories).

One switch in the panel header turns coordination on. It is the only control
the panel has, and it is global rather than per repository: it expresses "I am
running a team now", not "this repository is special". The value lives in
`state.json` inside the registry directory, so the CLI and every host process
agree without a restart.

While coordination is on, the existing rules apply unchanged: auto leases on
write/edit, the write guard, presence, the change/replay timeline, and the
prompt context.

Three boundaries are part of the decision:

- **Turning it on mid-flight is accepted.** Work already in progress is not
  back-claimed and past overlaps are not detected. Protection starts at the next
  write. This is stated in the panel instead of hidden.
- **Turning it off releases the auto leases this host holds** and leaves the
  recorded history untouched but frozen.
- **It never turns itself on.** When the host sees more than one session while
  coordination is off, the panel says so; the human decides.

This amends [ADR 5](../implemented/5-keep-the-board-to-one-read-only-screen-and-three-concepts.md)
in exactly one place: the panel may carry one mode control. It stays read-only
otherwise. It has no data input, no composer, no reply box, and no question queue.

## Alternatives considered

- **Auto-start when a second session appears.** Rejected: the first agent's live
  lease is what protects the second agent's first write, so starting late
  protects only after the collision it exists to prevent.
- **An automatic "solo" mode that records leases but no history.** Rejected:
  deciding "solo" correctly means knowing about leases created by other
  processes, and a wrong guess silently drops history for everyone. A human
  switch answers the same question without the guesswork.
- **Per-repository switch.** Rejected: more precise but it multiplies the number
  of places a human must remember, which is the failure mode a default-off
  feature cannot afford.
- **A config-only switch that needs a host restart.** Rejected: the human decides
  while looking at the panel, and a restart is not a switch.
- **Keep presence alive while dormant.** Rejected: half-on states are hard to
  reason about. Dormant is verifiable by one rule: no board writes.

## Consequences

Single-agent sessions cost nothing and edits are never delayed by the guard,
which is what the switch was built for.

The cost is discoverability: with nothing on by default, someone running their
first parallel batch may not know the switch exists. The panel's "N sessions are
running but coordination is off" line is the only safety net, and it only helps
someone who opens the panel.

Default-off also means the panel is empty on a fresh install until coordination
has been enabled at least once. The project rail, fed by the registry, is what
makes the switch reachable.

Host and client can be briefly out of step: `client.js` is served from disk on
refresh while `lib/index.js` needs a host restart. The client therefore treats a
missing coordination route as "unavailable" and disables the switch instead of
failing the whole panel.

Tests pin the three states: `test/host-smoke.mjs` covers dormant (nothing
written, nothing blocked), enabled (leases and guard), and the HTTP toggle;
`test/ui-flow.cjs` asserts the panel exposes exactly one switch.
