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
import { minimize } from "./lib/greedy.ts";
import { renderPlanMarkdown } from "./lib/render.ts";
import type { MetricsReport } from "./lib/types.ts";

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
  --w-lines <n>            Weight of a newly covered line (default: 1)
  --w-branches <n>         Weight of a newly covered branch (default: 1)
  --keep <regex>           Force-keep units whose id matches (repeatable) —
                           use for contract/regression tests
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
      "w-lines": { type: "string", default: "1" },
      "w-branches": { type: "string", default: "1" },
      keep: { type: "string", multiple: true, default: [] },
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
  const report = JSON.parse(readFileSync(reportPath, "utf8")) as MetricsReport;
  if (report.tool !== "test-suite-doctor" || report.version !== 1) {
    fail(`unrecognized report format in ${reportPath}`);
  }
  const coverageFloor = Number(values["coverage-floor"]);
  if (!(coverageFloor > 0 && coverageFloor <= 1)) fail("--coverage-floor must be in (0, 1]");

  const plan = minimize(report.units, report.baselineCoverage, {
    coverageFloor,
    branchFloor: values["branch-floor"] != null ? Number(values["branch-floor"]) : null,
    targetCount: values["target-count"] != null ? Number(values["target-count"]) : null,
    strictCount: values["strict-count"]!,
    runtimeBudgetMs:
      values["runtime-budget-ms"] != null ? Number(values["runtime-budget-ms"]) : null,
    weightLines: Number(values["w-lines"]),
    weightBranches: Number(values["w-branches"]),
    forceKeep: (values.keep ?? []).map((p) => {
      try {
        return new RegExp(p);
      } catch {
        return fail(`invalid --keep regex: ${p}`);
      }
    }),
  });

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
