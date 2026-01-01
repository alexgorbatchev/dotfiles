import { expect } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import type { Architecture, Platform } from '@dotfiles/core';
import { $ } from 'bun';
import { architectureToString, platformToString } from './platformUtils';

/**
 * Options for configuring the TestHarness instance.
 */
export interface ITestHarnessOptions {
  /**
   * The directory where the test files are located (typically import.meta.dir)
   */
  testDir: string;

  /**
   * Path to the config.yaml file relative to testDir (default: 'config.yaml')
   */
  configPath?: string;

  /**
   * Whether to clean the .generated directory before running commands (default: false)
   */
  cleanBeforeRun?: boolean;

  /**
   * Target platform for the commands
   */
  platform: Platform;

  /**
   * Target architecture for the commands
   */
  architecture: Architecture;
}

/**
 * Result of executing a CLI command through the test harness.
 */
export interface ICommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function findProjectRoot(startDir: string): string {
  let currentDir = startDir;

  // Walk up the directory tree until cli.ts is found
  for (;;) {
    const candidatePath = path.join(currentDir, 'cli.ts');
    if (fs.existsSync(candidatePath)) {
      return currentDir;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      throw new Error('Unable to locate project root. Expected to find cli.ts while traversing upwards.');
    }

    currentDir = parentDir;
  }
}

/**
 * Testing harness for end-to-end tests that execute dotfiles CLI commands.
 *
 * This class provides utilities for executing the dotfiles CLI binary in a controlled
 * test environment, verifying generated files and directories, and asserting expected
 * behaviors. It manages test directories, handles cleanup, and provides methods for
 * running different CLI commands (generate, install, update, detect-conflicts) with
 * platform and architecture parameters.
 */
export class TestHarness {
  readonly testDir: string;
  readonly configPath: string;
  readonly configDir: string;
  readonly generatedDir: string;
  readonly userBinDir: string;
  readonly shellScriptsDir: string;
  readonly platform: Platform;
  readonly architecture: Architecture;
  private readonly dotfilesBin: string;
  private readonly cleanBeforeRun: boolean;

  /**
   * Creates a new TestHarness instance.
   *
   * @param options - Configuration options for the test harness.
   */
  constructor(options: ITestHarnessOptions) {
    this.testDir = options.testDir;
    this.configPath = options.configPath ?? 'config.yaml';
    this.cleanBeforeRun = options.cleanBeforeRun ?? false;
    this.platform = options.platform;
    this.architecture = options.architecture;
    const resolvedConfigPath = path.join(this.testDir, this.configPath);
    this.configDir = path.dirname(resolvedConfigPath);
    this.generatedDir = path.join(this.configDir, '.generated');
    this.userBinDir = path.join(this.generatedDir, 'user-bin');
    this.shellScriptsDir = path.join(this.generatedDir, 'shell-scripts');
    const projectRoot = findProjectRoot(this.testDir);
    this.dotfilesBin = path.join(projectRoot, 'cli.ts');
  }

  /**
   * Cleans the .generated directory by removing all generated files and subdirectories.
   *
   * @returns A Promise that resolves when the cleanup is complete.
   */
  async clean(): Promise<void> {
    await $`rm -rf ${this.generatedDir}`.cwd(this.testDir).quiet().nothrow();
  }

  /**
   * Cleans up only the binaries directory while keeping other generated files.
   *
   * @returns A Promise that resolves when the cleanup is complete.
   */
  async cleanBinaries(): Promise<void> {
    const binariesDir = path.join(this.generatedDir, 'binaries');
    const registryDb = path.join(this.generatedDir, 'registry.db');
    await $`rm -rf ${binariesDir} ${registryDb}`.cwd(this.testDir).quiet().nothrow();
  }

  /**
   * Executes a dotfiles CLI command with the configured platform and architecture flags.
   *
   * If cleanBeforeRun is enabled, this method will clean the .generated directory before
   * executing the command. All commands are executed with NODE_ENV=production and include
   * --platform and --arch flags automatically.
   *
   * @param args - Array of command-line arguments to pass to the dotfiles CLI.
   * @returns A Promise that resolves to the command result including exit code, stdout, and stderr.
   */
  async runCommand(args: string[]): Promise<ICommandResult> {
    if (this.cleanBeforeRun) {
      await this.clean();
    }

    // Add platform and architecture flags to all commands
    const platformString = platformToString(this.platform);
    const archString = architectureToString(this.architecture);
    const argsWithPlatform: string[] = [...args, '--platform', platformString, '--arch', archString];

    const result = await $`NODE_ENV=production bun ${this.dotfilesBin} ${argsWithPlatform}`
      .cwd(this.testDir)
      .quiet()
      .nothrow();

    const commandResult: ICommandResult = {
      exitCode: result.exitCode,
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
    };
    return commandResult;
  }

  /**
   * Executes the dotfiles generate command.
   *
   * @param additionalArgs - Optional additional command-line arguments.
   * @returns A Promise that resolves to the command result.
   */
  async generate(additionalArgs: string[] = []): Promise<ICommandResult> {
    return this.runCommand(['generate', '--config', this.configPath, ...additionalArgs]);
  }

  /**
   * Executes the dotfiles install command for one or more tools.
   *
   * @param tools - Array of tool names to install. If empty, installs all configured tools.
   * @param additionalArgs - Optional additional command-line arguments.
   * @returns A Promise that resolves to the command result.
   */
  async install(tools: string[] = [], additionalArgs: string[] = []): Promise<ICommandResult> {
    return this.runCommand(['install', '--config', this.configPath, ...tools, ...additionalArgs]);
  }

  /**
   * Executes the dotfiles update command for a specific tool.
   *
   * @param toolName - The name of the tool to update.
   * @param additionalArgs - Optional additional command-line arguments.
   * @returns A Promise that resolves to the command result.
   */
  async update(toolName: string, additionalArgs: string[] = []): Promise<ICommandResult> {
    return this.runCommand(['update', '--config', this.configPath, toolName, ...additionalArgs]);
  }

  /**
   * Executes the dotfiles detect-conflicts command to identify conflicts with existing files.
   *
   * @param additionalArgs - Optional additional command-line arguments.
   * @returns A Promise that resolves to the command result.
   */
  async detectConflicts(additionalArgs: string[] = []): Promise<ICommandResult> {
    return this.runCommand(['detect-conflicts', '--config', this.configPath, ...additionalArgs]);
  }

  /**
   * Checks if a file exists at the specified path.
   *
   * @param filePath - The path to the file to check.
   * @returns A Promise that resolves to true if the file exists, false otherwise.
   */
  async fileExists(filePath: string): Promise<boolean> {
    const result = await $`test -f ${filePath}`.quiet().nothrow();
    return result.exitCode === 0;
  }

  /**
   * Checks if a directory exists at the specified path.
   *
   * @param dirPath - The path to the directory to check.
   * @returns A Promise that resolves to true if the directory exists, false otherwise.
   */
  async dirExists(dirPath: string): Promise<boolean> {
    const result = await $`test -d ${dirPath}`.quiet().nothrow();
    return result.exitCode === 0;
  }

  /**
   * Checks if a file has executable permissions.
   *
   * @param filePath - The path to the file to check.
   * @returns A Promise that resolves to true if the file is executable, false otherwise.
   */
  async isExecutable(filePath: string): Promise<boolean> {
    const result = await $`test -x ${filePath}`.quiet().nothrow();
    return result.exitCode === 0;
  }

  /**
   * Reads and returns the contents of a file.
   *
   * @param filePath - The path to the file to read.
   * @returns A Promise that resolves to the file contents as a string.
   */
  async readFile(filePath: string): Promise<string> {
    const result = await $`cat ${filePath}`.quiet();
    return result.stdout.toString();
  }

  /**
   * Gets the full path to a shim executable in the user-bin directory.
   *
   * @param shimName - The name of the shim.
   * @returns The full path to the shim file.
   */
  getShimPath(shimName: string): string {
    return path.join(this.userBinDir, shimName);
  }

  /**
   * Gets the full path to a shell initialization script.
   *
   * @param shellType - The type of shell (zsh, bash, or powershell).
   * @returns The full path to the shell script file.
   */
  getShellScriptPath(shellType: 'zsh' | 'bash' | 'powershell'): string {
    const extension = shellType === 'powershell' ? 'ps1' : shellType;
    return path.join(this.shellScriptsDir, `main.${extension}`);
  }

  /**
   * Gets the full path to a completion file for a tool.
   *
   * @param toolName - The name of the tool.
   * @param shellType - The type of shell (zsh, bash, or powershell).
   * @returns The full path to the completion file.
   */
  getCompletionPath(toolName: string, shellType: 'zsh' | 'bash' | 'powershell'): string {
    const completionsDir = path.join(this.shellScriptsDir, shellType, 'completions');
    const prefix = shellType === 'zsh' ? '_' : '';
    const extension = shellType === 'bash' ? '.bash' : '';
    return path.join(completionsDir, `${prefix}${toolName}${extension}`);
  }

  /**
   * Verifies that a file exists at the specified path.
   *
   * @param filePath - The path to the file to verify.
   * @returns A Promise that resolves when the file is verified to exist.
   * @throws AssertionError if the file does not exist.
   */
  async verifyFile(filePath: string): Promise<void> {
    expect(await this.fileExists(filePath)).toBe(true);
  }

  /**
   * Verifies that a shim exists, is executable, and optionally executes it to verify behavior.
   *
   * @param shimName - The name of the shim to verify.
   * @param options - Optional configuration for executing and verifying the shim.
   * @param options.args - Command-line arguments to pass when executing the shim.
   * @param options.expectedExitCode - Expected exit code from the shim execution.
   * @param options.stdoutMatcher - Function to validate the stdout output.
   * @returns A Promise that resolves to the trimmed stdout from executing the shim.
   */
  async verifyShim(
    shimName: string,
    options?: {
      args?: string[];
      expectedExitCode?: number;
      stdoutMatcher?: (stdout: string) => boolean;
    }
  ): Promise<string> {
    const shimPath = this.getShimPath(shimName);
    expect(await this.fileExists(shimPath)).toBe(true);
    expect(await this.isExecutable(shimPath)).toBe(true);

    let stdout = '';
    if (options) {
      const args: string[] = options.args ?? [];
      const result = await $`NODE_ENV=production ${shimPath} ${args}`.cwd(this.testDir).quiet().nothrow();

      const commandResult: ICommandResult = {
        exitCode: result.exitCode,
        stdout: result.stdout.toString(),
        stderr: result.stderr.toString(),
      };

      stdout = commandResult.stdout.trim();

      if (options.expectedExitCode !== undefined) {
        if (commandResult.exitCode !== options.expectedExitCode) {
          const errorMessage = [
            `Shim execution failed: ${shimName}`,
            `Expected exit code: ${options.expectedExitCode}`,
            `Actual exit code: ${commandResult.exitCode}`,
            '--- stdout ---',
            commandResult.stdout,
            '--- stderr ---',
            commandResult.stderr,
          ].join('\n');
          throw new Error(errorMessage);
        }
      }

      if (options.stdoutMatcher) {
        expect(options.stdoutMatcher(stdout)).toBe(true);
      }
    }

    return stdout;
  }

  /**
   * Verifies that a shell initialization script exists.
   *
   * @param shellType - The type of shell (zsh, bash, or powershell).
   * @returns A Promise that resolves when verification is complete.
   */
  async verifyShellScript(shellType: 'zsh' | 'bash' | 'powershell'): Promise<void> {
    const scriptPath = this.getShellScriptPath(shellType);
    expect(await this.fileExists(scriptPath)).toBe(true);
  }

  /**
   * Verifies that a directory exists.
   *
   * @param dirPath - The path to the directory to verify.
   * @returns A Promise that resolves when verification is complete.
   */
  async verifyDir(dirPath: string): Promise<void> {
    expect(await this.dirExists(dirPath)).toBe(true);
  }

  /**
   * Verifies that an environment variable is set correctly in a shell script for a tool.
   *
   * @param toolName - The name of the tool that sets the environment variable.
   * @param varName - The name of the environment variable to verify.
   * @param expectedValue - The expected value, or a function to validate the actual value.
   * @param shellType - The type of shell script to check (default: 'zsh').
   * @returns A Promise that resolves when verification is complete.
   */
  async verifyEnvironmentVariable(
    toolName: string,
    varName: string,
    expectedValue: string | ((value: string) => boolean),
    shellType: 'zsh' | 'bash' | 'powershell' = 'zsh'
  ): Promise<void> {
    const scriptPath = this.getShellScriptPath(shellType);
    const content = await this.readFile(scriptPath);

    // Look for the environment variable with the tool comment (may include multiple tools separated by commas)
    const varRegex = new RegExp(`# Hoisted from: [^\\n]*${toolName}[^\\n]*\\s+export ${varName}=["']([^"']+)["']`, 'm');
    const match = content.match(varRegex);

    expect(match).not.toBeNull();

    if (!match || !match[1]) {
      return;
    }

    const actualValue: string = match[1];

    if (typeof expectedValue === 'function') {
      expect(expectedValue(actualValue)).toBe(true);
    } else {
      expect(actualValue).toBe(expectedValue);
    }
  }

  /**
   * Verifies that an alias is set correctly in a shell script for a tool.
   *
   * @param _toolName - The name of the tool that defines the alias (kept for API compatibility).
   * @param aliasName - The name of the alias to verify.
   * @param expectedCommand - The expected alias command, or a function to validate the actual command.
   * @param shellType - The type of shell script to check (default: 'zsh').
   * @returns A Promise that resolves when verification is complete.
   */
  async verifyAlias(
    _toolName: string,
    aliasName: string,
    expectedCommand: string | ((command: string) => boolean),
    shellType: 'zsh' | 'bash' | 'powershell' = 'zsh'
  ): Promise<void> {
    const scriptPath = this.getShellScriptPath(shellType);
    const content = await this.readFile(scriptPath);

    // Look for the alias in the Tool-Specific Initializations section - handle escaped quotes inside the alias value
    const aliasRegex = new RegExp(`alias ${aliasName}="((?:[^"\\\\]|\\\\.)*)"`, 'm');
    const match = content.match(aliasRegex);

    expect(match).not.toBeNull();

    if (!match || !match[1]) {
      return;
    }

    // Unescape the captured value
    const actualCommand: string = match[1].replace(/\\"/g, '"');

    if (typeof expectedCommand === 'function') {
      expect(expectedCommand(actualCommand)).toBe(true);
    } else {
      expect(actualCommand).toBe(expectedCommand);
    }
  }

  /**
   * Verifies that an always script block exists for a tool in the shell initialization file.
   *
   * Always scripts are executed every time the shell is initialized. This method checks that
   * the script is wrapped in a subshell (bash/zsh) or try-finally block (PowerShell).
   *
   * @param toolName - The name of the tool that defines the always script.
   * @param contentMatcher - Expected content string or a function to validate the script content.
   * @param shellType - The type of shell script to check (default: 'zsh').
   * @returns A Promise that resolves when verification is complete.
   */
  async verifyAlwaysScript(
    _toolName: string,
    contentMatcher: string | ((content: string) => boolean),
    shellType: 'zsh' | 'bash' | 'powershell' = 'zsh'
  ): Promise<void> {
    const scriptPath = this.getShellScriptPath(shellType);
    const content = await this.readFile(scriptPath);

    // Look for subshell blocks (bash/zsh) or try-finally blocks (PowerShell)
    // The toolName parameter is kept for API compatibility but is no longer used
    // since we now use subshells instead of named functions
    const alwaysRegex =
      shellType === 'powershell'
        ? /try\s*\{([\s\S]*?)\}\s*finally\s*\{\}/gm
        : /\(([\s\S]*?)\)/gm;

    const matches = Array.from(content.matchAll(alwaysRegex));
    const isMatch = matches.some((match) => {
      const scriptContent = match[1]?.trim() ?? '';
      if (typeof contentMatcher === 'function') {
        return contentMatcher(scriptContent);
      }
      return scriptContent.includes(contentMatcher);
    });

    expect(isMatch).toBe(true);
  }

  /**
   * Verifies that a once script file exists for a tool.
   *
   * Once scripts are executed only once (tracked via a marker file). This method verifies
   * that the once script file exists in the .once directory with the expected content.
   *
   * @param toolName - The name of the tool that defines the once script.
   * @param contentMatcher - Expected content string or a function to validate the script content.
   * @param shellType - The type of shell script to check (default: 'zsh').
   * @param scriptIndex - Index of the script if a tool has multiple once scripts (default: 0).
   * @returns A Promise that resolves when verification is complete.
   */
  async verifyOnceScript(
    toolName: string,
    contentMatcher: string | ((content: string) => boolean),
    shellType: 'zsh' | 'bash' | 'powershell' = 'zsh',
    scriptIndex: number = 0
  ): Promise<void> {
    const extension = shellType === 'powershell' ? 'ps1' : shellType;
    const onceDir = path.join(this.shellScriptsDir, '.once');
    const onceScriptPath = path.join(onceDir, `${toolName}-${scriptIndex}.${extension}`);

    expect(await this.fileExists(onceScriptPath)).toBe(true);

    const content = await this.readFile(onceScriptPath);

    if (typeof contentMatcher === 'function') {
      expect(contentMatcher(content)).toBe(true);
    } else {
      expect(content).toContain(contentMatcher);
    }
  }
}
