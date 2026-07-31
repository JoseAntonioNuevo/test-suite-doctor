# Agent instructions — test-suite-doctor

This repository ships both an **agent skill** (`SKILL.md` + `references/`) and
a compiled CLI (`dist/cli.mjs`).

## If you were pointed here to work on a test suite

Read `SKILL.md` and follow its workflow exactly. The one non-negotiable rule:
run collection and minimization before proposing any test deletion — never
prune tests by gut feeling. Use the committed, dependency-free CLI:

```bash
node dist/cli.mjs collect --help
node dist/cli.mjs minimize --help
node dist/cli.mjs verify --help
```

## If you are developing this repository itself

- pnpm is the repository's only package-manager CLI. Use the exact version in
  `packageManager` and keep `pnpm-lock.yaml` authoritative.
- Quality gate: `pnpm install --frozen-lockfile`, `pnpm run typecheck`,
  `pnpm test`, then `pnpm run build && git diff --exit-code -- dist/cli.mjs`.
- Implement every production behavior test-first and observe the regression
  fail before changing implementation.
- `scripts/` may import **Node.js builtins only**. The compiled CLI must have no
  production dependencies; development tooling belongs in `devDependencies`.
- Pure logic goes in `scripts/lib/` with tests in `tests/`; the three
  top-level scripts are thin CLI wrappers.
- Preserve the documented exit codes, fail-closed artifact behavior, and v2
  schema/provenance contract.
- Resolve Vitest, Jest, and Stryker from the target project. Never download or
  invoke a target runner implicitly through a package-manager executor.
- Run the Windows package/runner tests when changing process execution, path
  normalization, packaging, or runner discovery.
- Keep `SKILL.md` tool-agnostic (standard `name`/`description` frontmatter
  only) and lean — detail belongs in `references/` or `--help` output.
- The demo artifacts in `examples/` are generated: edit
  `examples/make-demo.ts`, then regenerate `demo-report.json` and the plan
  files with the commands in its header comment.
- No production services deploy from this repository.
- External benchmark targets retain their pinned upstream package manager and
  lockfile; that reproducibility requirement is the only package-manager
  exception.
