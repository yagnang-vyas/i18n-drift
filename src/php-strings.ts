import type { Node } from 'web-tree-sitter';
import { DYNAMIC_PART, concatParts } from './key-parts.js';
import type { KeyPart } from './key-parts.js';

const SIMPLE_ESCAPES: Readonly<Record<string, string>> = {
  n: '\n',
  t: '\t',
  r: '\r',
  v: '\v',
  e: '\x1b',
  f: '\f',
  '\\': '\\',
  $: '$',
  '"': '"',
};

/** Decodes one escape sequence found inside a PHP string literal. */
export function decodePhpEscape(raw: string, quote: "'" | '"'): string {
  if (quote === "'") {
    return raw === "\\'" || raw === '\\\\' ? raw.slice(1) : raw;
  }
  const body = raw.slice(1);
  const simple = SIMPLE_ESCAPES[body];
  if (simple !== undefined) {
    return simple;
  }
  if (/^[0-7]{1,3}$/.test(body)) {
    return String.fromCharCode(parseInt(body, 8) & 0xff);
  }
  const hex = /^x([0-9a-fA-F]{1,2})$/.exec(body);
  if (hex?.[1]) {
    return String.fromCharCode(parseInt(hex[1], 16));
  }
  const unicode = /^u\{([0-9a-fA-F]+)\}$/.exec(body);
  if (unicode?.[1]) {
    const codePoint = parseInt(unicode[1], 16);
    return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : raw;
  }
  return raw;
}

/** Splits a quoted PHP string into literal text and interpolated (dynamic) parts. */
function stringParts(node: Node): KeyPart[] {
  const quote = node.type === 'string' ? "'" : '"';
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
    if (child.type === 'string_content') {
      text += child.text;
    } else if (child.type === 'escape_sequence') {
      text += decodePhpEscape(child.text, quote);
    } else if (child.type !== quote) {
      flush();
      parts.push(DYNAMIC_PART);
    }
  }
  flush();
  return parts;
}

/**
 * Evaluates a PHP expression made of string literals, interpolated strings and `.`
 * concatenation. Returns `null` when the expression is not a string expression at all.
 * Anything not known at parse time becomes a dynamic part.
 */
export function phpStringExpression(node: Node): KeyPart[] | null {
  switch (node.type) {
    case 'string':
    case 'encapsed_string':
      return stringParts(node);
    case 'parenthesized_expression': {
      const inner = node.namedChildren.find((child) => child?.type !== 'comment');
      return inner ? phpStringExpression(inner) : null;
    }
    case 'binary_expression': {
      if (node.childForFieldName('operator')?.text !== '.') {
        return null;
      }
      const left = node.childForFieldName('left');
      const right = node.childForFieldName('right');
      const leftParts = left ? (phpStringExpression(left) ?? [DYNAMIC_PART]) : [DYNAMIC_PART];
      const rightParts = right ? (phpStringExpression(right) ?? [DYNAMIC_PART]) : [DYNAMIC_PART];
      return concatParts(leftParts, rightParts);
    }
    default:
      return null;
  }
}
