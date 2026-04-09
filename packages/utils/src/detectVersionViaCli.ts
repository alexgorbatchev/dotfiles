import type { IShell } from "@dotfiles/core";
import { normalizeVersion } from "./normalizeVersion";

export interface IDetectVersionOptions {
  /**
   * The shell executor to use for running commands.
   */
  shellExecutor: IShell;
  /**
   * The binary to run.
   */
  binaryPath: string;
  /**
   * Arguments to pass to the binary to get the version.
   * @default ['--version']
   */
  args?: string[];
  /**
   * Custom regex to extract the version from the output.
   * If provided, the first capture group will be used as the version.
   */
  regex?: string | RegExp;
  /**
   * Environment variables to set when running the binary.
   */
  env?: Record<string, string>;
}

/**
 * Detects the version of a tool by running it with --version (or custom args)
 * and parsing the output.
 */
export async function detectVersionViaCli(options: IDetectVersionOptions): Promise<string | undefined> {
  const { binaryPath, args = ["--version"], regex, env, shellExecutor } = options;

  try {
    const result = await shellExecutor`${binaryPath} ${args}`
      .env({ ...process.env, ...env })
      .quiet()
      .noThrow();
    const output = (result.stdout.toString() + result.stderr.toString()).trim();

    if (regex) {
      const re = typeof regex === "string" ? new RegExp(regex) : regex;
      const match = output.match(re);
      if (match?.[1]) {
        return normalizeVersion(match[1]);
      }
      throw new Error(`Version detection failed: regex ${re} did not match output: ${output}`);
    }

    // Default heuristics
    // Look for semver-like strings: v1.2.3, 1.2.3
    // We want to be careful not to match things that look like versions but aren't,
    // but generally the first thing that looks like a version in --version output is the version.

    // Matches:
    // v1.2.3
    // 1.2.3
    // 1.2.3-beta.1
    // 1.2.3+build
    const semverRegex = /v?(\d+\.\d+\.\d+(?:-[\w.]+)?(?:\+[\w.]+)?)/i;
    const match = output.match(semverRegex);
    if (match?.[1]) {
      return normalizeVersion(match[1]);
    }

    return undefined;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Version detection failed")) {
      throw error;
    }
    return undefined;
  }
}
