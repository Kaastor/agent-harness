import type { CommandResult } from "./command.js";

export type SubmitDecision = "pass" | "reject" | "blocked";

export type SessionConfig = {
  runtime: "pi-extension";
  checkCommand?: string;
  startedAt: string;
  cwd: string;
  piSessionFile?: string;
};

export type RunConfig = {
  runId: string;
  runPath: string;
  cwd: string;
  sessionConfig: SessionConfig;
};

export type TraceTurn = {
  turn: number;
  timestamp: string;
  userPrompt: string;
  assistantText: string;
  gitStatusAfterTurn: string;
  diffAfterTurn: string;
};

export type SubmitResult = {
  decision: SubmitDecision;
  reason: string;
  gitStatus: CommandResult;
  gitDiff: CommandResult;
  check?: {
    command: string;
    result: CommandResult;
  };
  turns: number;
};
