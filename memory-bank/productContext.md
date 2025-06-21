# Product Context

This document describes the purpose and user experience goals for this dotfiles project, focusing on the development of a new TypeScript/Bun-based management tool.

## Why this project exists

This project is evolving to provide a more robust, centralized, and programmatic system for managing personal configuration files and tool installations across different machines. The goal is to move beyond manual shell scripting and leverage a modern language and toolchain (TypeScript/Bun) to build a dedicated dotfiles management application. This will ensure greater consistency, reliability, and maintainability.

## Problems it solves

- **Inconsistent Environments:** Provides a single source of truth (TypeScript config files) for tool installations and configurations, ensuring consistency.
- **Tedious Setup:** Automates the entire setup process (tool installation via shims, config linking, shell setup) with a single command from the management tool.
- **Lack of Version Control:** All configuration and management logic is version-controlled within the TypeScript files.
- **Poor Documentation:** The structure of the TypeScript configuration files inherently documents how each tool is installed and configured.
- **Tool Accessibility Issues:** Solves the problem of macOS applications not seeing user-installed tools by generating Bash shims in a global PATH location (`/usr/bin` or configurable).
- **Alias Limitations:** Replaces delayed-loading aliases with shims that are actual executables, resolving issues with other programs calling aliased commands.
- **Complex Shell Init:** Replaces scattered `init.zsh` files and the `alias-installer` with a single generated Zsh init file, simplifying shell startup.

## How it should work

The user will interact with a TypeScript/Bun command-line tool within the dotfiles repository. This tool will read tool configurations defined in TypeScript files and generate the necessary artifacts: Bash shims in a specified directory, a consolidated Zsh initialization file, and symbolic links for configuration files. The user's main shell profile will source the generated Zsh init file. Tool installation will happen on first execution via the shims. Updates will involve pulling the latest dotfiles and re-running the generator tool.

## User experience goals

- **Simplicity:** A single command should be sufficient to set up or update the entire dotfiles environment.
- **Consistency:** The environment and tool behavior should be identical across machines after running the generator.
- **Efficiency:** Tools should load quickly on first use via shims, and shell startup should remain fast. The management tool should be fast due to Bun.
- **Maintainability:** Tool configurations are defined in a clear, programmatic way (TypeScript). The management tool provides commands for cleanup, conflict detection, and managing lost shims.
- **Transparency:** The generated files (shims, init) should be understandable, and the management tool should provide clear output, including a dry-run mode.
