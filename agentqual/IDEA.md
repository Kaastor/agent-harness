# AgentQual

Status: concept for a new system.

## Idea

AgentQual is a qualification system for deciding whether a new language model
can replace an existing model inside a concrete agentic system. It evaluates the
whole model-harness configuration rather than ranking isolated models on a
generic leaderboard.

The practical question is:

> Can this cheaper, faster, local, or otherwise preferable model run this
> agentic system without violating its required quality and reliability?

This is a system-level decision. The result depends not only on the model, but
also on the prompt, context construction, tool contracts, retry policy, model
parameters, environment, and acceptance checks.

## Problem

Agentic systems are commonly built around one model and later migrated for
cost, latency, privacy, availability, or capability reasons. A model that looks
good on a general benchmark may still fail in a particular harness because it:

- calls tools with incompatible arguments;
- fails intermittently across repeated runs;
- requires more retries or human intervention;
- produces correct final output but unsafe intermediate actions;
- consumes more context, time, or money than expected;
- behaves differently after the harness is adapted to it.

Teams therefore need a repeatable qualification decision, not another universal
model score.

## Proposed System

AgentQual runs versioned task scenarios against a frozen agentic-system
configuration and produces an evidence-backed decision for each candidate
model.

The system consists of:

- a scenario format describing initial state, task, allowed actions, checks, and
  resource limits;
- adapters for connecting model providers or local model servers to the same
  harness contract;
- isolated, resettable execution environments;
- deterministic checks for task outcome and policy violations;
- repeated trials to expose nondeterministic failures;
- provenance capture for the model, harness, prompts, tools, configuration, and
  environment;
- reports comparing candidates against explicit acceptance thresholds and a
  reference configuration.

The primary outcome is one of:

- `qualified`: all mandatory thresholds are met;
- `rejected`: at least one mandatory threshold is violated;
- `inconclusive`: the evidence is insufficient or the run is not comparable.

AgentQual should preserve the individual measurements and their uncertainty. It
should not hide incompatible trade-offs inside one arbitrary composite score.

## Qualification Dimensions

The first version should distinguish at least:

- effectiveness: task completion and correctness;
- reliability: success rate, variance, and failure modes across repeated runs;
- tool compatibility: valid calls, protocol compliance, and recovery from tool
  errors;
- safety and control: forbidden actions, boundary violations, and unapproved
  side effects;
- efficiency: end-to-end latency, tokens, provider cost, and local resources;
- autonomy burden: retries, corrective prompts, and human interventions;
- artifact quality: maintainability or domain-specific quality beyond merely
  passing a test.

Some measures are generic, while task correctness and artifact quality require
domain-specific evaluators. The report must keep that distinction visible.

## Two Qualification Modes

`Drop-in qualification` changes only the model. It tests whether the candidate
can replace the reference model without modifying the harness.

`Adapted qualification` allows declared changes to prompts, context, or model
parameters. It tests whether a bounded migration can qualify the candidate. The
report must expose every adaptation so the two modes are never compared as if
they were equivalent.

## First Bounded Version

The first version should target one coding harness and a small, versioned suite
of repository tasks. It should:

1. run the same scenarios on a reference model and at least two candidates;
2. reset the repository and external state before every trial;
3. repeat every model-scenario pair;
4. use deterministic tests and tool-policy checks as primary oracles;
5. record cost, latency, tool calls, retries, and failure categories;
6. generate a machine-readable result and a human-readable qualification
   report.

The laboratory-class Pi evidence harness in this repository can supply trace
and change evidence, but AgentQual must own experiment orchestration,
comparability, and the qualification decision.

## Evaluation

The software itself should be evaluated by showing that it can:

- reproduce the same configuration and reset state across trials;
- detect deliberately introduced model-tool incompatibilities;
- distinguish stable success from an equal average with higher failure risk;
- account for uncertain outcomes without silently treating them as failures or
  successes;
- produce auditable decisions from recorded evidence;
- reveal real cost, latency, reliability, or autonomy trade-offs between model
  configurations.

An initial case study can qualify several models for one coding-agent harness.
It is evidence for the tool's usefulness, not proof that the result generalizes
to every agentic system.

## Research and Publication Position

The SoftwareX contribution would be the reusable qualification software,
scenario and evidence formats, provider adapters, reproducible environments,
and a worked case study. The strongest claim is not that AgentQual discovers the
best model. It is that AgentQual makes a concrete model-substitution decision
repeatable, auditable, and sensitive to system-level failure modes.

This system can also support later empirical papers about model
interchangeability, reliability under repeated trials, migration cost, or
continuous requalification after model and harness updates. Those studies
should be separated from the first software paper instead of overloading it.

## What Building It Teaches

Building AgentQual develops practical ownership of agentic systems through:

- harness and model-adapter design;
- reproducible experiment orchestration;
- evaluation under nondeterminism;
- task and oracle construction;
- telemetry, provenance, and failure taxonomy;
- statistical reasoning about repeated runs;
- cost, latency, and reliability trade-offs.

## Non-Goals

- a universal public model leaderboard;
- proving that one model is globally better than another;
- runtime model routing in the first version;
- replacing domain-specific correctness checks with an LLM judge;
- claiming that one successful run qualifies a model;
- hiding trade-offs behind a single score.
