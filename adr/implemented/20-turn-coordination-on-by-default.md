---
status: implemented
date: 2026-10-31
description: Read when changing the coordination default, the switch semantics, or what a dormant host writes.
raised-by: human
decided-by: human
created: 2026-10-31
paths: [packages/godview/lib/store.js, packages/dsh-god-view/lib/index.js, packages/godview/test/store.test.mjs, packages/dsh-god-view/test/host-smoke.mjs, docs/protocol.md]
---

# ADR: 20 Turn coordination on by default

## Problem

ADR 9 shipped coordination off by default. Its reasoning was cost: most sessions are one agent, and a dormant host pays nothing. That reasoning holds for the average session and fails for the one that matters.

The failure mode is a race at the start. Two agents open the same repository and start editing before anyone opens the panel. Neither holds a lease, so neither is protected, and the first collision, a silent overwrite, happens before a human could have flipped a switch. A default that protects only after someone remembers to opt in protects the wrong case.

The human's own view is that coordination should be off most of the time (they said roughly 80%), but that this is a decision to make per situation, not a default to ship. Starting on makes silence a deliberate act; starting off makes protection a deliberate act, and the cost of forgetting protection is a lost file.

## Decision

Coordination is on by default. `readCoordination` treats a missing or unreadable `state.json` as on; only an explicit `{ "enabled": false }` turns it off. Every other mechanism is unchanged: the one switch in the panel header, the lease/write guard, presence, the timeline, and the prompt context.

The switch never flips itself. A human turns it off when the work is solo, and the choice persists in the registry directory until they turn it back on.

## Alternatives considered

**Keep the off default and make turning it on easier.** Rejected: there is nothing easier than a switch that is already on; the problem is not discoverability, it is the window before anyone looks.

**Turn it on automatically when a second session appears.** Rejected in ADR 9 and still rejected: the first agent's live lease is what protects the second agent's first write, so starting at the second session is one write too late.

**Default per repository, off until the repository is seen twice.** Rejected: it silently changes behaviour based on history, and the first parallel run in a fresh repository is exactly the unprotected case again.

**Prompt on first session.** Rejected: a control that appears mid-work, and a question the user has to answer before they know whether they need it.

## Consequences

- Every repository a session touches now gets a `.dsh/parallel` board with presence and change records by default. That is the cost of the safe default; it is small (a few JSON files) and the user can delete the board when no agents run.
- A user who wants the old silence turns the switch off once; the setting is global and persists.
- An existing `state.json` with `enabled: false` keeps a machine off. Deleting the file returns it to the new default.
- Tests flipped: the store test now asserts the default is on and that unreadable state reads as on; the host smoke test switches off explicitly before exercising the dormant path.
- README, AGENTS, protocol, package.json, and the GitHub description all state the new default; ADR 9's mechanism survives, its default does not.
