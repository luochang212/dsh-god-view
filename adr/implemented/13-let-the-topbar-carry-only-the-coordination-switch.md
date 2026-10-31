---
status: implemented
date: 2026-10-31
description: Read when changing the panel topbar, the coordination switch, or the status indicators in the header.
raised-by: human
decided-by: human
created: 2026-10-31
paths: [lib/client.js]
---

# ADR: 13 Let the topbar carry only the coordination switch

## Problem

The topbar's right side held two things: a "live" indicator (a dot plus the word 实时, or 连接中 while the first fetch is in flight) and a coordination switch prefixed by the word 协作. Both restated information the page already carries:

- the project rail gives every row a status dot, which is the only status this panel is really about;
- the switch is global and the only control, so its own position and colour already say whether coordination is on;
- the word 协作 in front of a slider reads as a field label in a settings form, which this is not.

Meanwhile the topbar is the quietest strip in the UI. Spending it on a redundant dot and a redundant word made the panel look busier than the board behind it.

## Decision

The topbar's right side carries exactly one element: the switch. It keeps role=switch, aria-checked, data-coordination=on|off|unavailable, and the 34x20 track; it loses its visible label, and gains aria-label="协作开关" so the control still has a name for screen readers.

The live indicator is gone: no dot, no 实时/连接中 text. Connection and loading states surface where they matter instead. The loading line appears while the first read is in flight. The error copy with its retry advice appears when the host is unreachable. The coordination-off banner sits under the topbar when the mode is off.

This supersedes the "live state" part of [ADR 10](10-treat-the-panel-as-an-app-shell-with-logo-rail-topbar-and-scrolling-content.md). The rest of that shell stands.

## Alternatives considered

**Keep the dot, drop the word.** Rejected: the dot still duplicates the row dots, and an idle green dot next to a working board is noise that reads as decoration.

**Put the label on hover only.** The title attribute already explains what the switch does; a visible label that appears on hover adds motion to the one element that should be calm.

**Replace both with an icon.** Rejected: one more glyph in a 56px strip, and the slider is already the clearest possible representation of on/off.

## Consequences

- The panel has no at-a-glance "connected" indicator. A failed poll is visible through the error copy, not a dot that silently turns red.
- The switch's state is carried by thumb position, track colour, aria-checked, and data-coordination; the UI test keeps asserting exactly one role=switch and that it flips and returns.
- The topbar right side is now a single 38x30 target, which is also easier to hit than a label plus a slider.
- Nothing in the rail changed: the row dots remain the status vocabulary (ADR 4, ADR 11).
