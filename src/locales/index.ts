import fg from 'fast-glob';
import { readProjectFile } from '../fs-utils.js';
import { loadJsonLocale } from './json.js';
import { loadLaravelJsonLocale } from './laravel-json.js';
import { loadLaravelPhpLocale } from './laravel-php.js';
import { compilePattern } from './pattern.js';
import type { Definition, Finding, LocaleFileSpec, ResolvedConfig } from '../types.js';

export interface LoadedLocales {
  definitions: Definition[];
  diagnostics: Finding[];
  /** Locale file paths relative to the project root; these are never scanned as source code. */
  files: string[];
  /** Every locale found on disk, sorted. */
  locales: string[];
}

export interface LocaleFile {
  /** Path relative to the project root, using `/` separators. */
  file: string;
  locale: string;
  namespace: string | undefined;
  specIndex: number;
  spec: LocaleFileSpec;
}

const LOCALE_FILE_IGNORE = ['**/node_modules/**', '**/vendor/**'];

/** Lists the files matched by the `localeFiles` patterns without reading them. */
export async function listLocaleFiles(
  config: Pick<ResolvedConfig, 'root' | 'localeFiles'>,
): Promise<LocaleFile[]> {
  const result: LocaleFile[] = [];
  for (const [specIndex, spec] of config.localeFiles.entries()) {
    const pattern = compilePattern(spec.path, `$.localeFiles[${specIndex}].path`);
    const candidates = await fg(pattern.glob, {
      cwd: config.root,
      onlyFiles: true,
      followSymbolicLinks: false,
      ignore: LOCALE_FILE_IGNORE,
    });
    for (const file of candidates.sort()) {
      const groups = pattern.regex.exec(file)?.groups;
      const locale = groups?.['locale'];
      if (locale !== undefined) {
        result.push({ file, locale, namespace: groups?.['namespace'], specIndex, spec });
      }
    }
  }
  return result;
}

/** Reads and parses every locale file described by the configuration. */
export async function loadLocales(config: ResolvedConfig): Promise<LoadedLocales> {
  // With an automatic base locale every locale must be read so the base can be chosen.
  const wanted =
    config.locales && config.baseLocale ? new Set([config.baseLocale, ...config.locales]) : null;
  const definitions: Definition[] = [];
  const diagnostics: Finding[] = [];
  const files = new Set<string>();
  const locales = new Set<string>();

  for (const entry of await listLocaleFiles(config)) {
    const { file, locale, namespace, specIndex, spec } = entry;
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

  return { definitions, diagnostics, files: [...files].sort(), locales: [...locales].sort() };
}
