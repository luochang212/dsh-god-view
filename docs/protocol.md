# Parallel team board protocol (v3)

Protocol v3 keeps three concepts: **presence**, **claims/changes**, and a **per-repository project board**. Messages are not part of v3.

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

## Presence: agents/<id>.json

```json
{
  "protocol": 3,
  "id": "dsh-demo-agent",
  "name": "parallel-team builder",
  "sessionId": "session-demo-0001",
  "sessionTitle": "DSH 多 agent 协作插件设计",
  "parentId": null,
  "role": "agent",
  "status": "active | idle | blocked | done",
  "focus": "one line about the current work",
  "plan": null,
  "files": [],
  "branch": null,
  "startedAt": 1793280396000,
  "heartbeatAt": 1793280396000,
  "ttlMs": 90000
}
```

Focus is a current property, not a message. It has no reply state. Heartbeats renew it while the agent is tracked; stale presence is hidden by default.

## Claims and changes

Claim file:

```json
{
  "protocol": 3,
  "path": "lib/store.js",
  "agent": "dsh-demo-agent",
  "agentName": "parallel-team builder",
  "changeId": "ch-mvtntlri-ebc66424",
  "sessionId": "session-demo-0001",
  "sessionTitle": "DSH 多 agent 协作插件设计",
  "mode": "edit | review",
  "auto": false,
  "intent": "timeline: claim/release observability",
  "createdAt": 1793280396000,
  "ttlMs": 1800000,
  "expiresAt": 1793282196000
}
```

Change file:

```json
{
  "protocol": 3,
  "id": "ch-mvtntlri-ebc66424",
  "agent": "dsh-demo-agent",
  "agentName": "parallel-team builder",
  "sessionId": "session-demo-0001",
  "sessionTitle": "DSH 多 agent 协作插件设计",
  "intent": "timeline: claim/release observability",
  "paths": ["lib/client.js", "lib/store.js"],
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
      "agentName": "parallel-team builder",
      "path": "lib/client.js",
      "intent": "timeline: claim/release observability"
    },
    {
      "type": "release",
      "at": 1793280399000,
      "agent": "dsh-demo-agent",
      "agentName": "parallel-team builder",
      "path": "lib/client.js",
      "summary": "turn ended"
    }
  ]
}
```

Lifecycle:

- claim creates or extends the agent's active change and appends a claim event per path;
- release removes the lease and appends a release event; when no leases remain, the change becomes done with the release summary;
- auto release on idle uses summary turn ended;
- expired leases are removed and append an expire event; when no leases remain, the change becomes expired;
- one active change per agent; a new claim joins it unless it was released.

Release accepts a summary. Expiry uses lease expired. The timeline is capped at 200 events per change.

## Write guard

With claimPolicy: auto:

1. resolve the write/edit target against the session cwd, then the repository root;
2. deny if a live lease belongs to another agent;
3. otherwise create an auto lease in the current change;
4. release auto leases on idle; release all leases when the session is disposed.

claimPolicy: require denies a write with no lease. advisory and off disable the guard. Shell edits are outside the guard.

## Project registry

Each host writes a global index entry when it tracks a root:

```json
{ "version": 1, "projects": [{ "root": "/abs/repo", "name": "repo", "lastSeenAt": 1793280396000 }] }
```

GET /projects reads the union of the host's known roots and this index, then computes a summary from each board:

```json
{
  "root": "/abs/repo",
  "name": "repo",
  "agents": 2,
  "active": 1,
  "claims": 2,
  "changes": 1,
  "lastActivityAt": 1793280399000,
  "lastSeenAt": 1793280396000,
  "status": "active | claimed | idle",
  "lastSummary": "timeline: claim/release observability"
}
```

Projects are sorted by last activity. Selecting a project only changes which board is read.

## HTTP surface

| Method | Path              | Body                             | Result                         |
| ------ | ----------------- | -------------------------------- | ------------------------------ |
| GET    | /health           | -                                | ok, pid, current root          |
| GET    | /projects         | -                                | recent projects and status     |
| GET    | /state?root=<abs> | -                                | agents, claims, changes, stats |
| POST   | /presence         | root, id, patch                  | update presence                |
| POST   | /claim            | root, agent, paths, mode, reason | claim or conflicts             |
| POST   | /release          | root, agent, paths, force        | release and change state       |

The panel never mutates the board. The routes exist for the host and CLI; cross-origin requests are denied.

## v2 to v3

- Messages are removed. Old messages directories are ignored and can be deleted.
- Presence, claim, and change files remain valid. Missing timeline arrays are synthesized from createdAt/releasedAt.
- The board config is rewritten to protocol 3 on first use.
