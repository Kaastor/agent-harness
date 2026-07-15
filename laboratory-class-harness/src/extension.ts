import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext, SessionEntry } from "@earendil-works/pi-coding-agent";
import { collectGitDiff, collectGitStatus, createRunConfig, submitRun } from "./evidence.js";
import type { RunConfig, TraceTurn } from "./types.js";

const TRACE_ENTRY_TYPE = "agent-harness.trace-turn";

type HarnessTraceData = {
  runId: string;
  cwd: string;
  turn: TraceTurn;
};

let activeRun: RunConfig | undefined;
let pendingPrompt: string | undefined;

export default function agentHarnessExtension(pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event, ctx) => {
    pendingPrompt = event.prompt;
    await ensureRun(ctx);
  });

  pi.on("agent_end", async (event, ctx) => {
    const run = await ensureRun(ctx);
    const prompt = pendingPrompt;
    pendingPrompt = undefined;
    if (!prompt) {
      return;
    }

    const existingTurns = collectTraceTurns(ctx.sessionManager.getEntries(), run.runId);
    const gitStatus = await collectGitStatus(ctx.cwd);
    const gitDiff = await collectGitDiff(ctx.cwd);
    const turn: TraceTurn = {
      turn: existingTurns.length + 1,
      timestamp: new Date().toISOString(),
      userPrompt: prompt,
      assistantText: latestAssistantText(event.messages),
      gitStatusAfterTurn: gitStatus.stdout || gitStatus.stderr || gitStatus.error || "",
      diffAfterTurn: gitDiff.stdout || gitDiff.stderr || gitDiff.error || "",
    };

    pi.appendEntry(TRACE_ENTRY_TYPE, {
      runId: run.runId,
      cwd: ctx.cwd,
      turn,
    });
  });

  pi.registerCommand("submit", {
    description: "Run the agent-harness submission gate and write evidence",
    handler: async (_args, ctx) => {
      await ctx.waitForIdle();
      const run = await ensureRun(ctx);
      const traceTurns = collectTraceTurns(ctx.sessionManager.getEntries(), run.runId);
      const result = await submitRun(run, traceTurns);
      const message = `agent-harness /submit: ${result.decision} (${result.reason})\n${run.runPath}/summary.md`;
      if (ctx.hasUI) {
        ctx.ui.notify(message, result.decision === "pass" ? "info" : "warning");
      } else {
        console.log(message);
      }
    },
  });

  pi.registerCommand("harness-status", {
    description: "Show current agent-harness run and trace state",
    handler: async (_args, ctx) => {
      const run = await ensureRun(ctx);
      const traceTurns = collectTraceTurns(ctx.sessionManager.getEntries(), run.runId);
      const message = `agent-harness run ${run.runId}: ${traceTurns.length} traced turn(s), cwd ${run.cwd}`;
      if (ctx.hasUI) {
        ctx.ui.notify(message, "info");
      } else {
        console.log(message);
      }
    },
  });
}

async function ensureRun(ctx: ExtensionContext | ExtensionCommandContext): Promise<RunConfig> {
  if (activeRun && activeRun.cwd === ctx.cwd) {
    return activeRun;
  }

  const existingRunId = latestTraceRunId(ctx.sessionManager.getEntries(), ctx.cwd);
  activeRun = await createRunConfig(ctx.cwd, ctx.sessionManager.getSessionFile(), existingRunId);
  return activeRun;
}

function latestTraceRunId(entries: SessionEntry[], cwd: string): string | undefined {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const data = harnessTraceData(entries[index]);
    if (!data) {
      continue;
    }
    if (data.cwd === cwd) {
      return data.runId;
    }
  }
  return undefined;
}

function collectTraceTurns(entries: SessionEntry[], runId: string): TraceTurn[] {
  return entries
    .map(harnessTraceData)
    .filter((data) => data !== undefined)
    .filter((data) => data.runId === runId)
    .map((data) => data.turn)
    .sort((left, right) => left.turn - right.turn);
}

function harnessTraceData(entry: SessionEntry): HarnessTraceData | undefined {
  if (entry.type !== "custom" || entry.customType !== TRACE_ENTRY_TYPE || !isTraceEntryData(entry.data)) {
    return undefined;
  }
  return entry.data;
}

function isTraceEntryData(data: unknown): data is HarnessTraceData {
  if (!data || typeof data !== "object") {
    return false;
  }
  const record = data as Record<string, unknown>;
  return typeof record.runId === "string" && typeof record.cwd === "string" && isTraceTurn(record.turn);
}

function isTraceTurn(data: unknown): data is TraceTurn {
  if (!data || typeof data !== "object") {
    return false;
  }
  const record = data as Record<string, unknown>;
  return (
    typeof record.turn === "number" &&
    typeof record.timestamp === "string" &&
    typeof record.userPrompt === "string" &&
    typeof record.assistantText === "string" &&
    typeof record.gitStatusAfterTurn === "string" &&
    typeof record.diffAfterTurn === "string"
  );
}

function latestAssistantText(messages: unknown[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index] as { role?: unknown; content?: unknown };
    if (message.role === "assistant") {
      return textFromContent(message.content);
    }
  }
  return "";
}

function textFromContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((item) => {
      if (!item || typeof item !== "object") {
        return "";
      }
      const record = item as Record<string, unknown>;
      return record.type === "text" && typeof record.text === "string" ? record.text : "";
    })
    .filter(Boolean)
    .join("\n");
}
