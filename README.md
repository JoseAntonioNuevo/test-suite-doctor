# test-suite-doctor 🩺

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![CI](https://github.com/JoseAntonioNuevo/test-suite-doctor/actions/workflows/ci.yml/badge.svg)](https://github.com/JoseAntonioNuevo/test-suite-doctor/actions/workflows/ci.yml)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![Node >= 20](https://img.shields.io/badge/node-%3E%3D20-blue.svg)](package.json)
[![Agent Skill](https://img.shields.io/badge/agent%20skill-SKILL.md-8A2BE2)](SKILL.md)

An [agent skill](https://agentskills.io) + standalone CLI scripts that **audit,
minimize, and heal bloated JavaScript/TypeScript test suites** (Vitest and
Jest). Shrink 2,000 tests to ~200 while keeping ~97%+ of real coverage —
measured with per-test coverage data and a greedy minimization algorithm, not
gut feeling, and verified against coverage retention and (optionally) Stryker
mutation score.

> **Experimental:** test-suite-doctor is pre-1.0. Review every proposed drop,
> keep the generated artifacts, and treat incomplete collection as a blocking
> condition unless every unmeasured unit is explicitly force-kept.

Works with **Claude Code, Codex, Cursor, Grok build, and any agent that can
read a markdown file and run a CLI** — and with no agent at all: the scripts
are plain `npx tsx` CLIs you can run by hand or in CI.

---

## The problem: AI slop tests

AI-assisted development grows test suites fast — and much of that growth is
**slop**: trivial assertions (`expect(fn).toBeDefined()`), tests that mock
every collaborator and then assert the mock, near-duplicates under different
names, hollow 400-line snapshots, implementation-detail tests that break on
every refactor. The suite gets slower and noisier while its actual
fault-detection power barely moves.

Research shows that coverage-guided minimization can reduce suites, but the
result varies materially by project and coverage retention is not the same as
fault-detection retention. The figures in this README are therefore limited to
the bundled synthetic demo. Deterministic scripts collect the metrics and
compute the plan; judgment is reserved for rescuing tests whose value coverage
cannot see and writing good replacements for what is lost.

## How it works

```
┌─ 1. MEASURE ──────────┐   ┌─ 2. MINIMIZE ─────────┐   ┌─ 3. REVIEW ─────────────┐
│ scripts/               │   │ scripts/minimize.ts    │   │ agent judgment +         │
│ collect-metrics.ts     │──▶│ greedy weighted-sum    │──▶│ references/              │
│ per-test coverage +    │   │ over the coverage      │   │ slop-patterns.md         │
│ runtime → report.json  │   │ matrix → plan.json/md  │   │ rescue / classify / edit │
└────────────────────────┘   └────────────────────────┘   └───────────┬──────────────┘
                                                                      │ delete on a branch
┌─ 5. VERIFY ────────────┐   ┌─ 4. REGENERATE ────────┐               │
│ scripts/verify.ts      │◀──│ agent judgment +        │◀─────────────┘
│ suite green + coverage │   │ references/             │
│ retention ≥ floor      │   │ quality-rules.md        │
│ (+ optional Stryker)   │   │ fill coverage gaps      │
└────────────────────────┘   └─────────────────────────┘
```

1. **MEASURE** (script) — detects Vitest/Jest, runs the suite once as a
   baseline, then re-runs each test file (or each test) in isolation with
   coverage, producing a machine-readable report: unit → covered
   lines/branches + runtime.
2. **MINIMIZE** (script) — greedy weighted-sum selection: repeatedly keep the
   unit with the most *newly* covered lines/branches per millisecond of
   runtime until the configured floors are met (coverage floor, target count,
   runtime budget). Outputs a keep/drop plan with a justification per unit.
3. **REVIEW** (agent/human) — nothing is deleted automatically. Drop
   candidates are checked against the [slop-pattern catalog](references/slop-patterns.md);
   tests guarding contracts or documented regressions get rescued with
   `--keep`. Kept tests that smell get rewritten.
4. **REGENERATE** (agent/human) — coverage gaps left after pruning get new,
   high-quality tests per the [quality rules](references/quality-rules.md):
   AAA, behavior-driven, mocks only at external boundaries.
5. **VERIFY** (script) — re-runs the suite, requires it green and line
   retention ≥ floor vs baseline; optionally runs Stryker mutation testing on
   critical modules. Non-zero exit on failure, so it can gate CI.

## Example: before / after

Real output from the bundled demo (`examples/`) — a 12-file suite modeling a
slop-heavy repo. The minimizer keeps 5 of 12 units at **100% line and branch
retention** and 64% less runtime:

| Metric | Before | After |
|---|---:|---:|
| Units | 12 | **5** |
| Covered lines | 95 | 95 (100.0% retained) |
| Covered branches | 5 | 5 (100.0% retained) |
| Test runtime | 4070ms | 1470ms |

Drop list (excerpt) — every drop is justified and attributed:

| Unit | Residual lines | Covered by | Reason |
|---|---:|---|---|
| `tests/api-mock.test.ts` | 0 | `tests/api.test.ts` | adds no line coverage beyond the kept set |
| `tests/cart-should-work-2.test.ts` | 0 | `tests/cart.test.ts` | adds no line coverage beyond the kept set |
| `tests/utils-lodash.test.ts` | 0 | `tests/api.test.ts` | adds no line coverage beyond the kept set |

And two deliberately planted teaching cases show why step 3 (REVIEW) exists:

- `tests/pricing-snapshot.test.ts` — a hollow snapshot — got **kept**, because
  snapshots are cheap coverage. Coverage can't smell it; the review phase
  rewrites it into targeted assertions.
- `tests/api-contract.test.ts` — an API contract test — got **dropped** as
  coverage-redundant. The review phase rescues it (`--keep 'contract'`),
  because its value is the contract, not the lines.

Try it yourself, no target repo needed:

```bash
git clone https://github.com/JoseAntonioNuevo/test-suite-doctor.git
cd test-suite-doctor
npx tsx scripts/minimize.ts --report examples/demo-report.json \
  --out-plan /tmp/plan.json --out-md /tmp/plan.md --keep regression
```

## Installation

The skill is a plain folder — `SKILL.md` (the workflow) + `scripts/`
(deterministic CLIs) + `references/` (judgment guides). Installing it anywhere
is "put the folder where your tool looks for it."

### Claude Code

```bash
# user-level (all projects)
git clone https://github.com/JoseAntonioNuevo/test-suite-doctor.git \
  ~/.claude/skills/test-suite-doctor

# or project-level (this repo only)
git clone https://github.com/JoseAntonioNuevo/test-suite-doctor.git \
  .claude/skills/test-suite-doctor
```

Or with the [skills CLI](https://github.com/vercel-labs/skills), which also
targets other compatible tools:

```bash
npx skills add JoseAntonioNuevo/test-suite-doctor
```

Then just ask: *"audit my test suite"*, *"reduce my tests to ~200"*, *"clean
up the AI slop tests"*. Claude Code auto-discovers the skill from its
description. Update later with `git -C ~/.claude/skills/test-suite-doctor pull`.

### Codex / OpenAI agents

Clone the repo anywhere (e.g. `~/skills/test-suite-doctor`) and point the
agent at it from your `AGENTS.md`:

```markdown
## Test suite maintenance
When asked to audit, reduce, or clean up the test suite, read
~/skills/test-suite-doctor/SKILL.md and follow its workflow exactly.
Its scripts run standalone: `npx tsx ~/skills/test-suite-doctor/scripts/<name>.ts --help`.
```

Codex also supports the skills folder convention directly (`~/.codex/skills/`
in recent versions) — clone there and it is discovered like any other skill.

### Cursor

Clone the repo into your project (or a shared location) and add a rule
(`.cursor/rules/test-suite-doctor.mdc`, or Settings → Rules):

```
When the user asks to audit, minimize, or clean up tests, read
tools/test-suite-doctor/SKILL.md and follow its workflow. Always run its
scripts for metrics before proposing any test deletion.
```

### Grok build and other agentic tools

Any tool that can read files and run shell commands can use this skill. Wire
it into the tool's custom-instructions mechanism with one line:

> Read `<path>/SKILL.md` and follow it when working on test-suite health.

The core workflow intentionally uses **no vendor-specific features** — no
Claude-Code-only frontmatter beyond the standard `name`/`description`, no MCP
servers, no tool-specific commands.

### No agent at all (human / CI)

The scripts are self-contained CLIs — Node ≥ 20, zero runtime dependencies
(`npx tsx` fetches the TypeScript runner on demand):

```bash
npx tsx scripts/collect-metrics.ts --cwd /path/to/repo
npx tsx scripts/minimize.ts --coverage-floor 0.97 --target-count 200
npx tsx scripts/verify.ts --coverage-floor 0.97
```

`verify.ts` exits non-zero when floors aren't met, so it drops straight into a
CI job as a regression gate for your reduced suite.

## CLI reference

Every script supports `--help`. The important knobs:

### `scripts/collect-metrics.ts` — MEASURE

| Flag | Default | Meaning |
|---|---|---|
| `--cwd` | `.` | Target repo root |
| `--runner` | `auto` | `vitest` \| `jest` \| auto-detect |
| `--granularity` | `file` | `file` (fast) or `test` (exact; one isolated run per test) |
| `--filter` | — | Regex to scope measured test files |
| `--concurrency` | `2` | Parallel isolated runs |
| `--out` | `.test-doctor/report.json` | Report path |

Requires a coverage provider (Vitest: `@vitest/coverage-v8`; Jest: built in).
Per-test coverage is collected by running units in isolation — coverage
instrumentation is process-wide, so this is the only runner-agnostic way to
attribute lines to tests. That's why `file` granularity is the default: it
needs one run per test file, not one per test.

### `scripts/minimize.ts` — MINIMIZE

| Flag | Default | Meaning |
|---|---|---|
| `--coverage-floor` | `0.97` | Min fraction of baseline covered lines retained |
| `--branch-floor` | — | Optional extra floor on covered branches |
| `--target-count` | — | Aspirational kept-unit count (floor wins unless `--strict-count`) |
| `--runtime-budget-ms` | — | Stop before kept runtime exceeds this |
| `--w-lines` / `--w-branches` | `1` / `1` | Weighted-sum weights |
| `--keep <regex>` | — | Force-keep matching units (repeatable) |
| `--keep-unmeasured` | off | Force-keep every incomplete unit and mark the plan unverified |

### `scripts/verify.ts` — VERIFY

| Flag | Default | Meaning |
|---|---|---|
| `--baseline` | `.test-doctor/report.json` | Baseline to compare against |
| `--coverage-floor` | `0.97` | Min line retention |
| `--mutation` | off | Also run Stryker (opt-in — mutation testing is slow) |
| `--mutate <glob>` | — | Module globs to mutate (repeatable) |
| `--mutation-floor` | `80` | Min mutation score % |
| `--keep-scratch` | off | Preserve this invocation's unique scratch directory |

Exit codes: `0` usable/pass · `1` suite or quality failure/incomplete collection
· `2` invalid usage, unavailable tooling, corrupt input, or an unevaluable run.
Outputs are invalidated before execution and each runner invocation uses a
fresh scratch directory, so an earlier success cannot be reused accidentally.

## The algorithm

Classic cost-aware greedy set cover over the coverage matrix (the approach
behind test-suite reduction results like Rothermel et al.'s and modern
coverage-guided minimization work):

1. The universe is every line (and branch) covered by the baseline run.
2. Each round selects the unit maximizing
   `(w_lines · new_lines + w_branches · new_branches) / runtime_ms`.
3. Stop when the coverage floor (and optional branch floor) is met, the
   runtime budget is exhausted, or no unit adds anything new.

Marginal coverage gain is submodular, so the implementation uses lazy
(CELF-style) evaluation — stale scores are valid upper bounds — which keeps
2,000-unit suites fast. Selection is fully deterministic: ties break by
runtime, then unit id.

Everything the algorithm can't see is pushed to the explicit REVIEW step:
that split — deterministic scripts for measurable facts, judgment for
contracts and intent — is the design center of the whole skill.

## Artifacts

All artifacts are versioned JSON under `.test-doctor/` (gitignore it):

- `report.json` — per-unit covered lines/branches + runtime, plus the
  whole-suite baseline coverage map.
- `plan.json` / `plan.md` — keep list (with per-selection gain) and drop list
  (with residual coverage and the kept unit that covers each drop).
- `verify.json` — verdict: pass/fail, retention numbers, worst-hit files,
  optional mutation score.

## Limitations

- **Vitest and Jest only** (for now). PRs adding runners welcome — the runner
  interface is one small module (`scripts/lib/runner-commands.ts`).
- Per-**test** granularity multiplies runner startup cost by test count; use
  it scoped (`--filter`) or on already-reduced suites.
- Coverage-based minimization is blind to assertion strength — that's why the
  REVIEW step and the optional mutation-score verification exist. Don't skip
  them.
- Tests that depend on execution order or shared state may behave differently
  in isolated runs. Such units block minimization by default. If
  `--keep-unmeasured` is used, they are mandatory keeps and the plan remains
  explicitly unverified until a complete verification run succeeds.

## Contributing

Bug reports, new slop patterns for the catalog, and support for more runners
are all welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). Found a new AI-slop
pattern in the wild? [File it with the dedicated issue template](https://github.com/JoseAntonioNuevo/test-suite-doctor/issues/new?template=slop-pattern.yml).

## License

[MIT](LICENSE) © Jose Antonio Nuevo
