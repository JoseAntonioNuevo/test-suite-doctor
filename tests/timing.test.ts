import { describe, expect, it } from "vitest";
import { selectOptimizationCost } from "../scripts/lib/timing.ts";
import type { UnitMetrics } from "../scripts/lib/types.ts";

const unit = {
  id: "a.test.ts",
  file: "a.test.ts",
  testName: null,
  tests: [],
  runtimeMs: 4,
  assertionMs: 4,
  fileMs: 30,
  wallMs: 100,
  status: "passed",
  coverage: {},
} satisfies UnitMetrics;

describe("optimization cost selection", () => {
  it("uses runner file duration for file-granularity auto cost", () => {
    expect(selectOptimizationCost(unit, "file", "auto")).toEqual({
      optimizationMs: 30,
      costSource: "runner-file",
    });
  });

  it("uses assertion duration for test granularity and file fallback", () => {
    expect(selectOptimizationCost(unit, "test", "auto")).toEqual({
      optimizationMs: 4,
      costSource: "assertion-sum",
    });
    expect(selectOptimizationCost({ ...unit, fileMs: null }, "file", "auto")).toEqual({
      optimizationMs: 4,
      costSource: "assertion-sum",
    });
  });

  it("uses process wall time only when explicitly requested", () => {
    expect(selectOptimizationCost(unit, "file", "wall")).toEqual({
      optimizationMs: 100,
      costSource: "process-wall",
    });
  });
});
