import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { ConfigError, UserError, errorMessage } from './errors.js';
import { detectLayout } from './detect.js';
import type { DetectedLayout } from './detect.js';
import { JsonSyntaxError, parseJsonAst } from './locales/json-ast.js';
import { compilePattern } from './locales/pattern.js';
import { CHECK_IDS, DEFAULT_SEVERITY, LOCALE_FORMATS, PLACEHOLDER_SYNTAXES } from './types.js';
import type {
  CheckId,
  LocaleFileSpec,
  LocaleFormat,
  PlaceholderSyntax,
  ResolvedConfig,
  Severity,
} from './types.js';

export const CONFIG_FILE_NAME = 'i18n-drift.config.json';

export const DEFAULT_FUNCTIONS: readonly string[] = ['t', '$t', 'i18n.t', 'i18next.t'];

const DEFAULT_PLACEHOLDER_SYNTAX: Readonly<Record<LocaleFormat, PlaceholderSyntax[]>> = {
  json: ['i18next'],
  'laravel-php': ['laravel'],
  'laravel-json': ['laravel'],
};

const KNOWN_KEYS = [
  'baseLocale',
  'locales',
  'sources',
  'exclude',
  'localeFiles',
  'functions',
  'namespaceSeparator',
  'defaultNamespace',
  'dynamicKeyPatterns',
  'untranslatedAllowlist',
  'severity',
  'placeholderSyntax',
] as const;

type Raw = Record<string, unknown>;

function isObject(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(path: string, message: string): never {
  throw new ConfigError(`${path}: ${message}`);
}

function optionalString(
  raw: Raw,
  key: string,
  path: string,
  allowEmpty = false,
): string | undefined {
  const value = raw[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string' || (!allowEmpty && value === '')) {
    fail(`${path}.${key}`, `expected a${allowEmpty ? '' : ' non-empty'} string`);
  }
  return value;
}

function optionalStringArray(raw: Raw, key: string, path: string): string[] | undefined {
  const value = raw[key];
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    fail(`${path}.${key}`, 'expected an array of strings');
  }
  return value.map((item: unknown, index) => {
    if (typeof item !== 'string' || item === '') {
      fail(`${path}.${key}[${index}]`, 'expected a non-empty string');
    }
    return item;
  });
}

function parseLocaleFiles(raw: Raw): LocaleFileSpec[] | undefined {
  const value = raw['localeFiles'];
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value) || value.length === 0) {
    fail('$.localeFiles', 'expected a non-empty array of { "format", "path" } objects');
  }
  return value.map((entry: unknown, index): LocaleFileSpec => {
    const path = `$.localeFiles[${index}]`;
    if (!isObject(entry)) {
      fail(path, 'expected an object with "format" and "path"');
    }
    for (const key of Object.keys(entry)) {
      if (key !== 'format' && key !== 'path') {
        fail(`${path}.${key}`, 'unknown configuration key');
      }
    }
    const format = entry['format'];
    if (typeof format !== 'string' || !LOCALE_FORMATS.includes(format as LocaleFormat)) {
      fail(`${path}.format`, `expected one of ${LOCALE_FORMATS.map((f) => `"${f}"`).join(', ')}`);
    }
    const pathPattern = entry['path'];
    if (typeof pathPattern !== 'string' || pathPattern === '') {
      fail(`${path}.path`, 'expected a non-empty string');
    }
    const compiled = compilePattern(pathPattern, `${path}.path`);
    if (format === 'laravel-php' && !compiled.hasNamespace) {
      fail(`${path}.path`, 'laravel-php paths must contain {namespace} (the language file name)');
    }
    return { format: format as LocaleFormat, path: pathPattern };
  });
}

function parseSeverity(raw: Raw): Record<CheckId, Severity | 'off'> {
  const result: Record<CheckId, Severity | 'off'> = { ...DEFAULT_SEVERITY };
  const value = raw['severity'];
  if (value === undefined) {
    return result;
  }
  if (!isObject(value)) {
    fail('$.severity', 'expected an object mapping check ids to a severity');
  }
  for (const [id, level] of Object.entries(value)) {
    if (!CHECK_IDS.includes(id as CheckId)) {
      fail(`$.severity.${id}`, `unknown check id (expected one of ${CHECK_IDS.join(', ')})`);
    }
    if (level !== 'error' && level !== 'warning' && level !== 'note' && level !== 'off') {
      fail(`$.severity.${id}`, 'expected "error", "warning", "note" or "off"');
    }
    result[id as CheckId] = level;
  }
  return result;
}

function parsePlaceholderSyntax(raw: Raw): Record<LocaleFormat, PlaceholderSyntax[]> {
  const result = {
    json: [...DEFAULT_PLACEHOLDER_SYNTAX.json],
    'laravel-php': [...DEFAULT_PLACEHOLDER_SYNTAX['laravel-php']],
    'laravel-json': [...DEFAULT_PLACEHOLDER_SYNTAX['laravel-json']],
  };
  const value = raw['placeholderSyntax'];
  if (value === undefined) {
    return result;
  }
  if (!isObject(value)) {
    fail('$.placeholderSyntax', 'expected an object mapping a locale file format to syntaxes');
  }
  for (const [format, syntax] of Object.entries(value)) {
    const path = `$.placeholderSyntax.${format}`;
    if (!LOCALE_FORMATS.includes(format as LocaleFormat)) {
      fail(path, `unknown format (expected one of ${LOCALE_FORMATS.join(', ')})`);
    }
    const list: unknown[] = Array.isArray(syntax) ? syntax : [syntax];
    const expected = PLACEHOLDER_SYNTAXES.map((s) => `"${s}"`).join(', ');
    if (list.length === 0) {
      fail(path, `expected a syntax or a non-empty array of syntaxes (${expected})`);
    }
    result[format as LocaleFormat] = list.map((item, index) => {
      if (typeof item !== 'string' || !PLACEHOLDER_SYNTAXES.includes(item as PlaceholderSyntax)) {
        fail(Array.isArray(syntax) ? `${path}[${index}]` : path, `expected one of ${expected}`);
      }
      return item as PlaceholderSyntax;
    });
  }
  return result;
}

/**
 * Validates a parsed configuration object and fills in defaults. Missing `localeFiles`,
 * `sources` and `exclude` come from `detected`. Throws {@link ConfigError} naming the JSON path.
 */
export function validateConfig(
  raw: unknown,
  root: string,
  detected: DetectedLayout | null,
): ResolvedConfig {
  if (!isObject(raw)) {
    fail('$', 'expected a JSON object');
  }
  for (const key of Object.keys(raw)) {
    if (!(KNOWN_KEYS as readonly string[]).includes(key)) {
      fail(`$.${key}`, `unknown configuration key (expected one of ${KNOWN_KEYS.join(', ')})`);
    }
  }

  const localeFiles = parseLocaleFiles(raw) ?? detected?.localeFiles;
  if (!localeFiles) {
    throw new UserError(
      'no locale files found: could not detect a Laravel or i18next layout. ' +
        `Create ${CONFIG_FILE_NAME} with a "localeFiles" list (see the README) or run "i18n-drift init" in a project root`,
    );
  }

  const locales = optionalStringArray(raw, 'locales', '$');
  const sources = optionalStringArray(raw, 'sources', '$') ?? detected?.sources ?? [];
  if (sources.length === 0) {
    fail('$.sources', 'expected at least one source glob (none could be detected)');
  }

  return {
    root,
    baseLocale: optionalString(raw, 'baseLocale', '$') ?? null,
    locales: locales ?? null,
    sources,
    exclude: optionalStringArray(raw, 'exclude', '$') ?? detected?.exclude ?? [],
    localeFiles,
    functions: optionalStringArray(raw, 'functions', '$') ?? [...DEFAULT_FUNCTIONS],
    namespaceSeparator: optionalString(raw, 'namespaceSeparator', '$') ?? ':',
    defaultNamespace: optionalString(raw, 'defaultNamespace', '$', true) ?? 'translation',
    dynamicKeyPatterns: optionalStringArray(raw, 'dynamicKeyPatterns', '$') ?? [],
    untranslatedAllowlist: optionalStringArray(raw, 'untranslatedAllowlist', '$') ?? [],
    severity: parseSeverity(raw),
    placeholderSyntax: parsePlaceholderSyntax(raw),
  };
}

export interface LoadedConfig {
  config: ResolvedConfig;
  origin: 'file' | 'detected';
  /** Absolute path of the config file when `origin` is `file`. */
  configPath?: string;
  detected: DetectedLayout | null;
}

/**
 * Finds and validates the configuration. With `configPath` that file is required; otherwise
 * `i18n-drift.config.json` in `cwd` is used when present; otherwise the layout is detected.
 * Patterns in a config file are relative to the directory containing it.
 */
export async function loadConfig(options: {
  cwd: string;
  configPath?: string;
}): Promise<LoadedConfig> {
  const explicit = options.configPath !== undefined;
  const path = resolve(options.cwd, options.configPath ?? CONFIG_FILE_NAME);

  let text: string | undefined;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    const missing = (error as NodeJS.ErrnoException).code === 'ENOENT';
    if (explicit || !missing) {
      throw new UserError(
        missing
          ? `config file not found: ${options.configPath}`
          : `cannot read ${path}: ${errorMessage(error)}`,
      );
    }
  }

  if (text === undefined) {
    const detected = await detectLayout(options.cwd);
    if (!detected) {
      throw new UserError(
        'could not detect a Laravel or i18next layout in this directory. ' +
          `Create ${CONFIG_FILE_NAME} with a "localeFiles" list (see the README) or run from your project root`,
      );
    }
    return { config: validateConfig({}, options.cwd, detected), origin: 'detected', detected };
  }

  const root = dirname(path);
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const where = options.configPath ?? CONFIG_FILE_NAME;
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    throw invalidJson(body, where);
  }
  const detected = await detectLayout(root);
  return {
    config: validateConfig(raw, root, detected),
    origin: 'file',
    configPath: path,
    detected,
  };
}

/** Builds an error with the line and column of the JSON syntax problem. */
function invalidJson(body: string, where: string): UserError {
  try {
    parseJsonAst(body);
  } catch (error) {
    if (error instanceof JsonSyntaxError) {
      return new UserError(
        `${where}:${error.line}:${error.column}: invalid JSON: ${error.message}`,
      );
    }
  }
  return new UserError(`${where}: invalid JSON`);
}
