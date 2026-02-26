import { describe, expect, it } from "vitest";
import { boolFlag, parseArgs } from "../src/utils.js";

describe("utils", () => {
  it("parseArgs parses flags and positional args", () => {
    const args = parseArgs(["workflow", "create", "--name", "a", "--json", "--x=1"]);
    expect(args._).toEqual(["workflow", "create"]);
    expect(args.name).toBe("a");
    expect(args.json).toBe(true);
    expect(args.x).toBe("1");
  });

  it("boolFlag supports common truthy values", () => {
    expect(boolFlag("true")).toBe(true);
    expect(boolFlag("1")).toBe(true);
    expect(boolFlag(undefined, false)).toBe(false);
  });
});
