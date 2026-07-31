import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");

function invoke(script: string, args: string[], cwd = root) {
  return spawnSync(process.execPath, ["--import", "tsx", join(root, script), ...args], {
    cwd,
    encoding: "utf8",
  });
}

describe("Jest end-to-end integration", () => {
  it("collects, minimizes, and verifies using the target-local Jest binary", () => {
    const dir = mkdtempSync(join(root, ".tmp-jest-"));
    try {
      mkdirSync(join(dir, "src"));
      symlinkSync(join(root, "node_modules"), join(dir, "node_modules"), "junction");
      writeFileSync(
        join(dir, "package.json"),
        JSON.stringify({ private: true, devDependencies: { jest: "^30.4.2" } }),
      );
      writeFileSync(join(dir, "src/a.js"), "exports.classify = (n) => n > 0 ? 'positive' : 'other';\n");
      writeFileSync(
        join(dir, "a.test.js"),
        [
          "const { classify } = require('./src/a.js');",
          "test('positive', () => expect(classify(1)).toBe('positive'));",
          "test('other', () => expect(classify(0)).toBe('other'));",
        ].join("\n"),
      );
      const report = join(dir, "report.json");
      const collected = invoke("scripts/collect-metrics.ts", [
        "--cwd",
        dir,
        "--runner",
        "jest",
        "--out",
        report,
        "--scratch",
        join(dir, "scratch"),
        "--concurrency",
        "1",
      ]);
      expect(collected.status, collected.stderr).toBe(0);
      expect(JSON.parse(readFileSync(report, "utf8"))).toEqual(
        expect.objectContaining({ version: 2, runner: "jest", collectionErrors: [] }),
      );

      const plan = join(dir, "plan.json");
      const minimized = invoke("scripts/minimize.ts", [
        "--report",
        report,
        "--out-plan",
        plan,
        "--out-md",
        join(dir, "plan.md"),
      ]);
      expect(minimized.status, minimized.stderr).toBe(0);
      expect(JSON.parse(readFileSync(plan, "utf8"))).toEqual(
        expect.objectContaining({
          version: 2,
          trusted: true,
          sourceReport: expect.objectContaining({ fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) }),
          scope: expect.objectContaining({ mode: "full" }),
        }),
      );

      const verdict = join(dir, "verify.json");
      const verified = invoke("scripts/verify.ts", [
        "--cwd",
        dir,
        "--runner",
        "jest",
        "--baseline",
        report,
        "--out",
        verdict,
        "--scratch",
        join(dir, "scratch"),
      ]);
      expect(verified.status, verified.stderr).toBe(0);
      expect(JSON.parse(readFileSync(verdict, "utf8"))).toEqual(
        expect.objectContaining({ version: 2, outcome: "passed", trusted: true }),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
