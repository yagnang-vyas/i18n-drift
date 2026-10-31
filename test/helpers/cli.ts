import { cpSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from '../../src/app.js';
import { tempProject } from './index.js';

export const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

export interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Runs the CLI in-process with captured output. */
export async function cli(
  args: string[],
  options: { cwd?: string; isTTY?: boolean; env?: Record<string, string | undefined> } = {},
): Promise<CliResult> {
  let stdout = '';
  let stderr = '';
  const code = await main(args, {
    stdout: { write: (text) => (stdout += text) },
    stderr: { write: (text) => (stderr += text) },
    cwd: options.cwd ?? process.cwd(),
    env: options.env ?? {},
    isTTY: options.isTTY ?? false,
  });
  return { code, stdout, stderr };
}

/** Copies a fixture project into a temporary directory so tests may modify it. */
export function copyFixture(name: string): string {
  const dir = tempProject();
  cpSync(join(fixturesDir, name), dir, { recursive: true });
  return dir;
}

/** The `check --format json` report. */
export interface JsonReport {
  schemaVersion: number;
  tool: { name: string; version: string };
  baseLocale: string;
  locales: string[];
  summary: {
    errors: number;
    warnings: number;
    notes: number;
    total: number;
    filesScanned: number;
    byCheck: Record<string, number>;
  };
  findings: {
    id: string;
    severity: string;
    locale: string | null;
    key: string | null;
    file: string | null;
    line: number | null;
    message: string;
  }[];
}

/** The `keys --format json` report. */
export interface KeysReport {
  schemaVersion: number;
  usages: {
    key: string | null;
    dynamic: boolean;
    pattern: string | null;
    file: string;
    line: number;
    column: number;
  }[];
}

/** `JSON.parse` with an explicit result type (the standard signature returns `any`). */
export function parseJson<T>(text: string): T {
  return JSON.parse(text) as T;
}
