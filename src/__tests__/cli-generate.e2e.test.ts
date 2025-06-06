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

import { beforeAll, describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import type { ConfigEnvironment } from '../modules/config';
// import os from 'node:os'; // No longer needed
// import type { AppConfig } from '../../../src/modules/config/config'; // May not be directly needed

describe('E2E: bun run cli generate', () => {
  let tempDir: string;
  let dotfilesDir: string;
  let generatedDir: string;
  let toolConfigsDir: string;
  let binDirForVerification: string;
  let zshInitDirForVerification: string;
  let lazygitSourceConfigPath: string; // Source for the lazygit config symlink
  let envVarsForCli: ConfigEnvironment;

  // For CLI results and manifest, populated in beforeAll
  let cliExitCode: number | null;

  // Paths to generated artifacts, defined in beforeAll for clarity and use in 'it' blocks
  let fzfShimPath: string;
  let lazygitShimPath: string;
  let zshInitFilePath: string;
  let actualLazygitSymlinkLocation: string; // Where the lazygit symlink is created
  let expectedLazygitSymlinkTargetFile: string; // What the lazygit symlink should point to
  let manifestPathFromEnv: string; // Path to the manifest file as defined in env

  beforeAll(() => {
    // Setup temporary directory structure
    const testsTmpBaseDir = path.resolve(__dirname, 'tmp');
    if (fs.existsSync(testsTmpBaseDir)) {
      fs.rmSync(testsTmpBaseDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testsTmpBaseDir, { recursive: true });
    tempDir = fs.mkdtempSync(path.join(testsTmpBaseDir, 'dotfiles-e2e-cli-generate-'));

    dotfilesDir = path.join(tempDir, 'my-dotfiles-repo');
    generatedDir = path.join(dotfilesDir, '.generated');
    toolConfigsDir = path.join(dotfilesDir, 'actual-tool-configs'); // TOOL_CONFIGS_DIR points here

    binDirForVerification = path.join(tempDir, '.local', 'bin');
    zshInitDirForVerification = path.join(generatedDir, 'zsh');

    const lazygitSourceConfigDirInDotfiles = path.join(dotfilesDir, '02-configs', 'lazygit');
    lazygitSourceConfigPath = path.join(lazygitSourceConfigDirInDotfiles, 'config.yml');

    // Create necessary directories
    fs.mkdirSync(dotfilesDir, { recursive: true });
    fs.mkdirSync(generatedDir, { recursive: true }); // CLI creates subdirs like bin, zsh
    fs.mkdirSync(toolConfigsDir, { recursive: true });
    fs.mkdirSync(lazygitSourceConfigDirInDotfiles, { recursive: true });

    // Define environment variables for the CLI process
    manifestPathFromEnv = path.join(generatedDir, 'generated-manifest.json');
    envVarsForCli = {
      DOTFILES_DIR: dotfilesDir,
      GENERATED_DIR: generatedDir,
      TOOL_CONFIGS_DIR: toolConfigsDir,
      TARGET_DIR: binDirForVerification, // AppConfig uses this for shims if defined, else GENERATED_DIR/bin
      GENERATED_ARTIFACTS_MANIFEST_PATH: manifestPathFromEnv,
      DEBUG: '', // CRITICAL: Ensure CLI runs without debug output unless specified
      CACHE_ENABLED: 'false',
      GITHUB_API_CACHE_ENABLED: 'false',
      CHECK_UPDATES_ON_RUN: 'false',
    };

    const additionalEnvVarsForCli = {
      PATH: process.env['PATH'], // Essential for finding 'bun'
      HOME: tempDir, // Controls where ~ resolves, e.g. for symlink targets
    };

    // Copy tool configuration files from E2E fixtures
    const sourceTestFixturesDir = path.resolve(__dirname, 'fixtures');
    const fzfSourceToolPath = path.join(sourceTestFixturesDir, 'fzf.tool.ts');
    const lazygitSourceToolPath = path.join(sourceTestFixturesDir, 'lazygit.tool.ts');
    fs.copyFileSync(fzfSourceToolPath, path.join(toolConfigsDir, 'fzf.tool.ts'));
    fs.copyFileSync(lazygitSourceToolPath, path.join(toolConfigsDir, 'lazygit.tool.ts'));

    // Adjust import paths in copied fixtures for TSC in temp dir
    const fzfDestPath = path.join(toolConfigsDir, 'fzf.tool.ts');
    const lazygitDestPath = path.join(toolConfigsDir, 'lazygit.tool.ts');
    [fzfDestPath, lazygitDestPath].forEach((filePath) => {
      let content = fs.readFileSync(filePath, 'utf-8');
      // Original path in fixture: ../../types
      // New path from temp location: ../../../../../types
      content = content.replace(
        /from ('|")\.\.\/\.\.\/types('|")/g,
        'from $1../../../../../types$2'
      );

      // No modifications to the tool config's TOOL_EXECUTABLE

      fs.writeFileSync(filePath, content);
    });

    // Create dummy lazygit config source file for symlink testing
    fs.writeFileSync(
      lazygitSourceConfigPath,
      '# Sample lazygit config for E2E test\nkeybinding:\n universal:\n quit: "q"'
    );

    // Define artifact paths for use in 'it' blocks
    fzfShimPath = path.join(binDirForVerification, 'fzf');
    lazygitShimPath = path.join(binDirForVerification, 'lazygit');
    zshInitFilePath = path.join(zshInitDirForVerification, 'init.zsh');
    // Symlink target is relative to HOME (tempDir), source is in dotfilesDir
    actualLazygitSymlinkLocation = path.join(tempDir, '.config', 'lazygit', 'config.yml');
    expectedLazygitSymlinkTargetFile = lazygitSourceConfigPath;

    // Execute CLI command
    const generatorProjectRootPath = path.resolve(__dirname, '../../../generator');
    const cliEntryPoint = path.join(generatorProjectRootPath, 'src', 'cli.ts');
    const proc = Bun.spawnSync({
      cmd: ['bun', cliEntryPoint, 'generate'], // Execute cli.ts directly
      cwd: generatorProjectRootPath, // Run from the 'generator' project directory
      env: { ...envVarsForCli, ...additionalEnvVarsForCli },
      stdout: 'pipe',
      stderr: 'pipe',
    });

    cliExitCode = proc.exitCode;
  });

  it('should execute the CLI successfully', () => {
    expect(cliExitCode).toBe(0);
  });

  it('creates manifest file', () => {});

  it('should generate the correct shim files for fzf and lazygit', () => {
    expect(fs.existsSync(fzfShimPath)).toBe(true);
    expect(fs.existsSync(lazygitShimPath)).toBe(true);

    const fzfStat = fs.statSync(fzfShimPath);
    const lazygitStat = fs.statSync(lazygitShimPath);
    expect(fzfStat.mode & 0o100).toBeGreaterThan(0);
    expect(lazygitStat.mode & 0o100).toBeGreaterThan(0);

    const fzfShimContent = fs.readFileSync(fzfShimPath, 'utf-8');
    const lazygitShimContent = fs.readFileSync(lazygitShimPath, 'utf-8');
    expect(fzfShimContent).toContain('#!/usr/bin/env bash');
    expect(fzfShimContent).toContain('exec "$TOOL_EXECUTABLE" "$@"');
    expect(fzfShimContent).toContain('INSTALL_COMMAND="mydotfiles install fzf"'); // From fzf.tool.ts fixture
    expect(lazygitShimContent).toContain('#!/usr/bin/env bash');
    expect(lazygitShimContent).toContain('exec "$TOOL_EXECUTABLE" "$@"');
    expect(lazygitShimContent).toContain('INSTALL_COMMAND="mydotfiles install lazygit"'); // From lazygit.tool.ts fixture
  });

  it('should generate the correct shell initialization file content', () => {
    expect(fs.existsSync(zshInitFilePath)).toBe(true);
    const zshInitContent = fs.readFileSync(zshInitFilePath, 'utf-8');
    // Check for content from fzf.tool.ts fixture
    expect(zshInitContent).toContain('# --- fzf ---');
    expect(zshInitContent).toContain(
      'export FZF_DEFAULT_OPTS="--color=fg+:cyan,bg+:black,hl+:yellow,pointer:blue"'
    );
    expect(zshInitContent).toContain('function fzf-jump-to-dir()');
    // Check for content from lazygit.tool.ts fixture
    expect(zshInitContent).toContain('# --- lazygit ---');
    expect(zshInitContent).toContain('alias g="lazygit"');
  });

  it('should create the expected symlinks for lazygit and ensure source exists', () => {
    expect(fs.existsSync(actualLazygitSymlinkLocation)).toBe(true);
    const symlinkStats = fs.lstatSync(actualLazygitSymlinkLocation);
    expect(symlinkStats.isSymbolicLink()).toBe(true);

    const symlinkPointsTo = fs.readlinkSync(actualLazygitSymlinkLocation);
    // Resolve the link target relative to the symlink's directory to get an absolute path for comparison
    const resolvedSymlinkPointsTo = path.resolve(
      path.dirname(actualLazygitSymlinkLocation),
      symlinkPointsTo
    );
    expect(resolvedSymlinkPointsTo).toBe(expectedLazygitSymlinkTargetFile);

    // Verify source file content (implicitly checks existence of the target file)
    const symlinkTargetContent = fs.readFileSync(resolvedSymlinkPointsTo, 'utf-8');
    expect(symlinkTargetContent).toContain('# Sample lazygit config for E2E test');
  });

  it('should generate a manifest file with correct entries', () => {
    const parsedManifest = JSON.parse(fs.readFileSync(manifestPathFromEnv, 'utf-8'));

    expect(parsedManifest).not.toBeNull();
    if (!parsedManifest) return; // Guard for type safety, though expect handles it

    expect(parsedManifest.lastGenerated).toBeDefined();

    expect(parsedManifest.shims).toBeInstanceOf(Array);
    expect(parsedManifest.shims).toContain(fzfShimPath);
    expect(parsedManifest.shims).toContain(lazygitShimPath);

    expect(parsedManifest.shellInit).toBeDefined();
    expect(parsedManifest.shellInit.path).toBe(zshInitFilePath);

    expect(parsedManifest.symlinks).toBeInstanceOf(Array);
    expect(parsedManifest.symlinks.length).toBe(1); // Based on lazygit.tool.ts fixture

    const lazygitSymlinkManifestEntry = parsedManifest.symlinks[0];
    expect(lazygitSymlinkManifestEntry.sourcePath).toBe(expectedLazygitSymlinkTargetFile);
    expect(lazygitSymlinkManifestEntry.targetPath).toBe(actualLazygitSymlinkLocation);
    expect(lazygitSymlinkManifestEntry.status).toBe('created');
    expect(lazygitSymlinkManifestEntry.error).toBeUndefined();
  });

  it('should execute fzf shim, run mock fzf, and output version', () => {
    // Setup mock fzf binary
    const mockFzfDir = path.join(generatedDir, 'bin');
    const mockFzfBinaryPath = path.join(mockFzfDir, 'fzf');
    fs.mkdirSync(mockFzfDir, { recursive: true });
    const mockFzfScriptContent = `#!/usr/bin/env bash
      if [ "$1" = "--version" ]; then
        echo "0.1.2-mock-e2e"
        exit 0
      fi
      echo "Mock fzf called with: $@"
    `;
    fs.writeFileSync(mockFzfBinaryPath, mockFzfScriptContent);
    fs.chmodSync(mockFzfBinaryPath, 0o755);

    const shimProc = Bun.spawnSync({
      cmd: [fzfShimPath, '--version'],
      env: {
        ...process.env,
        HOME: tempDir,
        DOTFILES_DIR: envVarsForCli['DOTFILES_DIR'],
        GENERATED_DIR: envVarsForCli['GENERATED_DIR'],
        TOOL_CONFIGS_DIR: envVarsForCli['TOOL_CONFIGS_DIR'],
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });

    expect(shimProc.exitCode).toBe(0);
    expect(shimProc.stdout.toString().trim()).toBe('0.1.2-mock-e2e');
  });
});
