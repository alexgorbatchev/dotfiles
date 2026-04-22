---
targets:
  - "*"
description: >-
  Guidelines for analyzing log output to identify redundancies, duplicates,
  clutter, and violations of logging best practices.
copilot:
  agent: agent
---

# Log Output Analysis Prompt

- Delete any existing generated artifacts by removing `test-project-npm/.generated` before collecting fresh logs.
- Run `bun test-project-npm generate --trace --log=verbose` to capture the complete log stream that will be analyzed.
- If the command exits with a non-zero status, stop immediately and surface the failure instead of proceeding with analysis.
- Focus only on messages emitted by `log-messages` modules or their runtime equivalents.
- Flag redundancies:
  - Repeated templates
  - Synonymous variants
  - Logs that restate prior information without adding context
- Detect duplicate emissions:
  - The same template triggered several times for a single event
  - Identical or similar messages emitted back-to-back
- Call out clutter:
  - Starting and ending of operations, these are not useful
  - Messages without actionable value
  - Narration of control flow
  - Restated obvious transitions
- Highlight violations of logging rules:
  - Whole objects are logged instead of concise summaries
  - A message spawns multiple lines
- Recommend precise remedies for every issue—delete, merge, or rewrite the specific templates—while keeping change scope minimal and aligned with project logging policies.
- Do not apply any changes without explicit user approval after presenting the analysis.

Finally, generate a TODO `log-issues.md` file at the root of the project and then just say "done".
