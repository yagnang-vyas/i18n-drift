# i18n-drift Development Guide

How to set up a local environment, run checks, and work on i18n-drift.

> i18n-drift is in the design phase. The commands below describe the planned developer workflow and will be verified as the code is scaffolded.

## Prerequisites

- Node.js 20 or newer
- Git

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

Copy any `.env.example` files to `.env` and fill in values as documented in the README's environment variables section. Never commit `.env` files.

## Everyday commands

Run these before pushing; CI runs the same checks:

```bash
npm run lint
npm run typecheck
npm test
```

## Useful tasks

### Running against a fixture project

```bash
node dist/cli.js check --config test/fixtures/laravel-inertia-react/i18n-drift.config.json
```

### Updating snapshots

```bash
npm test -- -u
```

## Workflow

1. Sync `main` and create a branch (`feat/...`, `fix/...`, `docs/...`).
2. Make changes with tests.
3. Run the checks above.
4. Commit using Conventional Commits, e.g. `feat(cli): ...`.
5. Verify commit authorship before pushing:

   ```bash
   git log origin/main..HEAD --format='%h %an <%ae> | %cn <%ce>'
   ```

6. Push and open a pull request.

## Code style

- Formatting and linting are enforced by the tools in the checks above; do not disable rules without explanation.
- Prefer small, pure functions that are easy to test.
- Public functions and modules have brief docstrings or comments explaining intent.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Tests fail with connection errors | Required services (database, Redis) not running, or wrong URL in `.env` |
| Lint passes locally but fails in CI | Different tool versions; reinstall from the lockfile |
| Unexpected behavior after pulling | Dependencies or database schema changed; reinstall and re-run migrations |

---

Maintained by **Yagnang Vyas** ([https://github.com/yagnang-vyas](https://github.com/yagnang-vyas)).
