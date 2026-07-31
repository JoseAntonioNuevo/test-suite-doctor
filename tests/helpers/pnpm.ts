import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const pnpmVersion = "11.18.0";

function resolvePnpmCli(): string | null {
  // Package-manager scripts expose their JavaScript entrypoint through this
  // standard environment variable. Executing it with Node avoids Windows CMD
  // shim behavior while keeping the test process shell-free.
  const inherited = process.env.npm_execpath;
  if (inherited && existsSync(inherited) && /pnpm/i.test(inherited)) return inherited;
  if (process.platform !== "win32") return null;
  throw new Error("pnpm CLI could not be resolved; run the suite with `pnpm test`");
}

export function spawnPnpm(args: string[], cwd: string) {
  const pnpmCli = resolvePnpmCli();
  if (pnpmCli) {
    return spawnSync(process.execPath, [pnpmCli, ...args], { cwd, encoding: "utf8" });
  }
  return spawnSync("corepack", [`pnpm@${pnpmVersion}`, ...args], { cwd, encoding: "utf8" });
}
