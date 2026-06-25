# Pre-launch smoke checklist

This is the human-driven verification pass before the repo flips to public
visibility. Walk through it once after a successful `npm run build`. Each check
should take 1–3 minutes; the whole pass is about 45–60 minutes.

The harness mechanics (what buttons fire what events) live in
[`README.md`](./README.md). This file is the launch checklist: what behaviour
to verify, and in what order.

## Prerequisites

- [ ] `npm run build` completed clean (`dist/` exists and looks complete)
- [ ] `gh run list --limit 1` shows the latest `ci.yml` run **green**
- [ ] You have Chrome and Edge installed

## 1\. Load the unpacked extension in Chrome

- [ ] Open `chrome://extensions`
- [ ] Toggle **Developer mode** on (top-right)
- [ ] Click **Load unpacked**, then select the project's `dist/` folder
- [ ] The "Racna" entry appears in the list with the violet octagram icon
- [ ] No red error banner under the entry
- [ ] Pin the extension to the toolbar (puzzle-piece icon, then pin)

## 2\. Popup sanity

- [ ] Click the Racna icon in the toolbar
- [ ] Popup renders: dark theme, "Racna" title, on/off toggle, "⚙ Open Settings" button
- [ ] Toggle off, then on, with no errors in `chrome://extensions` → Racna →
      Inspect views → popup → Console

## 3\. Manual harness pass

Double-click `docs/harness/serve.cmd` (Windows), or open a terminal in the
project root:

```sh
npx http-server docs/harness -p 8000 -o
```

Then open [http://localhost:8000](http://localhost:8000) in Chrome.

### Harness button reference

The exact button labels in the playground, in panel order top to bottom. The
endpoint column shows the URL a network button hits, so you can confirm the
capture matches.

**Console**

- [ ] **console.error** (`console.error(string)`)
- [ ] **console.error w/ object** (`console.error(string, object)`)
- [ ] **console.error(new Error)** (`console.error(Error)`)
- [ ] **console.warn** (`console.warn(string)`)

**Uncaught**

- [ ] **throw Error (via setTimeout)**
- [ ] **throw "string" (via setTimeout)**
- [ ] **trigger TypeError** (reads a prop off `undefined`)
- [ ] **synthetic ErrorEvent (no stack, Location case)** (drives the modal's
      Location branch)

**Promise rejection**

- [ ] **Promise.reject(new Error)**
- [ ] **Promise.reject("reason")**
- [ ] **async fn that throws**

**Network (fetch)**

- [ ] **GET /does-not-exist (local 404)** → `GET /does-not-exist`
- [ ] **GET httpbin.org/status/500** → `GET https://httpbin.org/status/500`
- [ ] **POST httpbin.org/status/500 w/ body** → `POST https://httpbin.org/status/500`
- [ ] **GET nonexistent-domain (network error)** → `GET https://<random>.invalid/`
- [ ] **GET httpbin.org/delay/10 → abort after 3 s** → `GET https://httpbin.org/delay/10`

**Network (XHR)**

- [ ] **XHR GET httpbin.org/status/500** → `GET https://httpbin.org/status/500`
- [ ] **XHR GET nonexistent-domain** → `GET https://<random>.invalid/`
- [ ] **XHR GET httpbin.org/delay/10 → abort after 2 s** → `GET https://httpbin.org/delay/10`

**Copy format payloads**

- [ ] **POST httpbin.org/status/500 w/ credential headers** → `POST https://httpbin.org/status/500` (Authorization + X-Api-Key)
- [ ] **POST /does-not-exist w/ 60 KB body** → `POST /does-not-exist`
- [ ] **POST /does-not-exist w/ ``` fence in body** → `POST /does-not-exist`

**Breadcrumb scenarios**

- [ ] **5 console.logs → console.error**
- [ ] **3 successful fetches → console.error** (3× `GET /`, all 200, breadcrumbs only)
- [ ] **click → pushState nav → throw**

**Watch / Ignore matching**

- [ ] **console.error: "API /api/foo failed"**
- [ ] **throw TypeError "cannot read properties of undefined"**
- [ ] **fetch /api/checkout (500), for url-pattern watch** → `GET https://httpbin.org/status/500?path=/api/checkout`

**Burst**

- [ ] **Trigger 10 mixed errors in rapid succession**

**Flood / lag** (not yet covered by the checks below)

- [ ] **A,B,A,B loop ×40 (dedup → 2 rows)**
- [ ] **fetch /route/1…/route/8 (distinct rows)** → `GET /route/1` … `GET /route/8`
- [ ] **Flood: 200 errors fast (trips pause)**

Walk the **Suggested checklist** in [`README.md`](./README.md):

- [ ] **Console**: each button adds one entry, correct kind and message
      (buttons **console.error**, **console.error w/ object**,
      **console.error(new Error)**, **console.warn**)
- [ ] **Uncaught**: modal Stack Trace section populated for `throw Error`;
      Location section populated for synthetic ErrorEvent (no stack)
      (buttons **throw Error (via setTimeout)** and
      **synthetic ErrorEvent (no stack, Location case)**)
- [ ] **Rejection**: appears as `rejection` kind (button
      **Promise.reject(new Error)**)
- [ ] **Network (fetch)**: status / method / URL / duration all visible;
      POST body preserved in modal (button **GET httpbin.org/status/500**,
      then **POST httpbin.org/status/500 w/ body** for the body)
- [ ] **Network, slow + abort**: duration is ≈3000 ms (button
      **GET httpbin.org/delay/10 → abort after 3 s**)
  - NOTE (2026-06-25): blocked, not failed. httpbin.org was degraded and
    fast-failed every `/delay/10` request as a status-0 network error in ~100 ms,
    so the 3 s abort timer never fired and the ≈3000 ms reading could not be
    observed. The capture path itself works (status, ~100 ms duration, and stack
    were all recorded correctly). Re-run when httpbin is healthy, or point the
    button at a local slow endpoint, to actually exercise the duration assertion.
- [ ] **Breadcrumbs**: modal Breadcrumbs section shows preceding activity
      with type tags (LOG / NAV / CLICK / HTTP) (buttons
      **5 console.logs → console.error**,
      **3 successful fetches → console.error**,
      **click → pushState nav → throw**)
- [ ] **Watch toast**: create a Watch rule, fire the matching button, toast
      appears with the rule's note (if any) and dismisses correctly (matching
      buttons live under **Watch / Ignore matching**, e.g.
      **console.error: "API /api/foo failed"**)
- [ ] **Ignore rule**: create an Ignore rule, fire the matching button, no
      entry appears (same **Watch / Ignore matching** buttons, e.g.
      **fetch /api/checkout (500), for url-pattern watch**)
- [ ] **Per-kind rules**: make an Ignore rule from a console error, then fire
      the uncaught and rejection buttons with a matching message; confirm they
      are NOT ignored (a console rule no longer covers uncaught/rejection)
      (console **console.error: "API /api/foo failed"**, uncaught
      **throw TypeError "cannot read properties of undefined"**, rejection
      **Promise.reject(new Error)**)
- [ ] **Editor, entry mode**: click Ignore on a network entry (capture one
      first via **GET httpbin.org/status/500**); the kind badge
      reads "Failed request", path/query chips render, wildcarding a segment
      updates the Pattern preview, and the Ignore/Watch toggle is present
- [ ] **Ignore/Watch flip**: create a Watch rule, then click Ignore on the same
      entry; the editor opens on **Watch** (not Ignore), the Ignore option
      blinks, and the caption reads "Already a watch rule. Tap Ignore to move
      it."; flip to Ignore and Save; the rule moves (gone from Watch, now in
      Ignore) with no duplicate
- [ ] **Re-open same type**: click Watch on an already-watched entry; the editor
      opens on Watch with NO blink and the caption "Already a watch rule;
      editing it."
- [ ] **Dedup**: create the identical rule twice; Settings → Rules shows one row
- [ ] **Panel bell**: a watched entry's bell is orange ("Edit watch rule") and
      opens the existing rule (read-only pattern + Delete button); a non-watched
      entry's bell is grey ("Watch this error") and opens entry mode to create one
- [ ] **Modal bell**: open a watched entry's detail modal, its watch bell is
      orange; create or delete that watch rule from the modal and the bell
      updates without reopening the modal
- [ ] **Settings, Edit rule**: each rule row shows a per-kind icon and an "Edit
      rule" button; it opens the rule (read-only pattern, note prefilled, Delete);
      editing the note and Save persists; Delete removes the rule
- [ ] **Toast Rule button**: fire a watch-matched event (e.g.
      **fetch /api/checkout (500), for url-pattern watch**); the toast shows
      View / Rule / ×; clicking **Rule** opens the matching rule and dismisses
      the toast
- [ ] **Relative-URL rule**: in DevTools run `fetch("api/does-not-exist")`,
      create a Watch rule from the captured entry, then re-run the same fetch;
      the bell goes orange and the toast fires (relative URLs match)
- [ ] **Burst**: clicking the burst button adds 10 entries; badge counter
      and scrolling work (button
      **Trigger 10 mixed errors in rapid succession**)
- [ ] **Clear**: the Clear button empties the list
- [ ] **Export, all**: produces a `racna-YYYY-MM-DD-HHMM-hostname.md` file
- [ ] **Export, selected**: enter selection mode, pick a few, export them, and
      the file contains only the picked entries
- [ ] **AI format toggle**: with the "AI" switch off, "Copy all" produces plain
      Markdown (page first); with it on, the copy leads with the error, fences
      payloads, and shows a TIMELINE block
- [ ] **AI toggle persists**: flip it, close and reopen the modal (and reload
      the page); the switch keeps its state, Export uses the same format, and
      the Export buttons' tooltips show "(AI format)" while the switch is on
- [ ] **Copy format payloads**: fire the three "Copy format payloads" buttons
      (**POST httpbin.org/status/500 w/ credential headers**,
      **POST /does-not-exist w/ 60 KB body**,
      **POST /does-not-exist w/ ``` fence in body**); in the AI copy,
      the 60 KB body entry carries a `\\\[body truncated at 50000 characters]`
      marker and the fence-in-body entry is wrapped in a lengthened
      four-backtick fence
- [ ] **Hide sensitive headers**: fire the credential-headers button (button
      **POST httpbin.org/status/500 w/ credential headers**); with the
      setting on (default), the copied entry shows `Authorization: \\\[redacted]`
      and `X-Api-Key: \\\[redacted]` in both formats; turn it off in Settings →
      Behaviour and the real values appear

## 4\. Real-site smoke test

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

## 5\. Edge cross-browser

- [ ] Open `edge://extensions`
- [ ] **Developer mode** on
- [ ] **Load unpacked**, then select the same `dist/` folder
- [ ] Repeat sections 2 and 3 in Edge
- [ ] Behaviour matches Chrome (same captures, same UI)

## 6\. Bundle inspection (already done; re-verify after any rebuild)

- [x] `dist/interceptor.js`, `dist/overlay.js`, `dist/popup/popup.js` exist
- [x] Open each in a text editor: readable JavaScript, not minified
      (478 / 2744 / 67 lines on 2026-06-25, not minified)
- [x] `grep -c TODO dist/\\\*\\\*/\\\*.js` returns 0

## 7\. Enable branch protection on `main`

After the first `ci.yml` run completes green (so the `build` job appears in the
status-check dropdown):

- [ ] GitHub → repo → **Settings → Branches**
- [ ] Add a rule for `main`:

  - [ ] **Require a pull request before merging**
  - [ ] **Require status checks to pass before merging**, then search for
        `build` and check it
  - [ ] **Do not allow bypassing the above settings** (optional, your call)
  - [ ] Leave **force pushes** and **deletions** disabled

## 8\. Sign-off

When every box above is ticked:

- [ ] Codebase is ready to flip the repo to public visibility
- [ ] First Chrome Web Store submission can be drafted from
      `releases/racna-<version>.zip` (run `npm run package` to regenerate)

If you hit anything weird during this walk-through, file it as a regression
against the relevant commit. The commits are well-scoped, so `git bisect`
should narrow it fast.
