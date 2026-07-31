/**
 * Shared data shapes for test-suite-doctor.
 *
 * All artifacts are versioned JSON so any agent (or CI job) can consume them
 * without running the producing script again.
 */

export type Runner = "vitest" | "jest";
export type Granularity = "file" | "test";

export interface TestCaseInfo {
  /** Full test name including describe blocks. */
  fullName: string;
  status: string;
  durationMs: number;
}

export interface FileCoverage {
  /** Sorted 1-based line numbers with at least one hit. */
  lines: number[];
  /** Covered branch keys, formatted "branchId.pathIndex". */
  branches: string[];
}

/** Coverage keyed by source file path (relative to the target repo root). */
export type CoverageMap = Record<string, FileCoverage>;

export interface UnitMetrics {
  /** Unique id: the test file path, or "file::full test name" at test granularity. */
  id: string;
  file: string;
  /** Set only at test granularity. */
  testName: string | null;
  tests: TestCaseInfo[];
  /** Sum of individual test durations — excludes runner startup overhead. */
  runtimeMs: number;
  /** Wall-clock time of the isolated child run (includes startup). */
  wallMs: number;
  status: "passed" | "failed" | "mixed" | "empty" | "error";
  coverage: CoverageMap;
  /** v2 structured identity; id remains human-readable display text. */
  identity?: { file: string; testName: string | null };
  /** Duplicate full names in one file are measured as one inseparable group. */
  memberCount?: number;
  assertionMs?: number;
  fileMs?: number | null;
  optimizationMs?: number;
  costSource?: "runner-file" | "assertion-sum" | "process-wall" | "legacy";
}

export interface CoverageTotals {
  coveredLines: number;
  totalLines: number;
  coveredBranches: number;
  totalBranches: number;
}

import type { Provenance } from "./provenance.ts";

export interface MetricsReport {
  version: 2;
  tool: "test-suite-doctor";
  toolVersion: string;
  runId: string;
  createdAt: string;
  cwd: string;
  runner: Runner;
  granularity: Granularity;
  options: Record<string, unknown>;
  scope: { mode: "full" | "filtered"; filter: string | null; testFiles: string[] };
  environment: {
    node: string;
    platform: NodeJS.Platform;
    arch: string;
    runner: { name: Runner; version: string; executable: string };
    coverageProvider: { name: string; version: string } | null;
  };
  provenance: Provenance;
  baseline: CoverageTotals & {
    totalTests: number;
    totalRuntimeMs: number;
    wallMs: number;
  };
  /** Whole-suite coverage from the baseline run — the universe verify.ts compares against. */
  baselineCoverage: CoverageMap;
  /** Units that produced no usable data. Investigate these before trusting a plan. */
  collectionErrors: { id: string; reason: string }[];
  units: UnitMetrics[];
}

export interface KeepEntry {
  id: string;
  reason: string;
  newLines: number;
  newBranches: number;
  runtimeMs: number;
  /** Fraction of baseline covered lines reached after selecting this unit. */
  cumulativeLineRetention: number;
  cumulativeBranchRetention: number;
}

export interface DropEntry {
  id: string;
  reason: string;
  /** Lines this unit would still add on top of the kept set (0 = fully redundant). */
  residualLines: number;
  residualBranches: number;
  /** Kept unit with the largest line overlap, for human review. */
  bestOverlapWith: string | null;
  bestLineOverlapWith: string | null;
  bestLineOverlapCount: number;
  bestBranchOverlapWith: string | null;
  bestBranchOverlapCount: number;
}

export interface MinimizePlan {
  version: 2;
  tool: "test-suite-doctor";
  createdAt: string;
  granularity: Granularity;
  options: Record<string, unknown>;
  summary: {
    unitsTotal: number;
    unitsKept: number;
    unitsDropped: number;
    baselineCoveredLines: number;
    keptCoveredLines: number;
    /** kept ∩ baseline / baseline covered lines. */
    lineRetention: number;
    baselineCoveredBranches: number;
    keptCoveredBranches: number;
    branchRetention: number;
    keptRuntimeMs: number;
    totalRuntimeMs: number;
    warnings: string[];
  };
  keep: KeepEntry[];
  drop: DropEntry[];
  sourceReport?: {
    version: 1 | 2;
    runId: string;
    legacy: boolean;
    fingerprint: string | null;
  };
  scope?: MetricsReport["scope"];
  provenance?: Provenance;
  trusted?: boolean;
}
