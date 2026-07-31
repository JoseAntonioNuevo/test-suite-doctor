import { join, resolve } from "node:path";
import type { Runner, TestCaseInfo } from "./types.ts";

export interface RunSpec {
  /** Arguments passed to the resolved runner executable. */
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
    testFiles?: string[];
    testNamePattern?: string;
    extraArgs?: string[];
  },
): RunSpec {
  const base = resolve(opts.scratchDir, opts.label);
  const resultsFile = join(base, "results.json");
  const coverageDir = join(base, "coverage");
  const extra = opts.extraArgs ?? [];

  if (runner === "vitest") {
    const selectedFiles = opts.testFiles ?? (opts.testFile ? [opts.testFile] : []);
    const args = [
      "run",
      ...selectedFiles,
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

  const selectedFiles = opts.testFiles ?? (opts.testFile ? [opts.testFile] : []);
  const args = [
    ...(selectedFiles.length > 0 ? ["--runTestsByPath", ...selectedFiles] : []),
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
  success?: boolean;
  numFailedTests?: number;
  numFailedTestSuites?: number;
  numRuntimeErrorTestSuites?: number;
  numPassedTests?: number;
  numPendingTests?: number;
  numTodoTests?: number;
  numTotalTests?: number;
  testResults?: {
    name?: string;
    status?: string;
    startTime?: number;
    endTime?: number;
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
  success: boolean | null;
  failedTests: number;
  failedSuites: number;
  runtimeErrorSuites: number;
  fileDurations: Map<string, number>;
}

export function parseResultsFile(raw: JestResultsFile): ParsedResults {
  const tests: TestCaseInfo[] = [];
  const files: string[] = [];
  const fileDurations = new Map<string, number>();
  for (const fileResult of raw.testResults ?? []) {
    if (fileResult.name) {
      files.push(fileResult.name);
      if (
        typeof fileResult.startTime === "number" &&
        typeof fileResult.endTime === "number" &&
        fileResult.endTime >= fileResult.startTime
      ) {
        fileDurations.set(fileResult.name, fileResult.endTime - fileResult.startTime);
      }
    }
    for (const t of fileResult.assertionResults ?? []) {
      tests.push({
        fullName: t.fullName || t.title || "(unnamed test)",
        status: t.status ?? "unknown",
        durationMs: typeof t.duration === "number" ? t.duration : 0,
      });
    }
  }
  return {
    tests,
    files,
    totalTests: raw.numTotalTests ?? tests.length,
    success: typeof raw.success === "boolean" ? raw.success : null,
    failedTests:
      raw.numFailedTests ?? tests.filter((test) => test.status === "failed").length,
    failedSuites:
      raw.numFailedTestSuites ??
      (raw.testResults ?? []).filter((result) => result.status === "failed").length,
    runtimeErrorSuites: raw.numRuntimeErrorTestSuites ?? 0,
    fileDurations,
  };
}

export interface ProcessOutcome {
  code: number | null;
  signal: NodeJS.Signals | null;
  error: string | null;
  timedOut: boolean;
}

export interface ValidatedRunOutcome {
  green: boolean;
  kind: "passed" | "test-failure" | "environment-error";
  reasons: string[];
}

export function validateRunOutcome(
  process: ProcessOutcome,
  results: ParsedResults,
): ValidatedRunOutcome {
  const reasons: string[] = [];
  if (process.timedOut) reasons.push("process timed out");
  if (process.error) reasons.push(`spawn failed: ${process.error}`);
  if (process.signal) reasons.push(`process terminated by ${process.signal}`);
  if (process.code !== 0) reasons.push(`process exited ${process.code ?? "without a code"}`);
  if (results.success === false) reasons.push("suite summary reported failure");
  if (results.failedTests > 0) reasons.push(`${results.failedTests} failed test(s)`);
  if (results.failedSuites > 0) reasons.push(`${results.failedSuites} failed suite(s)`);
  if (results.runtimeErrorSuites > 0) {
    reasons.push(`${results.runtimeErrorSuites} runtime-error suite(s)`);
  }
  if (results.tests.some((test) => test.status === "failed")) {
    reasons.push("assertion results contain failures");
  }
  if (results.totalTests <= 0 || results.tests.length === 0) {
    reasons.push("suite executed no tests");
    return { green: false, kind: "environment-error", reasons };
  }
  if (reasons.length === 0) return { green: true, kind: "passed", reasons };
  const hasTestFailure =
    results.success === false ||
    results.failedTests > 0 ||
    results.failedSuites > 0 ||
    results.runtimeErrorSuites > 0 ||
    results.tests.some((test) => test.status === "failed");
  return { green: false, kind: hasTestFailure ? "test-failure" : "environment-error", reasons };
}

/** Escape a test name so `-t` matches it exactly (both runners treat -t as a regex). */
export function exactNamePattern(name: string): string {
  return `^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`;
}
