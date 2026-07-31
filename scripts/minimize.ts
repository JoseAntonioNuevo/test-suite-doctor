#!/usr/bin/env -S npx tsx
/**
 * MINIMIZE — greedy weighted-sum test suite minimization.
 *
 * Consumes the report produced by collect-metrics.ts and computes a keep/drop
 * plan: iteratively selects the unit with the best newly-covered-lines (and
 * branches) per millisecond of runtime, until the coverage floor is met.
 *
 * The plan is a PROPOSAL. Nothing is deleted by this script — a human or an
 * agent reviews the drop list (see references/slop-patterns.md) first.
 *
 * Standalone usage:
 *   npx tsx scripts/minimize.ts --report .test-doctor/report.json \
 *     --coverage-floor 0.97 --target-count 200
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  parseFraction,
  parseNonNegativeNumber,
  parsePositiveInteger,
  parseRegex,
} from "./lib/args.ts";
import { minimize } from "./lib/greedy.ts";
import { renderPlanMarkdown } from "./lib/render.ts";
import { normalizeMetricsReport } from "./lib/report-loader.ts";
import { selectOptimizationCost, type CostModel } from "./lib/timing.ts";

const HELP = `minimize — coverage-guided greedy test suite minimization

Usage: npx tsx scripts/minimize.ts [options]

Options:
  --report <file>          Metrics report (default: .test-doctor/report.json)
  --out-plan <file>        Plan JSON output (default: .test-doctor/plan.json)
  --out-md <file>          Human-readable plan (default: .test-doctor/plan.md)
  --coverage-floor <0..1>  Min fraction of baseline covered lines to retain
                           (default: 0.97)
  --branch-floor <0..1>    Optional additional floor on covered branches
  --target-count <n>       Aspirational kept-unit count; the coverage floor
                           wins unless --strict-count is set
  --strict-count           Hard-stop at --target-count even below the floor
  --runtime-budget-ms <n>  Stop before kept runtime exceeds this budget
  --cost-model <model>     auto | assertion | wall (default: auto)
  --w-lines <n>            Weight of a newly covered line (default: 1)
  --w-branches <n>         Weight of a newly covered branch (default: 1)
  --keep <regex>           Force-keep units whose id matches (repeatable) —
                           use for contract/regression tests
  --keep-unmeasured        Force-keep incomplete units instead of refusing
  --help                   Show this help

Exit codes: 0 plan written, 2 environment/usage error.`;

function fail(msg: string): never {
  console.error(`\nminimize: ${msg}`);
  process.exit(2);
}

function main(): void {
  const { values } = parseArgs({
    options: {
      report: { type: "string", default: ".test-doctor/report.json" },
      "out-plan": { type: "string", default: ".test-doctor/plan.json" },
      "out-md": { type: "string", default: ".test-doctor/plan.md" },
      "coverage-floor": { type: "string", default: "0.97" },
      "branch-floor": { type: "string" },
      "target-count": { type: "string" },
      "strict-count": { type: "boolean", default: false },
      "runtime-budget-ms": { type: "string" },
      "cost-model": { type: "string", default: "auto" },
      "w-lines": { type: "string", default: "1" },
      "w-branches": { type: "string", default: "1" },
      keep: { type: "string", multiple: true, default: [] },
      "keep-unmeasured": { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });
  if (values.help) {
    console.log(HELP);
    return;
  }
  const reportPath = resolve(values.report!);
  if (!existsSync(reportPath)) {
    fail(`report not found: ${reportPath} — run collect-metrics.ts first (metrics before opinions).`);
  }
  let normalized;
  try {
    normalized = normalizeMetricsReport(JSON.parse(readFileSync(reportPath, "utf8")));
  } catch (error) {
    fail(`${(error as Error).message} in ${reportPath}`);
  }
  const report = normalized.report;
  let coverageFloor: number;
  let branchFloor: number | null;
  let targetCount: number | null;
  let runtimeBudgetMs: number | null;
  let weightLines: number;
  let weightBranches: number;
  let forceKeep: RegExp[];
  let costModel: CostModel;
  try {
    coverageFloor = parseFraction("--coverage-floor", values["coverage-floor"]!);
    branchFloor =
      values["branch-floor"] != null
        ? parseFraction("--branch-floor", values["branch-floor"])
        : null;
    if (coverageFloor === 0 && (branchFloor == null || branchFloor === 0)) {
      fail("at least one of --coverage-floor or --branch-floor must be positive");
    }
    targetCount =
      values["target-count"] != null
        ? parsePositiveInteger("--target-count", values["target-count"])
        : null;
    runtimeBudgetMs =
      values["runtime-budget-ms"] != null
        ? parsePositiveInteger("--runtime-budget-ms", values["runtime-budget-ms"])
        : null;
    weightLines = parseNonNegativeNumber("--w-lines", values["w-lines"]!);
    weightBranches = parseNonNegativeNumber("--w-branches", values["w-branches"]!);
    if (weightLines === 0 && weightBranches === 0) fail("at least one weight must be positive");
    forceKeep = (values.keep ?? []).map((pattern) => parseRegex("--keep", pattern));
    if (
      values["cost-model"] !== "auto" &&
      values["cost-model"] !== "assertion" &&
      values["cost-model"] !== "wall"
    ) {
      fail("--cost-model must be auto, assertion, or wall");
    }
    costModel = values["cost-model"];
  } catch (error) {
    fail((error as Error).message);
  }

  const unsafeIds = new Set([
    ...report.collectionErrors.map((entry) => entry.id),
    ...report.units.filter((unit) => unit.status !== "passed").map((unit) => unit.id),
  ]);
  if (unsafeIds.size > 0 && !values["keep-unmeasured"]) {
    fail(
      `report is incomplete (${unsafeIds.size} collectionErrors/non-passed units); ` +
        "fix collection or pass --keep-unmeasured to force-keep them",
    );
  }
  if (values["keep-unmeasured"]) {
    for (const id of unsafeIds) forceKeep.push(new RegExp(`^${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
  }

  const costedUnits = report.units.map((unit) => ({
    ...unit,
    ...selectOptimizationCost(unit, report.granularity, costModel),
  }));
  const plan = minimize(costedUnits, report.baselineCoverage, {
    coverageFloor,
    branchFloor,
    targetCount,
    strictCount: values["strict-count"]!,
    runtimeBudgetMs,
    weightLines,
    weightBranches,
    forceKeep,
  });
  if (unsafeIds.size > 0) {
    plan.summary.warnings.unshift(
      `${unsafeIds.size} unsafe/unmeasured unit(s) were force-kept; this plan is unverified.`,
    );
  }
  if (normalized.legacy) {
    plan.summary.warnings.unshift(
      "Legacy v1 metrics lack provenance; this plan is legacy-unverified.",
    );
  }
  plan.sourceReport = {
    version: normalized.sourceVersion,
    runId: report.runId,
    legacy: normalized.legacy,
    fingerprint: normalized.legacy ? null : report.provenance.fingerprint,
  };
  plan.scope = report.scope;
  plan.provenance = report.provenance;
  plan.trusted = !normalized.legacy && unsafeIds.size === 0;

  const planPath = resolve(values["out-plan"]!);
  const mdPath = resolve(values["out-md"]!);
  mkdirSync(resolve(planPath, ".."), { recursive: true });
  mkdirSync(resolve(mdPath, ".."), { recursive: true });
  writeFileSync(planPath, JSON.stringify(plan, null, 2));
  writeFileSync(mdPath, renderPlanMarkdown(plan));

  const s = plan.summary;
  console.error(`plan written: ${planPath} (+ ${mdPath})`);
  console.error(
    `keep ${s.unitsKept}/${s.unitsTotal} units — line retention ${(s.lineRetention * 100).toFixed(1)}%, ` +
      `branch retention ${(s.branchRetention * 100).toFixed(1)}%, ` +
      `runtime ${Math.round(s.totalRuntimeMs / 1000)}s → ${Math.round(s.keptRuntimeMs / 1000)}s`,
  );
  for (const w of s.warnings) console.error(`⚠️  ${w}`);
  console.error("\nnext: review the drop list against references/slop-patterns.md — do NOT delete blindly.");
}

main();
