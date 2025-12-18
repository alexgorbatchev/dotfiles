---
# User Prompt
> Follow instructions in alex--feature--new.prompt.md.
> add a function utils package
>
> i want a relatively flexible string replace in file function, i want to be able to  regex by line or whole file as a string and replace be a string or a callback function that is regular or async
>
> something like this
>
> import { readFile, writeFile } from 'fs/promises';
>
> type Replacer = string | ((substring: string, ...args: any[]) => string | Promise<string>);
>
> interface ReplaceOptions {
>   path: string;
>   from: RegExp;
>   to: Replacer;
>   mode: 'file' | 'line';
> }
>
> async function replaceInFile({ path, from, to, mode }: ReplaceOptions): Promise<void> {
>   const content = await readFile(path, 'utf8');
>
>   // Helper to handle both string and async callback replacements
>   const getReplacement = async (match: string, ...args: any[]) => {
>     return typeof to === 'function' ? await提名 to(match, ...args) : to;
>   };
>
>   // Logic for Async Regex Replace (since native .replace doesn't support await)
>   const asyncReplace = async (str: string) => {
>     const matches = Array.from(str.matchAll(from));
>     let result = str;
>     let offset = 0;
>
>     for (const match of matches) {
>       const replacement = await getReplacement(match[0], ...match.slice(1), match.index, str);
>       const start = (match.index ?? 0) + offset;
>       const end = start + match[0].length;
>       
>       result = result.slice(0, start) + replacement + result.slice(end);
>       offset += replacement.length - match[0].length;
>     }
>     return result;
>   };
>
>   let finalContent: string;
>
>   if (mode === 'line') {
>     const lines = content.split('\n');
>     const processedLines = await Promise.all(
>       lines.map(line => from.test(line) ? asyncReplace(line) : line)
>     );
>     finalContent = processedLines.join('\n');
>   } else {
>     finalContent = await asyncReplace(content);
>   }
>
>   await writeFile(path, finalContent, 'utf8');
> }
>
> add tests to it as well

# Primary Objective
Add a flexible `replaceInFile` utility in the utils package that supports regex replace over the whole file or per-line, with string or (a)sync callback replacement.

# Open Questions
- [x] Should `replaceInFile` perform a no-op (no write) when no changes occur, or always write the file back?
    - Decision: no-op (do not write when unchanged)
- [x] Should line mode preserve the original newline style (`\n` vs `\r\n`) exactly, or is `\n` normalization acceptable?
    - Decision: preserve original EOLs
- [x] Should we support non-global regex (single replacement) or always treat `from` as global and replace all matches?
    - Decision: always global (replace all matches)

# Tasks
- [x] **TS001**: Identify the root cause of the problem
- [x] **TS002**: Create a failing test to isolate the problem, if unable to create a failing test STOP and report to the user
- [x] **TS003**: Confirm the root cause of the problem based on the failing test
- [x] **TS004**: Think very hard, step by step, to identify a solution, then STOP and:
    - Describe the problem as you understand it
    - Describe proposed solution
    - Iterate with the user on proposed solution
- [x] **TS005**: Write down follow up tasks needed to implement the solution
- [x] **TS006**: Implement `replaceInFile` in `packages/utils`
- [x] **TS006a**: Add detailed JSDoc for `replaceInFile`
- [x] **TS007**: Add tests for `replaceInFile`
- [x] **TS009**: Document `replaceInFile` in `packages/utils/README.md`
- [x] **TS010**: Update feature tracking (tasks, changelog, acceptance)
- [x] **TS008**: Run `bun lint`, `bun typecheck`, and `bun test` in the new worktree

# Acceptance Criteria
- [x] Primary objective is met
- [x] All temporary code is removed
- [x] All tasks are complete
- [x] Tests added for all new production features
- [x] Related READMEs and docs are updated
- [x] All code quality standards are met
- [x] All changes are checked into source control
- [x] All tests pass
- [x] All acceptance criteria are met
- [x] `bun lint`, `bun typecheck` and `bun test` commands runs successfully in the new worktree

# Change Log
- Workspace setup: created worktree `.tmp/worktrees/2025-12-18-replace-in-file` and branch `feature/2025-12-18/replace-in-file`.
- Added `replaceInFile` utility in `@dotfiles/utils` with async replacer support and no-op writes.
- Added tests for `replaceInFile` and documented it in `packages/utils/README.md`.
- Updated `replaceInFile` to accept an optional `fileSystem` and default to `NodeFileSystem`.
- Exported `replaceInFile` from `@dotfiles/cli` schema bundle (`packages/cli/src/schema-exports.ts`).
---
