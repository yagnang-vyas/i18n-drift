import { extractPlaceholders, hasTranslatableText } from './placeholders.js';
import type { CheckId, Definition, Finding, ResolvedConfig, Severity, Usage } from './types.js';

export interface CompareInput {
  config: ResolvedConfig;
  baseLocale: string;
  /** Every locale to check, including the base locale. */
  locales: readonly string[];
  definitions: readonly Definition[];
  usages: readonly Usage[];
}

const PLURAL_SUFFIX = /_(?:zero|one|two|few|many|other|plural)$/;
const PLURAL_SUFFIXES = ['zero', 'one', 'two', 'few', 'many', 'other', 'plural'];
const SEVERITY_ORDER: Readonly<Record<Severity, number>> = { error: 0, warning: 1, note: 2 };

/** Turns a glob where `*` matches one or more characters into a regular expression. */
export function patternToRegExp(pattern: string): RegExp {
  const source = pattern
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.+');
  return new RegExp(`^${source}$`, 's');
}

/** Removes an i18next plural suffix from keys of JSON definitions. */
function familyKey(definition: Definition): string {
  return definition.format === 'json' ? definition.key.replace(PLURAL_SUFFIX, '') : definition.key;
}

type LocaleIndex = Map<string, Definition>;

/** Sorts findings by severity, locale, file, line, key and check id. */
export function sortFindings(findings: readonly Finding[]): Finding[] {
  return [...findings].sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      compareText(a.locale ?? '', b.locale ?? '') ||
      compareText(a.file ?? '', b.file ?? '') ||
      (a.line ?? 0) - (b.line ?? 0) ||
      compareText(a.key ?? '', b.key ?? '') ||
      compareText(a.id, b.id),
  );
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Runs every check and returns the findings in deterministic order. */
export function compare(input: CompareInput): Finding[] {
  const { config, baseLocale } = input;
  const findings: Finding[] = [];
  const add = (
    id: CheckId,
    fields: Pick<Finding, 'locale' | 'key' | 'file' | 'line' | 'message'>,
  ): void => {
    const severity = config.severity[id];
    if (severity !== 'off') {
      findings.push({ id, severity, ...fields });
    }
  };

  const index = new Map<string, LocaleIndex>();
  const families = new Map<string, Set<string>>();
  for (const locale of input.locales) {
    index.set(locale, new Map());
    families.set(locale, new Set());
  }
  for (const definition of input.definitions) {
    const keys = index.get(definition.locale);
    if (!keys) {
      continue;
    }
    // Laravel resolves dotted keys in PHP arrays first, so a PHP definition wins a collision.
    const existing = keys.get(definition.key);
    if (!existing || (definition.format === 'laravel-php' && existing.format !== 'laravel-php')) {
      keys.set(definition.key, definition);
    }
    families.get(definition.locale)?.add(familyKey(definition));
  }
  const base = index.get(baseLocale) ?? new Map<string, Definition>();

  const separator = config.namespaceSeparator;
  const candidates = (key: string): string[] =>
    config.defaultNamespace !== '' && !key.includes(separator)
      ? [key, `${config.defaultNamespace}${separator}${key}`]
      : [key];

  const isDefined = (keys: LocaleIndex, key: string): boolean =>
    candidates(key).some(
      (candidate) =>
        keys.has(candidate) || PLURAL_SUFFIXES.some((suffix) => keys.has(`${candidate}_${suffix}`)),
    );

  // ----- usages -----
  const staticUsages = new Map<string, { first: Usage; count: number }>();
  const dynamicUsages: Usage[] = [];
  for (const usage of input.usages) {
    if (usage.dynamic) {
      dynamicUsages.push(usage);
      continue;
    }
    const entry = staticUsages.get(usage.key);
    if (entry) {
      entry.count++;
    } else {
      staticUsages.set(usage.key, { first: usage, count: 1 });
    }
  }

  // missing: statically used keys that a locale does not define
  for (const [key, { first, count }] of staticUsages) {
    for (const locale of input.locales) {
      if (!isDefined(index.get(locale) as LocaleIndex, key)) {
        add('missing', {
          locale,
          key,
          file: first.file,
          line: first.line,
          message: `used ${count === 1 ? 'once' : `${count} times`} but not defined in "${locale}"`,
        });
      }
    }
  }

  // ----- which base definitions are used -----
  const usedKeys = new Set<string>();
  for (const key of staticUsages.keys()) {
    for (const candidate of candidates(key)) {
      usedKeys.add(candidate);
    }
  }
  const usagePatterns = new Set<string>();
  for (const usage of dynamicUsages) {
    if (usage.pattern !== undefined) {
      for (const candidate of usage.pattern.startsWith('*')
        ? [usage.pattern]
        : candidates(usage.pattern)) {
        usagePatterns.add(candidate);
      }
    }
  }
  const patternMatchers = [...usagePatterns, ...config.dynamicKeyPatterns].map(patternToRegExp);
  const matchesPattern = (definition: Definition): boolean =>
    patternMatchers.some(
      (matcher) => matcher.test(definition.key) || matcher.test(familyKey(definition)),
    );
  const isExactlyUsed = (definition: Definition): boolean =>
    usedKeys.has(definition.key) || usedKeys.has(familyKey(definition));

  const dynamicOnly: Definition[] = [];
  for (const definition of base.values()) {
    const exact = isExactlyUsed(definition);
    const pattern = matchesPattern(definition);
    if (!exact && !pattern) {
      add('unused', {
        locale: baseLocale,
        key: definition.key,
        file: definition.file,
        line: definition.line,
        message: 'defined but not used by any static key or dynamic key pattern',
      });
    } else if (!exact) {
      dynamicOnly.push(definition);
    }
  }

  // missing (dynamic): keys the base locale uses through a pattern must exist in every locale
  for (const definition of dynamicOnly) {
    for (const locale of input.locales) {
      if (locale !== baseLocale && !families.get(locale)?.has(familyKey(definition))) {
        add('missing', {
          locale,
          key: definition.key,
          file: definition.file,
          line: definition.line,
          message: `used through a dynamic key pattern ("${baseLocale}" defines it) but not defined in "${locale}"`,
        });
      }
    }
  }

  // ----- per-definition checks -----
  const allowKeys = config.untranslatedAllowlist.map(patternToRegExp);
  const allowValues = new Set(config.untranslatedAllowlist);
  const baseFamilies = families.get(baseLocale) ?? new Set<string>();

  for (const definition of input.definitions) {
    const { locale, key, value } = definition;
    const where = { locale, key, file: definition.file, line: definition.line };
    if (!index.has(locale)) {
      continue;
    }

    if (value === null) {
      add('unknown-value', { ...where, message: 'value is not statically known' });
    }
    if (locale === baseLocale) {
      continue;
    }

    if (!baseFamilies.has(familyKey(definition))) {
      add('extra', {
        ...where,
        message: `defined in "${locale}" but not in base locale "${baseLocale}"`,
      });
      continue;
    }
    if (value === '') {
      add('empty', { ...where, message: 'translation is an empty string' });
      continue;
    }
    const baseDefinition = base.get(key);
    if (value === null || !baseDefinition || baseDefinition.value === null) {
      continue;
    }

    const syntaxes = config.placeholderSyntax[baseDefinition.format];
    if (value === baseDefinition.value) {
      const trimmed = value.trim();
      const allowed =
        allowValues.has(value) ||
        allowValues.has(trimmed) ||
        allowKeys.some((matcher) => matcher.test(key));
      if (trimmed.length >= 3 && hasTranslatableText(value, syntaxes) && !allowed) {
        add('untranslated', {
          ...where,
          message: `value is identical to the "${baseLocale}" value`,
        });
      }
    }

    const expected = extractPlaceholders(baseDefinition.value, syntaxes);
    const actual = extractPlaceholders(value, config.placeholderSyntax[definition.format]);
    if (!sameSet(expected, actual)) {
      add('placeholder-mismatch', {
        ...where,
        message: `placeholders differ: "${baseLocale}" has ${describe(expected)}, "${locale}" has ${describe(actual)}`,
      });
    }
  }

  // ----- dynamic keys -----
  for (const usage of dynamicUsages) {
    add('dynamic-key', {
      locale: null,
      key: usage.pattern ?? null,
      file: usage.file,
      line: usage.line,
      message:
        usage.pattern === undefined
          ? 'key is computed at runtime and cannot be checked'
          : `key is computed at runtime; assuming it matches "${usage.pattern}"`,
    });
  }

  return sortFindings(findings);
}

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  return a.size === b.size && [...a].every((item) => b.has(item));
}

function describe(placeholders: ReadonlySet<string>): string {
  return placeholders.size === 0 ? 'none' : [...placeholders].sort().join(' ');
}
