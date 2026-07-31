#!/usr/bin/env -S npx tsx
/**
 * VERIFY — prove the reduced suite still meets the quality bar.
 *
 * Re-runs the current suite with coverage and compares it against the baseline
 * recorded by collect-metrics.ts:
 *   - every test must pass;
 *   - line (and optionally branch) retention must meet the floor;
 *   - optionally, Stryker mutation score on chosen modules must meet a floor
 *     (opt-in: mutation testing is slow — scope it with --mutate).
 *
 * Fails loudly with a non-zero exit code so it can gate CI.
 *
 * Standalone usage:
 *   npx tsx scripts/verify.ts --baseline .test-doctor/report.json
 *   npx tsx scripts/verify.ts --mutation --mutate "src/billing/**" --mutation-floor 80
 */
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { parseFraction, parsePercentage, parsePositiveInteger } from "./lib/args.ts";
import { createInvocationDir, invalidateOutput, writeJsonAtomic } from "./lib/artifacts.ts";
import { detectRunner } from "./lib/detect.ts";
import { run } from "./lib/exec.ts";
import { parseCoverageFinal, type IstanbulFileCoverage } from "./lib/istanbul.ts";
import {
  buildRunSpec,
  parseResultsFile,
  validateRunOutcome,
  type JestResultsFile,
} from "./lib/runner-commands.ts";
import { computeRetention, mutationScore, type MutationReport } from "./lib/verify-core.ts";
import {
  listTestFilesSpec,
  parseListedTestFiles,
  resolvePackageVersion,
  resolveStrykerBinary,
  resolveTargetBinary,
} from "./lib/runner-resolution.ts";
import { normalizeMetricsReport } from "./lib/report-loader.ts";
import { captureProvenance, compareProvenance } from "./lib/provenance.ts";

const HELP = `verify — compare the current suite against the recorded baseline

Usage: npx tsx scripts/verify.ts [options]

Options:
  --baseline <file>         Metrics report from collect-metrics.ts
                            (default: .test-doctor/report.json)
  --cwd <dir>               Target repo root (default: current directory)
  --runner <auto|vitest|jest>  Test runner (default: auto-detect)
  --runner-bin <path>        Explicit target-local runner JavaScript executable
  --runner-arg <arg>         Additional runner argument (repeatable)
  --coverage-floor <0..1>   Min line retention vs baseline (default: 0.97)
  --branch-floor <0..1>     Optional min branch retention vs baseline
  --min-line-coverage <0..1>   Optional absolute current line coverage floor
  --min-branch-coverage <0..1> Optional absolute current branch coverage floor
  --allow-legacy-baseline   Permit v1 input and mark the verdict untrusted
  --allow-provenance-drift  Continue despite source/config drift, untrusted
  --timeout-ms <n>          Suite run timeout (default: 3600000)
  --scratch <dir>           Scratch dir (default: .test-doctor/tmp)
  --keep-scratch            Preserve and print this invocation's scratch dir
  --out <file>              JSON verdict (default: .test-doctor/verify.json)
  --mutation                Also run Stryker mutation testing (opt-in, slow)
  --mutate <glob>           Module glob(s) to mutate (repeatable, required
                            with --mutation)
  --mutation-floor <0..100> Min mutation score percentage (default: 80)
  --mutation-report <file>  Stryker JSON report location
                            (default: reports/mutation/mutation.json)
  --mutation-timeout-ms <n> Stryker timeout (default: 7200000)
  --stryker-bin <path>       Explicit target-local Stryker JavaScript executable
  --stryker-arg <arg>        Additional Stryker argument (repeatable)
  --help                    Show this help

Exit codes: 0 all floors met, 1 verification failed, 2 environment/usage error.`;

function fail(msg: string): never {
  console.error(`\nverify: ${msg}`);
  process.exit(2);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      baseline: { type: "string", default: ".test-doctor/report.json" },
      cwd: { type: "string", default: "." },
      runner: { type: "string", default: "auto" },
      "runner-bin": { type: "string" },
      "runner-arg": { type: "string", multiple: true, default: [] },
      "coverage-floor": { type: "string", default: "0.97" },
      "branch-floor": { type: "string" },
      "min-line-coverage": { type: "string" },
      "min-branch-coverage": { type: "string" },
      "allow-legacy-baseline": { type: "boolean", default: false },
      "allow-provenance-drift": { type: "boolean", default: false },
      "timeout-ms": { type: "string", default: "3600000" },
      scratch: { type: "string", default: ".test-doctor/tmp" },
      "keep-scratch": { type: "boolean", default: false },
      out: { type: "string", default: ".test-doctor/verify.json" },
      mutation: { type: "boolean", default: false },
      mutate: { type: "string", multiple: true, default: [] },
      "mutation-floor": { type: "string", default: "80" },
      "mutation-report": { type: "string", default: "reports/mutation/mutation.json" },
      "mutation-timeout-ms": { type: "string", default: "7200000" },
      "stryker-bin": { type: "string" },
      "stryker-arg": { type: "string", multiple: true, default: [] },
      help: { type: "boolean", default: false },
    },
  });
  if (values.help) {
    console.log(HELP);
    return;
  }
  const cwd = resolve(values.cwd!);
  const baselinePath = resolve(cwd, values.baseline!);
  if (!existsSync(baselinePath)) fail(`baseline report not found: ${baselinePath}`);
  let coverageFloor: number;
  let branchFloor: number | null;
  let minLineCoverage: number | null;
  let minBranchCoverage: number | null;
  let timeoutMs: number;
  let mutationFloor: number;
  let mutationTimeoutMs: number;
  try {
    coverageFloor = parseFraction("--coverage-floor", values["coverage-floor"]!);
    branchFloor =
      values["branch-floor"] != null
        ? parseFraction("--branch-floor", values["branch-floor"])
        : null;
    minLineCoverage =
      values["min-line-coverage"] != null
        ? parseFraction("--min-line-coverage", values["min-line-coverage"])
        : null;
    minBranchCoverage =
      values["min-branch-coverage"] != null
        ? parseFraction("--min-branch-coverage", values["min-branch-coverage"])
        : null;
    timeoutMs = parsePositiveInteger("--timeout-ms", values["timeout-ms"]!);
    mutationFloor = parsePercentage("--mutation-floor", values["mutation-floor"]!);
    mutationTimeoutMs = parsePositiveInteger(
      "--mutation-timeout-ms",
      values["mutation-timeout-ms"]!,
    );
  } catch (error) {
    fail((error as Error).message);
  }
  const outPath = resolve(cwd, values.out!);
  invalidateOutput(outPath);
  let normalized;
  try {
    normalized = normalizeMetricsReport(JSON.parse(readFileSync(baselinePath, "utf8")));
  } catch (error) {
    fail((error as Error).message);
  }
  if (normalized.legacy && !values["allow-legacy-baseline"]) {
    fail("legacy v1 baseline requires --allow-legacy-baseline because provenance is unavailable");
  }
  const baseline = normalized.report;
  const failures: string[] = [];

  // --- 1. The suite must be green ------------------------------------------
  let detection;
  try {
    detection = detectRunner(cwd, values.runner);
  } catch (err) {
    fail((err as Error).message);
  }
  console.error(`runner: ${detection.runner} (${detection.reason})`);
  let runnerBinary;
  try {
    runnerBinary = resolveTargetBinary(cwd, detection.runner, values["runner-bin"]);
  } catch (error) {
    fail((error as Error).message);
  }
  let coverageProvider: { name: string; version: string };
  try {
    coverageProvider =
      detection.runner === "vitest"
        ? {
            name: "@vitest/coverage-v8",
            version: resolvePackageVersion(cwd, "@vitest/coverage-v8"),
          }
        : { name: "jest-built-in", version: runnerBinary.version };
  } catch (error) {
    fail((error as Error).message);
  }
  const currentProvenance = captureProvenance(cwd, Object.keys(baseline.baselineCoverage), {
    runner: {
      name: detection.runner,
      version: runnerBinary.version,
      executable: runnerBinary.executable,
    },
    coverageProvider,
  });
  const provenanceMismatches = normalized.legacy
    ? []
    : compareProvenance(baseline.provenance, currentProvenance);
  if (provenanceMismatches.length > 0 && !values["allow-provenance-drift"]) {
    const summary = provenanceMismatches
      .map((mismatch) => `${mismatch.code}${mismatch.path ? `:${mismatch.path}` : ""}`)
      .join(", ");
    fail(`provenance drift detected: ${summary}; re-collect or pass --allow-provenance-drift`);
  }
  const trusted = !normalized.legacy && provenanceMismatches.length === 0;
  const runnerArgs = values["runner-arg"] ?? [];
  let scopedTestFiles: string[] | undefined;
  if (baseline.scope.mode === "filtered") {
    const listResult = await run(
      runnerBinary.command,
      [...runnerBinary.argsPrefix, ...listTestFilesSpec(detection.runner, runnerArgs)],
      { cwd, timeoutMs },
    );
    if (listResult.code !== 0 || listResult.error || listResult.signal || listResult.timedOut) {
      fail(`test-file listing failed:\n${listResult.stderr.slice(-2000)}`);
    }
    let filter: RegExp;
    try {
      filter = new RegExp(baseline.scope.filter ?? "");
      const relFile = (file: string) =>
        (isAbsolute(file) ? relative(cwd, file) : file).replace(/\\/g, "/");
      scopedTestFiles = parseListedTestFiles(detection.runner, listResult.stdout)
        .map(relFile)
        .filter((file) => filter.test(file))
        .sort()
        .map((file) => join(cwd, file));
    } catch (error) {
      fail(`stored scope is invalid: ${(error as Error).message}`);
    }
    if (scopedTestFiles.length === 0) fail("stored filter matches no current test files");
  }
  const scratchParent = resolve(cwd, values.scratch!);
  const scratchDir = createInvocationDir(scratchParent, "verify");
  console.error("running the current suite with coverage…");
  const spec = buildRunSpec(detection.runner, {
    scratchDir,
    label: "verify",
    testFiles: scopedTestFiles,
    extraArgs: runnerArgs,
  });
  mkdirSync(join(scratchDir, "verify"), { recursive: true });
  const res = await run(runnerBinary.command, [...runnerBinary.argsPrefix, ...spec.args], {
    cwd,
    timeoutMs,
  });
  if (res.timedOut) fail(`suite run exceeded --timeout-ms ${values["timeout-ms"]}`);
  if (!existsSync(spec.resultsFile)) {
    fail(`runner produced no results JSON.\nstderr (tail):\n${res.stderr.slice(-2000)}`);
  }
  const results = parseResultsFile(
    JSON.parse(readFileSync(spec.resultsFile, "utf8")) as JestResultsFile,
  );
  const suiteOutcome = validateRunOutcome(res, results);
  const failed = results.tests.filter((t) => t.status === "failed");
  if (!suiteOutcome.green && suiteOutcome.kind === "environment-error") {
    if (!values["keep-scratch"]) rmSync(scratchDir, { recursive: true, force: true });
    fail(`runner outcome could not be evaluated: ${suiteOutcome.reasons.join("; ")}`);
  }
  if (!suiteOutcome.green) {
    failures.push(...suiteOutcome.reasons);
    console.error(`✗ suite failed: ${suiteOutcome.reasons.join("; ")}`);
    for (const t of failed.slice(0, 20)) console.error(`   - ${t.fullName}`);
  } else {
    console.error(`✓ suite green: ${results.totalTests} tests passed`);
  }

  // --- 2. Coverage retention vs baseline -----------------------------------
  const covPath = join(spec.coverageDir, "coverage-final.json");
  if (!existsSync(covPath)) {
    if (suiteOutcome.kind === "test-failure") {
      writeJsonAtomic(outPath, {
        version: 2,
        tool: "test-suite-doctor",
        toolVersion: "0.2.0",
        runId: basename(scratchDir),
        createdAt: new Date().toISOString(),
        outcome: "failed",
        pass: false,
        trusted,
        failures,
        reasonCodes: ["suite-failed"],
        scope: baseline.scope,
        provenance: {
          baselineFingerprint: baseline.provenance.fingerprint,
          currentFingerprint: currentProvenance.fingerprint,
          mismatches: provenanceMismatches,
          overridden: values["allow-provenance-drift"],
        },
        suite: { outcome: suiteOutcome, wallMs: res.wallMs },
        totalTests: results.totalTests,
        failedTests: failed.length,
        lineRetention: null,
        branchRetention: null,
        lostByFile: [],
        mutation: null,
      });
      if (values["keep-scratch"]) console.error(`scratch preserved: ${scratchDir}`);
      else rmSync(scratchDir, { recursive: true, force: true });
      process.exit(1);
    }
    if (!values["keep-scratch"]) rmSync(scratchDir, { recursive: true, force: true });
    fail("coverage-final.json missing — is a coverage provider installed?");
  }
  const current = parseCoverageFinal(
    JSON.parse(readFileSync(covPath, "utf8")) as Record<string, IstanbulFileCoverage>,
    cwd,
  );
  const retention = computeRetention(baseline.baselineCoverage, current.files);
  const absoluteLineCoverage =
    current.totals.totalLines === 0 ? 1 : current.totals.coveredLines / current.totals.totalLines;
  const absoluteBranchCoverage =
    current.totals.totalBranches === 0
      ? 1
      : current.totals.coveredBranches / current.totals.totalBranches;
  const linePct = (retention.lineRetention * 100).toFixed(2);
  if (retention.lineRetention < coverageFloor) {
    failures.push(`line retention ${linePct}% below floor ${(coverageFloor * 100).toFixed(1)}%`);
    console.error(`✗ line retention ${linePct}% (floor ${(coverageFloor * 100).toFixed(1)}%)`);
    console.error("  worst-hit source files (regenerate tests here):");
    for (const f of retention.lostByFile.slice(0, 10)) {
      console.error(`   - ${f.file}: ${f.lostLines} baseline-covered lines lost`);
    }
  } else {
    console.error(`✓ line retention ${linePct}% (floor ${(coverageFloor * 100).toFixed(1)}%)`);
  }
  if (branchFloor != null) {
    const branchPct = (retention.branchRetention * 100).toFixed(2);
    if (retention.branchRetention < branchFloor) {
      failures.push(`branch retention ${branchPct}% below floor ${(branchFloor * 100).toFixed(1)}%`);
      console.error(`✗ branch retention ${branchPct}% (floor ${(branchFloor * 100).toFixed(1)}%)`);
    } else {
      console.error(`✓ branch retention ${branchPct}%`);
    }
  }
  if (minLineCoverage != null && absoluteLineCoverage < minLineCoverage) {
    failures.push(
      `absolute line coverage ${(absoluteLineCoverage * 100).toFixed(2)}% below floor ${(minLineCoverage * 100).toFixed(1)}%`,
    );
  }
  if (minBranchCoverage != null && absoluteBranchCoverage < minBranchCoverage) {
    failures.push(
      `absolute branch coverage ${(absoluteBranchCoverage * 100).toFixed(2)}% below floor ${(minBranchCoverage * 100).toFixed(1)}%`,
    );
  }

  // --- 3. Optional mutation testing (Stryker) ------------------------------
  let mutation: ReturnType<typeof mutationScore> | null = null;
  if (values.mutation) {
    const globs = values.mutate ?? [];
    if (globs.length === 0) fail("--mutation requires at least one --mutate glob");
    let strykerBinary;
    try {
      strykerBinary = resolveStrykerBinary(cwd, values["stryker-bin"]);
    } catch (error) {
      fail((error as Error).message);
    }
    const reportPath = resolve(cwd, values["mutation-report"]!);
    const backupPath = `${reportPath}.${basename(scratchDir)}.bak`;
    const hadPreviousReport = existsSync(reportPath);
    if (hadPreviousReport) renameSync(reportPath, backupPath);
    const restorePreviousReport = () => {
      rmSync(reportPath, { force: true });
      if (hadPreviousReport && existsSync(backupPath)) renameSync(backupPath, reportPath);
    };
    console.error(`mutation: stryker run --mutate ${globs.join(",")} (this is slow)…`);
    const strykerRes = await run(
      strykerBinary.command,
      [
        ...strykerBinary.argsPrefix,
        "run",
        "--mutate",
        globs.join(","),
        "--reporters",
        "json,progress",
        ...(values["stryker-arg"] ?? []),
      ],
      { cwd, timeoutMs: mutationTimeoutMs },
    );
    if (strykerRes.timedOut) {
      restorePreviousReport();
      fail("Stryker exceeded --mutation-timeout-ms");
    }
    if (strykerRes.error || strykerRes.signal || strykerRes.code !== 0) {
      restorePreviousReport();
      fail(
        `Stryker mutation process exited ${strykerRes.code ?? "without a code"}` +
          (strykerRes.error ? `: ${strykerRes.error}` : ""),
      );
    }
    if (!existsSync(reportPath)) {
      restorePreviousReport();
      fail(
        `Stryker JSON report not found at ${reportPath} — is @stryker-mutator/core installed ` +
          "and configured? Override the location with --mutation-report.\n" +
          `stderr (tail):\n${strykerRes.stderr.slice(-2000)}`,
      );
    }
    try {
      mutation = mutationScore(JSON.parse(readFileSync(reportPath, "utf8")) as MutationReport);
    } catch (error) {
      restorePreviousReport();
      fail(`Stryker JSON report is malformed: ${(error as Error).message}`);
    }
    rmSync(backupPath, { force: true });
    if (!mutation.applicable || mutation.score == null) {
      fail("Stryker produced zero scoreable mutants; mutation verification is not applicable");
    }
    const scoreStr = mutation.score.toFixed(1);
    if (mutation.score < mutationFloor) {
      failures.push(`mutation score ${scoreStr}% below floor ${mutationFloor}%`);
      console.error(
        `✗ mutation score ${scoreStr}% (floor ${mutationFloor}%) — ` +
          `${mutation.undetected} mutants survived`,
      );
    } else {
      console.error(`✓ mutation score ${scoreStr}% (floor ${mutationFloor}%)`);
    }
  }

  // --- Verdict --------------------------------------------------------------
  writeJsonAtomic(outPath, {
    version: 2,
    tool: "test-suite-doctor",
    toolVersion: "0.2.0",
    runId: basename(scratchDir),
    createdAt: new Date().toISOString(),
    outcome: failures.length === 0 ? "passed" : "failed",
    pass: failures.length === 0,
    trusted,
    failures,
    reasonCodes: failures.length === 0 ? [] : ["quality-gate-failed"],
    scope: baseline.scope,
    provenance: {
      baselineFingerprint: baseline.provenance.fingerprint,
      currentFingerprint: currentProvenance.fingerprint,
      mismatches: provenanceMismatches,
      overridden: values["allow-provenance-drift"],
    },
    suite: { outcome: suiteOutcome, wallMs: res.wallMs },
    totalTests: results.totalTests,
    failedTests: failed.length,
    lineRetention: retention.lineRetention,
    branchRetention: retention.branchRetention,
    absoluteLineCoverage,
    absoluteBranchCoverage,
    lostByFile: retention.lostByFile.slice(0, 50),
    mutation,
  });
  console.error(`\nverdict written: ${outPath}`);
  if (values["keep-scratch"]) console.error(`scratch preserved: ${scratchDir}`);
  else rmSync(scratchDir, { recursive: true, force: true });
  if (failures.length > 0) {
    console.error(`✗ VERIFY FAILED: ${failures.join("; ")}`);
    process.exit(1);
  }
  console.error("✓ VERIFY PASSED");
}

main().catch((err) => fail((err as Error).stack ?? String(err)));
