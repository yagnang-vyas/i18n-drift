# i18n-drift Roadmap

This roadmap lists planned work for i18n-drift. It is a statement of intent, not a commitment to dates. Scope may change based on feedback and what is learned during implementation.

**Legend:** ✅ Done · 🚧 In progress · 📋 Planned

**Current status:** Design phase. No milestones have been started; nothing below is implemented yet.

## Versions

### v0.1

**Status:** 📋 Planned

- [ ] JSON and Laravel PHP loaders
- [ ] JS/TS and PHP/Blade extractors
- [ ] Missing and unused checks
- [ ] Text report

**Done when:** A Laravel + Inertia fixture reports exactly the seeded missing and unused keys.
### v0.2

**Status:** 📋 Planned

- [ ] Untranslated, empty, placeholder checks
- [ ] Dynamic key patterns
- [ ] JSON and Markdown reports

**Done when:** Placeholder mismatches detected for Laravel, ICU, and i18next syntaxes.
### v0.3

**Status:** 📋 Planned

- [ ] YAML loader
- [ ] Vue extractor
- [ ] next-intl namespaces
- [ ] `fix --write`

**Done when:** Fixer preserves formatting in JSON and YAML fixtures.
### v0.4

**Status:** 📋 Planned

- [ ] GitHub Action
- [ ] Content-hash cache
- [ ] Docker image

**Done when:** Action runs in a sample repository.

## Future ideas (not scheduled)

- XLIFF export for translators
- Opt-in machine-translation hooks
- VS Code extension

## How priorities are set

1. Correctness and safety of existing behavior.
2. Features that unblock the core use case described in the README.
3. Community requests with clear use cases (open an issue with the `enhancement` label).

## Tracking

Each item will be tracked as a GitHub issue and grouped into a GitHub milestone of the same name once implementation begins.

---

Maintained by **Yagnang Vyas** ([https://github.com/yagnang-vyas](https://github.com/yagnang-vyas)).
