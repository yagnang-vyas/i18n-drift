# Changelog

All notable changes to this project are documented in this file. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-10-31

First implementation. Not yet published to npm.

### Added

- `check`, `keys`, `fix` and `init` commands with `--config`, `--locale`, `--only`, `--format`,
  `--fail-on`, `--write`, `--marker`, `--force` and `--verbose`.
- Locale loaders for JSON (nested or flat, one file per namespace or per locale), Laravel PHP
  arrays (parsed with tree-sitter, never executed) and Laravel JSON, with line numbers.
- Extractors for JavaScript, TypeScript, JSX and TSX (`t`, `$t`, `i18n.t`, `i18next.t`, `<Trans>`,
  `useTranslation` namespaces, the `ns` option), PHP (`__`, `trans`, `trans_choice`, `Lang::get`,
  `Lang::choice`) and Blade (echoes, `@lang`, `@choice`, `@php`, `<?php ?>`, directive
  expressions, bound component attributes).
- Checks `missing`, `unused`, `untranslated`, `empty`, `extra`, `placeholder-mismatch`,
  `dynamic-key` and `unknown-value`, with severity overrides.
- Placeholder extraction for Laravel (`:name`), ICU (`{name}`, plural, select) and i18next
  (`{{name}}`).
- Dynamic key patterns derived from code and `dynamicKeyPatterns` from the configuration.
- Text, JSON (`schemaVersion` 1) and Markdown reports; deterministic ordering; exit codes `0`,
  `1`, `2`, `130` and `141`.
- `fix --write` for JSON locale files, preserving formatting, with atomic writes.
- Layout auto-detection for Laravel and i18next projects.
- Four fixture projects with exactly asserted findings, a PHP safety test, in-process and
  spawned-process CLI tests, and a CI workflow for Node 22 and 24.
