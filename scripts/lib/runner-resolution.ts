import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, resolve } from "node:path";
import type { Runner } from "./types.ts";

export interface ResolvedBinary {
  command: string;
  argsPrefix: string[];
  executable: string;
  packageName: string;
  version: string;
}

const PACKAGES: Record<Runner, string> = { vitest: "vitest", jest: "jest" };

export function resolveTargetBinary(
  cwd: string,
  runner: Runner,
  override?: string,
): ResolvedBinary {
  if (override) {
    const executable = isAbsolute(override) ? override : resolve(cwd, override);
    return {
      command: process.execPath,
      argsPrefix: [executable],
      executable,
      packageName: "override",
      version: "override",
    };
  }

  const packageName = PACKAGES[runner];
  const requireFromTarget = createRequire(join(resolve(cwd), "package.json"));
  let packagePath: string;
  try {
    packagePath = requireFromTarget.resolve(`${packageName}/package.json`);
  } catch {
    throw new Error(
      `${packageName} is not installed for ${cwd}; install it in the target package or pass --runner-bin`,
    );
  }
  const pkg = JSON.parse(readFileSync(packagePath, "utf8")) as {
    version?: string;
    bin?: string | Record<string, string>;
  };
  const binValue =
    typeof pkg.bin === "string"
      ? pkg.bin
      : pkg.bin?.[packageName] ?? Object.values(pkg.bin ?? {})[0];
  if (!binValue) throw new Error(`${packageName} package does not declare an executable`);
  const executable = resolve(dirname(packagePath), binValue);
  return {
    command: process.execPath,
    argsPrefix: [executable],
    executable,
    packageName,
    version: pkg.version ?? "unknown",
  };
}

export function resolveStrykerBinary(cwd: string, override?: string): ResolvedBinary {
  if (override) {
    const executable = isAbsolute(override) ? override : resolve(cwd, override);
    return {
      command: process.execPath,
      argsPrefix: [executable],
      executable,
      packageName: "override",
      version: "override",
    };
  }
  const requireFromTarget = createRequire(join(resolve(cwd), "package.json"));
  let packagePath: string;
  try {
    packagePath = requireFromTarget.resolve("@stryker-mutator/core/package.json");
  } catch {
    throw new Error(
      `@stryker-mutator/core is not installed for ${cwd}; install it or pass --stryker-bin`,
    );
  }
  const pkg = JSON.parse(readFileSync(packagePath, "utf8")) as {
    version?: string;
    bin?: string | Record<string, string>;
  };
  const binValue =
    typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.stryker ?? Object.values(pkg.bin ?? {})[0];
  if (!binValue) throw new Error("@stryker-mutator/core does not declare an executable");
  const executable = resolve(dirname(packagePath), binValue);
  return {
    command: process.execPath,
    argsPrefix: [executable],
    executable,
    packageName: "@stryker-mutator/core",
    version: pkg.version ?? "unknown",
  };
}

export function listTestFilesSpec(runner: Runner, runnerArgs: string[]): string[] {
  return runner === "vitest"
    ? ["list", "--filesOnly", ...runnerArgs]
    : ["--listTests", "--json", ...runnerArgs];
}

export function parseListedTestFiles(runner: Runner, stdout: string): string[] {
  if (runner === "jest") {
    const parsed = JSON.parse(stdout) as unknown;
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
      throw new Error("Jest --listTests did not return a JSON array of paths");
    }
    return [...new Set(parsed)].sort();
  }
  return [...new Set(stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))].sort();
}

export function resolvePackageVersion(cwd: string, packageName: string): string {
  const requireFromTarget = createRequire(join(resolve(cwd), "package.json"));
  let packagePath: string;
  try {
    packagePath = requireFromTarget.resolve(`${packageName}/package.json`);
  } catch {
    throw new Error(`${packageName} is not installed for ${cwd}`);
  }
  const pkg = JSON.parse(readFileSync(packagePath, "utf8")) as { version?: string };
  if (!pkg.version) throw new Error(`${packageName} package has no version`);
  return pkg.version;
}
