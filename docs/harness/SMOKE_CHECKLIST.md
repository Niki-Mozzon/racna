# Pre-launch smoke checklist

This is the human-driven verification pass before the repo flips to public
visibility. Walk through it once after a successful `npm run build`. Each check
should take 1–3 minutes; the whole pass is about 30–45 minutes.

The harness mechanics (what buttons fire what events) live in
[`README.md`](./README.md). This file is the launch checklist: what behaviour
to verify, and in what order.

## Prerequisites

- [ ] `npm run build` completed clean (`dist/` exists and looks complete)
- [ ] `gh run list --limit 1` shows the latest `ci.yml` run **green**
- [ ] You have Chrome and Edge installed

## 1. Load the unpacked extension in Chrome

- [ ] Open `chrome://extensions`
- [ ] Toggle **Developer mode** on (top-right)
- [ ] Click **Load unpacked**, then select the project's `dist/` folder
- [ ] The "Racna" entry appears in the list with the violet octagram icon
- [ ] No red error banner under the entry
- [ ] Pin the extension to the toolbar (puzzle-piece icon, then pin)

## 2. Popup sanity

- [ ] Click the Racna icon in the toolbar
- [ ] Popup renders: dark theme, "Racna" title, on/off toggle, "⚙ Open Settings" button
- [ ] Toggle off, then on, with no errors in `chrome://extensions` → Racna →
      Inspect views → popup → Console

## 3. Manual harness pass

Double-click `docs/harness/serve.cmd` (Windows), or open a terminal in the
project root:

```sh
npx http-server docs/harness -p 8000 -o
```

Then open <http://localhost:8000> in Chrome.

Walk the **Suggested checklist** in [`README.md`](./README.md):

- [ ] **Console**: each button adds one entry, correct kind and message
- [ ] **Uncaught**: modal Stack Trace section populated for `throw Error`;
      Location section populated for synthetic ErrorEvent (no stack)
- [ ] **Rejection**: appears as `rejection` kind
- [ ] **Network (fetch)**: status / method / URL / duration all visible;
      POST body preserved in modal
- [ ] **Network, slow + abort**: duration is ≈3000 ms
- [ ] **Breadcrumbs**: modal Breadcrumbs section shows preceding activity
      with type tags (LOG / NAV / CLICK / HTTP)
- [ ] **Watch toast**: create a Watch rule, fire the matching button, toast
      appears with the rule's note (if any) and dismisses correctly
- [ ] **Ignore rule**: create an Ignore rule, fire the matching button, no
      entry appears
- [ ] **Burst**: clicking the burst button adds 10 entries; badge counter
      and scrolling work
- [ ] **Clear**: the Clear button empties the list
- [ ] **Export, all**: produces a `racna-YYYY-MM-DD-HHMM-hostname.md` file
- [ ] **Export, selected**: enter selection mode, pick a few, export them, and
      the file contains only the picked entries
- [ ] **Copy templates**: Builtin → Full / Console / Network / Compact / AI
      Debug each produce different Markdown output when "Copy all" is hit
- [ ] **Save custom template**: saves under "My templates"; the ✱ marker appears
      when fields drift; **↻ Update** appears for dirty custom templates

## 4. Real-site smoke test

Pick at least 3 sites of varying complexity. **Enable Racna per-site in the
settings → Sites tab** before testing each.

Suggested:

- [ ] **SPA**: GitHub itself, or any React/Vue dashboard you have access to
- [ ] **CSP-restricted page**: e.g., a banking site or GitHub's `raw.` view
- [ ] **Page with its own fetch wrapper**: e.g., Stripe Checkout, Vercel
      dashboard

For each:

- [ ] No CSP violations in DevTools Console attributed to Racna
- [ ] No infinite loops or runaway memory growth
- [ ] Trigger an error (you can use `console.error('test')` in DevTools) and
      verify capture
- [ ] Open Settings → Rules; the UI is interactive

## 5. Edge cross-browser

- [ ] Open `edge://extensions`
- [ ] **Developer mode** on
- [ ] **Load unpacked**, then select the same `dist/` folder
- [ ] Repeat sections 2 and 3 in Edge
- [ ] Behaviour matches Chrome (same captures, same UI)

## 6. Bundle inspection (already done; re-verify after any rebuild)

- [ ] `dist/interceptor.js`, `dist/overlay.js`, `dist/popup/popup.js` exist
- [ ] Open each in a text editor: readable JavaScript, not minified
- [ ] `grep -c TODO dist/**/*.js` returns 0

## 7. Enable branch protection on `main`

After the first `ci.yml` run completes green (so the `build` job appears in the
status-check dropdown):

- [ ] GitHub → repo → **Settings → Branches**
- [ ] Add a rule for `main`:
  - [ ] **Require a pull request before merging**
  - [ ] **Require status checks to pass before merging**, then search for
        `build` and check it
  - [ ] **Do not allow bypassing the above settings** (optional, your call)
  - [ ] Leave **force pushes** and **deletions** disabled

## 8. Sign-off

When every box above is ticked:

- [ ] Codebase is ready to flip the repo to public visibility
- [ ] First Chrome Web Store submission can be drafted from
      `releases/racna-<version>.zip` (run `npm run package` to regenerate)

If you hit anything weird during this walk-through, file it as a regression
against the relevant commit. The commits are well-scoped, so `git bisect`
should narrow it fast.
