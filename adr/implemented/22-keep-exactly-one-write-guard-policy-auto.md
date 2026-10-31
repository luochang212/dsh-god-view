---
status: implemented
date: 2026-10-31
description: "The write guard has exactly one policy: write/edit auto-claims and denies live conflicts. claimPolicy and its require/advisory/off values are gone."
raised-by: agent
decided-by: human
created: 2026-10-31
commit: "6408670"
paths: [lib/index.js, lib/store.js, docs/protocol.md, README.md, README.en.md, examples/cordis.patch.yml, test/host-smoke.mjs]
---

# ADR: 22 Keep exactly one write-guard policy: auto

## Problem

ADR 7 shipped the write guard with a `claimPolicy` knob: `auto`, `require`, `advisory`, or `off`. Three problems surfaced in review:

- No user ever reaches the knob. It is an install-time value in the profile config; the panel exposes only the coordination switch. Dead configuration is documentation debt and test surface.
- `advisory` could not keep its promise. The host's `tools/pre-execute` contract has no hint-on-allow channel (`allow` carries no fields), so "warn but do not block" at the collision moment is unimplementable. The only real channel is the ambient prompt context — which `promptFor` already renders in every policy.
- `off` duplicated the coordination switch at finer granularity, so there were two ways to mean "leave me alone" and no way to tell which one was in effect.

## Decision

There is exactly one guard policy, and it is ADR 7's auto behavior: a write/edit auto-claims the target for the turn, a live claim owned by another agent denies the write with an actionable message, auto claims release on idle, and the `claimPolicy` config key no longer exists. The coordination switch remains the single off button for the whole feature. `team_claim` remains available for planned, explicit leases.

## Alternatives considered

**Keep `require`.** It forces intent declaration before any write, which reduces wasted work. It lost because it depends on agent discipline: an agent that forgets to claim eats a deny, and with LLM agents forgetting is the common case. Auto enforces at the tool boundary with no agent cooperation, and its deny fires at the first write attempt — the earliest moment a collision can be surfaced. Race safety comes from exclusive (`wx`) claim-file creation, not from timing or discipline.

**Keep `advisory` as ambient-only.** The prompt context already lists files held by others in every policy, so advisory adds nothing but the absence of enforcement. A mode whose only behavior is "less than the default" should not exist.

**Keep the knob for future flexibility.** The scenario is one kind: agents colliding on files in one repository. Git preserves the removed branches if a genuinely new requirement appears; a config key nobody reaches is not flexibility, it is surface area.

## Consequences

The guard, the docs, and the tests describe one behavior instead of four. The `promptFor` protocol line lost its four-way branch. Smoke tests dropped the second-runtime advisory section. Removing `require`'s deny-without-claim message and `advisory`'s prompt wording also removes the risk of those texts drifting from reality.
