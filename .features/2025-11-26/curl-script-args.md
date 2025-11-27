---
# User Prompt
> Follow instructions in [new-feature.prompt.md](vscode-userdata:/Users/alex/Library/Application%20Support/Code/User/profiles/-4257d6dd/prompts/new-feature.prompt.md).
> we need to add support for args for   install('curl-script', {
>     url: 'https://fnm.vercel.app/install',
>     shell: 'bash',
> 
> currently, it's impossible to implement this kind of installation:     curl -fsSL https://fnm.vercel.app/install | bash -s -- --skip-shell --install-dir "$LOCAL_BIN"

# Primary Objective
Add support for passing arguments to the script in `curl-script` installer to enable complex installations like `fnm`.

# Open Questions
- [ ] None

# Tasks
- [x] **TS001**: Update `curl-script` installer schema to support `args` property.
- [x] **TS002**: Update `curl-script` installer implementation to pass `args` to the script.
- [x] **TS003**: Add tests for `curl-script` installer with args.

# Acceptance Criteria
- [x] Primary objective is met
- [x] All code quality standards are met
- [x] All tests pass
- [x] All tasks are complete
- [x] All acceptance criteria are met
- [x] `curl-script` installer supports `args` property.
- [x] `args` are passed to the script execution.

# Change Log
- Initialized feature file.
- Updated `curlScriptInstallParamsSchema` to include `args`.
- Updated `installFromCurlScript` to execute script with `args`.
- Added `shell.ts` wrapper for mocking.
- Added `installFromCurlScript.test.ts`.
- Resolved circular dependency between `installer` and `installer-curl-script` by removing `messages` import.
- Fixed test isolation issues by removing global module mock.
---
