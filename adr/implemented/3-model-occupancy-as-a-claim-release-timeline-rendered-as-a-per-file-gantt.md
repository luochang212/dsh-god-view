---
status: implemented
date: 2026-10-30
description: Read when changing claim history, release/expiry state, or the occupancy visualization.
raised-by: agent
decided-by: human
created: 2026-10-30
paths: [lib/store.js, lib/client.js]
---

# ADR: 3 Model occupancy as a claim/release timeline rendered as a per-file Gantt

## Problem

An active/released list answers "is this file leased now?" but not "when was it claimed, how long was it held, and who released it?". When the user asked for a timeline, the existing data was insufficient: a change had createdAt and releasedAt, but no per-path event stream, and the UI had only status rows.

The board needed to preserve the short-lived facts that matter for retrospection without turning the whole repository into an event-sourcing system.

## Decision

Every claim, release, and expiry appends an event to the owning change's timeline. Each event records at, agent, agentName, path, and intent or summary. The change keeps its current state (claimed, done, expired) and summary; the timeline is the history.

Release events are appended before a change becomes done or expired. A change remains claimed while any lease remains. Expiry appends an expire event and marks the change expired when no leases remain.

The browser pairs events by path into intervals. A bar runs from claim to release; an active lease extends to now and is rendered as held. The primary view is a per-file Gantt with a time axis, agent colors, duration labels where space permits, and a collapsible exact-time detail list. Hovering a bar exposes start, end, actor, intent, and summary.

This is a declared claim/release record, not a git diff or commit proof. The timeline is capped per change and pruned with the rest of the board.

## Alternatives considered

**Keep separate active and released lists.** This is compact but has no duration or common time axis, and it duplicates the same change in two places. It answers current occupancy but not the user's "when did it happen?" question.

**Keep a flat event log with no intervals.** This preserves facts but leaves the reader to pair claims and releases mentally. The Gantt interval is the useful derived view; the event list remains available as exact evidence.

**Use git log or file mtimes.** Git history is authoritative for committed changes, but it does not show live leases, cannot represent a released-but-uncommitted change, and is not available for every edit. The board must work before commit.

**Store only the latest claim per path.** This loses history and makes release time reconstruction guesswork. The event stream is the minimum needed for a real timeline.

## Consequences

The board gains a durable, queryable history of who held a file and for how long. It also gains more data: one event per claim/release/expiry, a cap per change, and a seven-day prune. Partial releases are represented by per-path events, but the UI's active marker is change-level; a partially released change can still show a claim event for a path that was released.

The Gantt is a derived view. The source of truth remains the change timeline, so other clients can reconstruct intervals later. Tests must cover claim, release, and expire events; the UI test must keep the details element and read-only behavior.

The timeline cannot prove what was changed. Adding commit or diff fields would be a separate decision.
