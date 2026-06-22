import type { AskResult, RuntimeStatus } from "./types.js";

type PiSession = {
  prompt: (prompt: string) => Promise<unknown>;
  subscribe: (listener: (event: unknown) => void) => () => void;
};

export class PiRuntime {
  private constructor(
    private readonly session: PiSession | undefined,
    readonly status: RuntimeStatus,
  ) {}

  static async create(workspacePath: string): Promise<PiRuntime> {
    try {
      const sdk = await import("@earendil-works/pi-coding-agent");
      const authStorage = sdk.AuthStorage.create();
      const modelRegistry = sdk.ModelRegistry.create(authStorage);
      const { session } = await sdk.createAgentSession({
        sessionManager: sdk.SessionManager.inMemory(workspacePath),
        authStorage,
        modelRegistry,
        cwd: workspacePath,
      });

      return new PiRuntime(session as PiSession, {
        available: true,
        locallyAuthenticatedModelStatus: "unknown",
        detail: "Pi SDK session created for copied workspace; model auth is proven only after a successful ask.",
      });
    } catch (error) {
      const classified = classifyPiStartupError(error);
      return new PiRuntime(undefined, classified);
    }
  }

  async ask(prompt: string): Promise<AskResult> {
    if (!this.session) {
      throw new Error(this.status.humanAction ?? this.status.detail);
    }

    const events: Array<unknown> = [];
    let assistantText = "";
    const unsubscribe = this.session.subscribe((event) => {
      events.push(event);
      assistantText += extractTextDelta(event);
    });

    try {
      await this.session.prompt(prompt);
      if (!assistantText.trim()) {
        return {
          status: "trace-too-thin",
          detail: "Pi prompt completed, but no assistant text_delta events were captured.",
          eventsCount: events.length,
        };
      }

      return {
        status: "observed",
        assistantText,
        eventsCount: events.length,
      };
    } finally {
      unsubscribe();
    }
  }

  static statusForInteractionError(error: unknown): RuntimeStatus {
    return classifyPiStartupError(error);
  }
}

function extractTextDelta(event: unknown): string {
  if (!event || typeof event !== "object") {
    return "";
  }

  const record = event as Record<string, unknown>;
  const assistantEvent = record.assistantMessageEvent;
  if (!assistantEvent || typeof assistantEvent !== "object") {
    return "";
  }

  const assistantRecord = assistantEvent as Record<string, unknown>;
  return assistantRecord.type === "text_delta" && typeof assistantRecord.delta === "string" ? assistantRecord.delta : "";
}

function classifyPiStartupError(error: unknown): RuntimeStatus {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("Cannot find package") || message.includes("ERR_MODULE_NOT_FOUND")) {
    return {
      available: false,
      locallyAuthenticatedModelStatus: "unknown",
      detail: message,
      humanAction: "Install @earendil-works/pi-coding-agent, then rerun the harness.",
    };
  }

  if (message.toLowerCase().includes("auth") || message.toLowerCase().includes("login")) {
    return {
      available: true,
      locallyAuthenticatedModelStatus: "unavailable",
      detail: message,
      humanAction: "Authenticate Pi locally with /login or a supported provider API key, then rerun the harness.",
    };
  }

  return {
    available: false,
    locallyAuthenticatedModelStatus: "unknown",
    detail: message,
    humanAction: "Resolve Pi SDK startup before asking through the harness.",
  };
}
