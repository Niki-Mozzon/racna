# Changesets

Racna uses [Changesets](https://github.com/changesets/changesets) to manage
versioning and the changelog.

## What goes here

This folder collects per-PR "changeset" files. Each file describes a
user-visible change and the bump type (patch / minor / major). At release
time these files are consumed to update `CHANGELOG.md` and bump the version
in `package.json` and `public/manifest.json`.

## Creating a changeset

After making a user-visible change:

```bash
npx changeset
```

Pick the bump type, write a one-line summary, commit the generated markdown
file alongside your PR.

## When you don't need one

- Pure refactors with no behaviour change
- Internal docs (CONTRIBUTING, README dev sections)
- CI / tooling changes
- Test-only changes

Note this in the PR template instead. Reviewers will redirect you if a
changeset is actually needed.

## Configuration

See `config.json`. We use:

- `@changesets/changelog-github` so PR numbers and authors are linked in the
  generated changelog.
- `access: restricted` because we are not publishing to npm; this is an
  extension, not a library.
- `baseBranch: main`.
