import { UserError } from '../errors.js';
import { flattenJson } from './flatten.js';
import { JsonSyntaxError, parseJsonAst } from './json-ast.js';
import type { Definition, LocaleFormat } from '../types.js';

export interface JsonLoadOptions {
  locale: string;
  /** Path relative to the project root. */
  file: string;
  format: Extract<LocaleFormat, 'json' | 'laravel-json'>;
  specIndex: number;
  /** Namespace of the file, when the layout has one. */
  namespace?: string | undefined;
  namespaceSeparator: string;
}

/**
 * Parses a JSON locale file (nested or flat) into definitions. Nested objects are joined with
 * `.`; with a namespace the key is prefixed with `namespace` and the namespace separator.
 */
export function loadJsonLocale(text: string, options: JsonLoadOptions): Definition[] {
  let root;
  try {
    root = parseJsonAst(text);
  } catch (error) {
    if (error instanceof JsonSyntaxError) {
      throw new UserError(
        `${options.file}:${error.line}:${error.column}: invalid JSON: ${error.message}`,
      );
    }
    throw error;
  }
  if (root.type !== 'object') {
    throw new UserError(`${options.file}:1: expected a JSON object at the top level`);
  }

  const prefix =
    options.namespace === undefined ? '' : `${options.namespace}${options.namespaceSeparator}`;
  return flattenJson(root).map((entry) => {
    const definition: Definition = {
      locale: options.locale,
      key: prefix + entry.path.join('.'),
      value: entry.value,
      file: options.file,
      line: entry.line,
      format: options.format,
      jsonPath: entry.path,
      specIndex: options.specIndex,
    };
    if (options.namespace !== undefined) {
      definition.namespace = options.namespace;
    }
    return definition;
  });
}
