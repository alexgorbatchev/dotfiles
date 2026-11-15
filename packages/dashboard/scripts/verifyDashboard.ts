import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { OwnedProcess } from "./OwnedProcess";

type VerificationOptions = {
  rootDir: string;
  signal?: AbortSignal;
  goCommand?: readonly string[];
  browserCommand?: readonly string[];
  env?: Record<string, string | undefined>;
  startupTimeoutMs?: number;
  commandTimeoutMs?: number;
  shutdownTimeoutMs?: number;
  log?: (message: string) => void;
};

const browserErrors = z.object({ success: z.literal(true), data: z.object({ errors: z.array(z.unknown()) }) });
const browserSession = z.object({
  success: z.literal(true),
  data: z.object({ active: z.boolean(), pid: z.number().int().positive().nullable(), session: z.string() }),
});

type ProcessSignal = NodeJS.Signals | 0;

function signalProcess(pid: number, signal: ProcessSignal): boolean {
  try {
    process.kill(pid, signal);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ESRCH") return false;
    throw error;
  }
}

async function waitForExit(pid: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (signalProcess(pid, 0)) {
    if (Date.now() >= deadline) return false;
    await Bun.sleep(25);
  }
  return true;
}

/** Verify the compiled dashboard using a private server, browser session, and scratch directory. */
export async function verifyDashboard(options: VerificationOptions): Promise<void> {
  const { rootDir, signal } = options;
  const log = options.log ?? (() => {});
  const startupTimeoutMs = options.startupTimeoutMs ?? 120000;
  const commandTimeoutMs = options.commandTimeoutMs ?? 45000;
  const shutdownTimeoutMs = options.shutdownTimeoutMs ?? 5000;
  const browserCommand = options.browserCommand ?? ["agent-browser"];
  const environment = options.env ?? process.env;
  const launchArgs = environment["AGENT_BROWSER_ARGS"];
  const browserLaunchOptions = launchArgs ? ["--args", launchArgs] : [];
  const browserEnvironment = Object.fromEntries(
    Object.entries(environment).filter(([key]) => !key.startsWith("AGENT_BROWSER_")),
  );
  const operation = new AbortController();
  const operationSignal = signal ? AbortSignal.any([signal, operation.signal]) : operation.signal;
  await mkdir(join(rootDir, ".tmp"), { recursive: true });
  const scratch = await mkdtemp(join(rootDir, ".tmp/dashboard-verify-"));
  const session = `dashboard-verify-${crypto.randomUUID()}`;
  const browserConfig = join(scratch, "agent-browser.json");
  let dashboard: OwnedProcess | undefined;
  let browserStarted = false;
  let cleaning = false;
  let failure: unknown;

  const browser = (args: readonly string[], commandSignal?: AbortSignal) =>
    new OwnedProcess(
      [...browserCommand, "--config", browserConfig, ...browserLaunchOptions, "--session", session, ...args],
      {
        cwd: rootDir,
        env: browserEnvironment,
        shutdownTimeoutMs,
      },
    ).run(commandTimeoutMs, commandSignal);

  async function sessionInfo(commandSignal: AbortSignal) {
    const { data } = browserSession.parse(JSON.parse(await browser(["session", "info", "--json"], commandSignal)));
    if (data.session !== session) throw new Error(`Browser returned an unexpected session: ${data.session}`);
    return data;
  }

  async function stopBrowserDaemon(): Promise<void> {
    const status = await sessionInfo(AbortSignal.timeout(shutdownTimeoutMs));
    if (!status.active) return;
    if (!status.pid) throw new Error(`Browser session ${session} is active without an owned daemon PID`);
    const pid = status.pid;
    signalProcess(pid, "SIGTERM");
    if (!(await waitForExit(pid, shutdownTimeoutMs))) {
      const current = await sessionInfo(AbortSignal.timeout(shutdownTimeoutMs));
      if (current.active && current.pid === pid) signalProcess(pid, "SIGKILL");
      if (!(await waitForExit(pid, shutdownTimeoutMs))) throw new Error(`Browser daemon ${pid} did not exit`);
    }
    if ((await sessionInfo(AbortSignal.timeout(shutdownTimeoutMs))).active)
      throw new Error(`Browser session ${session} remained active after daemon shutdown`);
  }

  try {
    operationSignal.throwIfAborted();
    await Bun.write(browserConfig, "{}\n");
    const binary = join(scratch, "dotfiles");
    const buildScratch = join(scratch, "go-build");
    await mkdir(buildScratch);
    log("Building dashboard CLI...");
    await new OwnedProcess([...(options.goCommand ?? ["go"]), "build", "-o", binary, "./cmd/dotfiles"], {
      cwd: rootDir,
      env: { ...environment, GOTMPDIR: buildScratch },
      shutdownTimeoutMs,
    }).run(startupTimeoutMs, operationSignal);

    operationSignal.throwIfAborted();
    dashboard = new OwnedProcess(
      [binary, "--config=test-project/dotfiles.config.ts", "dashboard", "--host", "127.0.0.1", "--port", "0"],
      { cwd: rootDir, env: environment, shutdownTimeoutMs },
    );
    const baseUrl = await dashboard.waitForOutput(
      /^Dashboard available at: (http:\/\/127\.0\.0\.1:[1-9]\d*)\r?$/m,
      startupTimeoutMs,
      operationSignal,
    );
    const server = dashboard;
    void server.completed.then((status) => {
      if (!cleaning) operation.abort(server.failure(`Dashboard exited during verification (status ${status})`));
    });
    const url = new URL("/tools/github-release--bat", baseUrl).href;
    log(`Verifying ${url} using browser session ${session}...`);
    browserStarted = true;
    await browser(["open", "about:blank"], operationSignal);
    await browser(["errors", "--clear"], operationSignal);
    await browser(["open", url], operationSignal);

    await browser(["wait", "#source > summary"], operationSignal);
    await browser(["click", "#source > summary"], operationSignal);
    await browser(
      [
        "wait",
        "--fn",
        "!!document.querySelector('#source .shiki span[style*=color]') && !!document.querySelector('#source .shiki')?.textContent.trim()",
      ],
      operationSignal,
    );
    log("Shiki syntax highlighting is working.");
    await browser(["wait", "#readme > summary"], operationSignal);
    await browser(["click", "#readme > summary"], operationSignal);
    await browser(
      [
        "wait",
        "--fn",
        "Array.from(document.querySelectorAll('#readme .markdown-body h1, #readme .markdown-body h2, #readme .markdown-body p')).some(element => !!element.textContent.trim())",
      ],
      operationSignal,
    );
    log("Markdown rendering is working.");
    const errors = browserErrors.parse(JSON.parse(await browser(["errors", "--json"], operationSignal)));
    if (errors.data.errors.length > 0)
      throw new Error(`Browser errors:\n${JSON.stringify(errors.data.errors, null, 2)}`);
    operationSignal.throwIfAborted();
    log("No console errors detected.");
  } catch (error) {
    failure = error;
  } finally {
    cleaning = true;
    try {
      if (browserStarted) {
        const cleanupSignal = AbortSignal.timeout(shutdownTimeoutMs);
        await browser(["close"], cleanupSignal);
        while (true) {
          const status = await sessionInfo(cleanupSignal);
          if (!status.active) break;
          await Bun.sleep(25);
        }
      }
    } catch (error) {
      let cleanupError = error;
      try {
        await stopBrowserDaemon();
      } catch (stopError) {
        cleanupError = new AggregateError(
          [error, stopError],
          `${String(error)}\nDaemon cleanup failed: ${String(stopError)}`,
        );
      }
      failure = new AggregateError(
        [failure, cleanupError].filter(Boolean),
        `Dashboard browser cleanup failed: ${String(cleanupError)}${failure ? `\nOriginal failure: ${String(failure)}` : ""}`,
      );
    } finally {
      await dashboard?.stop();
      await rm(scratch, { recursive: true, force: true });
    }
  }
  if (failure) throw failure;
  log("Dashboard verified successfully!");
}
