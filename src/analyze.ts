import fg from 'fast-glob';
import { compare, sortFindings } from './compare.js';
import { UserError } from './errors.js';
import { extractUsages, isSourceFile } from './extractors/index.js';
import { readProjectFile } from './fs-utils.js';
import { loadLocales } from './locales/index.js';
import type { Definition, Finding, ResolvedConfig, Usage } from './types.js';

export interface Analysis {
  config: ResolvedConfig;
  baseLocale: string;
  /** Locales that were checked (the base locale first, then the others sorted). */
  locales: string[];
  definitions: Definition[];
  usages: Usage[];
  findings: Finding[];
  /** Number of source files that were scanned. */
  scannedFiles: number;
  /** Locale files that were read, relative to the project root. */
  localeFiles: string[];
}

/** Lists the source files to scan, excluding anything that is a locale file. */
export async function listSourceFiles(
  config: ResolvedConfig,
  localeFiles: readonly string[],
): Promise<string[]> {
  const skip = new Set(localeFiles);
  const files = await fg(config.sources, {
    cwd: config.root,
    onlyFiles: true,
    followSymbolicLinks: false,
    ignore: ['**/node_modules/**', '**/vendor/**', '**/.git/**', ...config.exclude],
  });
  return files.filter((file) => isSourceFile(file) && !skip.has(file)).sort();
}

/** Extracts key usages from every source file. */
export async function scanUsages(
  config: ResolvedConfig,
  localeFiles: readonly string[],
): Promise<{ usages: Usage[]; files: number }> {
  const files = await listSourceFiles(config, localeFiles);
  const usages: Usage[] = [];
  for (const file of files) {
    const source = await readProjectFile(config.root, file);
    usages.push(
      ...(await extractUsages(source, file, {
        functions: config.functions,
        namespaceSeparator: config.namespaceSeparator,
      })),
    );
  }
  return { usages, files: files.length };
}

/** Loads locale files, extracts key usages from source files and runs every check. */
export async function analyze(config: ResolvedConfig): Promise<Analysis> {
  const loaded = await loadLocales(config);
  if (loaded.locales.length === 0) {
    throw new UserError(
      `no locale files found (looked for: ${config.localeFiles.map((spec) => spec.path).join(', ')})`,
    );
  }

  const baseLocale =
    config.baseLocale ?? (loaded.locales.includes('en') ? 'en' : (loaded.locales[0] as string));
  if (!loaded.locales.includes(baseLocale)) {
    throw new UserError(
      `base locale "${baseLocale}" has no locale files (found locales: ${loaded.locales.join(', ')})`,
    );
  }
  const others = new Set(config.locales ?? loaded.locales);
  others.delete(baseLocale);
  const locales = [baseLocale, ...[...others].sort()];

  const { usages, files } = await scanUsages(config, loaded.files);

  const definitions = loaded.definitions.filter((definition) =>
    locales.includes(definition.locale),
  );
  const findings = compare({ config, baseLocale, locales, definitions, usages });
  for (const diagnostic of loaded.diagnostics) {
    const severity = config.severity[diagnostic.id];
    if (severity !== 'off' && locales.includes(diagnostic.locale ?? baseLocale)) {
      findings.push({ ...diagnostic, severity });
    }
  }

  return {
    config,
    baseLocale,
    locales,
    definitions,
    usages,
    findings: sortFindings(findings),
    scannedFiles: files,
    localeFiles: loaded.files,
  };
}
