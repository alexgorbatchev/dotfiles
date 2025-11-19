# Log Output Analysis Prompt

- Delete any existing generated artifacts by removing `test-project/.generated` before collecting fresh logs.
- Run `bun test-project generate --log=trace` to capture the complete log stream that will be analyzed.
- If the command exits with a non-zero status, stop immediately and surface the failure instead of proceeding with analysis.
- Focus only on messages emitted by `log-messages` modules or their runtime equivalents.
- Flag redundancies:
  - Repeated templates
  - Synonymous variants
  - Logs that restate prior information without adding context
- Detect duplicate emissions:
  - The same template triggered several times for a single event
  - Identical messages emitted back-to-back
- Call out clutter:
  - Starting and ending of operations
  - Messages without actionable value
  - Narration of control flow
  - Restated obvious transitions
- Highlight violations of logging rules:
  - Logging objects directly
  - Multi-line templates
  - Messages that exceed the single-responsibility guidance in `packages/logger/README.md`
- Recommend precise remedies for every issue—delete, merge, or rewrite the specific templates—while keeping change scope minimal and aligned with project logging policies.
- Do not apply any changes without explicit user approval after presenting the analysis.

Finally, generate a TODO `log-issues.md` file at the root of the project and then just say "done".

