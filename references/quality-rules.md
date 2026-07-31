# Test quality rules

The standard every kept or regenerated test must meet. Applied in the REVIEW
phase (rewriting kept tests that smell) and the REGENERATE phase (writing new
tests for coverage gaps).

## Structure: Arrange–Act–Assert

For focused unit and behavior tests, **SHOULD** make Arrange, Act, and Assert
easy to distinguish. Blank-line-separated blocks are a useful default, not a
universal formatting requirement. Integration, orchestration, visual,
property-based, performance, and characterization tests may need several acts
or observations; optimize those for readable intent and diagnostic failures.

```ts
it("charges the saved card when the order total is positive", async () => {
  const gateway = fakeGateway();
  const order = orderWith({ totalCents: 4200, customer: customerWithSavedCard() });

  await checkout(order, gateway);

  expect(gateway.charges).toEqual([{ amountCents: 4200, source: "saved-card" }]);
});
```

If arrange dominates several tests, **SHOULD** extract stable builder helpers
(`orderWith`, `customerWithSavedCard`). Local duplication can be clearer than
a premature abstraction when fixtures intentionally differ.

## Behavior over implementation

Behavior tests **MUST** assert an observable contract. They **SHOULD** prefer a
public API and avoid private calls, incidental internal state, or collaborator
call counts. Characterization tests may temporarily pin implementation details
during a risky migration, and visual tests may assert stable DOM/CSS hooks when
those hooks are part of the integration contract; label those exceptions.

## One behavior per test

Tests **SHOULD** cover one named behavior or invariant. Multiple `expect`s are fine
when they describe one outcome (a returned object's fields); they are not fine
when they chain unrelated behaviors ("creates AND updates AND deletes").
Splitting keeps failure messages diagnostic — the test name tells you what
broke.

## Names state the contract

`<unit> <behavior> when <condition>` — readable as a spec line without opening
the body.

- Bad: `"should work"`, `"test getUser 2"`, `"handles edge case"`
- Good: `"returns 404 when the profile is private"`,
  `"retries twice on ETIMEDOUT then surfaces the error"`

The suite's test names, concatenated, should read as documentation of the
module.

## Mocking discipline

Tests **SHOULD** mock external boundaries: network/HTTP, databases you cannot run in
the test, clock, randomness, filesystem, third-party SaaS SDKs, message queues.

- Avoid mocking the module under test's internal collaborators just to isolate a
  single class — test the cluster of objects through its entry point.
- Prefer fakes (in-memory implementations with real behavior) over per-call
  `mockResolvedValue` scripts; fakes fail honestly when the contract changes.
- Inject the clock/randomness (or use the runner's fake timers) instead of
  sleeping.
- A high mock count is a review signal, not an automatic failure. Orchestration
  code may legitimately coordinate several boundaries; prefer contract-accurate
  fakes and verify the resulting behavior.

## Determinism

Tests **MUST** be repeatable in their declared environment. Unit tests should
avoid real network, real time, sleeps, order coupling, and shared mutable state.
Explicit integration/performance suites may use real services or clocks when
they provide isolation, bounded timeouts, cleanup, and a separate CI policy.

## Regeneration procedure (coverage gaps)

For each source file `verify.ts` reports as losing coverage:

1. Read the file; identify the *behaviors* the lost lines implement (not the
   lines themselves — the goal is a behavior test that happens to cover them).
2. Write the test red-green: write it as if the behavior were broken, predict
   the failure message, then confirm it passes against the real code. A test
   you have never seen fail proves nothing (red-green-refactor discipline,
   after Beck's TDD).
3. One strong test per behavior; boundary values where the branch structure
   demands them (empty input, first/last element, error path).
4. Re-run `verify.ts`. Repeat only for files still below the floor.

## Snapshot policy

Allowed only when the serialized artifact is itself the contract (codegen,
serializers, formatted errors). Keep them inline where possible, small, and
named after the intent. A snapshot nobody can review in a diff is not a test —
it is churn insurance.
