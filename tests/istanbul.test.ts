import { describe, expect, it } from "vitest";
import {
  intersectionSize,
  parseCoverageFinal,
  toKeySets,
  type IstanbulFileCoverage,
} from "../scripts/lib/istanbul.ts";

describe("istanbul coverage parsing", () => {
  const raw: Record<string, IstanbulFileCoverage> = {
    "/repo/src/a.ts": {
      statementMap: {
        "0": { start: { line: 1 } },
        "1": { start: { line: 2 } },
        "2": { start: { line: 2 } }, // second statement on the same line
        "3": { start: { line: 5 } },
      },
      s: { "0": 1, "1": 0, "2": 5, "3": 0 },
      b: { "0": [1, 0] },
    },
  };

  it("derives covered/total lines from statement start lines", () => {
    const parsed = parseCoverageFinal(raw, "/repo");
    expect(parsed.files["src/a.ts"].lines).toEqual([1, 2]);
    expect(parsed.totals).toEqual({
      coveredLines: 2,
      totalLines: 3,
      coveredBranches: 1,
      totalBranches: 2,
    });
  });

  it("records covered branch paths as branchId.pathIndex", () => {
    const parsed = parseCoverageFinal(raw, "/repo");
    expect(parsed.files["src/a.ts"].branches).toEqual(["0.0"]);
  });

  it("keeps paths outside cwd absolute and normalizes separators", () => {
    const parsed = parseCoverageFinal(
      {
        "/elsewhere/b.ts": { statementMap: { "0": { start: { line: 1 } } }, s: { "0": 1 } },
      },
      "/repo",
    );
    expect(Object.keys(parsed.files)).toEqual(["/elsewhere/b.ts"]);
  });

  it("flattens a coverage map into unique line and branch keys", () => {
    const keys = toKeySets({ "src/a.ts": { lines: [1, 2], branches: ["0.0"] } });
    expect([...keys.lines].sort()).toEqual(["src/a.ts:1", "src/a.ts:2"]);
    expect([...keys.branches]).toEqual(["src/a.ts:0.0"]);
  });

  it("computes set intersections regardless of argument order", () => {
    const a = new Set(["1", "2", "3"]);
    const b = new Set(["2", "3", "4", "5"]);
    expect(intersectionSize(a, b)).toBe(2);
    expect(intersectionSize(b, a)).toBe(2);
  });
});
