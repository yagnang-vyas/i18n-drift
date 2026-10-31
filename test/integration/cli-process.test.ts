import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { tempProject } from '../helpers/index.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const cliPath = join(root, 'dist', 'cli.js');
const fixtures = join(root, 'test', 'fixtures');
const version = (
  JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string }
).version;

function run(args: string[], cwd = root) {
  const result = spawnSync(process.execPath, [cliPath, ...args], { cwd, encoding: 'utf8' });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

beforeAll(() => {
  // These tests exercise the built executable, exactly as users run it.
  execFileSync('npm', ['run', 'build'], { cwd: root, stdio: 'ignore' });
}, 120_000);

describe('built CLI (dist/cli.js)', () => {
  it('has a node shebang and prints the version', () => {
    expect(readFileSync(cliPath, 'utf8').startsWith('#!/usr/bin/env node\n')).toBe(true);
    expect(run(['--version'])).toEqual({ code: 0, stdout: `${version}\n`, stderr: '' });
  });

  it('checks a fixture project: exit 1 with the report on stdout', () => {
    const result = run([
      'check',
      '--config',
      'test/fixtures/laravel-inertia-react/i18n-drift.config.json',
    ]);
    expect(result.code).toBe(1);
    expect(result.stdout).toContain('21 findings: 11 errors, 5 warnings, 5 notes');
    expect(result.stderr).toBe('');
  });

  it('exits 0 for the clean fixture and for --fail-on never', () => {
    expect(run(['check'], join(fixtures, 'clean')).code).toBe(0);
    expect(run(['check', '--fail-on', 'never'], join(fixtures, 'blade-only')).code).toBe(0);
  });

  it('exits 2 with a one-line message and no stack trace on errors', () => {
    const result = run(['check', '--config', 'missing.json']);
    expect(result).toEqual({
      code: 2,
      stdout: '',
      stderr: 'i18n-drift: error: config file not found: missing.json\n',
    });
    expect(run(['nonsense']).code).toBe(2);
  });

  it('writes JSON that matches the expected findings of each fixture', () => {
    for (const name of ['laravel-inertia-react', 'react-i18next', 'blade-only', 'clean']) {
      const result = run(['check', '--format', 'json', '--fail-on', 'never'], join(fixtures, name));
      const report = JSON.parse(result.stdout) as { findings: unknown[] };
      const expected: unknown = JSON.parse(
        readFileSync(join(fixtures, name, 'expected-findings.json'), 'utf8'),
      );
      expect(report.findings).toEqual(expected);
    }
  });

  it('never executes PHP language files', () => {
    const project = tempProject({
      artisan: '',
      'lang/en/evil.php': `<?php\nfile_put_contents(__DIR__ . '/../../pwned.txt', 'x');\nreturn ['a' => 'A'];\n`,
      'resources/views/v.blade.php': "{{ __('evil.a') }}",
    });
    const result = run(['check'], project);
    expect(result.code).toBe(0);
    expect(existsSync(join(project, 'pwned.txt'))).toBe(false);
  });

  it('exits quietly with 141 when the output pipe is closed early', async () => {
    const lines = Array.from({ length: 40_000 }, (_, i) => `t('key.number.${i}');`).join('\n');
    const project = tempProject({
      artisan: '',
      'lang/en.json': '{}',
      'resources/js/a.ts': lines,
    });
    const child = spawn(process.execPath, [cliPath, 'keys'], { cwd: project });
    child.stdout.once('data', () => child.stdout.destroy());
    const code = await new Promise<number | null>((resolve) => child.on('close', resolve));
    expect(code).toBe(141);
  }, 60_000);
});
