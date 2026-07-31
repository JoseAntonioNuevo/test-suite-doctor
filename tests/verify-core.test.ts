import { describe, expect, it } from "vitest";
import { computeRetention, mutationScore } from "../scripts/lib/verify-core.ts";
import type { CoverageMap } from "../scripts/lib/types.ts";

describe("coverage retention", () => {
  const baseline: CoverageMap = {
    "src/a.ts": { lines: [1, 2, 3], branches: ["0.0"] },
    "src/b.ts": { lines: [10, 20], branches: [] },
  };

  it("computes line and branch retention against the baseline universe", () => {
    const current: CoverageMap = {
      "src/a.ts": { lines: [1, 2], branches: [] },
      "src/b.ts": { lines: [10, 20], branches: [] },
    };
    const r = computeRetention(baseline, current);
    expect(r.lineRetention).toBeCloseTo(4 / 5);
    expect(r.branchRetention).toBe(0);
    expect(r.lostByFile).toEqual([{ file: "src/a.ts", lostLines: 1 }]);
  });

  it("does not let coverage of new code inflate retention above 1", () => {
    const current: CoverageMap = {
      "src/a.ts": { lines: [1, 2, 3, 4, 5, 6], branches: ["0.0", "0.1"] },
      "src/b.ts": { lines: [10, 20], branches: [] },
      "src/new.ts": { lines: [1, 2, 3], branches: [] },
    };
    const r = computeRetention(baseline, current);
    expect(r.lineRetention).toBe(1);
    expect(r.branchRetention).toBe(1);
    expect(r.lostByFile).toEqual([]);
  });

  it("ranks lost files by damage for the regeneration report", () => {
    const current: CoverageMap = { "src/a.ts": { lines: [1], branches: [] } };
    const r = computeRetention(baseline, current);
    expect(r.lostByFile).toEqual([
      { file: "src/a.ts", lostLines: 2 },
      { file: "src/b.ts", lostLines: 2 },
    ]);
  });
});

describe("mutation score", () => {
  it("computes Stryker's detected/(detected+undetected) formula", () => {
    const report = {
      files: {
        "src/a.ts": {
          mutants: [
            { status: "Killed" },
            { status: "Timeout" },
            { status: "Survived" },
            { status: "NoCoverage" },
            { status: "CompileError" }, // invalid mutants don't count
            { status: "Ignored" },
          ],
        },
      },
    };
    const s = mutationScore(report);
    expect(s.detected).toBe(2);
    expect(s.undetected).toBe(2);
    expect(s.score).toBe(50);
    expect(s.byStatus["CompileError"]).toBe(1);
  });

  it("treats an empty report as a perfect score rather than dividing by zero", () => {
    expect(mutationScore({}).score).toBe(100);
  });
});
