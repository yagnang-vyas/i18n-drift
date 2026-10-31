import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { UserError, errorMessage } from './errors.js';

/** Reads a UTF-8 text file relative to the project root and strips a leading byte-order mark. */
export async function readProjectFile(root: string, relativePath: string): Promise<string> {
  try {
    const text = await readFile(resolve(root, relativePath), 'utf8');
    return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  } catch (error) {
    throw new UserError(`cannot read ${relativePath}: ${errorMessage(error)}`);
  }
}
