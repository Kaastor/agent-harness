import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { TestContext } from "node:test";
import { runCommand } from "../src/command.js";

type RepoOptions = {
  checkCommand?: string;
};

export async function createTempGitRepo(t: TestContext, options: RepoOptions = {}): Promise<string> {
  const repoPath = await mkdtemp(path.join(os.tmpdir(), "agent-harness-test-"));
  t.after(async () => {
    await rm(repoPath, { recursive: true, force: true });
  });

  await writeFile(path.join(repoPath, "README.md"), "# test repo\n");
  if (options.checkCommand !== undefined) {
    await writeFile(
      path.join(repoPath, ".agent-harness.json"),
      `${JSON.stringify({ checkCommand: options.checkCommand }, null, 2)}\n`,
    );
  }

  await mustRun("git", ["init", "-b", "main"], repoPath);
  await mustRun("git", ["add", "-A"], repoPath);
  await mustRun(
    "git",
    ["-c", "user.name=agent-harness-test", "-c", "user.email=test@example.invalid", "commit", "-m", "baseline"],
    repoPath,
  );

  return repoPath;
}

export async function mustRun(command: string, args: string[], cwd: string): Promise<void> {
  const result = await runCommand(command, args, cwd);
  assert.equal(result.exitCode, 0, `${result.command}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
}
