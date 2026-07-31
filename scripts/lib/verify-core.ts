import type { CoverageMap } from "./types.ts";
import { toKeySets } from "./istanbul.ts";

export interface RetentionResult {
  lineRetention: number;
  branchRetention: number;
  baselineLines: number;
  currentLines: number;
  /** Source files ranked by how many baseline-covered lines they lost. */
  lostByFile: { file: string; lostLines: number }[];
}

/**
 * How much of the baseline's covered universe the current run still covers.
 * Retention is |current ∩ baseline| / |baseline| — coverage of new code added
 * since the baseline neither helps nor hurts.
 */
export function computeRetention(baseline: CoverageMap, current: CoverageMap): RetentionResult {
  const base = toKeySets(baseline);
  const cur = toKeySets(current);
  let keptLines = 0;
  for (const k of base.lines) if (cur.lines.has(k)) keptLines += 1;
  let keptBranches = 0;
  for (const k of base.branches) if (cur.branches.has(k)) keptBranches += 1;

  const lostByFile: { file: string; lostLines: number }[] = [];
  for (const [file, cov] of Object.entries(baseline)) {
    const curLines = new Set(current[file]?.lines ?? []);
    const lost = cov.lines.filter((l) => !curLines.has(l)).length;
    if (lost > 0) lostByFile.push({ file, lostLines: lost });
  }
  lostByFile.sort((a, b) => b.lostLines - a.lostLines || (a.file < b.file ? -1 : 1));

  return {
    lineRetention: base.lines.size === 0 ? 1 : keptLines / base.lines.size,
    branchRetention: base.branches.size === 0 ? 1 : keptBranches / base.branches.size,
    baselineLines: base.lines.size,
    currentLines: cur.lines.size,
    lostByFile,
  };
}

/** Subset of the mutation-testing-elements report schema Stryker emits. */
export interface MutationReport {
  files?: Record<string, { mutants?: { status?: string }[] }>;
}

export interface MutationScore {
  applicable: boolean;
  /** Percentage 0–100, Stryker's definition: detected / (detected + undetected). */
  score: number | null;
  detected: number;
  undetected: number;
  byStatus: Record<string, number>;
}

const DETECTED = new Set(["Killed", "Timeout"]);
const UNDETECTED = new Set(["Survived", "NoCoverage"]);

export function mutationScore(report: MutationReport): MutationScore {
  const byStatus: Record<string, number> = {};
  let detected = 0;
  let undetected = 0;
  for (const file of Object.values(report.files ?? {})) {
    for (const m of file.mutants ?? []) {
      const status = m.status ?? "Unknown";
      byStatus[status] = (byStatus[status] ?? 0) + 1;
      if (DETECTED.has(status)) detected += 1;
      else if (UNDETECTED.has(status)) undetected += 1;
    }
  }
  const valid = detected + undetected;
  return {
    applicable: valid > 0,
    score: valid === 0 ? null : (detected / valid) * 100,
    detected,
    undetected,
    byStatus,
  };
}
