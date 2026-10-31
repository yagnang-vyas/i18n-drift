import { renderJson } from './json.js';
import { renderMarkdown } from './markdown.js';
import { renderText } from './text.js';
import type { ReportContext } from './summary.js';

export type ReportFormat = 'text' | 'json' | 'markdown';
export const REPORT_FORMATS: readonly ReportFormat[] = ['text', 'json', 'markdown'];

export function renderReport(format: ReportFormat, context: ReportContext, color = false): string {
  switch (format) {
    case 'json':
      return renderJson(context);
    case 'markdown':
      return renderMarkdown(context);
    default:
      return renderText(context, color);
  }
}

export type { ReportContext } from './summary.js';
export { renderKeysJson } from './json.js';
