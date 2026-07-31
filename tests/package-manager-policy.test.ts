import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const pnpmVersion = "11.18.0";
const pnpmSetupSha = "008330803749db0355799c700092d9a85fd074e9";

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

describe("pnpm package-manager policy", () => {
  it("pins pnpm and commits only its lockfile", () => {
    const manifest = JSON.parse(read("package.json"));
    expect(manifest.packageManager).toBe(`pnpm@${pnpmVersion}`);
    expect(manifest.scripts.prepack).toBe("pnpm run build");
    expect(existsSync(resolve(root, "pnpm-lock.yaml"))).toBe(true);
    expect(existsSync(resolve(root, "package-lock.json"))).toBe(false);
  });

  it("uses pnpm for repository commands and automation", () => {
    const documentation = [
      "README.md",
      "AGENTS.md",
      "CONTRIBUTING.md",
      "docs/releasing.md",
      "tests/scenarios.md",
    ];
    const workflows = readdirSync(resolve(root, ".github/workflows"))
      .filter((name) => name.endsWith(".yml"))
      .map((name) => `.github/workflows/${name}`);

    for (const path of [...documentation, ...workflows]) {
      const source = read(path);
      expect(source, `${path} contains an npm CLI command`).not.toMatch(
        /(?:^|[\s`$])npm\s+(?:ci|install|run|test|pack|publish|view|exec|sbom)\b/m,
      );
    }

    for (const path of workflows) {
      const source = read(path);
      if (!source.includes("actions/setup-node@")) continue;
      expect(source, `${path} must install pnpm from a full action SHA`).toContain(
        `pnpm/action-setup@${pnpmSetupSha}`,
      );
      expect(source, `${path} must pin the repository pnpm version`).toContain(
        `version: ${pnpmVersion}`,
      );
    }
  });

  it("keeps executable source entrypoints free of implicit package downloads", () => {
    const legacyExecutor = ["n", "p", "x"].join("");
    for (const path of [
      "scripts/collect-metrics.ts",
      "scripts/minimize.ts",
      "scripts/verify.ts",
      "scripts/lib/exec.ts",
      "examples/make-demo.ts",
    ]) {
      expect(read(path), `${path} still references the legacy executor`).not.toMatch(
        new RegExp(`\\b${legacyExecutor}\\b`),
      );
    }
  });
});
