/** Shared, fail-closed CLI parsers. */

export function parseFiniteNumber(flag: string, raw: string): number {
  if (raw.trim() === "") throw new Error(`${flag} must be a finite number`);
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${flag} must be a finite number`);
  return value;
}

export function parseFraction(flag: string, raw: string): number {
  const value = parseFiniteNumber(flag, raw);
  if (value < 0 || value > 1) throw new Error(`${flag} must be in [0, 1]`);
  return value;
}

export function parsePercentage(flag: string, raw: string): number {
  const value = parseFiniteNumber(flag, raw);
  if (value < 0 || value > 100) throw new Error(`${flag} must be in [0, 100]`);
  return value;
}

export function parsePositiveInteger(flag: string, raw: string): number {
  const value = parseFiniteNumber(flag, raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${flag} must be a positive safe integer`);
  }
  return value;
}

export function parseNonNegativeNumber(flag: string, raw: string): number {
  const value = parseFiniteNumber(flag, raw);
  if (value < 0) throw new Error(`${flag} must be non-negative`);
  return value;
}

export function parseRegex(flag: string, raw: string): RegExp {
  try {
    return new RegExp(raw);
  } catch (error) {
    throw new Error(`${flag} has an invalid regular expression: ${(error as Error).message}`);
  }
}
