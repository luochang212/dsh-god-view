---
status: implemented
date: 2026-10-31
description: Read when changing the rail's contents, its header or footer, or the position of the rail toggle.
raised-by: human
decided-by: human
created: 2026-10-31
paths: [packages/dsh-god-view/lib/client.js, packages/dsh-god-view/test/ui-flow.cjs]
---

# ADR: 19 Strip the rail to a bare list and pin the toggle to the panel corner

## Problem

The rail carried a header (caption plus a count) and a footer (two counts). Both restated data that is already on the rows or on the board: each project row shows its own working/blocked/claims/change numbers, and the content area shows the sessions and claims themselves. On a rail whose job is navigation, the header and footer were furniture. They stopped the rail from being one list.

The rail toggle had a second problem. It lived in the topbar's right edge, which is the *content's* right edge. With the rail open, that edge sits 264px away from the panel's right edge; collapsing the rail moved the button 264px to the right, so the same click could not be repeated in place. DSH does not do this: its sidebar toggle sits in the sidebar's own header and stays at the same screen position when the sidebar collapses, and the right panel's expand button behaves the same way.

## Decision

**The rail is a bare list.** No caption, no count, no footer. It is a single scrolling list of active projects, labelled for assistive technology with `aria-label="活跃项目"`.

**The toggle is pinned to the panel's top-right corner.** It is absolutely positioned 14px from the top and right of the panel, 28x28, and rendered once at the root of the panel rather than inside the topbar. The rail opens with a 56px top band that matches the topbar's height and also leaves 14px of clearance under the 28px button. The list adds a 6px inset, so the first row starts 20px below the button; when the rail is closed, the topbar's action group reserves 44px on the right so the coordination switch does not collide with it. The button therefore occupies the same rectangle open or closed, so clicking twice in the same spot opens and closes the rail.

This is the same geometry DSH uses for its own sidebar toggle: the control is anchored to the panel edge, and the rail grows or disappears beside it.

## Alternatives considered

**Keep the caption as a list label.** One row of chrome for two words the rail does not need; the aria-label carries the name instead.

**Keep the footer counts.** Rejected: they duplicate per-row numbers and made the rail look like a dashboard inside a navigation pane.

**Put the toggle inside the rail header only.** That is what we had: the button jumps 264px when the rail toggles, which is exactly the travel this change removes.

**Keep the toggle in the topbar and let it move.** Rejected for the same reason.

**Collapse to an icon rail that keeps the toggle.** Rejected earlier in ADR 17: rows are text, an icon rail would show coloured dots only.

## Consequences

- The rail's total numbers (working sessions, claims) are no longer spelled out anywhere in the panel; the rows still show per-project numbers and the board shows the sessions and claims themselves.
- The rail's top band is 56px of empty space whose only occupant is the pinned toggle. Matching the topbar height makes the panel's top edge read as one strip rather than an accidental gap. That is the price of keeping the button still.
- `test/ui-flow.cjs` asserts the rail has no header or footer, that it contains only the project list, and that the toggle's bounding box is identical before and after collapsing (within 1px).
- Narrow layout (≤700px) keeps the same rule: the rail stacks above the content and the toggle stays at the panel's top-right.
