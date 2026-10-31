import { extractBladeUsages } from './blade.js';
import { extractJsUsages } from './javascript.js';
import type { JsExtractOptions } from './javascript.js';
import { extractPhpUsages } from './php.js';
import type { Usage } from '../types.js';

const JS_FILE = /\.(?:js|jsx|mjs|cjs|ts|tsx|mts|cts)$/i;

/** Whether the extractor set knows how to read this file. */
export function isSourceFile(file: string): boolean {
  return JS_FILE.test(file) || /\.php$/i.test(file);
}

/** Dispatches a file to the right extractor based on its name. */
export async function extractUsages(
  source: string,
  file: string,
  options: JsExtractOptions,
): Promise<Usage[]> {
  if (/\.blade\.php$/i.test(file)) {
    return extractBladeUsages(source, file);
  }
  if (/\.php$/i.test(file)) {
    return extractPhpUsages(source, file);
  }
  return extractJsUsages(source, file, options);
}
