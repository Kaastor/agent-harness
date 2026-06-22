import { appendFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { runCommand, runShellCommand } from "./command.js";
import type { CommandResult } from "./command.js";
import type { RunConfig, RuntimeStatus, SubmitDecision, SubmitResult, TraceTurn } from "./types.js";

const SUBMIT_CHECK_TIMEOUT_MS = 120_000;
const SUBMIT_CHECK_OUTPUT_LIMIT_BYTES = 200_000;

export async function appendTraceTurn(config: RunConfig, turn: TraceTurn): Promise<void> {
  await appendFile(path.join(config.runPath, "trace", "turns.jsonl"), `${JSON.stringify(turn)}\n`);
  await appendFile(
    path.join(config.runPath, "trace", "transcript.md"),
    [
      `## Turn ${turn.turn}`,
      "",
      "### User",
      "",
      turn.userPrompt,
      "",
      "### Pi",
      "",
      turn.assistantText || "<empty response>",
      "",
    ].join("\n"),
  );
}

export async function readTurnCount(config: RunConfig): Promise<number> {
  try {
    const content = await readFile(path.join(config.runPath, "trace", "turns.jsonl"), "utf8");
    return content.split("\n").filter(Boolean).length;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return 0;
    }
    throw error;
  }
}

export async function collectGitStatus(workspacePath: string) {
  return runCommand("git", ["status", "--short"], workspacePath);
}

export async function collectGitDiff(workspacePath: string) {
  return runCommand("git", ["diff", "--binary"], workspacePath);
}

export async function submitRun(config: RunConfig, runtimeStatus: RuntimeStatus): Promise<SubmitResult> {
  const turns = await readTurnCount(config);
  const gitStatus = await collectGitStatus(config.workspacePath);
  const gitDiff = await collectGitDiff(config.workspacePath);
  const checkCommand = config.sessionConfig.checkCommand;
  const check = checkCommand
    ? {
        command: checkCommand,
        result: await runShellCommand(checkCommand, config.workspacePath, {
          timeoutMs: SUBMIT_CHECK_TIMEOUT_MS,
          outputLimitBytes: SUBMIT_CHECK_OUTPUT_LIMIT_BYTES,
        }),
      }
    : undefined;

  const decision = decideSubmit({
    runtimeStatus,
    turns,
    checkResult: check?.result,
  });
  const result: SubmitResult = {
    decision,
    reason: explainDecision(
      decision,
      runtimeStatus,
      turns,
      check?.result.exitCode,
      Boolean(checkCommand),
      Boolean(check?.result.timedOut),
    ),
    gitStatus,
    gitDiff,
    check,
    turns,
    runtimeStatus,
  };

  await writeSubmitArtifacts(config, result);
  return result;
}

async function writeSubmitArtifacts(config: RunConfig, result: SubmitResult): Promise<void> {
  await writeFile(path.join(config.runPath, "changes", "final.diff"), result.gitDiff.stdout);
  await writeFile(
    path.join(config.runPath, "changes", "file-status.json"),
    `${JSON.stringify(
      {
        status: result.gitStatus.stdout
          .split("\n")
          .filter(Boolean)
          .map((line) => parseGitStatusLine(line)),
        rawGitStatus: result.gitStatus,
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    path.join(config.runPath, "checks", "submit-checks.json"),
    `${JSON.stringify(
      {
        decision: result.decision,
        reason: result.reason,
        runtimeStatus: result.runtimeStatus,
        turns: result.turns,
        check: result.check ?? null,
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(path.join(config.runPath, "checks", "test-output.txt"), renderCheckOutput(result));
  await writeFile(path.join(config.runPath, "summary.md"), renderSummary(config, result));
}

function decideSubmit(input: {
  runtimeStatus: RuntimeStatus;
  turns: number;
  checkResult?: CommandResult;
}): SubmitDecision {
  if (!input.runtimeStatus.available || input.runtimeStatus.locallyAuthenticatedModelStatus === "unavailable") {
    return "blocked";
  }
  if (input.turns === 0) {
    return "blocked";
  }
  if (input.checkResult?.timedOut) {
    return "blocked";
  }
  if (input.checkResult?.exitCode === 0) {
    return "ready";
  }
  if (input.checkResult !== undefined) {
    return "needs-retry";
  }
  if (input.turns > 0) {
    return "human-review-needed";
  }
  return "blocked";
}

function explainDecision(
  decision: SubmitDecision,
  runtimeStatus: RuntimeStatus,
  turns: number,
  checkExitCode: number | null | undefined,
  hasConfiguredCheck: boolean,
  checkTimedOut: boolean,
): string {
  if (decision === "blocked") {
    if (runtimeStatus.available && runtimeStatus.locallyAuthenticatedModelStatus === "available" && checkTimedOut) {
      return "Configured check timed out before submit could make a retry decision.";
    }
    if (!runtimeStatus.available || runtimeStatus.locallyAuthenticatedModelStatus === "unavailable") {
      if (turns === 0 && !runtimeStatus.humanAction) {
        return "No Pi turn was captured, so submit cannot produce interaction evidence.";
      }
      return runtimeStatus.humanAction ?? runtimeStatus.detail;
    }
    return "No Pi turn was captured, so submit cannot produce interaction evidence.";
  }
  if (decision === "ready") {
    return `Configured check passed with exit code ${checkExitCode}.`;
  }
  if (decision === "needs-retry") {
    return `Configured check failed with exit code ${checkExitCode}.`;
  }
  if (!hasConfiguredCheck && turns > 0) {
    return "No configured check exists, but trace and diff evidence were captured.";
  }
  return "Submit decision requires human review.";
}

function parseGitStatusLine(line: string): { status: string; path: string } {
  return {
    status: line.slice(0, 2).trim(),
    path: line.slice(3),
  };
}

function renderCheckOutput(result: SubmitResult): string {
  if (!result.check) {
    return "No configured check command.\n";
  }

  return [
    `$ ${result.check.result.command}`,
    `exit: ${result.check.result.exitCode}`,
    "stdout:",
    result.check.result.stdout || "<empty>",
    "stderr:",
    result.check.result.stderr || "<empty>",
    result.check.result.timedOut ? `timed out: true` : "timed out: false",
    result.check.result.truncated ? `output truncated: true` : "output truncated: false",
    "",
  ].join("\n");
}

function renderSummary(config: RunConfig, result: SubmitResult): string {
  const changedFiles = result.gitStatus.stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => `- \`${line}\``);

  return [
    "# Pi Interactive Harness Summary",
    "",
    `Run id: \`${config.runId}\``,
    `Runtime: \`${config.sessionConfig.runtime}\``,
    `Pi SDK available: \`${result.runtimeStatus.available}\``,
    `Locally authenticated model status: \`${result.runtimeStatus.locallyAuthenticatedModelStatus}\``,
    `Workspace: \`${config.workspacePath}\``,
    `Turns: \`${result.turns}\``,
    `Submit decision: \`${result.decision}\``,
    `Reason: ${result.reason}`,
    "",
    "## Files Changed",
    "",
    ...(changedFiles.length > 0 ? changedFiles : ["No changed files reported by git status."]),
    "",
    "## Checks",
    "",
    result.check
      ? `- Command: \`${result.check.command}\``
      : "- Command: `not configured`",
    result.check
      ? `- Exit code: \`${result.check.result.exitCode}\``
      : "- Exit code: `not run`",
    result.check
      ? `- Timed out: \`${Boolean(result.check.result.timedOut)}\``
      : "- Timed out: `not run`",
    result.check
      ? `- Output truncated: \`${Boolean(result.check.result.truncated)}\``
      : "- Output truncated: `not run`",
    "",
    "## Evidence",
    "",
    "- `input/codebase-path.json` records original and copied workspace paths.",
    "- `input/session-config.json` records runtime and configured check command.",
    "- `trace/turns.jsonl` records harness-mediated Q/A turns when Pi is available.",
    "- `trace/transcript.md` records a readable transcript when Pi is available.",
    "- `changes/final.diff` records final workspace diff.",
    "- `changes/file-status.json` records final git status.",
    "- `checks/submit-checks.json` records the deterministic submit decision and its inputs.",
    "- `checks/test-output.txt` records configured check output when present.",
    "",
    "## Human Action",
    "",
    result.runtimeStatus.humanAction ? `Required: ${result.runtimeStatus.humanAction}` : "None recorded by the harness.",
    "",
  ].join("\n");
}
