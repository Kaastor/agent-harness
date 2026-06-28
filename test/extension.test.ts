import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import type { TraceTurn } from "../src/types.js";
import { createTempGitRepo } from "./helpers.js";

type RegisteredCommand = {
  description?: string;
  handler: (args: string, ctx: FakeCommandContext) => Promise<void>;
};

type EventHandler = (event: Record<string, unknown>, ctx: FakeCommandContext) => Promise<void>;

class FakePi {
  readonly commands = new Map<string, RegisteredCommand>();
  readonly handlers = new Map<string, EventHandler[]>();
  readonly entries: SessionEntry[] = [];
  private nextEntryId = 1;

  on(event: string, handler: EventHandler): void {
    const handlers = this.handlers.get(event) ?? [];
    handlers.push(handler);
    this.handlers.set(event, handlers);
  }

  registerCommand(name: string, command: RegisteredCommand): void {
    this.commands.set(name, command);
  }

  appendEntry(customType: string, data?: unknown): void {
    this.entries.push({
      type: "custom",
      id: `custom-${this.nextEntryId++}`,
      parentId: null,
      timestamp: new Date().toISOString(),
      customType,
      data,
    });
  }

  async emit(event: string, payload: Record<string, unknown>, ctx: FakeCommandContext): Promise<void> {
    for (const handler of this.handlers.get(event) ?? []) {
      await handler(payload, ctx);
    }
  }
}

class FakeCommandContext {
  readonly mode = "print";
  readonly hasUI = true;
  readonly notifications: Array<{ message: string; type?: "info" | "warning" | "error" }> = [];
  waitForIdleCalled = false;

  readonly ui = {
    notify: (message: string, type?: "info" | "warning" | "error") => {
      this.notifications.push({ message, type });
    },
  };

  readonly sessionManager = {
    getEntries: () => this.pi.entries,
    getSessionFile: () => path.join(this.cwd, ".pi-session.jsonl"),
  };

  constructor(
    readonly cwd: string,
    private readonly pi: FakePi,
  ) {}

  async waitForIdle(): Promise<void> {
    this.waitForIdleCalled = true;
  }
}

test("extension registers submit and status commands", async () => {
  const { pi } = await loadHarness();

  assert.ok(pi.commands.has("submit"));
  assert.ok(pi.commands.has("harness-status"));
  assert.ok(pi.handlers.has("before_agent_start"));
  assert.ok(pi.handlers.has("agent_end"));
});

test("extension captures Q/A trace and submit writes passing evidence", async (t) => {
  const repoPath = await createTempGitRepo(t, { checkCommand: "true" });
  const { pi } = await loadHarness();
  const ctx = new FakeCommandContext(repoPath, pi);

  await pi.emit("before_agent_start", { prompt: "What changed?" }, ctx);
  await pi.emit(
    "agent_end",
    {
      messages: [
        {
          role: "assistant",
          content: [{ type: "text", text: "Nothing changed." }],
        },
      ],
    },
    ctx,
  );

  assert.equal(pi.entries.length, 1);
  const traceData = pi.entries[0].type === "custom" ? pi.entries[0].data as { turn: TraceTurn; runId: string } : undefined;
  assert.ok(traceData);
  assert.equal(traceData.turn.turn, 1);
  assert.equal(traceData.turn.userPrompt, "What changed?");
  assert.equal(traceData.turn.assistantText, "Nothing changed.");

  await pi.commands.get("submit")?.handler("", ctx);

  assert.equal(ctx.waitForIdleCalled, true);
  assert.equal(ctx.notifications.at(-1)?.type, "info");
  assert.match(ctx.notifications.at(-1)?.message ?? "", /agent-harness \/submit: pass/);

  const summaryPath = path.join(repoPath, ".git", "agent-harness-runs", traceData.runId, "summary.md");
  assert.match(await readFile(summaryPath, "utf8"), /Submit decision: `pass`/);
  assert.match(await readFile(path.join(repoPath, ".git", "agent-harness-runs", traceData.runId, "trace", "turns.jsonl"), "utf8"), /What changed\?/);
});

test("extension orders multiple turns and harness-status reports trace count", async (t) => {
  const repoPath = await createTempGitRepo(t, { checkCommand: "true" });
  const { pi } = await loadHarness();
  const ctx = new FakeCommandContext(repoPath, pi);

  await emitTurn(pi, ctx, "first prompt", "first answer");
  await emitTurn(pi, ctx, "second prompt", "second answer");

  const turns = pi.entries
    .map((entry) => entry.type === "custom" ? entry.data as { turn: TraceTurn } : undefined)
    .filter((entry) => entry !== undefined)
    .map((entry) => entry.turn);

  assert.deepEqual(turns.map((turn) => turn.turn), [1, 2]);
  assert.deepEqual(turns.map((turn) => turn.userPrompt), ["first prompt", "second prompt"]);

  await pi.commands.get("harness-status")?.handler("", ctx);
  assert.match(ctx.notifications.at(-1)?.message ?? "", /2 traced turn\(s\)/);
});

test("extension ignores agent_end without a matching user prompt", async (t) => {
  const repoPath = await createTempGitRepo(t, { checkCommand: "true" });
  const { pi } = await loadHarness();
  const ctx = new FakeCommandContext(repoPath, pi);

  await pi.emit("agent_end", { messages: [{ role: "assistant", content: "orphan response" }] }, ctx);

  assert.equal(pi.entries.length, 0);
});

async function emitTurn(pi: FakePi, ctx: FakeCommandContext, prompt: string, answer: string): Promise<void> {
  await pi.emit("before_agent_start", { prompt }, ctx);
  await pi.emit("agent_end", { messages: [{ role: "assistant", content: answer }] }, ctx);
}

async function loadHarness(): Promise<{ pi: FakePi }> {
  const url = new URL("../src/extension.ts", import.meta.url);
  url.searchParams.set("test", randomUUID());
  const extension = (await import(url.href)).default as (pi: unknown) => void;
  const pi = new FakePi();
  extension(pi);
  return { pi };
}
