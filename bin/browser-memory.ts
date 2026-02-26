#!/usr/bin/env node
import { main } from "../src/cli";

main(process.argv.slice(2)).catch((error) => {
  process.stderr.write(`Fatal: ${error.stack || error.message}\n`);
  process.exit(1);
});
