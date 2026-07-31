import type { MinimizePlan } from "./types.ts";

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function ms(n: number): string {
  return n >= 10_000 ? `${(n / 1000).toFixed(1)}s` : `${Math.round(n)}ms`;
}

/** Human-readable companion to plan.json, safe to paste into a PR description. */
export function renderPlanMarkdown(plan: MinimizePlan, maxRows = 400): string {
  const s = plan.summary;
  const lines: string[] = [];
  lines.push("# Test suite minimization plan");
  lines.push("");
  lines.push(`Generated ${plan.createdAt} at \`${plan.granularity}\` granularity by test-suite-doctor.`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push("| Metric | Before | After |");
  lines.push("|---|---:|---:|");
  lines.push(`| Units | ${s.unitsTotal} | **${s.unitsKept}** |`);
  lines.push(`| Covered lines | ${s.baselineCoveredLines} | ${s.keptCoveredLines} (${pct(s.lineRetention)} retained) |`);
  lines.push(`| Covered branches | ${s.baselineCoveredBranches} | ${s.keptCoveredBranches} (${pct(s.branchRetention)} retained) |`);
  lines.push(`| Test runtime | ${ms(s.totalRuntimeMs)} | ${ms(s.keptRuntimeMs)} |`);
  lines.push("");
  if (s.warnings.length > 0) {
    lines.push("## Warnings");
    lines.push("");
    for (const w of s.warnings) lines.push(`- ⚠️ ${w}`);
    lines.push("");
  }
  lines.push(`## Keep (${plan.keep.length})`);
  lines.push("");
  lines.push("| # | Unit | Gain | Runtime | Cum. retention |");
  lines.push("|---:|---|---|---:|---:|");
  plan.keep.slice(0, maxRows).forEach((k, i) => {
    lines.push(
      `| ${i + 1} | \`${k.id}\` | ${k.reason} | ${ms(k.runtimeMs)} | ${pct(k.cumulativeLineRetention)} |`,
    );
  });
  if (plan.keep.length > maxRows) lines.push(`| … | +${plan.keep.length - maxRows} more | | | |`);
  lines.push("");
  lines.push(`## Drop candidates (${plan.drop.length})`);
  lines.push("");
  lines.push("> Review each against \`references/slop-patterns.md\` before deleting — coverage");
  lines.push("> cannot see API contracts or documented regressions.");
  lines.push("");
  lines.push("| Unit | Residual lines | Covered by | Reason |");
  lines.push("|---|---:|---|---|");
  plan.drop.slice(0, maxRows).forEach((d) => {
    lines.push(
      `| \`${d.id}\` | ${d.residualLines} | ${d.bestOverlapWith ? `\`${d.bestOverlapWith}\`` : "—"} | ${d.reason} |`,
    );
  });
  if (plan.drop.length > maxRows) lines.push(`| … +${plan.drop.length - maxRows} more | | | |`);
  lines.push("");
  return lines.join("\n");
}
