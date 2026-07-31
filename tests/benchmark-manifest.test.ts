import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");

describe("external benchmark manifest", () => {
  it("pins the requested immutable targets and records reproducibility metadata", () => {
    const manifest = JSON.parse(readFileSync(resolve(root, "benchmarks/manifest.json"), "utf8"));
    expect(manifest.targets.map((target: { repository: string; commit: string }) =>
      `${target.repository}@${target.commit}`)).toEqual([
      "unjs/defu@82632b66f5914e9946edce300e10633a3d5c0cb7",
      "express-rate-limit/express-rate-limit@d2370f62147e1de7cd8df9d74bc6264b7f0e330e",
      "remeda/remeda@d24feab2b7d1b615214ea80c5b13fcca0c87a8a0",
    ]);
    for (const target of manifest.targets) {
      expect(target.commit).toMatch(/^[0-9a-f]{40}$/);
      expect(target.license).toBe("MIT");
      expect(target.packageManager).toMatch(/^(npm|pnpm)@/);
      expect(target).toEqual(expect.objectContaining({ cwd: expect.any(String), runner: expect.any(String) }));
    }
  });

  it("validates without cloning or installing targets", () => {
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", resolve(root, "tools/run-benchmarks.ts"), "--validate"],
      { cwd: root, encoding: "utf8" },
    );
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("3 immutable benchmark targets");
  });
});
