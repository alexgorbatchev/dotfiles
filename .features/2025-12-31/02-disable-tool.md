# Task
> Add `install().disable()` method that skips the tool with a WARN message

# Primary Objective
Implement a `disable()` method on the tool config builder that marks the tool as disabled, causing it to be skipped during generation with a warning message.

# Open Questions
- [x] Where should the disabled state be stored? In ToolConfig as a new property via commonToolConfigPropertiesSchema.
- [x] Where should the disabled check happen? In GeneratorOrchestrator.generateAll when processing tools.
- [x] What should the warning message say? "Skipping disabled tool: {toolName}"

# Tasks
- [x] **TS001**: Identify the root cause of the problem - understand the full flow
- [x] **TS002**: Create a failing test to isolate the problem
- [x] **TS003**: Confirm the root cause of the problem based on the failing test
- [x] **TS004**: Design solution
- [x] **TS005**: Implement the solution
  - [x] Add `disabled` property to commonToolConfigPropertiesSchema in core
  - [x] Add `disable()` method to IToolConfigBuilder interface in core
  - [x] Implement `disable()` method in IToolConfigBuilder class (toolConfigBuilder.ts)
  - [x] Update GeneratorOrchestrator.generateAll to filter out disabled tools with WARN
- [x] **TS006**: Add tests
- [x] **TS007**: Verify all tests pass

# Acceptance Criteria
- [x] Primary objective is met
- [x] All temporary code is removed
- [x] All tasks are complete
- [x] Tests added for all new production features
- [x] Related READMEs and docs are updated
- [x] All code quality standards are met
- [x] All changes are checked into source control
- [x] All tests pass
- [x] `bun lint`, `bun typecheck` and `bun test` commands runs successfully
- [ ] `bun run build` completes successfully
- [ ] `.dist/cli.js` contains no external dependencies
- [x] Use `bun test-project` to generate and install tools, verify `.generated` directory is created correctly
- [x] Tests do not print anything to console
- [ ] All acceptance criteria are met

# Implementation Summary

## Files Modified

1. **packages/core/src/tool-config/base/commonToolConfigPropertiesSchema.ts**
   - Added `disabled: z.boolean().optional()` property to schema

2. **packages/core/src/builder/builder.types.ts**
   - Added `disable(): this` method signature to `IToolConfigBuilder` interface

3. **packages/tool-config-builder/src/toolConfigBuilder.ts**
   - Added `private isDisabled: boolean = false` field
   - Added `disable(): this` method implementation
   - Updated `buildBaseConfig()` to include `disabled` property when set

4. **packages/generator-orchestrator/src/GeneratorOrchestrator.ts**
   - Updated `generateAll()` to filter out disabled tools before processing
   - Logs warning for each disabled tool

5. **packages/generator-orchestrator/src/log-messages.ts**
   - Added `toolDisabled` message template

## Files Added (Tests)

1. **packages/tool-config-builder/src/__tests__/toolConfigBuilder.test.ts**
   - Added 4 tests for `disable()` method

2. **packages/generator-orchestrator/src/__tests__/GeneratorOrchestrator.test.ts**
   - Added 2 tests for disabled tools filtering

# Change Log
- Initial task file created
- Completed implementation of disable() feature
