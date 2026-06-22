import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { appendTraceTurn, collectGitDiff, collectGitStatus, readTurnCount, submitRun } from "./evidence.js";
import { PiRuntime } from "./pi-runtime.js";
import { createRunConfig } from "./workspace.js";
import type { RunConfig, RuntimeStatus } from "./types.js";

type AskCommandResult = {
  runtimeStatus: RuntimeStatus;
  traceRecorded: boolean;
};

export async function runInteractivePi(codebaseArg: string, repoRoot: string): Promise<void> {
  const config = await createRunConfig(codebaseArg, repoRoot);
  const runtime = await PiRuntime.create(config.workspacePath);
  let runtimeStatus = runtime.status;
  let submitted = false;

  output.write(`Run: ${config.runId}\n`);
  output.write(`Workspace: ${config.workspacePath}\n`);
  if (!runtime.status.available) {
    output.write(`Pi unavailable: ${runtime.status.humanAction ?? runtime.status.detail}\n`);
    await submitRun(config, runtimeStatus);
    output.write(`Blocked evidence bundle: ${config.runPath}\n`);
    return;
  }

  const rl = readline.createInterface({ input, output });
  try {
    for (;;) {
      const rawLine = await readLine(rl);
      if (rawLine === undefined) {
        output.write(submitted ? "Session ended.\n" : "Session ended without submit.\n");
        return;
      }
      const line = rawLine.trim();
      if (!line) {
        continue;
      }

      if (line === "exit") {
        output.write(submitted ? "Session ended.\n" : "Session ended without submit.\n");
        return;
      }

      if (line === "status") {
        await printStatus(config);
        continue;
      }

      if (line === "submit") {
        const result = await submitRun(config, runtimeStatus);
        submitted = true;
        output.write(`Submit decision: ${result.decision}\n`);
        output.write(`Summary: ${config.runPath}/summary.md\n`);
        continue;
      }

      if (line.startsWith("ask ")) {
        const prompt = line.slice("ask ".length).trim();
        if (!prompt) {
          output.write("Usage: ask <prompt>\n");
          continue;
        }
        const askResult = await ask(runtime, config, prompt);
        runtimeStatus = askResult.runtimeStatus;
        if (!runtimeStatus.available || runtimeStatus.locallyAuthenticatedModelStatus === "unavailable") {
          const result = await submitRun(config, runtimeStatus);
          output.write(`Pi unavailable: ${runtimeStatus.humanAction ?? runtimeStatus.detail}\n`);
          output.write(`Submit decision: ${result.decision}\n`);
          output.write(`Blocked evidence bundle: ${config.runPath}\n`);
          return;
        }
        if (!askResult.traceRecorded) {
          const result = await submitRun(config, runtimeStatus);
          output.write(`${runtimeStatus.detail}\n`);
          output.write(`Submit decision: ${result.decision}\n`);
          output.write(`Blocked evidence bundle: ${config.runPath}\n`);
          return;
        }
        continue;
      }

      output.write("Commands: ask <prompt>, status, submit, exit\n");
    }
  } finally {
    rl.close();
  }
}

async function readLine(rl: readline.Interface): Promise<string | undefined> {
  try {
    return await rl.question("> ");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("readline was closed")) {
      return undefined;
    }
    throw error;
  }
}

async function ask(runtime: PiRuntime, config: RunConfig, prompt: string): Promise<AskCommandResult> {
  const turn = (await readTurnCount(config)) + 1;
  const result = await runtime.ask(buildHarnessPrompt(config.workspacePath, prompt)).catch((error) => {
    return PiRuntime.statusForInteractionError(error);
  });
  if ("available" in result) {
    return { runtimeStatus: result, traceRecorded: false };
  }
  if (result.status === "trace-too-thin") {
    return {
      runtimeStatus: {
        available: true,
        locallyAuthenticatedModelStatus: "available",
        detail: result.detail,
        humanAction: "Inspect Pi SDK event capture before treating this run as valid evidence.",
      },
      traceRecorded: false,
    };
  }

  const runtimeStatus: RuntimeStatus = {
    available: true,
    locallyAuthenticatedModelStatus: "available",
    detail: "Pi prompt completed successfully through the harness.",
  };

  const gitStatus = await collectGitStatus(config.workspacePath);
  const gitDiff = await collectGitDiff(config.workspacePath);

  await appendTraceTurn(config, {
    turn,
    timestamp: new Date().toISOString(),
    userPrompt: prompt,
    assistantText: result.assistantText,
    eventsCount: result.eventsCount,
    gitStatusAfterTurn: gitStatus.stdout || gitStatus.stderr || gitStatus.error || "",
    diffAfterTurn: gitDiff.stdout || gitDiff.stderr || gitDiff.error || "",
  });

  output.write(`${result.assistantText}\n`);
  output.write(`Turn ${turn} recorded in ${config.runPath}/trace/turns.jsonl\n`);
  return { runtimeStatus, traceRecorded: true };
}

async function printStatus(config: RunConfig): Promise<void> {
  const gitStatus = await collectGitStatus(config.workspacePath);
  const turns = await readTurnCount(config);
  output.write(`Run: ${config.runId}\n`);
  output.write(`Workspace: ${config.workspacePath}\n`);
  output.write(`Turns: ${turns}\n`);
  output.write(`Git status:\n${gitStatus.stdout || "<clean>"}\n`);
}

function buildHarnessPrompt(workspacePath: string, prompt: string): string {
  return [
    "You are running inside agent-harness interactive-pi.",
    `Work only inside this copied workspace: ${workspacePath}`,
    "Do not mutate the original source codebase.",
    "Answer the user request below and make code changes only when asked.",
    "",
    prompt,
  ].join("\n");
}
