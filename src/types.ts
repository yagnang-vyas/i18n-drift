/** Severity of a finding. `off` is only valid in configuration. */
export type Severity = 'error' | 'warning' | 'note';

export type CheckId =
  | 'missing'
  | 'unused'
  | 'untranslated'
  | 'empty'
  | 'extra'
  | 'placeholder-mismatch'
  | 'dynamic-key'
  | 'unknown-value';

export const CHECK_IDS: readonly CheckId[] = [
  'missing',
  'unused',
  'untranslated',
  'empty',
  'extra',
  'placeholder-mismatch',
  'dynamic-key',
  'unknown-value',
];

export const DEFAULT_SEVERITY: Readonly<Record<CheckId, Severity>> = {
  missing: 'error',
  unused: 'warning',
  untranslated: 'warning',
  empty: 'error',
  extra: 'warning',
  'placeholder-mismatch': 'error',
  'dynamic-key': 'note',
  'unknown-value': 'note',
};

export type LocaleFormat = 'json' | 'laravel-php' | 'laravel-json';
export const LOCALE_FORMATS: readonly LocaleFormat[] = ['json', 'laravel-php', 'laravel-json'];

export type PlaceholderSyntax = 'laravel' | 'icu' | 'i18next';
export const PLACEHOLDER_SYNTAXES: readonly PlaceholderSyntax[] = ['laravel', 'icu', 'i18next'];

/** One entry of the `localeFiles` configuration. */
export interface LocaleFileSpec {
  format: LocaleFormat;
  /** Path pattern relative to the project root. Supports `{locale}` and `{namespace}`. */
  path: string;
}

/** A translation value defined in a locale file. */
export interface Definition {
  locale: string;
  /** Normalized key, including the namespace/group prefix. */
  key: string;
  /** The value, or `null` when it cannot be determined statically. */
  value: string | null;
  /** File path relative to the project root, always with `/` separators. */
  file: string;
  line: number;
  format: LocaleFormat;
  /** Namespace (i18next) or group (Laravel PHP) the key came from, when the layout has one. */
  namespace?: string;
  /** Path of object keys inside a JSON file; used by the fixer. */
  jsonPath?: string[];
  /** Index into the configured `localeFiles`. */
  specIndex: number;
}

/** A use of a translation key in source code. */
export interface Usage {
  /** The fully qualified key (namespace prefix applied), or the pattern for dynamic usages. */
  key: string;
  file: string;
  line: number;
  column: number;
  dynamic: boolean;
  /** Static shape of a dynamic key, using `*` as the wildcard, when one can be derived. */
  pattern?: string;
}

export interface Finding {
  id: CheckId;
  severity: Severity;
  locale: string | null;
  key: string | null;
  file: string | null;
  line: number | null;
  message: string;
}

/** Fully validated and defaulted configuration. */
export interface ResolvedConfig {
  /** Absolute project root; all patterns are relative to it. */
  root: string;
  baseLocale: string;
  /** Explicit locale list, or `null` to use every locale found on disk. */
  locales: string[] | null;
  sources: string[];
  exclude: string[];
  localeFiles: LocaleFileSpec[];
  functions: string[];
  namespaceSeparator: string;
  defaultNamespace: string;
  dynamicKeyPatterns: string[];
  untranslatedAllowlist: string[];
  severity: Readonly<Record<CheckId, Severity | 'off'>>;
  placeholderSyntax: Readonly<Record<LocaleFormat, PlaceholderSyntax[]>>;
}
