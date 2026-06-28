import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { collectGitStatus, createRunConfig, submitRun } from "../src/evidence.js";
import type { TraceTurn } from "../src/types.js";
import { createTempGitRepo } from "./helpers.js";

test("submit passes when trace exists and configured check succeeds", async (t) => {
  const repoPath = await createTempGitRepo(t, { checkCommand: "true" });
  const config = await createRunConfig(repoPath, "/tmp/pi-session.jsonl", "pass-run");

  const result = await submitRun(config, [traceTurn()]);

  assert.equal(result.decision, "pass");
  assert.equal(result.reason, "Configured check passed with exit code 0.");

  const submitChecks = JSON.parse(await readFile(path.join(config.runPath, "checks", "submit-checks.json"), "utf8"));
  assert.equal(submitChecks.decision, "pass");
  assert.equal(submitChecks.turns, 1);
  assert.equal(submitChecks.check.result.exitCode, 0);

  const turns = await readFile(path.join(config.runPath, "trace", "turns.jsonl"), "utf8");
  assert.match(turns, /"userPrompt":"Inspect the code"/);
  assert.match(await readFile(path.join(config.runPath, "trace", "transcript.md"), "utf8"), /### Pi\n\nLooks good/);
  assert.match(await readFile(path.join(config.runPath, "summary.md"), "utf8"), /Submit decision: `pass`/);

  const gitStatus = await collectGitStatus(repoPath);
  assert.equal(gitStatus.stdout, "", "evidence stored under .git must not pollute git status");
  assert.match(config.runPath, /\.git[/\\]agent-harness-runs[/\\]pass-run$/);
});

test("submit rejects when trace exists and configured check fails", async (t) => {
  const repoPath = await createTempGitRepo(t, { checkCommand: "false" });
  const config = await createRunConfig(repoPath, "/tmp/pi-session.jsonl", "reject-run");

  const result = await submitRun(config, [traceTurn()]);

  assert.equal(result.decision, "reject");
  assert.equal(result.reason, "Configured check failed with exit code 1.");

  const submitChecks = JSON.parse(await readFile(path.join(config.runPath, "checks", "submit-checks.json"), "utf8"));
  assert.equal(submitChecks.decision, "reject");
  assert.equal(submitChecks.check.result.exitCode, 1);
});

test("submit blocks when no Pi trace was captured", async (t) => {
  const repoPath = await createTempGitRepo(t, { checkCommand: "true" });
  const config = await createRunConfig(repoPath, "/tmp/pi-session.jsonl", "blocked-no-trace");

  const result = await submitRun(config, []);

  assert.equal(result.decision, "blocked");
  assert.equal(result.reason, "No Pi turn was captured, so submit cannot produce interaction evidence.");
  assert.match(await readFile(path.join(config.runPath, "trace", "transcript.md"), "utf8"), /No Pi interaction trace captured/);
});

test("submit blocks when no configured check exists", async (t) => {
  const repoPath = await createTempGitRepo(t);
  const config = await createRunConfig(repoPath, "/tmp/pi-session.jsonl", "blocked-no-check");

  const result = await submitRun(config, [traceTurn()]);

  assert.equal(result.decision, "blocked");
  assert.equal(result.reason, "No .agent-harness.json checkCommand is configured.");

  const testOutput = await readFile(path.join(config.runPath, "checks", "test-output.txt"), "utf8");
  assert.equal(testOutput, "No configured check command.\n");
});

test("submit captures final git status and diff for user changes", async (t) => {
  const repoPath = await createTempGitRepo(t, { checkCommand: "true" });
  await writeFile(path.join(repoPath, "README.md"), "# test repo\n\nchanged\n");
  const config = await createRunConfig(repoPath, "/tmp/pi-session.jsonl", "diff-run");

  const result = await submitRun(config, [traceTurn()]);

  assert.equal(result.decision, "pass");
  assert.match(await readFile(path.join(config.runPath, "changes", "final.diff"), "utf8"), /\+changed/);

  const fileStatus = JSON.parse(await readFile(path.join(config.runPath, "changes", "file-status.json"), "utf8"));
  assert.deepEqual(fileStatus.status, [{ status: "M", path: "README.md" }]);
});

test("creating run config outside git fails before writing evidence", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "agent-harness-no-git-"));
  t.after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  await assert.rejects(
    () => createRunConfig(dir, "/tmp/pi-session.jsonl", "no-git"),
    /agent-harness requires a git repository/,
  );
});

function traceTurn(overrides: Partial<TraceTurn> = {}): TraceTurn {
  return {
    turn: 1,
    timestamp: "2026-06-27T23:01:17.910Z",
    userPrompt: "Inspect the code",
    assistantText: "Looks good",
    gitStatusAfterTurn: "",
    diffAfterTurn: "",
    ...overrides,
  };
}
