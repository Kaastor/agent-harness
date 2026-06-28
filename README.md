# agent-harness

Experiments with harnesses for agentic work.

This repo explores how Pi can be customized to guide, observe, and constrain
agent sessions without replacing Pi's own interactive harness.

Focus areas:

- tool and permission boundaries
- trace capture
- approval and submit gates
- workspace evidence
- review and retry loops

## Pi extension harness

### How to run

Install dependencies:

```bash
npm install
```

Log in with a subscription provider once:

```bash
npx pi
```

In the Pi prompt, run:

```text
/login
```

Select your subscription provider, complete the browser/device login flow, then
quit Pi with `/quit`. Built-in subscription logins include ChatGPT Plus/Pro
(Codex), Claude Pro/Max, and GitHub Copilot. Pi stores the token in
`~/.pi/agent/auth.json`, and the extension uses Pi's normal local auth. For
Claude Pro/Max, Pi's provider docs note that third-party harness usage draws
from Anthropic extra usage and may be billed per token.

Run Pi with the extension in a target repo:

```bash
cd examples/small-codebase
../../node_modules/.bin/pi -e ../../src/extension.ts
```

The target directory must be inside a Git repository. Evidence is written under
Git's private metadata path so it does not appear in `git status`.

Then work normally in Pi and submit when ready:

```text
Inspect the code and make the smallest safe improvement.
/submit
```

For a non-interactive smoke run:

```bash
../../node_modules/.bin/pi -e ../../src/extension.ts --session-id smoke -p "Reply exactly: smoke ok"
../../node_modules/.bin/pi -e ../../src/extension.ts --session-id smoke -p "/submit"
```

The extension adds:

```text
/submit
/harness-status
```

Pi remains the harness. `agent-harness` observes Pi lifecycle events, records
Q/A and diff snapshots as Pi custom session entries, and writes the
deterministic evidence bundle when `/submit` runs:

```text
.git/agent-harness-runs/<run-id>/
  input/
  trace/
  changes/
  checks/
  summary.md
```

The optional `.agent-harness.json` file in a target codebase may define a
`checkCommand`. Treat that command as trusted local executable configuration:
`/submit` runs it in the current git-bounded working directory with a two-minute
timeout and capped captured output.

Submit decisions:

- `pass` when at least one Pi turn was traced and `checkCommand` exits 0.
- `reject` when at least one Pi turn was traced and `checkCommand` exits nonzero.
- `blocked` when no trace exists, no check is configured, the check times out,
  or evidence cannot be written.
