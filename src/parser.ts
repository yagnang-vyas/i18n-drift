import { fileURLToPath } from 'node:url';
import { Language, Parser } from 'web-tree-sitter';
import type { Tree } from 'web-tree-sitter';

export type GrammarName = 'javascript' | 'typescript' | 'tsx' | 'php';

const GRAMMAR_DIR = new URL('../grammars/', import.meta.url);

let initialized: Promise<void> | undefined;
const parsers = new Map<GrammarName, Promise<Parser>>();

function init(): Promise<void> {
  initialized ??= Parser.init();
  return initialized;
}

async function createParser(name: GrammarName): Promise<Parser> {
  await init();
  const path = fileURLToPath(new URL(`tree-sitter-${name}.wasm`, GRAMMAR_DIR));
  const language = await Language.load(path);
  const parser = new Parser();
  parser.setLanguage(language);
  return parser;
}

/** Returns a cached parser for the grammar, loading the WASM file on first use. */
export function getParser(name: GrammarName): Promise<Parser> {
  let parser = parsers.get(name);
  if (!parser) {
    parser = createParser(name);
    parsers.set(name, parser);
  }
  return parser;
}

/**
 * Parses `source` and passes the tree to `fn`. The native tree is always released afterwards, so
 * nodes must not escape the callback.
 */
export async function withTree<T>(
  name: GrammarName,
  source: string,
  fn: (tree: Tree) => T,
): Promise<T> {
  const parser = await getParser(name);
  const tree = parser.parse(source);
  if (!tree) {
    throw new Error(`tree-sitter failed to parse ${name} source`);
  }
  try {
    return fn(tree);
  } finally {
    tree.delete();
  }
}
