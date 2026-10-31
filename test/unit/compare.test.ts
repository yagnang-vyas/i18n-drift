import { describe, expect, it } from 'vitest';
import { compare, patternToRegExp, sortFindings } from '../../src/compare.js';
import type { Definition, Finding, Usage } from '../../src/types.js';
import { makeConfig } from '../helpers/index.js';

let specIndex = 0;
const def = (
  locale: string,
  key: string,
  value: string | null,
  extra: Partial<Definition> = {},
): Definition => ({
  locale,
  key,
  value,
  file: `locales/${locale}.json`,
  line: 1,
  format: 'json',
  specIndex,
  ...extra,
});
const use = (key: string, extra: Partial<Usage> = {}): Usage => ({
  key,
  file: 'src/a.ts',
  line: 3,
  column: 1,
  dynamic: false,
  ...extra,
});

function run(
  definitions: Definition[],
  usages: Usage[],
  raw: Record<string, unknown> = {},
  locales = ['en', 'fr'],
): Finding[] {
  specIndex = 0;
  return compare({ config: makeConfig(raw), baseLocale: 'en', locales, definitions, usages });
}

const summary = (findings: Finding[]) =>
  findings.map((f) => `${f.id}:${f.locale ?? '-'}:${f.key ?? '-'}`);

describe('patternToRegExp', () => {
  it('matches one or more characters per wildcard and escapes everything else', () => {
    const re = patternToRegExp('status.*');
    expect(re.test('status.paid')).toBe(true);
    expect(re.test('status.a.b')).toBe(true);
    expect(re.test('status.')).toBe(false);
    expect(re.test('statusxpaid')).toBe(false);
    expect(patternToRegExp('a.*.c').test('a.b.c')).toBe(true);
    expect(patternToRegExp('a+b(*)').test('a+b(x)')).toBe(true);
    expect(patternToRegExp('multi\nline*').test('multi\nline!')).toBe(true);
  });
});

describe('missing', () => {
  it('reports static usages missing from a locale, once per key with a count', () => {
    const findings = run(
      [def('en', 'a', 'A'), def('fr', 'b', 'B'), def('en', 'b', 'B')],
      [use('a'), use('a', { line: 9 }), use('b')],
    );
    expect(findings).toEqual([
      {
        id: 'missing',
        severity: 'error',
        locale: 'fr',
        key: 'a',
        file: 'src/a.ts',
        line: 3,
        message: 'used 2 times but not defined in "fr"',
      },
    ]);
  });

  it('reports keys that no locale defines once per locale', () => {
    expect(summary(run([def('en', 'x', 'X'), def('fr', 'x', 'X')], [use('nope')]))).toEqual([
      'missing:en:nope',
      'missing:fr:nope',
      'unused:en:x',
    ]);
  });

  it('resolves the default namespace and plural suffixes', () => {
    const defs = [
      def('en', 'translation:greeting', 'Hi'),
      def('fr', 'translation:greeting', 'Salut'),
      def('en', 'item_one', '1'),
      def('en', 'item_other', 'n'),
      def('fr', 'item_one', '1'),
      def('fr', 'item_many', 'n'),
    ];
    expect(run(defs, [use('greeting'), use('item')])).toEqual([]);
  });

  it('does not apply plural or default-namespace lookups when disabled by the key shape', () => {
    const defs = [def('en', 'ns:greeting', 'Hi'), def('fr', 'ns:greeting', 'Salut')];
    expect(summary(run(defs, [use('greeting')], { defaultNamespace: '' }))).toEqual([
      'missing:en:greeting',
      'missing:fr:greeting',
      'unused:en:ns:greeting',
    ]);
  });

  it('reports base keys used through a dynamic pattern that another locale lacks', () => {
    const defs = [
      def('en', 'status.paid', 'P'),
      def('en', 'status.void', 'V'),
      def('fr', 'status.paid', 'P'),
    ];
    const findings = run(defs, [use('status.*', { dynamic: true, pattern: 'status.*' })]);
    expect(summary(findings)).toEqual(['missing:fr:status.void', 'dynamic-key:-:status.*']);
    expect(findings[0]?.message).toContain('dynamic key pattern');
    // config patterns behave the same way
    expect(summary(run(defs, [], { dynamicKeyPatterns: ['status.*'] }))).toEqual([
      'missing:fr:status.void',
    ]);
  });
});

describe('unused', () => {
  it('reports base keys that nothing uses, but not keys covered by patterns', () => {
    const defs = [
      def('en', 'used', 'U'),
      def('en', 'old', 'O'),
      def('en', 'dyn.a', 'A'),
      def('en', 'cfg.a.b', 'C'),
      def('fr', 'used', 'U'),
      def('fr', 'old', 'O'),
      def('fr', 'dyn.a', 'A'),
      def('fr', 'cfg.a.b', 'C'),
    ];
    const usages = [use('used'), use('dyn.*', { dynamic: true, pattern: 'dyn.*' })];
    expect(summary(run(defs, usages, { dynamicKeyPatterns: ['cfg.*'] }))).toEqual([
      'unused:en:old',
      'dynamic-key:-:dyn.*',
    ]);
  });

  it('applies namespace-less dynamic patterns to the default namespace and wildcard-first patterns anywhere', () => {
    const defs = [
      def('en', 'translation:dyn.a', 'A'),
      def('fr', 'translation:dyn.a', 'A'),
      def('en', 'ns:thing.title', 'T'),
      def('fr', 'ns:thing.title', 'T'),
    ];
    const usages = [
      use('dyn.*', { dynamic: true, pattern: 'dyn.*' }),
      use('*.title', { dynamic: true, pattern: '*.title' }),
    ];
    expect(summary(run(defs, usages))).toEqual(['dynamic-key:-:*.title', 'dynamic-key:-:dyn.*']);
  });

  it('keeps plural families used when any form is used', () => {
    const defs = [
      def('en', 'n_one', '1'),
      def('en', 'n_other', 'x'),
      def('fr', 'n_one', '1'),
      def('fr', 'n_other', 'x'),
    ];
    expect(run(defs, [use('n')])).toEqual([]);
    expect(summary(run(defs, []))).toEqual(['unused:en:n_one', 'unused:en:n_other']);
  });
});

describe('value checks', () => {
  it('flags untranslated values but honours the allowlist, short values and symbol-only values', () => {
    const defs = [
      def('en', 'same', 'Export CSV'),
      def('fr', 'same', 'Export CSV'),
      def('en', 'brand', 'Orbit Notes'),
      def('fr', 'brand', 'Orbit Notes'),
      def('en', 'brand.key', 'Keyed Brand'),
      def('fr', 'brand.key', 'Keyed Brand'),
      def('en', 'ok', 'OK'),
      def('fr', 'ok', 'OK'),
      def('en', 'num', '100 %'),
      def('fr', 'num', '100 %'),
      def('en', 'ph', '{{count}}'),
      def('fr', 'ph', '{{count}}'),
      def('en', 'padded', '  Save  '),
      def('fr', 'padded', '  Save  '),
    ];
    const usages = ['same', 'brand', 'brand.key', 'ok', 'num', 'ph', 'padded'].map((key) =>
      use(key),
    );
    const findings = run(defs, usages, { untranslatedAllowlist: ['Orbit Notes', 'brand.*'] });
    expect(summary(findings)).toEqual(['untranslated:fr:padded', 'untranslated:fr:same']);
  });

  it('flags empty values in non-base locales only', () => {
    const defs = [def('en', 'a', ''), def('fr', 'a', ''), def('en', 'b', 'B'), def('fr', 'b', '')];
    expect(summary(run(defs, [use('a'), use('b')]))).toEqual(['empty:fr:a', 'empty:fr:b']);
  });

  it('flags extra keys, accepting plural forms that exist in the base locale family', () => {
    const defs = [
      def('en', 'n_one', '1'),
      def('en', 'n_other', 'x'),
      def('fr', 'n_one', '1'),
      def('fr', 'n_many', 'm'),
      def('fr', 'n_other', 'x'),
      def('fr', 'only.fr', 'F'),
    ];
    expect(summary(run(defs, [use('n')]))).toEqual(['extra:fr:only.fr']);
  });

  it('flags placeholder mismatches per syntax and ignores casing for Laravel', () => {
    const laravel = { format: 'laravel-json' } as const;
    const defs = [
      def('en', 'a', 'Hello :name', laravel),
      def('fr', 'a', 'Salut :nom', laravel),
      def('en', 'b', 'Hello :name', laravel),
      def('fr', 'b', 'Salut :Name', laravel),
      def('en', 'c', 'Hello {{name}}'),
      def('fr', 'c', 'Salut'),
      def('en', 'd', 'Hello {{name}}'),
      def('fr', 'd', 'Salut {{name}}'),
    ];
    const findings = run(
      defs,
      ['a', 'b', 'c', 'd'].map((key) => use(key)),
    );
    expect(summary(findings)).toEqual(['placeholder-mismatch:fr:a', 'placeholder-mismatch:fr:c']);
    expect(findings[0]?.message).toBe('placeholders differ: "en" has :name, "fr" has :nom');
    expect(findings[1]?.message).toBe('placeholders differ: "en" has {{name}}, "fr" has none');
  });

  it('uses the configured placeholder syntax', () => {
    const defs = [def('en', 'a', 'Hello {name}'), def('fr', 'a', 'Salut {nom}')];
    expect(run(defs, [use('a')])).toEqual([]);
    expect(summary(run(defs, [use('a')], { placeholderSyntax: { json: ['icu'] } }))).toEqual([
      'placeholder-mismatch:fr:a',
    ]);
  });

  it('reports unknown values and skips value comparisons for them', () => {
    const defs = [
      def('en', 'a', null),
      def('fr', 'a', 'Valeur'),
      def('en', 'b', 'B'),
      def('fr', 'b', null),
    ];
    expect(summary(run(defs, [use('a'), use('b')]))).toEqual([
      'unknown-value:en:a',
      'unknown-value:fr:b',
    ]);
  });
});

describe('dynamic keys and configuration', () => {
  it('reports dynamic usages as notes with their location', () => {
    const findings = run(
      [def('en', 'a', 'A'), def('fr', 'a', 'A')],
      [
        use('', { dynamic: true, line: 8 }),
        use('p.*', { dynamic: true, pattern: 'p.*', line: 9 }),
        use('a'),
      ],
    );
    expect(findings.map((f) => [f.id, f.severity, f.key, f.line, f.message])).toEqual([
      ['dynamic-key', 'note', null, 8, 'key is computed at runtime and cannot be checked'],
      ['dynamic-key', 'note', 'p.*', 9, 'key is computed at runtime; assuming it matches "p.*"'],
    ]);
  });

  it('applies severity overrides and switches checks off', () => {
    const defs = [def('en', 'old', 'O'), def('fr', 'old', 'O'), def('fr', 'extra', 'E')];
    const findings = run(defs, [use('gone')], {
      severity: { unused: 'error', extra: 'off', missing: 'warning' },
    });
    expect(findings.map((f) => `${f.severity}:${f.id}`)).toEqual([
      'error:unused',
      'warning:missing',
      'warning:missing',
    ]);
  });

  it('ignores definitions of locales that are not being checked', () => {
    expect(run([def('en', 'a', 'A'), def('de', 'zzz', 'Z')], [use('a')], {}, ['en'])).toEqual([]);
  });

  it('lets a PHP definition win over a JSON definition with the same key', () => {
    const defs = [
      def('en', 'auth.failed', 'PHP value', { format: 'laravel-php', file: 'lang/en/auth.php' }),
      def('en', 'auth.failed', 'JSON value', { format: 'laravel-json', file: 'lang/en.json' }),
      def('fr', 'auth.failed', 'Valeur PHP', { format: 'laravel-php', file: 'lang/fr/auth.php' }),
      def('fr', 'auth.failed', 'Valeur JSON', { format: 'laravel-json', file: 'lang/fr.json' }),
    ];
    expect(run(defs, [use('auth.failed')])).toEqual([]);
  });
});

describe('sortFindings', () => {
  it('orders by severity, locale, file, line, key and id', () => {
    const base = { message: '', file: null, line: null, key: null, locale: null } as const;
    const findings: Finding[] = [
      { ...base, id: 'dynamic-key', severity: 'note' },
      { ...base, id: 'unused', severity: 'warning', locale: 'fr', key: 'b' },
      { ...base, id: 'unused', severity: 'warning', locale: 'fr', key: 'a' },
      { ...base, id: 'unused', severity: 'warning', locale: 'en', file: 'z', line: 1 },
      { ...base, id: 'unused', severity: 'warning', locale: 'en', file: 'a', line: 9 },
      { ...base, id: 'unused', severity: 'warning', locale: 'en', file: 'a', line: 2 },
      { ...base, id: 'missing', severity: 'error' },
      { ...base, id: 'unused', severity: 'warning', locale: 'fr', key: 'a' },
      { ...base, id: 'extra', severity: 'warning', locale: 'fr', key: 'a' },
    ];
    const order = sortFindings(findings).map((f) =>
      [f.severity, f.locale, f.file, f.line, f.key, f.id].join('|'),
    );
    expect(order).toEqual([
      'error|||||missing',
      'warning|en|a|2||unused',
      'warning|en|a|9||unused',
      'warning|en|z|1||unused',
      'warning|fr|||a|extra',
      'warning|fr|||a|unused',
      'warning|fr|||a|unused',
      'warning|fr|||b|unused',
      'note|||||dynamic-key',
    ]);
  });
});
