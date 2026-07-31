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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { detectRunner } from "./lib/detect.ts";
import { run } from "./lib/exec.ts";
import { parseCoverageFinal, type IstanbulFileCoverage } from "./lib/istanbul.ts";
import { buildRunSpec, parseResultsFile, type JestResultsFile } from "./lib/runner-commands.ts";
import { computeRetention, mutationScore, type MutationReport } from "./lib/verify-core.ts";
import type { MetricsReport } from "./lib/types.ts";

const HELP = `verify — compare the current suite against the recorded baseline

Usage: npx tsx scripts/verify.ts [options]

Options:
  --baseline <file>         Metrics report from collect-metrics.ts
                            (default: .test-doctor/report.json)
  --cwd <dir>               Target repo root (default: current directory)
  --runner <auto|vitest|jest>  Test runner (default: auto-detect)
  --coverage-floor <0..1>   Min line retention vs baseline (default: 0.97)
  --branch-floor <0..1>     Optional min branch retention vs baseline
  --timeout-ms <n>          Suite run timeout (default: 3600000)
  --scratch <dir>           Scratch dir (default: .test-doctor/tmp)
  --out <file>              JSON verdict (default: .test-doctor/verify.json)
  --mutation                Also run Stryker mutation testing (opt-in, slow)
  --mutate <glob>           Module glob(s) to mutate (repeatable, required
                            with --mutation)
  --mutation-floor <0..100> Min mutation score percentage (default: 80)
  --mutation-report <file>  Stryker JSON report location
                            (default: reports/mutation/mutation.json)
  --mutation-timeout-ms <n> Stryker timeout (default: 7200000)
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
      "coverage-floor": { type: "string", default: "0.97" },
      "branch-floor": { type: "string" },
      "timeout-ms": { type: "string", default: "3600000" },
      scratch: { type: "string", default: ".test-doctor/tmp" },
      out: { type: "string", default: ".test-doctor/verify.json" },
      mutation: { type: "boolean", default: false },
      mutate: { type: "string", multiple: true, default: [] },
      "mutation-floor": { type: "string", default: "80" },
      "mutation-report": { type: "string", default: "reports/mutation/mutation.json" },
      "mutation-timeout-ms": { type: "string", default: "7200000" },
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
  const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as MetricsReport;
  const coverageFloor = Number(values["coverage-floor"]);
  const branchFloor = values["branch-floor"] != null ? Number(values["branch-floor"]) : null;
  const scratchDir = resolve(cwd, values.scratch!);
  const failures: string[] = [];

  // --- 1. The suite must be green ------------------------------------------
  let detection;
  try {
    detection = detectRunner(cwd, values.runner);
  } catch (err) {
    fail((err as Error).message);
  }
  console.error(`runner: ${detection.runner} (${detection.reason})`);
  console.error("running the current suite with coverage…");
  const spec = buildRunSpec(detection.runner, { scratchDir, label: "verify" });
  mkdirSync(join(scratchDir, "verify"), { recursive: true });
  const res = await run("npx", spec.args, { cwd, timeoutMs: Number(values["timeout-ms"]) });
  if (res.timedOut) fail(`suite run exceeded --timeout-ms ${values["timeout-ms"]}`);
  if (!existsSync(spec.resultsFile)) {
    fail(`runner produced no results JSON.\nstderr (tail):\n${res.stderr.slice(-2000)}`);
  }
  const results = parseResultsFile(
    JSON.parse(readFileSync(spec.resultsFile, "utf8")) as JestResultsFile,
  );
  const failed = results.tests.filter((t) => t.status === "failed");
  if (failed.length > 0) {
    failures.push(`${failed.length} failing test(s)`);
    console.error(`✗ ${failed.length} failing test(s):`);
    for (const t of failed.slice(0, 20)) console.error(`   - ${t.fullName}`);
  } else {
    console.error(`✓ suite green: ${results.totalTests} tests passed`);
  }

  // --- 2. Coverage retention vs baseline -----------------------------------
  const covPath = join(spec.coverageDir, "coverage-final.json");
  if (!existsSync(covPath)) fail("coverage-final.json missing — is a coverage provider installed?");
  const current = parseCoverageFinal(
    JSON.parse(readFileSync(covPath, "utf8")) as Record<string, IstanbulFileCoverage>,
    cwd,
  );
  const retention = computeRetention(baseline.baselineCoverage, current.files);
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

  // --- 3. Optional mutation testing (Stryker) ------------------------------
  let mutation: ReturnType<typeof mutationScore> | null = null;
  if (values.mutation) {
    const globs = values.mutate ?? [];
    if (globs.length === 0) fail("--mutation requires at least one --mutate glob");
    const mutationFloor = Number(values["mutation-floor"]);
    console.error(`mutation: npx stryker run --mutate ${globs.join(",")} (this is slow)…`);
    const strykerRes = await run(
      "npx",
      ["stryker", "run", "--mutate", globs.join(","), "--reporters", "json,progress"],
      { cwd, timeoutMs: Number(values["mutation-timeout-ms"]) },
    );
    if (strykerRes.timedOut) fail("Stryker exceeded --mutation-timeout-ms");
    const reportPath = resolve(cwd, values["mutation-report"]!);
    if (!existsSync(reportPath)) {
      fail(
        `Stryker JSON report not found at ${reportPath} — is @stryker-mutator/core installed ` +
          "and configured? Override the location with --mutation-report.\n" +
          `stderr (tail):\n${strykerRes.stderr.slice(-2000)}`,
      );
    }
    mutation = mutationScore(JSON.parse(readFileSync(reportPath, "utf8")) as MutationReport);
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
  const outPath = resolve(cwd, values.out!);
  mkdirSync(resolve(outPath, ".."), { recursive: true });
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        version: 1,
        tool: "test-suite-doctor",
        createdAt: new Date().toISOString(),
        pass: failures.length === 0,
        failures,
        totalTests: results.totalTests,
        failedTests: failed.length,
        lineRetention: retention.lineRetention,
        branchRetention: retention.branchRetention,
        lostByFile: retention.lostByFile.slice(0, 50),
        mutation,
      },
      null,
      2,
    ),
  );
  console.error(`\nverdict written: ${outPath}`);
  if (failures.length > 0) {
    console.error(`✗ VERIFY FAILED: ${failures.join("; ")}`);
    process.exit(1);
  }
  console.error("✓ VERIFY PASSED");
}

main().catch((err) => fail((err as Error).stack ?? String(err)));
