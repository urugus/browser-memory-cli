#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const thisFile = fileURLToPath(import.meta.url);
const thisDir = path.dirname(thisFile);
const tsEntry = path.join(thisDir, "browser-memory.ts");

const result = spawnSync(process.execPath, ["--import", "tsx", tsEntry, ...process.argv.slice(2)], {
  stdio: "inherit",
});

if (result.error) {
  process.stderr.write(`Fatal: ${result.error.message}\n`);
  process.exit(1);
}

process.exit(result.status ?? 1);
