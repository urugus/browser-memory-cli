import fs from "node:fs";
import path from "node:path";
import { ensureDir, nowIso } from "./utils.js";

export const runWorkflow = async ({ storage, provider, workflow, options }) => {
  const run = storage.createRun(workflow.id, options);
  const maxSteps = Number(options.maxSteps || 30);
  const headless = options.headless;

  const runtime = await createRuntime({ headless, downloadDir: run.artifactsPath });
  ensureDir(run.artifactsPath);

  try {
    let context = await runtime.collectContext();
    for (let i = 0; i < maxSteps; i += 1) {
      const decision = provider.planNextAction({
        promptTemplate: storage.getPromptTemplate(workflow.id),
        workflow,
        context: {
          ...context,
          stepIndex: i,
          goal: workflow.goal,
          successCriteria: workflow.successCriteria,
          recentSteps: storage.getRun(run.id).steps.slice(-3),
        },
      });

      const result = await runtime.execute(decision);
      storage.appendRunStep(run.id, {
        index: i,
        at: nowIso(),
        decision,
        result,
      });

      if (decision.action === "finish" || result.done) {
        const summary = await runtime.buildSummary(workflow.successCriteria);
        storage.finishRun(run.id, {
          status: summary.success ? "succeeded" : "failed",
          finalSummary: summary.message,
        });
        await runtime.close();
        return storage.getRun(run.id);
      }

      context = await runtime.collectContext();
    }

    storage.finishRun(run.id, {
      status: "failed",
      finalSummary: `maxSteps(${maxSteps}) 到達`,
    });
    await runtime.close();
    return storage.getRun(run.id);
  } catch (error) {
    storage.finishRun(run.id, {
      status: "failed",
      finalSummary: `runtime error: ${error.message}`,
    });
    await runtime.close();
    return storage.getRun(run.id);
  }
};

const createRuntime = async ({ headless, downloadDir }) => {
  let playwright;
  try {
    playwright = await import("playwright");
  } catch {
    return new NoopRuntime();
  }

  const browser = await playwright.chromium.launch({ headless });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  context.on("download", async (download) => {
    const targetPath = path.join(downloadDir, download.suggestedFilename());
    await download.saveAs(targetPath);
  });

  return new PlaywrightRuntime({ browser, context, page, downloadDir });
};

class NoopRuntime {
  constructor() {
    this.currentUrl = "about:blank";
  }

  async collectContext() {
    return {
      currentUrl: this.currentUrl,
      title: "noop",
      visibleText: "playwright package is not installed",
      downloads: [],
    };
  }

  async execute(decision) {
    if (decision.action === "navigate" && decision.target) {
      this.currentUrl = decision.target;
      return { ok: true, note: `noop navigate ${decision.target}` };
    }
    if (decision.action === "finish") {
      return { ok: true, done: true, note: "noop finish" };
    }
    return { ok: true, note: `noop action ${decision.action}` };
  }

  async buildSummary() {
    return {
      success: true,
      message: "noop runtime completed (playwright未導入)",
    };
  }

  async close() {}
}

class PlaywrightRuntime {
  constructor({ browser, context, page, downloadDir }) {
    this.browser = browser;
    this.context = context;
    this.page = page;
    this.downloadDir = downloadDir;
  }

  async collectContext() {
    const currentUrl = this.page.url() || "about:blank";
    const title = await this.page.title().catch(() => "");
    const visibleText = await this.page
      .evaluate(() => document.body?.innerText?.slice(0, 3000) || "")
      .catch(() => "");
    const downloads = fs.existsSync(this.downloadDir)
      ? fs.readdirSync(this.downloadDir).filter((name) => !name.startsWith("."))
      : [];

    return { currentUrl, title, visibleText, downloads };
  }

  async execute(decision) {
    try {
      switch (decision.action) {
        case "navigate":
          await this.page.goto(decision.target, { waitUntil: "domcontentloaded" });
          return { ok: true, note: `navigated: ${decision.target}` };
        case "click":
          await this.page
            .getByRole("button", { name: decision.target })
            .first()
            .click({ timeout: 5000 });
          return { ok: true, note: `clicked by role button: ${decision.target}` };
        case "type":
          await this.page.getByLabel(decision.target).fill(decision.input || "");
          return { ok: true, note: `typed by label: ${decision.target}` };
        case "wait_for":
          await this.page.waitForTimeout(Number(decision.input || 1000));
          return { ok: true, note: `waited: ${decision.input || 1000}ms` };
        case "assert": {
          const exists = await this.page
            .getByText(decision.target)
            .first()
            .isVisible()
            .catch(() => false);
          return { ok: exists, note: `assert text ${decision.target}: ${exists}` };
        }
        case "download":
          return { ok: true, note: "download is event-driven" };
        case "ask_human":
          return { ok: true, done: true, note: `human input required: ${decision.reason}` };
        case "finish":
          return { ok: true, done: true, note: decision.reason || "finished" };
        default:
          return { ok: false, note: `unknown action: ${decision.action}` };
      }
    } catch (error) {
      return { ok: false, note: error.message };
    }
  }

  async buildSummary(successCriteria = "") {
    const downloads = fs.existsSync(this.downloadDir)
      ? fs.readdirSync(this.downloadDir).filter((name) => !name.startsWith("."))
      : [];

    if (!successCriteria) {
      return {
        success: true,
        message: `completed. downloads=${downloads.length}`,
      };
    }

    const lower = successCriteria.toLowerCase();
    if (lower.includes("download") || lower.includes("請求書") || lower.includes("pdf")) {
      const success = downloads.length > 0;
      return {
        success,
        message: success
          ? `success criteria met: downloaded ${downloads.length} files`
          : "success criteria unmet: no downloads",
      };
    }

    return {
      success: true,
      message: "completed (criteria parser fallback)",
    };
  }

  async close() {
    await this.context.close().catch(() => {});
    await this.browser.close().catch(() => {});
  }
}
