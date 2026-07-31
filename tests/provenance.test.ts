import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { captureProvenance, compareProvenance } from "../scripts/lib/provenance.ts";

function project() {
  const cwd = mkdtempSync(join(tmpdir(), "doctor-provenance-"));
  mkdirSync(join(cwd, "src"));
  writeFileSync(join(cwd, "src/a.ts"), "export const a = 1;\n");
  writeFileSync(join(cwd, "package.json"), JSON.stringify({ devDependencies: { vitest: "4.1.10" } }));
  writeFileSync(join(cwd, "package-lock.json"), JSON.stringify({ lockfileVersion: 3 }));
  writeFileSync(join(cwd, "vitest.config.ts"), "export default {};\n");
  return cwd;
}

const runtime = {
  runner: { name: "vitest" as const, version: "4.1.10", executable: "/repo/vitest.mjs" },
  coverageProvider: { name: "@vitest/coverage-v8", version: "4.1.10" },
};

describe("source and configuration provenance", () => {
  it("is stable for unchanged inputs and ignores unrelated new source", () => {
    const cwd = project();
    const baseline = captureProvenance(cwd, ["src/a.ts"], runtime);
    writeFileSync(join(cwd, "src/unrelated.ts"), "export const b = 2;\n");
    const current = captureProvenance(cwd, ["src/a.ts"], runtime);
    expect(compareProvenance(baseline, current)).toEqual([]);
    expect(current.fingerprint).toBe(baseline.fingerprint);
  });

  it("detects changed covered source and runner configuration", () => {
    const cwd = project();
    const baseline = captureProvenance(cwd, ["src/a.ts"], runtime);
    writeFileSync(join(cwd, "src/a.ts"), "export const a = 2;\n");
    writeFileSync(join(cwd, "vitest.config.ts"), "export default { test: {} };\n");
    const current = captureProvenance(cwd, ["src/a.ts"], runtime);
    expect(compareProvenance(baseline, current).map((entry) => entry.code)).toEqual(
      expect.arrayContaining(["covered-source-changed", "configuration-changed"]),
    );
  });

  it("detects runner and coverage-provider version drift", () => {
    const cwd = project();
    const baseline = captureProvenance(cwd, ["src/a.ts"], runtime);
    const current = captureProvenance(cwd, ["src/a.ts"], {
      runner: { ...runtime.runner, version: "5.0.0" },
      coverageProvider: { ...runtime.coverageProvider, version: "5.0.0" },
    });
    expect(compareProvenance(baseline, current).map((entry) => entry.code)).toEqual(
      expect.arrayContaining(["runner-version-changed", "coverage-provider-version-changed"]),
    );
  });
});
