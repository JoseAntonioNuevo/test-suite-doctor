import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workflowDir = resolve(import.meta.dirname, "../.github/workflows");

describe("workflow security and release contract", () => {
  it("pins every action to a full SHA and declares permissions and timeouts", () => {
    for (const file of readdirSync(workflowDir).filter((name) => name.endsWith(".yml"))) {
      const source = readFileSync(resolve(workflowDir, file), "utf8");
      expect(source, `${file} needs explicit default permissions`).toMatch(/^permissions:/m);
      for (const line of source.split("\n").filter((entry) => /^\s*- uses:/.test(entry))) {
        expect(line, `${file}: ${line.trim()}`).toMatch(/@[0-9a-f]{40}(?:\s|$)/);
      }
      const jobsSource = source.slice(source.indexOf("\njobs:\n") + "\njobs:\n".length);
      const jobs = [...jobsSource.matchAll(/^  [a-z][\w-]+:\n(?=    )/gm)];
      expect(source.match(/timeout-minutes:/g)?.length ?? 0, `${file} job timeouts`).toBeGreaterThanOrEqual(jobs.length);
      if (source.includes("actions/checkout@")) expect(source).toContain("persist-credentials: false");
    }
  });

  it("tests package, mutation, dogfood, runner, workflow, and benchmark surfaces in CI", () => {
    const ci = readFileSync(resolve(workflowDir, "ci.yml"), "utf8");
    for (const job of ["quality", "runner-integration", "dogfood", "package-smoke", "mutation-smoke", "workflow-security", "benchmark"]) {
      expect(ci).toMatch(new RegExp(`^  ${job}:`, "m"));
    }
    expect(ci).toContain("git diff --exit-code -- dist/cli.mjs");
    expect(ci).toContain("actionlint@v1.7.12");
    expect(ci).toContain("zizmor==1.28.0");
  });

  it("packs once and uses OIDC to publish the tested tarball idempotently", () => {
    const release = readFileSync(resolve(workflowDir, "release.yml"), "utf8");
    expect(release).toContain("environment: release");
    expect(release).toContain("id-token: write");
    expect(release).toContain("npm@11.5.1");
    expect(release).toContain("npm pack --json");
    expect(release).toContain("TEST_SUITE_DOCTOR_TARBALL");
    expect(release).toContain("npm publish \"$TARBALL\" --provenance");
    expect(release).toContain("npm view \"$NAME@$VERSION\"");
    expect(release).toContain("sha256sum");
    expect(release).toContain("npm sbom");
    expect(release).not.toContain("NODE_AUTH_TOKEN");
    expect(release).not.toContain("NPM_TOKEN");
  });
});
