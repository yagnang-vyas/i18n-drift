import { lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import type { Analysis } from './analyze.js';
import { UserError, errorMessage } from './errors.js';
import { JsonSyntaxError, parseJsonAst } from './locales/json-ast.js';
import type { JsonObject } from './locales/json-ast.js';
import { expandPattern } from './locales/pattern.js';
import type { Definition } from './types.js';

export const DEFAULT_MARKER = '[TODO] ';
const PLURAL_SUFFIXES = ['zero', 'one', 'two', 'few', 'many', 'other', 'plural'];

/** A key that will be added to a JSON locale file. */
export interface Addition {
  locale: string;
  key: string;
  value: string;
  /** Target file, relative to the project root. */
  file: string;
  /** Object keys leading to the value inside the file. */
  jsonPath: string[];
}

/** A key that has to be added by hand because its file is a PHP array. */
export interface ManualAddition {
  locale: string;
  key: string;
  value: string;
  file: string;
}

export interface SkippedKey {
  locale: string;
  key: string;
  reason: string;
}

export interface FixPlan {
  additions: Addition[];
  manual: ManualAddition[];
  skipped: SkippedKey[];
}

export interface FixResult {
  keys: number;
  files: string[];
}

/**
 * Plans the keys to add for every `missing` finding in a non-base locale. Values are the base
 * locale value prefixed with `marker`, so untranslated text is easy to find afterwards.
 */
export function planFix(
  analysis: Analysis,
  options: { locale?: string[] | undefined; marker: string },
): FixPlan {
  const { config, baseLocale } = analysis;
  const baseDefinitions = new Map<string, Definition>();
  for (const definition of analysis.definitions) {
    if (definition.locale === baseLocale) {
      baseDefinitions.set(definition.key, definition);
    }
  }

  const candidates = (key: string): string[] =>
    config.defaultNamespace !== '' && !key.includes(config.namespaceSeparator)
      ? [key, `${config.defaultNamespace}${config.namespaceSeparator}${key}`]
      : [key];
  const resolveBase = (key: string): Definition[] => {
    for (const candidate of candidates(key)) {
      const exact = baseDefinitions.get(candidate);
      if (exact) {
        return [exact];
      }
      const family = PLURAL_SUFFIXES.map((suffix) => baseDefinitions.get(`${candidate}_${suffix}`));
      const found = family.filter(
        (definition): definition is Definition => definition !== undefined,
      );
      if (found.length > 0) {
        return found;
      }
    }
    return [];
  };

  const plan: FixPlan = { additions: [], manual: [], skipped: [] };
  const seen = new Set<string>();
  const skip = (locale: string, key: string, reason: string): void => {
    const id = `skip\0${locale}\0${key}\0${reason}`;
    if (!seen.has(id)) {
      seen.add(id);
      plan.skipped.push({ locale, key, reason });
    }
  };

  for (const finding of analysis.findings) {
    if (finding.id !== 'missing' || finding.locale === null || finding.key === null) {
      continue;
    }
    const locale = finding.locale;
    if (locale === baseLocale || (options.locale && !options.locale.includes(locale))) {
      continue;
    }
    const sources = resolveBase(finding.key);
    if (sources.length === 0) {
      skip(
        locale,
        finding.key,
        `not defined in the base locale "${baseLocale}", so there is no value to copy`,
      );
      continue;
    }
    for (const source of sources) {
      if (source.value === null) {
        skip(locale, source.key, `the "${baseLocale}" value is not statically known`);
        continue;
      }
      const spec = config.localeFiles[source.specIndex];
      if (!spec) {
        continue;
      }
      const file = expandPattern(spec.path, { locale, namespace: source.namespace });
      const value = `${options.marker}${source.value}`;
      const id = `${locale}\0${file}\0${source.key}`;
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);
      if (spec.format === 'laravel-php') {
        plan.manual.push({ locale, key: source.key, value, file });
      } else {
        plan.additions.push({
          locale,
          key: source.key,
          value,
          file,
          jsonPath: source.jsonPath ?? [source.key],
        });
      }
    }
  }
  const order = (a: { locale: string; file?: string; key: string }, b: typeof a): number =>
    a.locale.localeCompare(b.locale) ||
    (a.file ?? '').localeCompare(b.file ?? '') ||
    a.key.localeCompare(b.key);
  plan.additions.sort(order);
  plan.manual.sort(order);
  plan.skipped.sort(order);
  return plan;
}

// ---------------------------------------------------------------------------------------------
// Inserting keys into JSON text without reformatting the rest of the file
// ---------------------------------------------------------------------------------------------

function detectEol(text: string): string {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

/** Uses the indentation of the first indented line, falling back to two spaces. */
function detectIndent(text: string): string {
  return /^([ \t]+)\S/m.exec(text)?.[1] ?? '  ';
}

function renderEntry(
  path: readonly string[],
  value: string,
  level: number,
  indent: string,
  eol: string,
): string {
  const pad = indent.repeat(level);
  const [head, ...rest] = path as [string, ...string[]];
  if (rest.length === 0) {
    return `${pad}${JSON.stringify(head)}: ${JSON.stringify(value)}`;
  }
  return `${pad}${JSON.stringify(head)}: {${eol}${renderEntry(rest, value, level + 1, indent, eol)}${eol}${pad}}`;
}

/**
 * Returns `text` with the value added at `path`, appended inside its parent object. Existing
 * content, indentation, key order and the trailing newline are preserved. Returns `text`
 * unchanged if the key already exists.
 */
export function insertJsonKey(
  text: string,
  path: readonly string[],
  value: string,
  file: string,
): string {
  let root;
  try {
    root = parseJsonAst(text);
  } catch (error) {
    if (error instanceof JsonSyntaxError) {
      throw new UserError(`${file}:${error.line}:${error.column}: invalid JSON: ${error.message}`);
    }
    throw error;
  }
  if (root.type !== 'object') {
    throw new UserError(`${file}:1: expected a JSON object at the top level`);
  }

  const indent = detectIndent(text);
  const eol = detectEol(text);
  let object: JsonObject = root;
  for (let depth = 0; depth < path.length; depth++) {
    const segment = path[depth] as string;
    const entry = [...object.entries].reverse().find((candidate) => candidate.key === segment);
    if (entry && depth === path.length - 1) {
      return text;
    }
    if (entry) {
      if (entry.value.type !== 'object') {
        throw new UserError(
          `${file}:${entry.line}: cannot add "${path.join('.')}" because "${segment}" is not an object`,
        );
      }
      object = entry.value;
      continue;
    }

    const rendered = renderEntry(path.slice(depth), value, depth + 1, indent, eol);
    const last = object.entries[object.entries.length - 1];
    if (last) {
      return `${text.slice(0, last.value.end)},${eol}${rendered}${text.slice(last.value.end)}`;
    }
    const closing = `${eol}${indent.repeat(depth)}}`;
    return `${text.slice(0, object.start)}{${eol}${rendered}${closing}${text.slice(object.end)}`;
  }
  return text;
}

// ---------------------------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------------------------

async function readIfExists(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/** Replaces a file atomically (temporary file + rename) and refuses symlinks. */
async function writeAtomically(path: string, contents: string): Promise<void> {
  const existing = await lstat(path).catch(() => null);
  if (existing?.isSymbolicLink()) {
    throw new UserError(`refusing to write through the symbolic link ${path}`);
  }
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.i18n-drift.tmp`;
  try {
    await writeFile(temporary, contents, { mode: existing ? existing.mode & 0o777 : 0o644 });
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw new UserError(`cannot write ${path}: ${errorMessage(error)}`);
  }
}

/**
 * Applies the planned additions to the JSON locale files under `root`. Every edit is computed
 * before anything is written, so an invalid file leaves all files untouched.
 */
export async function applyFix(root: string, plan: FixPlan): Promise<FixResult> {
  const byFile = new Map<string, Addition[]>();
  for (const addition of plan.additions) {
    byFile.set(addition.file, [...(byFile.get(addition.file) ?? []), addition]);
  }

  const edits: { path: string; file: string; text: string; keys: number }[] = [];
  for (const [file, additions] of byFile) {
    const path = resolve(root, file);
    const inside = relative(resolve(root), path);
    if (inside.startsWith('..') || isAbsolute(inside)) {
      throw new UserError(`refusing to write outside the project: ${file}`);
    }
    const original = (await readIfExists(path)) ?? '{}\n';
    let text = original;
    let keys = 0;
    for (const addition of additions) {
      const next = insertJsonKey(text, addition.jsonPath, addition.value, file);
      if (next !== text) {
        keys++;
        text = next;
      }
    }
    if (text !== original) {
      edits.push({ path, file, text, keys });
    }
  }

  for (const edit of edits) {
    await writeAtomically(edit.path, edit.text);
  }
  return {
    keys: edits.reduce((sum, edit) => sum + edit.keys, 0),
    files: edits.map((edit) => edit.file),
  };
}
