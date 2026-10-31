import type { Node } from 'web-tree-sitter';
import { UserError } from '../errors.js';
import { resolveParts } from '../key-parts.js';
import { withTree } from '../parser.js';
import { phpStringExpression } from '../php-strings.js';
import type { Definition, Finding } from '../types.js';

export interface LaravelPhpLoadOptions {
  locale: string;
  /** Path relative to the project root. */
  file: string;
  /** The Laravel translation group, e.g. `auth` or `admin/users`. */
  group: string;
  specIndex: number;
}

export interface LaravelPhpResult {
  definitions: Definition[];
  /** Entries that could not be turned into a definition at all. */
  diagnostics: Finding[];
}

/**
 * Reads a Laravel language file such as `lang/en/auth.php` without running it. The file is parsed
 * with the tree-sitter PHP grammar and only the literal contents of its top-level
 * `return [ ... ];` array are read. Function calls, constants and variables are never evaluated:
 * such values are recorded as unknown (`null`).
 */
export async function loadLaravelPhpLocale(
  source: string,
  options: LaravelPhpLoadOptions,
): Promise<LaravelPhpResult> {
  return withTree('php', source, (tree) => {
    const root = tree.rootNode;
    const errorNode = findFirstError(root);
    if (errorNode) {
      throw new UserError(
        `${options.file}:${errorNode.startPosition.row + 1}: PHP syntax error in language file`,
      );
    }
    const array = findReturnedArray(root);
    if (!array) {
      throw new UserError(
        `${options.file}: expected a top-level "return [ ... ];" statement returning an array`,
      );
    }
    const result: LaravelPhpResult = { definitions: [], diagnostics: [] };
    readArray(array, [], options, result);
    return result;
  });
}

function findFirstError(node: Node): Node | null {
  if (!node.hasError) {
    return null;
  }
  if (node.isError || node.isMissing) {
    return node;
  }
  for (const child of node.children) {
    const found = child ? findFirstError(child) : null;
    if (found) {
      return found;
    }
  }
  // The error is attached to this node itself (for example an unexpected token between children).
  return node;
}

function unwrap(node: Node): Node {
  let current = node;
  while (current.type === 'parenthesized_expression') {
    const inner = current.namedChildren.find((child) => child && child.type !== 'comment');
    if (!inner) {
      break;
    }
    current = inner;
  }
  return current;
}

function findReturnedArray(program: Node): Node | null {
  for (const statement of program.namedChildren) {
    if (statement?.type !== 'return_statement') {
      continue;
    }
    const expression = statement.namedChildren.find((child) => child && child.type !== 'comment');
    const candidate = expression ? unwrap(expression) : null;
    if (candidate?.type === 'array_creation_expression') {
      return candidate;
    }
  }
  return null;
}

function literalString(node: Node): string | null {
  const parts = phpStringExpression(unwrap(node));
  if (!parts) {
    return null;
  }
  const resolved = resolveParts(parts);
  return resolved.dynamic ? null : resolved.key;
}

function scalarValue(node: Node): string | null {
  const target = unwrap(node);
  if (target.type === 'integer' || target.type === 'float') {
    return target.text;
  }
  return literalString(target);
}

function readArray(
  array: Node,
  path: string[],
  options: LaravelPhpLoadOptions,
  result: LaravelPhpResult,
): void {
  let nextIndex = 0;
  for (const element of array.namedChildren) {
    if (element?.type !== 'array_element_initializer') {
      continue;
    }
    const operands = element.namedChildren.filter(
      (child) => child && child.type !== 'comment',
    ) as Node[];
    const line = element.startPosition.row + 1;
    const first = operands[0];
    const valueNode = operands.length >= 2 ? operands[1] : first;
    if (!first || !valueNode || first.type === 'variadic_unpacking') {
      result.diagnostics.push(skipped(options, line, 'spread entries are not supported'));
      continue;
    }

    let segment: string;
    if (operands.length >= 2) {
      const keyNode = unwrap(first);
      const keyText = keyNode.type === 'integer' ? keyNode.text : literalString(keyNode);
      if (keyText === null) {
        result.diagnostics.push(
          skipped(options, line, 'array key is not a string or integer literal'),
        );
        continue;
      }
      segment = keyText;
      if (/^\d+$/.test(keyText)) {
        nextIndex = Math.max(nextIndex, Number(keyText) + 1);
      }
    } else {
      segment = String(nextIndex++);
    }

    const target = unwrap(valueNode);
    const keyLine = first.startPosition.row + 1;
    if (target.type === 'array_creation_expression') {
      readArray(target, [...path, segment], options, result);
      continue;
    }
    const entryPath = [...path, segment];
    result.definitions.push({
      locale: options.locale,
      key: `${options.group}.${entryPath.join('.')}`,
      value: scalarValue(target),
      file: options.file,
      line: keyLine,
      format: 'laravel-php',
      namespace: options.group,
      specIndex: options.specIndex,
    });
  }
}

function skipped(options: LaravelPhpLoadOptions, line: number, reason: string): Finding {
  return {
    id: 'unknown-value',
    severity: 'note',
    locale: options.locale,
    key: null,
    file: options.file,
    line,
    message: `entry skipped: ${reason}`,
  };
}
