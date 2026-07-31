import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { detectRunner } from "../scripts/lib/detect.ts";

const dirs: string[] = [];

function repo(pkg: object, files: string[] = []): string {
  const dir = mkdtempSync(join(tmpdir(), "tsd-detect-"));
  dirs.push(dir);
  writeFileSync(join(dir, "package.json"), JSON.stringify(pkg));
  for (const f of files) writeFileSync(join(dir, f), "export default {}\n");
  return dir;
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe("runner detection", () => {
  it("detects vitest from devDependencies", () => {
    const dir = repo({ devDependencies: { vitest: "^4.0.0" } });
    expect(detectRunner(dir).runner).toBe("vitest");
  });

  it("detects jest from dependencies", () => {
    const dir = repo({ dependencies: { jest: "^30.0.0" } });
    expect(detectRunner(dir).runner).toBe("jest");
  });

  it("disambiguates via config file when both are installed", () => {
    const both = { devDependencies: { vitest: "*", jest: "*" } };
    expect(detectRunner(repo(both, ["vitest.config.ts"])).runner).toBe("vitest");
    expect(detectRunner(repo(both, ["jest.config.js"])).runner).toBe("jest");
  });

  it('treats a package.json "jest" key as jest config', () => {
    const dir = repo({ devDependencies: { vitest: "*", jest: "*" }, jest: { preset: "x" } });
    expect(detectRunner(dir).runner).toBe("jest");
  });

  it("disambiguates via the test script when both are installed with no configs", () => {
    const dir = repo({
      devDependencies: { vitest: "*", jest: "*" },
      scripts: { test: "vitest run" },
    });
    expect(detectRunner(dir).runner).toBe("vitest");
  });

  it("falls back to config files when no dependency matches (hoisted monorepo)", () => {
    const dir = repo({}, ["vitest.config.ts"]);
    expect(detectRunner(dir).runner).toBe("vitest");
  });

  it("throws with guidance when nothing is detected", () => {
    const dir = repo({});
    expect(() => detectRunner(dir)).toThrow(/Could not detect a test runner/);
  });

  it("throws when both are installed and nothing disambiguates", () => {
    const dir = repo({ devDependencies: { vitest: "*", jest: "*" } });
    expect(() => detectRunner(dir)).toThrow(/--runner/);
  });

  it("lets an explicit override win over everything", () => {
    const dir = repo({ devDependencies: { vitest: "*" } });
    expect(detectRunner(dir, "jest").runner).toBe("jest");
  });

  it("rejects unknown override values", () => {
    const dir = repo({ devDependencies: { vitest: "*" } });
    expect(() => detectRunner(dir, "mocha")).toThrow(/Unknown runner/);
  });
});
