---
status: implemented
date: 2026-10-30
description: Read when changing claim scope, project discovery, or any behavior that crosses repository boundaries.
raised-by: agent
decided-by: human
created: 2026-10-30
paths: [packages/godview/lib/store.js, packages/dsh-god-view/lib/index.js, packages/dsh-god-view/lib/client.js]
---

# ADR: 1 Use per-repository coordination boards with a global read-only project index

## Problem

Agents can work in different DSH sessions and different repositories at the same time. A single board would make unrelated repositories contend for the same namespace, and a single global lock would block parallel work that cannot actually conflict. At the same time, the sidebar needs to answer "which projects are active right now?" without requiring the user to know every repository path in advance.

The board therefore has to be both repository-local for correctness and globally discoverable for observability.

## Decision

Each repository owns its coordination state under .dsh/parallel. Presence, claims, changes, and timelines are read and written only against that repository's board.

The host resolves a board root from each agent's session cwd. config.root is empty by default; when set, it forces all sessions onto one repository and is reserved for single-repository debugging. A write guard on one repository never consults another repository's claims.

A global index at ~/.dsh/parallel/projects.json stores only root, name, and lastSeenAt. GET /projects merges the host's known roots with this index, computes a summary from each board, and sorts by last activity. The UI's project rail is a navigation layer over these summaries; selecting a project changes which board is read, never which board is written.

There is no cross-project lease and no global lock. Repository boundaries define the coordination boundary.

## Alternatives considered

**One global board and one global lock.** This makes cross-repository conflicts impossible in theory, but it serializes unrelated work, mixes claims with the same relative paths in different repositories, and turns a small local board into a daemon-wide coordination service. The actual collision domain is a repository, so this costs far more than it protects.

**Per-repository boards without a global index.** This is correct for claims but fails observability: a user cannot find recent projects without remembering each path. The index is the smallest addition that restores discovery without becoming a second source of truth.

**Scan the filesystem for every .dsh/parallel board.** This would discover unopened projects, but turns page load into an unbounded filesystem walk and makes the result dependent on disk layout and permissions. Tracking roots and an explicit recent-project registry is predictable.

**A global project switcher with merged claims.** Merging claims would make the rail look complete while destroying the guarantee that a claim in one repository cannot block another. Summaries are deliberately aggregate-only.

## Consequences

Different repositories can proceed in parallel, and a crash or stale claim is contained to one repository. The cost is that cross-repository file collisions are not prevented; they are outside the coordination boundary.

The project list contains only roots tracked by the host or present in the global registry. A project never opened with the plugin does not appear. Registry entries can outlive their sessions, so the UI must show last activity rather than treating presence in the list as proof of current work.

Each board remains the source of truth. Summaries are recomputed from board files, and there is no second writable copy of claims or timelines. Worktrees remain separate boards because their absolute roots differ.

The index is capped and local to the machine. It is not a remote catalog, and it does not merge history across repositories.
