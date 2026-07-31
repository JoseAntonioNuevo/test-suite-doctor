import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Runner } from "./types.ts";

export interface Detection {
  runner: Runner;
  reason: string;
}

const VITEST_CONFIGS = [
  "vitest.config.ts",
  "vitest.config.js",
  "vitest.config.mts",
  "vitest.config.mjs",
  "vitest.config.cts",
  "vitest.workspace.ts",
  "vitest.workspace.js",
];

const JEST_CONFIGS = [
  "jest.config.js",
  "jest.config.ts",
  "jest.config.mjs",
  "jest.config.cjs",
  "jest.config.json",
];

/**
 * Decide which test runner drives the target repo.
 *
 * Order of evidence: explicit override, package.json dependencies, config
 * files, then the `test` script. Ambiguity is an error — guessing wrong wastes
 * a full metrics collection run.
 */
export function detectRunner(cwd: string, override?: string): Detection {
  if (override && override !== "auto") {
    if (override !== "vitest" && override !== "jest") {
      throw new Error(`Unknown runner "${override}" — expected "vitest" or "jest"`);
    }
    return { runner: override, reason: "forced via --runner" };
  }

  const pkgPath = join(cwd, "package.json");
  if (!existsSync(pkgPath)) {
    throw new Error(`No package.json in ${cwd} — run from the target repo root or pass --cwd`);
  }
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    scripts?: Record<string, string>;
    jest?: unknown;
  };
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const hasVitestDep = deps["vitest"] != null;
  const hasJestDep = deps["jest"] != null;
  const hasVitestConfig = VITEST_CONFIGS.some((f) => existsSync(join(cwd, f)));
  const hasJestConfig = JEST_CONFIGS.some((f) => existsSync(join(cwd, f))) || pkg.jest != null;

  if (hasVitestDep && !hasJestDep) return { runner: "vitest", reason: "vitest in package.json dependencies" };
  if (hasJestDep && !hasVitestDep) return { runner: "jest", reason: "jest in package.json dependencies" };

  if (hasVitestDep && hasJestDep) {
    if (hasVitestConfig && !hasJestConfig) return { runner: "vitest", reason: "both installed; vitest config file present" };
    if (hasJestConfig && !hasVitestConfig) return { runner: "jest", reason: "both installed; jest config present" };
    const testScript = pkg.scripts?.["test"] ?? "";
    if (/\bvitest\b/.test(testScript)) return { runner: "vitest", reason: 'both installed; "test" script runs vitest' };
    if (/\bjest\b/.test(testScript)) return { runner: "jest", reason: 'both installed; "test" script runs jest' };
    throw new Error(
      "Both vitest and jest are installed and neither config nor the test script disambiguates — pass --runner vitest|jest",
    );
  }

  // No dependency hit — fall back to config files (e.g. hoisted monorepo deps).
  if (hasVitestConfig) return { runner: "vitest", reason: "vitest config file present" };
  if (hasJestConfig) return { runner: "jest", reason: "jest config present" };

  throw new Error(
    `Could not detect a test runner in ${cwd}. Supported: vitest, jest. ` +
      "If this is a monorepo package, pass --cwd to the package directory, or force with --runner.",
  );
}
