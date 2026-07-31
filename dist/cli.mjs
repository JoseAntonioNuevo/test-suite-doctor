#!/usr/bin/env node
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// scripts/lib/version.ts
var TOOL_VERSION;
var init_version = __esm({
  "scripts/lib/version.ts"() {
    "use strict";
    TOOL_VERSION = "0.3.0";
  }
});

// scripts/lib/args.ts
function parseFiniteNumber(flag, raw) {
  if (raw.trim() === "") throw new Error(`${flag} must be a finite number`);
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${flag} must be a finite number`);
  return value;
}
function parseFraction(flag, raw) {
  const value = parseFiniteNumber(flag, raw);
  if (value < 0 || value > 1) throw new Error(`${flag} must be in [0, 1]`);
  return value;
}
function parsePercentage(flag, raw) {
  const value = parseFiniteNumber(flag, raw);
  if (value < 0 || value > 100) throw new Error(`${flag} must be in [0, 100]`);
  return value;
}
function parsePositiveInteger(flag, raw) {
  const value = parseFiniteNumber(flag, raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${flag} must be a positive safe integer`);
  }
  return value;
}
function parseNonNegativeNumber(flag, raw) {
  const value = parseFiniteNumber(flag, raw);
  if (value < 0) throw new Error(`${flag} must be non-negative`);
  return value;
}
function parseRegex(flag, raw) {
  try {
    return new RegExp(raw);
  } catch (error) {
    throw new Error(`${flag} has an invalid regular expression: ${error.message}`);
  }
}
var init_args = __esm({
  "scripts/lib/args.ts"() {
    "use strict";
  }
});

// scripts/lib/artifacts.ts
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
function createInvocationDir(parent, command) {
  const root = resolve(parent);
  mkdirSync(root, { recursive: true });
  return mkdtempSync(join(root, `${command}-`));
}
function invalidateOutput(path) {
  rmSync(path, { force: true });
  rmSync(`${path}.tmp`, { force: true });
}
function writeJsonAtomic(path, value) {
  const directory = dirname(path);
  mkdirSync(directory, { recursive: true });
  const temporary = join(directory, `${basename(path)}.tmp`);
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}
`);
  renameSync(temporary, path);
}
var init_artifacts = __esm({
  "scripts/lib/artifacts.ts"() {
    "use strict";
  }
});

// scripts/lib/detect.ts
import { existsSync, readFileSync } from "node:fs";
import { join as join2 } from "node:path";
function detectRunner(cwd, override) {
  if (override && override !== "auto") {
    if (override !== "vitest" && override !== "jest") {
      throw new Error(`Unknown runner "${override}" — expected "vitest" or "jest"`);
    }
    return { runner: override, reason: "forced via --runner" };
  }
  const pkgPath = join2(cwd, "package.json");
  if (!existsSync(pkgPath)) {
    throw new Error(`No package.json in ${cwd} — run from the target repo root or pass --cwd`);
  }
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const hasVitestDep = deps["vitest"] != null;
  const hasJestDep = deps["jest"] != null;
  const hasVitestConfig = VITEST_CONFIGS.some((f) => existsSync(join2(cwd, f)));
  const hasJestConfig = JEST_CONFIGS.some((f) => existsSync(join2(cwd, f))) || pkg.jest != null;
  if (hasVitestDep && !hasJestDep) return { runner: "vitest", reason: "vitest in package.json dependencies" };
  if (hasJestDep && !hasVitestDep) return { runner: "jest", reason: "jest in package.json dependencies" };
  if (hasVitestDep && hasJestDep) {
    if (hasVitestConfig && !hasJestConfig) return { runner: "vitest", reason: "both installed; vitest config file present" };
    if (hasJestConfig && !hasVitestConfig) return { runner: "jest", reason: "both installed; jest config present" };
    const testScript = pkg.scripts?.["test"] ?? "";
    if (/\bvitest\b/.test(testScript)) return { runner: "vitest", reason: 'both installed; "test" script runs vitest' };
    if (/\bjest\b/.test(testScript)) return { runner: "jest", reason: 'both installed; "test" script runs jest' };
    throw new Error(
      "Both vitest and jest are installed and neither config nor the test script disambiguates — pass --runner vitest|jest"
    );
  }
  if (hasVitestConfig) return { runner: "vitest", reason: "vitest config file present" };
  if (hasJestConfig) return { runner: "jest", reason: "jest config present" };
  throw new Error(
    `Could not detect a test runner in ${cwd}. Supported: vitest, jest. If this is a monorepo package, pass --cwd to the package directory, or force with --runner.`
  );
}
var VITEST_CONFIGS, JEST_CONFIGS;
var init_detect = __esm({
  "scripts/lib/detect.ts"() {
    "use strict";
    VITEST_CONFIGS = [
      "vitest.config.ts",
      "vitest.config.js",
      "vitest.config.mts",
      "vitest.config.mjs",
      "vitest.config.cts",
      "vitest.workspace.ts",
      "vitest.workspace.js"
    ];
    JEST_CONFIGS = [
      "jest.config.js",
      "jest.config.ts",
      "jest.config.mjs",
      "jest.config.cjs",
      "jest.config.json"
    ];
  }
});

// scripts/lib/exec.ts
import { spawn } from "node:child_process";
function run(cmd, args, opts) {
  const bin = process.platform === "win32" && cmd === "npx" ? "npx.cmd" : cmd;
  return new Promise((resolve8) => {
    const started = Date.now();
    const child = spawn(bin, args, {
      cwd: opts.cwd,
      env: { ...process.env, CI: "true", ...opts.env },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    child.stdout?.on("data", (d) => stdout += d);
    child.stderr?.on("data", (d) => stderr += d);
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5e3).unref();
    }, opts.timeoutMs);
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve8(result);
    };
    child.on("error", (err) => {
      finish({
        code: null,
        signal: null,
        error: err.message,
        timedOut,
        stdout,
        stderr: `${stderr}
${err.message}`,
        wallMs: Date.now() - started
      });
    });
    child.on("close", (code, signal) => {
      finish({ code, signal, error: null, timedOut, stdout, stderr, wallMs: Date.now() - started });
    });
  });
}
async function pool(items, concurrency, worker) {
  const results = new Array(items.length);
  let next = 0;
  const lanes = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(lanes);
  return results;
}
var init_exec = __esm({
  "scripts/lib/exec.ts"() {
    "use strict";
  }
});

// scripts/lib/istanbul.ts
import { isAbsolute, relative } from "node:path";
function normalizePath(file, cwd) {
  let p = file;
  if (isAbsolute(p)) {
    const rel = relative(cwd, p);
    if (!rel.startsWith("..")) p = rel;
  }
  return p.replace(/\\/g, "/");
}
function parseCoverageFinal(raw, cwd) {
  const files = {};
  const totals = { coveredLines: 0, totalLines: 0, coveredBranches: 0, totalBranches: 0 };
  for (const [file, cov] of Object.entries(raw)) {
    const covered = /* @__PURE__ */ new Set();
    const all = /* @__PURE__ */ new Set();
    for (const [sid, loc] of Object.entries(cov.statementMap ?? {})) {
      const line = loc.start?.line;
      if (typeof line !== "number") continue;
      all.add(line);
      if ((cov.s?.[sid] ?? 0) > 0) covered.add(line);
    }
    const coveredBranches = [];
    let branchTotal = 0;
    for (const [bid, hits] of Object.entries(cov.b ?? {})) {
      hits.forEach((count, i) => {
        branchTotal += 1;
        if (count > 0) coveredBranches.push(`${bid}.${i}`);
      });
    }
    const key = normalizePath(file, cwd);
    files[key] = {
      lines: [...covered].sort((a, b) => a - b),
      branches: coveredBranches.sort()
    };
    totals.coveredLines += covered.size;
    totals.totalLines += all.size;
    totals.coveredBranches += coveredBranches.length;
    totals.totalBranches += branchTotal;
  }
  return { files, totals };
}
function toKeySets(map) {
  const lines = /* @__PURE__ */ new Set();
  const branches = /* @__PURE__ */ new Set();
  for (const [file, cov] of Object.entries(map)) {
    for (const line of cov.lines) lines.add(`${file}:${line}`);
    for (const b of cov.branches) branches.add(`${file}:${b}`);
  }
  return { lines, branches };
}
function intersectionSize(a, b) {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let n = 0;
  for (const k of small) if (large.has(k)) n += 1;
  return n;
}
var init_istanbul = __esm({
  "scripts/lib/istanbul.ts"() {
    "use strict";
  }
});

// scripts/lib/runner-commands.ts
import { join as join3, resolve as resolve2 } from "node:path";
function buildRunSpec(runner, opts) {
  const base = resolve2(opts.scratchDir, opts.label);
  const resultsFile = join3(base, "results.json");
  const coverageDir = join3(base, "coverage");
  const extra = opts.extraArgs ?? [];
  if (runner === "vitest") {
    const selectedFiles2 = opts.testFiles ?? (opts.testFile ? [opts.testFile] : []);
    const args2 = [
      "run",
      ...selectedFiles2,
      "--coverage",
      "--coverage.reporter=json",
      `--coverage.reportsDirectory=${coverageDir}`,
      "--reporter=json",
      `--outputFile=${resultsFile}`,
      "--silent",
      ...opts.testNamePattern ? ["-t", opts.testNamePattern] : [],
      ...extra
    ];
    return { args: args2, resultsFile, coverageDir };
  }
  const selectedFiles = opts.testFiles ?? (opts.testFile ? [opts.testFile] : []);
  const args = [
    ...selectedFiles.length > 0 ? ["--runTestsByPath", ...selectedFiles] : [],
    "--coverage",
    "--coverageReporters=json",
    `--coverageDirectory=${coverageDir}`,
    "--json",
    `--outputFile=${resultsFile}`,
    "--silent",
    // Neutralize configured thresholds: a single-file run would always fail them.
    "--coverageThreshold",
    "{}",
    ...opts.testNamePattern ? ["-t", opts.testNamePattern] : [],
    ...extra
  ];
  return { args, resultsFile, coverageDir };
}
function parseResultsFile(raw) {
  const tests = [];
  const files = [];
  const fileDurations = /* @__PURE__ */ new Map();
  for (const fileResult of raw.testResults ?? []) {
    if (fileResult.name) {
      files.push(fileResult.name);
      if (typeof fileResult.startTime === "number" && typeof fileResult.endTime === "number" && fileResult.endTime >= fileResult.startTime) {
        fileDurations.set(fileResult.name, fileResult.endTime - fileResult.startTime);
      }
    }
    for (const t of fileResult.assertionResults ?? []) {
      tests.push({
        fullName: t.fullName || t.title || "(unnamed test)",
        status: t.status ?? "unknown",
        durationMs: typeof t.duration === "number" ? t.duration : 0
      });
    }
  }
  return {
    tests,
    files,
    totalTests: raw.numTotalTests ?? tests.length,
    success: typeof raw.success === "boolean" ? raw.success : null,
    failedTests: raw.numFailedTests ?? tests.filter((test) => test.status === "failed").length,
    failedSuites: raw.numFailedTestSuites ?? (raw.testResults ?? []).filter((result) => result.status === "failed").length,
    runtimeErrorSuites: raw.numRuntimeErrorTestSuites ?? 0,
    suiteMessages: (raw.testResults ?? []).map((result) => result.message?.trim()).filter((message) => Boolean(message)),
    fileDurations
  };
}
function validateRunOutcome(process2, results) {
  const reasons = [];
  if (process2.timedOut) reasons.push("process timed out");
  if (process2.error) reasons.push(`spawn failed: ${process2.error}`);
  if (process2.signal) reasons.push(`process terminated by ${process2.signal}`);
  if (process2.code !== 0) reasons.push(`process exited ${process2.code ?? "without a code"}`);
  if (results.success === false) reasons.push("suite summary reported failure");
  if (results.failedTests > 0) reasons.push(`${results.failedTests} failed test(s)`);
  if (results.failedSuites > 0) reasons.push(`${results.failedSuites} failed suite(s)`);
  if (results.runtimeErrorSuites > 0) {
    reasons.push(`${results.runtimeErrorSuites} runtime-error suite(s)`);
  }
  if (results.tests.some((test) => test.status === "failed")) {
    reasons.push("assertion results contain failures");
  }
  for (const message of results.suiteMessages) reasons.push(`suite: ${message}`);
  if (results.totalTests <= 0 || results.tests.length === 0) {
    reasons.push("suite executed no tests");
    return { green: false, kind: "environment-error", reasons };
  }
  if (reasons.length === 0) return { green: true, kind: "passed", reasons };
  const hasTestFailure = results.success === false || results.failedTests > 0 || results.failedSuites > 0 || results.runtimeErrorSuites > 0 || results.tests.some((test) => test.status === "failed");
  return { green: false, kind: hasTestFailure ? "test-failure" : "environment-error", reasons };
}
function exactNamePattern(name) {
  return `^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`;
}
var init_runner_commands = __esm({
  "scripts/lib/runner-commands.ts"() {
    "use strict";
  }
});

// scripts/lib/runner-resolution.ts
import { readFileSync as readFileSync2 } from "node:fs";
import { createRequire } from "node:module";
import { dirname as dirname2, isAbsolute as isAbsolute2, join as join4, resolve as resolve3 } from "node:path";
function resolveTargetBinary(cwd, runner, override) {
  if (override) {
    const executable2 = isAbsolute2(override) ? override : resolve3(cwd, override);
    return {
      command: process.execPath,
      argsPrefix: [executable2],
      executable: executable2,
      packageName: "override",
      version: "override"
    };
  }
  const packageName = PACKAGES[runner];
  const requireFromTarget = createRequire(join4(resolve3(cwd), "package.json"));
  let packagePath;
  try {
    packagePath = requireFromTarget.resolve(`${packageName}/package.json`);
  } catch {
    throw new Error(
      `${packageName} is not installed for ${cwd}; install it in the target package or pass --runner-bin`
    );
  }
  const pkg = JSON.parse(readFileSync2(packagePath, "utf8"));
  const binValue = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.[packageName] ?? Object.values(pkg.bin ?? {})[0];
  if (!binValue) throw new Error(`${packageName} package does not declare an executable`);
  const executable = resolve3(dirname2(packagePath), binValue);
  return {
    command: process.execPath,
    argsPrefix: [executable],
    executable,
    packageName,
    version: pkg.version ?? "unknown"
  };
}
function resolveStrykerBinary(cwd, override) {
  if (override) {
    const executable2 = isAbsolute2(override) ? override : resolve3(cwd, override);
    return {
      command: process.execPath,
      argsPrefix: [executable2],
      executable: executable2,
      packageName: "override",
      version: "override"
    };
  }
  const requireFromTarget = createRequire(join4(resolve3(cwd), "package.json"));
  let packagePath;
  try {
    packagePath = requireFromTarget.resolve("@stryker-mutator/core/package.json");
  } catch {
    throw new Error(
      `@stryker-mutator/core is not installed for ${cwd}; install it or pass --stryker-bin`
    );
  }
  const pkg = JSON.parse(readFileSync2(packagePath, "utf8"));
  const binValue = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.stryker ?? Object.values(pkg.bin ?? {})[0];
  if (!binValue) throw new Error("@stryker-mutator/core does not declare an executable");
  const executable = resolve3(dirname2(packagePath), binValue);
  return {
    command: process.execPath,
    argsPrefix: [executable],
    executable,
    packageName: "@stryker-mutator/core",
    version: pkg.version ?? "unknown"
  };
}
function listTestFilesSpec(runner, runnerArgs) {
  return runner === "vitest" ? ["list", "--filesOnly", ...runnerArgs] : ["--listTests", "--json", ...runnerArgs];
}
function parseListedTestFiles(runner, stdout) {
  if (runner === "jest") {
    const parsed = JSON.parse(stdout);
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
      throw new Error("Jest --listTests did not return a JSON array of paths");
    }
    return [...new Set(parsed)].sort();
  }
  return [...new Set(stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))].sort();
}
function resolvePackageVersion(cwd, packageName) {
  const requireFromTarget = createRequire(join4(resolve3(cwd), "package.json"));
  let packagePath;
  try {
    packagePath = requireFromTarget.resolve(`${packageName}/package.json`);
  } catch {
    throw new Error(`${packageName} is not installed for ${cwd}`);
  }
  const pkg = JSON.parse(readFileSync2(packagePath, "utf8"));
  if (!pkg.version) throw new Error(`${packageName} package has no version`);
  return pkg.version;
}
var PACKAGES;
var init_runner_resolution = __esm({
  "scripts/lib/runner-resolution.ts"() {
    "use strict";
    PACKAGES = { vitest: "vitest", jest: "jest" };
  }
});

// scripts/lib/timing.ts
function selectOptimizationCost(unit, granularity, model) {
  const assertionMs = unit.assertionMs ?? unit.runtimeMs;
  if (model === "wall") {
    return { optimizationMs: unit.wallMs, costSource: "process-wall" };
  }
  if (model === "auto" && granularity === "file" && unit.fileMs != null) {
    return { optimizationMs: unit.fileMs, costSource: "runner-file" };
  }
  return { optimizationMs: assertionMs, costSource: "assertion-sum" };
}
var init_timing = __esm({
  "scripts/lib/timing.ts"() {
    "use strict";
  }
});

// scripts/lib/provenance.ts
import { createHash } from "node:crypto";
import { existsSync as existsSync2, readFileSync as readFileSync3 } from "node:fs";
import { isAbsolute as isAbsolute3, join as join5, relative as relative2, resolve as resolve4 } from "node:path";
import { spawnSync } from "node:child_process";
function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
function fileHash(path) {
  return existsSync2(path) ? sha256(readFileSync3(path)) : null;
}
function sortedRecord(entries) {
  return Object.fromEntries(entries.sort(([left], [right]) => left.localeCompare(right)));
}
function gitValue(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}
function captureProvenance(cwd, coveredFiles, runtime) {
  const root = resolve4(cwd);
  const coveredSources = sortedRecord(
    [...new Set(coveredFiles)].map((file) => {
      const absolute = isAbsolute3(file) ? file : join5(root, file);
      const key = isAbsolute3(file) ? relative2(root, absolute).replace(/\\/g, "/") : file.replace(/\\/g, "/");
      return [key, fileHash(absolute)];
    })
  );
  const configurationPaths = [
    "package.json",
    ...RUNNER_CONFIGS[runtime.runner.name].filter((file) => existsSync2(join5(root, file)))
  ];
  const lockfile = LOCKFILES.find((file) => existsSync2(join5(root, file)));
  if (lockfile) configurationPaths.push(lockfile);
  const configuration = Object.fromEntries(
    configurationPaths.map((file) => [file, fileHash(join5(root, file))]).filter((entry) => entry[1] != null).sort(([left], [right]) => left.localeCompare(right))
  );
  const commit = gitValue(root, ["rev-parse", "HEAD"]);
  const branch = gitValue(root, ["branch", "--show-current"]);
  const status = gitValue(root, ["status", "--porcelain=v1"]);
  const git = {
    commit,
    branch,
    dirty: status == null ? null : status.length > 0,
    diffHash: status == null ? null : sha256(status)
  };
  const fingerprint = sha256(
    JSON.stringify({
      coveredSources,
      configuration,
      runner: { name: runtime.runner.name, version: runtime.runner.version },
      coverageProvider: runtime.coverageProvider
    })
  );
  return { fingerprint, coveredSources, configuration, runtime, git };
}
function compareProvenance(baseline, current) {
  const mismatches = [];
  for (const [path, expected] of Object.entries(baseline.coveredSources)) {
    const actual = current.coveredSources[path] ?? null;
    if (actual !== expected) {
      mismatches.push({
        code: actual == null ? "covered-source-deleted" : "covered-source-changed",
        path,
        expected,
        actual
      });
    }
  }
  const configurationKeys = /* @__PURE__ */ new Set([
    ...Object.keys(baseline.configuration),
    ...Object.keys(current.configuration)
  ]);
  for (const path of [...configurationKeys].sort()) {
    const expected = baseline.configuration[path] ?? null;
    const actual = current.configuration[path] ?? null;
    if (actual !== expected) {
      mismatches.push({ code: "configuration-changed", path, expected, actual });
    }
  }
  if (baseline.runtime.runner.version !== current.runtime.runner.version) {
    mismatches.push({
      code: "runner-version-changed",
      expected: baseline.runtime.runner.version,
      actual: current.runtime.runner.version
    });
  }
  if (baseline.runtime.coverageProvider?.version !== current.runtime.coverageProvider?.version || baseline.runtime.coverageProvider?.name !== current.runtime.coverageProvider?.name) {
    mismatches.push({
      code: "coverage-provider-version-changed",
      expected: baseline.runtime.coverageProvider?.version ?? null,
      actual: current.runtime.coverageProvider?.version ?? null
    });
  }
  return mismatches;
}
var RUNNER_CONFIGS, LOCKFILES;
var init_provenance = __esm({
  "scripts/lib/provenance.ts"() {
    "use strict";
    RUNNER_CONFIGS = {
      vitest: [
        "vitest.config.ts",
        "vitest.config.js",
        "vitest.config.mts",
        "vitest.config.mjs",
        "vitest.config.cts",
        "vitest.workspace.ts",
        "vitest.workspace.js"
      ],
      jest: [
        "jest.config.js",
        "jest.config.ts",
        "jest.config.mjs",
        "jest.config.cjs",
        "jest.config.json"
      ]
    };
    LOCKFILES = ["npm-shrinkwrap.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lock"];
  }
});

// scripts/commands/collect.ts
var collect_exports = {};
__export(collect_exports, {
  collectCommand: () => collectCommand
});
import { existsSync as existsSync3, mkdirSync as mkdirSync2, readFileSync as readFileSync4, realpathSync, rmSync as rmSync2 } from "node:fs";
import { basename as basename2, isAbsolute as isAbsolute4, join as join6, relative as relative3, resolve as resolve5 } from "node:path";
import { parseArgs } from "node:util";
function fail(msg) {
  console.error(`
collect-metrics: ${msg}`);
  process.exit(2);
}
function failQuality(msg) {
  console.error(`
collect-metrics: ${msg}`);
  process.exit(1);
}
function readJson(path, what, stderr) {
  if (!existsSync3(path)) {
    fail(`${what} was not written (${path}).
Runner stderr (tail):
${stderr.slice(-2e3)}`);
  }
  return JSON.parse(readFileSync4(path, "utf8"));
}
function statusOf(tests) {
  const executed = tests.filter((t) => t.status === "passed" || t.status === "failed");
  if (executed.length === 0) return "empty";
  if (executed.every((t) => t.status === "passed")) return "passed";
  if (executed.every((t) => t.status === "failed")) return "failed";
  return "mixed";
}
async function collectCommand(args = process.argv.slice(2)) {
  const { values } = parseArgs({
    args,
    options: {
      cwd: { type: "string", default: "." },
      runner: { type: "string", default: "auto" },
      "runner-bin": { type: "string" },
      "runner-arg": { type: "string", multiple: true, default: [] },
      granularity: { type: "string", default: "file" },
      filter: { type: "string" },
      out: { type: "string", default: ".test-doctor/report.json" },
      scratch: { type: "string", default: ".test-doctor/tmp" },
      concurrency: { type: "string", default: "2" },
      "timeout-ms": { type: "string", default: "600000" },
      "baseline-timeout-ms": { type: "string", default: "3600000" },
      "keep-scratch": { type: "boolean", default: false },
      help: { type: "boolean", default: false }
    }
  });
  if (values.help) {
    console.log(HELP);
    return;
  }
  let cwd;
  try {
    cwd = realpathSync(resolve5(values.cwd));
  } catch {
    fail(`--cwd does not exist: ${resolve5(values.cwd)}`);
  }
  const granularity = values.granularity;
  if (granularity !== "file" && granularity !== "test") fail("--granularity must be file or test");
  const outFile = resolve5(cwd, values.out);
  let unitTimeout;
  let baselineTimeout;
  let concurrency;
  let filter;
  try {
    unitTimeout = parsePositiveInteger("--timeout-ms", values["timeout-ms"]);
    baselineTimeout = parsePositiveInteger(
      "--baseline-timeout-ms",
      values["baseline-timeout-ms"]
    );
    concurrency = parsePositiveInteger("--concurrency", values.concurrency);
    filter = values.filter ? parseRegex("--filter", values.filter) : null;
  } catch (error) {
    fail(error.message);
  }
  invalidateOutput(outFile);
  let detection;
  try {
    detection = detectRunner(cwd, values.runner);
  } catch (err) {
    fail(err.message);
  }
  const { runner } = detection;
  let runnerBinary;
  try {
    runnerBinary = resolveTargetBinary(cwd, runner, values["runner-bin"]);
  } catch (error) {
    fail(error.message);
  }
  console.error(`runner: ${runner} (${detection.reason})`);
  let coverageProvider;
  try {
    coverageProvider = runner === "vitest" ? {
      name: "@vitest/coverage-v8",
      version: resolvePackageVersion(cwd, "@vitest/coverage-v8")
    } : { name: "jest-built-in", version: runnerBinary.version };
  } catch (error) {
    fail(error.message);
  }
  const scratchDir = createInvocationDir(resolve5(cwd, values.scratch), "collect");
  const relFile = (file) => (isAbsolute4(file) ? relative3(cwd, file) : file).replace(/\\/g, "/");
  const runnerArgs = values["runner-arg"] ?? [];
  const listResult = await run(
    runnerBinary.command,
    [...runnerBinary.argsPrefix, ...listTestFilesSpec(runner, runnerArgs)],
    { cwd, timeoutMs: baselineTimeout }
  );
  if (listResult.timedOut || listResult.error || listResult.signal || listResult.code !== 0) {
    if (!values["keep-scratch"]) rmSync2(scratchDir, { recursive: true, force: true });
    fail(`test-file listing failed:
${listResult.stderr.slice(-2e3)}`);
  }
  let testFiles;
  try {
    testFiles = parseListedTestFiles(runner, listResult.stdout).map(relFile).sort();
  } catch (error) {
    fail(error.message);
  }
  if (filter) testFiles = testFiles.filter((file) => filter.test(file));
  if (testFiles.length === 0) fail("no test files to measure after --filter");
  console.error("baseline: running the full suite with coverage (this is the slow part)…");
  const baseSpec = buildRunSpec(runner, {
    scratchDir,
    label: "baseline",
    testFiles: filter ? testFiles.map((file) => join6(cwd, file)) : void 0,
    extraArgs: runnerArgs
  });
  mkdirSync2(join6(scratchDir, "baseline"), { recursive: true });
  const baseRes = await run(
    runnerBinary.command,
    [...runnerBinary.argsPrefix, ...baseSpec.args],
    { cwd, timeoutMs: baselineTimeout }
  );
  if (baseRes.timedOut) fail(`baseline run exceeded --baseline-timeout-ms ${baselineTimeout}`);
  const baseResults = parseResultsFile(
    readJson(baseSpec.resultsFile, "baseline results JSON", baseRes.stderr)
  );
  const baseOutcome = validateRunOutcome(baseRes, baseResults);
  if (!baseOutcome.green) {
    if (!values["keep-scratch"]) rmSync2(scratchDir, { recursive: true, force: true });
    if (baseOutcome.kind === "test-failure") {
      failQuality(`baseline failed: ${baseOutcome.reasons.join("; ")}`);
    }
    fail(`baseline could not be evaluated: ${baseOutcome.reasons.join("; ")}`);
  }
  const baseCovRaw = readJson(
    join6(baseSpec.coverageDir, "coverage-final.json"),
    "baseline coverage-final.json (is a coverage provider installed? e.g. @vitest/coverage-v8)",
    baseRes.stderr
  );
  const baseCov = parseCoverageFinal(baseCovRaw, cwd);
  if (baseCov.totals.coveredLines === 0) {
    if (!values["keep-scratch"]) rmSync2(scratchDir, { recursive: true, force: true });
    fail("baseline coverage is empty — check the coverage provider and include configuration");
  }
  const totalRuntimeMs = baseResults.tests.reduce((s, t) => s + t.durationMs, 0);
  console.error(
    `baseline: ${baseResults.totalTests} tests in ${baseResults.files.length} files, ${baseCov.totals.coveredLines}/${baseCov.totals.totalLines} lines covered (${(baseCov.totals.coveredLines / Math.max(baseCov.totals.totalLines, 1) * 100).toFixed(1)}%)`
  );
  let unitSpecs;
  if (granularity === "file") {
    unitSpecs = testFiles.map((f) => ({ id: f, file: f, testName: null, memberCount: 1 }));
  } else {
    const raw = readJson(baseSpec.resultsFile, "baseline results JSON", "");
    const groups = /* @__PURE__ */ new Map();
    for (const fileResult of raw.testResults ?? []) {
      const file = relFile(fileResult.name ?? "");
      if (!file || !testFiles.includes(file)) continue;
      for (const t of fileResult.assertionResults ?? []) {
        const name = t.fullName || t.title || "";
        if (!name) continue;
        const key = JSON.stringify([file, name]);
        const existing = groups.get(key);
        if (existing) existing.memberCount += 1;
        else {
          groups.set(key, {
            id: `${file}::${name}`,
            file,
            testName: name,
            memberCount: 1
          });
        }
      }
    }
    unitSpecs = [...groups.values()];
    console.error(
      `granularity=test: ${unitSpecs.length} isolated runs queued — expect roughly ${unitSpecs.length}× the runner startup cost. Use --filter to scope if needed.`
    );
  }
  const collectionErrors = [];
  let done = 0;
  const units = await pool(unitSpecs, concurrency, async (spec, i) => {
    const label = `unit-${i}`;
    const runSpec = buildRunSpec(runner, {
      scratchDir,
      label,
      // Runner path selectors are relative to cwd. Vitest can treat an
      // absolute selector containing spaces as a non-matching filter.
      testFile: spec.file,
      testNamePattern: spec.testName ? exactNamePattern(spec.testName) : void 0,
      extraArgs: runnerArgs
    });
    mkdirSync2(join6(scratchDir, label), { recursive: true });
    const res = await run(
      runnerBinary.command,
      [...runnerBinary.argsPrefix, ...runSpec.args],
      { cwd, timeoutMs: unitTimeout }
    );
    let unit;
    try {
      if (res.timedOut) throw new Error(`timed out after ${unitTimeout}ms`);
      const results = parseResultsFile(
        readJson(runSpec.resultsFile, "results JSON", res.stderr)
      );
      const outcome = validateRunOutcome(res, results);
      if (!outcome.green) throw new Error(outcome.reasons.join("; "));
      const covPath = join6(runSpec.coverageDir, "coverage-final.json");
      const cov = existsSync3(covPath) ? parseCoverageFinal(
        JSON.parse(readFileSync4(covPath, "utf8")),
        cwd
      ) : null;
      if (!cov) throw new Error("coverage-final.json missing");
      const tests = spec.testName ? results.tests.filter((t) => t.fullName === spec.testName) : results.tests;
      if (spec.testName && tests.length !== spec.memberCount) {
        throw new Error(
          `selector executed ${tests.length} matching assertion(s); expected ${spec.memberCount}`
        );
      }
      const assertionMs = tests.reduce((sum, test) => sum + test.durationMs, 0);
      const fileMs = spec.testName ? null : [...results.fileDurations.entries()].find(
        ([file]) => relFile(file) === spec.file
      )?.[1] ?? null;
      const timing = selectOptimizationCost(
        {
          id: spec.id,
          file: spec.file,
          testName: spec.testName,
          tests,
          runtimeMs: assertionMs,
          assertionMs,
          fileMs,
          wallMs: res.wallMs,
          status: "passed",
          coverage: cov.files
        },
        granularity,
        "auto"
      );
      unit = {
        id: spec.id,
        file: spec.file,
        testName: spec.testName,
        identity: { file: spec.file, testName: spec.testName },
        memberCount: spec.testName ? spec.memberCount : tests.length,
        tests,
        runtimeMs: assertionMs,
        assertionMs,
        fileMs,
        ...timing,
        wallMs: res.wallMs,
        status: statusOf(tests),
        coverage: cov.files
      };
    } catch (err) {
      collectionErrors.push({ id: spec.id, reason: err.message });
      unit = {
        id: spec.id,
        file: spec.file,
        testName: spec.testName,
        identity: { file: spec.file, testName: spec.testName },
        memberCount: spec.memberCount,
        tests: [],
        runtimeMs: 0,
        assertionMs: 0,
        fileMs: null,
        optimizationMs: 0,
        costSource: "assertion-sum",
        wallMs: res.wallMs,
        status: "error",
        coverage: {}
      };
    }
    if (!values["keep-scratch"]) rmSync2(join6(scratchDir, label), { recursive: true, force: true });
    done += 1;
    console.error(
      `[${done}/${unitSpecs.length}] ${spec.id} — ${unit.status}, ${Math.round(unit.runtimeMs)}ms tests, ${res.wallMs}ms wall`
    );
    return unit;
  });
  const report = {
    version: 2,
    tool: "test-suite-doctor",
    toolVersion: TOOL_VERSION,
    runId: basename2(scratchDir),
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    cwd,
    runner,
    granularity,
    options: {
      runner: values.runner,
      granularity,
      filter: values.filter ?? null,
      concurrency,
      timeoutMs: unitTimeout,
      baselineTimeoutMs: baselineTimeout,
      runnerArgs
    },
    scope: {
      mode: filter ? "filtered" : "full",
      filter: values.filter ?? null,
      testFiles
    },
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      runner: {
        name: runner,
        version: runnerBinary.version,
        executable: runnerBinary.executable
      },
      coverageProvider
    },
    provenance: captureProvenance(cwd, Object.keys(baseCov.files), {
      runner: {
        name: runner,
        version: runnerBinary.version,
        executable: runnerBinary.executable
      },
      coverageProvider
    }),
    baseline: {
      totalTests: baseResults.totalTests,
      totalRuntimeMs: Math.round(totalRuntimeMs),
      wallMs: baseRes.wallMs,
      ...baseCov.totals
    },
    baselineCoverage: baseCov.files,
    collectionErrors,
    units
  };
  writeJsonAtomic(outFile, report);
  const slowest = [...units].sort((a, b) => b.runtimeMs - a.runtimeMs).slice(0, 5);
  console.error(`
report written: ${outFile}`);
  console.error(`units measured: ${units.length} (${collectionErrors.length} collection errors)`);
  if (collectionErrors.length > 0) {
    console.error("⚠️  units with collection errors contribute no coverage and will be dropped by");
    console.error("   the minimizer — investigate them before trusting the plan:");
    for (const e of collectionErrors.slice(0, 10)) console.error(`   - ${e.id}: ${e.reason}`);
  }
  console.error("slowest units:");
  for (const u of slowest) console.error(`   ${Math.round(u.runtimeMs)}ms  ${u.id}`);
  if (values["keep-scratch"]) console.error(`scratch preserved: ${scratchDir}`);
  else rmSync2(scratchDir, { recursive: true, force: true });
  console.error("\nnext: test-suite-doctor minimize --report " + relative3(process.cwd(), outFile));
  if (collectionErrors.length > 0) process.exit(1);
}
var HELP;
var init_collect = __esm({
  "scripts/commands/collect.ts"() {
    "use strict";
    init_args();
    init_artifacts();
    init_detect();
    init_exec();
    init_istanbul();
    init_runner_commands();
    init_runner_resolution();
    init_timing();
    init_provenance();
    init_version();
    HELP = `collect-metrics — per-test coverage + runtime for Vitest/Jest suites

Usage: test-suite-doctor collect [options]

Options:
  --cwd <dir>                Target repo root (default: current directory)
  --runner <auto|vitest|jest>  Test runner (default: auto-detect)
  --runner-bin <path>        Explicit target-local runner JavaScript executable
  --runner-arg <arg>         Additional runner argument (repeatable)
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
  }
});

// scripts/lib/greedy.ts
function scoreOf(newLines, newBranches, runtimeMs, o) {
  return (o.weightLines * newLines + o.weightBranches * newBranches) / Math.max(runtimeMs, 1);
}
function optimizationCost(unit) {
  return unit.optimizationMs ?? unit.runtimeMs;
}
function minimize(units, baseline, optsIn = {}) {
  const o = { ...DEFAULT_OPTIONS, ...optsIn };
  const warnings = [];
  let baseKeys = toKeySets(baseline);
  if (baseKeys.lines.size === 0) {
    warnings.push("Baseline coverage is empty — using the union of per-unit coverage as the universe.");
    const union = /* @__PURE__ */ new Set();
    const unionB = /* @__PURE__ */ new Set();
    for (const u of units) {
      const k = toKeySets(u.coverage);
      for (const key of k.lines) union.add(key);
      for (const key of k.branches) unionB.add(key);
    }
    baseKeys = { lines: union, branches: unionB };
  }
  const candidates = units.map((unit) => {
    const k = toKeySets(unit.coverage);
    const lines = new Set([...k.lines].filter((key) => baseKeys.lines.has(key)));
    const branches = new Set([...k.branches].filter((key) => baseKeys.branches.has(key)));
    return {
      unit,
      lines,
      branches,
      cachedScore: scoreOf(lines.size, branches.size, optimizationCost(unit), o),
      cachedNewLines: lines.size,
      cachedNewBranches: branches.size,
      costMs: optimizationCost(unit)
    };
  });
  const covered = /* @__PURE__ */ new Set();
  const coveredBranches = /* @__PURE__ */ new Set();
  const keep = [];
  const keptSet = /* @__PURE__ */ new Set();
  let keptRuntime = 0;
  const lineRetention = () => baseKeys.lines.size === 0 ? 1 : covered.size / baseKeys.lines.size;
  const branchRetention = () => baseKeys.branches.size === 0 ? 1 : coveredBranches.size / baseKeys.branches.size;
  const floorsMet = () => lineRetention() >= o.coverageFloor && (o.branchFloor == null || branchRetention() >= o.branchFloor);
  const select = (c, reason) => {
    let newLines = 0;
    for (const key of c.lines) if (!covered.has(key)) newLines += 1;
    let newBranches = 0;
    for (const key of c.branches) if (!coveredBranches.has(key)) newBranches += 1;
    for (const key of c.lines) covered.add(key);
    for (const key of c.branches) coveredBranches.add(key);
    keptRuntime += c.costMs;
    keptSet.add(c.unit.id);
    keep.push({
      id: c.unit.id,
      reason,
      newLines,
      newBranches,
      runtimeMs: c.costMs,
      cumulativeLineRetention: round4(lineRetention()),
      cumulativeBranchRetention: round4(branchRetention())
    });
  };
  for (const c of candidates) {
    if (o.forceKeep.some((re) => re.test(c.unit.id))) {
      select(c, "force-kept (--keep pattern)");
    }
  }
  for (; ; ) {
    if (floorsMet()) break;
    if (o.strictCount && o.targetCount != null && keep.length >= o.targetCount) {
      warnings.push(
        `Stopped at --target-count ${o.targetCount} with line retention ${pct(lineRetention())} below the ${pct(o.coverageFloor)} floor (--strict-count).`
      );
      break;
    }
    const remainingBudget = o.runtimeBudgetMs == null ? Number.POSITIVE_INFINITY : o.runtimeBudgetMs - keptRuntime;
    const unselected = candidates.filter((c) => !keptSet.has(c.unit.id));
    const open = unselected.filter((c) => c.costMs <= remainingBudget);
    if (open.length === 0 && unselected.length > 0 && o.runtimeBudgetMs != null) {
      warnings.push(
        `Stopped at the --runtime-budget-ms ${o.runtimeBudgetMs} budget with line retention ${pct(lineRetention())}.`
      );
      break;
    }
    if (open.length === 0) break;
    open.sort(
      (a, b) => b.cachedScore - a.cachedScore || a.costMs - b.costMs || (a.unit.id < b.unit.id ? -1 : 1)
    );
    let best = null;
    let bestScore = -1;
    for (const c of open) {
      if (best && c.cachedScore < bestScore) break;
      let newLines = 0;
      for (const key of c.lines) if (!covered.has(key)) newLines += 1;
      let newBranches = 0;
      for (const key of c.branches) if (!coveredBranches.has(key)) newBranches += 1;
      c.cachedNewLines = newLines;
      c.cachedNewBranches = newBranches;
      c.cachedScore = scoreOf(newLines, newBranches, c.costMs, o);
      const better = c.cachedScore > bestScore || best !== null && c.cachedScore === bestScore && (c.costMs < best.costMs || c.costMs === best.costMs && c.unit.id < best.unit.id);
      if (best === null || better) {
        best = c;
        bestScore = c.cachedScore;
      }
    }
    if (!best || best.cachedNewLines + best.cachedNewBranches === 0) {
      if (!floorsMet()) {
        warnings.push(
          `Exhausted useful units at ${pct(lineRetention())} line retention — the per-unit coverage union cannot reach the ${pct(o.coverageFloor)} floor. Check collectionErrors in the metrics report (crashed units contribute no coverage).`
        );
      }
      break;
    }
    select(
      best,
      `+${best.cachedNewLines} lines, +${best.cachedNewBranches} branches for ${Math.round(best.costMs)}ms estimated`
    );
  }
  if (!o.strictCount && o.targetCount != null && keep.length > o.targetCount) {
    warnings.push(
      `Coverage floor ${pct(o.coverageFloor)} required ${keep.length} units — above the --target-count ${o.targetCount} aspiration. Raise the target, lower the floor, or improve test quality.`
    );
  }
  const keptCandidates = candidates.filter((c) => keptSet.has(c.unit.id));
  const drop = [];
  for (const c of candidates) {
    if (keptSet.has(c.unit.id)) continue;
    let residual = 0;
    for (const key of c.lines) if (!covered.has(key)) residual += 1;
    let residualBranches = 0;
    for (const key of c.branches) if (!coveredBranches.has(key)) residualBranches += 1;
    let bestOverlap = null;
    let bestOverlapSize = 0;
    let bestBranchOverlap = null;
    let bestBranchOverlapSize = 0;
    for (const k of keptCandidates) {
      const overlap = intersectionSize(c.lines, k.lines);
      if (overlap > bestOverlapSize) {
        bestOverlapSize = overlap;
        bestOverlap = k.unit.id;
      }
      const branchOverlap = intersectionSize(c.branches, k.branches);
      if (branchOverlap > bestBranchOverlapSize) {
        bestBranchOverlapSize = branchOverlap;
        bestBranchOverlap = k.unit.id;
      }
    }
    drop.push({
      id: c.unit.id,
      residualLines: residual,
      residualBranches,
      bestOverlapWith: bestOverlap,
      bestLineOverlapWith: bestOverlap,
      bestLineOverlapCount: bestOverlapSize,
      bestBranchOverlapWith: bestBranchOverlap,
      bestBranchOverlapCount: bestBranchOverlapSize,
      reason: residual === 0 && residualBranches === 0 ? "adds no line or branch coverage beyond the kept set" : `would add ${residual} lines and ${residualBranches} branches — below the stopping thresholds`
    });
  }
  drop.sort((a, b) => a.residualLines - b.residualLines || (a.id < b.id ? -1 : 1));
  const totalRuntime = units.reduce((sum, unit) => sum + optimizationCost(unit), 0);
  return {
    version: 2,
    tool: "test-suite-doctor",
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    granularity: units[0]?.testName != null ? "test" : "file",
    options: {
      coverageFloor: o.coverageFloor,
      branchFloor: o.branchFloor,
      targetCount: o.targetCount,
      strictCount: o.strictCount,
      runtimeBudgetMs: o.runtimeBudgetMs,
      weightLines: o.weightLines,
      weightBranches: o.weightBranches,
      forceKeep: o.forceKeep.map((r) => r.source)
    },
    summary: {
      unitsTotal: units.length,
      unitsKept: keep.length,
      unitsDropped: drop.length,
      baselineCoveredLines: baseKeys.lines.size,
      keptCoveredLines: covered.size,
      lineRetention: round4(lineRetention()),
      baselineCoveredBranches: baseKeys.branches.size,
      keptCoveredBranches: coveredBranches.size,
      branchRetention: round4(branchRetention()),
      keptRuntimeMs: Math.round(keptRuntime),
      totalRuntimeMs: Math.round(totalRuntime),
      warnings
    },
    keep,
    drop
  };
}
function round4(n) {
  return Math.round(n * 1e4) / 1e4;
}
function pct(n) {
  return `${(n * 100).toFixed(1)}%`;
}
var DEFAULT_OPTIONS;
var init_greedy = __esm({
  "scripts/lib/greedy.ts"() {
    "use strict";
    init_istanbul();
    DEFAULT_OPTIONS = {
      coverageFloor: 0.97,
      branchFloor: null,
      targetCount: null,
      strictCount: false,
      runtimeBudgetMs: null,
      weightLines: 1,
      weightBranches: 1,
      forceKeep: []
    };
  }
});

// scripts/lib/render.ts
function pct2(n) {
  return `${(n * 100).toFixed(1)}%`;
}
function ms(n) {
  return n >= 1e4 ? `${(n / 1e3).toFixed(1)}s` : `${Math.round(n)}ms`;
}
function renderPlanMarkdown(plan, maxRows = 400) {
  const s = plan.summary;
  const lines = [];
  lines.push("# Test suite minimization plan");
  lines.push("");
  lines.push(`Generated ${plan.createdAt} at \`${plan.granularity}\` granularity by test-suite-doctor.`);
  lines.push("");
  if (plan.scope?.mode === "filtered") {
    lines.push(
      `> **Scoped baseline:** only test files matching \`${plan.scope.filter}\` are represented (${plan.scope.testFiles.length} baseline files).`
    );
    lines.push("");
  }
  if (plan.trusted === false) {
    lines.push("> **UNTRUSTED:** legacy provenance, drift, or incomplete collection prevents a trusted recommendation.");
    lines.push("");
  }
  lines.push("## Summary");
  lines.push("");
  lines.push("| Metric | Before | After |");
  lines.push("|---|---:|---:|");
  lines.push(`| Units | ${s.unitsTotal} | **${s.unitsKept}** |`);
  lines.push(`| Covered lines | ${s.baselineCoveredLines} | ${s.keptCoveredLines} (${pct2(s.lineRetention)} retained) |`);
  lines.push(`| Covered branches | ${s.baselineCoveredBranches} | ${s.keptCoveredBranches} (${pct2(s.branchRetention)} retained) |`);
  lines.push(`| Estimated test cost | ${ms(s.totalRuntimeMs)} | ${ms(s.keptRuntimeMs)} |`);
  lines.push("");
  if (s.warnings.length > 0) {
    lines.push("## Warnings");
    lines.push("");
    for (const w of s.warnings) lines.push(`- ⚠️ ${w}`);
    lines.push("");
  }
  if (plan.frontier && plan.frontier.length > 0) {
    lines.push("## Coverage frontier");
    lines.push("");
    lines.push("| Requested floor | Units kept | Line retention | Branch retention | Estimated cost |");
    lines.push("|---:|---:|---:|---:|---:|");
    for (const entry of plan.frontier) {
      lines.push(
        `| ${pct2(entry.floor)} | ${entry.unitsKept} | ${pct2(entry.lineRetention)} | ${pct2(entry.branchRetention)} | ${ms(entry.estimatedCostMs)} |`
      );
    }
    lines.push("");
  }
  lines.push(`## Keep (${plan.keep.length})`);
  lines.push("");
  lines.push("| # | Unit | Gain | Estimated cost | Cum. line / branch retention |");
  lines.push("|---:|---|---|---:|---:|");
  plan.keep.slice(0, maxRows).forEach((k, i) => {
    lines.push(
      `| ${i + 1} | \`${k.id}\` | ${k.reason} | ${ms(k.runtimeMs)} | ${pct2(k.cumulativeLineRetention)} / ${pct2(k.cumulativeBranchRetention)} |`
    );
  });
  if (plan.keep.length > maxRows) lines.push(`| … | +${plan.keep.length - maxRows} more | | | |`);
  lines.push("");
  lines.push(`## Drop candidates (${plan.drop.length})`);
  lines.push("");
  lines.push("> Review each against `references/slop-patterns.md` before deleting — coverage");
  lines.push("> cannot see API contracts or documented regressions.");
  lines.push("");
  lines.push("| Unit | Residual lines | Residual branches | Best line overlap | Best branch overlap | Reason |");
  lines.push("|---|---:|---:|---|---|---|");
  plan.drop.slice(0, maxRows).forEach((d) => {
    lines.push(
      `| \`${d.id}\` | ${d.residualLines} | ${d.residualBranches} | ${d.bestLineOverlapWith ? `\`${d.bestLineOverlapWith}\` (${d.bestLineOverlapCount})` : "—"} | ${d.bestBranchOverlapWith ? `\`${d.bestBranchOverlapWith}\` (${d.bestBranchOverlapCount})` : "—"} | ${d.reason} |`
    );
  });
  if (plan.drop.length > maxRows) lines.push(`| … +${plan.drop.length - maxRows} more | | | |`);
  lines.push("");
  return lines.join("\n");
}
var init_render = __esm({
  "scripts/lib/render.ts"() {
    "use strict";
  }
});

// scripts/lib/report-loader.ts
function record(value, label) {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`malformed metrics report: missing or invalid ${label}`);
  }
  return value;
}
function assertCommon(raw) {
  if (raw.tool !== "test-suite-doctor") throw new Error("malformed metrics report: wrong tool");
  if (raw.runner !== "vitest" && raw.runner !== "jest") {
    throw new Error("malformed metrics report: missing or invalid runner");
  }
  if (raw.granularity !== "file" && raw.granularity !== "test") {
    throw new Error("malformed metrics report: missing or invalid granularity");
  }
  if (typeof raw.cwd !== "string") throw new Error("malformed metrics report: missing cwd");
  record(raw.baseline, "baseline");
  record(raw.baselineCoverage, "baselineCoverage");
  if (!Array.isArray(raw.units)) throw new Error("malformed metrics report: missing units");
  if (!Array.isArray(raw.collectionErrors)) {
    throw new Error("malformed metrics report: missing collectionErrors");
  }
}
function normalizeMetricsReport(value) {
  const raw = record(value, "root");
  const version = raw.version;
  if (version !== 1 && version !== 2) {
    throw new Error(`unsupported metrics report version ${String(version)}`);
  }
  assertCommon(raw);
  if (version === 2) {
    record(raw.scope, "scope");
    record(raw.environment, "environment");
    if (typeof raw.runId !== "string" || typeof raw.toolVersion !== "string") {
      throw new Error("malformed metrics report: missing v2 run metadata");
    }
    return { report: value, sourceVersion: 2, legacy: false };
  }
  const runner = raw.runner;
  const granularity = raw.granularity;
  const legacyUnits = raw.units;
  const units = legacyUnits.map((unit) => {
    const assertionMs = unit.runtimeMs;
    return {
      ...unit,
      identity: { file: unit.file, testName: unit.testName },
      memberCount: Math.max(1, unit.tests.length),
      assertionMs,
      fileMs: null,
      optimizationMs: assertionMs,
      costSource: "legacy"
    };
  });
  const baseline = raw.baseline;
  const report = {
    version: 2,
    tool: "test-suite-doctor",
    toolVersion: "0.1.x",
    runId: "legacy-v1",
    createdAt: String(raw.createdAt ?? ""),
    cwd: raw.cwd,
    runner,
    granularity,
    options: {},
    scope: {
      mode: "full",
      filter: null,
      testFiles: [...new Set(units.map((unit) => unit.file))].sort()
    },
    environment: {
      node: "unknown",
      platform: process.platform,
      arch: "unknown",
      runner: { name: runner, version: "unknown", executable: "unknown" },
      coverageProvider: null
    },
    provenance: {
      fingerprint: "legacy-unavailable",
      coveredSources: {},
      configuration: {},
      runtime: {
        runner: { name: runner, version: "unknown", executable: "unknown" },
        coverageProvider: null
      },
      git: { commit: null, branch: null, dirty: null, diffHash: null }
    },
    baseline: { ...baseline, wallMs: baseline.totalRuntimeMs },
    baselineCoverage: raw.baselineCoverage,
    collectionErrors: raw.collectionErrors,
    units
  };
  return { report, sourceVersion: 1, legacy: true };
}
var init_report_loader = __esm({
  "scripts/lib/report-loader.ts"() {
    "use strict";
  }
});

// scripts/commands/minimize.ts
var minimize_exports = {};
__export(minimize_exports, {
  minimizeCommand: () => minimizeCommand
});
import { existsSync as existsSync4, mkdirSync as mkdirSync3, readFileSync as readFileSync5, writeFileSync as writeFileSync2 } from "node:fs";
import { resolve as resolve6 } from "node:path";
import { parseArgs as parseArgs2 } from "node:util";
function fail2(msg) {
  console.error(`
minimize: ${msg}`);
  process.exit(2);
}
function minimizeCommand(args = process.argv.slice(2)) {
  const { values } = parseArgs2({
    args,
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
      frontier: { type: "string" },
      "w-lines": { type: "string", default: "1" },
      "w-branches": { type: "string", default: "1" },
      keep: { type: "string", multiple: true, default: [] },
      "keep-unmeasured": { type: "boolean", default: false },
      help: { type: "boolean", default: false }
    }
  });
  if (values.help) {
    console.log(HELP2);
    return;
  }
  const reportPath = resolve6(values.report);
  if (!existsSync4(reportPath)) {
    fail2(`report not found: ${reportPath} — run collect-metrics.ts first (metrics before opinions).`);
  }
  let normalized;
  try {
    normalized = normalizeMetricsReport(JSON.parse(readFileSync5(reportPath, "utf8")));
  } catch (error) {
    fail2(`${error.message} in ${reportPath}`);
  }
  const report = normalized.report;
  let coverageFloor;
  let branchFloor;
  let targetCount;
  let runtimeBudgetMs;
  let weightLines;
  let weightBranches;
  let forceKeep;
  let costModel;
  let frontierFloors;
  try {
    coverageFloor = parseFraction("--coverage-floor", values["coverage-floor"]);
    branchFloor = values["branch-floor"] != null ? parseFraction("--branch-floor", values["branch-floor"]) : null;
    if (coverageFloor === 0 && (branchFloor == null || branchFloor === 0)) {
      fail2("at least one of --coverage-floor or --branch-floor must be positive");
    }
    targetCount = values["target-count"] != null ? parsePositiveInteger("--target-count", values["target-count"]) : null;
    runtimeBudgetMs = values["runtime-budget-ms"] != null ? parsePositiveInteger("--runtime-budget-ms", values["runtime-budget-ms"]) : null;
    weightLines = parseNonNegativeNumber("--w-lines", values["w-lines"]);
    weightBranches = parseNonNegativeNumber("--w-branches", values["w-branches"]);
    if (weightLines === 0 && weightBranches === 0) fail2("at least one weight must be positive");
    forceKeep = (values.keep ?? []).map((pattern) => parseRegex("--keep", pattern));
    if (values["cost-model"] !== "auto" && values["cost-model"] !== "assertion" && values["cost-model"] !== "wall") {
      fail2("--cost-model must be auto, assertion, or wall");
    }
    costModel = values["cost-model"];
    frontierFloors = values.frontier == null ? [] : [...new Set(values.frontier.split(",").map(
      (value, index) => parseFraction(`--frontier entry ${index + 1}`, value)
    ))].sort((a, b) => b - a);
  } catch (error) {
    fail2(error.message);
  }
  const unsafeIds = /* @__PURE__ */ new Set([
    ...report.collectionErrors.map((entry) => entry.id),
    ...report.units.filter((unit) => unit.status !== "passed").map((unit) => unit.id)
  ]);
  if (unsafeIds.size > 0 && !values["keep-unmeasured"]) {
    fail2(
      `report is incomplete (${unsafeIds.size} collectionErrors/non-passed units); fix collection or pass --keep-unmeasured to force-keep them`
    );
  }
  if (values["keep-unmeasured"]) {
    for (const id of unsafeIds) forceKeep.push(new RegExp(`^${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
  }
  const costedUnits = report.units.map((unit) => ({
    ...unit,
    ...selectOptimizationCost(unit, report.granularity, costModel)
  }));
  const plan = minimize(costedUnits, report.baselineCoverage, {
    coverageFloor,
    branchFloor,
    targetCount,
    strictCount: values["strict-count"],
    runtimeBudgetMs,
    weightLines,
    weightBranches,
    forceKeep
  });
  if (frontierFloors.length > 0) {
    plan.frontier = frontierFloors.map((floor) => {
      const alternative = minimize(costedUnits, report.baselineCoverage, {
        coverageFloor: floor,
        branchFloor,
        targetCount,
        strictCount: values["strict-count"],
        runtimeBudgetMs,
        weightLines,
        weightBranches,
        forceKeep
      });
      return {
        floor,
        unitsKept: alternative.summary.unitsKept,
        lineRetention: alternative.summary.lineRetention,
        branchRetention: alternative.summary.branchRetention,
        estimatedCostMs: alternative.summary.keptRuntimeMs
      };
    });
  }
  if (unsafeIds.size > 0) {
    plan.summary.warnings.unshift(
      `${unsafeIds.size} unsafe/unmeasured unit(s) were force-kept; this plan is unverified.`
    );
  }
  if (normalized.legacy) {
    plan.summary.warnings.unshift(
      "Legacy v1 metrics lack provenance; this plan is legacy-unverified."
    );
  }
  plan.sourceReport = {
    version: normalized.sourceVersion,
    runId: report.runId,
    legacy: normalized.legacy,
    fingerprint: normalized.legacy ? null : report.provenance.fingerprint
  };
  plan.scope = report.scope;
  plan.provenance = report.provenance;
  plan.trusted = !normalized.legacy && unsafeIds.size === 0;
  const planPath = resolve6(values["out-plan"]);
  const mdPath = resolve6(values["out-md"]);
  mkdirSync3(resolve6(planPath, ".."), { recursive: true });
  mkdirSync3(resolve6(mdPath, ".."), { recursive: true });
  writeFileSync2(planPath, JSON.stringify(plan, null, 2));
  writeFileSync2(mdPath, renderPlanMarkdown(plan));
  const s = plan.summary;
  console.error(`plan written: ${planPath} (+ ${mdPath})`);
  console.error(
    `keep ${s.unitsKept}/${s.unitsTotal} units — line retention ${(s.lineRetention * 100).toFixed(1)}%, branch retention ${(s.branchRetention * 100).toFixed(1)}%, runtime ${Math.round(s.totalRuntimeMs / 1e3)}s → ${Math.round(s.keptRuntimeMs / 1e3)}s`
  );
  for (const w of s.warnings) console.error(`⚠️  ${w}`);
  console.error("\nnext: review the drop list against references/slop-patterns.md — do NOT delete blindly.");
}
var HELP2;
var init_minimize = __esm({
  "scripts/commands/minimize.ts"() {
    "use strict";
    init_args();
    init_greedy();
    init_render();
    init_report_loader();
    init_timing();
    HELP2 = `minimize — coverage-guided greedy test suite minimization

Usage: test-suite-doctor minimize [options]

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
  --frontier <floors>      Additional comma-separated line-retention floors
  --w-lines <n>            Weight of a newly covered line (default: 1)
  --w-branches <n>         Weight of a newly covered branch (default: 1)
  --keep <regex>           Force-keep units whose id matches (repeatable) —
                           use for contract/regression tests
  --keep-unmeasured        Force-keep incomplete units instead of refusing
  --help                   Show this help

Exit codes: 0 plan written, 2 environment/usage error.`;
  }
});

// scripts/lib/verify-core.ts
function computeRetention(baseline, current) {
  const base = toKeySets(baseline);
  const cur = toKeySets(current);
  let keptLines = 0;
  for (const k of base.lines) if (cur.lines.has(k)) keptLines += 1;
  let keptBranches = 0;
  for (const k of base.branches) if (cur.branches.has(k)) keptBranches += 1;
  const lostByFile = [];
  for (const [file, cov] of Object.entries(baseline)) {
    const curLines = new Set(current[file]?.lines ?? []);
    const lost = cov.lines.filter((l) => !curLines.has(l)).length;
    if (lost > 0) lostByFile.push({ file, lostLines: lost });
  }
  lostByFile.sort((a, b) => b.lostLines - a.lostLines || (a.file < b.file ? -1 : 1));
  return {
    lineRetention: base.lines.size === 0 ? 1 : keptLines / base.lines.size,
    branchRetention: base.branches.size === 0 ? 1 : keptBranches / base.branches.size,
    baselineLines: base.lines.size,
    currentLines: cur.lines.size,
    lostByFile
  };
}
function mutationScore(report) {
  const byStatus = {};
  let detected = 0;
  let undetected = 0;
  for (const file of Object.values(report.files ?? {})) {
    for (const m of file.mutants ?? []) {
      const status = m.status ?? "Unknown";
      byStatus[status] = (byStatus[status] ?? 0) + 1;
      if (DETECTED.has(status)) detected += 1;
      else if (UNDETECTED.has(status)) undetected += 1;
    }
  }
  const valid = detected + undetected;
  return {
    applicable: valid > 0,
    score: valid === 0 ? null : detected / valid * 100,
    detected,
    undetected,
    byStatus
  };
}
var DETECTED, UNDETECTED;
var init_verify_core = __esm({
  "scripts/lib/verify-core.ts"() {
    "use strict";
    init_istanbul();
    DETECTED = /* @__PURE__ */ new Set(["Killed", "Timeout"]);
    UNDETECTED = /* @__PURE__ */ new Set(["Survived", "NoCoverage"]);
  }
});

// scripts/commands/verify.ts
var verify_exports = {};
__export(verify_exports, {
  verifyCommand: () => verifyCommand
});
import { existsSync as existsSync5, mkdirSync as mkdirSync4, readFileSync as readFileSync6, realpathSync as realpathSync2, renameSync as renameSync2, rmSync as rmSync3 } from "node:fs";
import { basename as basename3, isAbsolute as isAbsolute5, join as join7, relative as relative4, resolve as resolve7 } from "node:path";
import { parseArgs as parseArgs3 } from "node:util";
function fail3(msg) {
  console.error(`
verify: ${msg}`);
  process.exit(2);
}
async function verifyCommand(args = process.argv.slice(2)) {
  const { values } = parseArgs3({
    args,
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
      help: { type: "boolean", default: false }
    }
  });
  if (values.help) {
    console.log(HELP3);
    return;
  }
  let cwd;
  try {
    cwd = realpathSync2(resolve7(values.cwd));
  } catch {
    fail3(`--cwd does not exist: ${resolve7(values.cwd)}`);
  }
  const baselinePath = resolve7(cwd, values.baseline);
  if (!existsSync5(baselinePath)) fail3(`baseline report not found: ${baselinePath}`);
  let coverageFloor;
  let branchFloor;
  let minLineCoverage;
  let minBranchCoverage;
  let timeoutMs;
  let mutationFloor;
  let mutationTimeoutMs;
  try {
    coverageFloor = parseFraction("--coverage-floor", values["coverage-floor"]);
    branchFloor = values["branch-floor"] != null ? parseFraction("--branch-floor", values["branch-floor"]) : null;
    minLineCoverage = values["min-line-coverage"] != null ? parseFraction("--min-line-coverage", values["min-line-coverage"]) : null;
    minBranchCoverage = values["min-branch-coverage"] != null ? parseFraction("--min-branch-coverage", values["min-branch-coverage"]) : null;
    timeoutMs = parsePositiveInteger("--timeout-ms", values["timeout-ms"]);
    mutationFloor = parsePercentage("--mutation-floor", values["mutation-floor"]);
    mutationTimeoutMs = parsePositiveInteger(
      "--mutation-timeout-ms",
      values["mutation-timeout-ms"]
    );
  } catch (error) {
    fail3(error.message);
  }
  const outPath = resolve7(cwd, values.out);
  invalidateOutput(outPath);
  let normalized;
  try {
    normalized = normalizeMetricsReport(JSON.parse(readFileSync6(baselinePath, "utf8")));
  } catch (error) {
    fail3(error.message);
  }
  if (normalized.legacy && !values["allow-legacy-baseline"]) {
    fail3("legacy v1 baseline requires --allow-legacy-baseline because provenance is unavailable");
  }
  const baseline = normalized.report;
  const failures = [];
  let detection;
  try {
    detection = detectRunner(cwd, values.runner);
  } catch (err) {
    fail3(err.message);
  }
  console.error(`runner: ${detection.runner} (${detection.reason})`);
  let runnerBinary;
  try {
    runnerBinary = resolveTargetBinary(cwd, detection.runner, values["runner-bin"]);
  } catch (error) {
    fail3(error.message);
  }
  let coverageProvider;
  try {
    coverageProvider = detection.runner === "vitest" ? {
      name: "@vitest/coverage-v8",
      version: resolvePackageVersion(cwd, "@vitest/coverage-v8")
    } : { name: "jest-built-in", version: runnerBinary.version };
  } catch (error) {
    fail3(error.message);
  }
  const currentProvenance = captureProvenance(cwd, Object.keys(baseline.baselineCoverage), {
    runner: {
      name: detection.runner,
      version: runnerBinary.version,
      executable: runnerBinary.executable
    },
    coverageProvider
  });
  const provenanceMismatches = normalized.legacy ? [] : compareProvenance(baseline.provenance, currentProvenance);
  if (provenanceMismatches.length > 0 && !values["allow-provenance-drift"]) {
    const summary = provenanceMismatches.map((mismatch) => `${mismatch.code}${mismatch.path ? `:${mismatch.path}` : ""}`).join(", ");
    fail3(`provenance drift detected: ${summary}; re-collect or pass --allow-provenance-drift`);
  }
  const trusted = !normalized.legacy && provenanceMismatches.length === 0;
  const runnerArgs = values["runner-arg"] ?? [];
  let scopedTestFiles;
  if (baseline.scope.mode === "filtered") {
    const listResult = await run(
      runnerBinary.command,
      [...runnerBinary.argsPrefix, ...listTestFilesSpec(detection.runner, runnerArgs)],
      { cwd, timeoutMs }
    );
    if (listResult.code !== 0 || listResult.error || listResult.signal || listResult.timedOut) {
      fail3(`test-file listing failed:
${listResult.stderr.slice(-2e3)}`);
    }
    let filter;
    try {
      filter = new RegExp(baseline.scope.filter ?? "");
      const relFile = (file) => (isAbsolute5(file) ? relative4(cwd, file) : file).replace(/\\/g, "/");
      scopedTestFiles = parseListedTestFiles(detection.runner, listResult.stdout).map(relFile).filter((file) => filter.test(file)).sort().map((file) => join7(cwd, file));
    } catch (error) {
      fail3(`stored scope is invalid: ${error.message}`);
    }
    if (scopedTestFiles.length === 0) fail3("stored filter matches no current test files");
  }
  const scratchParent = resolve7(cwd, values.scratch);
  const scratchDir = createInvocationDir(scratchParent, "verify");
  console.error("running the current suite with coverage…");
  const spec = buildRunSpec(detection.runner, {
    scratchDir,
    label: "verify",
    testFiles: scopedTestFiles,
    extraArgs: runnerArgs
  });
  mkdirSync4(join7(scratchDir, "verify"), { recursive: true });
  const res = await run(runnerBinary.command, [...runnerBinary.argsPrefix, ...spec.args], {
    cwd,
    timeoutMs
  });
  if (res.timedOut) fail3(`suite run exceeded --timeout-ms ${values["timeout-ms"]}`);
  if (!existsSync5(spec.resultsFile)) {
    fail3(`runner produced no results JSON.
stderr (tail):
${res.stderr.slice(-2e3)}`);
  }
  const results = parseResultsFile(
    JSON.parse(readFileSync6(spec.resultsFile, "utf8"))
  );
  const suiteOutcome = validateRunOutcome(res, results);
  const failed = results.tests.filter((t) => t.status === "failed");
  if (!suiteOutcome.green && suiteOutcome.kind === "environment-error") {
    if (!values["keep-scratch"]) rmSync3(scratchDir, { recursive: true, force: true });
    fail3(`runner outcome could not be evaluated: ${suiteOutcome.reasons.join("; ")}`);
  }
  if (!suiteOutcome.green) {
    failures.push(...suiteOutcome.reasons);
    console.error(`✗ suite failed: ${suiteOutcome.reasons.join("; ")}`);
    for (const t of failed.slice(0, 20)) console.error(`   - ${t.fullName}`);
  } else {
    console.error(`✓ suite green: ${results.totalTests} tests passed`);
  }
  const covPath = join7(spec.coverageDir, "coverage-final.json");
  if (!existsSync5(covPath)) {
    if (suiteOutcome.kind === "test-failure") {
      writeJsonAtomic(outPath, {
        version: 2,
        tool: "test-suite-doctor",
        toolVersion: TOOL_VERSION,
        runId: basename3(scratchDir),
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
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
          overridden: values["allow-provenance-drift"]
        },
        suite: { outcome: suiteOutcome, wallMs: res.wallMs },
        totalTests: results.totalTests,
        failedTests: failed.length,
        lineRetention: null,
        branchRetention: null,
        lostByFile: [],
        mutation: null
      });
      if (values["keep-scratch"]) console.error(`scratch preserved: ${scratchDir}`);
      else rmSync3(scratchDir, { recursive: true, force: true });
      process.exit(1);
    }
    if (!values["keep-scratch"]) rmSync3(scratchDir, { recursive: true, force: true });
    fail3("coverage-final.json missing — is a coverage provider installed?");
  }
  const current = parseCoverageFinal(
    JSON.parse(readFileSync6(covPath, "utf8")),
    cwd
  );
  const retention = computeRetention(baseline.baselineCoverage, current.files);
  const absoluteLineCoverage = current.totals.totalLines === 0 ? 1 : current.totals.coveredLines / current.totals.totalLines;
  const absoluteBranchCoverage = current.totals.totalBranches === 0 ? 1 : current.totals.coveredBranches / current.totals.totalBranches;
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
      `absolute line coverage ${(absoluteLineCoverage * 100).toFixed(2)}% below floor ${(minLineCoverage * 100).toFixed(1)}%`
    );
  }
  if (minBranchCoverage != null && absoluteBranchCoverage < minBranchCoverage) {
    failures.push(
      `absolute branch coverage ${(absoluteBranchCoverage * 100).toFixed(2)}% below floor ${(minBranchCoverage * 100).toFixed(1)}%`
    );
  }
  let mutation = null;
  if (values.mutation) {
    const globs = values.mutate ?? [];
    if (globs.length === 0) fail3("--mutation requires at least one --mutate glob");
    let strykerBinary;
    try {
      strykerBinary = resolveStrykerBinary(cwd, values["stryker-bin"]);
    } catch (error) {
      fail3(error.message);
    }
    const reportPath = resolve7(cwd, values["mutation-report"]);
    const backupPath = `${reportPath}.${basename3(scratchDir)}.bak`;
    const hadPreviousReport = existsSync5(reportPath);
    if (hadPreviousReport) renameSync2(reportPath, backupPath);
    const restorePreviousReport = () => {
      rmSync3(reportPath, { force: true });
      if (hadPreviousReport && existsSync5(backupPath)) renameSync2(backupPath, reportPath);
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
        ...values["stryker-arg"] ?? []
      ],
      { cwd, timeoutMs: mutationTimeoutMs }
    );
    if (strykerRes.timedOut) {
      restorePreviousReport();
      fail3("Stryker exceeded --mutation-timeout-ms");
    }
    if (strykerRes.error || strykerRes.signal || strykerRes.code !== 0) {
      restorePreviousReport();
      fail3(
        `Stryker mutation process exited ${strykerRes.code ?? "without a code"}` + (strykerRes.error ? `: ${strykerRes.error}` : "")
      );
    }
    if (!existsSync5(reportPath)) {
      restorePreviousReport();
      fail3(
        `Stryker JSON report not found at ${reportPath} — is @stryker-mutator/core installed and configured? Override the location with --mutation-report.
stderr (tail):
${strykerRes.stderr.slice(-2e3)}`
      );
    }
    try {
      mutation = mutationScore(JSON.parse(readFileSync6(reportPath, "utf8")));
    } catch (error) {
      restorePreviousReport();
      fail3(`Stryker JSON report is malformed: ${error.message}`);
    }
    rmSync3(backupPath, { force: true });
    if (!mutation.applicable || mutation.score == null) {
      fail3("Stryker produced zero scoreable mutants; mutation verification is not applicable");
    }
    const scoreStr = mutation.score.toFixed(1);
    if (mutation.score < mutationFloor) {
      failures.push(`mutation score ${scoreStr}% below floor ${mutationFloor}%`);
      console.error(
        `✗ mutation score ${scoreStr}% (floor ${mutationFloor}%) — ${mutation.undetected} mutants survived`
      );
    } else {
      console.error(`✓ mutation score ${scoreStr}% (floor ${mutationFloor}%)`);
    }
  }
  writeJsonAtomic(outPath, {
    version: 2,
    tool: "test-suite-doctor",
    toolVersion: TOOL_VERSION,
    runId: basename3(scratchDir),
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
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
      overridden: values["allow-provenance-drift"]
    },
    suite: { outcome: suiteOutcome, wallMs: res.wallMs },
    totalTests: results.totalTests,
    failedTests: failed.length,
    lineRetention: retention.lineRetention,
    branchRetention: retention.branchRetention,
    absoluteLineCoverage,
    absoluteBranchCoverage,
    lostByFile: retention.lostByFile.slice(0, 50),
    mutation
  });
  console.error(`
verdict written: ${outPath}`);
  if (values["keep-scratch"]) console.error(`scratch preserved: ${scratchDir}`);
  else rmSync3(scratchDir, { recursive: true, force: true });
  if (failures.length > 0) {
    console.error(`✗ VERIFY FAILED: ${failures.join("; ")}`);
    process.exit(1);
  }
  console.error("✓ VERIFY PASSED");
}
var HELP3;
var init_verify = __esm({
  "scripts/commands/verify.ts"() {
    "use strict";
    init_args();
    init_artifacts();
    init_detect();
    init_exec();
    init_istanbul();
    init_runner_commands();
    init_verify_core();
    init_runner_resolution();
    init_report_loader();
    init_provenance();
    init_version();
    HELP3 = `verify — compare the current suite against the recorded baseline

Usage: test-suite-doctor verify [options]

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
  }
});

// scripts/cli.ts
init_version();
var HELP4 = `test-suite-doctor <collect|minimize|verify> [options]

Commands:
  collect   Measure scoped per-unit coverage and timing
  minimize  Produce a deterministic keep/drop proposal
  verify    Verify suite, provenance, retention, and optional mutation floors

Options:
  --help     Show this help
  --version  Print the CLI version`;
async function cli(args = process.argv.slice(2)) {
  const [command, ...rest] = args;
  if (command === "--version" || command === "-v") {
    console.log(TOOL_VERSION);
    return;
  }
  if (command == null || command === "--help" || command === "-h") {
    console.log(HELP4);
    return;
  }
  if (command === "collect") {
    const { collectCommand: collectCommand2 } = await Promise.resolve().then(() => (init_collect(), collect_exports));
    return collectCommand2(rest);
  }
  if (command === "minimize") {
    const { minimizeCommand: minimizeCommand2 } = await Promise.resolve().then(() => (init_minimize(), minimize_exports));
    return minimizeCommand2(rest);
  }
  if (command === "verify") {
    const { verifyCommand: verifyCommand2 } = await Promise.resolve().then(() => (init_verify(), verify_exports));
    return verifyCommand2(rest);
  }
  console.error(`test-suite-doctor: unknown command "${command}"

${HELP4}`);
  process.exit(2);
}
cli().catch((error) => {
  console.error(error.stack ?? String(error));
  process.exit(2);
});
export {
  cli
};
