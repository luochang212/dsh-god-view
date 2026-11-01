# Changesets

The first public release, 0.1.0, is published manually. After that, every
user-visible change needs a changeset:

```sh
npm run changeset
npm run version-packages
npm run release
```

`godview` and `dsh-god-view` are a fixed group: a change to either package
releases both at the same version, so the generic core and the DSH adapter never
drift apart.
