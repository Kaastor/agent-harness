import { spawn } from "node:child_process";

export type CommandResult = {
  command: string;
  cwd: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  error?: string;
  timedOut?: boolean;
  truncated?: boolean;
};

export type CommandOptions = {
  timeoutMs?: number;
  outputLimitBytes?: number;
};

export async function runCommand(
  command: string,
  args: string[],
  cwd: string,
  options: CommandOptions = {},
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const outputLimitBytes = options.outputLimitBytes ?? Number.POSITIVE_INFINITY;
    let outputBytes = 0;
    let truncated = false;
    let timedOut = false;
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    const rendered = [command, ...args].join(" ");
    let forceKill: NodeJS.Timeout | undefined;
    const timeout = options.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill("SIGTERM");
          forceKill = setTimeout(() => {
            child.kill("SIGKILL");
          }, 1_000);
        }, options.timeoutMs)
      : undefined;

    child.stdout.on("data", (chunk) => {
      const appended = appendOutput(stdout, chunk, outputBytes, outputLimitBytes);
      stdout = appended.output;
      outputBytes = appended.outputBytes;
      truncated ||= appended.truncated;
    });
    child.stderr.on("data", (chunk) => {
      const appended = appendOutput(stderr, chunk, outputBytes, outputLimitBytes);
      stderr = appended.output;
      outputBytes = appended.outputBytes;
      truncated ||= appended.truncated;
    });
    child.on("error", (error) => {
      if (timeout) {
        clearTimeout(timeout);
      }
      if (forceKill) {
        clearTimeout(forceKill);
      }
      resolve({
        command: rendered,
        cwd,
        exitCode: null,
        signal: null,
        stdout,
        stderr,
        error: error.message,
        timedOut,
        truncated,
      });
    });
    child.on("close", (exitCode, signal) => {
      if (timeout) {
        clearTimeout(timeout);
      }
      if (forceKill) {
        clearTimeout(forceKill);
      }
      resolve({
        command: rendered,
        cwd,
        exitCode,
        signal,
        stdout,
        stderr,
        error: timedOut ? `Command timed out after ${options.timeoutMs}ms.` : undefined,
        timedOut,
        truncated,
      });
    });
  });
}

export async function runShellCommand(command: string, cwd: string, options?: CommandOptions): Promise<CommandResult> {
  return runCommand("sh", ["-c", command], cwd, options);
}

function appendOutput(
  current: string,
  chunk: Buffer,
  outputBytes: number,
  outputLimitBytes: number,
): { output: string; outputBytes: number; truncated: boolean } {
  if (outputBytes >= outputLimitBytes) {
    return { output: current, outputBytes, truncated: true };
  }

  const remainingBytes = outputLimitBytes - outputBytes;
  if (chunk.length <= remainingBytes) {
    return {
      output: current + chunk.toString(),
      outputBytes: outputBytes + chunk.length,
      truncated: false,
    };
  }

  return {
    output: current + chunk.subarray(0, remainingBytes).toString(),
    outputBytes: outputLimitBytes,
    truncated: true,
  };
}
