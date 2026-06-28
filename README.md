# Racna

> Errors and failed requests, quietly delivered to your corner.

Racna is a Chrome and Edge extension that passively captures JavaScript errors,
failed network requests, console warnings, and unhandled promise rejections on
any page where you enable it. Captured events land in a small overlay panel
that stays quiet until there is something worth looking at.

Racna is **not** a DevTools replacement. For deep inspection, DevTools is still
the right tool. This is for the moments when you want to know _what just broke_
without opening anything else.

## Features

- **Captures** console errors, console warnings, uncaught exceptions, unhandled
  promise rejections, and failed HTTP requests (fetch + XHR)
- **Breadcrumbs**: navigation, clicks, logs, and HTTP traffic preceding each
  error
- **Ignore rules** to pattern-match noise away
- **Watch rules** that surface specific patterns as toast notifications
- **AI format toggle**: one switch turns the Markdown copy/export into a
  structured, AI-ready document (error first, fenced sections, breadcrumb
  timeline, truncation notes, credential headers redacted)
- **Selection mode + export** for bulk-exporting entries as Markdown
- **Per-site enable**: runs only on sites you opt into

## Installation

### Production (Chrome / Edge stores)

Available on the [Chrome Web Store](https://chromewebstore.google.com/detail/racna/ndnmoojoigohopagkggbjmdinlambgfg). Edge Add-ons is coming soon.

### Development / Unpacked

1. Clone this repo and run `npm install`
2. Run `npm run build` to produce `dist/`
3. Open `chrome://extensions` (or `edge://extensions`) → enable Developer mode
   → "Load unpacked" → select the `dist/` folder

## Permissions

Racna requests two permissions:

- **`storage`** persists your settings and rules via `chrome.storage.sync`.
  Nothing is sent over the network.
- **`<all_urls>`** lets the content scripts load on pages broadly. Racna only
  captures, stores, or shows anything on pages where you enable the per-site
  toggle, and nothing is ever sent over the network. By default, only
  `localhost` and `127.0.0.1` are enabled.

## Privacy

**No data leaves your browser.** Racna:

- Sends no telemetry, analytics, or crash reports
- Does not phone home or include third-party scripts at runtime
- Stores captured events in the tab's memory (not persisted across browser
  restarts)
- Stores user-defined rules in `chrome.storage.sync`, which syncs across your
  own Google account devices and never leaves Google's storage

See [docs/privacy.html](https://Niki-Mozzon.github.io/racna/privacy.html) for
the full privacy policy.

## Development

### Requirements

- Node.js 20.x or newer (`nvm use` if you have nvm)
- npm 10.x or newer (ships with Node 20)

### Setup

```bash
git clone https://github.com/Niki-Mozzon/racna.git
cd racna
npm install
```

### Common commands

| Command                               | What it does                         |
| ------------------------------------- | ------------------------------------ |
| `npm run dev`                         | Watch mode, rebuilds on save         |
| `npm run build`                       | Production build to `dist/`          |
| `npm run typecheck`                   | TypeScript type check (no emit)      |
| `npm run lint` / `npm run lint:fix`   | ESLint                               |
| `npm run format` / `format:check`     | Prettier                             |
| `npm run test` / `npm run test:watch` | Vitest unit tests                    |
| `npm run ci`                          | Run everything CI runs               |
| `npm run package`                     | Build + produce CWS / Edge-ready ZIP |

### Loading the unpacked extension

After `npm run build` (or `npm run dev` for watch mode), point Chrome's "Load
unpacked" at the `dist/` folder.

### Code structure

- `src/shared/`: types and protocol constants shared between content-script
  contexts
- `src/interceptor/`: runs in the page's MAIN world; wraps `console` / `fetch`
  / `XHR`
- `src/overlay/`: runs in the ISOLATED world; renders the UI in a shadow DOM
- `src/popup/`: browser-action popup
- `tests/unit/`: Vitest unit tests
- `docs/harness/`: a clicking-playground page for exercising captures by hand

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Security issues: see
[SECURITY.md](SECURITY.md) and report privately.

## Tech stack

- TypeScript (strict mode)
- esbuild bundler
- Manifest V3
- Vitest + happy-dom for unit tests
- ESLint, Prettier, Husky, lint-staged, commitlint
- Changesets for releases
- Zero runtime dependencies

## License

MIT, see [LICENSE](LICENSE).
