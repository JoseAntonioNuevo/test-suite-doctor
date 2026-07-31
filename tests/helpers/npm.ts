import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

function resolveNpmCli(): string | null {
  const inherited = process.env.npm_execpath;
  if (inherited && existsSync(inherited)) return inherited;
  if (process.platform !== "win32") return null;

  const located = spawnSync("where.exe", ["npm.cmd"], { encoding: "utf8" });
  for (const shim of located.stdout?.split(/\r?\n/) ?? []) {
    if (!shim) continue;
    const candidate = join(dirname(shim), "node_modules", "npm", "bin", "npm-cli.js");
    if (existsSync(candidate)) return candidate;
  }
  throw new Error("npm-cli.js could not be resolved from npm_execpath or PATH");
}

export function spawnNpm(args: string[], cwd: string) {
  const npmCli = resolveNpmCli();
  return npmCli
    ? spawnSync(process.execPath, [npmCli, ...args], { cwd, encoding: "utf8" })
    : spawnSync("npm", args, { cwd, encoding: "utf8" });
}
