import { dispatch, printHelp } from "./commands.js";
import { parseArgs } from "./utils.js";

export const main = async (argv) => {
  const parsed = parseArgs(argv);
  if (parsed._.length === 0 || parsed.help || parsed.h) {
    printHelp();
    return;
  }
  await dispatch(parsed._, parsed);
};
