---
targets:
  - '*'
description: >-
  Work on git-bug tickets end-to-end: implement in worktrees, review, fix
  issues, merge to main, update docs, and close tickets.
copilot:
  agent: agent
---
# Work Tickets

Implements git-bug tickets using parallel sub-agents in isolated worktrees, reviews the results, fixes issues, merges to main, and closes tickets.

## Input

The user provides one or more git-bug ticket IDs (short hashes). If none are provided, list open tickets with `git-bug bug -s open` and ask the user which ones to work on.

## Phase 1: Gather Context

For each ticket ID:

1. Run `git-bug bug show <id>` to get the title and description.
2. If the description is empty or vague, ask the user for clarification before proceeding.

## Phase 2: Implement

Launch one sub-agent per ticket, all in parallel, each in its own worktree (`isolation: worktree`):

- Provide each agent with the ticket title, description, and enough codebase context to work independently.
- Instruct each agent to:
  1. Explore the codebase to understand relevant patterns.
  2. Implement the change following existing conventions.
  3. Add tests.
  4. Run `bun test:all` to verify all tests pass.
  5. Run `bun lint` to verify linting passes.
  6. Commit with a descriptive message.

Wait for all agents to complete. Report the status of each as they finish.

## Phase 3: Review

Launch one review sub-agent per completed worktree, all in parallel (read-only, no worktree isolation needed):

- Each reviewer checks:
  1. Correctness and edge cases.
  2. Code quality and pattern consistency.
  3. Type safety.
  4. Test quality and coverage.
  5. Logging conventions.
  6. Integration with other features.
- Reviewer reports: **PASS** (no issues) or a list of specific issues with file paths and line numbers.

Wait for all reviews to complete. Summarize findings.

## Phase 4: Fix Issues

For any review that found issues:

1. Create a git-bug ticket for the issues: `git-bug bug new --non-interactive -t "<title>" -m "<description>"`
2. Launch a fix sub-agent targeting the existing worktree (not a new worktree).
3. The fix agent applies the specific fixes, runs tests, and commits.

Wait for all fix agents to complete.

## Phase 5: Merge to Main

For each worktree with commits:

1. Identify the commit hashes: `git log main..HEAD --oneline` (from within the worktree).
2. Cherry-pick each commit onto main in order: `git cherry-pick <hash>`
3. If cherry-pick conflicts arise, resolve them manually or abort and apply changes directly.
4. After all cherry-picks, run `bun install` if new packages were added.
5. Run `bun test:all` to verify the merged result.
6. If tests fail, diagnose and fix before proceeding.

## Phase 6: Update Documentation

If any changes affect user-facing features (new installer types, new CLI options, behavior changes, new APIs), launch a sub-agent to update documentation:

1. Review all changes merged in Phase 5 to identify user-facing impacts.
2. The agent should:
   - Read existing docs in `docs/` to understand structure and style.
   - Read `docs/prompts/make-tool.prompt.md` to check if it needs updates (e.g., new installation methods, new config options).
   - Update relevant doc files to reflect the changes.
   - Add new doc files only if the existing pattern requires it (e.g., a new installer gets a new `docs/installation/<method>.md`).
   - Follow existing documentation conventions exactly.
3. Commit the doc changes to main.

Skip this phase if all changes are purely internal (refactors, test fixes, internal bug fixes with no user-visible impact).

## Phase 7: Close Tickets

Close all completed tickets (both original and fix tickets):

```
git-bug bug status close <id>
```

## Phase 8: Final Verification

1. Run `bun test:all` one final time to confirm everything passes.
2. Show `git log --oneline` of new commits on main.
3. Show remaining open tickets with `git-bug bug -s open`.

## Rules

- Never push to remote unless the user explicitly asks.
- If a ticket is already implemented (e.g., feature already exists), close it and report that to the user.
- If an agent's worktree has no changes (nothing to do), report that and skip it.
- Prefer cherry-pick over merge to keep history linear.
- Always run the full test suite before considering the task complete.
