import { describe, expect, it } from 'vitest';
import { detectLayout } from '../../src/detect.js';
import { tempProject } from '../helpers/index.js';

describe('detectLayout', () => {
  it('recognizes Laravel PHP and JSON language files in lang/', async () => {
    const dir = tempProject({
      artisan: '',
      'lang/en/auth.php': '<?php return [];',
      'lang/en/admin/users.php': '<?php return [];',
      'lang/en.json': '{}',
    });
    const layout = await detectLayout(dir);
    expect(layout?.kinds).toEqual(['Laravel']);
    expect(layout?.localeFiles).toEqual([
      { format: 'laravel-php', path: 'lang/{locale}/{namespace}.php' },
      { format: 'laravel-json', path: 'lang/{locale}.json' },
    ]);
    expect(layout?.sources).toContain('app/**/*.php');
    expect(layout?.sources).toContain('resources/**/*.{php,js,jsx,ts,tsx,mjs,cjs}');
    expect(layout?.notes.length).toBeGreaterThan(0);
  });

  it('recognizes the legacy resources/lang directory', async () => {
    const dir = tempProject({ artisan: '', 'resources/lang/en/auth.php': '<?php return [];' });
    expect((await detectLayout(dir))?.localeFiles).toEqual([
      { format: 'laravel-php', path: 'resources/lang/{locale}/{namespace}.php' },
    ]);
  });

  it('requires the artisan file for Laravel', async () => {
    const dir = tempProject({ 'lang/en/auth.php': '<?php return [];' });
    expect(await detectLayout(dir)).toBeNull();
  });

  it('ignores lang/vendor and node_modules', async () => {
    const dir = tempProject({ artisan: '', 'lang/vendor/pkg/en/x.php': '<?php return [];' });
    expect(await detectLayout(dir)).toBeNull();
  });

  it('recognizes i18next namespace and single-file layouts', async () => {
    const dir = tempProject({
      'public/locales/en/common.json': '{}',
      'src/locales/en.json': '{}',
    });
    const layout = await detectLayout(dir);
    expect(layout?.kinds).toEqual(['i18next']);
    expect(layout?.localeFiles).toEqual([
      { format: 'json', path: 'public/locales/{locale}/{namespace}.json' },
      { format: 'json', path: 'src/locales/{locale}.json' },
    ]);
    expect(layout?.sources).toEqual(['**/*.{js,jsx,ts,tsx,mjs,cjs}']);
  });

  it('combines Laravel and i18next layouts', async () => {
    const dir = tempProject({
      artisan: '',
      'lang/en.json': '{}',
      'resources/js/locales/en/common.json': '{}',
    });
    const layout = await detectLayout(dir);
    expect(layout?.kinds).toEqual(['Laravel', 'i18next']);
    expect(layout?.sources).toHaveLength(3);
  });

  it('returns null for a project without locale files', async () => {
    expect(await detectLayout(tempProject({ 'src/a.ts': '' }))).toBeNull();
    expect(await detectLayout(tempProject({ artisan: '' }))).toBeNull();
  });
});
