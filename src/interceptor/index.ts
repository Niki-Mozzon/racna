// Entry point for the MAIN-world content script (manifest: world: "MAIN",
// run_at: "document_start"). It is injected into the *page's* JS context
// before any page script runs, which is what lets us replace console methods
// and patch fetch/XHR before the app can grab references to the originals.
//
// This tier only *captures* and ships events; all UI lives in the overlay
// (ISOLATED world). The two communicate over window.postMessage; see
// messaging.ts.

import { initBreadcrumbs } from './breadcrumbs.js';
import { getOrigError, installConsoleWrappers } from './console.js';
import { initErrorListeners } from './errors.js';
import { setupReplayListener } from './messaging.js';
import { initNavigation } from './navigation.js';
import { initNetwork } from './network.js';

// Order matters only for the last step: the replay listener needs the
// *original* console.error, which console.js captures the moment its module
// loads, so installing the wrappers first is safe, and we hand the saved
// original to the replay listener at the end.
(function init(): void {
  installConsoleWrappers();
  initErrorListeners();
  initBreadcrumbs();
  initNavigation();
  initNetwork();
  setupReplayListener(getOrigError());
})();
