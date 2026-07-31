import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");

function sourceCli(args: string[]) {
  return spawnSync(
    process.execPath,
    ["--import", "tsx", resolve(root, "scripts/cli.ts"), ...args],
    { cwd: root, encoding: "utf8" },
  );
}

describe("unified CLI", () => {
  it("exposes version, top-level help, and command help", () => {
    const version = sourceCli(["--version"]);
    expect(version.status).toBe(0);
    expect(version.stdout.trim()).toBe("0.3.0");

    const help = sourceCli(["--help"]);
    expect(help.status).toBe(0);
    expect(help.stdout).toContain("test-suite-doctor <collect|minimize|verify>");

    for (const command of ["collect", "minimize", "verify"]) {
      const result = sourceCli([command, "--help"]);
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout.toLowerCase()).toContain(command);
    }
  });

  it("builds one committed dependency-free ESM executable", () => {
    const result = spawnSync("npm", ["run", "build"], { cwd: root, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    const output = resolve(root, "dist/cli.mjs");
    expect(existsSync(output)).toBe(true);
    const source = readFileSync(output, "utf8");
    expect(source.startsWith("#!/usr/bin/env node")).toBe(true);
    expect(source).not.toMatch(/from ["'](?:tsx|vitest|jest|ajv)/);
    expect(source).not.toContain("node_modules/");
  });
});
