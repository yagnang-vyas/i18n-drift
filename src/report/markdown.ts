import { CHECK_IDS } from '../types.js';
import { formatLocation, summarize } from './summary.js';
import type { ReportContext } from './summary.js';

function cell(text: string): string {
  return text.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');
}

function code(text: string): string {
  return text.includes('`') ? cell(text) : `\`${cell(text)}\``;
}

/** Renders a summary table plus findings grouped by check, for `$GITHUB_STEP_SUMMARY`. */
export function renderMarkdown(context: ReportContext): string {
  const summary = summarize(context.findings);
  const out: string[] = [
    '## i18n-drift report',
    '',
    '| Errors | Warnings | Notes | Base locale | Locales | Source files |',
    '| ---: | ---: | ---: | --- | --- | ---: |',
    `| ${summary.errors} | ${summary.warnings} | ${summary.notes} | ${cell(context.baseLocale)} | ${cell(context.locales.join(', '))} | ${context.filesScanned} |`,
    '',
  ];

  if (context.findings.length === 0) {
    out.push('No findings.', '');
    return out.join('\n');
  }

  for (const id of CHECK_IDS) {
    const group = context.findings.filter((finding) => finding.id === id);
    if (group.length === 0) {
      continue;
    }
    out.push(`### ${id} (${group.length})`, '');
    out.push('| Severity | Locale | Key | Location | Message |', '| --- | --- | --- | --- | --- |');
    for (const finding of group) {
      out.push(
        `| ${finding.severity} | ${cell(finding.locale ?? '-')} | ${finding.key === null ? '-' : code(finding.key)} | ${code(formatLocation(finding))} | ${cell(finding.message)} |`,
      );
    }
    out.push('');
  }
  return out.join('\n');
}
