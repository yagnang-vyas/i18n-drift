import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import type { Analysis } from './analyze.js';
import { analyze, scanUsages } from './analyze.js';
import { CONFIG_FILE_NAME, loadConfig, validateConfig } from './config.js';
import { detectLayout } from './detect.js';
import { UserError, errorMessage } from './errors.js';
import { DEFAULT_MARKER, applyFix, planFix } from './fix.js';
import type { FixPlan } from './fix.js';
import { listLocaleFiles } from './locales/index.js';
import { REPORT_FORMATS, renderKeysJson, renderReport } from './report/index.js';
import type { ReportFormat } from './report/index.js';
import { SEVERITY_RANK, printable } from './report/summary.js';
import { CHECK_IDS } from './types.js';
import type { CheckId, Finding, Usage } from './types.js';
import { TOOL_NAME, VERSION } from './version.js';

export interface Io {
  stdout: { write(text: string): unknown };
  stderr: { write(text: string): unknown };
  cwd: string;
  env: Record<string, string | undefined>;
  /** Whether stdout is an interactive terminal (enables colours). */
  isTTY: boolean;
}

type Command = 'check' | 'keys' | 'fix' | 'init';
const COMMANDS: readonly Command[] = ['check', 'keys', 'fix', 'init'];
const FAIL_LEVELS = ['error', 'warning', 'note', 'never'] as const;
type FailLevel = (typeof FAIL_LEVELS)[number];

const OPTIONS_BY_COMMAND: Readonly<Record<Command, readonly string[]>> = {
  check: ['config', 'locale', 'only', 'format', 'fail-on', 'verbose'],
  keys: ['config', 'format', 'verbose'],
  fix: ['config', 'locale', 'write', 'marker', 'verbose'],
  init: ['force'],
};

export const USAGE = `${TOOL_NAME} ${VERSION}
Find missing, unused and untranslated translation keys across Laravel and JavaScript code.

Usage:
  ${TOOL_NAME} check [options]   Compare used keys with locale files and report drift
  ${TOOL_NAME} keys  [options]   List the translation keys found in source code
  ${TOOL_NAME} fix   [options]   Add missing keys to JSON locale files (dry run unless --write)
  ${TOOL_NAME} init  [options]   Write ${CONFIG_FILE_NAME} from the detected project layout

Options:
  -c, --config FILE      Config file (default: ./${CONFIG_FILE_NAME}, else auto-detect)
      --locale CODE      Only report/fix this locale (repeatable)           [check, fix]
      --only IDS         Comma-separated check ids to report                [check]
      --format FORMAT    check: text|json|markdown, keys: text|json         [check, keys]
      --fail-on LEVEL    error|warning|note|never (default: error)          [check]
      --write            Apply the fixes instead of printing them           [fix]
      --marker TEXT      Prefix for added values (default: "${DEFAULT_MARKER}")  [fix]
      --force            Overwrite an existing config file                  [init]
      --verbose          Print the detected layout and counts to stderr
  -v, --version          Print the version
  -h, --help             Print this help

Check ids: ${CHECK_IDS.join(', ')}
Exit codes: 0 ok, 1 findings at or above --fail-on, 2 usage or configuration error.
`;

interface ParsedArgs {
  command: Command;
  config: string | undefined;
  locale: string[] | undefined;
  only: CheckId[] | undefined;
  format: string | undefined;
  failOn: FailLevel;
  write: boolean;
  marker: string;
  force: boolean;
  verbose: boolean;
}

function parseArguments(argv: readonly string[]): ParsedArgs | 'help' | 'version' {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      options: {
        config: { type: 'string', short: 'c' },
        locale: { type: 'string', multiple: true },
        only: { type: 'string' },
        format: { type: 'string' },
        'fail-on': { type: 'string' },
        write: { type: 'boolean' },
        marker: { type: 'string' },
        force: { type: 'boolean' },
        verbose: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
    });
  } catch (error) {
    throw new UserError(`${errorMessage(error).replace(/\s*To specify.*$/s, '')} (see --help)`);
  }
  const { values, positionals } = parsed;
  if (values.version) {
    return 'version';
  }
  if (values.help || positionals[0] === 'help') {
    return 'help';
  }
  const command = positionals[0];
  if (command === undefined) {
    throw new UserError(`missing command: expected one of ${COMMANDS.join(', ')} (see --help)`);
  }
  if (!COMMANDS.includes(command as Command)) {
    throw new UserError(`unknown command "${command}": expected one of ${COMMANDS.join(', ')}`);
  }
  if (positionals.length > 1) {
    throw new UserError(`unexpected argument "${positionals[1]}"`);
  }

  const allowed = OPTIONS_BY_COMMAND[command as Command];
  for (const name of Object.keys(values)) {
    if (!allowed.includes(name)) {
      throw new UserError(`option --${name} is not valid for "${command}"`);
    }
  }

  const failOn = values['fail-on'] ?? 'error';
  if (!FAIL_LEVELS.includes(failOn as FailLevel)) {
    throw new UserError(`invalid --fail-on "${failOn}": expected ${FAIL_LEVELS.join(', ')}`);
  }
  let only: CheckId[] | undefined;
  if (values.only !== undefined) {
    only = values.only.split(',').map((id) => {
      const trimmed = id.trim();
      if (!CHECK_IDS.includes(trimmed as CheckId)) {
        throw new UserError(
          `invalid --only check id "${trimmed}": expected ${CHECK_IDS.join(', ')}`,
        );
      }
      return trimmed as CheckId;
    });
  }
  const locale = values.locale?.flatMap((value) => value.split(',').map((item) => item.trim()));
  return {
    command: command as Command,
    config: values.config,
    locale,
    only,
    format: values.format,
    failOn: failOn as FailLevel,
    write: values.write ?? false,
    marker: values.marker ?? DEFAULT_MARKER,
    force: values.force ?? false,
    verbose: values.verbose ?? false,
  };
}

function reportFormat(args: ParsedArgs, allowed: readonly string[]): ReportFormat {
  const format = args.format ?? 'text';
  if (!allowed.includes(format)) {
    throw new UserError(
      `invalid --format "${format}" for "${args.command}": expected ${allowed.join(', ')}`,
    );
  }
  return format as ReportFormat;
}

function verboseLine(io: Io, args: ParsedArgs, message: string): void {
  if (args.verbose) {
    io.stderr.write(`${TOOL_NAME}: ${message}\n`);
  }
}

function describeLoadedConfig(
  io: Io,
  args: ParsedArgs,
  loaded: Awaited<ReturnType<typeof loadConfig>>,
): void {
  if (!args.verbose) {
    return;
  }
  verboseLine(
    io,
    args,
    loaded.origin === 'file'
      ? `using config file ${loaded.configPath ?? CONFIG_FILE_NAME}`
      : 'no config file; using the detected layout',
  );
  if (loaded.detected) {
    verboseLine(io, args, `detected: ${loaded.detected.kinds.join(' + ')}`);
    for (const note of loaded.detected.notes) {
      verboseLine(io, args, `  ${note}`);
    }
  }
}

function filterFindings(
  analysis: Analysis,
  locales: string[] | undefined,
  only: CheckId[] | undefined,
): Finding[] {
  for (const locale of locales ?? []) {
    if (!analysis.locales.includes(locale)) {
      throw new UserError(
        `unknown locale "${locale}" (checked locales: ${analysis.locales.join(', ')})`,
      );
    }
  }
  return analysis.findings.filter(
    (finding) =>
      (!locales || finding.locale === null || locales.includes(finding.locale)) &&
      (!only || only.includes(finding.id)),
  );
}

function exitCodeFor(findings: readonly Finding[], failOn: FailLevel): number {
  if (failOn === 'never') {
    return 0;
  }
  const threshold = SEVERITY_RANK[failOn];
  return findings.some((finding) => SEVERITY_RANK[finding.severity] >= threshold) ? 1 : 0;
}

async function runCheck(args: ParsedArgs, io: Io): Promise<number> {
  const format = reportFormat(args, REPORT_FORMATS);
  const loaded = await loadConfig({
    cwd: io.cwd,
    ...(args.config ? { configPath: args.config } : {}),
  });
  describeLoadedConfig(io, args, loaded);
  const analysis = await analyze(loaded.config);
  verboseLine(
    io,
    args,
    `base locale ${analysis.baseLocale}; locales ${analysis.locales.join(', ')}`,
  );
  verboseLine(
    io,
    args,
    `read ${analysis.localeFiles.length} locale files and scanned ${analysis.scannedFiles} source files`,
  );

  const findings = filterFindings(analysis, args.locale, args.only);
  const color = format === 'text' && io.isTTY && !io.env['NO_COLOR'];
  io.stdout.write(
    renderReport(
      format,
      {
        baseLocale: analysis.baseLocale,
        locales: analysis.locales,
        filesScanned: analysis.scannedFiles,
        findings,
      },
      color,
    ),
  );
  return exitCodeFor(findings, args.failOn);
}

function renderKeysText(usages: readonly Usage[]): string {
  if (usages.length === 0) {
    return 'No translation keys found.\n';
  }
  const rows = usages.map((usage) => ({
    key: usage.dynamic ? (usage.pattern ?? '(dynamic)') : usage.key,
    kind: usage.dynamic ? 'dynamic' : 'static',
    location: `${usage.file}:${usage.line}:${usage.column}`,
  }));
  const keyWidth = Math.max(...rows.map((row) => printable(row.key).length));
  const kindWidth = Math.max(...rows.map((row) => row.kind.length));
  return `${rows
    .map(
      (row) =>
        `${printable(row.key).padEnd(keyWidth)}  ${row.kind.padEnd(kindWidth)}  ${row.location}`,
    )
    .join('\n')}\n`;
}

async function runKeys(args: ParsedArgs, io: Io): Promise<number> {
  const format = reportFormat(args, ['text', 'json']);
  const loaded = await loadConfig({
    cwd: io.cwd,
    ...(args.config ? { configPath: args.config } : {}),
  });
  describeLoadedConfig(io, args, loaded);
  const localeFiles = (await listLocaleFiles(loaded.config)).map((entry) => entry.file);
  const { usages, files } = await scanUsages(loaded.config, localeFiles);
  verboseLine(io, args, `scanned ${files} source files`);
  io.stdout.write(format === 'json' ? renderKeysJson(usages) : renderKeysText(usages));
  return 0;
}

function renderFixPlan(plan: FixPlan, written: boolean): string {
  const lines: string[] = [];
  const quote = (text: string): string => JSON.stringify(text);
  if (plan.additions.length > 0) {
    lines.push(
      written
        ? 'Added to JSON locale files:'
        : 'Planned additions to JSON locale files (dry run, nothing was written; pass --write to apply):',
    );
    for (const addition of plan.additions) {
      lines.push(
        `  ${addition.locale}  ${addition.file}  ${printable(addition.key)} = ${printable(quote(addition.value))}`,
      );
    }
  }
  if (plan.manual.length > 0) {
    lines.push('Add these to the PHP language files by hand (PHP files are never modified):');
    for (const entry of plan.manual) {
      lines.push(
        `  ${entry.locale}  ${entry.file}  ${printable(entry.key)} = ${printable(quote(entry.value))}`,
      );
    }
  }
  if (plan.skipped.length > 0) {
    lines.push('Cannot be fixed automatically:');
    for (const skipped of plan.skipped) {
      lines.push(`  ${skipped.locale}  ${printable(skipped.key)}: ${skipped.reason}`);
    }
  }
  return lines.length === 0 ? 'Nothing to fix.\n' : `${lines.join('\n')}\n`;
}

async function runFix(args: ParsedArgs, io: Io): Promise<number> {
  const loaded = await loadConfig({
    cwd: io.cwd,
    ...(args.config ? { configPath: args.config } : {}),
  });
  describeLoadedConfig(io, args, loaded);
  const analysis = await analyze(loaded.config);
  filterFindings(analysis, args.locale, undefined);
  const plan = planFix(analysis, { locale: args.locale, marker: args.marker });

  if (!args.write) {
    io.stdout.write(renderFixPlan(plan, false));
    return 0;
  }
  const result = await applyFix(loaded.config.root, plan);
  io.stdout.write(renderFixPlan(plan, true));
  io.stdout.write(
    result.keys === 0
      ? 'No files were changed.\n'
      : `Wrote ${result.keys} ${result.keys === 1 ? 'key' : 'keys'} to ${result.files.length} ${result.files.length === 1 ? 'file' : 'files'}.\n`,
  );
  return 0;
}

async function runInit(args: ParsedArgs, io: Io): Promise<number> {
  const detected = await detectLayout(io.cwd);
  if (!detected) {
    throw new UserError(
      'could not detect a Laravel or i18next layout in this directory; run "init" from your project root',
    );
  }
  const config = validateConfig({}, io.cwd, detected);
  const locales = [...new Set((await listLocaleFiles(config)).map((entry) => entry.locale))].sort();
  const content = {
    baseLocale: locales.includes('en') ? 'en' : (locales[0] ?? 'en'),
    locales,
    localeFiles: detected.localeFiles,
    sources: detected.sources,
    exclude: detected.exclude,
  };
  const path = join(io.cwd, CONFIG_FILE_NAME);
  try {
    await writeFile(path, `${JSON.stringify(content, null, 2)}\n`, {
      flag: args.force ? 'w' : 'wx',
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new UserError(`${CONFIG_FILE_NAME} already exists (use --force to overwrite it)`);
    }
    throw new UserError(`cannot write ${CONFIG_FILE_NAME}: ${errorMessage(error)}`);
  }
  io.stdout.write(
    `Wrote ${CONFIG_FILE_NAME} (${detected.kinds.join(' + ')}, ${locales.length} locales).\n`,
  );
  io.stdout.write(`Next: ${TOOL_NAME} check\n`);
  return 0;
}

/** Runs the CLI and returns the process exit code. Never throws. */
export async function main(
  argv: readonly string[],
  io: Io = {
    stdout: process.stdout,
    stderr: process.stderr,
    cwd: process.cwd(),
    env: process.env,
    isTTY: process.stdout.isTTY,
  },
): Promise<number> {
  try {
    const args = parseArguments(argv);
    if (args === 'version') {
      io.stdout.write(`${VERSION}\n`);
      return 0;
    }
    if (args === 'help') {
      io.stdout.write(USAGE);
      return 0;
    }
    switch (args.command) {
      case 'check':
        return await runCheck(args, io);
      case 'keys':
        return await runKeys(args, io);
      case 'fix':
        return await runFix(args, io);
      case 'init':
        return await runInit(args, io);
    }
  } catch (error) {
    if (error instanceof UserError) {
      io.stderr.write(`${TOOL_NAME}: error: ${error.message}\n`);
    } else {
      io.stderr.write(
        `${TOOL_NAME}: error: unexpected failure: ${errorMessage(error)}\n` +
          'This is a bug; please report it at https://github.com/yagnang-vyas/i18n-drift/issues\n',
      );
    }
    return 2;
  }
}
