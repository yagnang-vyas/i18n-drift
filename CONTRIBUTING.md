# Contributing to i18n-drift

Thank you for your interest in improving i18n-drift, a translation key drift checker for Laravel and JavaScript. This guide explains how to propose changes.

> i18n-drift v0.1.0 is implemented (see the [README](README.md) for the feature status). The most useful contributions are bug reports with a minimal reproduction, extraction edge cases from real projects, and the planned features in the [roadmap](docs/ROADMAP.md).

## Ground rules

- Be respectful and follow the [Code of Conduct](CODE_OF_CONDUCT.md).
- For anything larger than a small fix, open an issue first to discuss the approach.
- Keep pull requests focused on one change.
- Do not include secrets, credentials, or real personal or customer data anywhere in the repository, including tests and fixtures.

## Project-specific guidelines

- New extractors need unit tests proving that comments, unrelated strings, and similarly named functions are ignored, and a fixture project under `test/fixtures/` with an exactly asserted `expected-findings.json` when they change what the tool reports.
- Never execute project code; PHP language files must be parsed, not included.
- `--write` must preserve existing formatting and must never be the default behavior.

## Getting started

```bash
git clone https://github.com/yagnang-vyas/i18n-drift.git
cd i18n-drift
npm ci
npm run build
node dist/cli.js --help
```

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for the full development guide.

## Branch naming

| Prefix | Use for |
|---|---|
| `feat/` | New functionality |
| `fix/` | Bug fixes |
| `docs/` | Documentation only |
| `refactor/` | Code changes without behavior change |
| `test/` | Tests only |
| `chore/` | Tooling, dependencies, CI |

## Commit messages

i18n-drift uses [Conventional Commits](https://www.conventionalcommits.org/):

```text
<type>(<scope>): <short summary>

<optional body explaining what and why>
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `perf`, `chore`, `ci`, `build`.

Suggested scopes: `cli`, `config`, `locales`, `extractors`, `placeholders`, `compare`, `fix`, `report`, `docs`, `ci`.

Examples:

```text
feat(cli): add support for a new input format
fix(locales): handle empty input without crashing
docs: clarify installation steps
```

Commit messages must not contain `Co-authored-by` trailers for AI tools or any AI attribution.

## Before opening a pull request

Run the same checks as CI (they need Node.js 22 or newer):

```bash
npm run check   # typecheck, lint + formatting, build, tests with coverage, publint
```

Then confirm:

- [ ] Tests cover the change (positive and negative cases where relevant).
- [ ] Documentation is updated (README, `docs/`, or inline comments).
- [ ] No secrets, credentials, or real personal data are included.
- [ ] Commits follow Conventional Commits.

## Pull request process

1. Fork the repository and create a branch from `main`.
2. Make your change with tests.
3. Open a pull request describing the problem, the solution, and how you tested it.
4. The maintainer reviews the change. Please respond to feedback; small follow-up commits are fine.
5. The maintainer merges once checks pass and the review is approved.

## Reporting bugs

Open an issue with: what you expected, what happened, steps to reproduce, and your environment (OS, runtime versions). For security problems, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.

## Licensing of contributions

By contributing, you agree that your contributions are licensed under the project's license (see [LICENSE](LICENSE)). You keep authorship of your own commits.

## Maintainer

i18n-drift is maintained by **Yagnang Vyas** ([https://github.com/yagnang-vyas](https://github.com/yagnang-vyas)).
