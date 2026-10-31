import { describe, expect, it } from 'vitest';
import { DYNAMIC_PART, concatParts, resolveParts } from '../../src/key-parts.js';

describe('resolveParts', () => {
  it('joins literal parts into a static key', () => {
    expect(resolveParts([{ literal: 'a.' }, { literal: 'b' }])).toEqual({
      dynamic: false,
      key: 'a.b',
    });
    expect(resolveParts([])).toEqual({ dynamic: false, key: '' });
  });

  it('builds a wildcard pattern from dynamic parts', () => {
    expect(resolveParts([{ literal: 'status.' }, DYNAMIC_PART])).toEqual({
      dynamic: true,
      pattern: 'status.*',
    });
    expect(resolveParts([{ literal: 'a.' }, DYNAMIC_PART, { literal: '.label' }])).toEqual({
      dynamic: true,
      pattern: 'a.*.label',
    });
    expect(resolveParts([DYNAMIC_PART, DYNAMIC_PART, { literal: '.x' }])).toEqual({
      dynamic: true,
      pattern: '*.x',
    });
  });

  it('reports no pattern when nothing is known', () => {
    expect(resolveParts([DYNAMIC_PART])).toEqual({ dynamic: true });
    expect(resolveParts([DYNAMIC_PART, DYNAMIC_PART])).toEqual({ dynamic: true });
  });
});

describe('concatParts', () => {
  it('appends parts', () => {
    expect(concatParts([{ literal: 'a' }], [DYNAMIC_PART])).toEqual([
      { literal: 'a' },
      DYNAMIC_PART,
    ]);
  });
});
