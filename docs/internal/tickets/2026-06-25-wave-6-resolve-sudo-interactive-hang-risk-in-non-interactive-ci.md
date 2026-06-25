---
created_on: 2026-06-25 14:10
last_modified: 2026-06-25 14:10
status: current
ticket_status: open
---

# Wave 6: Resolve Sudo Interactive Hang Risk in Non-Interactive Environments

## Problem

In automated setups (such as CI/CD runners, Docker builds, or headless remote triggers), execution environment streams (`stdin`) are non-interactive.

When executing tool installations, if an installer requires root permissions (where `.sudo()` is configured), Go's command execution engine blindly spawns subprocess commands prepended with `sudo` (e.g., calling `sudo apt-get install -y bat`).

- **The Bug**: Since the execution environment is non-interactive, the command runner has no stdin terminal attached. If the user does not have passwordless sudo configured on the host system, the spawned `sudo` command blocks and hangs indefinitely, waiting for a password prompt that can never be answered. This locks up the execution runner until a global script timeout is reached.
- **TypeScript's Behavior**: TypeScript's command execution system checks if `process.stdout.isTTY` or `process.stdin.isTTY` is active, or performs a lightweight, non-interactive verification pre-flight check before spawning interactive prompts, raising a clean, non-blocking error if prompt entry is impossible.

## Why this matters

A headless execution engine must never hang. It is better to fail fast with a descriptive error (e.g., "Sudo credentials required but shell is running in a non-interactive terminal") than to freeze execution indefinitely. This guarantees deterministic behavior in deployment pipelines and headless automation servers.

## Observed context

- Go subprocess runner:
  - `pkg/runner/runner.go` or `pkg/runner/command.go` (the wrapper executing physical bash commands)
- Orchestration privilege validation:
  - `pkg/orchestrator/orchestrator.go` (which coordinates command executions)

## Desired outcome

The Go command-execution engine is upgraded to detect non-interactive terminal streams and pre-validate passwordless sudo access before attempting to spawn any subprocesses with elevated privileges, immediately aborting with a clean, descriptive validation error if interactive input is required but unavailable.

## Acceptance criteria

- [ ] **Sudo TTY Detection**: Implement terminal detection inside the command runner to check if `stdin` is a real interactive TTY or if the execution environment is running headlessly.
- [ ] **Passwordless Sudo Pre-flight Check**: Before attempting to execute any command prepended with `sudo` in a headless environment, the command runner must perform a fast, non-blocking validation check (such as calling `sudo -n true` which fails with status 1 if a password is required).
- [ ] **Fail Fast Execution**: If the passwordless sudo pre-flight check fails and stdin is non-interactive, abort the installation immediately and return a descriptive error (e.g., `headless environment requires passwordless sudo access for elevated configurations`).
- [ ] **Unit and E2E Tests**: Write test cases in `pkg/runner/runner_test.go` or a dedicated test file asserting:
  - Simulating a headless execution environment (using closed stdin) fails immediately when passwordless sudo is missing.
  - Success is returned cleanly if passwordless sudo is active (where `sudo -n true` returns exit code 0).
- [ ] Ensure that running the command `go test ./pkg/runner/...` passes cleanly.
- [ ] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
