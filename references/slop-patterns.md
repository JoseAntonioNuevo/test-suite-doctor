# AI-slop test anti-patterns

A field catalog of low-value test patterns that inflate suites without adding
fault-detection power. Used during the REVIEW phase to classify drop candidates
and to justify deletions to the user.

For each pattern: how to spot it, why it is slop, a before/after, and — just as
important — when it is **not** slop.

Contents:

1. [Trivial assertions](#1-trivial-assertions)
2. [Mock-the-mock](#2-mock-the-mock)
3. [Near-duplicate tests](#3-near-duplicate-tests)
4. [Implementation-detail tests](#4-implementation-detail-tests)
5. [Hollow snapshots](#5-hollow-snapshots)
6. [Tautological tests](#6-tautological-tests)
7. [Assertion-free tests](#7-assertion-free-tests)
8. [Combinatorial padding](#8-combinatorial-padding)
9. [Testing the framework](#9-testing-the-framework)
10. [Zombie setup](#10-zombie-setup)

---

## 1. Trivial assertions

**Signal:** `toBeDefined()`, `toBeTruthy()` on objects that cannot be
undefined, `expect(true).toBe(true)`, asserting a function exists.

```ts
// SLOP — passes for any implementation, including a broken one
it("should have a formatPrice function", () => {
  expect(formatPrice).toBeDefined();
});
```

```ts
// AFTER — asserts the contract
it("formats a price in EUR with two decimals", () => {
  expect(formatPrice(1234.5, "EUR")).toBe("1.234,50 €");
});
```

**Not slop when:** the existence check is the contract — e.g. a plugin loader
test asserting an entry point is exported (rare; usually one test per package).

## 2. Mock-the-mock

**Signal:** every collaborator is mocked, and the assertion checks the mock's
return value or that the mock was called — the test exercises no real code.

```ts
// SLOP — verifies that vi.fn() returns what it was told to return
it("gets the user", async () => {
  const repo = { findUser: vi.fn().mockResolvedValue({ id: 1, name: "Ada" }) };
  const service = new UserService(repo);
  expect(await service.getUser(1)).toEqual({ id: 1, name: "Ada" });
});
```

```ts
// AFTER — real logic under test, mock only the external boundary
it("rejects a user whose subscription is expired", async () => {
  const repo = fakeRepo({ id: 1, subscriptionEndsAt: yesterday() });
  const service = new UserService(repo);
  await expect(service.getUser(1)).rejects.toThrow(SubscriptionExpiredError);
});
```

The tell: delete the service's method body and replace it with
`return this.repo.findUser(id)` — if the test still passes, it tested the mock.

**Not slop when:** the unit under test *is* orchestration (a thin controller
whose whole job is calling collaborators in order with the right arguments) —
but then one interaction test suffices, not one per field.

## 3. Near-duplicate tests

**Signal:** same arrange and act, cosmetically different names or assertion
order; frequently generated in batches ("should work", "should work correctly",
"should return the correct value"). The minimizer surfaces these — duplicates
add zero new coverage and show up with `residualLines: 0` pointing at the same
`bestOverlapWith` unit.

**Fix:** keep the best-named one, delete the rest. If they differ in one input
value, collapse into a table test with meaningful case names.

**Not slop when:** identical coverage but genuinely different assertion — e.g.
same call asserted for value in one test and for emitted event in another.
Coverage cannot distinguish these; the REVIEW phase must.

## 4. Implementation-detail tests

**Signal:** spying on private/internal methods, asserting call counts of
internal helpers, reaching into component internal state, asserting CSS class
names as behavior.

```ts
// SLOP — breaks on any refactor, catches no real bug
it("calls _normalizeInput once", () => {
  const spy = vi.spyOn(parser as any, "_normalizeInput");
  parser.parse("a,b");
  expect(spy).toHaveBeenCalledTimes(1);
});
```

```ts
// AFTER — same code path, asserted at the public boundary
it("parses comma-separated input ignoring surrounding whitespace", () => {
  expect(parser.parse(" a , b ")).toEqual(["a", "b"]);
});
```

**Not slop when:** the "detail" is a documented contract — e.g. a caching layer
where "computes at most once" *is* the observable behavior (assert via the
injected fake's counter, not a spy on a private).

## 5. Hollow snapshots

**Signal:** `toMatchSnapshot()` on large components/objects with no named
intent; snapshot files hundreds of lines long that get `--u`-updated on every
change without review. These "cover" many lines while asserting nothing anyone
understands — high coverage, near-zero fault detection, so the minimizer often
keeps them. Hunt them in the KEEP list too.

**Fix:** replace with targeted assertions on what matters
(`getByRole("button", { name: "Pay now" })`), or `toMatchInlineSnapshot` on a
small, intentional slice.

**Not slop when:** the artifact is the contract byte-for-byte — serializer
output, codegen, error-message formatting. Keep those snapshots small and named.

## 6. Tautological tests

**Signal:** the expected value is computed with the same logic as the
implementation (often copy-pasted from it), or the test re-derives the fixture
from the function under test.

```ts
// SLOP — mirrors the implementation, both could be wrong together
it("computes the discount", () => {
  const expected = price * (1 - DISCOUNT_RATE);
  expect(applyDiscount(price)).toBe(expected);
});
```

```ts
// AFTER — independent, concrete oracle
it("applies the 20% launch discount to a 100€ cart", () => {
  expect(applyDiscount(100)).toBe(80);
});
```

**Not slop when:** property-based tests asserting relations rather than values
("output is sorted", "roundtrip is identity") — those look derived but assert
an independent invariant.

## 7. Assertion-free tests

**Signal:** no `expect` at all, or only "does not throw"; the body just calls
the function. Coverage counts every line; nothing is checked beyond
crash-freedom.

**Fix:** assert the observable result. If crash-freedom on weird input really is
the contract (parsers, sanitizers), say so in the name
(`it("survives malformed UTF-8 without throwing")`) and keep exactly one.

## 8. Combinatorial padding

**Signal:** `it.each` over large input matrices where all cases exercise the
same branch — 40 cases, 2 behaviors. Runtime and suite size grow; coverage and
fault detection do not. The minimizer flags this at test granularity: most rows
have `residualLines: 0`.

**Fix:** one case per equivalence class + explicit boundary values. If the
matrix encodes a real spec table (tax rates by country), keep it but name it as
the spec it is.

## 9. Testing the framework

**Signal:** asserting that lodash sorts, that React renders children, that an
ORM's `where` filters, that JSON.parse parses. Often generated when the AI was
asked to "add tests for utils.ts" and the util is a re-export.

**Fix:** delete. Test your wrapper's added behavior only (edge-case handling,
defaults, error mapping). A library is covered by its own suite.

## 10. Zombie setup

**Signal:** not a test but a cost: beforeEach blocks building fixtures no test
in the file uses, dead arrange code copy-pasted between files, mocks reset for
modules never imported. Inflates runtime (hurting every test's cost score) and
misleads readers.

**Fix:** during REVIEW of kept files, delete unused arrange code; extract
shared fixtures to builders (see quality-rules.md).

---

## Classification discipline

When labeling a drop candidate, cite the pattern number and the concrete
signal, e.g.:

> `user-service.spec.ts :: "should get user" — #2 mock-the-mock (all
> collaborators mocked, asserts mockResolvedValue passthrough); redundant with
> kept user-service.integration.spec.ts (bestOverlapWith).`

If a candidate fits no pattern and covers nothing new, it is still droppable —
but say "redundant coverage, no slop pattern" rather than forcing a label.
Found a new pattern in the wild? Report it:
https://github.com/JoseAntonioNuevo/test-suite-doctor/issues/new?template=slop-pattern.yml
