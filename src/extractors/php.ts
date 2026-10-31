import type { Node } from 'web-tree-sitter';
import { DYNAMIC_PART, resolveParts } from '../key-parts.js';
import type { KeyPart } from '../key-parts.js';
import { LineIndex } from '../line-index.js';
import { withTree } from '../parser.js';
import { phpStringExpression } from '../php-strings.js';
import type { Usage } from '../types.js';

/** A call to a translation function found in PHP code. */
export interface PhpCall {
  /** Offset of the key argument within the parsed source. */
  index: number;
  parts: KeyPart[];
}

const GLOBAL_FUNCTIONS = new Set(['__', 'trans', 'trans_choice']);
const FACADE_METHODS = new Set(['get', 'choice']);

function lastSegment(name: string): string {
  return name.slice(name.lastIndexOf('\\') + 1);
}

/** Returns the argument node holding the key for a call, or `undefined` if there is none. */
function keyArgument(args: Node | null): Node | undefined {
  if (!args) {
    return undefined;
  }
  const list = args.namedChildren.filter((child): child is Node => child?.type === 'argument');
  const first = list[0];
  if (!first) {
    // A spread (`__(...$args)`) or other unusual argument: the key is not known statically.
    return args.namedChildren.find((child) => child && child.type !== 'comment') ?? undefined;
  }
  const label = first.childForFieldName('name');
  if (label && label.text !== 'key') {
    return list.find((arg) => arg.childForFieldName('name')?.text === 'key');
  }
  return first;
}

function argumentValue(arg: Node): Node {
  const named = arg.namedChildren.filter(
    (child): child is Node => !!child && child.type !== 'comment',
  );
  return named[named.length - 1] ?? arg;
}

function isTranslationCall(node: Node): boolean {
  if (node.type === 'function_call_expression') {
    const fn = node.childForFieldName('function');
    return !!fn && GLOBAL_FUNCTIONS.has(lastSegment(fn.text));
  }
  if (node.type === 'scoped_call_expression') {
    const scope = node.childForFieldName('scope');
    const name = node.childForFieldName('name');
    return !!scope && !!name && lastSegment(scope.text) === 'Lang' && FACADE_METHODS.has(name.text);
  }
  return false;
}

/** Finds every translation call in a PHP source string, in document order. */
export async function findPhpCalls(source: string): Promise<PhpCall[]> {
  return withTree('php', source, (tree) => {
    const calls: PhpCall[] = [];
    const stack: Node[] = [tree.rootNode];
    while (stack.length > 0) {
      const node = stack.pop() as Node;
      if (isTranslationCall(node)) {
        const arg = keyArgument(node.childForFieldName('arguments'));
        if (arg) {
          const value = arg.type === 'argument' ? argumentValue(arg) : arg;
          calls.push({
            index: value.startIndex,
            parts: phpStringExpression(value) ?? [DYNAMIC_PART],
          });
        }
      }
      for (let i = node.childCount - 1; i >= 0; i--) {
        const child = node.child(i);
        if (child) {
          stack.push(child);
        }
      }
    }
    return calls.sort((a, b) => a.index - b.index);
  });
}

/** Converts calls into usages for `file`, mapping offsets through `positionOf`. */
export function callsToUsages(
  calls: readonly PhpCall[],
  file: string,
  positionOf: (index: number) => { line: number; column: number },
): Usage[] {
  return calls.map((call) => {
    const { line, column } = positionOf(call.index);
    const resolved = resolveParts(call.parts);
    if (!resolved.dynamic) {
      return { key: resolved.key, file, line, column, dynamic: false };
    }
    const usage: Usage = { key: resolved.pattern ?? '', file, line, column, dynamic: true };
    if (resolved.pattern !== undefined) {
      usage.pattern = resolved.pattern;
    }
    return usage;
  });
}

/** Extracts translation key usages from a PHP file (`__()`, `trans()`, `Lang::get()`, ...). */
export async function extractPhpUsages(source: string, file: string): Promise<Usage[]> {
  const lines = new LineIndex(source);
  return callsToUsages(await findPhpCalls(source), file, (index) => lines.position(index));
}
