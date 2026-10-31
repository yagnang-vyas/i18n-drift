import type { PlaceholderSyntax } from './types.js';

const LARAVEL = /(?<![\p{L}\p{N}\p{M}_:]):([\p{L}_][\p{L}\p{N}\p{M}_]*)/gu;
const I18NEXT = /\{\{\s*-?\s*([^,{}\s][^,{}]*?)\s*(?:,[^{}]*)?\}\}/g;
const ICU_NAME = /^[\p{L}\p{N}_][\p{L}\p{N}\p{M}_.-]*$/u;
const ICU_BRANCHING = new Set(['plural', 'select', 'selectordinal']);

/**
 * Extracts the placeholders of a translation value as display tokens such as `:name`,
 * `{{name}}` or `{name}`. Laravel placeholders are case-insensitive because Laravel replaces
 * `:name`, `:Name` and `:NAME` from the same parameter.
 */
export function extractPlaceholders(
  value: string,
  syntaxes: readonly PlaceholderSyntax[],
): Set<string> {
  const found = new Set<string>();
  let remaining = value;

  if (syntaxes.includes('i18next')) {
    for (const match of remaining.matchAll(I18NEXT)) {
      found.add(`{{${(match[1] ?? '').trim()}}}`);
    }
    // Remove them so the ICU parser does not read `{{name}}` as a nested argument.
    remaining = remaining.replace(I18NEXT, ' ');
  }
  if (syntaxes.includes('icu')) {
    collectIcu(remaining, found);
  }
  if (syntaxes.includes('laravel')) {
    for (const match of value.matchAll(LARAVEL)) {
      found.add(`:${(match[1] ?? '').toLowerCase()}`);
    }
  }
  return found;
}

/** Finds the `}` matching the `{` at `open`, or -1. */
function matchBrace(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') {
      depth++;
    } else if (text[i] === '}' && --depth === 0) {
      return i;
    }
  }
  return -1;
}

function collectIcu(text: string, out: Set<string>): void {
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "'") {
      const next = text[i + 1];
      if (next === "'") {
        i += 2;
      } else if (next === '{' || next === '}') {
        const end = text.indexOf("'", i + 2);
        i = end < 0 ? text.length : end + 1;
      } else {
        i++;
      }
    } else if (ch === '{') {
      const end = matchBrace(text, i);
      if (end < 0) {
        return;
      }
      collectIcuArgument(text.slice(i + 1, end), out);
      i = end + 1;
    } else {
      i++;
    }
  }
}

function collectIcuArgument(inner: string, out: Set<string>): void {
  const comma = inner.indexOf(',');
  const name = (comma < 0 ? inner : inner.slice(0, comma)).trim();
  if (!ICU_NAME.test(name)) {
    return;
  }
  out.add(`{${name}}`);
  if (comma < 0) {
    return;
  }
  const rest = inner.slice(comma + 1);
  const typeEnd = rest.indexOf(',');
  if (typeEnd < 0 || !ICU_BRANCHING.has(rest.slice(0, typeEnd).trim())) {
    return;
  }
  // `one {# item} other {# items}`: placeholders can appear inside each branch.
  const branches = rest.slice(typeEnd + 1);
  for (let i = 0; i < branches.length; i++) {
    if (branches[i] === '{') {
      const end = matchBrace(branches, i);
      if (end < 0) {
        return;
      }
      collectIcu(branches.slice(i + 1, end), out);
      i = end;
    }
  }
}

/** Whether the value still contains translatable text once placeholders are removed. */
export function hasTranslatableText(
  value: string,
  syntaxes: readonly PlaceholderSyntax[],
): boolean {
  let text = value;
  if (syntaxes.includes('i18next')) {
    text = text.replace(I18NEXT, ' ');
  }
  if (syntaxes.includes('laravel')) {
    text = text.replace(LARAVEL, ' ');
  }
  if (syntaxes.includes('icu')) {
    text = text.replace(/\{[^{}]*\}/g, ' ');
  }
  return /\p{L}/u.test(text);
}
