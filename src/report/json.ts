import { TOOL_NAME, VERSION } from '../version.js';
import { summarize } from './summary.js';
import type { ReportContext } from './summary.js';
import type { Usage } from '../types.js';

/** Renders the machine-readable report (`schemaVersion` 1). */
export function renderJson(context: ReportContext): string {
  const summary = summarize(context.findings);
  const report = {
    schemaVersion: 1,
    tool: { name: TOOL_NAME, version: VERSION },
    baseLocale: context.baseLocale,
    locales: context.locales,
    summary: { ...summary, filesScanned: context.filesScanned },
    findings: context.findings.map((finding) => ({
      id: finding.id,
      severity: finding.severity,
      locale: finding.locale,
      key: finding.key,
      file: finding.file,
      line: finding.line,
      message: finding.message,
    })),
  };
  return `${JSON.stringify(report, null, 2)}\n`;
}

/** Renders the usages found in source code for the `keys` command. */
export function renderKeysJson(usages: readonly Usage[]): string {
  const report = {
    schemaVersion: 1,
    tool: { name: TOOL_NAME, version: VERSION },
    usages: usages.map((usage) => ({
      key: usage.dynamic && usage.pattern === undefined ? null : usage.key,
      dynamic: usage.dynamic,
      pattern: usage.pattern ?? null,
      file: usage.file,
      line: usage.line,
      column: usage.column,
    })),
  };
  return `${JSON.stringify(report, null, 2)}\n`;
}
