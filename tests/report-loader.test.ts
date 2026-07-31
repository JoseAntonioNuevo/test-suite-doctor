import { describe, expect, it } from "vitest";
import { normalizeMetricsReport } from "../scripts/lib/report-loader.ts";

const legacy = {
  version: 1,
  tool: "test-suite-doctor",
  createdAt: new Date(0).toISOString(),
  cwd: "/repo",
  runner: "vitest",
  granularity: "file",
  baseline: {
    totalTests: 1,
    totalRuntimeMs: 4,
    coveredLines: 1,
    totalLines: 1,
    coveredBranches: 0,
    totalBranches: 0,
  },
  baselineCoverage: { "src/a.ts": { lines: [1], branches: [] } },
  collectionErrors: [],
  units: [
    {
      id: "a.test.ts",
      file: "a.test.ts",
      testName: null,
      tests: [{ fullName: "passes", status: "passed", durationMs: 4 }],
      runtimeMs: 4,
      wallMs: 10,
      status: "passed",
      coverage: { "src/a.ts": { lines: [1], branches: [] } },
    },
  ],
};

describe("metrics report loading", () => {
  it("normalizes v1 reports as legacy-unverified input", () => {
    const normalized = normalizeMetricsReport(legacy);
    expect(normalized.sourceVersion).toBe(1);
    expect(normalized.legacy).toBe(true);
    expect(normalized.report.version).toBe(2);
    expect(normalized.report.units[0]).toEqual(
      expect.objectContaining({
        identity: { file: "a.test.ts", testName: null },
        memberCount: 1,
        assertionMs: 4,
        optimizationMs: 4,
        costSource: "legacy",
      }),
    );
  });

  it("rejects unknown future versions", () => {
    expect(() => normalizeMetricsReport({ ...legacy, version: 99 })).toThrow(/version 99|unsupported/i);
  });

  it("rejects malformed reports instead of permissively casting them", () => {
    expect(() => normalizeMetricsReport({ version: 2, tool: "test-suite-doctor" })).toThrow(
      /malformed|missing/i,
    );
  });
});
