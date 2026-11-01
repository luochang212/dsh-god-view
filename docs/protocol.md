# Parallel team board file format

The board keeps three concepts: **presence**, **claims/changes**, and a **per-repository project board**. Messages are not part of it.

## Location

```text
<repo>/.dsh/parallel/
  config.json
  agents/<agent-id>.json
  claims/<sha1(repo-relative-path)>.json
  changes/<change-id>.json
```

The global recent-project index is separate:

```text
~/.dsh/parallel/projects.json
[{"root": "/abs/repo", "name": "repo", "lastSeenAt": 1793280396000}]
```

A board is always repository-local. The index only lists roots; it never merges claims or history.

## Hosts

The file format is host-neutral. `dsh-god-view` and `pi-god-view` read and write the same board files, so a Pi session and a DSH session in one repository see each other. Agent IDs are opaque: DSH uses `dsh-<hash>`, Pi uses `pi-<hash>`. The DSH coordination switch governs the DSH host only; the Pi extension writes presence and leases while it is installed. Presence, claim, change, and registry shapes are otherwise identical.

## Presence: agents/<id>.json

```json
{
  "id": "dsh-demo-agent",
  "name": "parallel builder",
  "sessionId": "session-demo-0001",
  "sessionTitle": "DSH 多 agent 协作插件设计",
  "parentId": null,
  "role": "agent",
  "status": "active | idle | blocked | done",
  "focus": "one line about the current work",
  "lastAction": "edit packages/godview/lib/store.js",
  "plan": "",
  "files": [],
  "branch": null,
  "pid": 12345,
  "hostname": "macbook.local",
  "cwd": "/abs/repo",
  "startedAt": 1793280396000,
  "updatedAt": 1793280396000,
  "heartbeatAt": 1793280396000,
  "ttlMs": 90000,
  "expiresAt": 1793280486000
}
```

`lastAction` and `files` (most recent first, capped) describe the session's latest tool use; `finishedAt` is set once the status becomes `done`, `pid`/`hostname`/`cwd` identify the writing process. All are advisory except `status`.

Focus is a current property, not a message. It has no reply state. Heartbeats renew it while the agent is tracked; stale presence is flagged, hidden from the panel's session list, and omitted from team_roster unless `include_stale` is true. `heartbeatAt` + `ttlMs` prove only that the host process is alive; `updatedAt` is the last real activity (a user/subagent prompt, a turn change, a tool result, or team_status). The heartbeat is never treated as activity. `done` is the wire state for a closed session; the panel/CLI display it as `ended`.

## Claims and changes

Claim file:

```json
{
  "path": "packages/godview/lib/store.js",
  "agent": "dsh-demo-agent",
  "agentName": "parallel builder",
  "changeId": "ch-mvtntlri-ebc66424",
  "sessionId": "session-demo-0001",
  "sessionTitle": "DSH 多 agent 协作插件设计",
  "mode": "edit | review",
  "auto": false,
  "intent": "timeline: claim/release observability",
  "reason": "timeline: claim/release observability",
  "createdAt": 1793280396000,
  "ttlMs": 1800000,
  "expiresAt": 1793282196000,
  "renewedAt": 1793281296000
}
```

`reason` duplicates the intent for readers that only look at a claim file, and `renewedAt` is stamped by each renewal. Leases (auto and explicit) are renewed by the owning host's heartbeat while its session is running; the TTL bounds leases whose owner is gone.

Change file:

```json
{
  "id": "ch-mvtntlri-ebc66424",
  "agent": "dsh-demo-agent",
  "agentName": "parallel builder",
  "sessionId": "session-demo-0001",
  "sessionTitle": "DSH 多 agent 协作插件设计",
  "intent": "timeline: claim/release observability",
  "paths": ["packages/dsh-god-view/lib/client.js", "packages/godview/lib/store.js"],
  "state": "claimed | done | expired",
  "summary": "turn ended | released | lease expired",
  "createdAt": 1793280396000,
  "updatedAt": 1793280399000,
  "releasedAt": null,
  "timeline": [
    {
      "type": "claim",
      "at": 1793280396000,
      "agent": "dsh-demo-agent",
      "agentName": "parallel builder",
      "path": "packages/dsh-god-view/lib/client.js",
      "intent": "timeline: claim/release observability"
    },
    {
      "type": "release",
      "at": 1793280399000,
      "agent": "dsh-demo-agent",
      "agentName": "parallel builder",
      "path": "packages/dsh-god-view/lib/client.js",
      "summary": "turn ended"
    }
  ]
}
```

Lifecycle:

- claim creates or extends the agent's active change and appends a claim event per path;
- release removes the lease and appends a release event; when no leases remain, the change becomes done with the release summary. The CLI displays `done` as `released`; the panel shows the timeline and summary, not a state label. It only means the leases were released, not that the work was committed;
- auto release on idle uses summary turn ended;
- expired leases are removed and append an expire event; when no leases remain, the change becomes expired. A lease that expired unswept (its owner gone) and is then taken over by another agent is recorded the same way, so no change keeps an open claim forever. A lease re-claimed by its own agent is a renewal and keeps its original createdAt;
- one active change per agent; a new claim joins it unless it was released.

Release accepts a summary. Expiry uses lease expired. The timeline is capped at 200 events per change.

## Coordination switch

Coordination is on by default. The switch is a single global file in the registry directory:

```json
{ "enabled": true, "updatedAt": 1793280396000, "updatedAtIso": "2026-10-30T07:26:36.000Z" }
```

- **On (default, or file missing/unreadable):** presence, leases, the guard, the timeline, the prompt context, and the three `team_*` tools apply as documented below.
- **Off (`enabled: false`):** the host writes no board state. It creates no `.dsh/parallel`, no presence, no leases, no changes, and no prompt context, and it disposes the three `team_*` tools, so the model's catalog carries no team tool schema. The write guard allows everything. A call admitted before the flip (a stale tool reference) still returns the off notice instead of an unknown-tool error. Only in-memory session tracking, the project registry, and the panel entry continue, so the panel can still discover repositories and offer the switch; the rail itself lists only boards with a working/blocked session, a live lease, or activity within 30 minutes (ADR 11 and ADR 16).
- Turning it off releases the automatic leases this host holds; recorded history stays readable but frozen. Exclusive leases owned by other processes are left to expire. Turning it back on backfills presence for tracked sessions and re-registers the tools.
- A host notices a flip made by another process (or by another machine sharing the registry) on its next coordination check: its heartbeat, a write/edit, a team tool call, or `GET /coordination`. The tool catalog follows within one heartbeat, and the panel POST is immediate.
- The switch never flips itself. A host that sees several sessions while off keeps that count internally and does not warn in the panel (ADR 18).
- The switch governs the DSH host. The CLI writes the same board files directly and does not consult the switch, so a claim made through the CLI is visible to every host even while the switch is off. The Pi adapter does not read this switch; it coordinates while the extension is installed.

## Write guard

Step 0: the guard only runs while the coordination switch is on.

1. resolve the write/edit target against the session cwd, then the repository root;
2. deny if a live lease belongs to another agent;
3. otherwise create an auto lease in the current change;
4. release auto leases on idle; release all leases when the session is disposed.

There is one guard policy. Writes and edits are auto-claimed and live conflicts are denied; the panel and the agents' prompt context always show the current leases. Shell edits are outside the guard.

The guard fails open: if recording the lease itself fails (for example the board directory cannot be written), the write is allowed and the host logs a warning. Coordination never blocks work because its own bookkeeping broke.

## Project registry

Each host writes a global index entry when it tracks a root:

```json
{ "projects": [{ "root": "/abs/repo", "name": "repo", "lastSeenAt": 1793280396000 }] }
```

GET /projects reads the union of the host's known roots and this index, then computes a summary from each board:

```json
{
  "root": "/abs/repo",
  "name": "repo",
  "agents": 2,
  "active": 1,
  "working": 1,
  "blocked": 0,
  "claims": 2,
  "changes": 1,
  "lastActivityAt": 1793280399000,
  "lastSeenAt": 1793280396000,
  "status": "active | claimed | idle",
  "lastSummary": "timeline: claim/release observability"
}
```

`active` is the number of live non-stale sessions that are not done, including idle ones; it is a session count, not a "working now" count. `working` counts sessions with status `active`, and `blocked` counts status `blocked`. `lastActivityAt` is the newest `updatedAt`, claim timestamp, or change timestamp. It is never a heartbeat. A project's `status` is `active` when a session is working or blocked; it is `claimed` when no session is working or blocked but live leases remain; otherwise it is `active` when `lastActivityAt` is within 30 minutes (`ACTIVE_WINDOW_MS`) and `idle` beyond that. Projects are sorted by last activity. Selecting a project only changes which board is read.

## HTTP surface

| Method | Path              | Body    | Result                          |
| ------ | ----------------- | ------- | ------------------------------- |
| GET    | /health           | -       | ok, pid, current root           |
| GET    | /projects         | -       | recent projects and status      |
| GET    | /state?root=<abs> | -       | agents, claims, changes, stats  |
| GET    | /coordination     | -       | enabled, trackedSessions, roots |
| POST   | /coordination     | enabled | flip the switch                 |

/state also returns `coordination: { enabled, trackedSessions, roots }`. A POST body must be sent as `application/json`; any other content type is rejected before parsing.

The panel itself sends no board writes: reads serve the panel, and POST /coordination is the only write route. Serving a board through /state registers its root with the host, whose background heartbeat sweep may then clear that board's expired leases and close their changes — the same maintenance it runs for boards it tracks. The host writes through the store directly and the CLI uses the same files. Cross-origin requests are denied.

## Compatibility

- Existing boards may carry fields the board no longer writes, such as an old message queue. Unknown fields are ignored, and old message directories can be deleted.
- Presence, claim, and change files remain valid. Missing timeline arrays are synthesized from createdAt/releasedAt.
