# Skill behavior scenarios

Executable-by-eval test cases for the *skill* layer (the `SKILL.md` workflow),
complementing the unit tests for the scripts. Run them by giving an agent the
skill plus the prompt, then checking its behavior against the expectations.
They double as documentation of intended behavior for reviewers.

## Triggering

| # | Prompt | Expected |
|---|---|---|
| T1 | "audit my test suite" | Skill triggers |
| T2 | "reduce my tests from 2000 to about 200" | Skill triggers |
| T3 | "clean up the AI slop tests in this repo" | Skill triggers |
| T4 | "why is this one test flaky?" | Skill does NOT trigger (single-test debugging, not suite health) |
| T5 | "write tests for src/parser.ts" | Skill does NOT trigger (greenfield test writing, no minimization intent) |

## Workflow discipline

**S1 — No gut-feeling pruning.**
Prompt: "These tests look like AI garbage, just delete the worst 500."
Expected: the agent refuses to delete anything before running
`collect-metrics.ts` and `minimize.ts`; it explains that the plan comes from
per-test coverage data, and starts the MEASURE step (or asks to).

**S2 — Branch safety.**
Prompt: run the workflow in a repo with uncommitted changes.
Expected: the agent stops before the deletion step, reports the dirty tree,
and does not delete tests until the tree is clean and a working branch exists.

**S3 — Contract-test rescue.**
Setup: `examples/demo-report.json` (the drop list includes
`tests/api-contract.test.ts`, residual 0).
Expected: during REVIEW the agent flags the contract test as
coverage-invisible value, re-runs minimize with an additional `--keep`
pattern instead of hand-editing the plan, and says why.

**S4 — Kept-slop rewrite.**
Setup: same demo; `tests/pricing-snapshot.test.ts` is kept (cheap coverage).
Expected: the agent identifies it as a hollow snapshot (pattern #5) despite it
being in the KEEP list, and proposes rewriting it into targeted assertions
rather than deleting it.

**S5 — Verify gates completion.**
Setup: after deletion, `verify.ts` exits 1 with line retention below floor.
Expected: the agent does not report success; it reads the worst-hit files from
the verify output, regenerates behavior tests for them per
`references/quality-rules.md`, and re-runs verify. After ~3 failed cycles it
stops and presents the residual gap to the user.

**S6 — Red baseline.**
Setup: the suite has failing tests before the workflow starts.
Expected: the agent reports the failures and asks how to proceed instead of
silently minimizing (or silently "fixing" unrelated tests).

**S7 — Mutation is opt-in.**
Prompt: "verify the reduced suite, src/billing is critical".
Expected: the agent runs plain verify for the suite, and offers/uses
`--mutation --mutate "src/billing/**"` only for the critical module — it does
not mutation-test the whole repo by default.

**S8 — Collection errors surface.**
Setup: a report whose `collectionErrors` is non-empty.
Expected: the agent relays which units could not be measured and treats the
plan as suspect for those files, rather than deleting them as "0 coverage".

## Script-level regression cases

Covered by the unit tests in this directory (`npm test`): greedy ordering,
floor semantics, force-keep, strict count, runtime budget, determinism,
baseline-universe clamping, runner detection matrix, retention math, mutation
score formula.
