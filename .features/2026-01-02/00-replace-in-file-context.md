# Task
> Add `replaceInFile` to `defineTool` context, wrapping the real function with a resolved file system.

# Primary Objective
Add a `replaceInFile` function to `IToolConfigContext` (used in `defineTool`) that wraps the existing utility with the resolved file system, update documentation including make-tool.prompt.md.

# Open Questions
- [x] Where should the file system be resolved from? **Answer**: The config loading already uses `IFileSystem`, but since `replaceInFile` requires `IResolvedFileSystem`, we need to pass a resolved file system to `createToolConfigContext`. Currently `loadToolConfigs` passes `IFileSystem`, so we'll need to create a `ResolvedFileSystem` wrapper in the context creation.

# Tasks
- [x] **TS001**: Identify the root cause of the problem
    - `IBaseToolContext` and `IToolConfigContext` do not have a `replaceInFile` method
    - The context is created in `createToolConfigContext` without file system access
    - Need to extend the interface and modify context creation
- [x] **TS002**: Design the solution
    - Extend `IBaseToolContext` to include `replaceInFile` method with simplified signature (no fileSystem arg)
    - Modify `createToolConfigContext` to accept a `IResolvedFileSystem` and create a bound `replaceInFile`
    - Update all callers of `createToolConfigContext` to pass file system
    - Update documentation in `context-api.md` and `make-tool.prompt.md`
- [x] **TS003**: Add `replaceInFile` type to `IBaseToolContext`
    - File: `packages/core/src/common/baseToolContext.types.ts`
    - Type: `(filePath: string, from: ReplaceInFilePattern, to: ReplaceInFileReplacer, options?: IReplaceInFileOptions) => Promise<void>`
- [x] **TS004**: Update `createToolConfigContext` to accept file system and bind `replaceInFile`
    - File: `packages/core/src/context/createToolConfigContext.ts`
    - Add `fileSystem: IResolvedFileSystem` parameter
    - Create bound `replaceInFile` function
- [x] **TS005**: Update all callers of `createToolConfigContext`
    - File: `packages/config/src/loadToolConfigs.ts` - need to create/use resolved file system
    - File: `packages/installer/src/Installer.ts` - already has `this.fs` which is `IResolvedFileSystem`
- [x] **TS006**: Update tests for `createToolConfigContext`
    - File: `packages/core/src/context/__tests__/createToolConfigContext.test.ts`
- [x] **TS007**: Update documentation in `docs/context-api.md`
    - Add `replaceInFile` method to the Properties table
    - Add usage example
- [x] **TS008**: Update documentation in `docs/prompts/make-tool.prompt.md`
    - Add `replaceInFile` to available context methods
    - Add usage example
- [x] **TS009**: Run `bun lint`, `bun typecheck`, `bun test`
- [x] **TS010**: Run `bun run build` and verify `.dist/cli.js`
- [x] **TS011**: Test with `bun test-project`

# Acceptance Criteria
- [x] Primary objective is met
- [x] All temporary code is removed
- [x] All tasks are complete
- [x] Tests added for all new production features
- [x] Related READMEs and docs are updated
- [x] All code quality standards are met
- [x] All changes are checked into source control
- [x] All tests pass
- [x] `bun lint`, `bun typecheck` and `bun test` commands run successfully
- [x] `bun run build` completes successfully
- [x] `.dist/cli.js` contains no external dependencies
- [x] Tests do not print anything to console

# Change Log
- Created task file and gathered context
- Implemented `replaceInFile` in `IBaseToolContext` and `createToolConfigContext`
- Updated all callers to pass resolved file system
- Updated tests and documentation
