# Laboratory-Class Pi Evidence Harness

Status: working prototype implemented in this directory.

## Idea

This is a laboratory-class harness: a Pi extension for running bounded,
inspectable coding-agent experiments. Pi remains responsible for the
conversation and agent loop; the extension observes the run, captures evidence,
and applies a deterministic submission gate.

`Laboratory-class` means that the system prioritizes controlled conditions,
explicit evidence, repeatability, and understandable failure states. It is an
experimental instrument rather than a claim of production isolation,
governance, or reliability.

The concrete question behind the prototype is:

> Can normal work inside Pi produce a coherent record of the interaction,
> resulting workspace changes, configured checks, and final submit decision?

## Problem

An interactive agent can edit a repository and report that it has finished, but
the final answer alone is weak evidence. A reviewer may need to reconstruct:

- what the user asked and what the agent answered;
- which files changed;
- what the final diff contained;
- which project check ran and what it returned;
- why the run was accepted, rejected, or could not be judged.

The prototype explores whether this evidence can be captured without building a
second interactive shell around Pi.

## Implemented System

The user starts Pi with the extension inside a Git repository and works through
the normal Pi interface. The extension registers two commands:

- `/harness-status` reports the active run and number of captured turns;
- `/submit` collects final evidence, runs the configured check, and writes a
  decision bundle.

For each completed Pi turn, the extension records:

- the user prompt;
- the assistant's textual response;
- Git status after the turn;
- the repository diff after the turn.

The trace is stored first as Pi custom session entries, allowing it to survive
across invocations that use the same Pi session. On submission, the extension
materializes the evidence under Git's private metadata path:

```text
.git/agent-harness-runs/<run-id>/
  input/session-config.json
  trace/turns.jsonl
  trace/transcript.md
  changes/final.diff
  changes/file-status.json
  checks/submit-checks.json
  checks/test-output.txt
  summary.md
```

Keeping the bundle under `.git` prevents harness artifacts from polluting the
working-tree status that the system is trying to observe.

## Submit Contract

A target repository may define a trusted local command in
`.agent-harness.json`:

```json
{
  "checkCommand": "npm test"
}
```

The current deterministic decision rule is:

- `pass` when at least one Pi turn was captured and the configured command exits
  successfully;
- `reject` when at least one Pi turn was captured and the command exits with a
  non-zero status;
- `blocked` when there is no trace, no configured command, the command times
  out, or a deterministic decision cannot be produced.

The command runs in the Git-bounded working directory with a two-minute timeout
and capped captured output. It is trusted local executable configuration, not a
sandboxed policy.

## System Boundary

The prototype observes and evaluates a run at submission time. It does not:

- replace Pi's agent loop;
- intercept or authorize every tool call;
- isolate the working directory;
- prove authorship, learning, or user understanding;
- judge semantic code quality beyond the configured command;
- guarantee complete provenance of all external effects.

These boundaries matter because an evidence recorder, an evaluation system, and
a tool control plane solve different problems.

## Value and Uses

The laboratory-class harness is useful as:

- a compact experiment in Pi extension lifecycle and session persistence;
- an inspectable evidence layer for coding-agent experiments;
- a deterministic submit/retry primitive;
- infrastructure that AgentQual can use to collect run evidence;
- a baseline showing what remains uncontrolled before building an Agent Tool
  Control Plane.

## Research and Publication Position

In its current form, the prototype is a credible learning artifact and research
substrate, but it is probably too narrow for a strong standalone SoftwareX
submission. Trace capture plus one configured shell check is useful, yet the
reusable scientific-software contribution and evaluation are still limited.

It could become a stronger software contribution by developing a stable evidence
schema, pluggable checks, reproducible run reconstruction, multiple harness
adapters, fault-aware provenance, and an evaluation demonstrating uses that
existing agent logs do not support. Alternatively, it can remain deliberately
small and serve as infrastructure for AgentQual or the Control Plane, whose
research questions are sharper.

## What Building It Teaches

The prototype provides direct experience with:

- Pi extension events and commands;
- agent-session state and persistence;
- Git-bounded workspace evidence;
- deterministic gates around nondeterministic work;
- process execution, timeouts, and output limits;
- evidence design and honest system boundaries.

## Next Decision

Before extending this prototype, decide whether it should become a general
evidence product or remain a minimal experimental adapter. Adding features
without choosing that role would blur its contract and duplicate responsibilities
that belong in AgentQual or the Control Plane.
