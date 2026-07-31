# Test quality rules

The standard every kept or regenerated test must meet. Applied in the REVIEW
phase (rewriting kept tests that smell) and the REGENERATE phase (writing new
tests for coverage gaps).

## Structure: Arrange–Act–Assert

Exactly three visual blocks, in order, separated by a blank line. No assertions
inside arrange, no arranging after act.

```ts
it("charges the saved card when the order total is positive", async () => {
  const gateway = fakeGateway();
  const order = orderWith({ totalCents: 4200, customer: customerWithSavedCard() });

  await checkout(order, gateway);

  expect(gateway.charges).toEqual([{ amountCents: 4200, source: "saved-card" }]);
});
```

If arrange dominates the test, extract builder helpers (`orderWith`,
`customerWithSavedCard`) into shared test utilities — never copy-paste blocks
between files.

## Behavior over implementation

Test through the public API of the unit. If a refactor that preserves behavior
would break the test, the test is wrong. Never assert: private method calls,
internal state, call counts of internal helpers, CSS classes as behavior.
Assert: return values, thrown errors, emitted events, writes observed at a
boundary fake.

## One behavior per test

One act, one logical assertion cluster per test. Multiple `expect`s are fine
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

Mock **only external boundaries**: network/HTTP, databases you cannot run in
the test, clock, randomness, filesystem, third-party SaaS SDKs, message queues.

- Never mock the module under test's internal collaborators just to isolate a
  single class — test the cluster of objects through its entry point.
- Prefer fakes (in-memory implementations with real behavior) over per-call
  `mockResolvedValue` scripts; fakes fail honestly when the contract changes.
- Inject the clock/randomness (or use the runner's fake timers) instead of
  sleeping.
- If a test needs more than ~2 mocks to run, the code's seams are wrong or the
  test targets too small a unit — flag it rather than piling on mocks.

## Determinism

No real network, no real time, no sleeps, no test-order coupling, no shared
mutable state between tests. A test that flakes is worse than no test: it
trains people to re-run and ignore.

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
