import * as esbuild from "esbuild";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");
const outDir = join(rootDir, "plugin", "js");

if (!existsSync(outDir)) {
  mkdirSync(outDir, { recursive: true });
}

const entries = [
  { in: join(rootDir, "src", "desktop.ts"), out: join(outDir, "desktop.js") },
  { in: join(rootDir, "src", "config.ts"), out: join(outDir, "config.js") },
];

try {
  for (const entry of entries) {
    await esbuild.build({
      entryPoints: [entry.in],
      outfile: entry.out,
      bundle: true,
      format: "iife",
      target: "es2019",
      platform: "browser",
      minify: false,
      sourcemap: false,
      legalComments: "none",
      charset: "utf8",
      logLevel: "info",
    });
  }
} catch (err) {
  console.error(err);
  process.exit(1);
}
