---
status: implemented
date: 2026-10-30
description: Read when changing the project switcher, panel layout, or the relationship between project navigation and project detail.
raised-by: human
decided-by: human
created: 2026-10-30
paths: [lib/client.js]
---

# ADR: 4 Make the project list a full-height navigation rail, not page content

## Problem

The first multi-project UI stacked project cards above the selected project's Sessions and Gantt. With five projects, the cards consumed roughly a fifth of the viewport and pushed the Gantt below the fold. The cards also gave navigation the visual weight of content, and the rail looked floating because it ended after the last project even when the detail pane continued.

The project list is a switcher. It should not compete with the selected project for vertical space.

## Decision

The panel is a two-pane master-detail layout:

- a 220px project rail on the left, sticky and full height;
- a detail pane on the right for the selected project.

The rail is a vertical flex column: header, project list, footer. The project list flexes and scrolls independently; the footer stays at the bottom and shows the selected project's active-session and files-in-use counts. The sidebar border runs the full height of the layout, so the rail does not float or stop after the last project.

Project rows are compact navigation buttons: status dot, name, active/claims/active-change counts, last activity. They are not content cards. The selected row uses a left marker and a subtle background.

On narrow screens the rail becomes a horizontal scrollable list above the detail pane. The panel remains read-only; project rows are navigation and Refresh is the only action button.

## Alternatives considered

**Keep the top card list.** It is simple at three projects, but it consumes vertical space, scales poorly, and treats navigation as content. The user explicitly asked for a sidebar.

**A dropdown or select.** It saves space but hides the status, claim counts, and last activity that make the project overview useful. It also adds a form control to a read-only panel.

**Tabs.** Tabs are for views over one object, not for a growing set of projects. They hide status and overflow quickly.

**Put projects in the DSH global sidebar.** This would mix workspaces and sessions with plugin state, and the plugin currently registers one sidebar panel entry. A secondary rail inside the panel keeps the plugin's navigation scoped and reversible.

**A content-height rail.** A short rail that ends after the last row looks detached from the detail pane. The full-height rail with a bottom footer is the stable layout.

## Consequences

The detail pane loses 220px of horizontal width, so the Gantt is narrower than in a full-width layout. Project names and counts are truncated in the rail; the full path and last summary live in the row tooltip and the detail header.

The rail's empty space below the project list is intentional: it is a navigation surface, not a content list. The footer anchors the selected project's state at the bottom and keeps the rail visually grounded.

At narrow widths the horizontal fallback avoids a 220px fixed column. Tests must continue to assert zero inputs/selects/textareas and keep project rows as buttons. The screenshot should be refreshed when this layout changes.
