import { join, resolve } from "node:path";
import type { Runner, TestCaseInfo } from "./types.ts";

export interface RunSpec {
  /** Arguments for `npx` (first element is the runner binary). */
  args: string[];
  /** Absolute path the runner writes its Jest-format JSON results to. */
  resultsFile: string;
  /** Absolute directory the runner writes coverage-final.json into. */
  coverageDir: string;
}

/**
 * Build the runner invocation for one measured run.
 * Both runners write two artifacts we parse afterwards:
 *  - a Jest-compatible JSON results file (per-test names, status, duration)
 *  - an istanbul `coverage-final.json` (per-source-file statement/branch hits)
 */
export function buildRunSpec(
  runner: Runner,
  opts: {
    scratchDir: string;
    label: string;
    testFile?: string;
    testNamePattern?: string;
    extraArgs?: string[];
  },
): RunSpec {
  const base = resolve(opts.scratchDir, opts.label);
  const resultsFile = join(base, "results.json");
  const coverageDir = join(base, "coverage");
  const extra = opts.extraArgs ?? [];

  if (runner === "vitest") {
    const args = [
      "vitest",
      "run",
      ...(opts.testFile ? [opts.testFile] : []),
      "--coverage",
      "--coverage.reporter=json",
      `--coverage.reportsDirectory=${coverageDir}`,
      "--reporter=json",
      `--outputFile=${resultsFile}`,
      "--silent",
      ...(opts.testNamePattern ? ["-t", opts.testNamePattern] : []),
      ...extra,
    ];
    return { args, resultsFile, coverageDir };
  }

  const args = [
    "jest",
    ...(opts.testFile ? ["--runTestsByPath", opts.testFile] : []),
    "--coverage",
    "--coverageReporters=json",
    `--coverageDirectory=${coverageDir}`,
    "--json",
    `--outputFile=${resultsFile}`,
    "--silent",
    // Neutralize configured thresholds: a single-file run would always fail them.
    "--coverageThreshold",
    "{}",
    ...(opts.testNamePattern ? ["-t", opts.testNamePattern] : []),
    ...extra,
  ];
  return { args, resultsFile, coverageDir };
}

/** Jest-format results file (Vitest's json reporter emits the same shape). */
export interface JestResultsFile {
  numTotalTests?: number;
  testResults?: {
    name?: string;
    message?: string;
    assertionResults?: {
      fullName?: string;
      title?: string;
      status?: string;
      duration?: number | null;
    }[];
  }[];
}

export interface ParsedResults {
  tests: TestCaseInfo[];
  /** Absolute test file paths as reported by the runner. */
  files: string[];
  totalTests: number;
}

export function parseResultsFile(raw: JestResultsFile): ParsedResults {
  const tests: TestCaseInfo[] = [];
  const files: string[] = [];
  for (const fileResult of raw.testResults ?? []) {
    if (fileResult.name) files.push(fileResult.name);
    for (const t of fileResult.assertionResults ?? []) {
      tests.push({
        fullName: t.fullName || t.title || "(unnamed test)",
        status: t.status ?? "unknown",
        durationMs: typeof t.duration === "number" ? t.duration : 0,
      });
    }
  }
  return { tests, files, totalTests: raw.numTotalTests ?? tests.length };
}

/** Escape a test name so `-t` matches it exactly (both runners treat -t as a regex). */
export function exactNamePattern(name: string): string {
  return `^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`;
}
