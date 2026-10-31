# i18n-drift v0.1.0 specification

This is the working specification for v0.1.0. The [README](README.md) describes how to use the
tool; this file records what it checks, how keys are resolved, and the decisions behind both.

## Scope

i18n-drift compares the translation keys used in source code with the keys defined in locale
files, across Laravel (PHP, Blade, JSON) and JavaScript/TypeScript (React, Next.js, Vue script
code) codebases, and reports the differences with CI-friendly exit codes.

Non-goals for v0.1.0: Vue single-file components, YAML locale files, next-intl namespace binding,
`fix --write` for PHP files, machine translation, XLIFF, a VS Code extension, a published GitHub
Action (a documented `npx` CI step is enough).

## Decisions

### D1: Grammar provenance

PHP, JavaScript, TypeScript and TSX are parsed with [web-tree-sitter](https://www.npmjs.com/package/web-tree-sitter)
0.25.10. The WebAssembly grammars are vendored in `grammars/` from the `tree-sitter-wasms` npm
package, version 0.1.13, together with a provenance notice (`grammars/NOTICE.md`) and the
package's license file. They are shipped in the npm package (`"files": ["dist", "grammars"]`).
No PHP runtime is needed and PHP is never executed.

### D2: npm package name

`npm view i18n-drift` returned `E404 Not Found` on 2026-10-31, so the name `i18n-drift` is
currently unclaimed on the npm registry. The package has not been published.

### D3: Key resolution order

1. A usage key is looked up verbatim in each locale (for a namespaced layout the key includes the
   namespace prefix, e.g. `common:save`).
2. If it is not found and the key has no namespace separator, `defaultNamespace` (default
   `translation`) is tried: `translation:save`.
3. For JSON definitions, i18next plural suffixes are accepted: a usage of `item` is satisfied by
   `item_one`, `item_other`, `item_zero`, `item_two`, `item_few`, `item_many` or `item_plural`.
4. Laravel: a key with dots (`auth.failed`) is first looked up among the PHP array definitions and
   then among the JSON definitions; a key without a matching PHP group (`Welcome back`) is matched
   against JSON definitions. Because all definitions of a locale are kept in one map keyed by the
   normalized key, a collision between a PHP key and a JSON key is resolved in favour of the PHP
   definition.

### D4: Key normalization

| Source                                                    | Key                                                       |
| --------------------------------------------------------- | --------------------------------------------------------- |
| i18next JSON `locales/{locale}/{namespace}.json`          | `namespace:path.to.key` (separator configurable)          |
| JSON `locales/{locale}.json`                              | `path.to.key`                                             |
| Laravel PHP `lang/{locale}/auth.php`                      | `auth.failed`                                             |
| Laravel PHP `lang/{locale}/admin/users.php`               | `admin/users.title`                                       |
| Laravel JSON `lang/{locale}.json`                         | verbatim top-level key                                    |

### D5: Dynamic keys

Template literals with substitutions, concatenation with variables and variable arguments are
reported as `dynamic-key` notes. When static text surrounds the dynamic part, a pattern with `*`
as the wildcard is derived (`` t(`status.${s}`) `` becomes `status.*`) and definitions matching
the pattern are treated as used. Config `dynamicKeyPatterns` do the same for keys built in ways
the tool cannot see; `*` matches one or more characters, including dots.

### D6: Entries that cannot be read

- A PHP language value that is not a literal (function call, constant, variable, interpolated
  string, heredoc) is recorded as defined with value `null` and reported as `unknown-value`.
- A PHP array entry whose key is not a string or integer literal cannot be named and is skipped,
  with an `unknown-value` note at its line.
- A PHP language file with a syntax error, or without a top-level `return [ ... ];`, is an error
  (exit code 2), like invalid JSON.

### D7: Additional behaviour beyond the brief

- `untranslated` ignores values that contain no letters once placeholders are removed (numbers,
  URLs made of symbols, `:count`), because they cannot be translated.
- Allowlist entries match either a key (with `*` wildcards) or an exact value.
- Base-locale keys used only through a dynamic pattern are also reported as `missing` in the other
  locales, because a runtime lookup would fall back there.
- Locale files are never scanned as source files.

### D8: JSON handling

Locale JSON is read with a small position-aware parser (`src/locales/json-ast.ts`) instead of
`JSON.parse`, because every definition needs a line number and the fixer needs exact offsets. The
fixer inserts text rather than re-serializing, so integer-like keys keep their order and the file
keeps its indentation, line endings and trailing newline.

### D9: Locale selection

`baseLocale` defaults to `en`, or to the first locale found when there is no `en`. `locales`
defaults to every locale found. A locale listed in `locales` without files is checked as empty,
and `fix --write` creates its JSON files.

## Checks

See the README for the full table; severities are `error` for `missing`, `empty` and
`placeholder-mismatch`, `warning` for `unused`, `untranslated` and `extra`, and `note` for
`dynamic-key` and `unknown-value`. Every severity can be overridden or switched off in the
configuration.

## Exit codes

| Code | Meaning                                                   |
| ---- | --------------------------------------------------------- |
| 0    | nothing at or above `--fail-on` (default `error`)         |
| 1    | findings at or above `--fail-on`                          |
| 2    | usage or configuration error (invalid JSON/PHP, bad args) |
| 130  | interrupted                                               |
| 141  | output pipe closed early (exits quietly)                  |
