import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { TOOL_VERSION } from "../scripts/lib/version.ts";

interface BenchmarkTarget {
  id: string;
  size: "small" | "medium" | "large";
  repository: string;
  url: string;
  commit: string;
  license: string;
  packageManager: string;
  lockfile: string;
  cwd: string;
  runner: "vitest" | "jest";
  filter: string | null;
  granularity: "file" | "test";
  coverageFloor: number;
  branchFloor: number;
  schedule: string[];
}

interface Manifest { version: 1; verificationRuns: number; targets: BenchmarkTarget[] }

const root = resolve(import.meta.dirname, "..");
const cli = resolve(root, "dist/cli.mjs");
const manifest = JSON.parse(readFileSync(resolve(root, "benchmarks/manifest.json"), "utf8")) as Manifest;

function fail(message: string): never {
  console.error(`benchmark: ${message}`);
  process.exit(2);
}

function validateManifest(value: Manifest): void {
  if (value.version !== 1 || !Number.isSafeInteger(value.verificationRuns) || value.verificationRuns < 1) {
    fail("manifest version or verificationRuns is invalid");
  }
  const ids = new Set<string>();
  for (const target of value.targets) {
    if (ids.has(target.id)) fail(`duplicate target id ${target.id}`);
    ids.add(target.id);
    if (!/^[0-9a-f]{40}$/.test(target.commit)) fail(`${target.id} is not pinned to a full commit`);
    if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\.git$/.test(target.url)) fail(`${target.id} has an invalid GitHub URL`);
    if (!/^(npm|pnpm)@\d+\.\d+\.\d+$/.test(target.packageManager)) fail(`${target.id} must pin its package manager`);
    if (!(target.coverageFloor > 0 && target.coverageFloor <= 1)) fail(`${target.id} has an invalid coverage floor`);
    if (!(target.branchFloor > 0 && target.branchFloor <= 1)) fail(`${target.id} has an invalid branch floor`);
  }
}

function run(command: string, args: string[], cwd: string): string {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed (${result.status}):\n${result.stderr}`);
  }
  return result.stdout.trim();
}

function digest(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

function install(target: BenchmarkTarget, checkout: string): void {
  const [manager, version] = target.packageManager.split("@");
  if (manager === "pnpm") {
    run("corepack", [`pnpm@${version}`, "install", "--frozen-lockfile", "--ignore-scripts"], checkout);
    return;
  }
  run("pnpm", ["dlx", `npm@${version}`, "ci", "--ignore-scripts"], checkout);
}

function benchmark(target: BenchmarkTarget, outRoot: string): Record<string, unknown> {
  const temp = mkdtempSync(join(tmpdir(), `doctor-${target.id}-`));
  const checkout = join(temp, "target");
  const artifacts = resolve(outRoot, target.id);
  mkdirSync(artifacts, { recursive: true });
  try {
    run("git", ["init", "--quiet", checkout], temp);
    run("git", ["remote", "add", "origin", target.url], checkout);
    run("git", ["fetch", "--quiet", "--depth=1", "origin", target.commit], checkout);
    run("git", ["checkout", "--quiet", "--detach", "FETCH_HEAD"], checkout);
    const resolvedCommit = run("git", ["rev-parse", "HEAD"], checkout);
    if (resolvedCommit !== target.commit) throw new Error(`expected ${target.commit}, got ${resolvedCommit}`);
    const lockfilePath = resolve(checkout, target.lockfile);
    const lockfileSha256 = digest(lockfilePath);
    install(target, checkout);

    const targetCwd = resolve(checkout, target.cwd);
    const reportPath = resolve(artifacts, "metrics.json");
    const planPath = resolve(artifacts, "plan.json");
    const markdownPath = resolve(artifacts, "plan.md");
    const verdictPath = resolve(artifacts, "verdict.json");
    const scopeArgs = target.filter == null ? [] : ["--filter", target.filter];
    run(process.execPath, [cli, "collect", "--cwd", targetCwd, "--runner", target.runner,
      "--granularity", target.granularity, "--out", reportPath, ...scopeArgs], root);
    run(process.execPath, [cli, "minimize", "--report", reportPath, "--out-plan", planPath,
      "--out-md", markdownPath, "--coverage-floor", String(target.coverageFloor),
      "--branch-floor", String(target.branchFloor)], root);

    const walls: number[] = [];
    for (let index = 0; index < manifest.verificationRuns; index += 1) {
      run(process.execPath, [cli, "verify", "--cwd", targetCwd, "--baseline", reportPath,
        "--out", verdictPath, "--coverage-floor", String(target.coverageFloor),
        "--branch-floor", String(target.branchFloor)], root);
      const verdict = JSON.parse(readFileSync(verdictPath, "utf8"));
      walls.push(verdict.suite.wallMs);
    }
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    const plan = JSON.parse(readFileSync(planPath, "utf8"));
    const verdict = JSON.parse(readFileSync(verdictPath, "utf8"));
    const result = {
      schemaVersion: 1,
      recordedAt: new Date().toISOString(),
      target: { ...target, resolvedCommit, lockfileSha256 },
      tool: { version: TOOL_VERSION, commit: run("git", ["rev-parse", "HEAD"], root) },
      environment: { node: process.version, platform: process.platform, arch: process.arch },
      outcome: verdict.outcome,
      scope: report.scope,
      lineRetention: verdict.lineRetention,
      branchRetention: verdict.branchRetention,
      unitsTotal: plan.summary.unitsTotal,
      unitsKept: plan.summary.unitsKept,
      unitsDropped: plan.summary.unitsDropped,
      collectionErrors: report.collectionErrors,
      estimatedCostMs: plan.summary.keptRuntimeMs,
      verificationWallMs: walls,
      medianVerificationWallMs: median(walls),
    };
    writeFileSync(resolve(artifacts, "benchmark.json"), `${JSON.stringify(result, null, 2)}\n`);
    return result;
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

validateManifest(manifest);
const { values } = parseArgs({
  options: {
    validate: { type: "boolean", default: false },
    target: { type: "string" },
    out: { type: "string", default: "benchmark-results" },
  },
});
if (values.validate) {
  console.log(`validated ${manifest.targets.length} immutable benchmark targets`);
} else {
  const selected = values.target === "all"
    ? manifest.targets
    : manifest.targets.filter((target) => target.id === values.target || target.size === values.target);
  if (selected.length === 0) fail("pass --target <id|small|medium|large|all>");
  if (!readFileSync(cli, "utf8").startsWith("#!/usr/bin/env node")) fail("run pnpm run build first");
  const out = resolve(values.out!);
  mkdirSync(out, { recursive: true });
  const results = selected.map((target) => benchmark(target, out));
  writeFileSync(resolve(out, `summary-${basename(values.target!)}.json`), `${JSON.stringify(results, null, 2)}\n`);
}
