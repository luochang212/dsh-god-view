# godview

The generic core behind the God's Eye parallel-agent board.

It owns the on-disk board format, presence and file-lease persistence, the
claim/release timeline, project summaries, and a dependency-free CLI. It has no
DSH, Cordis, React, or browser dependency, so another host can reuse it.

## Install

```sh
npm install godview
```

## CLI

```sh
godview join    --name reviewer --focus "reviewing the guard"
godview status  --id <id> --focus "reading the claim timeline"
godview claim   --id <id> --paths src/store.js --intent "timeline fix"
godview release --id <id> --paths src/store.js --summary "done"
godview claims
godview changes
godview list
godview leave --id <id>
```

Run `godview --help` for flags and defaults. The CLI writes the same
`.dsh/parallel/` files the store API reads.

## API

```js
import { createAgent, claimPaths, releasePaths, snapshot } from 'godview';

createAgent('/repo', { id: 'reviewer', name: 'Reviewer', focus: 'reviewing' });
claimPaths('/repo', 'reviewer', ['src/store.js'], { intent: 'timeline fix' });
releasePaths('/repo', 'reviewer', ['src/store.js'], { summary: 'done' });
```

The package entry is `lib/store.js`. Every exported function is documented by
the source and exercised by `npm test`.

## Not a DSH plugin

`godview` has no `dsh.bundle` and does not install a DSH panel. For the DSH
host plugin and browser panel, install [`dsh-god-view`](https://www.npmjs.com/package/dsh-god-view).

## License

MIT
