---
status: implemented
date: 2026-10-30
description: Read before adding any message, inbox, question, reply, or human-input surface to the board.
raised-by: human
decided-by: human
created: 2026-10-30
paths: [packages/godview/lib/store.js, packages/dsh-god-view/lib/index.js, packages/dsh-god-view/lib/client.js, packages/godview/bin/godview.mjs]
---

# ADR: 2 Drop inter-agent messages; keep focus, claims, and timeline

> **Amended by [ADR 23](23-drop-the-board-protocol-version.md):** the board no longer carries a protocol number, so the "Protocol 3" in this record is history, not a version to bump. The removal of messages stands.

## Problem

An earlier version added direct messages with needsReply, pending/read state, reply_to, a TTL, and an "Agent questions" section. The feature grew a second state machine beside the file leases: a message could be delivered, read, answered, expired, or left stale; the UI needed an inbox; and the panel needed a human-input story even though the core board is supposed to be agent-operated and read-only.

It did not prevent file collisions and it did not improve the occupancy timeline. It also blurred two different concepts: focus is a current property of a session, while a question is an event with an answer lifecycle. Keeping both invited the question "why does a one-line focus need a reply?" and made the panel look like a chat product.

## Decision

The board has no message subsystem. There is no team_send, no inbox, no needsReply, no read state, no reply_to, and no message TTL. The runtime exposes exactly three tools: team_status, team_roster, and team_claim.

Focus is a property of the current session at the current time. It is set from the first user/subagent prompt and can be updated with team_status; it has no reply state and no lifecycle.

The browser panel is read-only. There is no composer, message box, reply box, or question queue. Project rows are navigation and Refresh is the only action button.

If agents need a decision from one another, they use the existing DSH session conversation or put the relevant intent into the focused claim. The board itself does not host a dialogue.

Protocol 3 removed messages from the store and HTTP surface. Old message directories are ignored and can be deleted; presence, claims, and changes remain valid.

## Alternatives considered

**Keep messages but hide the UI section.** The queue, delivery, TTL, and reply states would still exist and still require tests and documentation. Hiding a second state machine does not remove its cost.

**Keep FYI-only messages.** Even without needsReply, a message still needs a recipient, delivery, a read marker, and a deletion rule. It is still an inbox, just a quieter one.

**Put a question in the focus string.** This is honest about being a property, but it is not a durable question with an answer; agents can already see the focus and claim intent. A dedicated dialogue belongs in the session, not in a property field.

**Add a note field on the claim.** This is useful for intent and is already covered by the claim reason. It is not a conversation and does not justify reply/read state.

**Put messages in the global project index.** The index is aggregate-only and has no per-repository write path. Turning it into a message bus would make project discovery depend on chat delivery.

## Consequences

The board becomes smaller and its state model is easier to explain: presence, claims, changes, timeline. There is no stale question, no unread badge, and no human-input ambiguity. The cost is that the board cannot serve as a cross-agent decision channel; that capability must come from the session or a future explicit feature, not from focus.

Tests, docs, CLI commands, and HTTP routes must not reintroduce messages without a new decision that supersedes this one. The read-only control assertion (zero inputs/selects/textareas) is part of the contract.

Old v2 messages are not migrated. They are outside the current model and should not influence claim or timeline behavior.
