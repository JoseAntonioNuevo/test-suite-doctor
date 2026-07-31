import { isAbsolute, relative } from "node:path";
import type { CoverageMap, CoverageTotals, FileCoverage } from "./types.ts";

/**
 * Minimal shape of one file entry in an istanbul `coverage-final.json`.
 * Both Jest (babel/v8 providers) and Vitest (v8/istanbul providers) emit this
 * format when the `json` coverage reporter is enabled.
 */
export interface IstanbulFileCoverage {
  path?: string;
  statementMap: Record<string, { start: { line: number } }>;
  s: Record<string, number>;
  branchMap?: Record<string, unknown>;
  b?: Record<string, number[]>;
}

export interface ParsedCoverage {
  files: CoverageMap;
  totals: CoverageTotals;
}

function normalizePath(file: string, cwd: string): string {
  let p = file;
  if (isAbsolute(p)) {
    const rel = relative(cwd, p);
    if (!rel.startsWith("..")) p = rel;
  }
  return p.replace(/\\/g, "/");
}

/**
 * Reduce an istanbul coverage map to covered/total line and branch sets.
 * Line coverage is derived from statement start lines (istanbul convention).
 */
export function parseCoverageFinal(
  raw: Record<string, IstanbulFileCoverage>,
  cwd: string,
): ParsedCoverage {
  const files: CoverageMap = {};
  const totals: CoverageTotals = { coveredLines: 0, totalLines: 0, coveredBranches: 0, totalBranches: 0 };

  for (const [file, cov] of Object.entries(raw)) {
    const covered = new Set<number>();
    const all = new Set<number>();
    for (const [sid, loc] of Object.entries(cov.statementMap ?? {})) {
      const line = loc.start?.line;
      if (typeof line !== "number") continue;
      all.add(line);
      if ((cov.s?.[sid] ?? 0) > 0) covered.add(line);
    }
    const coveredBranches: string[] = [];
    let branchTotal = 0;
    for (const [bid, hits] of Object.entries(cov.b ?? {})) {
      hits.forEach((count, i) => {
        branchTotal += 1;
        if (count > 0) coveredBranches.push(`${bid}.${i}`);
      });
    }
    const key = normalizePath(file, cwd);
    files[key] = {
      lines: [...covered].sort((a, b) => a - b),
      branches: coveredBranches.sort(),
    };
    totals.coveredLines += covered.size;
    totals.totalLines += all.size;
    totals.coveredBranches += coveredBranches.length;
    totals.totalBranches += branchTotal;
  }
  return { files, totals };
}

export interface KeySets {
  /** "file:line" keys. */
  lines: Set<string>;
  /** "file:branchId.pathIndex" keys. */
  branches: Set<string>;
}

/** Flatten a coverage map into globally unique line/branch keys. */
export function toKeySets(map: CoverageMap): KeySets {
  const lines = new Set<string>();
  const branches = new Set<string>();
  for (const [file, cov] of Object.entries(map)) {
    for (const line of cov.lines) lines.add(`${file}:${line}`);
    for (const b of cov.branches) branches.add(`${file}:${b}`);
  }
  return { lines, branches };
}

export function intersectionSize(a: Set<string>, b: Set<string>): number {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let n = 0;
  for (const k of small) if (large.has(k)) n += 1;
  return n;
}
