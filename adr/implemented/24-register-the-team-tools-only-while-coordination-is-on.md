---
status: implemented
date: 2026-11-01
description: Read when changing what a dormant host registers, or how the coordination switch scopes the tool catalog.
raised-by: human
decided-by: human
created: 2026-11-01
paths: [lib/index.js, test/host-smoke.mjs, docs/protocol.md, AGENTS.md, README.md, README.en.md]
---

# ADR: 24 Register the team tools only while coordination is on

## Problem

Switching coordination off already stops board writes, leases, the write guard, and the prompt context (ADR 20). The three tools stayed registered, so every request still carried their schemas, and the model could call a tool that only answered "Coordination is off". The dormant mode still touched the one thing the switch exists for: a single agent's context and behaviour. The human's intent is that off means the plugin does not disturb the agent; the old dormant path did not meet it.

## Decision

Tool registration is part of the switch, not a separate setting. `start()` reads the persisted switch and calls `syncTools()`; `syncTools()` registers the three tools only while coordination is on and disposes them through the same Cordis effect disposers when it is off. `setCoordination()` syncs immediately, and every coordination check (heartbeat, write/edit guard, team tool call, `GET /coordination`) syncs when the value changed. `stop()` disposes them too. The execute handlers keep the off-notice guard for a call admitted before the flip.

Boundary: the panel entry, the `GET/POST /coordination` route, one `state.json` read per write/edit, in-memory session tracking, and the global project registry stay. A dormant host is not an unloaded plugin; it is an agent-visible nothing.

The host assembles the tool catalog every step and, when the set changes, records a `developer/message` with `tool-addition` / `tool-removal` entries and starts a new request series (`dsh-agent-loop`). A flip therefore applies on the next step, not only after a restart.

## Alternatives considered

**Keep the tools and shorten their descriptions.** Rejected: the schemas still cost context on every request and the tools stay callable; that is the disturbance.

**Hide the tools behind a visibility flag.** Rejected: the tool service has no hidden-tool concept; registering and disposing is the mechanism it exposes.

**Move the switch to host settings and unload the plugin when off.** Rejected: the panel is the only switch (ADR 13, ADR 17, ADR 19, ADR 20); turning it off would need a host restart or a second always-on component, and the common solo-work case wants a quick toggle.

**Keep answering `team_*` calls with the off notice.** Rejected: it makes the dormant state visible to the model on every request and invites wasted calls.

## Consequences

A dormant host puts no team tool in the model's catalog, and the next step after a panel flip sees the change. Turning it off mid-session rewrites the request header and starts a new request series, which rebuilds the prompt cache — cheap for a human-triggered mode change, and the host already tells the model which tools were added or removed.

A flip made by another process or machine is noticed at the next coordination check (heartbeat, write/edit, tool call, `GET /coordination`), so the catalog follows within one heartbeat; the panel POST is immediate. A call already dispatched when the flip lands still reaches its handler and returns the off notice. A call the model emits after the disposal, without having seen the updated catalog, can surface as an unknown tool; the window is the seconds around a deliberate human flip.

The remaining dormant footprint is deliberate and documented: the panel entry, the switch route, one switch read per write/edit, in-memory tracking, and the global project index. The registry still updates so the panel keeps discovering repositories, and the write guard, leases, presence, and prompt context stay at zero.

The host smoke test pins 3 → 0 → 3 across the panel switch, plus 0 for a host that boots dormant; both fail on the old unconditional registration.
