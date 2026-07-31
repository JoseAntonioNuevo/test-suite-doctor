import { describe, expect, it } from "vitest";
import {
  parseFiniteNumber,
  parseFraction,
  parsePositiveInteger,
  parseRegex,
} from "../scripts/lib/args.ts";

describe("shared CLI argument validation", () => {
  it.each(["", " ", "nope", "NaN", "Infinity", "-Infinity"])(
    "rejects non-finite numeric text %j",
    (value) => {
      expect(() => parseFiniteNumber("--weight", value)).toThrow(/--weight.*finite/i);
    },
  );

  it("accepts fraction endpoints and rejects values outside [0, 1]", () => {
    expect(parseFraction("--coverage-floor", "0")).toBe(0);
    expect(parseFraction("--coverage-floor", "1")).toBe(1);
    expect(() => parseFraction("--coverage-floor", "-0.1")).toThrow(/\[0, 1\]/);
    expect(() => parseFraction("--coverage-floor", "1.1")).toThrow(/\[0, 1\]/);
  });

  it.each(["0", "-1", "1.5", "9007199254740992"])(
    "rejects invalid positive integer %s",
    (value) => {
      expect(() => parsePositiveInteger("--timeout-ms", value)).toThrow(/positive safe integer/i);
    },
  );

  it("reports invalid regular expressions with the flag name", () => {
    expect(() => parseRegex("--filter", "[")).toThrow(/--filter.*invalid regular expression/i);
  });
});
