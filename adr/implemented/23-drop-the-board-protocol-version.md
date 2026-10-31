---
status: implemented
date: 2026-10-31
description: Read when changing board file shapes or considering a schema version; the board carries no protocol number, and Git is the only version.
raised-by: human
decided-by: human
created: 2026-10-31
commit: "6408670"
paths: [lib/store.js, lib/index.js, lib/client.js, docs/protocol.md, AGENTS.md, README.md, README.en.md, test/store.test.mjs, test/host-smoke.mjs]
---

# ADR: 23 Drop the board protocol version

## Problem

The board carried a `protocol: 3` marker. Every presence, claim, and change write stamped it, `ensureStore` rewrote `config.json` whenever the marker differed, both READMEs advertised a protocol-3 badge, and AGENTS.md required a bump for any incompatible file shape or route.

The global project index and the coordination switch carried the same dead pattern as `version: 1`: written on every update, never read.

The only readers are this repository's own host, CLI, and panel. There is no external implementer, registry, or handshake to negotiate with. A second version number next to Git's answers a question nobody asks, and it creates work: every shape change needs a bump, migration notes, and tests for old records, while the actual compatibility code (fallback timelines, ignored message directories) never branches on the number. Removing the unused board-writing HTTP routes exposed the crack: the marker lives only in files, so using it to version HTTP forced a choice between a false bump and a rule exception.

## Decision

The board has no protocol version. Board files carry no `protocol` field; `config.json` is created with `createdAt`, `createdAtIso`, and `note` only; `snapshot` no longer returns `protocol`. The registry index and the coordination switch no longer write `version`. `docs/protocol.md` documents the file shapes, HTTP surface, and compatibility behavior without a version number. Git is the only version: a file-shape or route change ships with its docs and tests in the same commit, and the package version communicates compatibility to anyone outside the repository. Unknown fields in existing files are ignored; old message directories can be deleted; missing timelines are synthesized from `createdAt`/`releasedAt`.

Boundary: this removes the version marker, not compatibility handling. The host still reads old board files and needs no data migration.

## Alternatives considered

**Keep 3 and bump to 4 for the route removal.** Rejected: the marker versions board files, and no file shape changed. A bump would rewrite every `config.json` to announce a format it does not write, and leave the rule wrong for the next route change.

**Keep 3 and add a rule exception for routes.** Rejected: a version field whose scope needs a footnote in AGENTS.md is worse than no field. The rule exists to protect readers, and there are none outside this repository.

**Replace 3 with a semver string or a schema URL.** Rejected: still a second version to maintain, with no consumer. Git already records every shape, and the package version already names releases.

**Keep the field and stop checking it.** Rejected: a dead field invites readers to trust it.

## Consequences

Less work per shape change: no bump, no migration section, no test pinning a number. The files get smaller, and the docs stop implying an external specification. The cost is that an external script which read `protocol` or branched on the number loses that signal, and `snapshot.protocol` disappears from `/state` and `--json`. Nothing in the repository consumed it. Old `config.json` files keep a harmless `protocol` field until recreated; unknown fields are ignored. If a future format genuinely needs a compatibility switch, it can return then with a real consumer and a real migration.
