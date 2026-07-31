import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createInvocationDir,
  invalidateOutput,
  writeJsonAtomic,
} from "../scripts/lib/artifacts.ts";

describe("invocation artifacts", () => {
  it("creates a fresh invocation directory for every run", () => {
    const parent = mkdtempSync(join(tmpdir(), "doctor-scratch-"));
    const first = createInvocationDir(parent, "collect");
    const second = createInvocationDir(parent, "collect");
    expect(first).not.toBe(second);
    expect(existsSync(first)).toBe(true);
    expect(existsSync(second)).toBe(true);
  });

  it("invalidates a previous success artifact before work starts", () => {
    const dir = mkdtempSync(join(tmpdir(), "doctor-output-"));
    const output = join(dir, "verify.json");
    writeFileSync(output, JSON.stringify({ pass: true }));
    invalidateOutput(output);
    expect(existsSync(output)).toBe(false);
  });

  it("atomically replaces JSON output without leaving the temporary file", () => {
    const dir = mkdtempSync(join(tmpdir(), "doctor-output-"));
    const output = join(dir, "report.json");
    writeJsonAtomic(output, { version: 1, pass: false });
    expect(JSON.parse(readFileSync(output, "utf8"))).toEqual({ version: 1, pass: false });
    expect(existsSync(`${output}.tmp`)).toBe(false);
  });
});
