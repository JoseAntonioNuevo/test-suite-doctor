import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

export function createInvocationDir(parent: string, command: string): string {
  const root = resolve(parent);
  mkdirSync(root, { recursive: true });
  return mkdtempSync(join(root, `${command}-`));
}

export function invalidateOutput(path: string): void {
  rmSync(path, { force: true });
  rmSync(`${path}.tmp`, { force: true });
}

export function writeJsonAtomic(path: string, value: unknown): void {
  const directory = dirname(path);
  mkdirSync(directory, { recursive: true });
  const temporary = join(directory, `${basename(path)}.tmp`);
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(temporary, path);
}
