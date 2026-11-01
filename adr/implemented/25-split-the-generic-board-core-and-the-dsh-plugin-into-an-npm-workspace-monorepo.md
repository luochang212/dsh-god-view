---
status: implemented
date: 2026-11-02
description: Split the board into a generic godview core and a DSH adapter,
  published from one npm workspace.
raised-by: agent
decided-by: human
created: 2026-11-02
commit: 83f91f0
paths:
  - package.json
  - packages/godview/package.json
  - packages/dsh-god-view/package.json
  - .changeset/config.json
  - .github/workflows/ci.yml
  - AGENTS.md
  - README.md
  - README.en.md
  - docs/protocol.md
  - packages/godview/lib/store.js
  - packages/godview/bin/godview.mjs
  - packages/godview/test/store.test.mjs
  - packages/godview/README.md
  - packages/dsh-god-view/lib/index.js
  - packages/dsh-god-view/lib/client.js
  - packages/dsh-god-view/cordis.patch.yml
  - packages/dsh-god-view/test/host-smoke.mjs
  - packages/dsh-god-view/README.md
  - packages/dsh-god-view/README.en.md
  - .changeset/README.md
---

# ADR: 25 Split the generic board core and the DSH plugin into an npm workspace monorepo

## Problem

The repository currently has one publishable package, dsh-god-view, whose root
manifest mixes three concerns: the generic board store and CLI, the DSH host
plugin and browser panel, and the DSH bundle metadata. The project now needs a
second public name, godview, for the generic core that other agents and other
hosts can use without importing DSH. One npm package cannot carry two names, and
duplicating the core into a second package would create two sources of truth.

The split has to happen before the first public release, because the install
paths, package contents, and publish order become public contracts after that.

## Decision

Use npm workspaces with a private root and two public packages:

- packages/godview is the generic core. It owns the board file format, the
  store API, the dependency-free CLI, and the protocol documentation. It must
  not import DSH, Cordis, React, or the browser module loader.
- packages/dsh-god-view is the DSH adapter. It owns the host plugin, the browser
  panel, the bundle patch, locale metadata, and the icon. It depends on
  godview and may import the core, but the core never imports it.
- The repository root stays private and holds the ADR archive, the Astro site,
  shared tooling, and the workspace lockfile. site/ remains its own project with
  its own lockfile and is not a workspace.
- The CLI is published by godview as godview. dsh-god-view no longer publishes a
  bin; installing the adapter brings the CLI through its dependency.
- The bundle patch lives only in packages/dsh-god-view and keeps the id and
  package name dsh-god-view. godview has no dsh.bundle and is not installable as
  a DSH plugin by itself.
- Both packages start at 0.1.0. Changesets manages subsequent versions with a
  fixed group so the core and the adapter move together. The first 0.1.0
  publish is manual; changesets starts with the next change.
- Publish order is godview first, then dsh-god-view, so the adapter's registry
  dependency resolves on install.

## Alternatives considered

- One package plus a godview alias: rejected because it either duplicates the
  DSH plugin (two bundle rows, two API routes, two panel ids) or publishes a
  name that is not a real generic core.
- Two independent repositories: rejected because the adapter and the core are
  developed together, and cross-repo versioning would drift before there is a
  second consumer.
- Put site/ into the workspace: rejected because the Astro project has its own
  dependency tree, lockfile, and Pages workflow; nesting it adds lockfile and
  CI complexity without sharing runtime code.
- Keep the root as the DSH package and add packages/godview: rejected because
  the root would still be a publish target and the adapter would not have a
  clean package boundary.

## Consequences

### Verification

- The root `package.json` is private, declares `packages/*`, and has no `dsh`
  or `bin` field.
- `packages/godview` packs five files: `lib/store.js`, `bin/godview.mjs`,
  `package.json`, `README.md`, and `LICENSE`. It has no DSH manifest and does
  not depend on `dsh-god-view`.
- `packages/dsh-god-view` packs ten files: host, client, bundle patch, locale,
  icon, manifest, READMEs, and LICENSE. It declares `godview` as a dependency.
- `npm run check` passes from the root; both workspace test suites and the host
  smoke run through workspace scripts.
- `npm pack --workspace godview` and `npm pack --workspace dsh-god-view` both
  succeed. A clean temporary npm project installed both tarballs together and
  imported both packages.
- The desktop profile symlink points at `packages/dsh-god-view`; importing the
  adapter from the profile loads `godview` through the repository's workspace
  link.
- `.changeset/config.json` exists with the two packages in a fixed group; the
  root exposes `changeset`, `version-packages`, and `release` scripts. The
  first 0.1.0 publish remains manual.
- `AGENTS.md`, both READMEs, `docs/protocol.md`, and CI describe the new paths.

### Trade-offs

- Historical ADR prose still names lib/store.js, lib/index.js, and
  bin/dsh-god-view.mjs. Their `paths:` metadata was remapped to the new package
  locations so `adrkit relevant` and `validate` keep working; the prose itself
  remains historical.
- The desktop profile symlink moved from the repository root to
  `packages/dsh-god-view`; the running host needs a restart or patch-timestamp
  change before it loads the new path.
- npm cannot include files outside a package directory. Each package carries
  its own README and LICENSE, and the adapter tarball no longer ships `adr/` or
  `AGENTS.md`.
- A local-path `dsh plugin add` of `packages/dsh-god-view` fails until `godview`
  is on the registry, because the dependency is a registry range. The workspace
  symlink is the development path; the first release must publish `godview`,
  then `dsh-god-view`, then install the adapter in a scratch profile.
- Fixed versions couple the two packages: a core-only change still releases the
  adapter. That is intentional while the adapter is the only consumer.

