import { formatLocation, printable, summarize } from './summary.js';
import type { ReportContext } from './summary.js';
import type { Severity } from '../types.js';

const COLORS: Readonly<Record<Severity, string>> = {
  error: '\u001b[31m',
  warning: '\u001b[33m',
  note: '\u001b[36m',
};
const RESET = '\u001b[0m';

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** Renders the human-readable report: one aligned line per finding plus a summary line. */
export function renderText(context: ReportContext, color = false): string {
  const { findings } = context;
  const rows = findings.map((finding) => ({
    severity: finding.severity,
    id: finding.id,
    locale: finding.locale ?? '-',
    key: finding.key === null ? '-' : printable(finding.key),
    location: printable(formatLocation(finding)),
    message: printable(finding.message),
  }));
  const width = (pick: (row: (typeof rows)[number]) => string): number =>
    Math.max(0, ...rows.map((row) => pick(row).length));
  const idWidth = width((row) => row.id);
  const localeWidth = width((row) => row.locale);
  const keyWidth = width((row) => row.key);
  const locationWidth = width((row) => row.location);

  const lines = rows.map((row) => {
    const severity = row.severity.padEnd(7);
    const label = color ? `${COLORS[row.severity]}${severity}${RESET}` : severity;
    return [
      label,
      row.id.padEnd(idWidth),
      row.locale.padEnd(localeWidth),
      row.key.padEnd(keyWidth),
      row.location.padEnd(locationWidth),
      row.message,
    ].join('  ');
  });

  const checked = `checked ${plural(context.locales.length, 'locale')} and ${plural(context.filesScanned, 'source file')}`;
  if (findings.length === 0) {
    lines.push(`No findings (${checked}).`);
  } else {
    const summary = summarize(findings);
    if (lines.length > 0) {
      lines.push('');
    }
    lines.push(
      `${plural(summary.total, 'finding')}: ${plural(summary.errors, 'error')}, ${plural(summary.warnings, 'warning')}, ${plural(summary.notes, 'note')} (${checked}).`,
    );
  }
  return `${lines.join('\n')}\n`;
}
