---
# User Prompt
> Follow instructions in [alex--feature--new.prompt.md](file:///Users/alex/.dotfiles/instructions/chat/prompts/alex--feature--new.prompt.md).
> should pass ctx: { configFileDir, sysmteInfo } as first argument

# Primary Objective
Update `defineConfig` and `loadTsConfig` to support passing a context object containing `configFileDir` and `systemInfo` to the configuration factory function.

# Open Questions
- [ ] None

# Tasks
- [x] **TS001**: Identify the root cause of the problem
- [x] **TS002**: Create a failing test to isolate the problem, if unable to create a failing test STOP and report to the user
- [x] **TS003**: Confirm the root cause of the problem based on the failing test
- [x] **TS004**: Think very hard, step by step, to identify a solution, then STOP and:
    - Describe the problem as you understand it
    - Describe proposed solution
    - Iterate with the user on proposed solution
- [x] **TS005**: Write down follow up tasks needed to implement the solution
- [x] **TS006**: Modify `packages/config/src/defineConfig.ts` to accept a context-aware factory and return it.
- [x] **TS007**: Modify `packages/config/src/tsConfigLoader.ts` to invoke the factory with the context.
- [x] **TS008**: Update `test-project/config.ts` to use the new context.
- [x] **TS009**: Fix and update all affected tests.

# Acceptance Criteria
- [x] Primary objective is met
- [x] Tests added for all new production features
- [x] Related READMEs and docs are updated
- [x] All code quality standards are met
- [x] All tests pass
- [x] All tasks are complete
- [x] All acceptance criteria are met


# Change Log
- Initial task creation.
---
