import { chmodSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "esbuild";

const root = resolve(import.meta.dirname, "..");
const outfile = resolve(root, "dist/cli.mjs");
mkdirSync(resolve(root, "dist"), { recursive: true });

await build({
  entryPoints: [resolve(root, "scripts/cli.ts")],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  legalComments: "none",
  sourcemap: false,
  charset: "utf8",
});
chmodSync(outfile, 0o755);
