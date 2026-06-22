# agent-harness

Experiments with harnesses for agentic work.

This repo explores how an outer system can guide, observe, and constrain agent
sessions without becoming the agent itself.

Focus areas:

- runtime adapters
- tool and permission boundaries
- trace capture
- approval and submit gates
- workspace evidence
- review and retry loops

## Pi interactive harness

### How to run

Install dependencies:

```bash
npm install
```

Run the included sample codebase:

```bash
npm run harness -- interactive-pi examples/small-codebase
```

Or run the harness against another local codebase path:

```bash
npm run harness -- interactive-pi path/to/codebase
```

Then use the interactive prompt:

```text
ask <prompt>
status
submit
exit
```

Example session:

```text
ask Inspect the code and make the smallest safe improvement.
status
submit
exit
```

The harness copies the input codebase into `runs/<run-id>/workspace`, starts a
Pi SDK session for that copied workspace, and records harness-mediated turns.
`submit` writes the deterministic evidence bundle:

```text
runs/<run-id>/
  input/
  workspace/
  trace/
  changes/
  checks/
  summary.md
```

If Pi is installed but no local provider auth is available, the run is
precondition-stopped with `blocked` submit evidence and no fake trace turns.
Authenticate Pi locally with `/login` or a supported provider API key, then
rerun the harness to capture real Q/A turns.

The optional `.agent-harness.json` file in a target codebase may define a
`checkCommand`. Treat that command as trusted local executable configuration:
`submit` runs it in the copied workspace with a two-minute timeout and capped
captured output.
