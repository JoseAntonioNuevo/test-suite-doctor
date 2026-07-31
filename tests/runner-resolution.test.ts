import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  listTestFilesSpec,
  resolvePackageVersion,
  resolveTargetBinary,
} from "../scripts/lib/runner-resolution.ts";

const root = resolve(import.meta.dirname, "..");

describe("target-local runner resolution", () => {
  it("resolves Vitest from the target package without an implicit download", () => {
    const binary = resolveTargetBinary(root, "vitest");
    expect(binary.command).toBe(process.execPath);
    expect(binary.argsPrefix[0]).toMatch(/vitest\.mjs$/);
    expect(binary.version).toMatch(/^4\./);
  });

  it("uses an explicit runner JavaScript path when provided", () => {
    const binary = resolveTargetBinary(root, "vitest", "/tmp/custom-runner.mjs");
    expect(binary).toEqual(
      expect.objectContaining({ command: process.execPath, argsPrefix: ["/tmp/custom-runner.mjs"] }),
    );
  });

  it("fails rather than downloading a missing target runner", () => {
    const dir = mkdtempSync(join(tmpdir(), "doctor-runner-"));
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "empty", private: true }));
    expect(() => resolveTargetBinary(dir, "jest")).toThrow(/not installed|--runner-bin/i);
  });

  it("builds runner-native file listing commands", () => {
    expect(listTestFilesSpec("vitest", [])).toEqual(["list", "--filesOnly"]);
    expect(listTestFilesSpec("jest", ["--config", "jest.config.js"])).toEqual([
      "--listTests",
      "--json",
      "--config",
      "jest.config.js",
    ]);
  });

  it("reads the target coverage-provider version", () => {
    expect(resolvePackageVersion(root, "@vitest/coverage-v8")).toBe("4.1.10");
  });
});
