import fs from "node:fs";
import path from "node:path";
import { ensureDir, genId, homeDir, nowIso, readJson, writeJson } from "./utils.js";

export class Storage {
  constructor(baseDir = homeDir()) {
    this.baseDir = baseDir;
    this.workflowsDir = path.join(baseDir, "workflows");
    this.runsDir = path.join(baseDir, "runs");
    this.promptsDir = path.join(baseDir, "prompt_versions");
    this.correctionsDir = path.join(baseDir, "corrections");
    [this.workflowsDir, this.runsDir, this.promptsDir, this.correctionsDir].forEach(ensureDir);
  }

  listJsonFiles(dir) {
    return fs
      .readdirSync(dir)
      .filter((name) => name.endsWith(".json"))
      .map((name) => readJson(path.join(dir, name)))
      .filter(Boolean);
  }

  createWorkflow(input) {
    if (!input.name || !input.goal || !input.successCriteria) {
      throw new Error("workflow create requires name, goal, success criteria");
    }
    const id = genId("wf");
    const promptVersion = {
      version: 1,
      createdAt: nowIso(),
      promptTemplate: input.promptTemplate || defaultPromptTemplate(),
      reason: "initial",
    };

    const workflow = {
      id,
      name: input.name,
      goal: input.goal,
      successCriteria: input.successCriteria,
      startUrl: input.startUrl || "",
      constraints: input.constraints || [],
      credentialRefs: input.credentialRefs || [],
      promptTemplateVersion: 1,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    this.saveWorkflow(workflow);
    this.savePromptVersion(id, promptVersion);
    return workflow;
  }

  saveWorkflow(workflow) {
    workflow.updatedAt = nowIso();
    writeJson(path.join(this.workflowsDir, `${workflow.id}.json`), workflow);
  }

  getWorkflow(id) {
    return readJson(path.join(this.workflowsDir, `${id}.json`));
  }

  listWorkflows() {
    return this.listJsonFiles(this.workflowsDir).sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
  }

  saveRun(run) {
    writeJson(path.join(this.runsDir, `${run.id}.json`), run);
  }

  createRun(workflowId, options = {}) {
    const run = {
      id: genId("run"),
      workflowId,
      status: "running",
      startedAt: nowIso(),
      finishedAt: null,
      options,
      steps: [],
      artifactsPath: path.join(this.baseDir, "artifacts", workflowId),
      finalSummary: "",
    };
    this.saveRun(run);
    return run;
  }

  getRun(id) {
    return readJson(path.join(this.runsDir, `${id}.json`));
  }

  listRuns(limit = 30) {
    return this.listJsonFiles(this.runsDir)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, limit);
  }

  appendRunStep(runId, step) {
    const run = this.getRun(runId);
    if (!run) throw new Error(`run not found: ${runId}`);
    run.steps.push(step);
    this.saveRun(run);
    return run;
  }

  finishRun(runId, updates) {
    const run = this.getRun(runId);
    if (!run) throw new Error(`run not found: ${runId}`);
    run.status = updates.status;
    run.finishedAt = nowIso();
    run.finalSummary = updates.finalSummary || "";
    this.saveRun(run);
    return run;
  }

  getPromptHistory(workflowId) {
    return this.listJsonFiles(this.promptsDir)
      .filter((item) => item.workflowId === workflowId)
      .sort((a, b) => a.version - b.version);
  }

  getPromptTemplate(workflowId, version = null) {
    const history = this.getPromptHistory(workflowId);
    if (history.length === 0) {
      return defaultPromptTemplate();
    }
    if (version === null) {
      return history[history.length - 1].promptTemplate;
    }
    const row = history.find((item) => item.version === Number(version));
    return row ? row.promptTemplate : history[history.length - 1].promptTemplate;
  }

  savePromptVersion(workflowId, data) {
    const entry = {
      id: genId("pv"),
      workflowId,
      version: data.version,
      createdAt: data.createdAt || nowIso(),
      promptTemplate: data.promptTemplate,
      reason: data.reason || "manual",
    };
    writeJson(path.join(this.promptsDir, `${entry.id}.json`), entry);
    return entry;
  }

  addCorrection(input) {
    const correction = {
      id: genId("cr"),
      runId: input.runId,
      step: Number(input.step),
      userNote: input.userNote,
      category: input.category || "general",
      applied: false,
      createdAt: nowIso(),
    };
    writeJson(path.join(this.correctionsDir, `${correction.id}.json`), correction);
    return correction;
  }

  listCorrections(runId = null) {
    const rows = this.listJsonFiles(this.correctionsDir).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
    if (!runId) return rows;
    return rows.filter((row) => row.runId === runId);
  }

  markCorrectionsApplied(runId) {
    const rows = this.listCorrections(runId);
    rows.forEach((row) => {
      row.applied = true;
      writeJson(path.join(this.correctionsDir, `${row.id}.json`), row);
    });
    return rows.length;
  }
}

const defaultPromptTemplate = () => {
  return [
    "あなたはブラウザ操作エージェントです。",
    "ゴール達成に必要な次の1手だけをJSONで返してください。",
    "UI変化があっても role/name/文脈テキストを優先して探索してください。",
    "破壊的操作や送信確定前は ask_human を使って確認してください。",
  ].join("\n");
};
