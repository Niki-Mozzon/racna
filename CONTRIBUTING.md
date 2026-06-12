# Contributing to Racna

Thanks for your interest in contributing! Racna is an early-stage open-source
project; contributions of all sizes are welcome.

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). By
participating, you agree to its terms.

## Ways to contribute

### Reporting bugs

Use the [Bug report issue template](.github/ISSUE_TEMPLATE/bug_report.md).
Include browser version, what you expected vs what happened, steps to
reproduce, and any relevant console output.

### Requesting features

Use the [Feature request issue template](.github/ISSUE_TEMPLATE/feature_request.md).
Describe the problem you're trying to solve, not just the solution you have in
mind.

### Pull requests

1. **Open an issue first** for any non-trivial change to discuss the approach
2. **Fork and branch**: branch from `main`, name your branch descriptively
   (`feat/<scope>` or `fix/<scope>`)
3. **Code style**: enforced by ESLint and Prettier. Run
   `npm run lint:fix && npm run format` before pushing
4. **Tests**: add unit tests for pure logic in `tests/unit/`. Manual harness
   updates go in `docs/harness/`
5. **Type checks**: must pass; run `npm run typecheck` locally
6. **Changeset**: every PR that changes user-visible behaviour or APIs needs a
   changeset. Run `npx changeset` and pick the bump type
7. **Commit messages**: follow [Conventional Commits](https://www.conventionalcommits.org/),
   which commitlint enforces
8. **PR description**: use the template; include a test plan

## Development setup

See [README.md → Development](README.md#development) for full setup. TL;DR:

```bash
git clone https://github.com/Niki-Mozzon/racna.git
cd racna
npm install
npm run dev   # watch mode
```

Then load `dist/` as an unpacked extension in Chrome or Edge.

### Branch protection

The `main` branch is protected:

- Direct pushes blocked
- PRs require passing CI before merge
- No force-push, no deletion

## Release process

Releases are cut from `main` and tagged `v<semver>`. The release workflow in
`.github/workflows/release.yml` builds and packages the extension automatically
and produces a downloadable ZIP attached to the GitHub Release.

The CHANGELOG is generated from changeset files; **do not edit it by hand**.

## Questions

Open a [discussion](https://github.com/Niki-Mozzon/racna/discussions) (when
enabled) or an issue with the `question` label.
