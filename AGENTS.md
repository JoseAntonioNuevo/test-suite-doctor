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

## Eve Engineering and OpenViking

This file is shared by the VPS and local Cursor. Do **not** put host IPs,
`/srv` paths, or “how to SSH this VPS” here. Wire MCP on each machine in
user config (`~/.cursor/mcp.json`), not in git.

**OpenViking** — account `(none)`. **No OpenViking account** for this repo — fail closed; do not invent a tenant. One product → one account.
Fail closed if unknown; never invent a tenant. Use the OpenViking MCP (or
`ov-write-safe` when MCP is down). Never store secrets, `.env`, tokens, or
PII in OV. After substantive work: secret-free `sessions/YYYY-MM-DD-slug.md`;
durable facts in `architecture/` or `decisions/`. Replace stale claims.

**Eve** is review-only local CI (hosted GitHub Actions is billing-disabled).
It never edits this repo. Jobs live in `engineering-quality.yaml`. When you
finish implementing, run Eve CI (`.githooks/eve-ci` on the workstation, or
the `eve_ci` MCP tool) and fix failures yourself; re-run. Do not ask Eve
to patch or open a PR. Semantic review is advisory.

Host-only notes belong in a gitignored `AGENTS.host.md` or user Cursor rules.
