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

const root = resolve(import.meta.dirname, "..");
const created: string[] = [];

function fixture(testSource: string): string {
  const dir = mkdtempSync(join(root, ".tmp-collect-"));
  created.push(dir);
  mkdirSync(join(dir, "src"), { recursive: true });
  symlinkSync(join(root, "node_modules"), join(dir, "node_modules"), "junction");
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ type: "module", devDependencies: { vitest: "^4.1.10" } }),
  );
  writeFileSync(join(dir, "src/a.ts"), "export const value = 1;\n");
  writeFileSync(join(dir, "a.test.ts"), testSource);
  return dir;
}

function collect(dir: string) {
  return spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      join(root, "scripts/collect-metrics.ts"),
      "--cwd",
      dir,
      "--out",
      join(dir, "report.json"),
      "--scratch",
      join(dir, "scratch"),
      "--concurrency",
      "1",
      "--timeout-ms",
      "30000",
      "--baseline-timeout-ms",
      "30000",
    ],
    { cwd: root, encoding: "utf8" },
  );
}

afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("collector integration safety", () => {
  it("stops with exit 1 and no consumable report when the baseline is red", () => {
    const dir = fixture(
      [
        'import { expect, it } from "vitest";',
        'import { value } from "./src/a.ts";',
        'it("fails", () => expect(value).toBe(2));',
      ].join("\n"),
    );
    writeFileSync(join(dir, "report.json"), JSON.stringify({ version: 1, stale: true }));

    const result = collect(dir);
    expect(result.status).toBe(1);
    expect(existsSync(join(dir, "report.json"))).toBe(false);
    expect(result.stderr).toMatch(/baseline.*fail|failed.*baseline/i);
  });

  it("writes collection errors and exits 1 when an isolated hook fails", () => {
    const dir = fixture(
      [
        'import { afterAll, expect, it } from "vitest";',
        'import { existsSync, writeFileSync } from "node:fs";',
        'import { value } from "./src/a.ts";',
        'const marker = new URL("./isolated.marker", import.meta.url);',
        'const isolated = existsSync(marker);',
        'writeFileSync(marker, "seen");',
        'it("passes", () => expect(value).toBe(1));',
        'afterAll(() => {',
        '  if (isolated) throw new Error("isolated only");',
        '});',
      ].join("\n"),
    );

    const result = collect(dir);
    expect(result.status).toBe(1);
    const report = JSON.parse(readFileSync(join(dir, "report.json"), "utf8"));
    expect(report.collectionErrors).toEqual([
      expect.objectContaining({ id: "a.test.ts", reason: expect.stringMatching(/fail|exit|suite/i) }),
    ]);
    expect(report.units[0]).toEqual(expect.objectContaining({ status: "error" }));
  });
});
