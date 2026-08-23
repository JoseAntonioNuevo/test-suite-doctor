# test-suite-doctor

Public agent skill (`SKILL.md`) plus compiled CLI (`dist/cli.mjs`). No production services. No OpenViking tenant — do not write this work under `hermes` or any other account.

## Using it on a suite

Read `SKILL.md`. Collect and minimize before proposing deletions.

```bash
node dist/cli.mjs collect --help
node dist/cli.mjs minimize --help
node dist/cli.mjs verify --help
```

## Developing this repo

pnpm only (`packageManager` + `pnpm-lock.yaml`).

```bash
pnpm install --frozen-lockfile
pnpm run typecheck && pnpm test
pnpm run build && git diff --exit-code -- dist/cli.mjs
```

- `scripts/` import Node builtins only. Compiled CLI has no production deps.
- Resolve Vitest/Jest/Stryker from the **target** project; never download a runner via a package-manager executor.
- Preserve v2 schema/provenance and fail-closed artifacts.
- Demo files are generated from `examples/make-demo.ts`.
