# Contributing to test-suite-doctor

Thanks for helping make test suites smaller and better. Three kinds of
contributions are especially welcome:

1. **New AI-slop patterns** for the catalog
2. **New runner support** (Mocha, node:test, Bun, …)
3. **Bug fixes and test cases** for the scripts

## Development setup

```bash
git clone https://github.com/JoseAntonioNuevo/test-suite-doctor.git
cd test-suite-doctor
pnpm install --frozen-lockfile
pnpm test          # Vitest self-tests
pnpm run typecheck # tsc --noEmit
pnpm run build     # rebuild the committed CLI
```

All checks must be green before opening a PR. After building, also run
`git diff --exit-code -- dist/cli.mjs` to catch committed bundle drift.

## Ground rules

- **pnpm only.** Use the exact version pinned by `packageManager`; do not add a
  second lockfile or document commands for another package-manager CLI.
- **Scripts stay dependency-light.** `scripts/` imports Node.js builtins only
  (`node:fs`, `node:path`, `node:child_process`, `node:util`…). The committed
  `dist/cli.mjs` must run with Node alone and have no production dependencies.
  Development dependencies such as Vitest, TypeScript, and tsx are fine.
- **Scripts stay tool-agnostic.** Nothing in `scripts/` or the core `SKILL.md`
  workflow may require a specific agent product. Any human with a shell must
  be able to run every step.
- **Determinism is a feature.** Same report + same flags ⇒ byte-identical
  plan (minus timestamps). Anything judgment-based belongs in `SKILL.md` or
  `references/`, not in code.
- **Every algorithm change ships with a test** in `tests/`. Pure logic lives
  in `scripts/lib/` precisely so it is unit-testable without spawning runners.

## Adding a slop pattern

1. Open an issue with the [slop-pattern template](https://github.com/JoseAntonioNuevo/test-suite-doctor/issues/new?template=slop-pattern.yml)
   — or go straight to a PR.
2. Add a numbered section to `references/slop-patterns.md` following the
   existing shape: **signal, why it's slop, before/after, when it's NOT
   slop**. The counter-exception matters most — it's what keeps agents from
   over-deleting.
3. Update the table of contents at the top of the file.

## Adding a runner

`scripts/lib/runner-commands.ts` is the only place runner CLIs are known, and
`scripts/lib/detect.ts` the only place detection lives. A new runner needs:

- detection evidence (dependency, config file names),
- a `buildRunSpec` branch producing per-run coverage (istanbul
  `coverage-final.json` format) + Jest-compatible JSON results,
- detection tests in `tests/detect.test.ts`.

If the runner can't emit istanbul-format coverage, open an issue first so we
can discuss the mapping.

## Releases

Semver tags (`v0.x.y`). The skill is consumed by Git clone and the CLI is
distributed through the package registry, so `main` stays releasable at all
times. Follow [`docs/releasing.md`](docs/releasing.md); the exact tarball that
passes package smoke tests is the one published and attached to the release.
