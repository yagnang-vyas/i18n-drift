/**
 * A small JSON parser that keeps source positions. Locale files need line numbers for every key
 * and the fixer needs exact offsets so it can insert keys without reformatting the file.
 */

interface NodeBase {
  /** Offset of the first character of the value. */
  start: number;
  /** Offset just past the last character of the value. */
  end: number;
  /** 1-based line of the first character of the value. */
  line: number;
}

export interface JsonEntry {
  key: string;
  /** 1-based line of the key. */
  line: number;
  value: JsonNode;
}

export interface JsonObject extends NodeBase {
  type: 'object';
  entries: JsonEntry[];
}

export interface JsonArray extends NodeBase {
  type: 'array';
  items: JsonNode[];
}

export interface JsonString extends NodeBase {
  type: 'string';
  value: string;
}

export interface JsonScalar extends NodeBase {
  type: 'number' | 'boolean' | 'null';
  raw: string;
}

export type JsonNode = JsonObject | JsonArray | JsonString | JsonScalar;

export class JsonSyntaxError extends Error {
  override name = 'JsonSyntaxError';
  constructor(
    message: string,
    readonly line: number,
    readonly column: number,
  ) {
    super(message);
  }
}

const NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
const ESCAPES: Readonly<Record<string, string>> = {
  '"': '"',
  '\\': '\\',
  '/': '/',
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
};

class Parser {
  private pos = 0;
  private line = 1;
  private lineStart = 0;

  constructor(private readonly text: string) {}

  parseDocument(): JsonNode {
    if (this.text.charCodeAt(0) === 0xfeff) {
      this.pos = 1;
      this.lineStart = 1;
    }
    this.skipWhitespace();
    if (this.pos >= this.text.length) {
      this.fail('unexpected end of file, expected a JSON value');
    }
    const value = this.parseValue();
    this.skipWhitespace();
    if (this.pos < this.text.length) {
      this.fail(`unexpected ${this.describeCurrent()} after the JSON value`);
    }
    return value;
  }

  private fail(message: string): never {
    throw new JsonSyntaxError(message, this.line, this.pos - this.lineStart + 1);
  }

  private describeCurrent(): string {
    return this.pos >= this.text.length
      ? 'end of file'
      : `character ${JSON.stringify(this.text[this.pos])}`;
  }

  private skipWhitespace(): void {
    while (this.pos < this.text.length) {
      const ch = this.text[this.pos];
      if (ch === '\n') {
        this.pos++;
        this.line++;
        this.lineStart = this.pos;
      } else if (ch === ' ' || ch === '\t' || ch === '\r') {
        this.pos++;
      } else {
        return;
      }
    }
  }

  private parseValue(): JsonNode {
    const ch = this.text[this.pos];
    switch (ch) {
      case '{':
        return this.parseObject();
      case '[':
        return this.parseArray();
      case '"':
        return this.parseStringNode();
      default:
        return this.parseLiteral();
    }
  }

  private parseObject(): JsonObject {
    const start = this.pos;
    const line = this.line;
    const entries: JsonEntry[] = [];
    this.pos++;
    this.skipWhitespace();
    if (this.text[this.pos] === '}') {
      this.pos++;
      return { type: 'object', start, end: this.pos, line, entries };
    }
    for (;;) {
      this.skipWhitespace();
      if (this.text[this.pos] !== '"') {
        this.fail(`expected a string key but found ${this.describeCurrent()}`);
      }
      const keyLine = this.line;
      const key = this.parseString();
      this.skipWhitespace();
      if (this.text[this.pos] !== ':') {
        this.fail(
          `expected ":" after key ${JSON.stringify(key)} but found ${this.describeCurrent()}`,
        );
      }
      this.pos++;
      this.skipWhitespace();
      if (this.pos >= this.text.length) {
        this.fail('unexpected end of file, expected a JSON value');
      }
      entries.push({ key, line: keyLine, value: this.parseValue() });
      this.skipWhitespace();
      const next = this.text[this.pos];
      if (next === ',') {
        this.pos++;
        continue;
      }
      if (next === '}') {
        this.pos++;
        return { type: 'object', start, end: this.pos, line, entries };
      }
      this.fail(`expected "," or "}" but found ${this.describeCurrent()}`);
    }
  }

  private parseArray(): JsonArray {
    const start = this.pos;
    const line = this.line;
    const items: JsonNode[] = [];
    this.pos++;
    this.skipWhitespace();
    if (this.text[this.pos] === ']') {
      this.pos++;
      return { type: 'array', start, end: this.pos, line, items };
    }
    for (;;) {
      this.skipWhitespace();
      if (this.pos >= this.text.length) {
        this.fail('unexpected end of file, expected a JSON value');
      }
      items.push(this.parseValue());
      this.skipWhitespace();
      const next = this.text[this.pos];
      if (next === ',') {
        this.pos++;
        continue;
      }
      if (next === ']') {
        this.pos++;
        return { type: 'array', start, end: this.pos, line, items };
      }
      this.fail(`expected "," or "]" but found ${this.describeCurrent()}`);
    }
  }

  private parseStringNode(): JsonString {
    const start = this.pos;
    const line = this.line;
    const value = this.parseString();
    return { type: 'string', start, end: this.pos, line, value };
  }

  private parseString(): string {
    this.pos++; // opening quote
    let out = '';
    for (;;) {
      if (this.pos >= this.text.length) {
        this.fail('unterminated string');
      }
      const ch = this.text[this.pos] as string;
      if (ch === '"') {
        this.pos++;
        return out;
      }
      if (ch === '\n') {
        this.fail('unterminated string (line break inside a string)');
      }
      if (ch !== '\\') {
        out += ch;
        this.pos++;
        continue;
      }
      const escape = this.text[this.pos + 1];
      if (escape === 'u') {
        const hex = this.text.slice(this.pos + 2, this.pos + 6);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
          this.fail('invalid \\u escape sequence');
        }
        out += String.fromCharCode(parseInt(hex, 16));
        this.pos += 6;
        continue;
      }
      const mapped = escape === undefined ? undefined : ESCAPES[escape];
      if (mapped === undefined) {
        this.fail(`invalid escape sequence "\\${escape ?? ''}"`);
      }
      out += mapped;
      this.pos += 2;
    }
  }

  private parseLiteral(): JsonScalar {
    const start = this.pos;
    const line = this.line;
    for (const word of ['true', 'false', 'null'] as const) {
      if (this.text.startsWith(word, this.pos)) {
        this.pos += word.length;
        return {
          type: word === 'null' ? 'null' : 'boolean',
          start,
          end: this.pos,
          line,
          raw: word,
        };
      }
    }
    NUMBER.lastIndex = this.pos;
    const match = NUMBER.exec(this.text);
    if (!match) {
      this.fail(`unexpected ${this.describeCurrent()}`);
    }
    this.pos += match[0].length;
    return { type: 'number', start, end: this.pos, line, raw: match[0] };
  }
}

/** Parses JSON text. Throws {@link JsonSyntaxError} with a 1-based line and column. */
export function parseJsonAst(text: string): JsonNode {
  return new Parser(text).parseDocument();
}
