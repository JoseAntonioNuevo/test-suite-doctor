import type {
  CoverageMap,
  DropEntry,
  Granularity,
  KeepEntry,
  MinimizePlan,
  UnitMetrics,
} from "./types.ts";
import { intersectionSize, toKeySets } from "./istanbul.ts";

export interface GreedyOptions {
  /** Stop once kept coverage reaches this fraction of baseline covered lines. */
  coverageFloor: number;
  /** Optional additional floor on baseline covered branches. */
  branchFloor: number | null;
  /** Aspirational unit count. Coverage floors win unless strictCount is set. */
  targetCount: number | null;
  /** Hard-stop at targetCount even if floors are unmet (emits a warning). */
  strictCount: boolean;
  /** Stop before kept runtime exceeds this budget (emits a warning if floors unmet). */
  runtimeBudgetMs: number | null;
  weightLines: number;
  weightBranches: number;
  /** Units whose id matches any pattern are always kept, selected first. */
  forceKeep: RegExp[];
}

export const DEFAULT_OPTIONS: GreedyOptions = {
  coverageFloor: 0.97,
  branchFloor: null,
  targetCount: null,
  strictCount: false,
  runtimeBudgetMs: null,
  weightLines: 1,
  weightBranches: 1,
  forceKeep: [],
};

interface Candidate {
  unit: UnitMetrics;
  lines: Set<string>;
  branches: Set<string>;
  /** Upper bound on this candidate's score (gains only shrink as coverage grows). */
  cachedScore: number;
  cachedNewLines: number;
  cachedNewBranches: number;
}

function scoreOf(newLines: number, newBranches: number, runtimeMs: number, o: GreedyOptions): number {
  return (o.weightLines * newLines + o.weightBranches * newBranches) / Math.max(runtimeMs, 1);
}

/**
 * Coverage-guided greedy weighted-sum minimization (lazy-greedy / CELF-style).
 *
 * Repeatedly selects the unit with the best ratio of newly covered lines and
 * branches per millisecond of test runtime, until the configured floors are
 * met. Marginal gain is submodular — a candidate's gain can only shrink as
 * coverage grows — so stale cached scores are valid upper bounds and most
 * candidates are skipped without recomputation each round.
 */
export function minimize(
  units: UnitMetrics[],
  baseline: CoverageMap,
  optsIn: Partial<GreedyOptions> = {},
): MinimizePlan {
  const o: GreedyOptions = { ...DEFAULT_OPTIONS, ...optsIn };
  const warnings: string[] = [];

  let baseKeys = toKeySets(baseline);
  if (baseKeys.lines.size === 0) {
    warnings.push("Baseline coverage is empty — using the union of per-unit coverage as the universe.");
    const union: Set<string> = new Set();
    const unionB: Set<string> = new Set();
    for (const u of units) {
      const k = toKeySets(u.coverage);
      for (const key of k.lines) union.add(key);
      for (const key of k.branches) unionB.add(key);
    }
    baseKeys = { lines: union, branches: unionB };
  }

  // Only coverage of the baseline universe counts — isolated runs sometimes
  // touch lines the full-suite run never did, and those must not inflate gain.
  const candidates: Candidate[] = units.map((unit) => {
    const k = toKeySets(unit.coverage);
    const lines = new Set([...k.lines].filter((key) => baseKeys.lines.has(key)));
    const branches = new Set([...k.branches].filter((key) => baseKeys.branches.has(key)));
    return {
      unit,
      lines,
      branches,
      cachedScore: scoreOf(lines.size, branches.size, unit.runtimeMs, o),
      cachedNewLines: lines.size,
      cachedNewBranches: branches.size,
    };
  });

  const covered = new Set<string>();
  const coveredBranches = new Set<string>();
  const keep: KeepEntry[] = [];
  const keptSet = new Set<string>();
  let keptRuntime = 0;

  const lineRetention = () => (baseKeys.lines.size === 0 ? 1 : covered.size / baseKeys.lines.size);
  const branchRetention = () =>
    baseKeys.branches.size === 0 ? 1 : coveredBranches.size / baseKeys.branches.size;
  const floorsMet = () =>
    lineRetention() >= o.coverageFloor && (o.branchFloor == null || branchRetention() >= o.branchFloor);

  const select = (c: Candidate, reason: string) => {
    let newLines = 0;
    for (const key of c.lines) if (!covered.has(key)) newLines += 1;
    let newBranches = 0;
    for (const key of c.branches) if (!coveredBranches.has(key)) newBranches += 1;
    for (const key of c.lines) covered.add(key);
    for (const key of c.branches) coveredBranches.add(key);
    keptRuntime += c.unit.runtimeMs;
    keptSet.add(c.unit.id);
    keep.push({
      id: c.unit.id,
      reason,
      newLines,
      newBranches,
      runtimeMs: c.unit.runtimeMs,
      cumulativeLineRetention: round4(lineRetention()),
    });
  };

  // 1. Force-kept units first, in input order (stable and predictable).
  for (const c of candidates) {
    if (o.forceKeep.some((re) => re.test(c.unit.id))) {
      select(c, "force-kept (--keep pattern)");
    }
  }

  // 2. Lazy-greedy selection loop.
  for (;;) {
    if (floorsMet()) break;
    if (o.strictCount && o.targetCount != null && keep.length >= o.targetCount) {
      warnings.push(
        `Stopped at --target-count ${o.targetCount} with line retention ` +
          `${pct(lineRetention())} below the ${pct(o.coverageFloor)} floor (--strict-count).`,
      );
      break;
    }

    const open = candidates.filter((c) => !keptSet.has(c.unit.id));
    if (open.length === 0) break;
    // Sort by cached upper bound; recompute exact gains only until the bound
    // guarantees no remaining candidate can beat the current best.
    open.sort(
      (a, b) =>
        b.cachedScore - a.cachedScore ||
        a.unit.runtimeMs - b.unit.runtimeMs ||
        (a.unit.id < b.unit.id ? -1 : 1),
    );
    let best: Candidate | null = null;
    let bestScore = -1;
    for (const c of open) {
      if (best && c.cachedScore <= bestScore) break;
      let newLines = 0;
      for (const key of c.lines) if (!covered.has(key)) newLines += 1;
      let newBranches = 0;
      for (const key of c.branches) if (!coveredBranches.has(key)) newBranches += 1;
      c.cachedNewLines = newLines;
      c.cachedNewBranches = newBranches;
      c.cachedScore = scoreOf(newLines, newBranches, c.unit.runtimeMs, o);
      const better =
        c.cachedScore > bestScore ||
        (best !== null &&
          c.cachedScore === bestScore &&
          (c.unit.runtimeMs < best.unit.runtimeMs ||
            (c.unit.runtimeMs === best.unit.runtimeMs && c.unit.id < best.unit.id)));
      if (best === null || better) {
        best = c;
        bestScore = c.cachedScore;
      }
    }
    if (!best || best.cachedNewLines + best.cachedNewBranches === 0) {
      if (!floorsMet()) {
        warnings.push(
          `Exhausted useful units at ${pct(lineRetention())} line retention — the per-unit ` +
            `coverage union cannot reach the ${pct(o.coverageFloor)} floor. Check collectionErrors ` +
            "in the metrics report (crashed units contribute no coverage).",
        );
      }
      break;
    }
    if (o.runtimeBudgetMs != null && keptRuntime + best.unit.runtimeMs > o.runtimeBudgetMs) {
      warnings.push(
        `Stopped at the --runtime-budget-ms ${o.runtimeBudgetMs} budget with line retention ${pct(lineRetention())}.`,
      );
      break;
    }
    select(
      best,
      `+${best.cachedNewLines} lines, +${best.cachedNewBranches} branches for ${Math.round(best.unit.runtimeMs)}ms`,
    );
  }

  if (!o.strictCount && o.targetCount != null && keep.length > o.targetCount) {
    warnings.push(
      `Coverage floor ${pct(o.coverageFloor)} required ${keep.length} units — above the ` +
        `--target-count ${o.targetCount} aspiration. Raise the target, lower the floor, or improve test quality.`,
    );
  }

  // 3. Justify every drop.
  const keptCandidates = candidates.filter((c) => keptSet.has(c.unit.id));
  const drop: DropEntry[] = [];
  for (const c of candidates) {
    if (keptSet.has(c.unit.id)) continue;
    let residual = 0;
    for (const key of c.lines) if (!covered.has(key)) residual += 1;
    let bestOverlap: string | null = null;
    let bestOverlapSize = 0;
    for (const k of keptCandidates) {
      const overlap = intersectionSize(c.lines, k.lines);
      if (overlap > bestOverlapSize) {
        bestOverlapSize = overlap;
        bestOverlap = k.unit.id;
      }
    }
    drop.push({
      id: c.unit.id,
      residualLines: residual,
      bestOverlapWith: bestOverlap,
      reason:
        residual === 0
          ? "adds no line coverage beyond the kept set"
          : `would add only ${residual} lines — below the stopping thresholds`,
    });
  }
  drop.sort((a, b) => a.residualLines - b.residualLines || (a.id < b.id ? -1 : 1));

  const totalRuntime = units.reduce((s, u) => s + u.runtimeMs, 0);
  return {
    version: 1,
    tool: "test-suite-doctor",
    createdAt: new Date().toISOString(),
    granularity: (units[0]?.testName != null ? "test" : "file") as Granularity,
    options: {
      coverageFloor: o.coverageFloor,
      branchFloor: o.branchFloor,
      targetCount: o.targetCount,
      strictCount: o.strictCount,
      runtimeBudgetMs: o.runtimeBudgetMs,
      weightLines: o.weightLines,
      weightBranches: o.weightBranches,
      forceKeep: o.forceKeep.map((r) => r.source),
    },
    summary: {
      unitsTotal: units.length,
      unitsKept: keep.length,
      unitsDropped: drop.length,
      baselineCoveredLines: baseKeys.lines.size,
      keptCoveredLines: covered.size,
      lineRetention: round4(lineRetention()),
      baselineCoveredBranches: baseKeys.branches.size,
      keptCoveredBranches: coveredBranches.size,
      branchRetention: round4(branchRetention()),
      keptRuntimeMs: Math.round(keptRuntime),
      totalRuntimeMs: Math.round(totalRuntime),
      warnings,
    },
    keep,
    drop,
  };
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}
