#!/usr/bin/env node
import { TOOL_VERSION } from "./lib/version.ts";
const HELP = `test-suite-doctor <collect|minimize|verify> [options]

Commands:
  collect   Measure scoped per-unit coverage and timing
  minimize  Produce a deterministic keep/drop proposal
  verify    Verify suite, provenance, retention, and optional mutation floors

Options:
  --help     Show this help
  --version  Print the CLI version`;

export async function cli(args = process.argv.slice(2)): Promise<void> {
  const [command, ...rest] = args;
  if (command === "--version" || command === "-v") {
    console.log(TOOL_VERSION);
    return;
  }
  if (command == null || command === "--help" || command === "-h") {
    console.log(HELP);
    return;
  }
  if (command === "collect") {
    const { collectCommand } = await import("./commands/collect.ts");
    return collectCommand(rest);
  }
  if (command === "minimize") {
    const { minimizeCommand } = await import("./commands/minimize.ts");
    return minimizeCommand(rest);
  }
  if (command === "verify") {
    const { verifyCommand } = await import("./commands/verify.ts");
    return verifyCommand(rest);
  }
  console.error(`test-suite-doctor: unknown command "${command}"\n\n${HELP}`);
  process.exit(2);
}

cli().catch((error) => {
  console.error((error as Error).stack ?? String(error));
  process.exit(2);
});
