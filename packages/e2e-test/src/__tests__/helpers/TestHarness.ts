import type { Architecture, Platform, ShellType } from "@dotfiles/core";
import { expect } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { findProjectRoot, getE2eGeneratedDir } from "./e2eGeneratedDir";
import { tryGetServerPort } from "./mock-server";
import { architectureToString, platformToString } from "./platformUtils";

/**
 * Options for configuring the TestHarness instance.
 */
export interface ITestHarnessOptions {
  /**
   * The directory where the test files are located (typically import.meta.dir)
   */
  testDir: string;

  /**
   * Path to the config.ts file relative to testDir (default: 'config.ts')
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

  /**
   * Optional stable identifier to isolate generated files per harness instance.
   */
  generatedDirKey?: string;
}

let nextHarnessId = 1;

/**
 * Result of executing a CLI command through the test harness.
 */
export interface ICommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

interface IRunCommandOptions {
  env?: Record<string, string>;
}

type StringMatcher = (value: string) => boolean;
type StringExpectation = string | StringMatcher;

interface IVerifyShimOptions {
  args?: string[];
  expectedExitCode?: number;
  stdoutMatcher?: StringMatcher;
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
  private readonly generatedDirKey: string;

  /**
   * Creates a new TestHarness instance.
   *
   * @param options - Configuration options for the test harness.
   */
  constructor(options: ITestHarnessOptions) {
    this.testDir = options.testDir;
    this.configPath = options.configPath ?? "config.ts";
    this.cleanBeforeRun = options.cleanBeforeRun ?? false;
    this.platform = options.platform;
    this.architecture = options.architecture;
    this.generatedDirKey = options.generatedDirKey ?? `harness-${nextHarnessId++}`;
    const resolvedConfigPath = path.join(this.testDir, this.configPath);
    this.configDir = path.dirname(resolvedConfigPath);
    this.generatedDir = getE2eGeneratedDir(this.configDir, this.generatedDirKey);
    this.userBinDir = path.join(this.generatedDir, "user-bin");
    this.shellScriptsDir = path.join(this.generatedDir, "shell-scripts");
    const projectRoot = findProjectRoot(this.testDir);
    this.dotfilesBin = path.join(projectRoot, "cli.ts");
  }

  /**
   * Cleans the .generated directory by removing all generated files and subdirectories.
   *
   * @returns A Promise that resolves when the cleanup is complete.
   */
  async clean(): Promise<void> {
    await fs.promises.rm(this.generatedDir, { recursive: true, force: true });
  }

  /**
   * Cleans up only the binaries directory while keeping other generated files.
   *
   * @returns A Promise that resolves when the cleanup is complete.
   */
  async cleanBinaries(): Promise<void> {
    const binariesDir = path.join(this.generatedDir, "binaries");
    const registryDb = path.join(this.generatedDir, "registry.db");
    await Promise.all([
      fs.promises.rm(binariesDir, { recursive: true, force: true }),
      fs.promises.rm(registryDb, { recursive: true, force: true }),
    ]);
  }

  /**
   * Executes a dotfiles CLI command with the configured platform and architecture flags.
   *
   * If cleanBeforeRun is enabled, this method will clean the .generated directory before
   * executing the command. All commands are executed with NODE_ENV=production and include
   * --platform and --arch flags automatically.
   *
   * @param args - Array of command-line arguments to pass to the dotfiles CLI.
   * @param options - Optional execution options.
   * @returns A Promise that resolves to the command result including exit code, stdout, and stderr.
   */
  async runCommand(args: string[], options?: IRunCommandOptions): Promise<ICommandResult> {
    if (this.cleanBeforeRun) {
      await this.clean();
    }

    // Add platform and architecture flags to all commands
    const platformString = platformToString(this.platform);
    const archString = architectureToString(this.architecture);
    const argsWithPlatform: string[] = [...args, "--platform", platformString, "--arch", archString];

    // Get mock server port if available
    const mockServerPort = tryGetServerPort();
    const mockServerEnv = mockServerPort ? { MOCK_SERVER_PORT: String(mockServerPort) } : {};
    const e2eTestEnv = { DOTFILES_E2E_TEST_ID: this.generatedDirKey };

    const proc = Bun.spawn({
      cmd: ["bun", this.dotfilesBin, ...argsWithPlatform],
      cwd: this.testDir,
      env: {
        ...process.env,
        NODE_ENV: "production",
        NO_COLOR: "1",
        TERM: "dumb",
        ...e2eTestEnv,
        ...mockServerEnv,
        ...options?.env,
      },
      stdout: "pipe",
      stderr: "pipe",
    });

    const code = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();

    const commandResult: ICommandResult = {
      code,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
    };
    return commandResult;
  }

  /**
   * Executes a dotfiles CLI command after sourcing an environment's activation script.
   *
   * This simulates real user behavior where they first source the env, then run commands.
   * The activation script sets DOTFILES_ENV_DIR, DOTFILES_ENV_NAME, and XDG_CONFIG_HOME.
   *
   * @param envDir - Absolute path to the virtual environment directory.
   * @param args - Array of command-line arguments to pass to the dotfiles CLI.
   * @returns A Promise that resolves to the command result including exit code, stdout, and stderr.
   */
  async runCommandWithActivatedEnv(envDir: string, args: string[]): Promise<ICommandResult> {
    const platformString = platformToString(this.platform);
    const archString = architectureToString(this.architecture);
    const argsWithPlatform: string[] = [...args, "--platform", platformString, "--arch", archString];
    const argsString = argsWithPlatform.map((arg) => `"${arg}"`).join(" ");

    // Source the activation script then run the command in the same shell
    const shellCommand = `source "${envDir}/source" && bun "${this.dotfilesBin}" ${argsString}`;

    // Get mock server port if available
    const mockServerPort = tryGetServerPort();
    const mockServerEnv = mockServerPort ? { MOCK_SERVER_PORT: String(mockServerPort) } : {};
    const e2eTestEnv = { DOTFILES_E2E_TEST_ID: this.generatedDirKey };

    const proc = Bun.spawn({
      cmd: ["bash", "-c", shellCommand],
      cwd: this.testDir,
      env: {
        ...process.env,
        NODE_ENV: "production",
        NO_COLOR: "1",
        TERM: "dumb",
        ...e2eTestEnv,
        ...mockServerEnv,
      },
      stdout: "pipe",
      stderr: "pipe",
    });

    const code = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();

    const commandResult: ICommandResult = {
      code,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
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
    return this.runCommand(["generate", "--config", this.configPath, ...additionalArgs]);
  }

  /**
   * Executes the dotfiles install command for one or more tools.
   *
   * @param tools - Array of tool names to install. If empty, installs all configured tools.
   * @param additionalArgs - Optional additional command-line arguments.
   * @returns A Promise that resolves to the command result.
   */
  async install(
    tools: string[] = [],
    additionalArgs: string[] = [],
    options?: IRunCommandOptions,
  ): Promise<ICommandResult> {
    return this.runCommand(["install", "--config", this.configPath, ...tools, ...additionalArgs], options);
  }

  /**
   * Executes the dotfiles update command for a specific tool.
   *
   * @param toolName - The name of the tool to update.
   * @param additionalArgs - Optional additional command-line arguments.
   * @returns A Promise that resolves to the command result.
   */
  async update(toolName: string, additionalArgs: string[] = []): Promise<ICommandResult> {
    return this.runCommand(["update", "--config", this.configPath, toolName, ...additionalArgs]);
  }

  /**
   * Executes the dotfiles detect-conflicts command to identify conflicts with existing files.
   *
   * @param additionalArgs - Optional additional command-line arguments.
   * @returns A Promise that resolves to the command result.
   */
  async detectConflicts(additionalArgs: string[] = []): Promise<ICommandResult> {
    return this.runCommand(["detect-conflicts", "--config", this.configPath, ...additionalArgs]);
  }

  /**
   * Checks if a file exists at the specified path.
   *
   * @param filePath - The path to the file to check.
   * @returns A Promise that resolves to true if the file exists, false otherwise.
   */
  async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.promises.access(filePath, fs.constants.F_OK);
      const stats = await fs.promises.stat(filePath);
      return stats.isFile();
    } catch {
      return false;
    }
  }

  /**
   * Checks if a directory exists at the specified path.
   *
   * @param dirPath - The path to the directory to check.
   * @returns A Promise that resolves to true if the directory exists, false otherwise.
   */
  async dirExists(dirPath: string): Promise<boolean> {
    try {
      await fs.promises.access(dirPath, fs.constants.F_OK);
      const stats = await fs.promises.stat(dirPath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Checks if a file has executable permissions.
   *
   * @param filePath - The path to the file to check.
   * @returns A Promise that resolves to true if the file is executable, false otherwise.
   */
  async isExecutable(filePath: string): Promise<boolean> {
    try {
      await fs.promises.access(filePath, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Reads and returns the contents of a file.
   *
   * @param filePath - The path to the file to read.
   * @returns A Promise that resolves to the file contents as a string.
   */
  async readFile(filePath: string): Promise<string> {
    return fs.promises.readFile(filePath, "utf8");
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
  getShellScriptPath(shellType: ShellType): string {
    const extension = shellType === "powershell" ? "ps1" : shellType;
    return path.join(this.shellScriptsDir, `main.${extension}`);
  }

  /**
   * Gets the full path to a completion file for a tool.
   *
   * @param toolName - The name of the tool.
   * @param shellType - The type of shell (zsh, bash, or powershell).
   * @returns The full path to the completion file.
   */
  getCompletionPath(toolName: string, shellType: ShellType): string {
    const completionsDir = path.join(this.shellScriptsDir, shellType, "completions");
    const prefix = shellType === "zsh" ? "_" : "";
    const extension = shellType === "bash" ? ".bash" : "";
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
  async verifyShim(shimName: string, options?: IVerifyShimOptions): Promise<string> {
    const shimPath = this.getShimPath(shimName);
    expect(await this.fileExists(shimPath)).toBe(true);
    expect(await this.isExecutable(shimPath)).toBe(true);

    let stdout = "";
    if (options) {
      const args: string[] = options.args ?? [];
      // Get mock server port if available
      const mockServerPort = tryGetServerPort();
      const mockServerEnv = mockServerPort ? { MOCK_SERVER_PORT: String(mockServerPort) } : {};
      const e2eTestEnv = { DOTFILES_E2E_TEST_ID: this.generatedDirKey };

      const proc = Bun.spawn({
        cmd: [shimPath, ...args],
        cwd: this.testDir,
        env: {
          ...process.env,
          NODE_ENV: "production",
          NO_COLOR: "1",
          TERM: "dumb",
          ...e2eTestEnv,
          ...mockServerEnv,
        },
        stdout: "pipe",
        stderr: "pipe",
      });

      const code = await proc.exited;
      const procStdout = await new Response(proc.stdout).text();
      const procStderr = await new Response(proc.stderr).text();

      const commandResult: ICommandResult = {
        code,
        stdout: procStdout.toString(),
        stderr: procStderr.toString(),
      };

      stdout = commandResult.stdout.trim();

      if (options.expectedExitCode !== undefined) {
        if (commandResult.code !== options.expectedExitCode) {
          const errorMessage = [
            `Shim execution failed: ${shimName}`,
            `Expected exit code: ${options.expectedExitCode}`,
            `Actual exit code: ${commandResult.code}`,
            "--- stdout ---",
            commandResult.stdout,
            "--- stderr ---",
            commandResult.stderr,
          ].join("\n");
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
  async verifyShellScript(shellType: ShellType): Promise<void> {
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
    expectedValue: StringExpectation,
    shellType: ShellType = "zsh",
  ): Promise<void> {
    const scriptPath = this.getShellScriptPath(shellType);
    const content = await this.readFile(scriptPath);

    // Look for the environment variable with optional source comment
    // The emissions system uses "# source" format, not "# Hoisted from: source"
    const varRegex = new RegExp(`(?:#[^\\n]*${toolName}[^\\n]*\\s+)?export ${varName}=["']([^"']+)["']`, "m");
    const match = content.match(varRegex);

    expect(match).not.toBeNull();

    if (!match || !match[1]) {
      return;
    }

    const actualValue: string = match[1];

    if (typeof expectedValue === "function") {
      expect(expectedValue(actualValue)).toBe(true);
    } else {
      expect(actualValue).toBe(expectedValue);
    }
  }

  /**
   * Verifies that an alias is set correctly in a shell script for a tool.
   *
   * Note: The _toolName parameter is not used for lookup (aliases are global in the output)
   * but is retained for API stability with existing E2E tests. It serves as documentation
   * of which tool the alias is expected to come from.
   *
   * @param _toolName - Descriptive tool name (unused for lookup, kept for API compatibility).
   * @param aliasName - The name of the alias to verify.
   * @param expectedCommand - The expected alias command, or a function to validate the actual command.
   * @param shellType - The type of shell script to check (default: 'zsh').
   * @returns A Promise that resolves when verification is complete.
   */
  async verifyAlias(
    _toolName: string,
    aliasName: string,
    expectedCommand: StringExpectation,
    shellType: ShellType = "zsh",
  ): Promise<void> {
    const scriptPath = this.getShellScriptPath(shellType);
    const content = await this.readFile(scriptPath);

    // Look for the alias in the Tool-Specific Initializations section - single-quoted values
    const aliasRegex = new RegExp(`alias ${aliasName}='((?:[^']|'\\\\'')*)'`, "m");
    const match = content.match(aliasRegex);

    expect(match).not.toBeNull();

    if (!match || !match[1]) {
      return;
    }

    // Unescape the captured value (reverse the '\'' single-quote escaping)
    const actualCommand: string = match[1].replace(/'\\'''/g, "'");

    if (typeof expectedCommand === "function") {
      expect(expectedCommand(actualCommand)).toBe(true);
    } else {
      expect(actualCommand).toBe(expectedCommand);
    }
  }

  /**
   * Verifies that an always script block exists for a tool in the shell initialization file.
   *
   * Always scripts are executed every time the shell is initialized. This method checks that
   * the script content exists in the shell initialization file.
   *
   * @param toolName - The tool name (used for error messages).
   * @param contentMatcher - Expected content string or a function to validate the script content.
   * @param shellType - The type of shell script to check (default: 'zsh').
   * @returns A Promise that resolves when verification is complete.
   */
  async verifyAlwaysScript(
    toolName: string,
    contentMatcher: StringExpectation,
    shellType: ShellType = "zsh",
  ): Promise<void> {
    const scriptPath = this.getShellScriptPath(shellType);
    const content = await this.readFile(scriptPath);

    const isMatch = typeof contentMatcher === "function" ? contentMatcher(content) : content.includes(contentMatcher);

    expect(isMatch, `Always script for tool '${toolName}' not found in ${shellType} script`).toBe(true);
  }

  /**
   * Verifies that a once script file exists containing specific content.
   *
   * Once scripts are executed only once (tracked via a marker file). The emissions system
   * uses global indexing (once-001.zsh, once-002.zsh) instead of per-tool naming,
   * so we search all once scripts for matching content.
   *
   * When a string is provided as contentMatcher, this uses substring matching (includes)
   * because once scripts contain generated headers, comments, and cleanup code in addition
   * to the user-provided content. For exact matching, provide a predicate function.
   *
   * @param toolName - The tool name (used for error messages).
   * @param contentMatcher - Expected content substring or a predicate function for custom matching.
   * @param shellType - The type of shell script to check (default: 'zsh').
   * @returns A Promise that resolves when verification is complete.
   */
  async verifyOnceScript(
    toolName: string,
    contentMatcher: StringExpectation,
    shellType: ShellType = "zsh",
  ): Promise<void> {
    const extension = shellType === "powershell" ? "ps1" : shellType;
    const onceDir = path.join(this.shellScriptsDir, ".once");

    // Once scripts are stored in the .once subdirectory with once-###.ext naming
    // Search for any once script that matches the content
    const files = await fs.promises.readdir(onceDir);
    const onceScriptFiles = files.filter((f) => f.startsWith("once-") && f.endsWith(`.${extension}`));

    let foundMatchingScript = false;
    for (const filename of onceScriptFiles) {
      const scriptPath = path.join(onceDir, filename);
      const content = await this.readFile(scriptPath);

      if (typeof contentMatcher === "function") {
        if (contentMatcher(content)) {
          foundMatchingScript = true;
          break;
        }
      } else if (content.includes(contentMatcher)) {
        foundMatchingScript = true;
        break;
      }
    }

    expect(foundMatchingScript, `Once script for tool '${toolName}' not found in ${shellType} .once directory`).toBe(
      true,
    );
  }
}
