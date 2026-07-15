import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { runCommand, runShellCommand } from "./command.js";
import type { CommandResult } from "./command.js";
import type { RunConfig, SessionConfig, SubmitDecision, SubmitResult, TraceTurn } from "./types.js";

const SUBMIT_CHECK_TIMEOUT_MS = 120_000;
const SUBMIT_CHECK_OUTPUT_LIMIT_BYTES = 200_000;
const DEFAULT_CHECK_CONFIG = ".agent-harness.json";

export async function createRunConfig(cwd: string, piSessionFile?: string, runId = createRunId()): Promise<RunConfig> {
  const evidenceRoot = await resolveEvidenceRoot(cwd);
  const runPath = path.join(evidenceRoot, runId);
  const sessionConfig = await readSessionConfig(cwd, piSessionFile);
  const config: RunConfig = {
    runId,
    runPath,
    cwd,
    sessionConfig,
  };

  await mkdir(path.join(runPath, "input"), { recursive: true });
  await mkdir(path.join(runPath, "trace"), { recursive: true });
  await mkdir(path.join(runPath, "changes"), { recursive: true });
  await mkdir(path.join(runPath, "checks"), { recursive: true });
  await writeInputArtifacts(config);
  return config;
}

async function resolveEvidenceRoot(cwd: string): Promise<string> {
  const gitPath = await runCommand("git", ["rev-parse", "--git-path", "agent-harness-runs"], cwd);
  if (gitPath.exitCode === 0 && gitPath.stdout.trim()) {
    const resolvedPath = gitPath.stdout.trim();
    return path.isAbsolute(resolvedPath) ? resolvedPath : path.resolve(cwd, resolvedPath);
  }

  throw new Error(`agent-harness requires a git repository: ${gitPath.stderr || gitPath.error || "git rev-parse failed"}`);
}

export async function collectGitStatus(cwd: string) {
  return runCommand("git", ["status", "--short"], cwd);
}

export async function collectGitDiff(cwd: string) {
  return runCommand("git", ["diff", "--binary"], cwd);
}

export async function submitRun(config: RunConfig, traceTurns: TraceTurn[]): Promise<SubmitResult> {
  const gitStatus = await collectGitStatus(config.cwd);
  const gitDiff = await collectGitDiff(config.cwd);
  const checkCommand = config.sessionConfig.checkCommand;
  const check = checkCommand
    ? {
        command: checkCommand,
        result: await runShellCommand(checkCommand, config.cwd, {
          timeoutMs: SUBMIT_CHECK_TIMEOUT_MS,
          outputLimitBytes: SUBMIT_CHECK_OUTPUT_LIMIT_BYTES,
        }),
      }
    : undefined;

  const decision = decideSubmit({
    turns: traceTurns.length,
    checkResult: check?.result,
    hasConfiguredCheck: Boolean(checkCommand),
  });
  const result: SubmitResult = {
    decision,
    reason: explainDecision(decision, traceTurns.length, check?.result.exitCode, Boolean(checkCommand), Boolean(check?.result.timedOut)),
    gitStatus,
    gitDiff,
    check,
    turns: traceTurns.length,
  };

  await writeSubmitArtifacts(config, result, traceTurns);
  return result;
}

async function readSessionConfig(cwd: string, piSessionFile?: string): Promise<SessionConfig> {
  const configPath = path.join(cwd, DEFAULT_CHECK_CONFIG);
  const baseConfig: SessionConfig = {
    runtime: "pi-extension",
    startedAt: new Date().toISOString(),
    cwd,
    piSessionFile,
  };

  try {
    const parsed = JSON.parse(await readFile(configPath, "utf8")) as { checkCommand?: unknown };
    if (typeof parsed.checkCommand === "string" && parsed.checkCommand.trim()) {
      return { ...baseConfig, checkCommand: parsed.checkCommand.trim() };
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw new Error(`Could not read ${configPath}: ${(error as Error).message}`);
    }
  }

  return baseConfig;
}

async function writeInputArtifacts(config: RunConfig): Promise<void> {
  await writeFile(
    path.join(config.runPath, "input", "session-config.json"),
    `${JSON.stringify(config.sessionConfig, null, 2)}\n`,
  );
}

async function writeSubmitArtifacts(config: RunConfig, result: SubmitResult, traceTurns: TraceTurn[]): Promise<void> {
  await writeFile(
    path.join(config.runPath, "trace", "turns.jsonl"),
    traceTurns.map((turn) => JSON.stringify(turn)).join("\n") + (traceTurns.length > 0 ? "\n" : ""),
  );
  await writeFile(path.join(config.runPath, "trace", "transcript.md"), renderTranscript(traceTurns));
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
  turns: number;
  hasConfiguredCheck: boolean;
  checkResult?: CommandResult;
}): SubmitDecision {
  if (input.turns === 0) {
    return "blocked";
  }
  if (!input.hasConfiguredCheck) {
    return "blocked";
  }
  if (input.checkResult?.timedOut) {
    return "blocked";
  }
  if (input.checkResult?.exitCode === 0) {
    return "pass";
  }
  if (input.checkResult !== undefined) {
    return "reject";
  }
  return "blocked";
}

function explainDecision(
  decision: SubmitDecision,
  turns: number,
  checkExitCode: number | null | undefined,
  hasConfiguredCheck: boolean,
  checkTimedOut: boolean,
): string {
  if (decision === "blocked") {
    if (checkTimedOut) {
      return "Configured check timed out before submit could make a retry decision.";
    }
    if (turns === 0) {
      return "No Pi turn was captured, so submit cannot produce interaction evidence.";
    }
    if (!hasConfiguredCheck) {
      return "No .agent-harness.json checkCommand is configured.";
    }
    return "Submit could not produce a deterministic pass or reject decision.";
  }
  if (decision === "pass") {
    return `Configured check passed with exit code ${checkExitCode}.`;
  }
  if (decision === "reject") {
    return `Configured check failed with exit code ${checkExitCode}.`;
  }
  return "Submit decision is unknown.";
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

function renderTranscript(traceTurns: TraceTurn[]): string {
  if (traceTurns.length === 0) {
    return "No Pi interaction trace captured.\n";
  }

  return traceTurns
    .map((turn) =>
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
    )
    .join("\n");
}

function renderSummary(config: RunConfig, result: SubmitResult): string {
  const changedFiles = result.gitStatus.stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => `- \`${line}\``);

  return [
    "# Pi Extension Harness Summary",
    "",
    `Run id: \`${config.runId}\``,
    `Runtime: \`${config.sessionConfig.runtime}\``,
    `Cwd: \`${config.cwd}\``,
    `Pi session file: \`${config.sessionConfig.piSessionFile ?? "not persisted"}\``,
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
    "- `input/session-config.json` records runtime, cwd, Pi session file, and configured check command.",
    "- `trace/turns.jsonl` records Pi Q/A turns captured by the extension.",
    "- `trace/transcript.md` records a readable transcript.",
    "- `changes/final.diff` records final git diff.",
    "- `changes/file-status.json` records final git status.",
    "- `checks/submit-checks.json` records the deterministic submit decision and its inputs.",
    "- `checks/test-output.txt` records configured check output when present.",
    "",
  ].join("\n");
}

function createRunId(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}
