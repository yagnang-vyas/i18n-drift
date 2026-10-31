import { describe, expect, it } from 'vitest';
import { UserError } from '../../src/errors.js';
import { loadJsonLocale } from '../../src/locales/json.js';
import { loadLaravelJsonLocale } from '../../src/locales/laravel-json.js';

const base = {
  locale: 'en',
  file: 'locales/en/common.json',
  format: 'json',
  specIndex: 0,
} as const;

describe('loadJsonLocale', () => {
  it('flattens nested objects with dots and records line numbers', () => {
    const text = `{
  "title": "Hello",
  "nav": {
    "home": "Home",
    "deep": { "leaf": "Leaf" }
  }
}
`;
    const defs = loadJsonLocale(text, { ...base, namespaceSeparator: ':' });
    expect(defs.map((d) => [d.key, d.value, d.line])).toEqual([
      ['title', 'Hello', 2],
      ['nav.home', 'Home', 4],
      ['nav.deep.leaf', 'Leaf', 5],
    ]);
    expect(defs[2]).toMatchObject({
      jsonPath: ['nav', 'deep', 'leaf'],
      format: 'json',
      locale: 'en',
    });
    expect(defs[0]?.namespace).toBeUndefined();
  });

  it('prefixes keys with the namespace and separator', () => {
    const defs = loadJsonLocale('{"save":"Save"}', {
      ...base,
      namespace: 'common',
      namespaceSeparator: ':',
    });
    expect(defs[0]).toMatchObject({ key: 'common:save', namespace: 'common' });
    const custom = loadJsonLocale('{"save":"Save"}', {
      ...base,
      namespace: 'common',
      namespaceSeparator: '|',
    });
    expect(custom[0]?.key).toBe('common|save');
  });

  it('keeps flat keys that contain dots and spaces in the Laravel JSON loader', () => {
    const defs = loadLaravelJsonLocale('{"Welcome back, :name.": "x", "plain": "y"}', {
      locale: 'en',
      file: 'lang/en.json',
      specIndex: 1,
    });
    expect(defs.map((d) => d.key)).toEqual(['Welcome back, :name.', 'plain']);
    expect(defs[0]?.format).toBe('laravel-json');
  });

  it('reports invalid JSON with file, line and column', () => {
    expect(() =>
      loadJsonLocale('{\n  "a": 1,\n  "b": \n', { ...base, namespaceSeparator: ':' }),
    ).toThrow(/^locales\/en\/common\.json:4:1: invalid JSON/);
    try {
      loadJsonLocale('{"a": }', { ...base, namespaceSeparator: ':' });
    } catch (error) {
      expect(error).toBeInstanceOf(UserError);
    }
  });

  it('rejects documents that are not objects', () => {
    expect(() => loadJsonLocale('["a"]', { ...base, namespaceSeparator: ':' })).toThrow(
      'locales/en/common.json:1: expected a JSON object at the top level',
    );
  });

  it('records null values as unknown and stringifies numbers', () => {
    const defs = loadJsonLocale('{"a": null, "b": 5}', { ...base, namespaceSeparator: ':' });
    expect(defs.map((d) => d.value)).toEqual([null, '5']);
  });

  it('rethrows unexpected errors untouched', () => {
    // A non-string text value makes the parser throw a TypeError, which must not be wrapped.
    expect(() =>
      loadJsonLocale(undefined as unknown as string, { ...base, namespaceSeparator: ':' }),
    ).toThrow(TypeError);
  });
});
