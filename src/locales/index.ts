import fg from 'fast-glob';
import { readProjectFile } from '../fs-utils.js';
import { loadJsonLocale } from './json.js';
import { loadLaravelJsonLocale } from './laravel-json.js';
import { loadLaravelPhpLocale } from './laravel-php.js';
import { compilePattern } from './pattern.js';
import type { Definition, Finding, ResolvedConfig } from '../types.js';

export interface LoadedLocales {
  definitions: Definition[];
  diagnostics: Finding[];
  /** Locale file paths relative to the project root; these are never scanned as source code. */
  files: string[];
  /** Every locale found on disk, sorted. */
  locales: string[];
}

const LOCALE_FILE_IGNORE = ['**/node_modules/**', '**/vendor/**'];

/** Lists, reads and parses every locale file described by the configuration. */
export async function loadLocales(config: ResolvedConfig): Promise<LoadedLocales> {
  const wanted = config.locales ? new Set([config.baseLocale, ...config.locales]) : null;
  const definitions: Definition[] = [];
  const diagnostics: Finding[] = [];
  const files = new Set<string>();
  const locales = new Set<string>();

  for (const [specIndex, spec] of config.localeFiles.entries()) {
    const pattern = compilePattern(spec.path, `$.localeFiles[${specIndex}].path`);
    const candidates = await fg(pattern.glob, {
      cwd: config.root,
      onlyFiles: true,
      followSymbolicLinks: false,
      ignore: LOCALE_FILE_IGNORE,
    });
    candidates.sort();

    for (const file of candidates) {
      const groups = pattern.regex.exec(file)?.groups;
      const locale = groups?.['locale'];
      if (locale === undefined) {
        continue;
      }
      const namespace = groups?.['namespace'];
      if (wanted && !wanted.has(locale)) {
        continue;
      }
      files.add(file);
      locales.add(locale);
      const text = await readProjectFile(config.root, file);

      if (spec.format === 'laravel-php') {
        const result = await loadLaravelPhpLocale(text, {
          locale,
          file,
          group: namespace ?? '',
          specIndex,
        });
        definitions.push(...result.definitions);
        diagnostics.push(...result.diagnostics);
      } else if (spec.format === 'laravel-json') {
        definitions.push(...loadLaravelJsonLocale(text, { locale, file, specIndex }));
      } else {
        definitions.push(
          ...loadJsonLocale(text, {
            locale,
            file,
            format: 'json',
            specIndex,
            namespace,
            namespaceSeparator: config.namespaceSeparator,
          }),
        );
      }
    }
  }

  return { definitions, diagnostics, files: [...files].sort(), locales: [...locales].sort() };
}
