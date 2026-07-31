import { describe, expect, it } from "vitest";
import { minimize } from "../scripts/lib/greedy.ts";
import { renderPlanMarkdown } from "../scripts/lib/render.ts";
import type { CoverageMap, UnitMetrics } from "../scripts/lib/types.ts";

function unit(
  id: string,
  coverage: Record<string, { lines: number[]; branches?: string[] }>,
  runtimeMs: number,
): UnitMetrics {
  const cov: CoverageMap = {};
  for (const [file, c] of Object.entries(coverage)) {
    cov[file] = { lines: c.lines, branches: c.branches ?? [] };
  }
  return {
    id,
    file: id,
    testName: null,
    tests: [{ fullName: id, status: "passed", durationMs: runtimeMs }],
    runtimeMs,
    wallMs: runtimeMs,
    status: "passed",
    coverage: cov,
  };
}

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

const baseline10: CoverageMap = { "src/a.ts": { lines: range(1, 10), branches: [] } };

describe("greedy minimization", () => {
  it("selects by newly-covered-lines per runtime ratio, not raw coverage", () => {
    // A covers everything but is slow; B covers 8 lines cheaply → B goes first.
    const A = unit("A", { "src/a.ts": { lines: range(1, 10) } }, 100);
    const B = unit("B", { "src/a.ts": { lines: range(1, 8) } }, 10);
    const plan = minimize([A, B], baseline10, { coverageFloor: 0.97 });
    expect(plan.keep.map((k) => k.id)).toEqual(["B", "A"]);
    expect(plan.keep[1].newLines).toBe(2); // A only contributes lines 9–10 by then
    expect(plan.summary.lineRetention).toBe(1);
  });

  it("stops as soon as the coverage floor is met and justifies the leftovers", () => {
    const A = unit("A", { "src/a.ts": { lines: range(1, 9) } }, 10);
    const B = unit("B", { "src/a.ts": { lines: [10] } }, 10);
    const C = unit("C", { "src/a.ts": { lines: range(1, 3) } }, 1);
    const plan = minimize([A, B, C], baseline10, { coverageFloor: 0.9 });
    // C wins round 1 (3 lines / 1ms), A completes the floor (9/10 = 0.9).
    expect(plan.keep.map((k) => k.id)).toEqual(["C", "A"]);
    expect(plan.summary.lineRetention).toBe(0.9);
    const dropB = plan.drop.find((d) => d.id === "B");
    expect(dropB?.residualLines).toBe(1);
    expect(dropB?.reason).toContain("below the stopping thresholds");
  });

  it("marks fully redundant units with residual 0 and the covering unit", () => {
    const A = unit("A", { "src/a.ts": { lines: range(1, 10) } }, 10);
    const C = unit("C", { "src/a.ts": { lines: range(1, 5) } }, 10);
    const plan = minimize([A, C], baseline10, { coverageFloor: 0.97 });
    expect(plan.keep.map((k) => k.id)).toEqual(["A"]);
    const dropC = plan.drop.find((d) => d.id === "C");
    expect(dropC?.residualLines).toBe(0);
    expect(dropC?.bestOverlapWith).toBe("A");
    expect(dropC?.reason).toBe("adds no line or branch coverage beyond the kept set");
  });

  it("force-keeps units matching --keep patterns even when redundant", () => {
    const A = unit("A", { "src/a.ts": { lines: range(1, 10) } }, 10);
    const slop = unit("contract/api.spec.ts", { "src/a.ts": { lines: [1] } }, 1000);
    const plan = minimize([A, slop], baseline10, {
      coverageFloor: 0.97,
      forceKeep: [/contract/],
    });
    expect(plan.keep[0].id).toBe("contract/api.spec.ts");
    expect(plan.keep[0].reason).toContain("force-kept");
    expect(plan.keep.map((k) => k.id)).toContain("A");
  });

  it("--strict-count hard-stops below the floor and warns", () => {
    const A = unit("A", { "src/a.ts": { lines: range(1, 5) } }, 10);
    const B = unit("B", { "src/a.ts": { lines: range(6, 10) } }, 10);
    const plan = minimize([A, B], baseline10, {
      coverageFloor: 0.97,
      targetCount: 1,
      strictCount: true,
    });
    expect(plan.keep).toHaveLength(1);
    expect(plan.summary.lineRetention).toBe(0.5);
    expect(plan.summary.warnings.join(" ")).toContain("--strict-count");
  });

  it("warns when the floor needs more units than the aspirational target", () => {
    const A = unit("A", { "src/a.ts": { lines: range(1, 5) } }, 10);
    const B = unit("B", { "src/a.ts": { lines: range(6, 10) } }, 10);
    const plan = minimize([A, B], baseline10, { coverageFloor: 0.97, targetCount: 1 });
    expect(plan.keep).toHaveLength(2); // coverage floor wins
    expect(plan.summary.warnings.join(" ")).toContain("--target-count 1");
  });

  it("honors an additional branch floor", () => {
    const baseline: CoverageMap = {
      "src/a.ts": { lines: range(1, 10), branches: ["0.0", "0.1"] },
    };
    const A = unit("A", { "src/a.ts": { lines: range(1, 10), branches: ["0.0"] } }, 10);
    const B = unit("B", { "src/a.ts": { lines: [1], branches: ["0.1"] } }, 10);
    const noBranches = minimize([A, B], baseline, { coverageFloor: 0.5 });
    expect(noBranches.keep.map((k) => k.id)).toEqual(["A"]);
    const withBranches = minimize([A, B], baseline, { coverageFloor: 0.5, branchFloor: 1 });
    expect(withBranches.keep.map((k) => k.id)).toEqual(["A", "B"]);
    expect(withBranches.summary.branchRetention).toBe(1);
  });

  it("stops at the runtime budget with a warning", () => {
    const A = unit("A", { "src/a.ts": { lines: range(1, 5) } }, 40);
    const B = unit("B", { "src/a.ts": { lines: range(6, 10) } }, 40);
    const plan = minimize([A, B], baseline10, { coverageFloor: 1, runtimeBudgetMs: 50 });
    expect(plan.keep).toHaveLength(1);
    expect(plan.summary.warnings.join(" ")).toContain("--runtime-budget-ms");
  });

  it("skips an unaffordable top candidate and selects a lower-scoring feasible unit", () => {
    const expensive = unit("expensive", { "src/a.ts": { lines: range(1, 10) } }, 60);
    const feasible = unit("feasible", { "src/a.ts": { lines: range(1, 4) } }, 40);
    const plan = minimize([expensive, feasible], baseline10, {
      coverageFloor: 1,
      runtimeBudgetMs: 50,
    });
    expect(plan.keep.map((entry) => entry.id)).toEqual(["feasible"]);
    expect(plan.summary.keptRuntimeMs).toBe(40);
  });

  it("uses the selected optimization cost rather than assertion duration", () => {
    const misleading = unit("misleading", { "src/a.ts": { lines: range(1, 10) } }, 1);
    misleading.optimizationMs = 100;
    const honest = unit("honest", { "src/a.ts": { lines: range(1, 10) } }, 10);
    honest.optimizationMs = 10;
    const plan = minimize([misleading, honest], baseline10, { coverageFloor: 1 });
    expect(plan.keep.map((entry) => entry.id)).toEqual(["honest"]);
    expect(plan.summary.keptRuntimeMs).toBe(10);
  });

  it("reports branch residuals and branch overlap for drop candidates", () => {
    const baseline: CoverageMap = {
      "src/a.ts": { lines: [1], branches: ["0.0", "0.1"] },
    };
    const kept = unit("kept", { "src/a.ts": { lines: [1], branches: ["0.0"] } }, 1);
    const branchOnly = unit(
      "branch-only",
      { "src/a.ts": { lines: [1], branches: ["0.1"] } },
      10,
    );
    const plan = minimize([kept, branchOnly], baseline, { coverageFloor: 1 });
    const drop = plan.drop.find((entry) => entry.id === "branch-only");
    expect(drop).toEqual(
      expect.objectContaining({
        residualLines: 0,
        residualBranches: 1,
        bestLineOverlapWith: "kept",
        bestLineOverlapCount: 1,
      }),
    );
    expect(drop?.reason).not.toContain("no line coverage");
    expect(plan.keep[0].cumulativeBranchRetention).toBe(0.5);
  });

  it("is deterministic: ties break by runtime then id, repeat runs agree", () => {
    const X = unit("X", { "src/a.ts": { lines: range(1, 10) } }, 10);
    const Y = unit("Y", { "src/a.ts": { lines: range(1, 10) } }, 10);
    const p1 = minimize([Y, X], baseline10, { coverageFloor: 0.97 });
    const p2 = minimize([Y, X], baseline10, { coverageFloor: 0.97 });
    expect(p1.keep.map((k) => k.id)).toEqual(["X"]);
    expect(p1.keep.map((k) => k.id)).toEqual(p2.keep.map((k) => k.id));
    expect(p1.drop.map((d) => d.id)).toEqual(p2.drop.map((d) => d.id));
  });

  it("warns of an unreachable floor when useful units are exhausted", () => {
    const A = unit("A", { "src/a.ts": { lines: range(1, 5) } }, 10);
    const broken = unit("broken", {}, 0); // e.g. a collection-error unit
    const plan = minimize([A, broken], baseline10, { coverageFloor: 0.97 });
    expect(plan.keep.map((k) => k.id)).toEqual(["A"]);
    expect(plan.summary.warnings.join(" ")).toContain("cannot reach");
  });

  it("falls back to the unit-coverage union when baseline is empty, with a warning", () => {
    const A = unit("A", { "src/a.ts": { lines: range(1, 5) } }, 10);
    const plan = minimize([A], {}, { coverageFloor: 0.97 });
    expect(plan.keep.map((k) => k.id)).toEqual(["A"]);
    expect(plan.summary.warnings.join(" ")).toContain("Baseline coverage is empty");
  });

  it("ignores per-unit coverage outside the baseline universe", () => {
    // Isolated runs sometimes touch lines the full-suite run never did.
    const A = unit("A", { "src/a.ts": { lines: range(1, 10) }, "src/ghost.ts": { lines: range(1, 100) } }, 10);
    const plan = minimize([A], baseline10, { coverageFloor: 0.97 });
    expect(plan.keep[0].newLines).toBe(10);
    expect(plan.summary.keptCoveredLines).toBe(10);
  });

  it("renders a markdown plan with summary, keeps, and drops", () => {
    const A = unit("A", { "src/a.ts": { lines: range(1, 10) } }, 10);
    const C = unit("C", { "src/a.ts": { lines: range(1, 5) } }, 10);
    const plan = minimize([A, C], baseline10, { coverageFloor: 0.97 });
    plan.scope = { mode: "filtered", filter: "unit", testFiles: ["A", "C"] };
    plan.trusted = false;
    const md = renderPlanMarkdown(plan);
    expect(md).toContain("# Test suite minimization plan");
    expect(md).toContain("| Units | 2 | **1** |");
    expect(md).toContain("`A`");
    expect(md).toContain("Drop candidates (1)");
    expect(md).toContain("Scoped baseline");
    expect(md).toContain("UNTRUSTED");
    expect(md).toContain("Residual branches");
  });
});
