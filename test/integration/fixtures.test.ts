import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { analyze } from '../../src/analyze.js';
import { loadConfig } from '../../src/config.js';
import { UserError } from '../../src/errors.js';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
const projects = ['laravel-inertia-react', 'react-i18next', 'blade-only', 'clean'];

async function analyzeFixture(name: string) {
  const { config } = await loadConfig({ cwd: join(fixtures, name) });
  return analyze(config);
}

describe.each(projects)('fixture project %s', (name) => {
  it('reports exactly the expected findings', async () => {
    const analysis = await analyzeFixture(name);
    const expected: unknown = JSON.parse(
      readFileSync(join(fixtures, name, 'expected-findings.json'), 'utf8'),
    );
    expect(analysis.findings).toEqual(expected);
  });

  it('is deterministic', async () => {
    const first = await analyzeFixture(name);
    const second = await analyzeFixture(name);
    expect(second.findings).toEqual(first.findings);
    expect(second.usages).toEqual(first.usages);
  });
});

describe('laravel-inertia-react seeded cases', () => {
  it('seeds every kind of finding exactly where intended', async () => {
    const { findings } = await analyzeFixture('laravel-inertia-react');
    const lines = findings.map((f) => `${f.id} ${f.locale ?? '-'} ${f.key ?? '-'}`);
    expect(lines).toEqual(
      expect.arrayContaining([
        'missing en Create invoice',
        'missing hi Create invoice',
        'missing gu Create invoice',
        'missing hi auth.throttle',
        'missing gu billing.invoice_overdue',
        'missing gu Dismiss',
        'missing gu admin/users.title',
        'missing gu admin/users.invite',
        'missing gu status.void',
        'unused en messages.legacy_banner',
        'unused en Archive client',
        'unused en admin/users.deprecated_note',
        'untranslated gu messages.export_csv',
        'empty gu messages.footer_note',
        'extra hi messages.old_promo',
        'placeholder-mismatch hi messages.welcome_title',
        'unknown-value en messages.support_email',
      ]),
    );
    expect(findings.filter((f) => f.id === 'dynamic-key')).toHaveLength(4);
    // 9 missing, 3 unused, 1 untranslated, 1 empty, 1 extra, 1 placeholder, 4 dynamic, 1 unknown
    expect(findings).toHaveLength(21);
  });

  it('does not count comments, verbatim blocks, lookalike calls or methods', async () => {
    const { usages } = await analyzeFixture('laravel-inertia-react');
    const keys = usages.map((u) => u.key);
    for (const ghost of [
      'auth.commented_out',
      'messages.commented_out',
      'messages.inside_verbatim',
      'commented.out',
      'commented.block',
      'inside.a.string',
      'not.a.key',
      'not.a.translation',
    ]) {
      expect(keys).not.toContain(ghost);
    }
  });

  it('honours the allowlist, the short-value rule and casing-insensitive placeholders', async () => {
    const { findings } = await analyzeFixture('laravel-inertia-react');
    const keys = findings.map((f) => f.key);
    expect(keys).not.toContain('messages.app_name'); // allowlisted by value
    expect(keys).not.toContain('messages.brand_tagline'); // allowlisted by key pattern
    expect(keys).not.toContain('messages.ok_label'); // shorter than three characters
    expect(findings.some((f) => f.locale === 'gu' && f.key === 'messages.welcome_title')).toBe(
      false,
    ); // :Name vs :name
  });

  it('never scans locale files as source files', async () => {
    const analysis = await analyzeFixture('laravel-inertia-react');
    expect(analysis.usages.some((u) => u.file.startsWith('lang/'))).toBe(false);
    expect(analysis.localeFiles).toContain('lang/en/admin/users.php');
  });
});

describe('react-i18next namespaces', () => {
  it('resolves namespaces, the ns option, Trans and plural forms', async () => {
    const analysis = await analyzeFixture('react-i18next');
    const keys = new Set(analysis.usages.map((u) => u.key));
    for (const key of [
      'common:save',
      'common:nav.home',
      'dashboard:title',
      'dashboard:intro',
      'dashboard:nothing',
      'common:cancel',
      'common:items',
    ]) {
      expect(keys).toContain(key);
    }
    expect(analysis.findings.some((f) => f.key === 'common:items_many')).toBe(false);
  });
});

describe('analyze errors', () => {
  it('rejects a base locale without files', async () => {
    const { config } = await loadConfig({ cwd: join(fixtures, 'blade-only') });
    await expect(analyze({ ...config, baseLocale: 'zz' })).rejects.toThrow(
      'base locale "zz" has no locale files (found locales: en, es)',
    );
  });

  it('rejects a project without locale files', async () => {
    const { config } = await loadConfig({ cwd: join(fixtures, 'blade-only') });
    await expect(
      analyze({ ...config, localeFiles: [{ format: 'json', path: 'nothing/{locale}.json' }] }),
    ).rejects.toThrow(UserError);
  });

  it('falls back to the first locale when en does not exist', async () => {
    const { config } = await loadConfig({ cwd: join(fixtures, 'clean') });
    const analysis = await analyze({ ...config, baseLocale: null, locales: ['hi'] });
    expect(analysis.baseLocale).toBe('en');
    expect(analysis.locales).toEqual(['en', 'hi']);
  });

  it('only checks configured locales', async () => {
    const { config } = await loadConfig({ cwd: join(fixtures, 'laravel-inertia-react') });
    const analysis = await analyze({ ...config, locales: ['en', 'hi'] });
    expect(analysis.locales).toEqual(['en', 'hi']);
    expect(analysis.findings.some((f) => f.locale === 'gu')).toBe(false);
  });

  it('keeps fixture files untouched', () => {
    // Analysis is read-only: no stray files appear next to the fixtures.
    expect(existsSync(join(fixtures, 'laravel-inertia-react', 'pwned.txt'))).toBe(false);
    expect(readdirSync(join(fixtures, 'clean')).sort()).toEqual(
      [
        'app',
        'artisan',
        'expected-findings.json',
        'i18n-drift.config.json',
        'lang',
        'resources',
      ].sort(),
    );
  });
});
