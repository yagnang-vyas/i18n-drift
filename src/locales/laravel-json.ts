import { loadJsonLocale } from './json.js';
import type { Definition } from '../types.js';

export interface LaravelJsonLoadOptions {
  locale: string;
  file: string;
  specIndex: number;
}

/**
 * Parses `lang/{locale}.json`. Laravel looks these keys up verbatim (usually full English
 * sentences), so a top-level key is never split or prefixed. Nested objects are not a Laravel
 * feature; if present they are flattened with `.` like any other JSON file.
 */
export function loadLaravelJsonLocale(text: string, options: LaravelJsonLoadOptions): Definition[] {
  return loadJsonLocale(text, { ...options, format: 'laravel-json', namespaceSeparator: ':' });
}
