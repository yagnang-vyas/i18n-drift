import { describe, expect, it } from 'vitest';
import { ConfigError } from '../../src/errors.js';
import { compilePattern, expandPattern } from '../../src/locales/pattern.js';

function escapeForRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

describe('compilePattern', () => {
  it('builds a glob and a regex for locale and namespace', () => {
    const compiled = compilePattern('lang/{locale}/{namespace}.php', '$.p');
    expect(compiled.glob).toBe('lang/*/**/*.php');
    expect(compiled.hasNamespace).toBe(true);
    expect(compiled.regex.exec('lang/en/admin/users.php')?.groups).toMatchObject({
      locale: 'en',
      namespace: 'admin/users',
    });
    expect(compiled.regex.exec('lang/en.php')).toBeNull();
  });

  it('supports single-file layouts and literal dots', () => {
    const compiled = compilePattern('lang/{locale}.json', '$.p');
    expect(compiled.glob).toBe('lang/*.json');
    expect(compiled.hasNamespace).toBe(false);
    expect(compiled.regex.exec('lang/pt-BR.json')?.groups?.['locale']).toBe('pt-BR');
    expect(compiled.regex.test('lang/enxjson')).toBe(false);
  });

  it('translates * and ** wildcards in the rest of the path', () => {
    const compiled = compilePattern('src/**/locales/{locale}/*.json', '$.p');
    expect(compiled.regex.test('src/locales/en/a.json')).toBe(true);
    expect(compiled.regex.test('src/a/b/locales/en/a.json')).toBe(true);
    expect(compiled.regex.test('src/a/locales/en/x/a.json')).toBe(false);
    expect(compilePattern('a/{locale}/**', '$.p').regex.test('a/en/x/y.json')).toBe(true);
  });

  it.each([
    ['lang/en.json', 'must contain {locale}'],
    ['lang/{lang}.json', 'only the {locale} and {namespace}'],
    ['lang/{locale}/{locale}.json', 'may each appear only once'],
    ['lang/{locale}/{namespace}/{namespace}.json', 'may each appear only once'],
  ])('rejects %s', (pattern, message) => {
    expect(() => compilePattern(pattern, '$.localeFiles[0].path')).toThrow(ConfigError);
    expect(() => compilePattern(pattern, '$.localeFiles[0].path')).toThrow(
      new RegExp(`^\\$\\.localeFiles\\[0\\]\\.path: .*${escapeForRegex(message)}`),
    );
  });
});

describe('expandPattern', () => {
  it('fills in locale and namespace', () => {
    expect(
      expandPattern('locales/{locale}/{namespace}.json', { locale: 'fr', namespace: 'common' }),
    ).toBe('locales/fr/common.json');
    expect(expandPattern('lang/{locale}.json', { locale: 'hi' })).toBe('lang/hi.json');
  });
});
