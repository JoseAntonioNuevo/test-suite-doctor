import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { normalizeMetricsReport } from "../scripts/lib/report-loader.ts";
import { minimize } from "../scripts/lib/greedy.ts";

const root = resolve(import.meta.dirname, "..");
const load = (name: string) =>
  JSON.parse(readFileSync(resolve(root, `schemas/${name}.schema.json`), "utf8"));

const legacy = {
  version: 1,
  tool: "test-suite-doctor",
  createdAt: new Date(0).toISOString(),
  cwd: "/repo",
  runner: "vitest",
  granularity: "file",
  baseline: {
    totalTests: 1,
    totalRuntimeMs: 1,
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
      tests: [{ fullName: "passes", status: "passed", durationMs: 1 }],
      runtimeMs: 1,
      wallMs: 2,
      status: "passed",
      coverage: { "src/a.ts": { lines: [1], branches: [] } },
    },
  ],
};

describe("v2 artifact JSON schemas", () => {
  const ajv = new Ajv({ allErrors: true, strict: true });

  it("validates normalized metrics and rejects a missing scope", () => {
    const validate = ajv.compile(load("metrics-v2"));
    const metrics = normalizeMetricsReport(legacy).report;
    expect(validate(metrics), JSON.stringify(validate.errors)).toBe(true);
    expect(validate({ ...metrics, scope: undefined })).toBe(false);
  });

  it("validates a v2 plan with provenance linkage", () => {
    const validate = ajv.compile(load("plan-v2"));
    const metrics = normalizeMetricsReport(legacy).report;
    const plan = minimize(metrics.units, metrics.baselineCoverage, { coverageFloor: 1 });
    plan.sourceReport = { version: 1, runId: metrics.runId, legacy: true, fingerprint: null };
    plan.scope = metrics.scope;
    plan.provenance = metrics.provenance;
    plan.trusted = false;
    expect(validate(plan), JSON.stringify(validate.errors)).toBe(true);
  });

  it("validates a structured v2 verdict", () => {
    const validate = ajv.compile(load("verdict-v2"));
    expect(
      validate({
        version: 2,
        tool: "test-suite-doctor",
        toolVersion: "0.2.0",
        runId: "verify-1",
        createdAt: new Date(0).toISOString(),
        outcome: "passed",
        pass: true,
        trusted: true,
        failures: [],
        reasonCodes: [],
        scope: { mode: "full", filter: null, testFiles: ["a.test.ts"] },
        provenance: {
          baselineFingerprint: "a",
          currentFingerprint: "a",
          mismatches: [],
          overridden: false,
        },
        suite: { outcome: { green: true, kind: "passed", reasons: [] }, wallMs: 1 },
        totalTests: 1,
        failedTests: 0,
        lineRetention: 1,
        branchRetention: 1,
        absoluteLineCoverage: 1,
        absoluteBranchCoverage: 1,
        lostByFile: [],
        mutation: null,
      }),
    ).toBe(true);
  });
});
