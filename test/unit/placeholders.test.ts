import { describe, expect, it } from 'vitest';
import { extractPlaceholders, hasTranslatableText } from '../../src/placeholders.js';

const sorted = (set: Set<string>) => [...set].sort();

describe('extractPlaceholders: Laravel', () => {
  const laravel = (value: string) => sorted(extractPlaceholders(value, ['laravel']));

  it('finds :name placeholders and treats casing variants as the same name', () => {
    expect(laravel('Hello :name, welcome :Name and :NAME!')).toEqual([':name']);
    expect(laravel('You have :count new :items.')).toEqual([':count', ':items']);
    expect(laravel(':seconds सेकन्ड')).toEqual([':seconds']);
  });

  it('ignores times, URLs, labels and double colons', () => {
    expect(laravel('Open at 10:30, see https://example.com/a:b and Note:please')).toEqual([]);
    expect(laravel('Namespace::method and a :: b')).toEqual([]);
    expect(laravel('Total: 5')).toEqual([]);
  });

  it('reads placeholders with non-Latin names', () => {
    expect(laravel('नमस्ते :नाम')).toEqual([':नाम']);
  });
});

describe('extractPlaceholders: i18next', () => {
  const i18next = (value: string) => sorted(extractPlaceholders(value, ['i18next']));

  it('finds {{name}} with spaces, formats and unescape prefixes', () => {
    expect(i18next('Hello {{name}}, {{ count }} items, {{- html}} and {{date, datetime}}')).toEqual(
      ['{{count}}', '{{date}}', '{{html}}', '{{name}}'],
    );
    expect(i18next('No placeholders {here} or {{}}')).toEqual([]);
  });
});

describe('extractPlaceholders: ICU', () => {
  const icu = (value: string) => sorted(extractPlaceholders(value, ['icu']));

  it('finds simple arguments', () => {
    expect(icu('Hello {name}, you are {age, number} years old')).toEqual(['{age}', '{name}']);
    expect(icu('Positional {0} and {1}')).toEqual(['{0}', '{1}']);
  });

  it('finds plural and select arguments and placeholders inside branches', () => {
    expect(
      icu('{count, plural, =0 {No items for {owner}} one {# item} other {# items by {owner}}}'),
    ).toEqual(['{count}', '{owner}']);
    expect(icu('{gender, select, male {He} female {She} other {{name}}}')).toEqual([
      '{gender}',
      '{name}',
    ]);
    expect(icu('{n, selectordinal, one {#st} other {#th}}')).toEqual(['{n}']);
  });

  it('handles quoting, malformed input and non-argument braces', () => {
    expect(icu("It''s '{literal}' and {real}")).toEqual(['{real}']);
    expect(icu("quote ' alone {x}")).toEqual(['{x}']);
    expect(icu("'{unterminated")).toEqual([]);
    expect(icu('{unclosed')).toEqual([]);
    expect(icu('{count, plural, one {unclosed')).toEqual([]);
    expect(icu('{# not a name} {} { }')).toEqual([]);
    expect(icu('{when, date, short}')).toEqual(['{when}']);
  });
});

describe('extractPlaceholders: combinations', () => {
  it('does not read {{name}} as an ICU argument when i18next is also enabled', () => {
    expect(sorted(extractPlaceholders('{{name}} and {other}', ['i18next', 'icu']))).toEqual([
      '{other}',
      '{{name}}',
    ]);
  });

  it('returns nothing when no syntax is enabled', () => {
    expect(extractPlaceholders(':name {{x}} {y}', []).size).toBe(0);
  });
});

describe('hasTranslatableText', () => {
  it('requires letters outside of placeholders', () => {
    expect(hasTranslatableText('Export CSV', ['laravel'])).toBe(true);
    expect(hasTranslatableText(':count', ['laravel'])).toBe(false);
    expect(hasTranslatableText('{{count}} {{x}}', ['i18next'])).toBe(false);
    expect(hasTranslatableText('{n} / {m}', ['icu'])).toBe(false);
    expect(hasTranslatableText('100% 123', ['laravel'])).toBe(false);
    expect(hasTranslatableText('नमस्ते', [])).toBe(true);
  });
});
