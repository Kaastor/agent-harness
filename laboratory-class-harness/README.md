# Laboratory-Class Agent Harness

Status: authoritative product concept. A narrower Pi evidence-capture prototype
exists in this directory; the full teaching product described here is not yet
implemented.

## Product intent

The product is an instrumented local AI-assisted engineering lab for
teacher-assigned software tasks. Students may use a coding agent, but the lab
makes the work path and the student's engineering judgement explicit,
inspectable, and harder to outsource silently.

The core workflow is:

```text
student runs lab CLI
-> signs into provider client
-> works with coding agent
-> harness captures prompts, commands, edits, checks, and decisions
-> trace package is exported or uploaded
-> teacher reviews summaries and representative traces
```

This is not AI-cheating detection or proof of unaided mastery. It is a
teacher-directed environment that shortens feedback loops, preserves evidence
from the work itself, and helps teachers review judgement-heavy learning
without reading every raw conversation.

The first product question is:

> Can students produce trace-backed handoffs in which important engineering
> judgements are explicit, and can teachers make better next teaching moves
> from those traces than from final submissions and reconstructed reflection
> forms alone?

## Users and value

Students need timely assistance, clear readiness feedback, and a way to submit
an honest unresolved attempt without an agent manufacturing success. The lab
should help them inspect evidence, correct agent output, disclose limits, and
retain responsibility for the final decision.

Teachers and teaching teams need a reviewable account of what happened: what
the student asked, what the agent did, which evidence was produced, what the
student accepted or rejected, and where intervention is useful. They need
patterns and representative traces, not a surveillance feed or an unreadable
transcript archive.

Programming is the first wedge because prompts, commands, diffs, checks, and
artifacts are naturally observable. Expansion to other judgement-heavy domains
is possible only if they have an artifact, a traceable work path, explicit
student-owned decisions, and credible evidence checks.

## Responsibility boundaries

The learning target is not code production alone. The product must distinguish
delegable implementation work from protected student judgement.

| Actor | Owns |
| --- | --- |
| Teacher | Task intent, learning objectives, allowed materials and tools, protected judgement checkpoints, rubric, readiness rules, trace policy, escalation conditions, assessment, and grade |
| Student | Intent, assumptions, scope, architecture and tradeoffs where those are learning targets, acceptance criteria, interpretation of evidence, limitations, final explanation, and decision to submit |
| Coding agent | Allowed inspection, implementation, edits, commands, test runs, alternatives, critique, and factual summaries within the lab contract |
| Harness | Runtime launch, observable boundary enforcement, trace capture, deterministic checks, evidence-linked readiness feedback, warnings, and trace-package production |

The harness may identify observable problems: a missing artifact, failed check,
unsupported claim, trace gap, skipped checkpoint, forbidden edit, or stale
submission. It must not decide what evidence means on the student's behalf,
choose an acceptable tradeoff, certify understanding, or assign a grade.

When protected judgement appears to have been delegated, the system should ask
for the student's current view, point to relevant evidence, provide a bounded
hint, request a retry, or flag the case for teacher review. Prompt instructions
alone are not a hard control; any claim of enforcement must match the runtime's
actual permissions and trace capabilities.

## End-to-end lab workflow

1. A teacher defines a versioned lab pack: task, starter repository, learning
   objective, materials, rubric, protected judgement checkpoints, allowed tools
   and commands, checks, readiness rules, report shape, trace policy, and review
   conditions.
2. The student starts the local lab CLI in the assignment workspace.
3. The student authenticates with the supported provider client on their own
   machine. The harness launches the configured coding-agent runtime through a
   runtime adapter.
4. The student states the initial intent, assumptions, scope, and intended
   behavior evidence where the lab requires them.
5. The student and coding agent inspect, propose, edit, run checks, judge the
   evidence, revise, and state limits. The harness records the observable path
   and labels actors where technically possible.
6. Before handoff, deterministic gates check required artifacts and evidence.
   Judgement risks produce warnings or teacher-review routes rather than an
   automated claim of correctness or mastery.
7. The student fixes blocked items or submits an explicit unresolved attempt
   containing attempts, evidence, rejected hypotheses, uncertainty, and a
   precise question.
8. The harness exports a local trace package. Upload is an optional future
   transport, not an established requirement.
9. The teacher reviews the summary and selected representative trace evidence,
   then drills into first-order evidence only when needed.

A useful learning loop inside those steps is:

```text
Inspect -> Propose -> Check -> Judge -> Revise -> State limits
```

## Trace package and confidence

The trace package is the evidence unit; the final answer or report is only a
view over it. A minimum package should contain, when observable:

- lab-pack and runtime identifiers, workspace state, and trace-policy version;
- student prompts, explicit judgement checkpoints, approvals, rejections, and
  corrections;
- agent responses, plans, tool calls, and edits;
- commands, exit status, bounded output, required checks, and retries;
- file status, diffs or snapshots, and final artifacts;
- readiness gate results, warnings, trace gaps, final decision, and handoff
  summary.

Actor labels should distinguish student, agent, harness, check/tool output,
teacher, and unknown or untraced work. These labels are evidence claims, not
proof of authorship or private thought. Copied content, manual edits, external
AI use, and actions outside the instrumented runtime may remain unknown unless
the system can observe them honestly.

Every runtime adapter must report its capabilities. Trace confidence should be
visible at the run and event level, using a hierarchy such as:

```text
official event and tool trace
> CLI transcript plus workspace diffs
> workspace snapshots and check outputs
> final submission only
```

Missing windows lower confidence; they must not be silently filled by
inference. A passing check proves only that the configured check passed. A
trace supports review of observable actions, not a claim that the student
understood, worked unaided, or can transfer the skill.

## Local provider authentication posture

Authentication should remain in the provider's official client flow on the
student's machine. The harness should reuse the runtime's supported local
credentials and record only the provider/runtime identity and capability facts
needed for the trace. It should not scrape consumer chat interfaces,
impersonate students, proxy consumer subscriptions through a backend, or
collect raw provider tokens centrally.

The current Pi prototype follows this posture: the student signs in through
Pi's provider login and Pi retains the local credential. This is implementation
evidence for one adapter, not a commitment to Pi or a guarantee that every
provider or subscription can be supported. Each provider/runtime combination
must be validated for authentication terms, trace quality, tool control, and
practical classroom use.

## Teacher review model

Teacher review should be exception- and pattern-oriented. A per-attempt summary
should surface:

- readiness state, failed hard gates, and unresolved warnings;
- provenance confidence and important trace gaps;
- required evidence, checks, changed files, and before/after proof;
- unsupported or overbroad claims;
- agent output accepted without inspection or checks;
- possible outsourcing of protected judgement;
- strong student corrections, constraints, and disclosed limitations;
- representative trace excerpts linked to first-order evidence.

Across a cohort, later tooling may aggregate repeated blockers,
misconceptions, weak task or rubric signals, and high-risk review cases. The
teacher must be able to drill down from every summary claim to supporting
evidence. Automated diagnosis prioritizes review; it does not perform final
grading or infer a student's internal state.

Readiness is narrower than quality or mastery:

- `not ready`: an observable hard requirement failed;
- `ready with warnings`: observable requirements pass but judgement risks or
  evidence limitations remain;
- `ready for teacher review`: the trace-backed handoff is complete enough for
  human review, with warnings visible.

## Minimum viable architecture

```text
teacher-authored lab pack
-> local lab CLI and assignment workspace
-> runtime adapter
-> supported coding-agent client
-> observable repo/shell/check boundary
-> trace collector and confidence labels
-> deterministic readiness gates
-> local trace-package exporter
-> teacher-readable summary plus linked evidence
```

The harness owns the task contract, evidence model, readiness rules, and
human-owned judgement boundary. A runtime adapter owns session launch,
messages, tool configuration, events, errors, and capability reporting for one
coding-agent runtime. Repo, shell, and check integration owns observable tool
actions and their evidence. The architecture must not claim stronger control,
attribution, or reversibility than those adapters actually provide.

### Current implementation evidence

This directory currently implements a narrower Pi extension prototype. Pi owns
the interactive agent loop. The extension captures user/assistant turns plus
Git status and diff snapshots, persists them with the Pi session, and on
`/submit` runs one trusted local `checkCommand` and writes a local evidence
bundle under `.git/agent-harness-runs/<run-id>/`. Its deterministic result is
`pass`, `reject`, or `blocked` based on trace presence and that configured
check.

The prototype demonstrates local provider login reuse, session trace recovery,
Git-bounded evidence, and a deterministic submission gate. It does **not** yet
provide a lab-pack compiler, explicit protected-judgement checkpoints,
complete command/tool provenance, reliable actor attribution, trace upload,
teacher review software, or the platform capabilities listed below.

Pi is therefore the implemented experimental adapter. OpenCode appears in the
source roadmap as a candidate runtime with potentially stronger configuration,
permission, and event surfaces. No final runtime choice or universal runtime
abstraction has been established.

## MVP boundary

The MVP is one real, local, teacher-assigned coding lab with one supported
runtime/provider path. It should prove that the lab can capture an honest trace,
require at least one meaningful student-owned judgement checkpoint, run
deterministic checks, produce a readiness summary, and export a reviewable local
package. Success is fewer incomplete or unsupported handoffs and faster,
better-targeted teacher review; better grades or proven transfer are not assumed.

The following are **not implemented and not implicit in the core concept**:

| Platform capability | Current status |
| --- | --- |
| Application-level student accounts and identity proof | Undesigned |
| Course, cohort, or enrollment management | Undesigned |
| Teacher authentication and authorization | Undesigned |
| Centralized trace upload and storage | Optional direction; transport and ownership undecided |
| Privacy, consent, visibility, deletion, and retention policy | Required before real deployment; policy undecided |
| Multi-tenant backend, tenant isolation, and institutional administration | Out of the MVP; architecture undecided |
| Full teacher dashboard or LMS integration | Later possibility, not an MVP dependency |
| Cross-provider portability | Adapter-by-adapter research question, not a promise |

Until those decisions exist, the safe product posture is a local exporter and
a teacher-readable package transferred through an institution-approved process
outside the harness.

## Non-goals

- AI-proof assessment, cheating detection, or surveillance;
- proof of unaided understanding, authorship, mastery, or concept transfer;
- automatic final grading or replacement of teacher judgement;
- a general-purpose AI tutor or an AI-authored curriculum;
- a full LMS, identity system, course-management system, or multi-tenant
  education backend;
- a universal provider abstraction or backend proxy for consumer accounts;
- perfect provenance, complete capture of external work, or mind-reading;
- unrestricted access to external systems or a general agentic control plane in
  the first teaching-lab MVP;
- expansion beyond coding before the local lab and teacher-review value are
  demonstrated.

## Principal risks

- **Trace theater:** rich telemetry is mistaken for understanding or truth.
- **Soft control presented as enforcement:** prompts are described as hard
  boundaries although the runtime can bypass them.
- **Student judgement is consumed:** the agent chooses assumptions,
  architecture, interpretation, or the final decision before the student
  practices it.
- **Check-as-truth:** passing automation is treated as semantic correctness.
- **Workflow ceremony:** too many checkpoints encourage performative box
  ticking instead of useful judgement.
- **Teacher overload:** trace collection creates a larger review queue instead
  of useful compression and prioritization.
- **Privacy and chilling effects:** unnecessary capture becomes surveillance or
  changes student behavior without a justified educational purpose.
- **False attribution:** manual, copied, agent, and external actions are labeled
  more confidently than the evidence allows.
- **Provider/runtime fragility:** authentication, permissions, events, or terms
  do not support the claimed classroom workflow.
- **Premature platform building:** accounts, dashboards, and backend design
  consume effort before the local evidence-and-review loop is validated.

## Open decisions

These are human-owned product, pedagogical, institutional, or legal choices;
the source material does not settle them:

1. Which runtime should back the first real lab: extend the current Pi adapter,
   validate the proposed OpenCode path, or use another official agent surface?
2. Which assignment and protected judgement checkpoint form the deciding MVP
   experiment, and what comparison will show improved handoff quality or review
   efficiency?
3. What is the smallest stable lab-pack, event, actor-label, evidence-link, and
   trace-confidence schema?
4. Which controls must be enforced before action, which may be checked after
   action, and which can only produce warnings because the runtime is weak?
5. How should a student explicitly record judgement, correction, acceptance,
   uncertainty, and an unresolved submission without turning the lab into
   ceremony?
6. Is local export sufficient for the initial classroom trial? If upload is
   required, who operates the service and owns access control, storage,
   retention, deletion, breach response, and institutional compliance?
7. What may teachers, teaching assistants, students, and administrators see,
   for how long, and with what consent, correction, and appeal process?
8. How are student and teacher identities, courses, enrollments, and tenants
   represented, if the product later becomes a platform?
9. How should external AI use and untraced work be disclosed and handled
   without claiming detection the harness cannot provide?
10. Which teacher-review outputs are genuinely actionable, and which success
    measures include transfer or learning evidence beyond faster completion?
