import { CHECK_IDS } from '../types.js';
import type { CheckId, Finding, Severity } from '../types.js';

export interface Summary {
  errors: number;
  warnings: number;
  notes: number;
  total: number;
  byCheck: Record<CheckId, number>;
}

export interface ReportContext {
  baseLocale: string;
  locales: readonly string[];
  filesScanned: number;
  findings: readonly Finding[];
}

export function summarize(findings: readonly Finding[]): Summary {
  const byCheck = Object.fromEntries(CHECK_IDS.map((id) => [id, 0])) as Record<CheckId, number>;
  const summary: Summary = { errors: 0, warnings: 0, notes: 0, total: findings.length, byCheck };
  for (const finding of findings) {
    byCheck[finding.id]++;
    if (finding.severity === 'error') {
      summary.errors++;
    } else if (finding.severity === 'warning') {
      summary.warnings++;
    } else {
      summary.notes++;
    }
  }
  return summary;
}

export const SEVERITY_RANK: Readonly<Record<Severity, number>> = { error: 3, warning: 2, note: 1 };

/** `file:line`, `file`, or `-` when a finding has no location. */
export function formatLocation(finding: Pick<Finding, 'file' | 'line'>): string {
  if (finding.file === null) {
    return '-';
  }
  return finding.line === null ? finding.file : `${finding.file}:${finding.line}`;
}

/** Escapes control characters so a key with a line break cannot break line-based output. */
export function printable(text: string): string {
  // eslint-disable-next-line no-control-regex -- control characters are exactly what is escaped here
  return text.replace(/[\u0000-\u001f\u007f]/g, (ch) => {
    switch (ch) {
      case '\n':
        return '\\n';
      case '\r':
        return '\\r';
      case '\t':
        return '\\t';
      default:
        return `\\x${ch.charCodeAt(0).toString(16).padStart(2, '0')}`;
    }
  });
}
