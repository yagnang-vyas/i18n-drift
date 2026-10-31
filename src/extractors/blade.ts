import { LineIndex } from '../line-index.js';
import { callsToUsages, findPhpCalls } from './php.js';
import type { PhpCall } from './php.js';
import type { Usage } from '../types.js';

/**
 * A fragment of PHP found inside a Blade template. `code` is wrapped as
 * `<?php {prefix}{code}{suffix}` before parsing, so offsets inside the parsed source can be mapped
 * back to the template with `start - prefix.length`.
 */
interface Chunk {
  /** Offset of `code` in the template. */
  start: number;
  code: string;
  prefix: string;
  suffix: string;
}

const OPEN_TAG = '<?php ';

/** Replaces `{{-- comments --}}` and `@verbatim` blocks with spaces, keeping offsets and newlines. */
function blankIgnored(source: string): string {
  const blank = (match: string): string => match.replace(/[^\n]/g, ' ');
  return source
    .replace(/\{\{--[\s\S]*?--\}\}/g, blank)
    .replace(/@verbatim\b[\s\S]*?@endverbatim\b/g, blank);
}

/** Finds `closer` outside of PHP string literals, starting at `from`. Returns -1 if absent. */
function findClosing(source: string, from: number, closer: string): number {
  let quote: string | null = null;
  for (let i = from; i < source.length; i++) {
    const ch = source[i] as string;
    if (quote) {
      if (ch === '\\') {
        i++;
      } else if (ch === quote) {
        quote = null;
      }
    } else if (ch === "'" || ch === '"') {
      quote = ch;
    } else if (source.startsWith(closer, i)) {
      return i;
    }
  }
  return -1;
}

/** Finds the `)` matching the `(` at `open`, outside of string literals. Returns -1 if absent. */
function findClosingParen(source: string, open: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = open; i < source.length; i++) {
    const ch = source[i] as string;
    if (quote) {
      if (ch === '\\') {
        i++;
      } else if (ch === quote) {
        quote = null;
      }
    } else if (ch === "'" || ch === '"') {
      quote = ch;
    } else if (ch === '(') {
      depth++;
    } else if (ch === ')' && --depth === 0) {
      return i;
    }
  }
  return -1;
}

const WORD = /\w/;

/** Splits a template into the PHP fragments it contains. */
function collectChunks(source: string): Chunk[] {
  const chunks: Chunk[] = [];
  const phpChunk = (start: number, code: string): void => {
    chunks.push({ start, code, prefix: OPEN_TAG, suffix: ';' });
  };

  let i = 0;
  while (i < source.length) {
    const ch = source[i] as string;

    if (ch === '@' && source[i + 1] === '{' && source[i + 2] === '{') {
      i += 3; // `@{{ ... }}` is output verbatim for JavaScript frameworks
      continue;
    }
    if (ch === '{' && source[i + 1] === '{') {
      const open = source.startsWith('{{{', i) ? 3 : 2;
      const end = findClosing(source, i + open, open === 3 ? '}}}' : '}}');
      if (end < 0) {
        i += open;
        continue;
      }
      phpChunk(i + open, source.slice(i + open, end));
      i = end + open;
      continue;
    }
    if (ch === '{' && source.startsWith('{!!', i)) {
      const end = findClosing(source, i + 3, '!!}');
      if (end < 0) {
        i += 3;
        continue;
      }
      phpChunk(i + 3, source.slice(i + 3, end));
      i = end + 3;
      continue;
    }
    if (ch === '<' && source[i + 1] === '?') {
      const tag = source.startsWith('<?php', i) ? 5 : source.startsWith('<?=', i) ? 3 : 2;
      const end = source.indexOf('?>', i + tag);
      const stop = end < 0 ? source.length : end;
      phpChunk(i + tag, source.slice(i + tag, stop));
      i = end < 0 ? source.length : end + 2;
      continue;
    }
    if (ch === '<' && (source.startsWith('<x-', i) || source.startsWith('<livewire:', i))) {
      collectComponentAttributes(source, i, chunks);
      i += 2;
      continue;
    }
    if (ch === '@') {
      if (source[i + 1] === '@') {
        i += 2; // `@@directive` is an escaped directive
        continue;
      }
      const previous = source[i - 1];
      const name = /^\w+/.exec(source.slice(i + 1, i + 40))?.[0];
      if (!name || (previous !== undefined && WORD.test(previous))) {
        i++;
        continue;
      }
      i = collectDirective(source, i, name, chunks);
      continue;
    }
    i++;
  }
  return chunks;
}

/** Handles `@name(...)`, `@php ... @endphp` and returns the offset to continue scanning from. */
function collectDirective(source: string, at: number, name: string, chunks: Chunk[]): number {
  const afterName = at + 1 + name.length;
  let cursor = afterName;
  while (source[cursor] === ' ' || source[cursor] === '\t') {
    cursor++;
  }
  const hasArgs = source[cursor] === '(';

  if (name === 'php' && !hasArgs) {
    const end = /@endphp\b/g;
    end.lastIndex = afterName;
    const match = end.exec(source);
    const stop = match ? match.index : source.length;
    chunks.push({
      start: afterName,
      code: source.slice(afterName, stop),
      prefix: OPEN_TAG,
      suffix: '',
    });
    return match ? stop + '@endphp'.length : source.length;
  }
  if (!hasArgs) {
    return afterName;
  }
  const close = findClosingParen(source, cursor);
  if (close < 0) {
    return afterName;
  }
  const args = source.slice(cursor + 1, close);
  if (name === 'php') {
    chunks.push({ start: cursor + 1, code: args, prefix: OPEN_TAG, suffix: ';' });
  } else if (name === 'lang' || name === 'choice') {
    chunks.push({ start: cursor + 1, code: args, prefix: `${OPEN_TAG}__(`, suffix: ');' });
  } else {
    // Any other directive may contain translation calls in its expression, e.g. @if(__('x')).
    chunks.push({ start: cursor + 1, code: args, prefix: `${OPEN_TAG}f(`, suffix: ');' });
  }
  return close + 1;
}

/** Collects PHP from bound attributes such as `<x-button :label="__('Save')" />`. */
function collectComponentAttributes(source: string, tagStart: number, chunks: Chunk[]): void {
  let quote: string | null = null;
  let end = tagStart;
  for (; end < source.length; end++) {
    const ch = source[end] as string;
    if (quote) {
      if (ch === quote) {
        quote = null;
      }
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '>' && source[end - 1] !== '=') {
      break;
    }
  }
  const tag = source.slice(tagStart, end);
  const attribute = /\s:[\w.:-]+=(?:"([^"]*)"|'([^']*)')/g;
  for (let match = attribute.exec(tag); match; match = attribute.exec(tag)) {
    const value = match[1] ?? match[2] ?? '';
    const valueStart = tagStart + match.index + match[0].length - value.length - 1;
    chunks.push({ start: valueStart, code: value, prefix: OPEN_TAG, suffix: ';' });
  }
}

/**
 * Extracts translation key usages from a Blade template: `{{ __() }}`, `{!! __() !!}`,
 * `@lang()`, `@choice()`, `@php` blocks, `<?php ?>` blocks, directive expressions and bound
 * component attributes. Positions refer to the template itself.
 */
export async function extractBladeUsages(source: string, file: string): Promise<Usage[]> {
  const template = blankIgnored(source);
  const lines = new LineIndex(source);
  const usages: Usage[] = [];

  for (const chunk of collectChunks(template)) {
    const synthetic = chunk.prefix + chunk.code + chunk.suffix;
    if (!/__|trans|Lang|lang|choice/.test(synthetic)) {
      continue; // nothing in this fragment can be a translation call
    }
    const calls: PhpCall[] = await findPhpCalls(synthetic);
    usages.push(
      ...callsToUsages(calls, file, (index) =>
        lines.position(chunk.start + index - chunk.prefix.length),
      ),
    );
  }
  return usages.sort((a, b) => a.line - b.line || a.column - b.column);
}
