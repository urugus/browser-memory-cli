import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export const setupBrowser = ({ browser = "chromium" } = {}) => {
  const cliPath = require.resolve("playwright/cli");
  const result = spawnSync(process.execPath, [cliPath, "install", browser], {
    stdio: "inherit",
  });

  if (result.error) {
    throw new Error(`failed to run playwright install: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`playwright install failed with status ${result.status ?? "unknown"}`);
  }
};
