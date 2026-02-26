import { runWorkflow } from "./browser-engine.js";
import { deleteCredential, getCredential, setCredential } from "./credentials.js";
import { ClaudeCliProvider } from "./llm-provider.js";
import { setupBrowser } from "./setup-browser.js";
import { Storage } from "./storage.js";
import { boolFlag, fail, printJson } from "./utils.js";

export const dispatch = async (args, rawFlags) => {
  const storage = new Storage();
  const provider = new ClaudeCliProvider();

  if (args[0] === "workflow") {
    return handleWorkflow(storage, args.slice(1), rawFlags);
  }
  if (args[0] === "run") {
    return handleRun(storage, provider, args.slice(1), rawFlags);
  }
  if (args[0] === "runs") {
    return handleRuns(storage, args.slice(1), rawFlags);
  }
  if (args[0] === "correct") {
    return handleCorrect(storage, args.slice(1), rawFlags);
  }
  if (args[0] === "tune") {
    return handleTune(storage, provider, args.slice(1), rawFlags);
  }
  if (args[0] === "credential") {
    return handleCredential(args.slice(1), rawFlags);
  }
  if (args[0] === "setup:browser") {
    return handleSetupBrowser(rawFlags);
  }
  if (args[0] === "mcp" && args[1] === "serve") {
    return serveMcp();
  }

  printHelp();
};

const handleWorkflow = (storage, args, flags) => {
  const cmd = args[0];
  if (cmd === "create") {
    const workflow = storage.createWorkflow({
      name: flags.name,
      goal: flags.goal,
      successCriteria: flags.success,
      startUrl: flags.startUrl || "",
      constraints: splitCsv(flags.constraints),
      credentialRefs: splitCsv(flags.credentials),
      promptTemplate: flags.prompt,
    });
    return printMaybeJson(flags, workflow, `Created workflow: ${workflow.id}`);
  }

  if (cmd === "list") {
    const rows = storage.listWorkflows();
    return printMaybeJson(
      flags,
      rows,
      rows.map((w) => `${w.id} | ${w.name} | ${w.updatedAt}`).join("\n"),
    );
  }

  if (cmd === "show") {
    const workflow = storage.getWorkflow(args[1]);
    if (!workflow) fail(`workflow not found: ${args[1]}`);
    return printMaybeJson(flags, workflow, formatObject(workflow));
  }

  if (cmd === "update") {
    const workflow = storage.getWorkflow(args[1]);
    if (!workflow) fail(`workflow not found: ${args[1]}`);
    if (flags.name) workflow.name = flags.name;
    if (flags.goal) workflow.goal = flags.goal;
    if (flags.success) workflow.successCriteria = flags.success;
    if (flags.constraints) workflow.constraints = splitCsv(flags.constraints);
    if (flags.startUrl) workflow.startUrl = flags.startUrl;
    storage.saveWorkflow(workflow);
    return printMaybeJson(flags, workflow, `Updated workflow: ${workflow.id}`);
  }

  fail("workflow subcommand must be create|list|show|update");
};

const handleRun = async (storage, provider, args, flags) => {
  const workflowId = args[0];
  if (!workflowId) fail("run requires workflow-id");
  const workflow = storage.getWorkflow(workflowId);
  if (!workflow) fail(`workflow not found: ${workflowId}`);

  const run = await runWorkflow({
    storage,
    provider,
    workflow,
    options: {
      headless: boolFlag(flags.headless, false),
      maxSteps: Number(flags.maxSteps || 30),
    },
  });

  return printMaybeJson(flags, run, `${run.id} | ${run.status} | ${run.finalSummary}`);
};

const handleRuns = (storage, args, flags) => {
  const cmd = args[0];
  if (cmd === "list") {
    const rows = storage.listRuns(Number(flags.limit || 20));
    return printMaybeJson(
      flags,
      rows,
      rows.map((r) => `${r.id} | ${r.workflowId} | ${r.status}`).join("\n"),
    );
  }

  if (cmd === "show") {
    const run = storage.getRun(args[1]);
    if (!run) fail(`run not found: ${args[1]}`);
    return printMaybeJson(flags, run, formatObject(run));
  }

  fail("runs subcommand must be list|show");
};

const handleCorrect = (storage, args, flags) => {
  const runId = args[0];
  if (!runId) fail("correct requires run-id");
  if (!flags.step) fail("correct requires --step");
  if (!flags.note) fail("correct requires --note");

  const correction = storage.addCorrection({
    runId,
    step: Number(flags.step),
    userNote: flags.note,
    category: flags.category || "general",
  });

  return printMaybeJson(flags, correction, `Correction saved: ${correction.id}`);
};

const handleTune = (storage, provider, args, flags) => {
  const runId = args[0];
  if (!runId) fail("tune requires run-id");

  const run = storage.getRun(runId);
  if (!run) fail(`run not found: ${runId}`);

  const workflow = storage.getWorkflow(run.workflowId);
  if (!workflow) fail(`workflow not found: ${run.workflowId}`);

  const corrections = storage.listCorrections(runId);
  const promptTemplate = storage.getPromptTemplate(workflow.id);

  const patch = provider.proposePromptPatch({
    promptTemplate,
    runSummary: run.finalSummary,
    corrections,
  });

  const output = {
    runId,
    workflowId: workflow.id,
    currentPromptVersion: workflow.promptTemplateVersion,
    patch,
  };

  if (boolFlag(flags.apply, false)) {
    const nextVersion = workflow.promptTemplateVersion + 1;
    storage.savePromptVersion(workflow.id, {
      version: nextVersion,
      promptTemplate: patch.proposedPromptTemplate,
      reason: `tune from run ${run.id}`,
    });
    workflow.promptTemplateVersion = nextVersion;
    storage.saveWorkflow(workflow);
    storage.markCorrectionsApplied(runId);
    output.appliedVersion = nextVersion;
  }

  return printMaybeJson(flags, output, formatTuneOutput(output));
};

const handleCredential = (args, flags) => {
  const cmd = args[0];
  const name = args[1];
  if (!cmd || !name) fail("credential requires subcommand and name");

  if (cmd === "set") {
    if (!flags.value) fail("credential set requires --value");
    setCredential(name, flags.value);
    return printMaybeJson(flags, { name, saved: true }, `Credential saved: ${name}`);
  }
  if (cmd === "get") {
    const value = getCredential(name);
    if (!value) fail(`credential not found: ${name}`);
    return printMaybeJson(flags, { name, value }, value);
  }
  if (cmd === "delete") {
    deleteCredential(name);
    return printMaybeJson(flags, { name, deleted: true }, `Credential deleted: ${name}`);
  }
  fail("credential subcommand must be set|get|delete");
};

const handleSetupBrowser = (flags) => {
  const browser = flags.browser || "chromium";
  setupBrowser({ browser });
  return printMaybeJson(flags, { ok: true, browser }, `Playwright browser installed: ${browser}`);
};

const serveMcp = () => {
  process.stdout.write(
    `${JSON.stringify(
      {
        name: "browser-memory-mcp",
        version: "0.1.0",
        tools: [
          { name: "workflow_run", description: "Run workflow by id" },
          { name: "run_tune", description: "Generate prompt tuning proposal" },
        ],
        note: "MCP wrapper stub. Use CLI commands for full capabilities.",
      },
      null,
      2,
    )}\n`,
  );
};

export const printHelp = () => {
  const lines = [
    "browser-memory commands:",
    "  workflow create --name --goal --success [--startUrl] [--prompt]",
    "  workflow list",
    "  workflow show <workflow-id>",
    "  workflow update <workflow-id> [--name] [--goal] [--success] [--startUrl]",
    "  run <workflow-id> [--headless=false] [--maxSteps=30]",
    "  runs list [--limit=20]",
    "  runs show <run-id>",
    "  correct <run-id> --step <n> --note <text> [--category]",
    "  tune <run-id> [--apply]",
    "  credential set <name> --value <secret>",
    "  credential get <name>",
    "  credential delete <name>",
    "  setup:browser [--browser chromium|firefox|webkit]",
    "  mcp serve",
    "  add --json to print machine-readable output",
  ];
  process.stdout.write(`${lines.join("\n")}\n`);
};

const splitCsv = (value) => {
  if (!value) return [];
  return String(value)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
};

const printMaybeJson = (flags, obj, text) => {
  if (flags.json) {
    printJson(obj);
    return;
  }
  process.stdout.write(`${text}\n`);
};

const formatTuneOutput = (output) => {
  const lines = [
    `runId: ${output.runId}`,
    `workflowId: ${output.workflowId}`,
    `currentPromptVersion: ${output.currentPromptVersion}`,
    `summary: ${output.patch.summary}`,
    `rationale: ${output.patch.rationale}`,
    "--- proposed prompt ---",
    output.patch.proposedPromptTemplate,
  ];
  if (output.appliedVersion) {
    lines.push(`appliedVersion: ${output.appliedVersion}`);
  }
  return lines.join("\n");
};

const formatObject = (obj) => JSON.stringify(obj, null, 2);
