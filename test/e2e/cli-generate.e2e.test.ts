/**
 * @fileoverview End-to-end tests for the `bun run cli generate` command.
 *
 * ## Development Plan
 *
 * ### Overall Task: Create E2E test for `bun ./src/cli.ts generate`
 * - [ ] **Part 1: Create E2E Test File and Directory Structure (This file)**
 *   - [x] Create `generator/test/e2e/` directory.
 *   - [x] Create `generator/test/e2e/cli-generate.e2e.test.ts`.
 *   - [x] Add initial imports and development plan.
 * - [ ] **Part 2: Implement Test Setup and Teardown (`beforeEach`/`afterEach`)**
 *   - [x] Use `beforeEach` to:
 *     - [x] Create a unique temporary directory.
 *     - [x] Define paths within this temporary directory for `dotfilesDir`, `generatedDir`, `toolConfigsDir`, `binDir`, `zshInitDir`, `manifestPath`.
 *     - [x] Create these directories.
 *     - [x] Create an E2E-specific `.env` file with paths pointing to the temporary subdirectories and `DEBUG=dot:*`.
 *     - [x] Copy `fzf.tool.ts` and `lazygit.tool.ts` into `toolConfigsDir`.
 *     - [x] Create dummy `02-configs/lazygit/config.yml` in `dotfilesDir` for symlink testing.
 *   - [x] Use `afterEach` to recursively delete the temporary directory.
 * - [x] **Part 3: Write the E2E Test Case**
 *   - [x] `it('should generate artifacts correctly for fzf and lazygit', async () => { ... })`
 *   - [x] **Execute CLI:**
 *     - [x] Use `Bun.spawnSync` for `bun ./src/cli.ts generate` with custom env (cwd: `generator/`).
 *     - [x] Capture `stdout`, `stderr`, `exitCode`. Assert `exitCode` is 0.
 *   - [x] **Verify Generated Artifacts:**
 *     - [x] Shims: existence, executability, content (e.g., `tempDir/my-dotfiles-repo/.generated/bin/fzf`).
 *     - [x] Shell Init File: existence, content (e.g., `tempDir/my-dotfiles-repo/.generated/zsh/init.zsh`).
 *     - [x] Symlinks: existence, target (e.g., `tempDir/my-dotfiles-repo/.config/lazygit/config.yml` -> `tempDir/my-dotfiles-repo/02-configs/lazygit/config.yml`).
 *     - [x] Manifest File: existence, content (e.g., `tempDir/my-dotfiles-repo/.generated/generated-manifest.json`).
 * - [x] **Part 4: Adherence to Rules and Verification**
 *   - [x] Update development plan checklists in this file.
 *   - [x] (Manual Step by User/CI) Run *all* project tests (including this new E2E test).
 *   - [x] (Manual Step by User/CI) Run lint/type checks.
 * - [ ] **Part 5: Update Memory Bank**
 *   - [ ] Update `memory-bank/techContext.md` (Testing section).
 *   - [ ] Update `memory-bank/activeContext.md`.
 * - [ ] Write tests for the module. (This file is the test itself)
 * - [ ] Cleanup all linting errors and warnings.
 * - [ ] Cleanup all comments that are no longer relevant (leaving development plan).
 * - [ ] Ensure 100% test coverage for executable code. (N/A for test file itself, but for the CLI it tests)
 * - [ ] Update the memory bank with the new information when all tasks are complete.
 */

import { beforeEach, describe, expect, it } from 'bun:test'; // Removed afterEach
import fs from 'node:fs';
import path from 'node:path';
// import os from 'node:os'; // No longer needed after symlink assertion changes
// import type { AppConfig } from '../../../src/modules/config/config'; // May not be directly needed if .env handles all

const createLogger = (name: string) => {
  // Dummy logger for tests, or use actual if side effects are acceptable/intended
  return (...args: any[]) => console.log(`[${name}]`, ...args);
};
const log = createLogger('cli-generate.e2e.test.ts');

describe('E2E: bun run cli generate', () => {
  let tempDir: string;
  let dotfilesDir: string;
  let generatedDir: string;
  let toolConfigsDir: string;
  let binDirForVerification: string; // For verification checks
  let zshInitDirForVerification: string; // For verification checks
  // let manifestPathForVerification: string; // For verification - will use generatedArtifactsManifestPath from env
  let envFilePath: string; // Path to the .env.e2e file
  let lazygitSourceConfigDir: string;
  let lazygitSourceConfigPath: string;
  let envVarsForCli: Record<string, string | undefined>; // For Bun.spawnSync

  beforeEach(() => {
    log('beforeEach: Setting up temporary directory and test environment...');
    // Define the base temporary directory within the test structure
    const testsTmpBaseDir = path.resolve(__dirname, '__tests__', 'tmp');

    // Clean up the base temporary directory before each test
    if (fs.existsSync(testsTmpBaseDir)) {
      fs.rmSync(testsTmpBaseDir, { recursive: true, force: true });
      log('Cleaned up existing testsTmpBaseDir:', testsTmpBaseDir);
    }
    // Ensure the base temporary directory exists
    fs.mkdirSync(testsTmpBaseDir, { recursive: true });

    // Create a unique temporary directory inside it for this specific test run
    tempDir = fs.mkdtempSync(path.join(testsTmpBaseDir, 'dotfiles-e2e-cli-generate-'));
    log('Created tempDir for current test run:', tempDir);

    dotfilesDir = path.join(tempDir, 'my-dotfiles-repo');
    generatedDir = path.join(dotfilesDir, '.generated');
    toolConfigsDir = path.join(dotfilesDir, 'actual-tool-configs'); // This is where TOOL_CONFIGS_DIR will point

    // Paths for verification, derived based on how AppConfig sets them from GENERATED_DIR
    binDirForVerification = path.join(generatedDir, 'bin');
    zshInitDirForVerification = path.join(generatedDir, 'zsh');

    lazygitSourceConfigDir = path.join(dotfilesDir, '02-configs', 'lazygit');
    lazygitSourceConfigPath = path.join(lazygitSourceConfigDir, 'config.yml');

    // Create directories
    fs.mkdirSync(dotfilesDir, { recursive: true });
    fs.mkdirSync(generatedDir, { recursive: true }); // cli will create subdirs like bin, zsh
    fs.mkdirSync(toolConfigsDir, { recursive: true });
    fs.mkdirSync(lazygitSourceConfigDir, { recursive: true });
    log('Created core directories within tempDir:', {
      dotfilesDir,
      generatedDir,
      toolConfigsDir,
      lazygitSourceConfigDir,
    });

    // Define environment variables for the CLI process
    const generatedArtifactsManifestPath = path.join(generatedDir, 'generated-manifest.json');
    // Critical: These env vars will override any defaults or .env from the project root
    // when Bun.spawnSync is called with this env object.
    envVarsForCli = {
      // Paths should be absolute for clarity in E2E tests
      DOTFILES_DIR: dotfilesDir,
      GENERATED_DIR: generatedDir,
      TOOL_CONFIGS_DIR: toolConfigsDir, // CLI will read *.tool.ts from here
      TARGET_DIR: binDirForVerification, // Shims will be written here by the CLI
      GENERATED_ARTIFACTS_MANIFEST_PATH: generatedArtifactsManifestPath, // Manifest will be written here
      // DEBUG: 'dot:*,generator:*', // Enable extensive logging for E2E debugging
      CACHE_ENABLED: 'false', // Disable caching for test isolation
      GITHUB_API_CACHE_ENABLED: 'false', // Disable GitHub API caching for isolation
      CHECK_UPDATES_ON_RUN: 'false', // Disable update checks during E2E tests
      // Unset other potentially interfering variables or ensure they are controlled.
      // Spreading process.env can be risky if it contains conflicting settings.
      // It's safer to explicitly list what's needed or known to be safe.
      // For this E2E, we want maximum isolation.
      PATH: process.env['PATH'], // Keep PATH so bun/node can be found
      HOME: tempDir, // Simulate a clean home directory for tilde expansion if any part of CLI uses it
    };

    // Create an .env.e2e file (primarily for reference, Bun.spawnSync's env option is king)
    envFilePath = path.join(tempDir, '.env.e2e'); // Place it outside dotfilesDir to avoid CLI picking it up by default
    const envFileContentEntries = [];
    for (const key in envVarsForCli) {
      const value = envVarsForCli[key];
      if (value !== undefined) {
        envFileContentEntries.push(`${key}=${value}`);
      }
    }
    fs.writeFileSync(envFilePath, envFileContentEntries.join('\n'));
    log('Created .env.e2e file at:', envFilePath, 'with relevant CLI overrides.');

    // Copy tool configuration files from the E2E test fixtures directory
    const sourceToolConfigsDir = path.resolve(__dirname, '__tests__', 'fixtures'); // Use local E2E fixtures

    const fzfSourcePath = path.join(sourceToolConfigsDir, 'fzf.tool.ts');
    const lazygitSourcePath = path.join(sourceToolConfigsDir, 'lazygit.tool.ts');

    if (!fs.existsSync(fzfSourcePath)) {
      throw new Error(`E2E setup error: Source fzf.tool.ts not found at ${fzfSourcePath}`);
    }
    if (!fs.existsSync(lazygitSourcePath)) {
      throw new Error(`E2E setup error: Source lazygit.tool.ts not found at ${lazygitSourcePath}`);
    }

    fs.copyFileSync(fzfSourcePath, path.join(toolConfigsDir, 'fzf.tool.ts'));
    fs.copyFileSync(lazygitSourcePath, path.join(toolConfigsDir, 'lazygit.tool.ts'));
    log('Copied tool configs from project to temporary directory:', toolConfigsDir);

    // Create dummy lazygit config source file for symlink testing
    fs.writeFileSync(
      lazygitSourceConfigPath,
      '# Sample lazygit config for E2E test\nkeybinding:\n universal:\n quit: "q"'
    );
    log('Created dummy lazygit source config at:', lazygitSourceConfigPath);
    log('beforeEach setup complete.');
  });

  // afterEach is removed as cleanup is now done in beforeEach to ensure a clean state for every test.

  it('should generate artifacts correctly for fzf and lazygit', () => {
    log(
      'Test: should generate artifacts correctly for fzf and lazygit. CWD for spawn will be generator_path'
    );

    const generatorPath = path.resolve(__dirname, '../../../generator'); // Assuming test is in generator/test/e2e
    log('Resolved generator path for CWD:', generatorPath);
    if (!fs.existsSync(generatorPath) || !fs.statSync(generatorPath).isDirectory()) {
      throw new Error(
        `E2E test setup error: generator path for CWD does not exist or is not a directory: ${generatorPath}`
      );
    }
    // Also check for cli.ts in generatorPath
    if (!fs.existsSync(path.join(generatorPath, 'cli.ts'))) {
      // This check assumes cli.ts is the entry point for `bun run cli` from within `generator` dir.
      // Adjust if `bun run cli` resolves to a different file (e.g. in package.json scripts)
      log(
        `Note: cli.ts not found directly in ${generatorPath}. Assuming 'bun run cli' resolves entry point correctly.`
      );
    }

    log('Executing "bun run cli generate" with env:', envVarsForCli);
    const proc = Bun.spawnSync({
      cmd: ['bun', './src/cli.ts', 'generate'], // Execute cli.ts directly
      cwd: generatorPath, // Run from the 'generator' directory
      env: envVarsForCli,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const stdout = proc.stdout ? proc.stdout.toString() : '';
    const stderr = proc.stderr ? proc.stderr.toString() : '';

    log('CLI stdout:\n', stdout);
    if (stderr) {
      // Log stderr for debugging, but don't fail test solely on stderr content unless it's an error indicator
      console.error('CLI stderr:\n', stderr);
    }

    expect(proc.exitCode).toBe(0);
    // Add more assertions for stdout/stderr if needed, e.g., specific log messages indicating success

    // --- Artifact Verification ---
    log('Verifying generated artifacts...');

    // 1. Verify Shims
    const fzfShimPath = path.join(binDirForVerification, 'fzf');
    const lazygitShimPath = path.join(binDirForVerification, 'lazygit');

    expect(fs.existsSync(fzfShimPath)).toBe(true);
    expect(fs.existsSync(lazygitShimPath)).toBe(true);
    log('Shims exist:', { fzfShimPath, lazygitShimPath });

    // Verify executable permissions
    const fzfStat = fs.statSync(fzfShimPath);
    const lazygitStat = fs.statSync(lazygitShimPath);
    expect(fzfStat.mode & 0o100).toBeGreaterThan(0); // Check owner execute bit
    expect(lazygitStat.mode & 0o100).toBeGreaterThan(0); // Check owner execute bit
    log('Shims are executable.');

    // Verify shim content (basic check)
    const fzfShimContent = fs.readFileSync(fzfShimPath, 'utf-8');
    const lazygitShimContent = fs.readFileSync(lazygitShimPath, 'utf-8');
    expect(fzfShimContent).toContain('#!/usr/bin/env bash');
    expect(fzfShimContent).toContain('exec "$TOOL_EXECUTABLE" "$@"');
    expect(fzfShimContent).toContain('INSTALL_COMMAND="mydotfiles install fzf"');
    expect(lazygitShimContent).toContain('#!/usr/bin/env bash');
    expect(lazygitShimContent).toContain('exec "$TOOL_EXECUTABLE" "$@"');
    expect(lazygitShimContent).toContain('INSTALL_COMMAND="mydotfiles install lazygit"');
    log('Shim content basic check passed.');

    // 2. Verify Shell Init File (zsh/init.zsh)
    const zshInitFilePath = path.join(zshInitDirForVerification, 'init.zsh');
    expect(fs.existsSync(zshInitFilePath)).toBe(true);
    const zshInitContent = fs.readFileSync(zshInitFilePath, 'utf-8');
    expect(zshInitContent).toContain('# --- fzf ---'); // Corrected assertion
    expect(zshInitContent).toContain(
      'export FZF_DEFAULT_OPTS="--color=fg+:cyan,bg+:black,hl+:yellow,pointer:blue"'
    );
    expect(zshInitContent).toContain('function fzf-jump-to-dir()');
    expect(zshInitContent).toContain('# --- lazygit ---'); // Corrected assertion
    expect(zshInitContent).toContain('alias g="lazygit"');
    log('Zsh init file content check passed.');

    // 3. Verify Symlinks (lazygit config)
    // The symlink operation in `lazygit.tool.ts` is:
    // c.symlink('02-configs/lazygit/config.yml', '.config/lazygit/config.yml');
    // Source is relative to `dotfilesDir`. Target is relative to `HOME` (which is `tempDir` in test).
    // So, the symlink should be created at: `tempDir/.config/lazygit/config.yml` (the "home" relative target)
    // And it should point to: `dotfilesDir/02-configs/lazygit/config.yml` (the source file)

    // So, the symlink should be created at: `tempDir/.config/lazygit/config.yml` (the "home" relative target)
    // And it should point to: `dotfilesDir/02-configs/lazygit/config.yml` (the source file)

    const actualSymlinkLocation = path.join(tempDir, '.config', 'lazygit', 'config.yml');
    const expectedSymlinkTargetFile = lazygitSourceConfigPath; // This is the source file the symlink should point to

    expect(fs.existsSync(actualSymlinkLocation)).toBe(true); // Test will fail here if generator bug persists
    const symlinkStats = fs.lstatSync(actualSymlinkLocation);
    expect(symlinkStats.isSymbolicLink()).toBe(true);

    const symlinkPointsTo = fs.readlinkSync(actualSymlinkLocation);
    // Resolve it relative to the symlink's directory to get an absolute path for comparison.
    const resolvedSymlinkPointsTo = path.resolve(
      path.dirname(actualSymlinkLocation),
      symlinkPointsTo
    );
    expect(resolvedSymlinkPointsTo).toBe(expectedSymlinkTargetFile);
    log('Lazygit config symlink verified to be in tempDir and pointing correctly.');

    const symlinkTargetContent = fs.readFileSync(resolvedSymlinkPointsTo, 'utf-8');
    expect(symlinkTargetContent).toContain('# Sample lazygit config for E2E test');
    log('Lazygit symlink content verified.');

    // 4. Verify Manifest File
    const manifestFilePath = envVarsForCli['GENERATED_ARTIFACTS_MANIFEST_PATH'];
    expect(manifestFilePath).toBeDefined();
    // @ts-ignore manifestFilePath is checked for undefined already
    expect(fs.existsSync(manifestFilePath!)).toBe(true);
    // @ts-ignore manifestFilePath is checked for undefined already
    const manifestContent = JSON.parse(fs.readFileSync(manifestFilePath!, 'utf-8'));

    expect(manifestContent.lastGenerated).toBeDefined(); // Changed from generatedAt, version seems removed

    // Verify shims are listed in the manifest
    expect(manifestContent.shims).toBeInstanceOf(Array);
    expect(manifestContent.shims).toContain(fzfShimPath);
    expect(manifestContent.shims).toContain(lazygitShimPath);

    // Verify shellInit path in the manifest
    expect(manifestContent.shellInit).toBeDefined();
    expect(manifestContent.shellInit.path).toBe(zshInitFilePath);

    // Verify symlinks in the manifest
    expect(manifestContent.symlinks).toBeInstanceOf(Array);
    expect(manifestContent.symlinks.length).toBe(1);
    const lazygitSymlinkManifest = manifestContent.symlinks[0];

    // The manifest stores absolute paths for sourcePath and targetPath (linkPath)
    // Note: expectedSymlinkTargetFile is the source of the link, actualSymlinkLocation is where the link is.
    expect(lazygitSymlinkManifest.sourcePath).toBe(expectedSymlinkTargetFile);
    expect(lazygitSymlinkManifest.targetPath).toBe(actualSymlinkLocation);
    expect(lazygitSymlinkManifest.status).toBe('created');
    expect(lazygitSymlinkManifest.error).toBeUndefined();

    log('Manifest file content verified.');

    log('E2E test completed successfully.');
  });
});
