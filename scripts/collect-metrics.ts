#!/usr/bin/env -S npx tsx
/**
 * MEASURE — collect per-test coverage and runtime for a Vitest or Jest suite.
 *
 * 1. Detects the runner, runs the whole suite once (the coverage baseline).
 * 2. Re-runs each test file (or each test, with --granularity test) in
 *    isolation with coverage, and records covered lines/branches + runtime.
 * 3. Writes a machine-readable report consumed by minimize.ts and verify.ts.
 *
 * Standalone usage (no skill system required):
 *   npx tsx scripts/collect-metrics.ts --cwd /path/to/repo
 */
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { parsePositiveInteger, parseRegex } from "./lib/args.ts";
import { createInvocationDir, invalidateOutput, writeJsonAtomic } from "./lib/artifacts.ts";
import { detectRunner } from "./lib/detect.ts";
import { pool, run } from "./lib/exec.ts";
import { parseCoverageFinal, type IstanbulFileCoverage } from "./lib/istanbul.ts";
import {
  buildRunSpec,
  exactNamePattern,
  parseResultsFile,
  validateRunOutcome,
  type JestResultsFile,
} from "./lib/runner-commands.ts";
import type { Granularity, MetricsReport, TestCaseInfo, UnitMetrics } from "./lib/types.ts";

const HELP = `collect-metrics — per-test coverage + runtime for Vitest/Jest suites

Usage: npx tsx scripts/collect-metrics.ts [options]

Options:
  --cwd <dir>                Target repo root (default: current directory)
  --runner <auto|vitest|jest>  Test runner (default: auto-detect)
  --granularity <file|test>  Measurement unit (default: file). "test" is exact
                             but runs every single test in isolation — slow.
  --filter <regex>           Only measure test files matching this regex
  --out <file>               Report path (default: .test-doctor/report.json)
  --scratch <dir>            Scratch dir (default: .test-doctor/tmp)
  --concurrency <n>          Parallel isolated runs (default: 2)
  --timeout-ms <n>           Per-unit run timeout (default: 600000)
  --baseline-timeout-ms <n>  Whole-suite run timeout (default: 3600000)
  --keep-scratch             Keep per-unit scratch artifacts for debugging
  --help                     Show this help

Exit codes: 0 report written, 2 environment/usage error.`;

function fail(msg: string): never {
  console.error(`\ncollect-metrics: ${msg}`);
  process.exit(2);
}

function failQuality(msg: string): never {
  console.error(`\ncollect-metrics: ${msg}`);
  process.exit(1);
}

function readJson<T>(path: string, what: string, stderr: string): T {
  if (!existsSync(path)) {
    fail(`${what} was not written (${path}).\nRunner stderr (tail):\n${stderr.slice(-2000)}`);
  }
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function statusOf(tests: TestCaseInfo[]): UnitMetrics["status"] {
  const executed = tests.filter((t) => t.status === "passed" || t.status === "failed");
  if (executed.length === 0) return "empty";
  if (executed.every((t) => t.status === "passed")) return "passed";
  if (executed.every((t) => t.status === "failed")) return "failed";
  return "mixed";
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      cwd: { type: "string", default: "." },
      runner: { type: "string", default: "auto" },
      granularity: { type: "string", default: "file" },
      filter: { type: "string" },
      out: { type: "string", default: ".test-doctor/report.json" },
      scratch: { type: "string", default: ".test-doctor/tmp" },
      concurrency: { type: "string", default: "2" },
      "timeout-ms": { type: "string", default: "600000" },
      "baseline-timeout-ms": { type: "string", default: "3600000" },
      "keep-scratch": { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });
  if (values.help) {
    console.log(HELP);
    return;
  }
  const cwd = resolve(values.cwd!);
  const granularity = values.granularity as Granularity;
  if (granularity !== "file" && granularity !== "test") fail("--granularity must be file or test");
  const outFile = resolve(cwd, values.out!);
  let unitTimeout: number;
  let baselineTimeout: number;
  let concurrency: number;
  let filter: RegExp | null;
  try {
    unitTimeout = parsePositiveInteger("--timeout-ms", values["timeout-ms"]!);
    baselineTimeout = parsePositiveInteger(
      "--baseline-timeout-ms",
      values["baseline-timeout-ms"]!,
    );
    concurrency = parsePositiveInteger("--concurrency", values.concurrency!);
    filter = values.filter ? parseRegex("--filter", values.filter) : null;
  } catch (error) {
    fail((error as Error).message);
  }
  invalidateOutput(outFile);

  let detection;
  try {
    detection = detectRunner(cwd, values.runner);
  } catch (err) {
    fail((err as Error).message);
  }
  const { runner } = detection;
  console.error(`runner: ${runner} (${detection.reason})`);
  const scratchDir = createInvocationDir(resolve(cwd, values.scratch!), "collect");

  // --- Baseline: one whole-suite run with coverage --------------------------
  console.error("baseline: running the full suite with coverage (this is the slow part)…");
  const baseSpec = buildRunSpec(runner, { scratchDir, label: "baseline" });
  mkdirSync(join(scratchDir, "baseline"), { recursive: true });
  const baseRes = await run("npx", baseSpec.args, { cwd, timeoutMs: baselineTimeout });
  if (baseRes.timedOut) fail(`baseline run exceeded --baseline-timeout-ms ${baselineTimeout}`);
  const baseResults = parseResultsFile(
    readJson<JestResultsFile>(baseSpec.resultsFile, "baseline results JSON", baseRes.stderr),
  );
  const baseOutcome = validateRunOutcome(baseRes, baseResults);
  if (!baseOutcome.green) {
    if (!values["keep-scratch"]) rmSync(scratchDir, { recursive: true, force: true });
    if (baseOutcome.kind === "test-failure") {
      failQuality(`baseline failed: ${baseOutcome.reasons.join("; ")}`);
    }
    fail(`baseline could not be evaluated: ${baseOutcome.reasons.join("; ")}`);
  }
  const baseCovRaw = readJson<Record<string, IstanbulFileCoverage>>(
    join(baseSpec.coverageDir, "coverage-final.json"),
    "baseline coverage-final.json (is a coverage provider installed? e.g. @vitest/coverage-v8)",
    baseRes.stderr,
  );
  const baseCov = parseCoverageFinal(baseCovRaw, cwd);
  if (baseCov.totals.coveredLines === 0) {
    if (!values["keep-scratch"]) rmSync(scratchDir, { recursive: true, force: true });
    fail("baseline coverage is empty — check the coverage provider and include configuration");
  }
  const totalRuntimeMs = baseResults.tests.reduce((s, t) => s + t.durationMs, 0);
  console.error(
    `baseline: ${baseResults.totalTests} tests in ${baseResults.files.length} files, ` +
      `${baseCov.totals.coveredLines}/${baseCov.totals.totalLines} lines covered ` +
      `(${((baseCov.totals.coveredLines / Math.max(baseCov.totals.totalLines, 1)) * 100).toFixed(1)}%)`,
  );

  const relFile = (f: string) => (isAbsolute(f) ? relative(cwd, f) : f).replace(/\\/g, "/");
  let testFiles = [...new Set(baseResults.files.map(relFile))].sort();
  if (filter) testFiles = testFiles.filter((f) => filter.test(f));
  if (testFiles.length === 0) fail("no test files to measure after --filter");

  // --- Enumerate measurement units -----------------------------------------
  interface UnitSpec {
    id: string;
    file: string;
    testName: string | null;
  }
  let unitSpecs: UnitSpec[];
  if (granularity === "file") {
    unitSpecs = testFiles.map((f) => ({ id: f, file: f, testName: null }));
  } else {
    // Names come from a per-file listing run of the baseline results: the
    // baseline JSON already carries every test's fullName grouped by file.
    const raw = readJson<JestResultsFile>(baseSpec.resultsFile, "baseline results JSON", "");
    unitSpecs = [];
    for (const fileResult of raw.testResults ?? []) {
      const file = relFile(fileResult.name ?? "");
      if (!file || !testFiles.includes(file)) continue;
      for (const t of fileResult.assertionResults ?? []) {
        const name = t.fullName || t.title || "";
        if (!name) continue;
        unitSpecs.push({ id: `${file}::${name}`, file, testName: name });
      }
    }
    console.error(
      `granularity=test: ${unitSpecs.length} isolated runs queued — expect roughly ` +
        `${unitSpecs.length}× the runner startup cost. Use --filter to scope if needed.`,
    );
  }

  // --- Isolated runs --------------------------------------------------------
  const collectionErrors: MetricsReport["collectionErrors"] = [];
  let done = 0;
  const units = await pool(unitSpecs, concurrency, async (spec, i): Promise<UnitMetrics> => {
    const label = `unit-${i}`;
    const runSpec = buildRunSpec(runner, {
      scratchDir,
      label,
      testFile: join(cwd, spec.file),
      testNamePattern: spec.testName ? exactNamePattern(spec.testName) : undefined,
    });
    mkdirSync(join(scratchDir, label), { recursive: true });
    const res = await run("npx", runSpec.args, { cwd, timeoutMs: unitTimeout });
    let unit: UnitMetrics;
    try {
      if (res.timedOut) throw new Error(`timed out after ${unitTimeout}ms`);
      const results = parseResultsFile(
        readJson<JestResultsFile>(runSpec.resultsFile, "results JSON", res.stderr),
      );
      const outcome = validateRunOutcome(res, results);
      if (!outcome.green) throw new Error(outcome.reasons.join("; "));
      const covPath = join(runSpec.coverageDir, "coverage-final.json");
      const cov = existsSync(covPath)
        ? parseCoverageFinal(
            JSON.parse(readFileSync(covPath, "utf8")) as Record<string, IstanbulFileCoverage>,
            cwd,
          )
        : null;
      if (!cov) throw new Error("coverage-final.json missing");
      const tests = spec.testName
        ? results.tests.filter((t) => t.fullName === spec.testName)
        : results.tests;
      unit = {
        id: spec.id,
        file: spec.file,
        testName: spec.testName,
        tests,
        runtimeMs: tests.reduce((s, t) => s + t.durationMs, 0),
        wallMs: res.wallMs,
        status: statusOf(tests),
        coverage: cov.files,
      };
    } catch (err) {
      collectionErrors.push({ id: spec.id, reason: (err as Error).message });
      unit = {
        id: spec.id,
        file: spec.file,
        testName: spec.testName,
        tests: [],
        runtimeMs: 0,
        wallMs: res.wallMs,
        status: "error",
        coverage: {},
      };
    }
    if (!values["keep-scratch"]) rmSync(join(scratchDir, label), { recursive: true, force: true });
    done += 1;
    console.error(
      `[${done}/${unitSpecs.length}] ${spec.id} — ${unit.status}, ${Math.round(unit.runtimeMs)}ms tests, ${res.wallMs}ms wall`,
    );
    return unit;
  });

  // --- Report ---------------------------------------------------------------
  const report: MetricsReport = {
    version: 1,
    tool: "test-suite-doctor",
    createdAt: new Date().toISOString(),
    cwd,
    runner,
    granularity,
    baseline: {
      totalTests: baseResults.totalTests,
      totalRuntimeMs: Math.round(totalRuntimeMs),
      ...baseCov.totals,
    },
    baselineCoverage: baseCov.files,
    collectionErrors,
    units,
  };
  writeJsonAtomic(outFile, report);

  const slowest = [...units].sort((a, b) => b.runtimeMs - a.runtimeMs).slice(0, 5);
  console.error(`\nreport written: ${outFile}`);
  console.error(`units measured: ${units.length} (${collectionErrors.length} collection errors)`);
  if (collectionErrors.length > 0) {
    console.error("⚠️  units with collection errors contribute no coverage and will be dropped by");
    console.error("   the minimizer — investigate them before trusting the plan:");
    for (const e of collectionErrors.slice(0, 10)) console.error(`   - ${e.id}: ${e.reason}`);
  }
  console.error("slowest units:");
  for (const u of slowest) console.error(`   ${Math.round(u.runtimeMs)}ms  ${u.id}`);
  if (values["keep-scratch"]) console.error(`scratch preserved: ${scratchDir}`);
  else rmSync(scratchDir, { recursive: true, force: true });
  console.error("\nnext: npx tsx scripts/minimize.ts --report " + relative(process.cwd(), outFile));
  if (collectionErrors.length > 0) process.exit(1);
}

main().catch((err) => fail((err as Error).stack ?? String(err)));
