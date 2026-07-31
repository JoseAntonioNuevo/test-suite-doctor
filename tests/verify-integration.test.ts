import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { captureProvenance } from "../scripts/lib/provenance.ts";
import { resolvePackageVersion, resolveTargetBinary } from "../scripts/lib/runner-resolution.ts";

const root = resolve(import.meta.dirname, "..");
const created: string[] = [];

function fixture(): string {
  const dir = mkdtempSync(join(root, ".tmp-verify-"));
  created.push(dir);
  mkdirSync(join(dir, "src"), { recursive: true });
  symlinkSync(join(root, "node_modules"), join(dir, "node_modules"), "junction");
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ type: "module", devDependencies: { vitest: "^4.1.10" } }),
  );
  writeFileSync(join(dir, "src/a.ts"), "export const value = 1;\n");
  return dir;
}

function baseline(dir: string): string {
  const path = join(dir, "report.json");
  writeFileSync(
    path,
    JSON.stringify({
      version: 1,
      tool: "test-suite-doctor",
      createdAt: new Date(0).toISOString(),
      cwd: dir,
      runner: "vitest",
      granularity: "file",
      baseline: {
        totalTests: 1,
        totalRuntimeMs: 1,
        coveredLines: 1,
        totalLines: 1,
        coveredBranches: 0,
        totalBranches: 0,
      },
      baselineCoverage: { "src/a.ts": { lines: [1], branches: [] } },
      collectionErrors: [],
      units: [],
    }),
  );
  return path;
}

function baselineV2(dir: string): string {
  const runner = resolveTargetBinary(dir, "vitest");
  const coverageProvider = {
    name: "@vitest/coverage-v8",
    version: resolvePackageVersion(dir, "@vitest/coverage-v8"),
  };
  const path = join(dir, "report-v2.json");
  writeFileSync(
    path,
    JSON.stringify({
      version: 2,
      tool: "test-suite-doctor",
      toolVersion: "0.2.0",
      runId: "test-baseline",
      createdAt: new Date(0).toISOString(),
      cwd: dir,
      runner: "vitest",
      granularity: "file",
      options: {},
      scope: { mode: "full", filter: null, testFiles: ["a.test.ts"] },
      environment: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        runner: { name: "vitest", version: runner.version, executable: runner.executable },
        coverageProvider,
      },
      provenance: captureProvenance(dir, ["src/a.ts"], {
        runner: { name: "vitest", version: runner.version, executable: runner.executable },
        coverageProvider,
      }),
      baseline: {
        totalTests: 1,
        totalRuntimeMs: 1,
        wallMs: 1,
        coveredLines: 1,
        totalLines: 1,
        coveredBranches: 0,
        totalBranches: 0,
      },
      baselineCoverage: { "src/a.ts": { lines: [1], branches: [] } },
      collectionErrors: [],
      units: [],
    }),
  );
  return path;
}

function verify(dir: string, report: string, extraArgs: string[] = [], env?: NodeJS.ProcessEnv) {
  return spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      join(root, "scripts/verify.ts"),
      "--cwd",
      dir,
      "--baseline",
      report,
      "--scratch",
      join(dir, "scratch"),
      "--out",
      join(dir, "verify.json"),
      "--timeout-ms",
      "30000",
      ...extraArgs,
    ],
    { cwd: root, encoding: "utf8", env: { ...process.env, ...env } },
  );
}

afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("verify integration safety", () => {
  it("fails when assertions pass but afterAll fails", () => {
    const dir = fixture();
    writeFileSync(
      join(dir, "a.test.ts"),
      [
        'import { afterAll, expect, it } from "vitest";',
        'import { value } from "./src/a.ts";',
        'it("passes", () => expect(value).toBe(1));',
        'afterAll(() => { throw new Error("hook exploded"); });',
      ].join("\n"),
    );

    const result = verify(dir, baseline(dir), ["--allow-legacy-baseline"]);
    expect(result.status).toBe(1);
    expect(JSON.parse(readFileSync(join(dir, "verify.json"), "utf8"))).toEqual(
      expect.objectContaining({ pass: false }),
    );
  });

  it("never reuses stale passing results or coverage after a config failure", () => {
    const dir = fixture();
    writeFileSync(join(dir, "a.test.ts"), 'import { it } from "vitest"; it("passes", () => {});');
    writeFileSync(join(dir, "vitest.config.ts"), 'throw new Error("broken config");\n');

    const stale = join(dir, "scratch/verify");
    mkdirSync(join(stale, "coverage"), { recursive: true });
    writeFileSync(
      join(stale, "results.json"),
      JSON.stringify({
        success: true,
        numTotalTests: 1,
        numFailedTests: 0,
        numFailedTestSuites: 0,
        testResults: [
          {
            name: join(dir, "a.test.ts"),
            assertionResults: [{ fullName: "passes", status: "passed", duration: 1 }],
          },
        ],
      }),
    );
    writeFileSync(
      join(stale, "coverage/coverage-final.json"),
      JSON.stringify({
        [join(dir, "src/a.ts")]: {
          path: join(dir, "src/a.ts"),
          statementMap: { "0": { start: { line: 1 } } },
          s: { "0": 1 },
          b: {},
        },
      }),
    );
    writeFileSync(join(dir, "verify.json"), JSON.stringify({ pass: true }));

    const result = verify(dir, baseline(dir), ["--allow-legacy-baseline"]);
    expect(result.status).toBe(2);
    expect(existsSync(join(dir, "verify.json"))).toBe(false);
    expect(result.stderr).toMatch(/runner|config|results/i);
  });

  it("rejects a stale Stryker report when the current mutation process fails", () => {
      const dir = fixture();
      writeFileSync(
        join(dir, "a.test.ts"),
        [
          'import { expect, it } from "vitest";',
          'import { value } from "./src/a.ts";',
          'it("passes", () => expect(value).toBe(1));',
        ].join("\n"),
      );
      const mutationReport = join(dir, "mutation.json");
      const stale = { files: { "src/a.ts": { mutants: [{ status: "Killed" }] } } };
      writeFileSync(mutationReport, JSON.stringify(stale));

      const fakeStryker = join(dir, "fake-stryker.mjs");
      writeFileSync(fakeStryker, "process.exit(7);\n");

      const result = verify(
        dir,
        baseline(dir),
        [
          "--mutation",
          "--mutate",
          "src/a.ts",
          "--mutation-report",
          mutationReport,
          "--stryker-bin",
          fakeStryker,
          "--allow-legacy-baseline",
        ],
      );

      expect(result.status).toBe(2);
      expect(JSON.parse(readFileSync(mutationReport, "utf8"))).toEqual(stale);
      expect(result.stderr).toMatch(/Stryker.*exit|mutation.*process/i);
  });

  it("rejects source drift by default and marks an explicit override untrusted", () => {
    const dir = fixture();
    writeFileSync(
      join(dir, "a.test.ts"),
      [
        'import { expect, it } from "vitest";',
        'import { value } from "./src/a.ts";',
        'it("passes", () => expect(value).toBe(2));',
      ].join("\n"),
    );
    const report = baselineV2(dir);
    writeFileSync(join(dir, "src/a.ts"), "export const value = 2;\n");

    const rejected = verify(dir, report);
    expect(rejected.status).toBe(2);
    expect(rejected.stderr).toMatch(/provenance|source.*changed/i);

    const allowed = verify(dir, report, ["--allow-provenance-drift"]);
    expect(allowed.status).toBe(0);
    expect(JSON.parse(readFileSync(join(dir, "verify.json"), "utf8"))).toEqual(
      expect.objectContaining({ trusted: false, provenance: expect.objectContaining({ mismatches: expect.any(Array) }) }),
    );
  });
});
