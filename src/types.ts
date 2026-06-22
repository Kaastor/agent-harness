import type { CommandResult } from "./command.js";

export type SubmitDecision = "ready" | "needs-retry" | "human-review-needed" | "blocked";
export type ModelAuthStatus = "unknown" | "available" | "unavailable";

export type SessionConfig = {
  runtime: "pi";
  checkCommand?: string;
  startedAt: string;
};

export type RunConfig = {
  runId: string;
  sourceCodebasePath: string;
  runPath: string;
  workspacePath: string;
  sessionConfig: SessionConfig;
};

export type RuntimeStatus = {
  available: boolean;
  locallyAuthenticatedModelStatus: ModelAuthStatus;
  detail: string;
  humanAction?: string;
};

export type AskResult = {
  status: "observed";
  assistantText: string;
  eventsCount: number;
} | {
  status: "trace-too-thin";
  detail: string;
  eventsCount: number;
};

export type TraceTurn = {
  turn: number;
  timestamp: string;
  userPrompt: string;
  assistantText: string;
  eventsCount: number;
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
  runtimeStatus: RuntimeStatus;
};
