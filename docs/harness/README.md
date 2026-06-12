# Racna interactive playground

A clicking playground for exercising every error type and scenario Racna can
capture. Open the page in a browser with the extension loaded, click the
buttons, and watch the badge, panel, toast, modal, and export react.

## Requirements for local testing

- **Node.js**: the serve script uses `npx http-server`, so there's nothing to
  install beyond Node itself.
- **A Chromium-based browser** (Chrome, Edge, Opera, Brave) with the Racna
  extension loaded. Build with `npm run build`, then load `dist/` unpacked via
  `chrome://extensions`.
- **Serve over HTTP, not `file://`.** Racna's default `enabledSites` list is
  `['localhost', '127.0.0.1']`, and `file://` URLs have no hostname, so nothing
  is captured there. (`fetch` also doesn't work on the `file:` scheme, so the
  network buttons would report `Network Error` instead of real status codes.)

## Running it

On Windows, double-click [`serve.cmd`](./serve.cmd) in this folder. It serves
the harness at <http://localhost:8000> and opens it in your default browser.

On any OS, from the project root:

```sh
npx http-server docs/harness -p 8000 -o
```

Then open <http://localhost:8000> in a browser where the Racna extension is
loaded.

## What's in here

Buttons are grouped by Racna's error `kind`:

| Group                   | Triggers                                                                                                                         |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Console                 | `console.error`, `console.warn`, with strings / objects / `Error` instances                                                      |
| Uncaught                | `throw` in `setTimeout`, `TypeError`, synthetic `ErrorEvent` with no stack (exercises the **Location** branch in the modal)      |
| Promise rejection       | `Promise.reject` with `Error` / string, async function that throws                                                               |
| Network (fetch)         | Local 404, 500, POST with body, network error (unresolvable domain), slow + `AbortController` (exercises the **duration** field) |
| Network (XHR)           | 500, network error, abort                                                                                                        |
| Breadcrumb scenarios    | Sequences that produce LOG / HTTP / NAV / CLICK breadcrumbs before the error fires                                               |
| Watch / Ignore matching | Stable, repeatable errors you can pre-create rules for                                                                           |
| Burst                   | One click fires 10 mixed errors so you can stress the badge counter, list scrolling, and clear button                            |

An activity log on the right shows what each button fired, so you can correlate
harness output to Racna captures.

## Suggested checklist

After every change to `src/overlay/` or `src/interceptor/`, walk through:

1. **Console**: click each button; the panel grows by one with the right `kind`
   and message.
2. **Uncaught**: `throw Error` should give a Stack Trace section in the modal.
   A synthetic `ErrorEvent` with no stack should give a Location section
   instead (filename + lineno only).
3. **Rejection**: should appear as a `rejection` kind in the panel.
4. **Network (fetch)**: status, method, URL, and `(N ms)` duration are all
   visible. POST should preserve the request body in the modal.
5. **Network, slow + abort**: wait about 3 s, then confirm the resulting
   **Network Error** entry has a duration around 3000 ms.
6. **Breadcrumbs**: open the modal for any breadcrumb-scenario entry. The
   Breadcrumbs section should show the preceding activity tagged with type.
7. **Watch**: create a Watch rule (eye icon on the entry, or via
   Settings → Rules), fire the matching button, and the toast appears.
8. **Watch + note**: add a note to the rule (with a URL), fire again, and the
   note appears under the toast message with the link clickable.
9. **Ignore**: create an Ignore rule for one of the matching scenarios, fire it,
   and the entry does **not** appear in the panel and no toast fires.
10. **Burst**: click the burst button. The badge counter jumps to 10+, the
    panel populates correctly, and Clear empties everything.
11. **Export**: with at least 3 entries captured, click Export. A file
    downloads as `racna-<date>-localhost.md`; open it and check that entries are
    separated by `---` and the content respects the AI format toggle and the
    per-field copy toggles.
12. **Selection mode**: click Select, toggle two or three entries, then Export.
    The file contains only those. Cancel returns to the normal view.

## External dependencies

Some buttons hit `https://httpbin.org/...` to exercise real cross-origin network
paths and remote server errors. If you're offline or behind a strict proxy
those buttons will fail, but the failures themselves are useful: you get a
network-error entry instead of a 500, which exercises the same code path.

The buttons that don't need external network:

- Everything under **Console**, **Uncaught**, and **Promise rejection**.
- **Network (fetch)**: "GET /does-not-exist (local 404)" and "GET
  nonexistent-domain (network error)".
- **Burst** still works. One of its requests is local; the rest just fail
  without network, which is fine for testing.

## Notes

- The harness uses inline `onclick` for readability. No build, no dependencies,
  intentionally trivial.
- Edits go directly into `index.html`. Reload the browser to pick them up.
- If buttons stop responding, check the DevTools console for syntax errors in
  the inline script.
