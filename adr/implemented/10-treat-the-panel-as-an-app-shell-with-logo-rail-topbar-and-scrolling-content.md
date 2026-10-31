---
status: implemented
date: 2026-10-31
description: Read when changing the panel shell, the project rail, the topbar, or how content scrolls inside the plugin panel.
raised-by: human
decided-by: human
created: 2026-10-31
paths: [lib/client.js, test/ui-flow.cjs]
---

# ADR: 10 Treat the panel as an app shell (logo rail, topbar, scrolling content), not a padded document

> **Partly superseded by [ADR 17](17-put-the-rail-on-the-right-collapse-it-to-zero-and-borrow-host-chrome.md)
> and [ADR 19](19-strip-the-rail-to-a-bare-list-and-pin-the-toggle-to-the-panel-corner.md)
> (both 2026-10-31).** The app shell, topbar, and scrolling content remain; the
> rail no longer matches this ADR: it moved to the right edge, collapsed to a
> bare 264px list without logo area, caption, or footer counts.

## Problem

The board was rendered as a padded page inside the host: a title row (glyph, title, live status, switch) followed by a banner and a two-column grid, all inset by 24/32px. The project rail began below that header, so it read as a sidebar floating inside a document rather than as the panel's navigation. With the rail no longer flush to the panel edges, the first screen of a 1000×900 panel wasted horizontal space and looked like a different product next to the host chrome.

The reference layout (the `ml-auto` web app at /Users/alex/Documents/GitHub/ml-auto) is an app shell: a full-height tinted sidebar with a logo area, navigation, and a footer; a 56px topbar with the page title; and a scrolling content area. That structure fits the board because the board already has navigation (projects) and one detail subject (the selected repository).

## Decision

The panel is one full-bleed app shell, without page padding:

- **Sidebar (232px, full height, tinted background, hairline border):** a 64px logo area (the eye glyph in an accent-tinted square plus the `pt-title` wordmark), a section caption for recent projects, the scrolling project list, and a footer with the selected board's active-session and files-in-use counts.
- **Main column:** a 56px topbar carrying the selected project's name and repository path on the left, and the live indicator plus the coordination switch on the right; the coordination-off banner renders as a slim strip under the topbar; the content area below scrolls independently and holds Sessions, the claim Gantt, the exact-time details, and the read-only note.

Colors and type continue to come from the host (`--dsw-alias-*`, `--dsw-font-*`) so both host themes work without a theme switch of our own. The panel still has exactly one control (the switch), no inputs, and project rows remain navigation buttons.

This ADR extends ADR 4 (the rail stays full height with its footer grounded) and ADR 5 (one read-only screen); it does not add a tab, card, feed, or settings surface. The reference app's theme toggle and settings page are deliberately not copied: the host owns theming, and configuration stays in the profile.

## Alternatives considered

**Keep the padded document layout.** It was shipping and tested, but the rail did not touch the panel edge, the title row competed with the project header, and the panel looked unlike an application. The padding also cost 64px of horizontal room in an already narrow host column.

**Copy the reference wholesale (theme switch, settings page, dataset picker).** Those controls would add surfaces ADR 2 and ADR 5 forbid, and the host already provides theming. Only the layout skeleton is borrowed.

**Put the switch in the sidebar footer.** The footer is a count strip; the switch is a mode control and belongs in the header. The topbar is the panel header, so ADR 9's "one switch in the panel header" still holds.

**A boxed project picker above the list (mirroring the reference's dataset button).** It would duplicate the selected row and imply a picker interaction the read-only panel does not have.

## Consequences

The rail is 232px wide and flush with the panel edge, and the detail content loses that width; the Gantt path column is narrowed from 210px to 190px to keep lane space. The topbar shows the selected project, so the old "project" line inside the content is gone.

The content area, not the main column, is the scroll container. Tests must assert the rail reaches the panel bottom, the topbar is 56px, the content scrolls, and the switch count stays one.

Below 700px of panel width the shell stacks: the rail becomes a horizontal, scrollable project strip above the content rather than a fixed column.
