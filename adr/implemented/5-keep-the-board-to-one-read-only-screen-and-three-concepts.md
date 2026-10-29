---
status: implemented
date: 2026-10-30
description: Read before adding tabs, dashboard cards, activity feeds, setup screens, or any new top-level UI concept.
raised-by: human
decided-by: human
created: 2026-10-30
paths: [lib/client.js, lib/index.js]
---

# ADR: 5 Keep the board to one read-only screen and three concepts

## Problem

An earlier iteration tried to be a coordination console: seven message kinds, threads, per-message acknowledgements, an event feed, four tabs, statistics cards, and a setup tab. The user could not understand the UI at a glance, and the extra surfaces did not make file coordination or occupancy easier to see. They made the product look broader while making the core state harder to find.

The board's job is narrow. The interface should make the narrow job obvious rather than expose every internal concept as a separate panel.

## Decision

The panel is one read-only screen built on three concepts: presence, claims/changes, and the claim/release timeline. Everything else is either a compact part of those concepts or absent.

There are no tabs, no statistics dashboard, no activity feed, no setup screen, and no composer. The project rail is navigation; Sessions and the Gantt are the detail. The exact event list is collapsed under the Gantt rather than promoted to another tab. Refresh is the only action button.

The panel does not explain the protocol through a settings UI. Configuration belongs in the profile; operational details belong in the CLI and AGENTS.md.

## Alternatives considered

**Tabs for sessions, files, changes, and setup.** Tabs hide the relationship between concepts and force the user to hunt for the current state. With only three concepts, tabs add navigation cost without reducing content.

**Statistics cards.** Counts are useful, but large cards give them more weight than the actual work. A single summary line in the rail footer is enough.

**An activity feed.** The claim/release timeline is already the activity that matters. A second chronological feed would duplicate it and invite unrelated events into the product.

**A setup tab.** Configuration is a profile concern. A setup UI makes the board stateful and requires human input that the agent-owned workflow does not need.

**A composer or command bar.** Human input is out of scope. The board is a read surface; agents act through tools.

## Consequences

The product is easier to learn and the test surface stays small: zero inputs/selects/textareas, one refresh action, navigation buttons only. The cost is that some operational tasks move to the CLI or profile, and the board does not try to be a general chat or admin console.

The three concepts become a design budget. A new top-level surface needs a new decision and must justify why it cannot be a compact part of presence, claims, or the timeline.

The exact-time details remain available without becoming a primary tab; this keeps the one-screen promise while preserving evidence.
