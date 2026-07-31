# Test suite minimization plan

Generated 2026-07-31T09:56:27.013Z at `file` granularity by test-suite-doctor.

## Summary

| Metric | Before | After |
|---|---:|---:|
| Units | 12 | **5** |
| Covered lines | 95 | 95 (100.0% retained) |
| Covered branches | 5 | 5 (100.0% retained) |
| Test runtime | 4070ms | 1470ms |

## Keep (5)

| # | Unit | Gain | Runtime | Cum. retention |
|---:|---|---|---:|---:|
| 1 | `tests/regression-1042.test.ts` | force-kept (--keep pattern) | 45ms | 2.1% |
| 2 | `tests/pricing-snapshot.test.ts` | +35 lines, +0 branches for 95ms | 95ms | 39.0% |
| 3 | `tests/smoke.test.ts` | +10 lines, +0 branches for 70ms | 70ms | 49.5% |
| 4 | `tests/api.test.ts` | +20 lines, +2 branches for 410ms | 410ms | 70.5% |
| 5 | `tests/cart.test.ts` | +28 lines, +2 branches for 850ms | 850ms | 100.0% |

## Drop candidates (7)

> Review each against `references/slop-patterns.md` before deleting — coverage
> cannot see API contracts or documented regressions.

| Unit | Residual lines | Covered by | Reason |
|---|---:|---|---|
| `tests/api-contract.test.ts` | 0 | `tests/api.test.ts` | adds no line coverage beyond the kept set |
| `tests/api-mock.test.ts` | 0 | `tests/api.test.ts` | adds no line coverage beyond the kept set |
| `tests/cart-extra.test.ts` | 0 | `tests/cart.test.ts` | adds no line coverage beyond the kept set |
| `tests/cart-should-work-2.test.ts` | 0 | `tests/cart.test.ts` | adds no line coverage beyond the kept set |
| `tests/pricing-more.test.ts` | 0 | `tests/pricing-snapshot.test.ts` | adds no line coverage beyond the kept set |
| `tests/pricing.test.ts` | 0 | `tests/pricing-snapshot.test.ts` | adds no line coverage beyond the kept set |
| `tests/utils-lodash.test.ts` | 0 | `tests/api.test.ts` | adds no line coverage beyond the kept set |
