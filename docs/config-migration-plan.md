# Plan: `.env` to Layered `config.yaml` Migration

This document outlines the detailed, step-by-step plan to migrate the project's configuration from a `.env` file to a structured, layered `config.yaml` system.

## Mandatory Restrictions
- You can not make changes files outside of the module you are working on.
- You MUST use correct configuration values.

---

### **Phase 1: Foundation & Schema Design (Completed)**

This phase established the new configuration structure and default values.

*   **[x]** Defined the comprehensive Zod schema in `@modules/config`.
*   **[x]** Created `default-config.yaml` with all default values.
*   **[x]** Established that the user's `config.yaml` is an optional override file.

---

### **Phase 2: New Configuration Loader (Completed)**

This phase implemented the core logic for loading, merging, and validating the new YAML-based configuration.

*   **[x]** Implemented the `YamlConfigLoader` in `@modules/config-loader` to handle layering, token substitution, and platform-specific overrides.
*   **[x]** Implemented the `createMockYamlConfig` test helper in `@testing-helpers`.

---

### **Phase 3: Application-wide Migration to `YamlConfig`**

This phase focuses on incrementally migrating the entire application from the old `AppConfig` to the new `YamlConfig`.

*   **Core Strategy**:
    *   **Inside-Out Migration**: The migration will proceed one module at a time, starting with modules that have the fewest dependencies and moving towards the outer layers (like the CLI).
    *   **Per-Module Workflow**: For each module, the following steps must be completed before moving to the next:
        1.  **Update Implementation**: Refactor the module's functions and classes to accept and use the new `YamlConfig` object instead of `AppConfig`.
        2.  **Update Tests**: Refactor the module's tests to use the `createMockYamlConfig` helper.
        3.  **Verify**: Ensure all tests for the refactored module pass (`bun run test {file_path}`).
        4.  **Update Plan & Report**: After a module is migrated, the agent must update this migration plan by marking the corresponding task as complete (`[x]`). It must then stop and report the progress before proceeding to the next module.
    *   **No Type Casting**: The new `YamlConfig` must **not** be cast to the old `AppConfig` type (e.g., `YamlConfig as AppConfig`). The code must be refactored to use the `YamlConfig` type directly. `YamlConfig` is fully typed, all properties are defined and can be accessed directly like `yamlConfig.github.cache.ttl`.
    *   **Direct Property Access**: Always use direct property access (`config.value.value`) instead of optional chaining (`config.value?.value?`). All configuration properties are required and have defaults in the default config, so optional chaining is unnecessary.
    *   **No Defaults in Implementation**: Do not add default values in implementation code (e.g., `config.value || 'default'`). All defaults should come from the default config file. Implementation code should directly use the config values as they are guaranteed to exist.
    *   **Module-Specific Details**: Each module's migration will be handled on a case-by-case basis, addressing the specific configuration needs of that module.
    *   **Dependency Management**: During the transition period, modules will be migrated incrementally. Once the entire migration is complete, all dependencies will naturally align with the new configuration system. No adapters necessary, backward compatability is not necessary.
    *   **Testing Strategy**: Use `bun run test {file}` to verify each module after migration. All tests must pass before considering a module's migration complete.
    *   **Testing Conventions**:
        *   Use `MOCK_DEFAULT_CONFIG` from `@modules/config-loader/__tests__/fixtures` for the default configuration in tests.
        *   Use the `initialVolumeJson` property of the `createMemFileSystem` function to provide the default configuration.
        *   Use the `getDefaultConfigPath` helper function from `@modules/config-loader` to get the path to the default configuration file.
        *   Do not create single-use variables.
    *   **Validation Criteria**: A module is considered successfully migrated when:
        1.  All its code has been updated to use `YamlConfig` instead of `AppConfig`
        2.  All its tests have been updated to use `createMockYamlConfig`
        3.  All tests are passing

*   **[ ] Task 3.1: Migrate Core Modules**: This is the ordered list of modules to be migrated.
    *   **[x]** `github-client`: Migrate `GitHubApiClient` and `FileGitHubApiCache`.
    *   **[x]** `installer`: Depends on `github-client`.
    *   **[x]** `generator-symlink`: Depends on `file-system`.
    *   **[x]** `generator-shim`: Depends on `file-system`.
    *   **[x]** `generator-shell-init`: Depends on `file-system`.
*   **[ ] Task 3.2: Migrate Orchestrator & CLI**:
    *   **[x]** `generator-orchestrator`: Depends on all `generator-*` modules.
    *   **[ ]** `cli`: Migrate all commands in the following order:
        *   **[x]** `checkUpdatesCommand.ts`: Uses configuration for tool configs directory and GitHub API.
        *   **[ ]** `cleanupCommand.ts`: Handles cleanup of generated files based on configuration.
        *   **[ ]** `detectConflictsCommand.ts`: Detects conflicts in generated files.
        *   **[ ]** `installCommand.ts`: Installs tools based on configuration.
        *   **[ ]** `updateCommand.ts`: Updates installed tools.
        *   **[ ]** `generateCommand.ts`: Most complex command that generates all dotfiles.
        *   **[ ]** `src/cli.ts`: Main CLI entry point that sets up all services.

---

### **Phase 4: Finalization & Cleanup**

This is the final phase, to be executed only after all modules and the CLI have been fully migrated and all tests are passing.

*   **[ ] Task 4.1: Remove Old System**:
    *   **[ ]** Remove the `createAppConfig` function from `src/modules/config/config.ts`.
    *   **[ ]** Remove the `createMockAppConfig` helper from `src/testing-helpers/createMockAppConfig.ts`.
    *   **[ ]** Remove any remaining `.env` loading logic and dependencies (e.g., `dotenv`).
    *   **[ ]** Remove any unused imports or references to the old configuration system.
    *   **[ ]** Run `bun run lint` and `bun run test` to ensure no regressions were introduced during cleanup.
*   **[ ] Task 4.2: Documentation Updates**:
    *   **[ ]** Update all relevant Memory Bank documents to reflect the completed migration.
    *   **[ ]** Update internal documentation to reference the new configuration system.
*   **[ ] Task 4.3: Final Verification**:
    *   **[ ]** Run a full test (`bun run test`) suite to verify all functionality works with the new configuration system.
    *   **[ ]** Verify that all modules are correctly using the new `YamlConfig` type.
    *   **[ ]** Ensure no references to the old `AppConfig` type remain in the codebase.

---

### **Progress Summary**

*   **[x] Phase 1: Foundation & Schema Design**
*   **[x] Phase 2: New Configuration Loader**
*   **[ ] Phase 3: Application-wide Migration to `YamlConfig`**
*   **[ ] Phase 4: Finalization & Cleanup**
    *   **[ ] Task 4.1: Remove Old System**
    *   **[ ] Task 4.2: Documentation Updates**
    *   **[ ] Task 4.3: Final Verification**