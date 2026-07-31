#!/usr/bin/env -S npx tsx
export { verifyCommand } from "./commands/verify.ts";
import { verifyCommand } from "./commands/verify.ts";

verifyCommand().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(2);
});
