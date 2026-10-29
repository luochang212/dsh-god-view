---
status: implemented
date: 2026-10-30
description: Read when changing lease acquisition, renewal, release, expiry, the write guard, or claimPolicy behavior.
raised-by: agent
decided-by: human
created: 2026-10-30
paths: [lib/store.js, lib/index.js, bin/dsh-parallel.mjs]
---

# ADR: 7 Use short-lived auto leases plus explicit planned leases

## Problem

File coordination has two failure modes. Without leases, two agents can write the same path at the same time. With permanent or manually managed leases, a crashed or forgetful agent leaves a lock that blocks everyone until a human intervenes.

The board also needs to work when an agent is just doing a quick edit, without requiring a separate planning ceremony before every write.

## Decision

The default claimPolicy is auto. Before a write/edit, the host resolves the target path and checks for a live lease owned by another agent. A live conflict denies the operation. Otherwise the host creates an auto lease in the agent's current change.

Auto leases are renewed while the owning agent is running and released when the agent goes idle or is disposed. This keeps the normal path fast and prevents an idle turn from holding a write lock.

Explicit claims remain available for planned work and review. They use the same conflict rule but do not auto-release on idle; they require an explicit release or expire after their TTL. release accepts a summary. One agent has at most one active change; a new claim joins it, and a new task starts after the old change is released.

The guard covers write/edit. It does not cover arbitrary shell edits, so a lease is a coordination signal, not a kernel lock. claimPolicy can be require, advisory, or off for environments that need different behavior.

## Alternatives considered

**No leases at all.** The board would be pure observability; concurrent writes would still race. The user's core requirement includes avoiding simultaneous edits.

**Manual claims only.** Every write would require an explicit claim. This is safer in theory, but agents forget, and the extra step makes the common case expensive. It also does not solve stale locks; it just makes them more likely.

**Permanent locks until manual release.** A crash or abandoned task would block the path indefinitely. TTL and idle release exist to bound that failure.

**One global lock.** It serializes unrelated files and repositories. The collision domain is a path, not the whole workspace.

**Rely on file mtimes or editor locks.** These are not atomic across agents, do not expose intent or history, and do not give the board a release event.

## Consequences

The common case is cheap: the first write creates a lease and later agents are blocked only when they target the same live path. The cost is that an explicit lease can look stale while its owner is still running; the user must check the owning session before forcing a release. Auto leases disappear on idle, so a long-running shell edit outside the guard is not protected.

The user previously observed two explicit claims lingering after the work was done. That is the expected cost of explicit leases, not a corrupt state. The release summary and timeline make the cleanup visible; the claim TTL bounds it.

Tests must cover conflict, renewal, auto release on idle, explicit release, and expiry. A policy change to release explicit claims on idle would be a new decision because it changes the guarantee for planned work.
