---
status: implemented
date: 2026-10-31
description: Read when changing the Gantt, the panel's content sections, or anything that would add an event list back under the timeline.
raised-by: human
decided-by: human
created: 2026-10-31
paths: [packages/dsh-god-view/lib/client.js, packages/dsh-god-view/test/client-locale.test.mjs]
---

# ADR: 14 Show the Gantt only and move exact times into the bar tooltip

## Problem

Under the Gantt sat a collapsible list of every claim, release, and expire event. It restated what the bars already encode. Each event got one line, in the same order as the lanes above it. It was the only thing below the Gantt, so the content area ended in a wall of text that the eye had to skip on every visit.

The exact times it carried were already available: each bar exposes a positioned tooltip on hover and on keyboard focus with the file, actor, start, end, duration, and intent/summary. The uncapped record lives in the board files and in the CLI.

## Decision

The panel renders no event list. The Gantt is the only timeline surface in the browser bundle: `TimelineSection`, the `<details>` block, the flattened timeline data, and the `.pt-timeline` / `.pt-tl-*` styles are removed.

The section note now reads "bars run from claim to release; hover a bar for exact times". The tooltip keeps file, actor, start/end, duration, and intent/summary, and the bars stay focusable so the same values are reachable from the keyboard.

This supersedes the "keep an exact-time detail list available under the details element" clause of [ADR 3](3-model-occupancy-as-a-claim-release-timeline-rendered-as-a-per-file-gantt.md). It also supersedes the "exact-time details" and "read-only note" items in [ADR 10](10-treat-the-panel-as-an-app-shell-with-logo-rail-topbar-and-scrolling-content.md): the content now ends with the Gantt, and read-only is structural (no inputs) rather than a caption. The claim/release timeline is still the model; it is simply rendered one way instead of two.

## Alternatives considered

**Keep the list collapsed by default.** It was already collapsed; the cost is not the open state, it is that the last thing on the page is a disclosure the product does not want to encourage, and that it duplicates the bars for anyone who opens it.

**Make it a modal or a tab.** Rejected: a second surface and a second control for data the bars already answer.

**Keep only a count of events.** Rejected: the Gantt's interval count already gives that.

## Consequences

- The content area now ends with the Gantt, which makes the page shorter and the single timeline the obvious thing to read.
- Exact times are one hover or one tab-stop away, not scroll-and-expand away; screen-reader users get them from the focused bar.
- The full event record is unchanged on disk and in the CLI (`dsh-god-view changes`), and the protocol is untouched.
- `test/client-locale.test.mjs` fails if `TimelineSection`, `事件明细`, or `pt-tl` styles come back, so the list cannot reappear silently.
