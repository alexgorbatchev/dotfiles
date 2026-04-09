// oxlint-disable no-console
/**
 * Parallel Test Runner
 *
 * This preload script intercepts `bun test` and spawns multiple Bun instances
 * to run tests in parallel, similar to Jest's maxWorkers.
 *
 * Usage: Add to bunfig.toml under [test]:
 *   preload = ["./packages/testing-helpers/src/parallel-test-runner.ts"]
 *
 * Environment variables:
 *   - BUN_TEST_WORKER: Set by this script to mark worker processes (do not set manually)
 *   - BUN_TEST_WORKERS: Number of parallel workers (default: CPU count)
 *   - BUN_TEST_SEQUENTIAL: Set to "1" to disable parallelization
 *
 * Bun Test Lifecycle with Parallel Test Runner
 * 1. Preload Phase: Bun loads files specified in bunfig.toml's [test].preload before any test files
 * 2. Discovery Phase: Bun finds test files matching patterns
 * 3. Execution Phase: Tests run in a single process with Bun's built-in test runner
 * 4. Reporting Phase: Results are collected and displayed
 *
 * The script exploits the preload phase to hijack test execution:
 *
 * ┌─────────────────────────────────────────────────────────────┐
 * │  User runs: bun test                                        │
 * └─────────────────────────────────────────────────────────────┘
 *                               │
 *                               ▼
 * ┌─────────────────────────────────────────────────────────────┐
 * │  Preload: parallel-test-runner.ts loads                     │
 * │  - Checks BUN_TEST_WORKER env var                           │
 * │  - Main process: BUN_TEST_WORKER is NOT set                 │
 * └─────────────────────────────────────────────────────────────┘
 *                               │
 *              ┌────────────────┴────────────────┐
 *              ▼                                 ▼
 *     BUN_TEST_WORKER=1              BUN_TEST_WORKER not set
 *     (Worker Process)                 (Main Orchestrator)
 *              │                                 │
 *              ▼                                 ▼
 *     Pass through - Bun runs         runParallelTests() executes
 *     tests normally on                         │
 *     assigned files                            ▼
 *                               ┌───────────────────────────────┐
 *                               │  1. Glob all test files       │
 *                               │  2. Separate e2e vs other     │
 *                               │  3. Split into chunks         │
 *                               │  4. Spawn N workers           │
 *                               └───────────────────────────────┘
 *                                               │
 *                               ┌───────┬───────┼───────┬───────┐
 *                               ▼       ▼       ▼       ▼       ▼
 *                            Worker  Worker  Worker  Worker  Worker
 *                              1       2       3       N     (e2e)
 *                               │       │       │       │       │
 *                               └───────┴───────┴───────┴───────┘
 *                                               │
 *                                               ▼
 *                               ┌───────────────────────────────┐
 *                               │  Main process collects output │
 *                               │  and exits with final status  │
 *                               └───────────────────────────────┘
 *
 * Key Mechanisms:
 * 1. Guard Variable: BUN_TEST_WORKER=1 prevents infinite recursion - workers don't spawn more workers
 * 2. Early Exit: Main orchestrator calls process.exit(0) after runParallelTests(), preventing Bun from running its normal test discovery on the main process
 * 3. E2E Isolation: E2E tests get dedicated workers (one file per worker) because they share fixture directories within their files and would conflict if run together
 * 4. Worker ID: BUN_TEST_WORKER_ID provides unique identifiers for test isolation (e.g., unique temp directories)
 * 5. File Passthrough: If user specifies files directly (bun test foo.test.ts), it bypasses parallelization and runs normally
 */

import { dedentString } from "@dotfiles/utils";
import { spawn, type Subprocess } from "bun";
import { cpus } from "os";

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const E2E_TIMEOUT_MS = 30000;
const TEST_FILE_GLOB = "**/packages/**/src/**/*.test.ts";
const E2E_PATH_MARKER = "packages/e2e-test/";

interface IConfig {
  isWorker: boolean;
  isSequential: boolean;
  isParallel: boolean;
  isBunExtension: boolean;
  workerCount: number;
}

function getConfig(): IConfig {
  return {
    isWorker: process.env["BUN_TEST_WORKER"] === "1",
    isSequential: process.env["BUN_TEST_SEQUENTIAL"] === "1",
    isParallel: process.env["BUN_TEST_ALL"] === "1",
    isBunExtension:
      process.env["BUN_DEBUG_QUIET_LOGS"] !== undefined &&
      process.env["VSCODE_CRASH_REPORTER_PROCESS_TYPE"] !== undefined,
    workerCount: parseInt(process.env["BUN_TEST_WORKERS"] || String(cpus().length), 10),
  };
}

const initialConfig = getConfig();

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface IWorkerHandle {
  proc: Subprocess;
  index: number;
  files: string[];
}

interface IWorkerResult {
  index: number;
  exitCode: number;
  stdout: string;
  stderr: string;
  fileCount: number;
}

interface ITestPartition {
  e2eTests: string[];
  otherTests: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Test File Discovery
// ─────────────────────────────────────────────────────────────────────────────

function discoverTestFiles(): string[] {
  const glob = new Bun.Glob(TEST_FILE_GLOB);
  return Array.from(glob.scanSync({ cwd: process.cwd() })).filter((f) => !f.includes("node_modules"));
}

function partitionTestFiles(files: string[]): ITestPartition {
  return {
    e2eTests: files.filter((f) => f.includes(E2E_PATH_MARKER)),
    otherTests: files.filter((f) => !f.includes(E2E_PATH_MARKER)),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Chunk Management
// ─────────────────────────────────────────────────────────────────────────────

function splitIntoChunks<T>(array: T[], chunkCount: number): T[][] {
  const result: T[][] = Array.from({ length: chunkCount }, () => []);
  for (let i = 0; i < array.length; i++) {
    const chunk = result[i % chunkCount];
    const item = array[i];
    if (chunk && item !== undefined) {
      chunk.push(item);
    }
  }
  return result;
}

function createTestChunks(partition: ITestPartition, workerCount: number): string[][] {
  // E2E tests need isolation - give each its own worker
  const e2eChunks = partition.e2eTests.map((f) => [f]);

  // Split non-e2e tests across remaining workers
  const remainingWorkers = Math.max(1, workerCount - partition.e2eTests.length);
  const otherChunks = splitIntoChunks(partition.otherTests, remainingWorkers);

  return [...otherChunks, ...e2eChunks].filter((c) => c.length > 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Worker Management
// ─────────────────────────────────────────────────────────────────────────────

function spawnWorker(files: string[], index: number, baseArgs: string[]): IWorkerHandle {
  const isE2eWorker = files.some((f) => f.includes(E2E_PATH_MARKER));
  const workerArgs = isE2eWorker ? ["--timeout", String(E2E_TIMEOUT_MS), ...baseArgs] : baseArgs;

  const proc = spawn(["bun", "test", ...workerArgs, ...files], {
    env: { ...process.env, BUN_TEST_WORKER: "1", BUN_TEST_WORKER_ID: String(index + 1) },
    stdio: ["inherit", "pipe", "pipe"],
  });

  return { proc, index, files };
}

async function collectWorkerResult(worker: IWorkerHandle): Promise<IWorkerResult> {
  const { proc, index, files } = worker;

  // With stdio: ['inherit', 'pipe', 'pipe'], stdout/stderr are ReadableStreams
  const stdout = proc.stdout instanceof ReadableStream ? await new Response(proc.stdout).text() : "";
  const stderr = proc.stderr instanceof ReadableStream ? await new Response(proc.stderr).text() : "";
  const exitCode = await proc.exited;

  return {
    index,
    exitCode,
    stdout,
    stderr,
    fileCount: files.length,
  };
}

function printWorkerOutput(result: IWorkerResult): void {
  if (result.exitCode === 0) {
    return;
  }

  // Failed worker - print full output
  console.log(`\nWorker ${result.index + 1}: FAILED`);
  const output = [result.stdout, result.stderr].filter((s) => s.trim()).join("\n");
  if (output) {
    console.log(output);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Passthrough Mode
// ─────────────────────────────────────────────────────────────────────────────

function hasFileArguments(args: string[]): boolean {
  return args.some((arg) => !arg.startsWith("-") && !arg.startsWith("--"));
}

async function runPassthrough(args: string[]): Promise<never> {
  const result = await spawn(["bun", "test", ...args], {
    env: { ...process.env, BUN_TEST_WORKER: "1" },
    stdio: ["inherit", "inherit", "inherit"],
  }).exited;
  process.exit(result);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Orchestration
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Clear Bun's initial output that printed BEFORE preload ran:
  // Line 1: "bun test v1.3.8 (b64edcb4)"
  // Line 2: empty
  // Line 3: "packages/.../file.test.ts:"
  // Only works in interactive TTY, not piped output
  if (process.stdout.isTTY) {
    // Move cursor up 3 lines, clear from cursor to end of screen
    process.stdout.write("\x1b[3A\x1b[0J");
  }

  const args = process.argv.slice(2);

  // Passthrough mode: specific files provided
  if (hasFileArguments(args)) {
    await runPassthrough(args);
  }

  // Discover and partition test files
  const allTestFiles = discoverTestFiles();
  if (allTestFiles.length === 0) {
    console.log("No test files found");
    process.exit(0);
  }

  const partition = partitionTestFiles(allTestFiles);
  const chunks = createTestChunks(partition, initialConfig.workerCount);

  console.log(
    `Running ${allTestFiles.length} test files across ${chunks.length} workers ` +
      `(${partition.e2eTests.length} e2e isolated)...`,
  );

  const startTime = performance.now();

  // Spawn and collect results
  const workers = chunks.map((files, index) => spawnWorker(files, index, args));
  const results: IWorkerResult[] = [];

  for (const worker of workers) {
    const result = await collectWorkerResult(worker);
    results.push(result);
    printWorkerOutput(result);
  }

  // Report summary
  const elapsedMs = performance.now() - startTime;
  const elapsedSec = (elapsedMs / 1000).toFixed(2);

  const failed = results.filter((r) => r.exitCode !== 0);
  if (failed.length > 0) {
    console.log(`\n${failed.length} worker(s) failed in ${elapsedSec}s`);
    process.exit(1);
  }

  console.log(`All tests passed [${elapsedSec}s]`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry Point
// ─────────────────────────────────────────────────────────────────────────────

function printUsageAndExit(): never {
  console.error(
    dedentString(`
    Usage:
      bun test:all    - much faster, doesn't accept arguments
      bun test:native - slower, but respects all 'bun test' arguments
  `),
  );
  process.exit(1);
}

if (initialConfig.isWorker || initialConfig.isSequential || initialConfig.isBunExtension) {
  // Pass through - Bun will run tests normally
} else if (initialConfig.isParallel) {
  // Main process - orchestrate parallel execution
  await main();
  process.exit(0);
} else {
  // No mode specified - show usage
  printUsageAndExit();
}
