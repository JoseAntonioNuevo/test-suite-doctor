import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { spawnNpm } from "./helpers/npm.ts";

const root = resolve(import.meta.dirname, "..");

describe("npm package smoke", () => {
  it("packs only the public skill/CLI surface and runs in a clean consumer", () => {
    const output = mkdtempSync(join(tmpdir(), "doctor-pack-"));
    const consumer = mkdtempSync(join(tmpdir(), "doctor-consumer-"));
    try {
      const suppliedTarball = process.env.TEST_SUITE_DOCTOR_TARBALL;
      let tarball: string;
      let paths: string[];
      if (suppliedTarball) {
        tarball = resolve(suppliedTarball);
        const listed = spawnSync("tar", ["-tf", tarball], { encoding: "utf8" });
        expect(listed.status, listed.stderr).toBe(0);
        paths = listed.stdout.split(/\r?\n/).map((path) => path.replace(/^package\//, ""));
      } else {
        const packed = spawnNpm(["pack", "--json", "--pack-destination", output], root);
        expect(packed.status, packed.stderr).toBe(0);
        const metadata = JSON.parse(packed.stdout)[0];
        paths = metadata.files.map((file: { path: string }) => file.path);
        tarball = join(output, metadata.filename);
      }
      expect(paths).toContain("dist/cli.mjs");
      expect(paths).toContain("SKILL.md");
      expect(paths).toContain("schemas/metrics-v2.schema.json");
      expect(paths.some((path: string) => /^(tests|tools|scripts|examples)\//.test(path))).toBe(false);

      writeFileSync(join(consumer, "package.json"), JSON.stringify({ private: true }));
      const installed = spawnNpm(
        ["install", "--ignore-scripts", "--omit=dev", "--offline", tarball],
        consumer,
      );
      expect(installed.status, installed.stderr).toBe(0);
      const version = spawnNpm(
        ["exec", "--offline", "--", "test-suite-doctor", "--version"],
        consumer,
      );
      expect(version.status, version.stderr).toBe(0);
      expect(version.stdout.trim()).toBe("0.3.0");
      expect(basename(tarball)).toMatch(/\.tgz$/);
      expect(readFileSync(join(consumer, "node_modules/test-suite-doctor/package.json"), "utf8"))
        .not.toContain('"dependencies"');

      const packedCli = join(consumer, "node_modules/test-suite-doctor/dist/cli.mjs");
      for (const runner of ["vitest", "jest"] as const) {
        const target = join(output, `${runner} target with spaces`);
        mkdirSync(join(target, "src"), { recursive: true });
        symlinkSync(join(root, "node_modules"), join(target, "node_modules"), "junction");
        writeFileSync(
          join(target, "package.json"),
          JSON.stringify({ private: true, type: runner === "vitest" ? "module" : "commonjs" }),
        );
        if (runner === "vitest") {
          writeFileSync(join(target, "src/a.ts"), "export const value = 1;\n");
          writeFileSync(
            join(target, "a.test.ts"),
            'import { expect, it } from "vitest"; import { value } from "./src/a.ts"; it("works", () => expect(value).toBe(1));\n',
          );
        } else {
          writeFileSync(join(target, "src/a.js"), "exports.value = 1;\n");
          writeFileSync(
            join(target, "a.test.js"),
            "const { value } = require('./src/a.js'); test('works', () => expect(value).toBe(1));\n",
          );
        }
        const report = join(target, "metrics.json");
        const plan = join(target, "plan.json");
        const verdict = join(target, "verdict.json");
        const calls = [
          ["collect", "--cwd", target, "--runner", runner, "--out", report, "--scratch", join(target, "scratch"), "--concurrency", "1", "--keep-scratch"],
          ["minimize", "--report", report, "--out-plan", plan, "--out-md", join(target, "plan.md")],
          ["verify", "--cwd", target, "--runner", runner, "--baseline", report, "--out", verdict, "--scratch", join(target, "scratch")],
        ];
        for (const args of calls) {
          const result = spawnSync(process.execPath, [packedCli, ...args], {
            cwd: consumer,
            encoding: "utf8",
          });
          const scratch = join(target, "scratch");
          const diagnostics = result.status === 0 || !readdirSync(scratch, { recursive: true }).length
            ? ""
            : readdirSync(scratch, { recursive: true })
                .filter((entry) => String(entry).endsWith("results.json"))
                .map((entry) => readFileSync(join(scratch, String(entry)), "utf8"))
                .join("\n");
          expect(result.status, `${runner} ${args[0]}:\n${result.stderr}\n${diagnostics}`).toBe(0);
        }
        expect(JSON.parse(readFileSync(verdict, "utf8"))).toEqual(
          expect.objectContaining({ outcome: "passed", trusted: true }),
        );
      }
    } finally {
      rmSync(output, { recursive: true, force: true });
      rmSync(consumer, { recursive: true, force: true });
    }
  }, 60_000);
});
