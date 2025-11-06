import { expect } from 'bun:test';
import path from 'node:path';
import type { Architecture, Platform } from '@dotfiles/core';
import { $ } from 'bun';
import { architectureToString, platformToString } from './platformUtils';

export interface TestHarnessOptions {
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

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Testing harness for e2e tests that execute dotfiles commands
 */
export class TestHarness {
  readonly testDir: string;
  readonly configPath: string;
  readonly generatedDir: string;
  readonly userBinDir: string;
  readonly shellScriptsDir: string;
  readonly platform: Platform;
  readonly architecture: Architecture;
  private readonly binPath: string;
  private readonly dotfilesBin: string;
  private readonly cleanBeforeRun: boolean;

  constructor(options: TestHarnessOptions) {
    this.testDir = options.testDir;
    this.configPath = options.configPath ?? 'config.yaml';
    this.cleanBeforeRun = options.cleanBeforeRun ?? false;
    this.platform = options.platform;
    this.architecture = options.architecture;
    this.generatedDir = path.join(this.testDir, '.generated');
    this.userBinDir = path.join(this.generatedDir, 'user-bin');
    this.shellScriptsDir = path.join(this.generatedDir, 'shell-scripts');
    this.binPath = path.resolve(this.testDir, '../../node_modules/.bin');
    this.dotfilesBin = path.join(this.binPath, 'dotfiles');
  }

  /**
   * Clean the .generated directory
   */
  async clean(): Promise<void> {
    await $`rm -rf ${this.generatedDir}`.cwd(this.testDir).quiet().nothrow();
  }

  /**
   * Execute a dotfiles command
   */
  async runCommand(args: string[]): Promise<CommandResult> {
    if (this.cleanBeforeRun) {
      await this.clean();
    }

    // Add platform and architecture flags to all commands
    const platformString = platformToString(this.platform);
    const archString = architectureToString(this.architecture);
    const argsWithPlatform = [...args, '--platform', platformString, '--arch', archString];

    const result = await $`NODE_ENV=production ${this.dotfilesBin} ${argsWithPlatform}`
      .cwd(this.testDir)
      .quiet()
      .nothrow();

    return {
      exitCode: result.exitCode,
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
    };
  }

  /**
   * Execute dotfiles generate command
   */
  async generate(additionalArgs: string[] = []): Promise<CommandResult> {
    return this.runCommand(['generate', '--config', this.configPath, ...additionalArgs]);
  }

  /**
   * Execute dotfiles install command
   */
  async install(tools: string[] = [], additionalArgs: string[] = []): Promise<CommandResult> {
    return this.runCommand(['install', '--config', this.configPath, ...tools, ...additionalArgs]);
  }

  /**
   * Execute dotfiles update command
   */
  async update(toolName: string, additionalArgs: string[] = []): Promise<CommandResult> {
    return this.runCommand(['update', '--config', this.configPath, toolName, ...additionalArgs]);
  }

  /**
   * Execute dotfiles detect-conflicts command
   */
  async detectConflicts(additionalArgs: string[] = []): Promise<CommandResult> {
    return this.runCommand(['detect-conflicts', '--config', this.configPath, ...additionalArgs]);
  }

  /**
   * Check if a file exists
   */
  async fileExists(filePath: string): Promise<boolean> {
    const result = await $`test -f ${filePath}`.quiet().nothrow();
    return result.exitCode === 0;
  }

  /**
   * Check if a directory exists
   */
  async dirExists(dirPath: string): Promise<boolean> {
    const result = await $`test -d ${dirPath}`.quiet().nothrow();
    return result.exitCode === 0;
  }

  /**
   * Check if a file is executable
   */
  async isExecutable(filePath: string): Promise<boolean> {
    const result = await $`test -x ${filePath}`.quiet().nothrow();
    return result.exitCode === 0;
  }

  /**
   * Read file contents
   */
  async readFile(filePath: string): Promise<string> {
    const result = await $`cat ${filePath}`.quiet();
    return result.stdout.toString();
  }

  /**
   * Get path to a shim in user-bin
   */
  getShimPath(shimName: string): string {
    return path.join(this.userBinDir, shimName);
  }

  /**
   * Get path to a shell script
   */
  getShellScriptPath(shellType: 'zsh' | 'bash' | 'powershell'): string {
    const extension = shellType === 'powershell' ? 'ps1' : shellType;
    return path.join(this.shellScriptsDir, `main.${extension}`);
  }

  /**
   * Verify that a shim exists and is executable, optionally execute it
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
      const args = options.args ?? [];
      const result = await $`NODE_ENV=production ${shimPath} ${args}`.cwd(this.testDir).quiet().nothrow();

      const commandResult: CommandResult = {
        exitCode: result.exitCode,
        stdout: result.stdout.toString(),
        stderr: result.stderr.toString(),
      };

      stdout = commandResult.stdout.trim();

      if (options.expectedExitCode !== undefined) {
        expect(commandResult.exitCode).toBe(options.expectedExitCode);
      }

      if (options.stdoutMatcher) {
        expect(options.stdoutMatcher(stdout)).toBe(true);
      }
    }

    return stdout;
  }

  /**
   * Verify that a shell script exists
   */
  async verifyShellScript(shellType: 'zsh' | 'bash' | 'powershell'): Promise<void> {
    const scriptPath = this.getShellScriptPath(shellType);
    expect(await this.fileExists(scriptPath)).toBe(true);
  }

  /**
   * Verify that a directory exists
   */
  async verifyDir(dirPath: string): Promise<void> {
    expect(await this.dirExists(dirPath)).toBe(true);
  }

  /**
   * Verify that an environment variable is set in a shell script for a tool
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
   * Verify that an alias is set in a shell script for a tool
   */
  async verifyAlias(
    toolName: string,
    aliasName: string,
    expectedCommand: string | ((command: string) => boolean),
    shellType: 'zsh' | 'bash' | 'powershell' = 'zsh'
  ): Promise<void> {
    const scriptPath = this.getShellScriptPath(shellType);
    const content = await this.readFile(scriptPath);

    // Look for the alias under the tool section - handle escaped quotes inside the alias value
    const toolSectionRegex = new RegExp(`# Tool: ${toolName}[\\s\\S]*?alias ${aliasName}="((?:[^"\\\\]|\\\\.)*)"`, 'm');
    const match = content.match(toolSectionRegex);

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
   * Verify that an always script block exists for a tool
   */
  async verifyAlwaysScript(
    toolName: string,
    contentMatcher: string | ((content: string) => boolean),
    shellType: 'zsh' | 'bash' | 'powershell' = 'zsh'
  ): Promise<void> {
    const scriptPath = this.getShellScriptPath(shellType);
    const content = await this.readFile(scriptPath);

    // Look for the always script function
    const alwaysRegex = new RegExp(`__dotfiles_${toolName}_always\\(\\) \\{([\\s\\S]*?)\\}`, 'm');
    const match = content.match(alwaysRegex);

    expect(match).not.toBeNull();

    if (!match || !match[1]) {
      return;
    }

    const scriptContent: string = match[1].trim();

    if (typeof contentMatcher === 'function') {
      expect(contentMatcher(scriptContent)).toBe(true);
    } else {
      expect(scriptContent).toContain(contentMatcher);
    }
  }

  /**
   * Verify that a once script file exists for a tool
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
