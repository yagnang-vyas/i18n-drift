import { describe, expect, it } from 'vitest';
import { UserError } from '../../src/errors.js';
import { insertJsonKey } from '../../src/fix.js';

const insert = (text: string, path: string[], value = 'V') =>
  insertJsonKey(text, path, value, 'x.json');

describe('insertJsonKey', () => {
  it('appends to the end of the object, keeping 2-space indentation and the trailing newline', () => {
    const before = '{\n  "b": "B",\n  "a": "A"\n}\n';
    expect(insert(before, ['c'])).toBe('{\n  "b": "B",\n  "a": "A",\n  "c": "V"\n}\n');
  });

  it('detects 4-space and tab indentation', () => {
    expect(insert('{\n    "a": "A"\n}\n', ['b'])).toBe('{\n    "a": "A",\n    "b": "V"\n}\n');
    expect(insert('{\n\t"a": "A"\n}\n', ['b'])).toBe('{\n\t"a": "A",\n\t"b": "V"\n}\n');
  });

  it('keeps a missing trailing newline missing and preserves CRLF line endings', () => {
    expect(insert('{\n  "a": "A"\n}', ['b'])).toBe('{\n  "a": "A",\n  "b": "V"\n}');
    expect(insert('{\r\n  "a": "A"\r\n}\r\n', ['b'])).toBe(
      '{\r\n  "a": "A",\r\n  "b": "V"\r\n}\r\n',
    );
  });

  it('inserts into nested objects at the right depth', () => {
    const before = '{\n  "nav": {\n    "home": "Home"\n  },\n  "x": "X"\n}\n';
    expect(insert(before, ['nav', 'settings'])).toBe(
      '{\n  "nav": {\n    "home": "Home",\n    "settings": "V"\n  },\n  "x": "X"\n}\n',
    );
  });

  it('creates missing intermediate objects', () => {
    expect(insert('{\n  "a": "A"\n}\n', ['nav', 'deep', 'leaf'])).toBe(
      '{\n  "a": "A",\n  "nav": {\n    "deep": {\n      "leaf": "V"\n    }\n  }\n}\n',
    );
    expect(insert('{\n  "nav": {\n    "home": "H"\n  }\n}\n', ['nav', 'sub', 'leaf'])).toBe(
      '{\n  "nav": {\n    "home": "H",\n    "sub": {\n      "leaf": "V"\n    }\n  }\n}\n',
    );
  });

  it('fills empty objects, with and without whitespace inside', () => {
    expect(insert('{}\n', ['a'])).toBe('{\n  "a": "V"\n}\n');
    expect(insert('{\n}\n', ['a'])).toBe('{\n  "a": "V"\n}\n');
    expect(insert('{\n  "nav": {}\n}\n', ['nav', 'a'])).toBe(
      '{\n  "nav": {\n    "a": "V"\n  }\n}\n',
    );
  });

  it('is idempotent: an existing key is left alone', () => {
    const once = insert('{\n  "a": "A"\n}\n', ['b']);
    expect(insert(once, ['b'], 'OTHER')).toBe(once);
    expect(insert('{"a":"A"}', ['a'])).toBe('{"a":"A"}');
  });

  it('writes values with special characters as valid JSON', () => {
    const result = insert('{}\n', ['k'], '[TODO] "quoted" \\ back\nline नमस्ते');
    expect(JSON.parse(result)).toEqual({ k: '[TODO] "quoted" \\ back\nline नमस्ते' });
    expect(result).toContain('नमस्ते');
  });

  it('does not touch other formatting such as inline objects and unusual spacing', () => {
    const before = '{ "a": 1,\n  "list": [1, 2],\n  "n":   {"x":"y"} }\n';
    const after = insert(before, ['z']);
    expect(after.startsWith('{ "a": 1,\n  "list": [1, 2],\n  "n":   {"x":"y"}')).toBe(true);
    expect(JSON.parse(after)).toEqual({ a: 1, list: [1, 2], n: { x: 'y' }, z: 'V' });
  });

  it('preserves integer-like keys in their original order', () => {
    const after = insert('{\n  "b": "B",\n  "2": "two",\n  "1": "one"\n}\n', ['c']);
    expect(after.indexOf('"b"')).toBeLessThan(after.indexOf('"2"'));
    expect(after.indexOf('"2"')).toBeLessThan(after.indexOf('"1"'));
    expect(after.indexOf('"1"')).toBeLessThan(after.indexOf('"c"'));
  });

  it('reports invalid JSON, non-object roots and non-object parents', () => {
    expect(() => insert('{"a": }', ['b'])).toThrow(/^x\.json:1:7: invalid JSON/);
    expect(() => insert('[]', ['b'])).toThrow('x.json:1: expected a JSON object at the top level');
    expect(() => insert('{\n  "a": "str"\n}', ['a', 'b'])).toThrow(
      'x.json:2: cannot add "a.b" because "a" is not an object',
    );
    expect(() => insert('{}', ['a'])).not.toThrow(UserError);
  });

  it('uses the last duplicate key, like JSON.parse', () => {
    const before = '{\n  "a": {"x": "1"},\n  "a": {"y": "2"}\n}\n';
    const after = insert(before, ['a', 'z']);
    expect(after).toContain('"y": "2",');
  });
});
