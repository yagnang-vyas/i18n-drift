# i18n-drift Development Guide

How to set up a local environment, run checks, and work on i18n-drift.

## Prerequisites

- Node.js 22 or newer (CI runs Node 22 and 24)
- Git

PHP is **not** required, and never used: PHP files are parsed with a tree-sitter grammar.

## Git identity

Before your first commit in this repository, set the repository-local identity used by the maintainer:

```bash
git config user.name "Yagnang Vyas"
git config user.email "168338381+yagnang-vyas@users.noreply.github.com"
```

(External contributors use their own identity for their own commits.)

## Local setup

```bash
git clone https://github.com/yagnang-vyas/i18n-drift.git
cd i18n-drift
npm ci
npm run build
node dist/cli.js --help
```

There are no `.env` files or services; the tool reads only its optional config file and `NO_COLOR`.

## Everyday commands

CI runs `npm run check`; run it before pushing:

| Command | What it does |
|---|---|
| `npm run build` | Bundles `src/cli.ts` to `dist/cli.js` with `tsup` |
| `npm run typecheck` | `tsc --noEmit` with strict options (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) |
| `npm run lint` | ESLint (type-aware) and a Prettier format check |
| `npm run format` | Applies Prettier to the files it manages |
| `npm test` | Vitest with coverage; fails below 90% lines, branches, functions or statements |
| `npm run publint` | Validates the package metadata |
| `npm run check` | All of the above, in CI order |

Formatting is managed by Prettier for code, configuration and workflows. Markdown and the fixture projects are not reformatted automatically, because fixture files must keep their exact bytes.

## Useful tasks

### Running against a fixture project

```bash
node dist/cli.js check --config test/fixtures/laravel-inertia-react/i18n-drift.config.json
node dist/cli.js check --verbose        # from inside a fixture directory: shows the detected layout
```

### Running a single test file

```bash
npx vitest run test/unit/extract-blade.test.ts
```

### Changing a fixture project

Every fixture project under `test/fixtures/` has an `expected-findings.json` that the integration tests compare against exactly. After changing a fixture, run the CLI on it, review every difference against the problems you meant to seed, and only then update the expected file:

```bash
cd test/fixtures/laravel-inertia-react
node ../../../dist/cli.js check --format json --fail-on never    # compare the "findings" array
```

Never regenerate an expected file just to make a test pass.

### Fixtures

| Fixture | Purpose |
|---|---|
| `laravel-inertia-react` | PHP array and JSON language files for `en`, `hi`, `gu`; Blade views; React TSX pages; every kind of finding is seeded |
| `react-i18next` | Namespaces, `useTranslation('ns')`, `<Trans>`, the `ns` option, plural forms; no config file (auto-detected) |
| `blade-only` | Blade directives, `@php` blocks, `{!! !!}`, directive expressions |
| `clean` | A project that must report nothing (proves there are no false positives) |
| `safety` | A hostile PHP language file used by the "never executes code" test |

## Workflow

1. Sync `main` and create a branch (`feat/...`, `fix/...`, `docs/...`).
2. Make changes with tests.
3. Run `npm run check`.
4. Commit using Conventional Commits, e.g. `feat(extractors): ...`.
5. Verify commit authorship before pushing:

   ```bash
   git log origin/main..HEAD --format='%h %an <%ae> | %cn <%ce>'
   ```

6. Push and open a pull request.

## Code style

- Formatting and linting are enforced by the tools above; do not disable rules without a one-line justification next to the exception.
- Prefer small, pure functions that are easy to test.
- Public functions and modules have brief doc comments explaining intent.
- Never weaken or skip a test to get a green build.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `cli-process` tests fail with a missing `dist/cli.js` | Run `npm run build`; the test also builds it itself |
| Lint passes locally but fails in CI | Different tool versions; reinstall from the lockfile with `npm ci` |
| `Language.load` or WASM errors | The `grammars/` directory is missing or incomplete; restore it from git |
| `check` says it could not detect a layout | Add `i18n-drift.config.json` with `localeFiles` (see the README) or run `i18n-drift init` |

---

Maintained by **Yagnang Vyas** ([https://github.com/yagnang-vyas](https://github.com/yagnang-vyas)).
