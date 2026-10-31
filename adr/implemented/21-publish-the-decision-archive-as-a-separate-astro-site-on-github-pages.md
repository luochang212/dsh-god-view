---
status: implemented
date: 2026-10-31
description: Read when changing the published decision archive, its Astro site, or the GitHub Pages workflow.
raised-by: human
decided-by: human
created: 2026-10-31
commit: 2fb91a9
paths: ['site/**', '.github/workflows/site.yml']
---

# ADR: 21 Publish the decision archive as a separate Astro site on GitHub Pages

## Problem

The repository's decisions were readable only through the CLI or as raw Markdown on GitHub. adr-kit can render a decision atlas, but the project had no published surface for it. The plugin deliberately has no build step and no runtime dependencies, so adding Astro to the root package would couple an installable plugin to a static site toolchain.

## Decision

The archive lives in its own private Astro project under `site/`. The plugin package keeps its dependency-free runtime.

`site/scripts/build-archive.mjs` runs before `astro dev` and `astro build`. It generates the adr-kit atlas four times, once for each theme and language pair (`folio` and `signal`, Chinese and English), writes them to `site/public/decisions/`, and writes `site/src/data/decisions.json` from the record frontmatter and headings. Astro renders one landing page at the Pages base path `/dsh-god-view/` and copies the atlas pages as static files.

The GitHub Pages workflow at `.github/workflows/site.yml` runs on pushes that touch `site/`, `adr/`, the dependency manifests, or the workflow. It installs the root dependencies, validates the records, installs the site dependencies, builds `site/dist`, and deploys that directory with `actions/deploy-pages`. Pages uses the GitHub Actions source, not a branch.

Generated atlas HTML and `site/src/data/decisions.json` are not committed. Both are rebuilt from the current records on every build.

## Alternatives considered

**Commit the generated atlas HTML.** Rejected: it duplicates every record, goes stale silently, and pins the published page to whichever commit last ran the build.

**Render the records as Astro content pages instead of using the adr-kit atlas.** Rejected: it would reimplement the directory, timeline, decision map, and reader that adr-kit already maintains, and it would drift whenever the record format changes.

**Add Astro to the root package.** Rejected: the plugin runtime stays dependency-free and build-free, and the published package should not carry site-only dependencies.

**Publish the atlas without a landing page.** Rejected: the atlas assumes a reader already knows the project. A cover page carries the project context, the record index, and the theme and language choices.

## Consequences

- The archive republishes on every relevant push. The plugin's install, test, and runtime paths are unchanged.
- The repository now has two dependency trees. The root `npm ci` installs adr-kit, and `site/npm ci` installs Astro. The pre-commit hook still checks only the root.
- The build depends on adr-kit's CLI output and on the `description`, `date`, and `paths` frontmatter fields. A record-format change requires updating `site/scripts/build-archive.mjs`.
- The published atlas is pinned to the build commit. The atlas footer and record source links point at that commit.
- `site/` is excluded from the npm `files` list, so the published package stays small.
