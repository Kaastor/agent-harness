#!/usr/bin/env node
import { cwd, exit } from "node:process";
import { runInteractivePi } from "./interactive.js";

async function main(argv: string[]): Promise<void> {
  const [command, codebaseArg, ...rest] = argv;
  if (command !== "interactive-pi" || !codebaseArg || rest.length > 0) {
    printUsage();
    exit(command === "--help" || command === "-h" ? 0 : 1);
  }

  await runInteractivePi(codebaseArg, cwd());
}

function printUsage(): void {
  console.log("Usage: agent-harness interactive-pi <codebase>");
  console.log("");
  console.log("Interactive commands: ask <prompt>, status, submit, exit");
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  exit(1);
});
