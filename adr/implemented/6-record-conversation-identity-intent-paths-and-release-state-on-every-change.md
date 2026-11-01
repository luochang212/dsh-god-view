---
status: implemented
date: 2026-10-30
description: Read when changing the change/claim schema, session attribution, intent, release summaries, or the board's identity display.
raised-by: human
decided-by: human
created: 2026-10-30
paths: [packages/godview/lib/store.js, packages/dsh-god-view/lib/index.js, packages/dsh-god-view/lib/client.js]
---

# ADR: 6 Record conversation identity, intent, paths, and release state on every change

> **Amended by [ADR 23](23-drop-the-board-protocol-version.md):** the board carries no protocol number any more, so a shape change ships with docs and tests instead of a bump. The identity fields and the rest of the decision stand.

## Problem

A lease that records only a path and an owner answers "who holds this?" but not the questions the user actually asked: which conversation made the change, what was it trying to do, which files were involved, and was it released or still open?

Without conversation identity, a user cannot map a board row back to the DSH session that produced it. Without intent, a path is just a filename. Without release state, a finished change looks the same as an abandoned one.

## Decision

Every claim belongs to a change record. The change stores:

- id, agent, and agentName;
- sessionId and sessionTitle;
- intent;
- the union of paths;
- state: claimed, done, or expired;
- summary for the release or expiry;
- createdAt, updatedAt, and releasedAt;
- a claim/release/expire timeline.

The claim copies changeId, sessionId, sessionTitle, and intent so a reader does not need to join through an index. Auto claims take their intent from the current focus; explicit claims use the caller's reason. Release uses a summary; expiry uses a fixed summary.

The UI shows the conversation title and short session id, the intent, the paths, and the state/summary. When DSH provides a session title, it is shown; otherwise the board falls back to the short session id. The CLI and team_roster expose the same fields.

A change is the unit of conversation-scoped work. A claim is one lease within it. One agent has at most one active change at a time.

## Alternatives considered

**Path and owner only.** This is enough to block a second writer, but it cannot answer which conversation or what work the lease belongs to. It reduces the board to a lock table.

**A free-form note on the claim.** Intent is useful, but a note alone does not identify the conversation or the release state. The structured fields are the observability contract; the note is the human-readable summary.

**Use a git commit as the identity.** Git is authoritative for committed code, but it does not exist for live leases, uncommitted work, or work that is released without a commit. The board must be useful before commit.

**Use only the agent name.** An agent name is not a conversation. Multiple sessions can reuse names, and a subagent has its own session. sessionId is the stable link; title is the readable label.

## Consequences

The change file is larger, and sessionTitle can be absent for CLI-created agents or older boards. The UI must handle missing titles with a short session id. Auto-claim intent is only as precise as the focus; an explicit claim can carry a better intent.

The board can now answer which conversation, what change, which files, and whether it was released. It still cannot prove the content of the change: done is a declared release, not a commit or diff. Adding commit or diff fields would be a separate decision.

The identity fields are part of the protocol. Changing them requires a protocol bump, migration notes, and updated tests for old records that lack sessionTitle.
