---
status: implemented
date: 2026-10-31
description: Read when changing the panel's coordination-off presentation, the topbar, or anything that would reintroduce an explanatory strip.
raised-by: human
decided-by: human
created: 2026-10-31
paths: [packages/dsh-god-view/lib/client.js, docs/protocol.md]
---

# ADR: 18 Drop the coordination-off banner

## Problem

With coordination off the panel drew a full-width strip under the topbar: "协作已关闭：不记录文件占用，也不阻断并发写入。", plus a warning when the host was too old to carry the route, plus a line when more than one session was running.

The switch sits two rows above it and already shows the state through its track colour, thumb position, and `aria-checked`. The strip restated that on every visit, took a whole row away from the board, and the "N sessions are running" sentence told the human something they could not act on in the panel. On a panel whose whole argument is a quiet screen, it was the loudest thing on a dormant install.

## Decision

The banner is removed: the element, the `.pt-banner` and `.pt-banner-warn` rules, and the tracked-session count that fed it. The off state is carried by the switch alone.

Two things deliberately stay:

- **The disabled switch** when the running host predates `/coordination`: the control is visibly disabled and its tooltip explains why. That is a property of the control, not a strip.
- **The blank-page copy** when coordination is off, because that surface explains why the rail is empty, which the switch cannot say.

## Alternatives considered

**Keep only the host-too-old warning.** Rejected: the switch is already disabled in that case and its tooltip says the same thing; a strip for a condition the human fixes by restarting is one more thing to read on every visit.

**Keep the banner until the human dismisses it once.** Rejected: persistence and a dismiss affordance (a second control) for a sentence nobody needs after the first week.

**Move the message into the switch's tooltip.** The tooltip already explains what turning it on does; folding the "off" sentence in makes it longer without adding information.

## Consequences

- A dormant panel shows no sentence about coordination being off. The switch is the only indicator, which matches how the host treats its own toggles.
- ADR 9's last boundary ("when the host sees several sessions while off, the panel says so") no longer holds and is superseded here; the host still counts sessions internally, it just does not advertise them.
- `docs/protocol.md` and both READMEs drop the notice from the topbar description.
- The content area starts one row higher whenever coordination is off, so the two cards sit directly under the topbar.
