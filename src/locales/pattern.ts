import { ConfigError } from '../errors.js';

export interface CompiledPattern {
  /** Glob used to list candidate files. */
  glob: string;
  /** Matches a candidate path and captures `locale` (and `namespace` when the pattern has one). */
  regex: RegExp;
  hasNamespace: boolean;
}

const TOKEN = /\{(locale|namespace)\}/g;

function escapeRegex(text: string): string {
  return text.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
}

/** Converts a path pattern containing `{locale}` and `{namespace}` into a glob and a regex. */
export function compilePattern(pattern: string, jsonPath: string): CompiledPattern {
  const leftover = pattern.replace(TOKEN, '');
  if (/[{}]/.test(leftover)) {
    throw new ConfigError(
      `${jsonPath}: only the {locale} and {namespace} placeholders are supported`,
    );
  }
  if (!pattern.includes('{locale}')) {
    throw new ConfigError(`${jsonPath}: the path must contain {locale}`);
  }
  if (pattern.split('{locale}').length > 2 || pattern.split('{namespace}').length > 2) {
    throw new ConfigError(`${jsonPath}: {locale} and {namespace} may each appear only once`);
  }

  const parts = pattern.split(TOKEN);
  let glob = '';
  let source = '^';
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i] as string;
    if (i % 2 === 1) {
      if (part === 'locale') {
        glob += '*';
        source += '(?<locale>[^/]+)';
      } else {
        glob += '**/*';
        source += '(?<namespace>.+)';
      }
      continue;
    }
    glob += part;
    source += globToRegexSource(part);
  }
  return { glob, regex: new RegExp(`${source}$`), hasNamespace: pattern.includes('{namespace}') };
}

function globToRegexSource(glob: string): string {
  let out = '';
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i] as string;
    if (ch === '*') {
      if (glob[i + 1] === '*') {
        i++;
        if (glob[i + 1] === '/') {
          i++;
          out += '(?:.+/)?';
        } else {
          out += '.*';
        }
      } else {
        out += '[^/]*';
      }
    } else {
      out += escapeRegex(ch);
    }
  }
  return out;
}

/** Replaces the placeholders of a pattern with concrete values. */
export function expandPattern(
  pattern: string,
  values: { locale: string; namespace?: string | undefined },
): string {
  return pattern
    .replace('{locale}', () => values.locale)
    .replace('{namespace}', () => values.namespace ?? '');
}
