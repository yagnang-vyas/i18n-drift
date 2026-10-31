import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cli, copyFixture, fixturesDir, parseJson } from '../helpers/cli.js';
import type { JsonReport, KeysReport } from '../helpers/cli.js';
import { tempProject } from '../helpers/index.js';

const fixture = (name: string): string => join(fixturesDir, name);

/** Maps every file below `dir` to its contents, to prove nothing was written. */
function snapshot(dir: string, base = dir): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      Object.assign(out, snapshot(path, base));
    } else {
      out[path.slice(base.length)] = readFileSync(path, 'utf8');
    }
  }
  return out;
}

describe('arguments', () => {
  it('prints the version and help', async () => {
    const version = await cli(['--version']);
    expect(version.code).toBe(0);
    expect(version.stdout).toMatch(/^\d+\.\d+\.\d+\n$/);
    expect((await cli(['-v'])).code).toBe(0);
    const help = await cli(['--help']);
    expect(help.code).toBe(0);
    expect(help.stdout).toContain('Usage:');
    expect(help.stdout).toContain('i18n-drift check');
    expect((await cli(['help'])).stdout).toBe(help.stdout);
    expect((await cli(['check', '-h'])).stdout).toBe(help.stdout);
  });

  it.each([
    [[], 'missing command'],
    [['bogus'], 'unknown command "bogus"'],
    [['check', 'extra'], 'unexpected argument "extra"'],
    [['check', '--nope'], "Unknown option '--nope'"],
    [['check', '--format'], "Option '--format"],
    [['check', '--format', 'xml'], 'invalid --format "xml" for "check"'],
    [['keys', '--format', 'markdown'], 'invalid --format "markdown" for "keys"'],
    [['check', '--fail-on', 'sometimes'], 'invalid --fail-on "sometimes"'],
    [['check', '--only', 'missing,bogus'], 'invalid --only check id "bogus"'],
    [['check', '--write'], 'option --write is not valid for "check"'],
    [['fix', '--format', 'json'], 'option --format is not valid for "fix"'],
    [['init', '--locale', 'en'], 'option --locale is not valid for "init"'],
    [['keys', '--only', 'missing'], 'option --only is not valid for "keys"'],
  ])('rejects %j', async (args, message) => {
    const result = await cli(args);
    expect(result.code).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain(`i18n-drift: error: `);
    expect(result.stderr).toContain(message);
    expect(result.stderr).not.toContain('    at ');
  });
});

describe('check', () => {
  it('prints an aligned text report and exits 1 when errors exist', async () => {
    const result = await cli(['check'], { cwd: fixture('laravel-inertia-react') });
    expect(result.code).toBe(1);
    const lines = result.stdout.trimEnd().split('\n');
    expect(lines[0]).toMatch(
      /^error {4}missing {15}en {2}Create invoice {15}resources\/views\/welcome\.blade\.php:24 {8}used once/,
    );
    expect(lines.at(-1)).toBe(
      '21 findings: 11 errors, 5 warnings, 5 notes (checked 3 locales and 9 source files).',
    );
    expect(result.stdout).not.toContain('\u001b[');
    expect(result.stderr).toBe('');
  });

  it('exits 0 with a friendly message when there are no findings', async () => {
    const result = await cli(['check'], { cwd: fixture('clean') });
    expect(result).toEqual({
      code: 0,
      stdout: 'No findings (checked 2 locales and 3 source files).\n',
      stderr: '',
    });
  });

  it('honours --config relative to the working directory', async () => {
    const result = await cli(['check', '--config', 'test/fixtures/clean/i18n-drift.config.json']);
    expect(result.code).toBe(0);
  });

  it('colours severities only for a TTY without NO_COLOR', async () => {
    const cwd = fixture('blade-only');
    expect((await cli(['check'], { cwd, isTTY: true })).stdout).toContain(
      '\u001b[31merror  \u001b[0m',
    );
    expect(
      (await cli(['check'], { cwd, isTTY: true, env: { NO_COLOR: '1' } })).stdout,
    ).not.toContain('\u001b[');
    expect((await cli(['check', '--format', 'json'], { cwd, isTTY: true })).stdout).not.toContain(
      '\u001b[',
    );
  });

  it('controls the exit code with --fail-on', async () => {
    const cwd = fixture('laravel-inertia-react');
    const warningsOnly = ['check', '--only', 'unused,untranslated,extra'];
    expect((await cli([...warningsOnly], { cwd })).code).toBe(0);
    expect((await cli([...warningsOnly, '--fail-on', 'warning'], { cwd })).code).toBe(1);
    expect((await cli(['check', '--only', 'dynamic-key'], { cwd })).code).toBe(0);
    expect((await cli(['check', '--only', 'dynamic-key', '--fail-on', 'note'], { cwd })).code).toBe(
      1,
    );
    expect((await cli(['check', '--fail-on', 'never'], { cwd })).code).toBe(0);
    expect((await cli(['check', '--fail-on', 'error'], { cwd: fixture('clean') })).code).toBe(0);
    expect((await cli(['check', '--fail-on', 'note'], { cwd: fixture('clean') })).code).toBe(0);
  });

  it('filters by --only and --locale', async () => {
    const cwd = fixture('laravel-inertia-react');
    const only = parseJson<JsonReport>(
      (await cli(['check', '--only', 'empty,extra', '--format', 'json'], { cwd })).stdout,
    );
    expect(only.findings.map((f: { id: string }) => f.id)).toEqual(['empty', 'extra']);

    const hindi = parseJson<JsonReport>(
      (await cli(['check', '--locale', 'hi', '--format', 'json'], { cwd })).stdout,
    );
    const locales = new Set(hindi.findings.map((f: { locale: string | null }) => f.locale));
    expect(locales).toEqual(new Set(['hi', null]));

    const unknown = await cli(['check', '--locale', 'zz'], { cwd });
    expect(unknown.code).toBe(2);
    expect(unknown.stderr).toBe(
      'i18n-drift: error: unknown locale "zz" (checked locales: en, gu, hi)\n',
    );

    const repeated = parseJson<JsonReport>(
      (
        await cli(
          ['check', '--locale', 'hi,gu', '--locale', 'en', '--only', 'empty', '--format', 'json'],
          { cwd },
        )
      ).stdout,
    );
    expect(repeated.findings).toHaveLength(1);
  });

  it('renders the documented JSON schema', async () => {
    const result = await cli(['check', '--format', 'json'], { cwd: fixture('blade-only') });
    const report = parseJson<JsonReport>(result.stdout);
    expect(Object.keys(report)).toEqual([
      'schemaVersion',
      'tool',
      'baseLocale',
      'locales',
      'summary',
      'findings',
    ]);
    expect(report).toMatchObject({
      schemaVersion: 1,
      tool: { name: 'i18n-drift' },
      baseLocale: 'en',
      locales: ['en', 'es'],
      summary: { errors: 2, warnings: 1, notes: 0, total: 3, filesScanned: 3 },
    });
    expect(report.summary.byCheck).toMatchObject({
      missing: 1,
      unused: 1,
      'placeholder-mismatch': 1,
      extra: 0,
    });
    expect(report.findings[0]).toEqual({
      id: 'placeholder-mismatch',
      severity: 'error',
      locale: 'es',
      key: 'shop.promo.body',
      file: 'lang/es/shop.php',
      line: 9,
      message: 'placeholders differ: "en" has :percent, "es" has :porcentaje',
    });
    expect(result.code).toBe(1);
  });

  it('renders markdown grouped by check, escaping table cells', async () => {
    const dir = tempProject({
      artisan: '',
      'lang/en.json': '{ "a | b": "A", "multi\\nline": "M", "tick`key": "T" }',
      'lang/fr.json': '{}',
    });
    const result = await cli(['check', '--format', 'markdown'], { cwd: dir });
    expect(result.stdout).toContain('## i18n-drift report');
    expect(result.stdout).toContain('### unused (3)');
    expect(result.stdout).toContain('`a \\| b`');
    expect(result.stdout).toContain('`multi line`');
    expect(result.stdout).toContain('tick`key');
    expect(
      (await cli(['check', '--format', 'markdown'], { cwd: fixture('clean') })).stdout,
    ).toContain('No findings.');
  });

  it('prints the detected layout to stderr with --verbose, keeping stdout clean', async () => {
    const result = await cli(['check', '--verbose', '--format', 'json'], {
      cwd: fixture('react-i18next'),
    });
    expect(() => parseJson<JsonReport>(result.stdout)).not.toThrow();
    expect(result.stderr).toContain('i18n-drift: no config file; using the detected layout');
    expect(result.stderr).toContain('detected: i18next');
    expect(result.stderr).toContain('found i18next namespace files in public/locales/{locale}/');
    expect(result.stderr).toContain('base locale en; locales en, fr');
    expect(result.stderr).toContain('read 4 locale files and scanned 3 source files');
    const withConfig = await cli(['check', '--verbose'], { cwd: fixture('clean') });
    expect(withConfig.stderr).toContain('using config file');
  });

  it('escapes control characters in keys so each finding stays on one line', async () => {
    const dir = tempProject({
      artisan: '',
      'lang/en.json': '{ "two\\nlines": "x" }',
    });
    const result = await cli(['check'], { cwd: dir });
    expect(result.stdout).toContain('two\\nlines');
    expect(result.stdout.trimEnd().split('\n')).toHaveLength(3);
  });
});

describe('errors', () => {
  it('reports invalid locale JSON with file, line and column and exits 2', async () => {
    const dir = tempProject({ artisan: '', 'lang/en.json': '{\n  "a": 1,\n  "b": \n}' });
    const result = await cli(['check'], { cwd: dir });
    expect(result.code).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe(
      'i18n-drift: error: lang/en.json:4:1: invalid JSON: unexpected character "}"\n',
    );
  });

  it('reports PHP language file problems', async () => {
    const dir = tempProject({ artisan: '', 'lang/en/auth.php': '<?php return [ "a" => ];' });
    const result = await cli(['check'], { cwd: dir });
    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(
      /^i18n-drift: error: lang\/en\/auth\.php:1: PHP syntax error in language file\n$/,
    );
  });

  it('reports configuration errors with the JSON path', async () => {
    const dir = tempProject({
      artisan: '',
      'lang/en.json': '{}',
      'i18n-drift.config.json': '{ "severity": { "missing": "fatal" } }',
    });
    const result = await cli(['check'], { cwd: dir });
    expect(result.code).toBe(2);
    expect(result.stderr).toBe(
      'i18n-drift: error: $.severity.missing: expected "error", "warning", "note" or "off"\n',
    );
  });

  it('reports a missing config file, an undetectable project and a missing base locale', async () => {
    const dir = tempProject({ 'src/a.ts': '' });
    expect((await cli(['check', '--config', 'nope.json'], { cwd: dir })).stderr).toBe(
      'i18n-drift: error: config file not found: nope.json\n',
    );
    expect((await cli(['check'], { cwd: dir })).stderr).toContain(
      'could not detect a Laravel or i18next layout',
    );
    const project = tempProject({
      artisan: '',
      'lang/fr.json': '{}',
      'i18n-drift.config.json': '{"baseLocale":"de"}',
    });
    expect((await cli(['check'], { cwd: project })).stderr).toBe(
      'i18n-drift: error: base locale "de" has no locale files (found locales: fr)\n',
    );
  });

  it('turns unexpected failures into a short message and exit code 2', async () => {
    const { main } = await import('../../src/app.js');
    let stderr = '';
    const code = await main(['check'], {
      stdout: {
        write: () => {
          throw new Error('boom');
        },
      },
      stderr: { write: (text) => (stderr += text) },
      cwd: fixture('clean'),
      env: {},
      isTTY: false,
    });
    expect(code).toBe(2);
    expect(stderr).toContain('i18n-drift: error: unexpected failure: boom');
    expect(stderr).toContain('please report it');
  });
});

describe('keys', () => {
  it('lists usages as text and JSON', async () => {
    const cwd = fixture('react-i18next');
    const text = await cli(['keys'], { cwd });
    expect(text.code).toBe(0);
    expect(text.stdout).toContain('common:save');
    expect(text.stdout).toMatch(/dashboard:stats\.\*\s+dynamic\s+src\/Dashboard\.tsx:15:/);

    const json = parseJson<KeysReport>((await cli(['keys', '--format', 'json'], { cwd })).stdout);
    expect(json.schemaVersion).toBe(1);
    expect(json.usages).toContainEqual({
      key: 'common:save',
      dynamic: false,
      pattern: null,
      file: 'src/App.tsx',
      line: 10,
      column: 18,
    });
    const dynamic = parseJson<KeysReport>(
      (await cli(['keys', '--format', 'json'], { cwd: fixture('laravel-inertia-react') })).stdout,
    );
    expect(dynamic.usages.filter((u: { key: string | null }) => u.key === null)).toHaveLength(2);
  });

  it('says so when nothing is found', async () => {
    const dir = tempProject({ artisan: '', 'lang/en.json': '{}' });
    expect((await cli(['keys'], { cwd: dir })).stdout).toBe('No translation keys found.\n');
  });
});

describe('fix', () => {
  it('prints the plan and never writes without --write', async () => {
    const dir = copyFixture('react-i18next');
    const before = snapshot(dir);
    const result = await cli(['fix'], { cwd: dir });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('dry run, nothing was written; pass --write to apply');
    expect(result.stdout).toContain(
      'fr  public/locales/fr/common.json  common:nav.settings = "[TODO] Settings"',
    );
    expect(result.stdout).toContain('dashboard:nothing: not defined in the base locale "en"');
    expect(snapshot(dir)).toEqual(before);
  });

  it('adds missing keys to JSON files with --write, keeping formatting, and is idempotent', async () => {
    const dir = copyFixture('react-i18next');
    const first = await cli(['fix', '--write'], { cwd: dir });
    expect(first.code).toBe(0);
    expect(first.stdout).toContain('Added to JSON locale files:');
    expect(first.stdout).toContain('Wrote 1 key to 1 file.');
    expect(readFileSync(join(dir, 'public/locales/fr/common.json'), 'utf8')).toBe(
      readFileSync(
        join(fixturesDir, 'react-i18next/public/locales/fr/common.json'),
        'utf8',
      ).replace('"home": "Accueil"\n', '"home": "Accueil",\n    "settings": "[TODO] Settings"\n'),
    );

    const after = snapshot(dir);
    const second = await cli(['fix', '--write'], { cwd: dir });
    expect(second.stdout).toContain('Cannot be fixed automatically');
    expect(second.stdout).not.toContain('Added to JSON');
    expect(second.stdout).toContain('No files were changed.');
    expect(snapshot(dir)).toEqual(after);

    const check = parseJson<JsonReport>(
      (await cli(['check', '--format', 'json', '--only', 'missing'], { cwd: dir })).stdout,
    );
    expect(check.findings.map((f) => f.key)).toEqual(['dashboard:nothing', 'dashboard:nothing']);
  });

  it('uses a custom marker and creates files for locales that have none', async () => {
    const dir = tempProject({
      artisan: '',
      'lang/en.json': '{ "Save": "Save", "Cancel": "Cancel" }\n',
      'lang/fr.json': '{ "Save": "Enregistrer" }\n',
      'resources/js/a.ts': "t('Save'); t('Cancel');",
      'i18n-drift.config.json': '{ "locales": ["en", "fr", "de"] }',
    });
    const result = await cli(['fix', '--write', '--marker', '>> '], { cwd: dir });
    expect(result.code).toBe(0);
    expect(
      parseJson<Record<string, string>>(readFileSync(join(dir, 'lang/fr.json'), 'utf8')),
    ).toEqual({
      Save: 'Enregistrer',
      Cancel: '>> Cancel',
    });
    expect(
      parseJson<Record<string, string>>(readFileSync(join(dir, 'lang/de.json'), 'utf8')),
    ).toEqual({
      Save: '>> Save',
      Cancel: '>> Cancel',
    });
    expect(result.stdout).toContain('Wrote 3 keys to 2 files.');
  });

  it('never modifies PHP language files and lists the keys to add by hand', async () => {
    const dir = copyFixture('laravel-inertia-react');
    const phpBefore = snapshot(join(dir, 'lang'));
    const result = await cli(['fix', '--write'], { cwd: dir });
    expect(result.stdout).toContain('Add these to the PHP language files by hand');
    expect(result.stdout).toContain(
      'hi  lang/hi/auth.php  auth.throttle = "[TODO] Too many login attempts.',
    );
    const phpAfter = snapshot(join(dir, 'lang'));
    for (const [path, contents] of Object.entries(phpBefore)) {
      if (path.endsWith('.php')) {
        expect(phpAfter[path]).toBe(contents);
      }
    }
    expect(
      parseJson<Record<string, string>>(readFileSync(join(dir, 'lang/gu.json'), 'utf8')),
    ).toMatchObject({
      Dismiss: '[TODO] Dismiss',
    });
  });

  it('can be limited to one locale', async () => {
    const dir = copyFixture('laravel-inertia-react');
    const result = await cli(['fix', '--locale', 'hi'], { cwd: dir });
    expect(result.stdout).toContain('hi  lang/hi/auth.php');
    expect(result.stdout).not.toContain('gu  ');
    expect((await cli(['fix', '--locale', 'zz'], { cwd: dir })).code).toBe(2);
  });

  it('says there is nothing to fix for a clean project', async () => {
    expect((await cli(['fix', '--write'], { cwd: fixture('clean') })).stdout).toBe(
      'Nothing to fix.\nNo files were changed.\n',
    );
  });

  it('leaves all files untouched when one locale file is invalid JSON', async () => {
    const dir = tempProject({
      artisan: '',
      'lang/en.json': '{ "A": "A", "B": "B" }\n',
      'lang/fr.json': '{ "A": "a" }\n',
      'resources/js/a.ts': "t('A'); t('B');",
    });
    const before = snapshot(dir);
    const result = await cli(['fix', '--write'], { cwd: dir });
    expect(result.code).toBe(0);
    expect(snapshot(dir)).not.toEqual(before);
    const broken = tempProject({
      artisan: '',
      'lang/en.json': '{ "A": "A" }\n',
      'lang/fr.json': '{ "A" ',
      'resources/js/a.ts': "t('A');",
    });
    const beforeBroken = snapshot(broken);
    expect((await cli(['fix', '--write'], { cwd: broken })).code).toBe(2);
    expect(snapshot(broken)).toEqual(beforeBroken);
  });
});

describe('init', () => {
  it('writes a config file from the detected layout and refuses to overwrite it', async () => {
    const dir = tempProject({
      artisan: '',
      'lang/en/auth.php': '<?php return [];',
      'lang/hi/auth.php': '<?php return [];',
      'lang/en.json': '{}',
    });
    const result = await cli(['init'], { cwd: dir });
    expect(result).toMatchObject({ code: 0, stderr: '' });
    expect(result.stdout).toBe(
      'Wrote i18n-drift.config.json (Laravel, 2 locales).\nNext: i18n-drift check\n',
    );
    const config = parseJson<Record<string, unknown>>(
      readFileSync(join(dir, 'i18n-drift.config.json'), 'utf8'),
    );
    expect(config).toMatchObject({
      baseLocale: 'en',
      locales: ['en', 'hi'],
      localeFiles: [
        { format: 'laravel-php', path: 'lang/{locale}/{namespace}.php' },
        { format: 'laravel-json', path: 'lang/{locale}.json' },
      ],
    });
    expect(readFileSync(join(dir, 'i18n-drift.config.json'), 'utf8').endsWith('}\n')).toBe(true);

    const again = await cli(['init'], { cwd: dir });
    expect(again.code).toBe(2);
    expect(again.stderr).toBe(
      'i18n-drift: error: i18n-drift.config.json already exists (use --force to overwrite it)\n',
    );
    expect((await cli(['init', '--force'], { cwd: dir })).code).toBe(0);
    expect((await cli(['check'], { cwd: dir })).code).toBe(0);
  });

  it('uses the first locale as base when there is no English and fails without a layout', async () => {
    const dir = tempProject({ artisan: '', 'lang/fr.json': '{}' });
    await cli(['init'], { cwd: dir });
    expect(
      parseJson<Record<string, unknown>>(readFileSync(join(dir, 'i18n-drift.config.json'), 'utf8'))
        .baseLocale,
    ).toBe('fr');
    const empty = await cli(['init'], { cwd: tempProject({ 'a.txt': '' }) });
    expect(empty.code).toBe(2);
    expect(empty.stderr).toContain('could not detect a Laravel or i18next layout');
  });

  it('reports a write failure', async () => {
    const dir = tempProject({
      artisan: '',
      'lang/en.json': '{}',
      'i18n-drift.config.json/.keep': '',
    });
    const result = await cli(['init', '--force'], { cwd: dir });
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('cannot write i18n-drift.config.json');
  });
});
