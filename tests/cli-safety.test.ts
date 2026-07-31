import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");

function invoke(script: string, args: string[]) {
  return spawnSync(process.execPath, ["--import", "tsx", resolve(root, script), ...args], {
    cwd: root,
    encoding: "utf8",
  });
}

function report(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    tool: "test-suite-doctor",
    createdAt: new Date(0).toISOString(),
    cwd: root,
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
        wallMs: 1,
        status: "passed",
        coverage: { "src/a.ts": { lines: [1], branches: [] } },
      },
    ],
    ...overrides,
  };
}

describe("CLI fail-closed safety", () => {
  it.each([
    ["--branch-floor", "NaN"],
    ["--runtime-budget-ms", "1.5"],
    ["--w-lines", "Infinity"],
  ])("minimize rejects invalid %s before writing outputs", (flag, value) => {
    const dir = mkdtempSync(join(tmpdir(), "doctor-cli-"));
    const reportPath = join(dir, "report.json");
    const planPath = join(dir, "plan.json");
    writeFileSync(reportPath, JSON.stringify(report()));

    const result = invoke("scripts/minimize.ts", [
      "--report",
      reportPath,
      "--out-plan",
      planPath,
      "--out-md",
      join(dir, "plan.md"),
      flag,
      value,
    ]);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain(flag);
    expect(() => readFileSync(planPath)).toThrow();
  });

  it("minimize refuses incomplete collection by default", () => {
    const dir = mkdtempSync(join(tmpdir(), "doctor-cli-"));
    const reportPath = join(dir, "report.json");
    writeFileSync(
      reportPath,
      JSON.stringify(
        report({
          collectionErrors: [{ id: "broken.test.ts", reason: "timed out" }],
          units: [
            ...(report().units as unknown[]),
            {
              id: "broken.test.ts",
              file: "broken.test.ts",
              testName: null,
              tests: [],
              runtimeMs: 0,
              wallMs: 10,
              status: "error",
              coverage: {},
            },
          ],
        }),
      ),
    );

    const result = invoke("scripts/minimize.ts", ["--report", reportPath]);
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/incomplete|collectionErrors/i);
  });

  it("verify rejects an invalid coverage floor before running the suite", () => {
    const dir = mkdtempSync(join(tmpdir(), "doctor-cli-"));
    const reportPath = join(dir, "report.json");
    writeFileSync(reportPath, JSON.stringify(report()));

    const result = invoke("scripts/verify.ts", [
      "--baseline",
      reportPath,
      "--cwd",
      root,
      "--coverage-floor",
      "nope",
    ]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("--coverage-floor");
    expect(result.stderr).not.toContain("running the current suite");
  });
});
