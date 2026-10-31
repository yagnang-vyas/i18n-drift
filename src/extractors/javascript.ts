import type { Node } from 'web-tree-sitter';
import { DYNAMIC_PART, concatParts, resolveParts } from '../key-parts.js';
import type { KeyPart } from '../key-parts.js';
import { withTree } from '../parser.js';
import type { GrammarName } from '../parser.js';
import type { Usage } from '../types.js';

export interface JsExtractOptions {
  /** Function names treated as translation functions, e.g. `t`, `$t`, `i18n.t`. */
  functions: readonly string[];
  namespaceSeparator: string;
}

const FUNCTION_SCOPES = new Set([
  'function_declaration',
  'function_expression',
  'function',
  'generator_function',
  'generator_function_declaration',
  'arrow_function',
  'method_definition',
]);

const JS_ESCAPES: Readonly<Record<string, string>> = {
  n: '\n',
  t: '\t',
  r: '\r',
  b: '\b',
  f: '\f',
  v: '\v',
  '0': '\0',
};

function grammarFor(file: string): GrammarName {
  if (/\.tsx$/i.test(file)) {
    return 'tsx';
  }
  if (/\.(ts|mts|cts)$/i.test(file)) {
    return 'typescript';
  }
  return 'javascript';
}

function decodeJsEscape(raw: string): string {
  const body = raw.slice(1);
  const simple = JS_ESCAPES[body];
  if (simple !== undefined) {
    return simple;
  }
  const hex = /^(?:x([0-9a-fA-F]{2})|u([0-9a-fA-F]{4}))$/.exec(body);
  const digits = hex?.[1] ?? hex?.[2];
  if (digits) {
    return String.fromCharCode(parseInt(digits, 16));
  }
  const braced = /^u\{([0-9a-fA-F]+)\}$/.exec(body);
  if (braced?.[1]) {
    const codePoint = parseInt(braced[1], 16);
    return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : raw;
  }
  if (body === '\n' || body === '\r\n') {
    return ''; // line continuation
  }
  return body.length === 1 ? body : raw;
}

function literalParts(node: Node, templateLiteral: boolean): KeyPart[] {
  const parts: KeyPart[] = [];
  let text = '';
  const flush = (): void => {
    if (text !== '') {
      parts.push({ literal: text });
      text = '';
    }
  };
  for (const child of node.children) {
    if (!child) {
      continue;
    }
    if (child.type === 'string_fragment') {
      text += child.text;
    } else if (child.type === 'escape_sequence') {
      text += decodeJsEscape(child.text);
    } else if (templateLiteral && child.type === 'template_substitution') {
      flush();
      parts.push(DYNAMIC_PART);
    }
  }
  flush();
  return parts;
}

/** Wrappers that do not change the runtime value of an expression. */
const TRANSPARENT = new Set([
  'parenthesized_expression',
  'as_expression',
  'satisfies_expression',
  'non_null_expression',
  'type_assertion',
]);

/**
 * Resolves the first argument of a translation call into one or more key shapes. A conditional
 * expression with resolvable branches yields one shape per branch.
 */
function keyShapes(node: Node): KeyPart[][] {
  switch (node.type) {
    case 'string':
      return [literalParts(node, false)];
    case 'template_string':
      return [literalParts(node, true)];
    case 'binary_expression': {
      if (node.childForFieldName('operator')?.text !== '+') {
        return [[DYNAMIC_PART]];
      }
      const left = node.childForFieldName('left');
      const right = node.childForFieldName('right');
      const leftShapes = left ? keyShapes(left) : [[DYNAMIC_PART]];
      const rightShapes = right ? keyShapes(right) : [[DYNAMIC_PART]];
      return leftShapes.flatMap((l) => rightShapes.map((r) => concatParts(l, r)));
    }
    case 'ternary_expression': {
      const branches = [
        node.childForFieldName('consequence'),
        node.childForFieldName('alternative'),
      ];
      return branches.flatMap((branch) => (branch ? keyShapes(branch) : [[DYNAMIC_PART]]));
    }
    default: {
      if (TRANSPARENT.has(node.type)) {
        const inner = node.namedChildren.find((child) => child && child.type !== 'comment');
        if (inner) {
          return keyShapes(inner);
        }
      }
      return [[DYNAMIC_PART]];
    }
  }
}

/** Returns the static text of a string-like node (used for namespaces), or `undefined`. */
function staticString(node: Node | null | undefined): string | undefined {
  if (!node) {
    return undefined;
  }
  const target = TRANSPARENT.has(node.type)
    ? (node.namedChildren.find((child) => child && child.type !== 'comment') ?? node)
    : node;
  if (target.type !== 'string' && target.type !== 'template_string') {
    return undefined;
  }
  const resolved = resolveParts(literalParts(target, target.type === 'template_string'));
  return resolved.dynamic ? undefined : resolved.key;
}

/** First namespace of `'ns'` or `['ns', 'other']`. */
function namespaceFromValue(node: Node | null | undefined): string | undefined {
  if (node?.type === 'array') {
    return staticString(node.namedChildren.find((child) => child && child.type !== 'comment'));
  }
  return staticString(node);
}

function calleeName(callee: Node): string {
  return callee.text.replace(/\s+/g, '').replace(/\?\./g, '.');
}

interface Scope {
  namespace?: string;
  aliases: Set<string>;
}

function enclosingScope(node: Node): Node | null {
  for (let current = node.parent; current; current = current.parent) {
    if (FUNCTION_SCOPES.has(current.type)) {
      return current;
    }
  }
  return null;
}

/** Aliases for `t` introduced by destructuring a `useTranslation()` call. */
function destructuredAliases(call: Node): string[] {
  const declarator = call.parent;
  if (declarator?.type !== 'variable_declarator') {
    return [];
  }
  const pattern = declarator.childForFieldName('name');
  const aliases: string[] = [];
  if (pattern?.type === 'object_pattern') {
    for (const entry of pattern.namedChildren) {
      if (entry?.type === 'shorthand_property_identifier_pattern' && entry.text === 't') {
        aliases.push('t');
      } else if (entry?.type === 'pair_pattern') {
        const key = entry.childForFieldName('key');
        const value = entry.childForFieldName('value');
        if (key?.text === 't' && value?.type === 'identifier') {
          aliases.push(value.text);
        }
      }
    }
  } else if (pattern?.type === 'array_pattern') {
    const first = pattern.namedChildren[0];
    if (first?.type === 'identifier') {
      aliases.push(first.text);
    }
  }
  return aliases;
}

function jsxAttribute(element: Node, name: string): Node | undefined {
  for (const child of element.namedChildren) {
    if (child?.type === 'jsx_attribute' && child.namedChildren[0]?.text === name) {
      return child.namedChildren[1] ?? undefined;
    }
  }
  return undefined;
}

function jsxAttributeExpression(value: Node | undefined): Node | undefined {
  if (value?.type === 'jsx_expression') {
    return value.namedChildren.find((child) => child && child.type !== 'comment') ?? undefined;
  }
  return value;
}

/** Extracts translation key usages from a JavaScript, TypeScript, JSX or TSX file. */
export async function extractJsUsages(
  source: string,
  file: string,
  options: JsExtractOptions,
): Promise<Usage[]> {
  const functions = new Set(options.functions);
  const separator = options.namespaceSeparator;

  return withTree(grammarFor(file), source, (tree) => {
    const nodes: Node[] = [];
    const stack: Node[] = [tree.rootNode];
    while (stack.length > 0) {
      const node = stack.pop() as Node;
      nodes.push(node);
      for (let i = node.childCount - 1; i >= 0; i--) {
        const child = node.child(i);
        if (child) {
          stack.push(child);
        }
      }
    }

    // Pass 1: `useTranslation('ns')` binds a default namespace (and `t` aliases) to a scope.
    const scopes = new Map<number, Scope>();
    const scopeKey = (node: Node): number => enclosingScope(node)?.id ?? -1;
    for (const node of nodes) {
      if (
        node.type !== 'call_expression' ||
        node.childForFieldName('function')?.text !== 'useTranslation'
      ) {
        continue;
      }
      const key = scopeKey(node);
      const scope = scopes.get(key) ?? { aliases: new Set<string>() };
      const first = node.childForFieldName('arguments')?.namedChildren[0];
      const namespace = namespaceFromValue(first);
      if (namespace !== undefined) {
        scope.namespace = namespace;
      }
      for (const alias of destructuredAliases(node)) {
        scope.aliases.add(alias);
      }
      scopes.set(key, scope);
    }

    // Walks outwards through the enclosing functions looking for the first scope with a value.
    const lookup = <T>(node: Node, pick: (scope: Scope) => T | undefined): T | undefined => {
      let current = enclosingScope(node);
      for (;;) {
        const found = scopes.get(current?.id ?? -1);
        const value = found ? pick(found) : undefined;
        if (value !== undefined) {
          return value;
        }
        if (!current) {
          return undefined;
        }
        current = enclosingScope(current);
      }
    };

    // Pass 2: collect usages.
    const usages: Usage[] = [];
    const emit = (shapes: KeyPart[][], at: Node, namespace: string | undefined): void => {
      for (const parts of shapes) {
        const resolved = resolveParts(parts);
        const base = {
          file,
          line: at.startPosition.row + 1,
          column: at.startPosition.column + 1,
        };
        if (!resolved.dynamic) {
          usages.push({
            ...base,
            key: qualify(resolved.key, namespace, separator),
            dynamic: false,
          });
        } else if (resolved.pattern !== undefined) {
          const pattern = resolved.pattern.startsWith('*')
            ? resolved.pattern
            : qualify(resolved.pattern, namespace, separator);
          usages.push({ ...base, key: pattern, dynamic: true, pattern });
        } else {
          usages.push({ ...base, key: '', dynamic: true });
        }
      }
    };

    for (const node of nodes) {
      if (node.type === 'call_expression') {
        const callee = node.childForFieldName('function');
        if (!callee) {
          continue;
        }
        const name = calleeName(callee);
        const bare = callee.type === 'identifier';
        const isAlias =
          bare && lookup(node, (scope) => (scope.aliases.has(name) ? true : undefined));
        if (!functions.has(name) && !isAlias) {
          continue;
        }
        const args = node.childForFieldName('arguments');
        const first = args?.namedChildren.find((child) => child && child.type !== 'comment');
        if (!args || !first) {
          continue;
        }
        const second = args.namedChildren.filter((child) => child && child.type !== 'comment')[1];
        const optionNamespace = second ? namespaceOption(second) : undefined;
        // A namespace only applies to the function the hook returned: `t`, or its destructured alias.
        const defaultNamespace = bare
          ? lookup(node, (scope) =>
              scope.aliases.size === 0 || scope.aliases.has(name) ? scope.namespace : undefined,
            )
          : undefined;
        emit(
          first.type === 'spread_element' ? [[DYNAMIC_PART]] : keyShapes(first),
          first,
          optionNamespace ?? defaultNamespace,
        );
      } else if (node.type === 'jsx_opening_element' || node.type === 'jsx_self_closing_element') {
        if (node.childForFieldName('name')?.text !== 'Trans') {
          continue;
        }
        const keyValue = jsxAttributeExpression(jsxAttribute(node, 'i18nKey'));
        if (!keyValue) {
          continue;
        }
        const nsValue = jsxAttributeExpression(jsxAttribute(node, 'ns'));
        const namespace = namespaceFromValue(nsValue) ?? lookup(node, (scope) => scope.namespace);
        emit(keyShapes(keyValue), keyValue, namespace);
      }
    }
    return usages.sort((a, b) => a.line - b.line || a.column - b.column);
  });
}

/** Reads `ns` from an options object such as `{ ns: 'common', count: 2 }`. */
function namespaceOption(options: Node): string | undefined {
  if (options.type !== 'object') {
    return undefined;
  }
  for (const pair of options.namedChildren) {
    if (pair?.type !== 'pair') {
      continue;
    }
    const key = pair.childForFieldName('key');
    const keyText = key?.type === 'string' ? staticString(key) : key?.text;
    if (keyText === 'ns') {
      return namespaceFromValue(pair.childForFieldName('value'));
    }
  }
  return undefined;
}

/** Applies a namespace unless the key already carries one. */
function qualify(key: string, namespace: string | undefined, separator: string): string {
  return namespace === undefined || key.includes(separator)
    ? key
    : `${namespace}${separator}${key}`;
}
