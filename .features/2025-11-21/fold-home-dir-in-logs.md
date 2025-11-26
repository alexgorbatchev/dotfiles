# User Prompt
> i want projectconfig.paths.home to be used to fold the home dir into ~/ here

User provided example output from CLI showing paths like:
```
INFO    11/21/2025 18:08:35 [rg] rm /Users/alex/Development/github/dotfiles-tool-installer/test-project/.generated/binaries/rg/15.1.0/ripgrep-15.1.0-aarch64-apple-darwin.tar.gz
INFO    11/21/2025 18:08:35 [rg] ln -s /Users/alex/Development/github/dotfiles-tool-installer/test-project/.generated/shell-scripts/zsh/completions/_rg /Users/alex/Development/github/dotfiles-tool-installer/test-project/.generated/binaries/rg/rg
INFO    11/21/2025 18:08:35 [rg] mkdir /Users/alex/Development/github/dotfiles-tool-installer/test-project/.generated/shell-scripts/zsh/completions
```

User wants these paths to be folded using projectConfig.paths.homeDir so they display as `~/...` instead of full absolute paths.

# Source Branch
main

# Primary Objective
Update TrackedFileSystem logging to use projectConfig.paths.homeDir for path folding instead of a separate homeDir parameter

# Open Questions
- [x] Should we also check other places in the codebase that might need similar updates?

# Tasks
- [x] **TS001**: Update TrackedFileSystem constructor to accept ProjectConfig instead of homeDir string
- [x] **TS002**: Update all instantiations of TrackedFileSystem to pass projectConfig
- [x] **TS003**: Update TrackedFileSystem to use projectConfig.paths.homeDir for path folding
- [x] **TS004**: Run tests to ensure all changes work correctly
- [x] **TS005**: Run linter and fix any issues

# Acceptance Criteria
- [x] Primary objective is met
- [x] All code quality standards are met
- [x] All tests pass
- [x] All tasks are complete
- [x] All acceptance criteria are met

# Change Log
- Created feature branch and work file
- Updated TrackedFileSystem to accept ProjectConfig instead of homeDir string
- Updated TrackedFileSystem to use projectConfig.paths.homeDir for path folding
- Updated all TrackedFileSystem instantiations across the codebase (tests and production)
- Updated cleanupCommand tests to reflect correct path folding expectations
- All tests passing, linter clean
- Committed changes
