// Rule matching engine. Tests an entry (or a raw incoming payload) against the
// user's ignore and watch rules. Used by entries.ts on the intake path. Pure
// reads of `state.ignoreRules` / `state.watchRules`; no mutation here.

import { state } from '../state.js';
import { globMatch, urlPathAndSearch } from '../util.js';

import type { Entry, Rule, InterceptorPayload } from '../../shared/types.js';

/**
 * Canonical identity of a rule: a string that is equal for two rules exactly
 * when they match the same thing. The editor's save path uses it to dedup
 * (remove any rule with this key, then add). Network rules key on the URL
 * pattern plus status; the console-family kinds key on their message pattern.
 * The kind prefix guarantees rules of different kinds never share a key.
 */
export function ruleKey(r: Rule): string {
  if (r.kind === 'network') {
    return 'network|' + (r.pattern ?? '') + '|' + String(r.status ?? '');
  }
  return r.kind + '|' + (r.pattern ?? '');
}

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

// A network rule matches a glob `pattern` against the URL path+search, with the
// status matching too.
function ruleMatchesNetwork(r: Rule, e: MatchableEntry): boolean {
  if (!r.pattern) return false;
  return globMatch(r.pattern, urlPathAndSearch(entryUrl(e))) && r.status === entryStatus(e);
}

// A console rule matches a glob `pattern` over the whole message.
function ruleMatchesConsole(r: Rule, e: MatchableEntry): boolean {
  return r.pattern ? globMatch(r.pattern, entryMessage(e)) : false;
}

/** True if any ignore rule matches (caller drops the entry). */
export function matchesIgnoreRule(e: MatchableEntry): boolean {
  for (const r of state.ignoreRules) {
    if (r.kind !== e.kind) continue;
    if (r.kind === 'network' ? ruleMatchesNetwork(r, e) : ruleMatchesConsole(r, e)) return true;
  }
  return false;
}

/** Return the first matching watch rule (needed for its id/cooldown), or null. */
export function findWatchRule(e: MatchableEntry): Rule | null {
  for (const r of state.watchRules) {
    if (r.kind !== e.kind) continue;
    if (r.kind === 'network' ? ruleMatchesNetwork(r, e) : ruleMatchesConsole(r, e)) return r;
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
