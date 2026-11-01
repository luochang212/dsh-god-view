# dsh-god-view

Give parallel agents a god's eye view: who is active, what they are doing, which files they hold, and when those leases are released. A DSH plugin, on by default, with one switch to turn it off.

This package is the DSH adapter. The generic board store, protocol, and CLI live in [`godview`](https://www.npmjs.com/package/godview).

## Install

```sh
dsh plugin --profile desktop add dsh-god-view
```

Restart DSH; the sidebar entry is "God's Eye".

## What it does

- **Presence**: one focus line per session, saying what it is doing now.
- **Claim**: a lease taken before a write; a second session holding the same path is denied.
- **Change**: the conversation, intent, paths, and a claim/release timeline.

Boards are per repository and never block each other; the global project index is navigation only and never merges leases.

## Configuration

```yaml
- insert:
    - id: dsh-god-view
      name: dsh-god-view
      config:
        heartbeatMs: 15000
        ttlMs: 60000
        autoClaimTtlMs: 600000
        releaseAutoOnIdle: true
```

Leave `root` empty to monitor multiple projects. Set `registryDir` only if the default `~/.dsh/parallel` is wrong.

## CLI

The CLI belongs to the core package and is not exposed as a binary by the adapter. Install it when needed:

```sh
npm install -g godview
godview claims
godview changes
```

Or run it from this repository:

```sh
node packages/godview/bin/godview.mjs claims
```

## Turning coordination off

When the panel switch is off, the plugin is fully dormant: no board, no presence, no leases, no `team_*` tools, and no write guard. Turning it back on restores them.

## Documentation

- [Full README](https://github.com/luochang212/dsh-god-view/blob/main/README.en.md)
- [Protocol](https://github.com/luochang212/dsh-god-view/blob/main/docs/protocol.md)
- [Decision archive](https://github.com/luochang212/dsh-god-view/tree/main/adr)

## License

MIT
