// Rule matching engine. Tests an entry (or a raw incoming payload) against the
// user's ignore and watch rules. Used by entries.ts on the intake path. Pure
// reads of `state.ignoreRules` / `state.watchRules`; no mutation here.

import { state } from '../state.js';
import { globMatch, urlPath, urlPathAndSearch } from '../util.js';

import type { Entry, Rule, InterceptorPayload } from '../../shared/types.js';

// Accept either a finished Entry or a fresh payload, so the same rules can be
// applied before *and* after an event becomes an entry.
type MatchableEntry = Entry | (InterceptorPayload & { url?: string });

function entryUrl(e: MatchableEntry): string {
  return ('url' in e && typeof e.url === 'string' ? e.url : '') || '';
}

function entryMessage(e: MatchableEntry): string {
  return ('message' in e && typeof e.message === 'string' ? e.message : '') || '';
}

function entryStatus(e: MatchableEntry): number | null | undefined {
  return 'status' in e ? e.status : null;
}

// A network rule has two forms (see Rule in types.ts): a glob `pattern` against
// the path+search, or an exact `urlPath`. Either way the status must match too.
function ruleMatchesNetwork(r: Rule, e: MatchableEntry): boolean {
  if (r.pattern) {
    return globMatch(r.pattern, urlPathAndSearch(entryUrl(e))) && r.status === entryStatus(e);
  }
  return urlPath(entryUrl(e)) === r.urlPath && r.status === entryStatus(e);
}

// A console rule is either a glob `pattern` over the whole message, or a
// case-insensitive substring (`messageContains`, stored already-lowercased).
function ruleMatchesConsole(r: Rule, e: MatchableEntry): boolean {
  if (r.pattern) return globMatch(r.pattern, entryMessage(e));
  return (
    typeof r.messageContains === 'string' &&
    entryMessage(e).toLowerCase().includes(r.messageContains)
  );
}

// Console rules apply to all three non-network kinds: an uncaught error or a
// rejection is, for matching purposes, the same as a console error.
function isConsoleKind(kind: string | undefined): boolean {
  return kind === 'console' || kind === 'uncaught' || kind === 'rejection';
}

/** True if any ignore rule matches (caller drops the entry). */
export function matchesIgnoreRule(e: MatchableEntry): boolean {
  for (const r of state.ignoreRules) {
    if (r.kind === 'network' && e.kind === 'network') {
      if (ruleMatchesNetwork(r, e)) return true;
    } else if (r.kind === 'console' && isConsoleKind(e.kind)) {
      if (ruleMatchesConsole(r, e)) return true;
    }
  }
  return false;
}

/** Return the first matching watch rule (needed for its id/cooldown), or null. */
export function findWatchRule(e: MatchableEntry): Rule | null {
  for (const r of state.watchRules) {
    if (r.kind === 'network' && e.kind === 'network') {
      if (ruleMatchesNetwork(r, e)) return r;
    } else if (r.kind === 'console' && isConsoleKind(e.kind)) {
      if (ruleMatchesConsole(r, e)) return r;
    }
  }
  return null;
}

export function matchesWatchRule(e: MatchableEntry): boolean {
  return findWatchRule(e) !== null;
}

/** True while a watch rule is still in its cooldown window (fired more recently
 *  than watchCooldownSecs ago). A cooldown of 0 disables throttling entirely. */
export function withinCooldown(rule: Rule): boolean {
  if (!state.settings.watchCooldownSecs) return false;
  return (
    Date.now() - (state.watchToastTimes[rule.id] ?? 0) < state.settings.watchCooldownSecs * 1000
  );
}
