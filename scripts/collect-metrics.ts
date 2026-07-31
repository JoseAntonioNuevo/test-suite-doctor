#!/usr/bin/env -S pnpm exec tsx
export { collectCommand } from "./commands/collect.ts";
import { collectCommand } from "./commands/collect.ts";

collectCommand().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(2);
});
