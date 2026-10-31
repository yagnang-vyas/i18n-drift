import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import fg from 'fast-glob';
import type { LocaleFileSpec } from './types.js';

export interface DetectedLayout {
  /** Human-readable names of what was recognized, e.g. `Laravel`, `i18next`. */
  kinds: string[];
  localeFiles: LocaleFileSpec[];
  sources: string[];
  exclude: string[];
  /** Explanations printed by `--verbose`. */
  notes: string[];
}

/** Patterns excluded from source scanning unless overridden. */
export const DEFAULT_EXCLUDE: readonly string[] = [
  '**/node_modules/**',
  '**/vendor/**',
  '**/dist/**',
  '**/build/**',
  '**/.next/**',
  '**/.nuxt/**',
  '**/coverage/**',
  '**/storage/**',
  '**/*.d.ts',
  '**/*.min.js',
  '**/*.test.*',
  '**/*.spec.*',
  '**/__tests__/**',
];

const JS_EXTENSIONS = 'js,jsx,ts,tsx,mjs,cjs';
const I18NEXT_DIRECTORIES = ['public/locales', 'src/locales', 'locales', 'resources/js/locales'];
const LARAVEL_LANG_DIRECTORIES = ['lang', 'resources/lang'];

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function anyMatch(root: string, pattern: string): Promise<boolean> {
  const matches = await fg(pattern, {
    cwd: root,
    onlyFiles: true,
    deep: 4,
    ignore: ['**/node_modules/**', '**/vendor/**'],
  });
  return matches.length > 0;
}

/**
 * Recognizes a Laravel project (an `artisan` file plus a `lang/` or `resources/lang/` directory)
 * and i18next-style locale directories. Returns `null` when nothing is recognized.
 */
export async function detectLayout(root: string): Promise<DetectedLayout | null> {
  const localeFiles: LocaleFileSpec[] = [];
  const kinds: string[] = [];
  const notes: string[] = [];
  const sources: string[] = [];

  const laravel = await isFile(join(root, 'artisan'));
  if (laravel) {
    for (const dir of LARAVEL_LANG_DIRECTORIES) {
      if (!(await isDirectory(join(root, dir)))) {
        continue;
      }
      const php = `${dir}/{locale}/{namespace}.php`;
      const json = `${dir}/{locale}.json`;
      if (await anyMatch(root, `${dir}/*/**/*.php`)) {
        localeFiles.push({ format: 'laravel-php', path: php });
        notes.push(`found Laravel PHP language files in ${dir}/`);
      }
      if (await anyMatch(root, `${dir}/*.json`)) {
        localeFiles.push({ format: 'laravel-json', path: json });
        notes.push(`found Laravel JSON language files in ${dir}/`);
      }
    }
    if (localeFiles.length > 0) {
      kinds.push('Laravel');
      sources.push('app/**/*.php', 'routes/**/*.php', `resources/**/*.{php,${JS_EXTENSIONS}}`);
    }
  }

  let i18next = false;
  for (const dir of I18NEXT_DIRECTORIES) {
    if (!(await isDirectory(join(root, dir)))) {
      continue;
    }
    if (await anyMatch(root, `${dir}/*/**/*.json`)) {
      localeFiles.push({ format: 'json', path: `${dir}/{locale}/{namespace}.json` });
      notes.push(`found i18next namespace files in ${dir}/{locale}/`);
      i18next = true;
    }
    if (await anyMatch(root, `${dir}/*.json`)) {
      localeFiles.push({ format: 'json', path: `${dir}/{locale}.json` });
      notes.push(`found single-file JSON locales in ${dir}/`);
      i18next = true;
    }
  }
  if (i18next) {
    kinds.push('i18next');
    if (!laravel) {
      sources.push(`**/*.{${JS_EXTENSIONS}}`);
    }
  }

  if (localeFiles.length === 0) {
    return null;
  }
  notes.push(`source globs: ${sources.join(', ')}`);
  return { kinds, localeFiles, sources, exclude: [...DEFAULT_EXCLUDE], notes };
}
