# Test suite minimization plan

Generated 2026-07-31T12:20:59.774Z at `file` granularity by test-suite-doctor.

## Summary

| Metric | Before | After |
|---|---:|---:|
| Units | 12 | **5** |
| Covered lines | 95 | 95 (100.0% retained) |
| Covered branches | 5 | 5 (100.0% retained) |
| Estimated test cost | 4070ms | 1470ms |

## Keep (5)

| # | Unit | Gain | Estimated cost | Cum. line / branch retention |
|---:|---|---|---:|---:|
| 1 | `tests/regression-1042.test.ts` | force-kept (--keep pattern) | 45ms | 2.1% / 20.0% |
| 2 | `tests/pricing-snapshot.test.ts` | +35 lines, +0 branches for 95ms estimated | 95ms | 39.0% / 20.0% |
| 3 | `tests/smoke.test.ts` | +10 lines, +0 branches for 70ms estimated | 70ms | 49.5% / 20.0% |
| 4 | `tests/api.test.ts` | +20 lines, +2 branches for 410ms estimated | 410ms | 70.5% / 60.0% |
| 5 | `tests/cart.test.ts` | +28 lines, +2 branches for 850ms estimated | 850ms | 100.0% / 100.0% |

## Drop candidates (7)

> Review each against `references/slop-patterns.md` before deleting — coverage
> cannot see API contracts or documented regressions.

| Unit | Residual lines | Residual branches | Best line overlap | Best branch overlap | Reason |
|---|---:|---:|---|---|---|
| `tests/api-contract.test.ts` | 0 | 0 | `tests/api.test.ts` (12) | `tests/api.test.ts` (1) | adds no line or branch coverage beyond the kept set |
| `tests/api-mock.test.ts` | 0 | 0 | `tests/api.test.ts` (6) | — | adds no line or branch coverage beyond the kept set |
| `tests/cart-extra.test.ts` | 0 | 0 | `tests/cart.test.ts` (20) | — | adds no line or branch coverage beyond the kept set |
| `tests/cart-should-work-2.test.ts` | 0 | 0 | `tests/cart.test.ts` (18) | — | adds no line or branch coverage beyond the kept set |
| `tests/pricing-more.test.ts` | 0 | 0 | `tests/pricing-snapshot.test.ts` (15) | — | adds no line or branch coverage beyond the kept set |
| `tests/pricing.test.ts` | 0 | 0 | `tests/pricing-snapshot.test.ts` (28) | — | adds no line or branch coverage beyond the kept set |
| `tests/utils-lodash.test.ts` | 0 | 0 | `tests/api.test.ts` (3) | — | adds no line or branch coverage beyond the kept set |
