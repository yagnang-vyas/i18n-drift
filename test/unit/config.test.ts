import { describe, expect, it } from 'vitest';
import { loadConfig, validateConfig } from '../../src/config.js';
import { ConfigError, UserError } from '../../src/errors.js';
import { makeConfig, tempProject } from '../helpers/index.js';

const message = (raw: unknown): string => {
  try {
    makeConfig(raw as Record<string, unknown>);
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigError);
    return (error as Error).message;
  }
  throw new Error('expected validation to fail');
};

describe('validateConfig', () => {
  it('applies defaults', () => {
    const config = makeConfig();
    expect(config).toMatchObject({
      root: '/project',
      baseLocale: null,
      locales: null,
      functions: ['t', '$t', 'i18n.t', 'i18next.t'],
      namespaceSeparator: ':',
      defaultNamespace: 'translation',
      dynamicKeyPatterns: [],
      untranslatedAllowlist: [],
      sources: ['src/**/*.ts'],
    });
    expect(config.severity.missing).toBe('error');
    expect(config.severity['dynamic-key']).toBe('note');
    expect(config.placeholderSyntax).toEqual({
      json: ['i18next'],
      'laravel-php': ['laravel'],
      'laravel-json': ['laravel'],
    });
  });

  it('accepts a full configuration', () => {
    const config = makeConfig({
      baseLocale: 'fr',
      locales: ['fr', 'en'],
      sources: ['a/**/*.ts'],
      exclude: ['a/skip/**'],
      localeFiles: [
        { format: 'laravel-php', path: 'lang/{locale}/{namespace}.php' },
        { format: 'json', path: 'i18n/{locale}.json' },
      ],
      functions: ['translate'],
      namespaceSeparator: '|',
      defaultNamespace: '',
      dynamicKeyPatterns: ['x.*'],
      untranslatedAllowlist: ['Brand'],
      severity: { unused: 'off', missing: 'warning' },
      placeholderSyntax: { json: ['icu', 'i18next'], 'laravel-json': 'icu' },
    });
    expect(config).toMatchObject({
      baseLocale: 'fr',
      locales: ['fr', 'en'],
      exclude: ['a/skip/**'],
      defaultNamespace: '',
      namespaceSeparator: '|',
    });
    expect(config.severity.unused).toBe('off');
    expect(config.placeholderSyntax.json).toEqual(['icu', 'i18next']);
    expect(config.placeholderSyntax['laravel-json']).toEqual(['icu']);
  });

  it.each([
    [[], '$: expected a JSON object'],
    [null, '$: expected a JSON object'],
    [{ colour: 1 }, '$.colour: unknown configuration key'],
    [{ baseLocale: '' }, '$.baseLocale: expected a non-empty string'],
    [{ baseLocale: 3 }, '$.baseLocale: expected a non-empty string'],
    [{ defaultNamespace: 3 }, '$.defaultNamespace: expected a string'],
    [{ locales: 'en' }, '$.locales: expected an array of strings'],
    [{ locales: ['en', ''] }, '$.locales[1]: expected a non-empty string'],
    [{ sources: [] }, '$.sources: expected at least one source glob'],
    [{ functions: [1] }, '$.functions[0]: expected a non-empty string'],
    [{ localeFiles: [] }, '$.localeFiles: expected a non-empty array'],
    [{ localeFiles: 'x' }, '$.localeFiles: expected a non-empty array'],
    [{ localeFiles: ['x'] }, '$.localeFiles[0]: expected an object'],
    [
      { localeFiles: [{ format: 'json', path: 'a/{locale}.json', extra: 1 }] },
      '$.localeFiles[0].extra: unknown configuration key',
    ],
    [
      { localeFiles: [{ format: 'yaml', path: 'a/{locale}.yml' }] },
      '$.localeFiles[0].format: expected one of "json", "laravel-php", "laravel-json"',
    ],
    [{ localeFiles: [{ format: 'json' }] }, '$.localeFiles[0].path: expected a non-empty string'],
    [
      { localeFiles: [{ format: 'json', path: 'a.json' }] },
      '$.localeFiles[0].path: the path must contain {locale}',
    ],
    [
      { localeFiles: [{ format: 'laravel-php', path: 'lang/{locale}/auth.php' }] },
      '$.localeFiles[0].path: laravel-php paths must contain {namespace}',
    ],
    [{ severity: [] }, '$.severity: expected an object'],
    [{ severity: { nope: 'error' } }, '$.severity.nope: unknown check id'],
    [
      { severity: { missing: 'fatal' } },
      '$.severity.missing: expected "error", "warning", "note" or "off"',
    ],
    [{ placeholderSyntax: [] }, '$.placeholderSyntax: expected an object'],
    [{ placeholderSyntax: { yaml: 'icu' } }, '$.placeholderSyntax.yaml: unknown format'],
    [
      { placeholderSyntax: { json: [] } },
      '$.placeholderSyntax.json: expected a syntax or a non-empty array',
    ],
    [
      { placeholderSyntax: { json: 'mustache' } },
      '$.placeholderSyntax.json: expected one of "laravel", "icu", "i18next"',
    ],
    [{ placeholderSyntax: { json: ['icu', 5] } }, '$.placeholderSyntax.json[1]: expected one of'],
  ])('rejects %j', (raw, expected) => {
    expect(message(raw)).toContain(expected);
  });

  it('requires locale files when nothing was detected', () => {
    expect(() => validateConfig({}, '/p', null)).toThrow(UserError);
    expect(() => validateConfig({}, '/p', null)).toThrow(/no locale files found/);
  });
});

describe('loadConfig', () => {
  it('detects the layout when there is no config file', async () => {
    const dir = tempProject({
      artisan: '',
      'lang/en/auth.php': "<?php return ['a' => 'A'];",
    });
    const loaded = await loadConfig({ cwd: dir });
    expect(loaded.origin).toBe('detected');
    expect(loaded.config.localeFiles).toEqual([
      { format: 'laravel-php', path: 'lang/{locale}/{namespace}.php' },
    ]);
    expect(loaded.config.root).toBe(dir);
  });

  it('reads i18n-drift.config.json from the working directory and fills gaps from detection', async () => {
    const dir = tempProject({
      artisan: '',
      'lang/en.json': '{}',
      'i18n-drift.config.json': '{ "baseLocale": "en", "dynamicKeyPatterns": ["a.*"] }',
    });
    const loaded = await loadConfig({ cwd: dir });
    expect(loaded.origin).toBe('file');
    expect(loaded.config.baseLocale).toBe('en');
    expect(loaded.config.dynamicKeyPatterns).toEqual(['a.*']);
    expect(loaded.config.localeFiles[0]?.format).toBe('laravel-json');
    expect(loaded.configPath).toBe(`${dir}/i18n-drift.config.json`);
  });

  it('resolves an explicit config path and uses its directory as the project root', async () => {
    const dir = tempProject({
      'nested/custom.json': JSON.stringify({
        localeFiles: [{ format: 'json', path: 'l/{locale}.json' }],
        sources: ['s/**/*.ts'],
      }),
    });
    const loaded = await loadConfig({ cwd: dir, configPath: 'nested/custom.json' });
    expect(loaded.config.root).toBe(`${dir}/nested`);
    expect(loaded.config.sources).toEqual(['s/**/*.ts']);
  });

  it('fails clearly for a missing explicit config, invalid JSON and undetectable projects', async () => {
    const dir = tempProject({ 'bad.json': '{\n  "baseLocale": ,\n}', 'empty/.keep': '' });
    await expect(loadConfig({ cwd: dir, configPath: 'nope.json' })).rejects.toThrow(
      'config file not found: nope.json',
    );
    await expect(loadConfig({ cwd: dir, configPath: 'bad.json' })).rejects.toThrow(
      /^bad\.json:2:17: invalid JSON/,
    );
    await expect(loadConfig({ cwd: `${dir}/empty` })).rejects.toThrow(
      /could not detect a Laravel or i18next layout/,
    );
  });

  it('reports unreadable config paths (a directory) without a stack trace', async () => {
    const dir = tempProject({ 'dir/.keep': '' });
    await expect(loadConfig({ cwd: dir, configPath: 'dir' })).rejects.toThrow(/cannot read/);
  });

  it('reports a config file that is not valid JSON in any recoverable way', async () => {
    const dir = tempProject({ 'i18n-drift.config.json': '﻿[1, 2' });
    await expect(loadConfig({ cwd: dir })).rejects.toThrow(
      /i18n-drift\.config\.json:1:\d+: invalid JSON/,
    );
  });
});
