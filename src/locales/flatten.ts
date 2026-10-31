import type { JsonNode } from './json-ast.js';

export interface FlatEntry {
  /** Object keys leading to the value (array items use their index). */
  path: string[];
  value: string | null;
  line: number;
}

/**
 * Flattens a parsed JSON document into leaf entries. Strings keep their value, numbers and
 * booleans are stringified, and `null` becomes an entry with an unknown value.
 */
export function flattenJson(node: JsonNode): FlatEntry[] {
  const out: FlatEntry[] = [];
  walk(node, [], out);
  return out;
}

function walk(node: JsonNode, path: string[], out: FlatEntry[]): void {
  switch (node.type) {
    case 'object':
      for (const entry of node.entries) {
        walk(entry.value, [...path, entry.key], out);
      }
      return;
    case 'array':
      node.items.forEach((item, index) => {
        walk(item, [...path, String(index)], out);
      });
      return;
    case 'string':
      out.push({ path, value: node.value, line: node.line });
      return;
    case 'null':
      out.push({ path, value: null, line: node.line });
      return;
    default:
      out.push({ path, value: node.raw, line: node.line });
  }
}
