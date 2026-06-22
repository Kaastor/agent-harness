import { cp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { runCommand } from "./command.js";
import type { RunConfig, SessionConfig } from "./types.js";

const DEFAULT_CHECK_CONFIG = ".agent-harness.json";

export async function createRunConfig(codebaseArg: string, repoRoot: string): Promise<RunConfig> {
  const sourceCodebasePath = path.resolve(repoRoot, codebaseArg);
  const sourceStat = await stat(sourceCodebasePath);
  if (!sourceStat.isDirectory()) {
    throw new Error(`Codebase path is not a directory: ${sourceCodebasePath}`);
  }

  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const runPath = path.join(repoRoot, "runs", runId);
  const workspacePath = path.join(runPath, "workspace");
  const sessionConfig = await readSessionConfig(sourceCodebasePath);

  await mkdir(path.join(runPath, "input"), { recursive: true });
  await mkdir(path.join(runPath, "trace"), { recursive: true });
  await mkdir(path.join(runPath, "changes"), { recursive: true });
  await mkdir(path.join(runPath, "checks"), { recursive: true });

  await cp(sourceCodebasePath, workspacePath, {
    recursive: true,
    filter: (source) => shouldCopy(source, sourceCodebasePath),
  });

  const config: RunConfig = {
    runId,
    sourceCodebasePath,
    runPath,
    workspacePath,
    sessionConfig,
  };

  await writeInputArtifacts(config);
  await initializeWorkspaceGit(workspacePath);
  return config;
}

async function readSessionConfig(sourceCodebasePath: string): Promise<SessionConfig> {
  const configPath = path.join(sourceCodebasePath, DEFAULT_CHECK_CONFIG);
  const baseConfig: SessionConfig = {
    runtime: "pi",
    startedAt: new Date().toISOString(),
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

function shouldCopy(source: string, sourceCodebasePath: string): boolean {
  const relative = path.relative(sourceCodebasePath, source);
  if (!relative) {
    return true;
  }

  const parts = relative.split(path.sep);
  return !parts.some((part) => part === ".git" || part === "node_modules" || part === "runs" || part === ".DS_Store");
}

async function writeInputArtifacts(config: RunConfig): Promise<void> {
  await writeFile(
    path.join(config.runPath, "input", "codebase-path.json"),
    `${JSON.stringify(
      {
        sourceCodebasePath: config.sourceCodebasePath,
        workspacePath: config.workspacePath,
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    path.join(config.runPath, "input", "session-config.json"),
    `${JSON.stringify(config.sessionConfig, null, 2)}\n`,
  );
}

async function initializeWorkspaceGit(workspacePath: string): Promise<void> {
  const init = await runCommand("git", ["init"], workspacePath);
  if (init.exitCode !== 0) {
    throw new Error(`Could not initialize workspace git repository: ${init.stderr || init.error || init.stdout}`);
  }

  await runCommand("git", ["add", "-A"], workspacePath);
  const commit = await runCommand(
    "git",
    [
      "-c",
      "user.name=agent-harness",
      "-c",
      "user.email=agent-harness@example.invalid",
      "commit",
      "-m",
      "agent-harness baseline",
      "--allow-empty",
    ],
    workspacePath,
  );
  if (commit.exitCode !== 0) {
    throw new Error(`Could not commit workspace baseline: ${commit.stderr || commit.error || commit.stdout}`);
  }
}
