import { dispatch, printHelp } from "./commands";
import { parseArgs } from "./utils";

export const main = async (argv) => {
  const parsed = parseArgs(argv);
  if (parsed._.length === 0 || parsed.help || parsed.h) {
    printHelp();
    return;
  }
  await dispatch(parsed._, parsed);
};
