import type { Granularity, UnitMetrics } from "./types.ts";

export type CostModel = "auto" | "assertion" | "wall";

export function selectOptimizationCost(
  unit: UnitMetrics,
  granularity: Granularity,
  model: CostModel,
): Pick<UnitMetrics, "optimizationMs" | "costSource"> {
  const assertionMs = unit.assertionMs ?? unit.runtimeMs;
  if (model === "wall") {
    return { optimizationMs: unit.wallMs, costSource: "process-wall" };
  }
  if (model === "auto" && granularity === "file" && unit.fileMs != null) {
    return { optimizationMs: unit.fileMs, costSource: "runner-file" };
  }
  return { optimizationMs: assertionMs, costSource: "assertion-sum" };
}
