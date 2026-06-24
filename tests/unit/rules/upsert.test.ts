import { beforeEach, describe, expect, it } from 'vitest';

import { upsertRule } from '../../../src/overlay/rules/editor';
import { state } from '../../../src/overlay/state';

import type { Rule } from '../../../src/shared/types';

const ruleA = (over: Partial<Rule> = {}): Rule => ({
  id: 'a',
  kind: 'network',
  pattern: '/api/*',
  status: 500,
  createdAt: 1,
  ...over,
});

beforeEach(() => {
  state.ignoreRules = [];
  state.watchRules = [];
});

describe('upsertRule', () => {
  it('adds a new rule to the chosen list', () => {
    upsertRule('watch', ruleA());
    expect(state.watchRules).toHaveLength(1);
    expect(state.ignoreRules).toHaveLength(0);
  });

  it('replaces a same-key rule in the same list (no duplicate)', () => {
    upsertRule('watch', ruleA({ id: 'a', note: 'first' }));
    upsertRule('watch', ruleA({ id: 'b', note: 'second' }));
    expect(state.watchRules).toHaveLength(1);
    expect(state.watchRules[0]?.note).toBe('second');
  });

  it('moves a rule across lists on a flip', () => {
    upsertRule('watch', ruleA());
    upsertRule('ignore', ruleA({ id: 'b' }));
    expect(state.watchRules).toHaveLength(0);
    expect(state.ignoreRules).toHaveLength(1);
  });

  it('preserves the existing id and createdAt when replacing', () => {
    upsertRule('watch', ruleA({ id: 'orig', createdAt: 111 }));
    upsertRule('ignore', ruleA({ id: 'new', createdAt: 999, note: 'moved' }));
    expect(state.ignoreRules[0]?.id).toBe('orig');
    expect(state.ignoreRules[0]?.createdAt).toBe(111);
    expect(state.ignoreRules[0]?.note).toBe('moved');
  });
});
