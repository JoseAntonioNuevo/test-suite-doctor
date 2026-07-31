import { describe, expect, it } from "vitest";
import { parseResultsFile, validateRunOutcome } from "../scripts/lib/runner-commands.ts";

describe("runner outcome validation", () => {
  it("rejects passing assertions when the suite summary reports a failed hook", () => {
    const results = parseResultsFile({
      success: false,
      numTotalTests: 1,
      numFailedTests: 0,
      numFailedTestSuites: 1,
      testResults: [
        {
          name: "/repo/a.test.ts",
          assertionResults: [{ fullName: "passes", status: "passed", duration: 1 }],
        },
      ],
    });

    expect(validateRunOutcome({ code: 1, timedOut: false, signal: null, error: null }, results)).toEqual(
      expect.objectContaining({ green: false, kind: "test-failure" }),
    );
  });

  it("rejects an empty suite even when the runner says success", () => {
    const results = parseResultsFile({ success: true, numTotalTests: 0, testResults: [] });
    expect(validateRunOutcome({ code: 0, timedOut: false, signal: null, error: null }, results)).toEqual(
      expect.objectContaining({ green: false, kind: "environment-error" }),
    );
  });

  it("accepts only a successful process and successful non-empty suite", () => {
    const results = parseResultsFile({
      success: true,
      numTotalTests: 1,
      numFailedTests: 0,
      numFailedTestSuites: 0,
      testResults: [
        {
          name: "/repo/a.test.ts",
          assertionResults: [{ fullName: "passes", status: "passed", duration: 1 }],
        },
      ],
    });
    expect(validateRunOutcome({ code: 0, timedOut: false, signal: null, error: null }, results)).toEqual(
      expect.objectContaining({ green: true, kind: "passed" }),
    );
  });

  it("records runner-reported file duration separately from assertion time", () => {
    const results = parseResultsFile({
      success: true,
      numTotalTests: 1,
      testResults: [
        {
          name: "/repo/a.test.ts",
          startTime: 100,
          endTime: 140,
          assertionResults: [{ fullName: "passes", status: "passed", duration: 4 }],
        },
      ],
    });
    expect(results.fileDurations.get("/repo/a.test.ts")).toBe(40);
  });
});
