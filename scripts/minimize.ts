#!/usr/bin/env -S pnpm exec tsx
export { minimizeCommand } from "./commands/minimize.ts";
import { minimizeCommand } from "./commands/minimize.ts";

minimizeCommand();
