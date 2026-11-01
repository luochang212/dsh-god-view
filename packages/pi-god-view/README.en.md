# pi-god-view

A God's Eye board for parallel agents in the Pi coding agent: who is doing what, which file is leased, and when it was released. Native TUI, no DSH or browser dependency.

This is the Pi adapter. The generic board store, protocol, and CLI live in [`godview`](https://www.npmjs.com/package/godview). Boards are stored in `.dsh/parallel/` inside the repository, so Pi and DSH can share the same board.

## Install

```sh
pi install npm:pi-god-view
```

Until the first 0.1.0 release is on npm, use the local path below; the npm command becomes available after publishing.

Restart Pi or reload extensions. For local development, point Pi at the package directory:

```sh
pi -e /absolute/path/to/dsh-god-view/packages/pi-god-view
```

## What it does

- **Presence**: one focus line per Pi session, saying what it is doing now.
- **Claim**: write/edit auto-claims a lease; a write to a path held by another session is blocked.
- **Change**: records the session, intent, paths, and claim/release timeline.

Each repository has its own board, so work in one repo never blocks another. Claims are exact file paths, not directories or globs.

## Three tools

| Tool          | Purpose                                                                               |
| ------------- | ------------------------------------------------------------------------------------- |
| `team_status` | Publish status / focus / plan / files; `done` releases all leases held by the session |
| `team_roster` | Read agents, focus, live claims, and active/recent changes for this repository        |
| `team_claim`  | Claim, release, or list exact paths                                                   |

The model auto-claims before a write. Explicit `team_claim` is for planned work, review leases, or early release. Idle releases automatic leases; explicit leases remain until released or their TTL expires.

## TUI panel

```text
/godview # toggle the current repository's board widget
/godview on
/godview off
/godview status
```

The panel refreshes every 2.5 seconds and is read-only: active sessions, focus, live claims, and recent changes for the current repository. v1 does not include the DSH browser panel's project rail, Gantt, or coordination switch.

> The Pi adapter keeps coordination on while the extension is enabled. `/godview off` only hides the panel; it does not release leases or remove tools. Remove the extension when you do not want coordination.

## Boundaries

- It guards Pi's `write` / `edit` only; file changes made through bash or `run_code` are outside the guard.
- It writes only `.dsh/parallel/`: no database, daemon, global lock, or second protocol.
- There are no messages, inbox, or composer; focus is a session property, not a message.
- Pi v1 is TUI-only and has no browser panel. Use the DSH adapter when you need the browser board.
- Runtime: Node >= 22.19 (Pi's requirement); no build step.

## Development

```sh
npm install
npm run test -w pi-god-view
node --check packages/pi-god-view/extensions/pi-god-view.js
```

## License

MIT
