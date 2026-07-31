import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import type { Runner } from "./types.ts";

export interface RuntimeIdentity {
  runner: { name: Runner; version: string; executable: string };
  coverageProvider: { name: string; version: string } | null;
}

export interface Provenance {
  fingerprint: string;
  coveredSources: Record<string, string | null>;
  configuration: Record<string, string>;
  runtime: RuntimeIdentity;
  git: { commit: string | null; branch: string | null; dirty: boolean | null; diffHash: string | null };
}

export interface ProvenanceMismatch {
  code:
    | "covered-source-changed"
    | "covered-source-deleted"
    | "configuration-changed"
    | "runner-version-changed"
    | "coverage-provider-version-changed";
  path?: string;
  expected?: string | null;
  actual?: string | null;
}

const RUNNER_CONFIGS: Record<Runner, string[]> = {
  vitest: [
    "vitest.config.ts",
    "vitest.config.js",
    "vitest.config.mts",
    "vitest.config.mjs",
    "vitest.config.cts",
    "vitest.workspace.ts",
    "vitest.workspace.js",
  ],
  jest: [
    "jest.config.js",
    "jest.config.ts",
    "jest.config.mjs",
    "jest.config.cjs",
    "jest.config.json",
  ],
};

const LOCKFILES = ["npm-shrinkwrap.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lock"];

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function fileHash(path: string): string | null {
  return existsSync(path) ? sha256(readFileSync(path)) : null;
}

function sortedRecord(entries: [string, string | null][]): Record<string, string | null> {
  return Object.fromEntries(entries.sort(([left], [right]) => left.localeCompare(right)));
}

function gitValue(cwd: string, args: string[]): string | null {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

export function captureProvenance(
  cwd: string,
  coveredFiles: string[],
  runtime: RuntimeIdentity,
): Provenance {
  const root = resolve(cwd);
  const coveredSources = sortedRecord(
    [...new Set(coveredFiles)].map((file) => {
      const absolute = isAbsolute(file) ? file : join(root, file);
      const key = isAbsolute(file) ? relative(root, absolute).replace(/\\/g, "/") : file.replace(/\\/g, "/");
      return [key, fileHash(absolute)];
    }),
  );
  const configurationPaths = [
    "package.json",
    ...RUNNER_CONFIGS[runtime.runner.name].filter((file) => existsSync(join(root, file))),
  ];
  const lockfile = LOCKFILES.find((file) => existsSync(join(root, file)));
  if (lockfile) configurationPaths.push(lockfile);
  const configuration = Object.fromEntries(
    configurationPaths
      .map((file) => [file, fileHash(join(root, file))] as const)
      .filter((entry): entry is [string, string] => entry[1] != null)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
  const commit = gitValue(root, ["rev-parse", "HEAD"]);
  const branch = gitValue(root, ["branch", "--show-current"]);
  const status = gitValue(root, ["status", "--porcelain=v1"]);
  const git = {
    commit,
    branch,
    dirty: status == null ? null : status.length > 0,
    diffHash: status == null ? null : sha256(status),
  };
  const fingerprint = sha256(
    JSON.stringify({
      coveredSources,
      configuration,
      runner: { name: runtime.runner.name, version: runtime.runner.version },
      coverageProvider: runtime.coverageProvider,
    }),
  );
  return { fingerprint, coveredSources, configuration, runtime, git };
}

export function compareProvenance(
  baseline: Provenance,
  current: Provenance,
): ProvenanceMismatch[] {
  const mismatches: ProvenanceMismatch[] = [];
  for (const [path, expected] of Object.entries(baseline.coveredSources)) {
    const actual = current.coveredSources[path] ?? null;
    if (actual !== expected) {
      mismatches.push({
        code: actual == null ? "covered-source-deleted" : "covered-source-changed",
        path,
        expected,
        actual,
      });
    }
  }
  const configurationKeys = new Set([
    ...Object.keys(baseline.configuration),
    ...Object.keys(current.configuration),
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
      actual: current.runtime.runner.version,
    });
  }
  if (
    baseline.runtime.coverageProvider?.version !== current.runtime.coverageProvider?.version ||
    baseline.runtime.coverageProvider?.name !== current.runtime.coverageProvider?.name
  ) {
    mismatches.push({
      code: "coverage-provider-version-changed",
      expected: baseline.runtime.coverageProvider?.version ?? null,
      actual: current.runtime.coverageProvider?.version ?? null,
    });
  }
  return mismatches;
}
