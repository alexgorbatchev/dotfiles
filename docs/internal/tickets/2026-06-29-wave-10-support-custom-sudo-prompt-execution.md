---
created_on: 2026-06-29 10:00
last_modified: 2026-06-29 10:00
status: current
ticket_status: open
---

# Wave 10: Support Custom Sudo Prompt Execution

## Problem

The CLI parses and holds a custom sudo prompt setting under the configuration path `system.sudoPrompt`. However, Go's command executor and installer plugins completely ignore this setting when executing commands with privilege escalation.

On Unix systems, custom sudo prompts must be passed to `sudo` using the `-p` parameter (e.g. `sudo -p "[custom prompt]" command`). By ignoring this, the CLI uses the system's default password prompt, breaking custom terminal styling and custom automation configurations.

## Why this matters

Many advanced setups utilize custom prompts to capture password inputs gracefully, customize terminal interfaces, or interface with graphical authenticators. Ignoring the user's defined prompt breaks custom user settings.

## Observed context

- Codebase files affected:
  - `pkg/exec/os_runner.go` (executes physical commands and parses sudo commands)
  - `pkg/config/config.go` (declares project-wide settings including SudoPrompt)

## Desired outcome

Command executors are updated to check the active `ProjectConfig.System.SudoPrompt` parameter. Whenever a command requires elevated permissions, the executor will format and inject `-p "[prompt]"` parameters into the prepended `sudo` statement.

## Acceptance criteria

- [ ] Update `pkg/exec/os_runner.go` (or relevant runner helpers) to read `SudoPrompt` from the configuration.
- [ ] Format and prepend `sudo -p "prompt"` to commands running with sudo elevation.
- [ ] Ensure that special characters or spaces inside the custom prompt are escaped securely during process execution.
- [ ] Write a unit test asserting that executing an elevated command formats the arguments with `-p` and the configured prompt string correctly.
- [ ] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
