# i18n-drift Roadmap

This roadmap lists planned work for i18n-drift. It is a statement of intent, not a commitment to dates. Scope may change based on feedback and what is learned during implementation.

**Legend:** ✅ Done · 🚧 In progress · 📋 Planned

**Current status:** v0.1.0 is implemented and tested. It has not been published to npm yet.

## Versions

### v0.1

**Status:** ✅ Done

- [x] JSON and Laravel PHP loaders (plus Laravel JSON)
- [x] JS/TS and PHP/Blade extractors
- [x] Missing and unused checks
- [x] Untranslated, empty, extra and placeholder checks (Laravel, ICU and i18next syntaxes)
- [x] Dynamic key patterns and `unknown-value` reporting
- [x] Text, JSON and Markdown reports
- [x] `fix --write` for JSON locale files
- [x] Layout auto-detection, `init`, CI workflow

**Done when:** A Laravel + Inertia fixture reports exactly the seeded missing and unused keys. This is asserted by `test/integration/fixtures.test.ts`, together with the other seeded cases.

### v0.2

**Status:** 📋 Planned

- [ ] YAML loader
- [ ] Vue extractor
- [ ] next-intl namespaces
- [ ] `fix --write` for YAML and for PHP arrays where the structure is simple and statically known

**Done when:** Fixer preserves formatting in JSON and YAML fixtures.

### v0.3

**Status:** 📋 Planned

- [ ] GitHub Action
- [ ] Content-hash cache
- [ ] Docker image

**Done when:** Action runs in a sample repository.

## Known limitations

See the Limitations section of the [README](../README.md#limitations); each item there is a candidate for a future version.

## Future ideas (not scheduled)

- XLIFF export for translators
- Opt-in machine-translation hooks
- VS Code extension

## How priorities are set

1. Correctness and safety of existing behavior.
2. Features that unblock the core use case described in the README.
3. Community requests with clear use cases (open an issue with the `enhancement` label).

## Tracking

Each item will be tracked as a GitHub issue and grouped into a GitHub milestone of the same name.

---

Maintained by **Yagnang Vyas** ([https://github.com/yagnang-vyas](https://github.com/yagnang-vyas)).
