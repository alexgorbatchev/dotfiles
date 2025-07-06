# Plan: `.env` to Layered `config.yaml` Migration

This document outlines the detailed, step-by-step plan to migrate the project's configuration from a `.env` file to a structured, layered `config.yaml` system. This migration will improve support for platform-specific features and enhance the overall maintainability of the configuration. The new system will use a `default-config.yaml` for base values, which can be selectively overridden by a user's local `config.yaml`.

---

### **Phase 1: Foundation & Schema Design (Revised)**

This phase establishes the new configuration structure and default values.

*   **Task 1.1: Define the Comprehensive & Required YAML Schema**
    *   **Action**: A Zod schema will be created in `src/modules/config/config.yaml.schema.ts` to enforce that all configuration keys are required. Default values will no longer be handled by the schema itself.
    *   **Action**: The corresponding TypeScript types in `src/types/config.yaml.types.ts` will be updated to reflect that all properties are required (except for the `platform` field, which is optional).
    *   **Action**: Within a `platform` entry, the `match` and `config` keys will be required.
    *   **Zod Schema (`config.yaml.schema.ts`)**:
        ```typescript
        import { z } from 'zod';

        const pathsConfigSchema = z.object({
          dotfilesDir: z.string(),
          targetDir: z.string(),
          generatedDir: z.string(),
          toolConfigsDir: z.string(),
          completionsDir: z.string(),
          manifestPath: z.string(),
        });

        const systemConfigSchema = z.object({
          sudoPrompt: z.string(),
        });

        const loggingConfigSchema = z.object({
          debug: z.string(),
        });

        const updatesConfigSchema = z.object({
          checkOnRun: z.boolean(),
          checkInterval: z.number(),
        });

        const gitHubCacheConfigSchema = z.object({
          enabled: z.boolean(),
          ttl: z.number(),
        });

        const gitHubConfigSchema = z.object({
          token: z.string(),
          host: z.string(),
          userAgent: z.string(),
          cache: gitHubCacheConfigSchema,
        });

        const downloaderCacheConfigSchema = z.object({
          enabled: z.boolean(),
        });

        const downloaderConfigSchema = z.object({
          timeout: z.number(),
          retryCount: z.number(),
          retryDelay: z.number(),
          cache: downloaderCacheConfigSchema,
        });

        const platformMatchSchema = z.object({
            os: z.enum(['macos', 'linux', 'windows']).optional(),
            arch: z.enum(['x86_64', 'arm64']).optional(),
        });

        const baseYamlConfigSchema = z.object({
          paths: pathsConfigSchema,
          system: systemConfigSchema,
          logging: loggingConfigSchema,
          updates: updatesConfigSchema,
          github: gitHubConfigSchema,
          downloader: downloaderConfigSchema,
        });

        // Use z.lazy() to handle recursive partial type for platform overrides
        const platformOverrideSchema = z.object({
          match: z.array(platformMatchSchema).nonempty(),
          config: z.lazy(() => yamlConfigSchema.partial()),
        });

        export const yamlConfigSchema = baseYamlConfigSchema.extend({
          platform: z.array(platformOverrideSchema).optional(),
        });
        ```

*   **Task 1.2: Create `default-config.yaml`**
    *   **Action**: A new `default-config.yaml` file will be created in the source tree (e.g., `src/config/`). This file will contain a complete set of all configuration keys with their default values.
    *   **`default-config.yaml` structure**:
        ```yaml
        # Default configuration values.
        # Users can override these in their local config.yaml.
        # Environment variables from process.env (e.g., ${VAR_NAME}) and other config values (e.g., ${paths.dotfilesDir}) can be used for substitution.

        paths:
          # Specifies the root directory of the dotfiles repository. Defaults to `~/.dotfiles`.
          dotfilesDir: ~/.dotfiles # Corresponds to DOTFILES_DIR
          # Sets the target directory where executable shims for tools will be placed. Defaults to `/usr/local/bin`.
          targetDir: /usr/local/bin # Corresponds to TARGET_DIR
          # Defines the directory where all generated files will be stored. Defaults to `${paths.dotfilesDir}/.generated`.
          generatedDir: ${paths.dotfilesDir}/.generated # Corresponds to GENERATED_DIR
          # Specifies the directory containing `*.tool.ts` tool configuration files. Defaults to `${paths.dotfilesDir}/generator/configs/tools`.
          toolConfigsDir: ${paths.dotfilesDir}/generator/configs/tools # Corresponds to TOOL_CONFIGS_DIR
          # Specifies the base directory where shell completion files should be installed. Defaults to `${paths.generatedDir}/completions`.
          completionsDir: ${paths.generatedDir}/completions # Corresponds to COMPLETIONS_DIR
          # Specifies the path to the manifest file that tracks all generated artifacts. Defaults to `${paths.generatedDir}/manifest.json`.
          manifestPath: ${paths.generatedDir}/manifest.json # Corresponds to GENERATED_ARTIFACTS_MANIFEST_PATH

        system:
          # Custom prompt message to display when `sudo` is required.
          sudoPrompt: "Enter password for generator:" # Corresponds to SUDO_PROMPT

        logging:
          # Controls debug logging output. Defaults to an empty string.
          debug: "" # Corresponds to DEBUG

        updates:
          # Determines if the tool should automatically check for updates on certain runs. Defaults to true.
          checkOnRun: true # Corresponds to CHECK_UPDATES_ON_RUN
          # Interval in seconds between automatic update checks for tools. Defaults to 86400 (24 hours).
          checkInterval: 86400 # Corresponds to UPDATE_CHECK_INTERVAL

        github:
          # GitHub Personal Access Token (PAT) for accessing the GitHub API.
          token: ${GITHUB_TOKEN} # Corresponds to GITHUB_TOKEN
          # Custom GitHub API host URL. Defaults to "https://api.github.com".
          host: https://api.github.com # Corresponds to GITHUB_HOST
          # Custom User-Agent string for requests made by the GitHub API client. Defaults to "dotfiles-generator".
          userAgent: "dotfiles-generator" # Corresponds to GITHUB_CLIENT_USER_AGENT
          cache:
            # Enables or disables caching for GitHub API responses. Defaults to true.
            enabled: true # Corresponds to GITHUB_API_CACHE_ENABLED
            # Time-to-live (TTL) in milliseconds for GitHub API cache entries. Defaults to 86400000 (24 hours).
            ttl: 86400000 # Corresponds to GITHUB_API_CACHE_TTL

        downloader:
          # Timeout in milliseconds for download operations. Defaults to 300000 (5 minutes).
          timeout: 300000 # Corresponds to DOWNLOAD_TIMEOUT
          # Number of retry attempts for failed downloads. Defaults to 3.
          retryCount: 3 # Corresponds to DOWNLOAD_RETRY_COUNT
          # Delay in milliseconds between download retry attempts. Defaults to 1000 (1 second).
          retryDelay: 1000 # Corresponds to DOWNLOAD_RETRY_DELAY
          cache:
            # Enables or disables caching for downloaded tool assets. Defaults to true.
            enabled: true # Corresponds to CACHE_ENABLED

        # Platform-specific overrides. This entire 'platform' key is optional.
        # If present, each entry requires 'match' and 'config' keys.
        # Merged on top of the base config in order.
        platform:
          - match:
              - os: macos
            config:
              paths:
                targetDir: /opt/homebrew/bin

          - match:
              - os: linux
                arch: arm64
            config:
              downloader:
                timeout: 600000
        ```

*   **Task 1.3: Update User `config.yaml` Role**
    *   **Action**: The user-facing `config.yaml` in the project root is now optional and serves as a partial override file. It only needs to contain the settings the user wishes to change from `default-config.yaml`.
    *   **Example `config.yaml`**:
        ```yaml
        # User-specific overrides.
        # These values will be merged on top of default-config.yaml.
        paths:
          dotfilesDir: ~/.dotfiles
          generatedDir: ${paths.dotfilesDir}/.generated/shim 

        updates:
          checkOnRun: false

        platform:
          - match:
              - os: macos
            config:
              downloader:
                timeout: 450000
        ```

---

### **Phase 2: Implement the New Layered Configuration Loader**

This phase involves building the logic to read, merge, and process the configuration files.

```mermaid
flowchart TD
    subgraph Phase 2: New Loader Logic
        A[Start: YamlConfigLoader.load()] --> B[Read & Parse `default-config.yaml`];
        B --> C{Read & Parse User `config.yaml` (if exists)};
        C --> D[Deep Merge User Config onto Default Config];
        D --> E[Validate Merged Config with Zod (all keys required)];
        E --> F[Perform Token Substitution (e.g., `${VAR_NAME}`)];
        F --> G[Return Final `AppConfig` Object];
    end
```

*   **Task 2.1: Implement `YamlConfigLoader` with Layering**
    *   **Action**: Create/update `src/modules/config-loader/YamlConfigLoader.ts`.
    *   **Action**: The `YamlConfigLoader.load(userConfigPath)` method will:
        1.  Read and parse the `default-config.yaml` from its source location.
        2.  Read and parse the user's `config.yaml` from `userConfigPath`. If it doesn't exist, use an empty object.
        3.  Perform a **deep merge** of the user's configuration on top of the default configuration.
        4.  Validate the final, merged object against the updated Zod schema, which now expects a complete configuration object.
        5.  Perform token substitution for values like `${VAR_NAME}` from both `process.env` and other values within the YAML file.
        6.  Return the final, fully-formed `AppConfig` object.

*   **Task 2.2: Deprecate `createAppConfig`**
    *   **Action**: The `createAppConfig` function in `src/modules/config/config.ts` will be deprecated and removed. Its logic will be moved into the `YamlConfigLoader` and the Zod schema.

---

### **Phase 3: Integration & Testing**

*   **Task 3.1: Create `createTestConfig` Helper**: This remains a valid requirement, but will be updated to support the new layered loading for more accurate testing.
*   **Task 3.2: Refactor Unit & E2E Tests**: This remains a valid requirement. Tests will be updated to use the new helper and pass the `--config` flag.
*   **Task 3.3: Integrate `YamlConfigLoader` into the CLI**: In `src/cli.ts`, `setupServices` will be updated to:
    1.  Instantiate `YamlConfigLoader`.
    2.  Call `loader.load(configPath)` to get the final `AppConfig` object.

---

### **Phase 4: Cleanup and Documentation**

*   **Task 4.1: Remove Old System**: Deprecate and remove `.env` loading via `dotenv` and the `createAppConfig` function.
*   **Task 4.2: Update Memory Bank**: Update all relevant Memory Bank documents to reflect the new, layered, and required-key YAML-based configuration system.