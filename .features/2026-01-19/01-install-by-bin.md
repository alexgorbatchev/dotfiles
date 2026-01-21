# Task

> Update install command to be able to install by `.bin()` that is provided by one of the tools. It should find the right `.tool.ts` file by bin name and install it using the existing process. If a `.tool.ts` provides more than one bin, that's fine - the goal is to make it easier to call install for a specific `.tool.ts` file, NOT install a specific binary.

# Primary Objective

Enable the `dotfiles install <binary-name>` command to resolve a binary name to its corresponding tool configuration file and install the tool.

# Open Questions

- [x] Should we support partial binary name matching? **No, exact match only**
- [x] What should happen if multiple tools define the same binary? **Error with a clear message listing all matching tools**
- [x] Should we add a new flag like `--by-bin` or make it automatic? **Automatic - try tool name first, then fall back to binary name lookup**

# Tasks

- [x] **TS001**: Analyze the existing code to understand how tool configs define binaries and how the install command works
  - The install command is in `packages/cli/src/installCommand.ts`
  - It calls `configService.loadSingleToolConfig()` which looks for `.tool.ts` files by name
  - Tool configs define binaries via `.bin('name')` which gets stored in `toolConfig.binaries` array
  - Binary entries can be strings or `IBinaryConfig` objects with pattern-based location
- [x] **TS002**: Design the solution approach
  - Add a new function `findToolByBinary` in config package that scans all tool configs and finds one that defines the given binary
  - Modify `loadSingleToolConfig` or add a new method `loadToolConfigByBinary` to `IConfigService`
  - Update `installCommand.ts` to first try loading by tool name, then fall back to binary name lookup
- [x] **TS003**: Add `loadToolConfigByBinary` method to `IConfigService` interface
  - Add method signature to interface
  - Document the behavior
- [x] **TS004**: Implement `findToolByBinary` function in `loadToolConfigs.ts`
  - Scan all tool configs in directory
  - Check each config's `binaries` array for a match
  - Handle both string and `IBinaryConfig` binary definitions
  - Return the tool name if found, undefined otherwise
- [x] **TS005**: Implement `loadToolConfigByBinary` in `ConfigService.ts`
  - Use `findToolByBinary` to locate the tool name
  - Then use existing `loadSingleToolConfig` to load the full config
- [x] **TS006**: Update `installCommand.ts` to support binary name lookup
  - First try `loadSingleToolConfig` (existing behavior)
  - If not found, try `loadToolConfigByBinary` as fallback
  - Update error message to indicate that tool name OR binary name can be used
- [x] **TS007**: Write unit tests for `findToolByBinary` function
  - Test finding tool by exact binary name match
  - Test finding tool when binary is an `IBinaryConfig` object
  - Test returning undefined when binary not found
  - Test handling multiple tools (returns first match or errors)
- [x] **TS008**: Write unit tests for `loadToolConfigByBinary` integration
  - Test full flow from binary name to loaded tool config
- [x] **TS009**: Write integration test for install command with binary name
  - Test that `dotfiles install bat` installs the tool that defines `bat` binary
- [x] **TS010**: Update documentation
  - Update CLI AGENTS.md to document the new behavior
  - Update install command description
- [x] **TS011**: Run full test suite and verify all tests pass

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

# Change Log

- 2026-01-19: Created task file with initial analysis and task breakdown
- 2026-01-19: Completed TS001-TS002 - analyzed codebase and designed solution
- 2026-01-20: Completed TS003-TS011 - implemented feature, added tests, all tests pass
