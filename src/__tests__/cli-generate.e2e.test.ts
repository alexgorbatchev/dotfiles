/**
 * @fileoverview End-to-end tests for the `bun run cli generate` command.
 *
 * ## Development Plan
 *
 * ### Overall Task: Create E2E test for `bun ./src/cli.ts generate`
 * - [x] **Part 1: Create E2E Test File and Directory Structure (This file)**
 *   - [x] Create `generator/test/e2e/` directory.
 *   - [x] Create `generator/test/e2e/cli-generate.e2e.test.ts`.
 *   - [x] Add initial imports and development plan.
 * - [x] **Part 2: Implement Test Setup, CLI Execution, and Teardown (`beforeAll`)**
 *   - [x] Use `beforeAll` to:
 *     - [x] Create a unique temporary directory (and clean up previous).
 *     - [x] Define paths for `dotfilesDir`, `generatedDir`, `toolConfigsDir`, etc.
 *     - [x] Create necessary directories.
 *     - [x] Create an E2E-specific `.env` file with `DEBUG: ''` for the spawned CLI process.
 *     - [x] Copy tool configuration files (`fzf.tool.ts`, `lazygit.tool.ts`) into `toolConfigsDir`.
 *     - [x] Create dummy `02-configs/lazygit/config.yml` in `dotfilesDir` for symlink testing.
 *     - [x] Execute `bun ./src/cli.ts generate` using `Bun.spawnSync` with `DEBUG: ''` in its environment.
 *     - [x] Store CLI output (`stdout`, `stderr`, `exitCode`).
 *     - [x] Parse the generated manifest file.
 * - [x] **Part 3: Implement Granular Test Cases (`it` blocks)**
 *   - [x] `it('should execute the CLI successfully')`
 *   - [x] `it('should generate the correct shim files for fzf and lazygit')`
 *   - [x] `it('should generate the correct shell initialization file content')`
 *   - [x] `it('should create the expected symlinks for lazygit')`
 *   - [x] `it('should generate a manifest file with correct entries')`
 *   - [x] `it('should ensure symlink source files exist and are correctly linked')`
 * - [x] **Part 4: Adherence to Rules and Verification**
 *   - [x] Update development plan checklists in this file.
 *   - [x] (CI/User) Run *all* project tests (including this refactored E2E test).
 *   - [x] (CI/User) Run lint/type checks.
 * - [ ] **Part 5: Update Memory Bank**
 *   - [ ] Update `memory-bank/techContext.md` (Testing section).
 *   - [ ] Update `memory-bank/activeContext.md`.
 * - [ ] Write tests for the module. (This file is the test itself)
 * - [x] Cleanup all linting errors and warnings. (Will be attempted via `bun lint`)
 * - [x] Cleanup all comments that are no longer relevant (leaving development plan). (e.g. diagnostic logs, old log helper)
 * - [ ] Ensure 100% test coverage for executable code. (N/A for test file itself, but for the CLI it tests)
 * - [ ] Update the memory bank with the new information when all tasks are complete.
 * - [x] `it('should execute fzf shim, run mock fzf, and output version')`
 */

import { type ConfigEnvironment, createAppConfig } from '@modules/config';
import { beforeAll, describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import {
  createTestDirectories,
  executeCliCommand,
  setupEnvironmentVariables
} from '@testing-helpers';

describe('E2E: bun run cli generate', () => {
  let tempDir: string;
  let dotfilesDir: string;
  let generatedDir: string; // AppConfig.generatedDir
  let toolConfigsDir: string;
  let targetDirForShims: string; // AppConfig.targetDir (where shims are placed)
  let binariesDirForVerification: string; // AppConfig.binariesDir (where actual binaries are expected by shims)
  let zshInitDirForVerification: string;
  let lazygitSourceConfigPath: string; // Source for the lazygit config symlink
  let envVarsForCli: ConfigEnvironment;
  let appConfigForTestSetup: ReturnType<typeof createAppConfig>; // To get consistent paths

  // For CLI results and manifest, populated in beforeAll
  let cliExitCode: number | null;

  // Paths to generated artifacts, defined in beforeAll for clarity and use in 'it' blocks
  let fzfShimPath: string;
  let lazygitShimPath: string;
  let generatorCliShimPath: string; // Path to the generator's own shim
  let zshInitFilePath: string;
  let actualLazygitSymlinkLocation: string; // Where the lazygit symlink is created
  let expectedLazygitSymlinkTargetFile: string; // What the lazygit symlink should point to
  let manifestPathFromEnv: string; // Path to the manifest file as defined in env

  beforeAll(() => {
    // Create test directories
    const directories = createTestDirectories({
      testName: 'dotfiles-e2e-cli-generate',
      createLazygitConfigDir: true
    });
    
    // Destructure directory paths
    ({
      tempDir,
      dotfilesDir,
      generatedDir,
      toolConfigsDir,
      binariesDir: binariesDirForVerification
    } = directories);
    
    // Create a minimal AppConfig to get consistent paths for test setup
    const systemInfoForTestConfig = { homedir: tempDir, cwd: tempDir };
    const envForTestConfig: ConfigEnvironment = {
      DOTFILES_DIR: dotfilesDir,
    };
    appConfigForTestSetup = createAppConfig(systemInfoForTestConfig, envForTestConfig);
    
    // Set up custom directories not handled by createTestDirectories
    targetDirForShims = path.join(tempDir, '.local', 'bin');
    fs.mkdirSync(targetDirForShims, { recursive: true });
    
    zshInitDirForVerification = path.join(generatedDir, 'zsh');
    
    // Set up lazygit config path
    const lazygitSourceConfigDirInDotfiles = path.join(dotfilesDir, '02-configs', 'lazygit');
    lazygitSourceConfigPath = path.join(lazygitSourceConfigDirInDotfiles, 'config.yml');
    
    // Setup environment variables
    manifestPathFromEnv = path.join(generatedDir, 'generated-manifest.json');
    envVarsForCli = setupEnvironmentVariables({
      directories,
      additionalEnv: {
        DEBUG: '',
        TARGET_DIR: targetDirForShims, // Override the default TARGET_DIR
      }
    });
    
    // Additional environment variables
    const additionalEnvVarsForCli = {
      PATH: `${targetDirForShims}:${process.env['PATH']}`,
      HOME: tempDir,
    };

    // Copy tool configuration files
    const sourceTestFixturesDir = path.resolve(__dirname, 'fixtures');
    const fzfSourceToolPath = path.join(sourceTestFixturesDir, 'fzf.tool.ts');
    const lazygitSourceToolPath = path.join(sourceTestFixturesDir, 'lazygit.tool.ts');
    fs.copyFileSync(fzfSourceToolPath, path.join(toolConfigsDir, 'fzf.tool.ts'));
    fs.copyFileSync(lazygitSourceToolPath, path.join(toolConfigsDir, 'lazygit.tool.ts'));

    // Adjust import paths in copied fixtures
    [
      path.join(toolConfigsDir, 'fzf.tool.ts'),
      path.join(toolConfigsDir, 'lazygit.tool.ts'),
    ].forEach((filePath) => {
      let content = fs.readFileSync(filePath, 'utf-8');
      content = content.replace(
        /from ('|")\.\.\/\.\.\/types('|")/g,
        'from $1../../../../../types$2'
      );
      fs.writeFileSync(filePath, content);
    });

    // Create lazygit config file
    fs.writeFileSync(
      lazygitSourceConfigPath,
      '# Sample lazygit config for E2E test\nkeybinding:\n universal:\n quit: "q"'
    );

    // Define artifact paths
    fzfShimPath = path.join(targetDirForShims, 'fzf');
    lazygitShimPath = path.join(targetDirForShims, 'lazygit');
    generatorCliShimPath = path.join(targetDirForShims, appConfigForTestSetup.generatorCliShimName);
    zshInitFilePath = path.join(zshInitDirForVerification, 'init.zsh');
    actualLazygitSymlinkLocation = path.join(tempDir, '.config', 'lazygit', 'config.yml');
    expectedLazygitSymlinkTargetFile = lazygitSourceConfigPath;

    // Execute CLI command using helper function
    const result = executeCliCommand({
      command: ['generate'],
      env: envVarsForCli as Record<string, string>,
      additionalEnv: additionalEnvVarsForCli,
      homeDir: tempDir,
    });

    cliExitCode = result.exitCode;
  });

  it('should execute the CLI successfully', () => {
    expect(cliExitCode).toBe(0);
  });

  it('creates manifest file', () => {
    expect(fs.existsSync(manifestPathFromEnv)).toBe(true);
  });

  it('should generate the correct shim files for fzf and lazygit', () => {
    expect(fs.existsSync(fzfShimPath)).toBe(true);
    expect(fs.existsSync(lazygitShimPath)).toBe(true);
    expect(fs.existsSync(generatorCliShimPath)).toBe(true); // Check for generator's own shim

    [fzfShimPath, lazygitShimPath, generatorCliShimPath].forEach((shimP) => {
      const stat = fs.statSync(shimP);
      expect(stat.mode & 0o100).toBeGreaterThan(0); // Check executable
    });

    const fzfShimContent = fs.readFileSync(fzfShimPath, 'utf-8');
    const lazygitShimContent = fs.readFileSync(lazygitShimPath, 'utf-8');
    const expectedGeneratorCliShimPathInToolShim = path.join(
      targetDirForShims, // This is appConfig.targetDir for the CLI run
      appConfigForTestSetup.generatorCliShimName
    );

    // For fzf shim
    expect(fzfShimContent).toContain('#!/usr/bin/env bash');
    expect(fzfShimContent).toContain('TOOL_NAME="fzf"');
    // TOOL_EXECUTABLE will be in appConfig.binariesDir/fzf/fzf (derived from generatedDir)
    const expectedFzfBinaryPath = path.join(binariesDirForVerification, 'fzf', 'fzf');
    expect(fzfShimContent).toContain(`TOOL_EXECUTABLE="${expectedFzfBinaryPath}"`);
    expect(fzfShimContent).toContain(
      `GENERATOR_CLI_SHIM_NAME="${expectedGeneratorCliShimPathInToolShim}"`
    );
    expect(fzfShimContent).toContain(
      `"\${GENERATOR_CLI_SHIM_NAME}" install "\${TOOL_NAME}" --quiet`
    );

    // For lazygit shim
    expect(lazygitShimContent).toContain('#!/usr/bin/env bash');
    expect(lazygitShimContent).toContain('TOOL_NAME="lazygit"');
    const expectedLazygitBinaryPath = path.join(binariesDirForVerification, 'lazygit', 'lazygit');
    expect(lazygitShimContent).toContain(`TOOL_EXECUTABLE="${expectedLazygitBinaryPath}"`);
    expect(lazygitShimContent).toContain(
      `GENERATOR_CLI_SHIM_NAME="${expectedGeneratorCliShimPathInToolShim}"`
    );
    expect(lazygitShimContent).toContain(
      `"\${GENERATOR_CLI_SHIM_NAME}" install "\${TOOL_NAME}" --quiet`
    );
  });

  it('should generate the correct shell initialization file content', () => {
    expect(fs.existsSync(zshInitFilePath)).toBe(true);
    const zshInitContent = fs.readFileSync(zshInitFilePath, 'utf-8');
    expect(zshInitContent).toContain('# --- fzf ---');
    expect(zshInitContent).toContain(
      'export FZF_DEFAULT_OPTS="--color=fg+:cyan,bg+:black,hl+:yellow,pointer:blue"'
    );
    expect(zshInitContent).toContain('function fzf-jump-to-dir()');
    expect(zshInitContent).toContain('# --- lazygit ---');
    expect(zshInitContent).toContain('alias g="lazygit"');
  });

  it('should create the expected symlinks for lazygit and ensure source exists', () => {
    expect(fs.existsSync(actualLazygitSymlinkLocation)).toBe(true);
    const symlinkStats = fs.lstatSync(actualLazygitSymlinkLocation);
    expect(symlinkStats.isSymbolicLink()).toBe(true);

    const symlinkPointsTo = fs.readlinkSync(actualLazygitSymlinkLocation);
    const resolvedSymlinkPointsTo = path.resolve(
      path.dirname(actualLazygitSymlinkLocation),
      symlinkPointsTo
    );
    expect(resolvedSymlinkPointsTo).toBe(expectedLazygitSymlinkTargetFile);
    const symlinkTargetContent = fs.readFileSync(resolvedSymlinkPointsTo, 'utf-8');
    expect(symlinkTargetContent).toContain('# Sample lazygit config for E2E test');
  });

  it('should generate a manifest file with correct entries', () => {
    const parsedManifest = JSON.parse(fs.readFileSync(manifestPathFromEnv, 'utf-8'));
    expect(parsedManifest).not.toBeNull();
    if (!parsedManifest) return;

    expect(parsedManifest.lastGenerated).toBeDefined();
    expect(parsedManifest.shims).toBeInstanceOf(Array);
    // Order might vary, so check for presence
    expect(parsedManifest.shims).toContain(fzfShimPath);
    expect(parsedManifest.shims).toContain(lazygitShimPath);
    expect(parsedManifest.shims).toContain(generatorCliShimPath); // Generator's own shim

    expect(parsedManifest.shellInit).toBeDefined();
    expect(parsedManifest.shellInit.path).toBe(zshInitFilePath);

    expect(parsedManifest.symlinks).toBeInstanceOf(Array);
    expect(parsedManifest.symlinks.length).toBe(1);

    const lazygitSymlinkManifestEntry = parsedManifest.symlinks[0];
    expect(lazygitSymlinkManifestEntry.sourcePath).toBe(expectedLazygitSymlinkTargetFile);
    expect(lazygitSymlinkManifestEntry.targetPath).toBe(actualLazygitSymlinkLocation);
    expect(lazygitSymlinkManifestEntry.status).toBe('created');
    expect(lazygitSymlinkManifestEntry.error).toBeUndefined();
  });

  it('should execute fzf shim, run mock fzf, and output version', () => {
    // Mock fzf binary needs to be in the location the fzf SHIM expects:
    // appConfig.binariesDir / toolName / binaryName
    // binariesDirForVerification is appConfigForTestSetup.binariesDir
    const mockFzfToolDir = path.join(binariesDirForVerification, 'fzf');
    const mockFzfBinaryPath = path.join(mockFzfToolDir, 'fzf'); // Matches toolConfig.binaries[0] for fzf
    fs.mkdirSync(mockFzfToolDir, { recursive: true });

    const mockFzfScriptContent = `#!/usr/bin/env bash
      if [ "$1" = "--version" ]; then
        echo "0.1.2-mock-e2e"
        exit 0
      fi
      # If install was attempted, this mock won't be called first.
      # For this test, we assume the binary "exists" for the shim to exec directly.
      echo "Mock fzf called with: $@"
      exit 0 # Ensure mock exits cleanly
    `;
    fs.writeFileSync(mockFzfBinaryPath, mockFzfScriptContent);
    fs.chmodSync(mockFzfBinaryPath, 0o755);

    // Execute the fzf shim using the helper function
    const shimEnv = {
      ...envVarsForCli,
      PATH: `${targetDirForShims}:${binariesDirForVerification}:${process.env['PATH']}`,
    };
    
    const shimResult = executeCliCommand({
      command: ['--version'],
      env: shimEnv as Record<string, string>,
      homeDir: tempDir,
      cwd: path.dirname(fzfShimPath),
      // Override the default CLI entry point with the fzf shim path
      customCmd: [fzfShimPath]
    });
    
    expect(shimResult.exitCode).toBe(0);
    expect(shimResult.stdout.trim()).toBe('0.1.2-mock-e2e');
  });
});
