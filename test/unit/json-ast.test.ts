import { describe, expect, it } from 'vitest';
import { JsonSyntaxError, parseJsonAst } from '../../src/locales/json-ast.js';
import { flattenJson } from '../../src/locales/flatten.js';

describe('parseJsonAst', () => {
  it('parses every JSON value type with offsets and lines', () => {
    const text = '{\n  "a": "x",\n  "b": [1, true, null],\n  "c": { "d": -1.5e3 }\n}\n';
    const root = parseJsonAst(text);
    expect(root.type).toBe('object');
    if (root.type !== 'object') return;
    expect(root.start).toBe(0);
    expect(root.end).toBe(text.length - 1);
    expect(root.entries.map((e) => [e.key, e.line])).toEqual([
      ['a', 2],
      ['b', 3],
      ['c', 4],
    ]);
    const array = root.entries[1]?.value;
    expect(array?.type).toBe('array');
  });

  it('decodes string escapes', () => {
    const root = parseJsonAst('{"k": "a\\n\\t\\"\\\\\\/\\b\\f\\r\\u00e9\\u0939"}');
    expect(root.type === 'object' && root.entries[0]?.value).toMatchObject({
      type: 'string',
      value: 'a\n\t"\\/\b\f\réह',
    });
  });

  it('accepts an empty object, empty array and a leading BOM', () => {
    expect(parseJsonAst('﻿{}')).toMatchObject({ type: 'object', entries: [] });
    expect(parseJsonAst('[ ]')).toMatchObject({ type: 'array', items: [] });
  });

  it.each([
    ['', 'unexpected end of file', 1, 1],
    ['{"a": }', 'unexpected character "}"', 1, 7],
    ['{"a" 1}', 'expected ":"', 1, 6],
    ['{\n  "a": 1,\n  b: 2\n}', 'expected a string key', 3, 3],
    ['{"a": 1,}', 'expected a string key', 1, 9],
    ['{"a": 1 "b": 2}', 'expected "," or "}"', 1, 9],
    ['[1 2]', 'expected "," or "]"', 1, 4],
    ['[1,', 'unexpected end of file', 1, 4],
    ['{"a": "x', 'unterminated string', 1, 9],
    ['{"a": "x\ny"}', 'line break inside a string', 1, 9],
    ['{"a": "\\q"}', 'invalid escape sequence', 1, 8],
    ['{"a": "\\u12"}', 'invalid \\u escape', 1, 8],
    ['{"a": 1} x', 'unexpected character "x" after', 1, 10],
    ['{"a":', 'unexpected end of file', 1, 6],
    ['{', 'expected a string key but found end of file', 1, 2],
    ['{"a": tru}', 'unexpected character "t"', 1, 7],
    ['{"a"', 'expected ":"', 1, 5],
  ])('reports syntax error for %j', (text, message, line, column) => {
    try {
      parseJsonAst(text);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(JsonSyntaxError);
      const syntax = error as JsonSyntaxError;
      expect(syntax.message).toContain(message);
      expect([syntax.line, syntax.column]).toEqual([line, column]);
    }
  });
});

describe('flattenJson', () => {
  it('flattens nested objects, arrays, numbers, booleans and null', () => {
    const root = parseJsonAst('{"a":{"b":"x"},"list":["p","q"],"n":3,"t":true,"z":null}');
    expect(flattenJson(root)).toEqual([
      { path: ['a', 'b'], value: 'x', line: 1 },
      { path: ['list', '0'], value: 'p', line: 1 },
      { path: ['list', '1'], value: 'q', line: 1 },
      { path: ['n'], value: '3', line: 1 },
      { path: ['t'], value: 'true', line: 1 },
      { path: ['z'], value: null, line: 1 },
    ]);
  });
});
