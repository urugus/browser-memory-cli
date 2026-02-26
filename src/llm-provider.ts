import { spawnSync } from "node:child_process";

export class ClaudeCliProvider {
  constructor(options = {}) {
    this.command = options.command || process.env.BROWSER_MEMORY_CLAUDE_CMD || "claude";
    this.timeoutMs = Number(options.timeoutMs || 90_000);
  }

  planNextAction(payload) {
    const schema = {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: [
            "navigate",
            "click",
            "type",
            "wait_for",
            "assert",
            "download",
            "finish",
            "ask_human",
          ],
        },
        target: { type: "string" },
        input: { type: "string" },
        reason: { type: "string" },
        confidence: { type: "number" },
        fallbackPlan: { type: "string" },
      },
      required: ["action", "reason"],
    };

    const prompt = buildActionPrompt(payload);
    const result = this.invokeClaude(prompt, schema);
    if (result.ok) {
      return result.data;
    }

    return heuristicFallback(payload, result.error);
  }

  proposePromptPatch(payload) {
    const schema = {
      type: "object",
      properties: {
        summary: { type: "string" },
        proposedPromptTemplate: { type: "string" },
        rationale: { type: "string" },
      },
      required: ["summary", "proposedPromptTemplate", "rationale"],
    };

    const prompt = buildTunePrompt(payload);
    const result = this.invokeClaude(prompt, schema);
    if (result.ok) {
      return result.data;
    }

    return {
      summary: "Claude CLI呼び出しに失敗したため、ヒューリスティックな改善提案を返しました。",
      proposedPromptTemplate: `${payload.promptTemplate}\n- 失敗時は見出し語(請求書/Invoice/ダウンロード)に基づき再探索する。`,
      rationale: `fallback: ${result.error}`,
    };
  }

  invokeClaude(prompt, schema) {
    const args = [
      "-p",
      prompt,
      "--output-format",
      "json",
      "--json-schema",
      JSON.stringify(schema),
      "--permission-mode",
      "bypassPermissions",
    ];

    const proc = spawnSync(this.command, args, {
      encoding: "utf8",
      timeout: this.timeoutMs,
      maxBuffer: 2 * 1024 * 1024,
    });

    if (proc.error) {
      return { ok: false, error: proc.error.message };
    }
    if (proc.status !== 0) {
      return {
        ok: false,
        error: `claude exited with status=${proc.status}, stderr=${(proc.stderr || "").slice(0, 300)}`,
      };
    }

    try {
      const parsed = JSON.parse(proc.stdout);
      return { ok: true, data: parsed };
    } catch {
      return { ok: false, error: `invalid JSON response: ${(proc.stdout || "").slice(0, 200)}` };
    }
  }
}

const buildActionPrompt = (payload) => {
  return [
    payload.promptTemplate,
    "",
    "# Workflow",
    JSON.stringify(payload.workflow, null, 2),
    "",
    "# Current Context",
    JSON.stringify(payload.context, null, 2),
    "",
    "次の1アクションのみ返してください。",
  ].join("\n");
};

const buildTunePrompt = (payload) => {
  return [
    "あなたはワークフロープロンプト改善エンジンです。",
    "実行ログと訂正を見て、次回成功率を上げるための prompt template を全文で返してください。",
    "",
    "# Existing prompt",
    payload.promptTemplate,
    "",
    "# Run summary",
    payload.runSummary,
    "",
    "# Corrections",
    JSON.stringify(payload.corrections, null, 2),
  ].join("\n");
};

const heuristicFallback = (payload, error) => {
  const step = payload.context.stepIndex + 1;
  if (step === 1 && payload.context.currentUrl !== payload.workflow.startUrl) {
    return {
      action: "navigate",
      target: payload.workflow.startUrl || "",
      reason: `初手は開始URLに移動する fallback (${error})`,
      confidence: 0.2,
      fallbackPlan: "ページロード後に主要リンクを再探索",
    };
  }
  return {
    action: "ask_human",
    reason: `判断不能のため人手確認 (${error})`,
    confidence: 0.1,
    fallbackPlan: "run correct で補正を登録",
  };
};
