#!/usr/bin/env -S npx tsx
/**
 * Regenerates examples/demo-report.json — a synthetic metrics report modeling
 * a small slop-heavy suite (duplicates, mock-the-mock, a hollow snapshot, a
 * regression test guarding two rare lines). Lets anyone try minimize.ts
 * without a target repo:
 *
 *   npx tsx examples/make-demo.ts
 *   npx tsx scripts/minimize.ts --report examples/demo-report.json \
 *     --out-plan examples/demo-plan.json --out-md examples/demo-plan.md \
 *     --coverage-floor 0.97 --keep regression
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CoverageMap, MetricsReport, UnitMetrics } from "../scripts/lib/types.ts";

const range = (from: number, to: number): number[] =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

function unit(
  id: string,
  runtimeMs: number,
  coverage: Record<string, { lines: number[]; branches?: string[] }>,
  testNames: string[],
): UnitMetrics {
  const cov: CoverageMap = {};
  for (const [file, c] of Object.entries(coverage)) {
    cov[file] = { lines: c.lines, branches: c.branches ?? [] };
  }
  return {
    id,
    file: id,
    testName: null,
    identity: { file: id, testName: null },
    memberCount: testNames.length,
    tests: testNames.map((fullName) => ({
      fullName,
      status: "passed",
      durationMs: Math.round(runtimeMs / testNames.length),
    })),
    runtimeMs,
    assertionMs: runtimeMs,
    fileMs: runtimeMs,
    optimizationMs: runtimeMs,
    costSource: "runner-file",
    wallMs: runtimeMs + 900,
    status: "passed",
    coverage: cov,
  };
}

const units: UnitMetrics[] = [
  unit("tests/cart.test.ts", 850, {
    "src/cart.ts": { lines: range(1, 38), branches: ["0.0", "0.1"] },
    "src/pricing.ts": { lines: range(1, 10) },
  }, ["cart adds an item", "cart removes an item", "cart totals per currency"]),
  unit("tests/cart-extra.test.ts", 640, {
    "src/cart.ts": { lines: range(1, 20) },
  }, ["cart should work", "cart should work correctly"]),
  unit("tests/cart-should-work-2.test.ts", 610, {
    "src/cart.ts": { lines: range(1, 18) },
  }, ["cart should return the correct value"]),
  unit("tests/pricing.test.ts", 320, {
    "src/pricing.ts": { lines: range(1, 28) },
  }, ["applies the launch discount", "rounds half-up at two decimals"]),
  unit("tests/pricing-more.test.ts", 300, {
    "src/pricing.ts": { lines: range(1, 15) },
  }, ["discount should be defined"]),
  unit("tests/pricing-snapshot.test.ts", 95, {
    "src/pricing.ts": { lines: range(1, 30) },
    "src/cart.ts": { lines: range(1, 5) },
  }, ["matches the pricing table snapshot"]),
  unit("tests/api.test.ts", 410, {
    "src/api.ts": { lines: range(1, 25), branches: ["0.0", "0.1"] },
  }, ["returns 200 with the profile", "returns 404 when private"]),
  unit("tests/api-mock.test.ts", 380, {
    "src/api.ts": { lines: range(1, 6) },
  }, ["gets the user from the repo mock"]),
  unit("tests/api-contract.test.ts", 150, {
    "src/api.ts": { lines: range(1, 12), branches: ["0.0"] },
  }, ["error body matches the documented shape"]),
  unit("tests/utils-lodash.test.ts", 200, {
    "src/api.ts": { lines: range(1, 3) },
  }, ["sortBy sorts"]),
  unit("tests/regression-1042.test.ts", 45, {
    "src/cart.ts": { lines: [39, 40], branches: ["1.0"] },
  }, ["issue #1042: empty cart with a stale coupon does not crash"]),
  unit("tests/smoke.test.ts", 70, {
    "src/cart.ts": { lines: range(1, 10) },
    "src/pricing.ts": { lines: range(1, 5) },
    "src/api.ts": { lines: range(1, 5) },
  }, ["app boots"]),
];

// Whole-suite baseline = union of unit coverage (a clean suite behaves this way).
const baselineCoverage: CoverageMap = {};
for (const u of units) {
  for (const [file, cov] of Object.entries(u.coverage)) {
    const agg = (baselineCoverage[file] ??= { lines: [], branches: [] });
    agg.lines = [...new Set([...agg.lines, ...cov.lines])].sort((a, b) => a - b);
    agg.branches = [...new Set([...agg.branches, ...cov.branches])].sort();
  }
}
const coveredLines = Object.values(baselineCoverage).reduce((s, c) => s + c.lines.length, 0);
const coveredBranches = Object.values(baselineCoverage).reduce((s, c) => s + c.branches.length, 0);

const report: MetricsReport = {
  version: 2,
  tool: "test-suite-doctor",
  toolVersion: "0.2.0",
  runId: "demo-synthetic",
  createdAt: "2026-07-31T00:00:00.000Z",
  cwd: "/demo/shop",
  runner: "vitest",
  granularity: "file",
  options: { synthetic: true },
  scope: { mode: "full", filter: null, testFiles: units.map((unit) => unit.file) },
  environment: {
    node: "synthetic",
    platform: process.platform,
    arch: process.arch,
    runner: { name: "vitest", version: "synthetic", executable: "synthetic" },
    coverageProvider: { name: "@vitest/coverage-v8", version: "synthetic" },
  },
  provenance: {
    fingerprint: "synthetic-demo",
    coveredSources: Object.fromEntries(Object.keys(baselineCoverage).map((file) => [file, null])),
    configuration: {},
    runtime: {
      runner: { name: "vitest", version: "synthetic", executable: "synthetic" },
      coverageProvider: { name: "@vitest/coverage-v8", version: "synthetic" },
    },
    git: { commit: null, branch: null, dirty: null, diffHash: null },
  },
  baseline: {
    totalTests: units.reduce((s, u) => s + u.tests.length, 0),
    totalRuntimeMs: units.reduce((s, u) => s + u.runtimeMs, 0),
    wallMs: units.reduce((s, u) => s + u.wallMs, 0),
    coveredLines,
    totalLines: coveredLines + 8, // a few lines nothing covers
    coveredBranches,
    totalBranches: coveredBranches + 1,
  },
  baselineCoverage,
  collectionErrors: [],
  units,
};

const out = join(import.meta.dirname, "demo-report.json");
writeFileSync(out, JSON.stringify(report, null, 2));
console.error(`written: ${out} (${units.length} units, ${coveredLines} covered lines)`);
