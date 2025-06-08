/**
 * @file Implements the Shim Generator module.
 *
 * ## Development Plan
 *
 * - [x] Implement `ShimGenerator` class.
 *   - [x] Constructor with `IFileSystem` and `AppConfig` dependencies.
 *   - [x] Implement `generate` method.
 *   - [x] Implement `generateForTool` method.
 *     - [x] Determine shim directory from `AppConfig`.
 *     - [x] Get tool name for shim filename.
 *     - [x] Get expected tool binary path from `ToolConfig`.
 *     - [x] Get install command (path to main CLI tool from `AppConfig`).
 *     - [x] Create Bash shim content using template string.
 *     - [x] Use `IFileSystem.writeFile()` to write shim (behavior determined by injected `IFileSystem` type).
 *     - [x] Use `IFileSystem.chmod()` to make shim executable (behavior determined by injected `IFileSystem` type).
 *     - [x] Handle `overwrite` option.
 *     - [x] Correct `TOOL_EXECUTABLE` path to use `appConfig.binariesDir`.
 *   - [x] Update `generate` and `generateForTool` to return `Promise<string[]>`.
 *   - [x] Update to use absolute path for `INSTALL_TOOL` script in generated shims.
 *   - [x] Remove `INSTALL_TOOL` script fallback and use `generatorCliShimName install` directly.
 *   - [x] Update `GENERATOR_CLI_SHIM_NAME` in tool shims to use the full absolute path (`appConfig.binDir`/`appConfig.generatorCliShimName`).
 * - [x] Write tests for the module.
 * - [x] Refactor dry run mechanism:
 *   - [x] Remove internal `dryRun` logic.
 *   - [x] Rely on injected `IFileSystem` for dry/real run behavior.
 * - [x] Cleanup all linting errors and warnings.
 * - [x] Cleanup all comments that are no longer relevant (leaving development plan).
 * - [x] Ensure 100% test coverage for executable code.
 * - [ ] Update the memory bank with the new information when all tasks are complete.
 */

import path from 'node:path';
import { createLogger } from '../logger';
import type { IFileSystem } from '../file-system';
import type { AppConfig, ToolConfig } from '../../types';
import type { GenerateShimsOptions, IShimGenerator } from './IShimGenerator';

const log = createLogger('ShimGenerator');

export class ShimGenerator implements IShimGenerator {
  private readonly fs: IFileSystem;
  private readonly appConfig: AppConfig;

  constructor(fileSystem: IFileSystem, appConfig: AppConfig) {
    log('constructor: fileSystem=%o, appConfig=%o', fileSystem, appConfig);
    this.fs = fileSystem;
    this.appConfig = appConfig;
  }

  async generate(
    toolConfigs: Record<string, ToolConfig>,
    options?: GenerateShimsOptions
  ): Promise<string[]> {
    log('generate: toolConfigs=%o, options=%o', toolConfigs, options);
    const generatedShimPaths: string[] = [];

    // Generate the shim for the generator CLI itself first
    const generatorCliShimPath = await this._generateGeneratorCliShim(options);
    if (generatorCliShimPath) {
      generatedShimPaths.push(generatorCliShimPath);
    }

    for (const toolName in toolConfigs) {
      if (Object.prototype.hasOwnProperty.call(toolConfigs, toolName)) {
        const toolConfig = toolConfigs[toolName];
        if (toolConfig) {
          const shimPaths = await this.generateForTool(toolName, toolConfig, options);
          generatedShimPaths.push(...shimPaths);
        } else {
          log('generate: toolConfig for %s is undefined. Skipping.', toolName);
        }
      }
    }
    return generatedShimPaths;
  }

  async generateForTool(
    toolName: string,
    toolConfig: ToolConfig,
    options?: GenerateShimsOptions
  ): Promise<string[]> {
    log(
      'generateForTool: toolName=%s, toolConfig=%o, options=%o, FileSystem: %s',
      toolName,
      toolConfig,
      options,
      this.fs.constructor.name
    );

    // dryRun is removed; IFileSystem handles behavior
    const overwrite = options?.overwrite ?? false;

    const shimDir = this.appConfig.targetDir; // Changed from shimDir to targetDir
    if (!shimDir) {
      log(
        'generateForTool: targetDir (shimDir) is not configured in AppConfig. Skipping shim generation for %s.',
        toolName
      );
      // Potentially throw an error or return a status
      return [];
    }

    const shimFilePath = path.join(shimDir, toolName);
    log('generateForTool: shimFilePath=%s', shimFilePath);

    if (!overwrite && (await this.fs.exists(shimFilePath))) {
      log(
        'generateForTool: Shim already exists at %s and overwrite is false. Skipping.',
        shimFilePath
      );
      return [];
    }

    // Ensure toolConfig.binaries is defined and is an array
    const primaryBinaryName =
      toolConfig.binaries && Array.isArray(toolConfig.binaries) && toolConfig.binaries.length > 0
        ? toolConfig.binaries[0]! // Added non-null assertion
        : toolName; // Fallback to toolName if binaries are not well-defined

    const expectedToolBinaryPath = path.join(
      this.appConfig.binariesDir,
      toolConfig.name, // Use toolConfig.name for the tool-specific subdirectory
      primaryBinaryName
    );
    log('generateForTool: expectedToolBinaryPath=%s', expectedToolBinaryPath);

    // const cliToolPath = this.appConfig.generatorCliShimName; // Not directly used in template this way
    // log('generateForTool: cliToolPath=%s', cliToolPath);

    const shimContent = `#!/usr/bin/env bash
# Shim for ${toolName}
# Generated by Dotfiles Management Tool

TOOL_NAME="${toolName}"
TOOL_EXECUTABLE="${expectedToolBinaryPath}"
GENERATOR_CLI_SHIM_NAME="${this.appConfig.targetDir}/${this.appConfig.generatorCliShimName}"

if [ -x "$TOOL_EXECUTABLE" ]; then
  exec "$TOOL_EXECUTABLE" "$@"
else
  "\${GENERATOR_CLI_SHIM_NAME}" install "\${TOOL_NAME}" --quiet
  # Re-check after installation attempt
  if [ -x "$TOOL_EXECUTABLE" ]; then
    exec "$TOOL_EXECUTABLE" "$@"
  else
    echo "Failed to install '${toolName}' via \${GENERATOR_CLI_SHIM_NAME} or it's still not found at '$TOOL_EXECUTABLE'. Please check the installation."
    exit 1
  fi
fi
`;
    log('generateForTool: shimContent=\n%s', shimContent);

    // File system operations' behavior (dry or real) is determined by the injected IFileSystem.
    log(
      'generateForTool: Writing shim file to %s using %s',
      shimFilePath,
      this.fs.constructor.name
    );
    await this.fs.ensureDir(path.dirname(shimFilePath));
    await this.fs.writeFile(shimFilePath, shimContent);
    log(
      'generateForTool: Making shim executable: chmod +x %s using %s',
      shimFilePath,
      this.fs.constructor.name
    );
    await this.fs.chmod(shimFilePath, 0o755); // rwxr-xr-x
    log(
      'generateForTool: Shim for %s generated successfully at %s (using %s).',
      toolName,
      shimFilePath,
      this.fs.constructor.name
    );
    return [shimFilePath];
  }

  private async _generateGeneratorCliShim(options?: GenerateShimsOptions): Promise<string | null> {
    const generatorShimName = this.appConfig.generatorCliShimName;
    // Place the generator's shim in targetDir for consistency with other shims
    const shimDir = this.appConfig.targetDir;
    const shimFilePath = path.join(shimDir, generatorShimName);
    const overwrite = options?.overwrite ?? true; // Default to overwrite for the generator's own shim

    log(
      '_generateGeneratorCliShim: name=%s, path=%s, overwrite=%s',
      generatorShimName,
      shimFilePath,
      overwrite
    );

    if (!overwrite && (await this.fs.exists(shimFilePath))) {
      log(
        '_generateGeneratorCliShim: Shim already exists at %s and overwrite is false. Skipping.',
        shimFilePath
      );
      return null;
    }

    const generatorCliExecutablePath = path.join(
      this.appConfig.dotfilesDir,
      'generator',
      'dist',
      'cli'
    );

    const shimContent = `#!/usr/bin/env bash
# Shim for the main dotfiles CLI generator
# Generated by Dotfiles Management Tool

exec "${generatorCliExecutablePath}" "$@"
`;

    log('_generateGeneratorCliShim: Writing generator shim file to %s', shimFilePath);
    await this.fs.ensureDir(path.dirname(shimFilePath));
    await this.fs.writeFile(shimFilePath, shimContent);
    log('_generateGeneratorCliShim: Making generator shim executable: chmod +x %s', shimFilePath);
    await this.fs.chmod(shimFilePath, 0o755); // rwxr-xr-x
    log('_generateGeneratorCliShim: Generator shim generated successfully at %s.', shimFilePath);
    return shimFilePath;
  }
}
