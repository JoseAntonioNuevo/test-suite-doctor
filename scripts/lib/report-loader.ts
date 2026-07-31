import type { Granularity, MetricsReport, Runner, UnitMetrics } from "./types.ts";

export interface NormalizedMetricsReport {
  report: MetricsReport;
  sourceVersion: 1 | 2;
  legacy: boolean;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`malformed metrics report: missing or invalid ${label}`);
  }
  return value as Record<string, unknown>;
}

function assertCommon(raw: Record<string, unknown>): void {
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

export function normalizeMetricsReport(value: unknown): NormalizedMetricsReport {
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
    return { report: value as MetricsReport, sourceVersion: 2, legacy: false };
  }

  const runner = raw.runner as Runner;
  const granularity = raw.granularity as Granularity;
  const legacyUnits = raw.units as UnitMetrics[];
  const units = legacyUnits.map((unit) => {
    const assertionMs = unit.runtimeMs;
    return {
      ...unit,
      identity: { file: unit.file, testName: unit.testName },
      memberCount: Math.max(1, unit.tests.length),
      assertionMs,
      fileMs: null,
      optimizationMs: assertionMs,
      costSource: "legacy" as const,
    };
  });
  const baseline = raw.baseline as MetricsReport["baseline"];
  const report: MetricsReport = {
    version: 2,
    tool: "test-suite-doctor",
    toolVersion: "0.1.x",
    runId: "legacy-v1",
    createdAt: String(raw.createdAt ?? ""),
    cwd: raw.cwd as string,
    runner,
    granularity,
    options: {},
    scope: {
      mode: "full",
      filter: null,
      testFiles: [...new Set(units.map((unit) => unit.file))].sort(),
    },
    environment: {
      node: "unknown",
      platform: process.platform,
      arch: "unknown",
      runner: { name: runner, version: "unknown", executable: "unknown" },
      coverageProvider: null,
    },
    provenance: {
      fingerprint: "legacy-unavailable",
      coveredSources: {},
      configuration: {},
      runtime: {
        runner: { name: runner, version: "unknown", executable: "unknown" },
        coverageProvider: null,
      },
      git: { commit: null, branch: null, dirty: null, diffHash: null },
    },
    baseline: { ...baseline, wallMs: baseline.totalRuntimeMs },
    baselineCoverage: raw.baselineCoverage as MetricsReport["baselineCoverage"],
    collectionErrors: raw.collectionErrors as MetricsReport["collectionErrors"],
    units,
  };
  return { report, sourceVersion: 1, legacy: true };
}
