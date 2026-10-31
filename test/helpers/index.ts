import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach } from 'vitest';
import { validateConfig } from '../../src/config.js';
import type { DetectedLayout } from '../../src/detect.js';
import type { ResolvedConfig } from '../../src/types.js';

const created: string[] = [];

afterEach(() => {
  for (const dir of created.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** Creates a temporary project directory containing `files` (path -> contents). */
export function tempProject(files: Record<string, string> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'i18n-drift-'));
  created.push(dir);
  for (const [path, contents] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), contents);
  }
  return dir;
}

const DETECTED: DetectedLayout = {
  kinds: ['test'],
  localeFiles: [{ format: 'json', path: 'locales/{locale}.json' }],
  sources: ['src/**/*.ts'],
  exclude: [],
  notes: [],
};

/** A validated configuration for tests that do not touch the file system. */
export function makeConfig(raw: Record<string, unknown> = {}, root = '/project'): ResolvedConfig {
  return validateConfig(raw, root, DETECTED);
}
