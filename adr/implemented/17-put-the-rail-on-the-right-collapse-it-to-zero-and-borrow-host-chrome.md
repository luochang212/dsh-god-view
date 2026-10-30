---
status: implemented
date: 2026-10-31
description: Read when changing the rail's side, width, collapse behaviour, the topbar controls, or any chrome colour in the panel.
raised-by: human
decided-by: human
created: 2026-10-31
paths: [lib/client.js, test/ui-flow.cjs, test/client-locale.test.mjs]
---

# ADR: 17 Put the project rail on the right, collapse it to zero, and borrow the host's chrome

## Problem

The rail sat on the left, next to DSH's own left sidebar: two vertical lists competing for the same edge, and the board lost 232px to a rail that repeats what the host sidebar already names. The rail also opened with a brand block (a 36px tile and the words 上帝视角) even though the panel is already reached through the host's own sidebar entry — the same identity twice, once in the host chrome and once inside the panel.

The chrome had drifted from the host's own controls. Our switch was 34x20 and turned **green** when on; DSH's is 36x20 and turns **brand** (near-black in light, white in dark). The rail mixed its own colours with `color-mix` and used a 10px radius, while the host exposes `--dsw-specific-sidebar-fill`, `--dsw-alias-border-l1`, `--dsw-alias-interactive-bg-hover`, `--dsw-alias-bg-multi-select`, and a radius scale that the rest of the app uses.

## Decision

**The rail is on the right.** It renders after the content in the DOM and is ordered to the right edge (`order: 2`), with `border-left: border-l1` instead of a right border. Width is 264px, the host's `SIDEBAR_MIN`, narrowing to 220px under 820px and stacking above the content under 700px.

**It collapses to zero.** A 28px icon button in the topbar — the host's compact-button size, 8px radius, `interactive-bg-hover` hover, 2px focus ring — toggles the rail. The button carries `aria-expanded`, `aria-controls="pt-rail"`, and a mirrored panel icon while the rail is open. The preference is stored in `localStorage` (`dsh-god-view:rail`), so it survives a reload.

**The rail has no brand block.** Its header is a single 56px row that lines up with the topbar — caption and count — so the top hairline runs unbroken across the whole panel. The brand mark now appears only in the host sidebar entry and on the blank page.

**The chrome uses host values, not ours.** The switch is rebuilt to the host's own spec: 36x20, 2px padding, 999px radius, `border-l3` track, `brand-primary` when on, 16px thumb (`switch-thumb` off, `label-primary-foreground` on, `translateX(16px)`), 2px focus ring, 0.5 opacity when disabled. Rail fill is `specific-sidebar-fill`; row hover is `interactive-bg-hover`; the selected row is `bg-multi-select` with a brand marker on the rail's inner edge; the footer divider is `border-l1`. All hand-mixed tints and the tinted page are gone: the page is `bg-base`.

**Cards keep their form.** The two section cards stay — in-card headers, hairline rows, `elevation-soft` and a 12px radius — but on the host's base surface instead of a tint we invented. The card is the one shape this panel adds; everything inside it is host vocabulary.

## Alternatives considered

**Register the rail into the host's `rightbar` slot.** Tempting for "native", but that slot is a tabbed artifact viewer (files, terminal, document preview): our board would live under a tab strip and the master-detail relationship with the main panel would be lost.

**Collapse to a 56px icon rail, like the host's left sidebar.** The host's collapsed rail is icons only; our rows are a name, three counts and a timestamp. At 56px they would collapse to coloured dots, which says less than nothing.

**Keep the switch inside the rail.** The switch is the only mode control; folding the rail would then hide it. Keeping both chrome controls in the topbar means the rail can disappear without taking a decision away from the human.

**Keep the tinted page for card contrast.** Rejected after the token audit: DSH's light layers are all white and its cards/popovers rely on a 0.5px stroke plus a very soft shadow. Matching that is what makes the panel read as native, even though the cards themselves are quieter than before.

## Consequences

- The panel now has **two** controls: the coordination switch (mode) and the rail toggle (chrome). The old invariant "exactly one control" becomes "one mode control plus one chrome toggle"; the read-only test still requires zero inputs, selects, and textareas.
- The board gets the full width when the rail is collapsed, which is the state a human will keep while watching the Gantt.
- Rail and board no longer compete with the host's left sidebar; the panel reads as a right-hand inspector, the same edge the host uses for its own right panel.
- Dark cards sit on the same surface as the page and are held by the elevation stroke alone. That is the host's own treatment; if the cards need more separation later, the fix is a token change, not a new colour.
- `test/ui-flow.cjs` asserts the rail is right of the content, renders at 264px, collapses to zero and restores, and that the topbar carries exactly one toggle. `test/client-locale.test.mjs` asserts the rail has no brand mark and the topbar toggle exists.
