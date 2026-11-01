---
status: implemented
date: 2026-10-31
description: Read when changing the content area's surfaces. Those surfaces are the section cards, their headers, row dividers, page tint, and the brand tile.
raised-by: human
decided-by: human
created: 2026-10-31
paths: [packages/dsh-god-view/lib/client.js, packages/dsh-god-view/test/client-locale.test.mjs]
---

# ADR: 15 Compose the content area as two section cards on a tinted page

## Problem

After the event list went away (ADR 14) the content area held two things: the session list and the Gantt. Both were styled as their own bordered boxes. Every session row was a 1px outlined card, and the Gantt was another. Their section headings floated above them, outside anything. On a white page with no shadows, that read as a pile of outlined widgets rather than a composed screen, and the whiteness made the page feel unfinished even when it was full.

The reference layout (ml-auto) gets its weight from a tinted page with white cards: hairline border, 12px radius, a very soft shadow, and a table-card that owns its header.

## Decision

The content area is two cards on a tinted page.

- **Page**: the content surface is `color-mix(bg-base 97%, label-primary 3%)`, which is a near-white grey in light and a slightly lifted dark in dark (overridden to plain `bg-base` when the host sets its dark attribute). The rail keeps its own 96/4 tint, so the page, the rail, and the cards are three distinct tones.
- **Card**: `bg-base` in light, `color-mix(bg-base 94%, label-primary 6%)` in dark (that is the host's own layer-1 tone), radius 12 (`--pt-radius-md`), and `var(--dsw-elevation-soft)` for the hairline stroke and shadow. No 1px border: the elevation token already carries a 0.5px stroke, and stacking both is what made the old boxes look heavy.
- **Card head**: uppercase micro-label with its icon, a tabular count, and an optional right-aligned hint ("悬停看精确时间"). A 1px `border-l1` divider closes the head.
- **Rows**: no individual border, background or radius. Rows are separated by `border-l1` hairlines; the first row has none. 16px horizontal padding throughout, 10px vertical.
- **Empty states**: a card with no rows shows one muted line inside it, never a bare box. A board with no active project still renders no cards at all (ADR 11).
- **Brand tile**: 36px, radius 10, accent tint at 13%, `elevation-soft` instead of a 1px border, glyph at 20px.

## Alternatives considered

**Keep per-row cards and only add elevation (option B).** Rejected: it keeps two card vocabularies on one page and the page still reads as stacked widgets.

**One card containing both sections (option C).** Rejected: it hides the two distinct concepts (who is working, what they hold) behind one frame, and there is no second surface to compare against on an otherwise sparse page.

**Heavier light-mode shadow.** Rejected: DSH's light theme is deliberately flat (`rgba(0,0,0,.03–.08)`); a custom shadow would look foreign next to the host's own panels.

## Consequences

- The page now has a surface hierarchy (rail → page → card) instead of a single white field, so the two cards carry the composition.
- Card separation depends on the host's dark attribute being present. If it is missing, dark mode falls back to `bg-base` cards on the tinted page: slightly darker than the page, still legible through the stroke.
- `--pt-radius-md` moves from 10px to 12px, matching the host's radius scale; small controls keep their own radii.
- Rows lost their boxes, so the session list reads as a table rather than a stack of chips; row height is stable (10px padding + two text lines).
- `test/client-locale.test.mjs` asserts a populated board renders `pt-card` and a blank board renders none, so the empty-page rule keeps its guard.
