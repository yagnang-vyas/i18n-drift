import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { UserError } from '../../src/errors.js';
import { loadLaravelPhpLocale } from '../../src/locales/laravel-php.js';
import { decodePhpEscape } from '../../src/php-strings.js';

const options = { locale: 'en', file: 'lang/en/auth.php', group: 'auth', specIndex: 0 };
const load = (source: string) => loadLaravelPhpLocale(source, options);
const here = dirname(fileURLToPath(import.meta.url));

describe('loadLaravelPhpLocale', () => {
  it('reads nested arrays, both quote styles and line numbers', async () => {
    const { definitions, diagnostics } = await load(`<?php

return [
    'failed' => 'These credentials do not match.',
    "throttle" => "Too many attempts.",
    'nested' => [
        'deep' => ['leaf' => 'Leaf'],
        'other' => 'Other',
    ],
];
`);
    expect(diagnostics).toEqual([]);
    expect(definitions.map((d) => [d.key, d.value, d.line])).toEqual([
      ['auth.failed', 'These credentials do not match.', 4],
      ['auth.throttle', 'Too many attempts.', 5],
      ['auth.nested.deep.leaf', 'Leaf', 7],
      ['auth.nested.other', 'Other', 8],
    ]);
    expect(definitions[0]).toMatchObject({
      locale: 'en',
      file: 'lang/en/auth.php',
      format: 'laravel-php',
      namespace: 'auth',
    });
  });

  it('evaluates string concatenation of literals and decodes escapes', async () => {
    const { definitions } = await load(`<?php return [
  'concat' => 'Read ' . "our " . 'terms',
  'single' => 'It\\'s a back\\\\slash \\n stays',
  'double' => "Tab\\there \\"quoted\\" \\$5 \\x41 \\101 \\u{0939}",
  'paren' => ('wrapped'),
  'num' => 42,
  'hindi' => 'नमस्ते :name',
];`);
    expect(Object.fromEntries(definitions.map((d) => [d.key, d.value]))).toEqual({
      'auth.concat': 'Read our terms',
      'auth.single': "It's a back\\slash \\n stays",
      'auth.double': 'Tab\there "quoted" $5 A A ह',
      'auth.paren': 'wrapped',
      'auth.num': '42',
      'auth.hindi': 'नमस्ते :name',
    });
  });

  it('records non-literal values as unknown without evaluating them', async () => {
    const { definitions } = await load(`<?php return [
  'call' => config('app.name'),
  'const' => Foo::BAR,
  'var' => $name,
  'interp' => "Hello $name",
  'mixed' => 'Hi ' . strtoupper('x'),
  'heredoc' => <<<EOT
  text
  EOT,
  'bool' => true,
  'ok' => 'fine',
];`);
    expect(definitions.map((d) => [d.key, d.value])).toEqual([
      ['auth.call', null],
      ['auth.const', null],
      ['auth.var', null],
      ['auth.interp', null],
      ['auth.mixed', null],
      ['auth.heredoc', null],
      ['auth.bool', null],
      ['auth.ok', 'fine'],
    ]);
  });

  it('numbers list entries and honours explicit integer keys', async () => {
    const { definitions } = await load(
      `<?php return ['a', 'b', 5 => 'c', 'd', 'k' => ['x', 'y']];`,
    );
    expect(definitions.map((d) => d.key)).toEqual([
      'auth.0',
      'auth.1',
      'auth.5',
      'auth.6',
      'auth.k.0',
      'auth.k.1',
    ]);
  });

  it('supports array() syntax, declare, use and comments', async () => {
    const { definitions } = await load(`<?php
declare(strict_types=1);
use Illuminate\\Support\\Str;
/* block */
// line
return array(
    // inline
    'a' => 'A', # hash
);`);
    expect(definitions.map((d) => d.key)).toEqual(['auth.a']);
  });

  it('skips entries whose keys or shape cannot be read and reports them', async () => {
    const { definitions, diagnostics } = await load(`<?php return [
  Foo::KEY => 'dynamic key',
  ...$spread,
  'kept' => 'yes',
];`);
    expect(definitions.map((d) => d.key)).toEqual(['auth.kept']);
    expect(diagnostics.map((d) => [d.id, d.line, d.message])).toEqual([
      ['unknown-value', 2, 'entry skipped: array key is not a string or integer literal'],
      ['unknown-value', 3, 'entry skipped: spread entries are not supported'],
    ]);
  });

  it('rejects files without a returned array and files with syntax errors', async () => {
    await expect(load('<?php $x = [];')).rejects.toThrow(
      'lang/en/auth.php: expected a top-level "return [ ... ];" statement returning an array',
    );
    await expect(load('<?php return config("x");')).rejects.toThrow(UserError);
    await expect(load("<?php\nreturn [\n  'a' => ,\n];")).rejects.toThrow(
      /^lang\/en\/auth\.php:\d+: PHP syntax error/,
    );
  });

  it('returns no definitions for an empty array', async () => {
    expect((await load('<?php return [];')).definitions).toEqual([]);
  });

  it('never executes code in the language file', async () => {
    const dir = join(here, '..', 'fixtures', 'safety');
    const evil = readFileSync(join(dir, 'lang/en/evil.php'), 'utf8');
    const before = new Set([...readdirSync(dir), ...readdirSync(process.cwd())]);

    const { definitions } = await loadLaravelPhpLocale(evil, {
      ...options,
      file: 'evil.php',
      group: 'evil',
    });

    expect(definitions.map((d) => [d.key, d.value])).toEqual([
      ['evil.ok', 'This literal is still read.'],
      ['evil.computed', null],
    ]);
    for (const name of ['pwned.txt', 'pwned-by-system.txt']) {
      expect(existsSync(join(dir, name))).toBe(false);
      expect(existsSync(join(process.cwd(), name))).toBe(false);
    }
    const after = new Set([...readdirSync(dir), ...readdirSync(process.cwd())]);
    expect(after).toEqual(before);
  });
});

describe('decodePhpEscape', () => {
  it('keeps unknown escapes and out-of-range code points untouched', () => {
    expect(decodePhpEscape('\\q', '"')).toBe('\\q');
    expect(decodePhpEscape('\\u{FFFFFFF}', '"')).toBe('\\u{FFFFFFF}');
    expect(decodePhpEscape('\\n', "'")).toBe('\\n');
  });
});
