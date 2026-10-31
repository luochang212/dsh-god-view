---
status: implemented
date: 2026-10-31
description: Read when changing the panel's brand mark, its sizes, or the icons used in the rail and sidebar entry.
raised-by: human
decided-by: human
created: 2026-10-31
paths: [lib/client.js, test/client-locale.test.mjs]
---

# ADR: 12 Use a repo-owned radiant-eye mark instead of a library icon

## Problem

The rail's brand tile borrowed lucide's `eye`. It worked, but it is the same glyph a thousand applications use, and it says "view" rather than "watch over everything, from above". The reference layout (ml-auto) gets its character from a single, well-chosen mark. That mark is lucide's `Lighthouse` at 22px inside an accent-tinted square, not a decorative container.

The mark has to survive 18px (sidebar entry), 19px (rail brand tile) and 26px (blank page), in both host themes, with no build step and no new dependency.

## Decision

The panel ships its own mark: the radiant eye. A lens ring, a pupil, and eight radiating strokes, drawn on the same 24x24 grid as the lucide icons around it, with a 1.7 stroke and round caps.

Geometry, for whoever edits it next: ring `r=4.4`, pupil `r=1.4`, rays from `r=8.2` to `r=10.6` at the eight compass points, stroke extends to 11.45 so nothing touches the 24 box. The ring-to-ray gap (2.3 units) and the ray length (2.4 units) are the two numbers that keep it from turning into a blob at 19px; changing the ray count or lengthening strokes means re-checking the small sizes.

It is used in exactly three places, all through one component: the rail brand tile (19px), the sidebar entry (18px), and the blank page (26px).

## Alternatives considered

**Keep lucide's eye.** Rejected: generic, and it reads as "view" instead of "oversight".

**Use lucide's Lighthouse, like the reference.** Rejected after trying it: the reference already owns that mark, and a lighthouse says "navigation aid" where this panel is about who is working where. Borrowing the exact icon from the page we borrowed the layout from would make the resemblance the point.

**A religious mark (cross, church, angel, halo).** Considered and offered in a picker: too narrow for a tool that is not religious, and it fights the restrained shell.

**The radiation trefoil.** Rejected: reads as hazard, not oversight.

**Filled or two-tone mark.** Rejected: every neighbouring icon is a 1.7-2px outline; a filled tile would outweigh the whole rail.

## Consequences

- The mark is repo-owned: no attribution, no icon dependency, and it can be tuned for the rail without waiting on an upstream library.
- Ink density at 19px measures 32.1%, identical to the lucide eye it replaces, so the rail's visual weight does not change.
- It is not a lucide icon and should not be described as one. `test/client-locale.test.mjs` asserts the mark is present in the rail and on the blank page and that it keeps eight rays, so a silent swap back to a library glyph fails the suite.
- The icon picker used to choose it was a throwaway page under `screenshots/local/`; it is not part of the product.
