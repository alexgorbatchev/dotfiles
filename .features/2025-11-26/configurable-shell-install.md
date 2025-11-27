---
# User Prompt
> system currently automatically adds source to zshrc and to bashrc, we need to make this configurable like so
> 
>   features: {
>     shellInstall: {
>       zsh: '~/.zshrc',
>       bash: '~/.bashrc',
>     },
> 
>     if these are missing, then source must not be added

# Primary Objective
Make shell initialization file paths configurable in the `features` section of the configuration, allowing users to specify custom paths for zsh and bash, or disable them by omitting the configuration.

# Open Questions
- [ ] Where is the current logic for adding source to shell rc files located?
- [ ] Where is the `features` configuration schema defined?
- [ ] What is the default behavior if `shellInstall` is not provided? (Presumably current behavior, or should it be explicit?)
- [ ] Should we support other shells? (User only mentioned zsh and bash)

# Tasks
- [x] **TS001**: Locate the configuration schema and update it to include `shellInstall` options.
- [x] **TS002**: Locate the shell initialization logic and update it to use the configured paths.
- [x] **TS003**: Implement logic to skip shell initialization if the configuration is missing for a specific shell.
- [x] **TS004**: Update tests to verify the new configuration options and behavior.

# Acceptance Criteria
- [x] Primary objective is met
- [x] All code quality standards are met
- [x] All tests pass
- [x] All tasks are complete
- [x] All acceptance criteria are met

# Change Log
- Initialized feature file.
- Updated `projectConfigSchema.ts` to include `shellInstall` configuration.
- Updated `IProfileUpdater.ts` and `ProfileUpdater.ts` to support custom profile paths.
- Updated `ShellInitGenerator.ts` to use the new configuration and handle defaults/skipping.
- Added `ShellInitGenerator--configurable-profiles.test.ts` to verify the new functionality.
- Verified all tests pass.
---
