import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Storage } from "../src/storage.js";

describe("storage", () => {
  it("can create workflow and run", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "browser-memory-test-"));
    const storage = new Storage(dir);

    const wf = storage.createWorkflow({
      name: "sample",
      goal: "g",
      successCriteria: "s",
      startUrl: "https://example.com",
    });

    expect(wf.id.startsWith("wf_")).toBe(true);
    expect(storage.listWorkflows()).toHaveLength(1);

    const run = storage.createRun(wf.id, { headless: false });
    storage.appendRunStep(run.id, {
      index: 0,
      decision: { action: "finish" },
      result: { done: true },
    });

    const saved = storage.getRun(run.id);
    expect(saved.steps).toHaveLength(1);
  });
});
