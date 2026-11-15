import assert from "node:assert";
import { chmod, mkdir, mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { Subprocess } from "bun";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { verifyDashboard } from "../verifyDashboard";

type BrowserCall = {
  session: string;
  command: string[];
  config: string;
  environmentSession: string | null;
  launchArgs: string | null;
};
const repoRoot = resolve(import.meta.dir, "../../../..");
let sandbox: string;
let fixtureDaemon: Subprocess<"ignore", "ignore", "ignore"> | undefined;

beforeEach(async () => {
  await mkdir(join(repoRoot, ".tmp"), { recursive: true });
  sandbox = await mkdtemp(join(repoRoot, ".tmp/dashboard-verifier-test-"));
  await Bun.write(join(sandbox, "go"), Bun.file(new URL("./fixtures/build.txt", import.meta.url)));
  await Bun.write(join(sandbox, "server"), Bun.file(new URL("./fixtures/dashboard.txt", import.meta.url)));
  await Bun.write(join(sandbox, "agent-browser"), Bun.file(new URL("./fixtures/browser.txt", import.meta.url)));
  await chmod(join(sandbox, "go"), 0o755);
  await chmod(join(sandbox, "server"), 0o755);
  await chmod(join(sandbox, "agent-browser"), 0o755);
});

afterEach(async () => {
  fixtureDaemon?.kill("SIGKILL");
  await fixtureDaemon?.exited;
  fixtureDaemon = undefined;
  await rm(sandbox, { recursive: true, force: true });
});

async function startDaemon(signalHandler: string): Promise<void> {
  fixtureDaemon = Bun.spawn(
    [
      process.execPath,
      "-e",
      `process.on('SIGTERM', () => ${signalHandler}); await Bun.write(process.argv[1], 'ready'); setInterval(() => {}, 1000)`,
      join(sandbox, "daemon-ready"),
    ],
    { stdin: "ignore", stdout: "ignore", stderr: "ignore" },
  );
  await Bun.write(join(sandbox, "daemon-pid"), String(fixtureDaemon.pid));
  await waitForFile(join(sandbox, "daemon-ready"));
}

function options(mode = "success") {
  return {
    rootDir: sandbox,
    goCommand: [join(sandbox, "go")],
    browserCommand: [join(sandbox, "agent-browser")],
    env: {
      ...process.env,
      VERIFY_FIXTURE_DIR: sandbox,
      VERIFY_MODE: mode,
      AGENT_BROWSER_SESSION: "unrelated-user-session",
      AGENT_BROWSER_ARGS: "--no-sandbox",
    },
    startupTimeoutMs: 2000,
    commandTimeoutMs: 2000,
    shutdownTimeoutMs: 100,
  };
}

async function browserCalls(): Promise<BrowserCall[]> {
  return (await Bun.file(join(sandbox, "browser-log")).text())
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}

async function assertStopped(): Promise<void> {
  const pid = Number(await Bun.file(join(sandbox, "server-pid")).text());
  expect(() => process.kill(pid, 0)).toThrow();
  expect(await Bun.file(join(sandbox, "browser-active")).text()).toBe("false");
  expect(await readdir(join(sandbox, ".tmp"))).toEqual([]);
  const calls = await browserCalls();
  expect(calls.at(-2)?.command).toEqual(["close"]);
  expect(calls.at(-1)?.command).toEqual(["session", "info", "--json"]);
}

async function waitForFile(path: string): Promise<void> {
  const deadline = Date.now() + 2000;
  while (!(await Bun.file(path).exists())) {
    assert(Date.now() < deadline, `Timed out waiting for ${path}`);
    await Bun.sleep(10);
  }
}

describe("dashboard verifier lifecycle", () => {
  test("uses the child readiness URL and isolated session while another listener is occupied", async () => {
    let unrelatedRequests = 0;
    const unrelated = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch() {
        unrelatedRequests += 1;
        return new Response("unrelated");
      },
    });
    try {
      await verifyDashboard(options());
      const url = await Bun.file(join(sandbox, "server-url")).text();
      expect(new URL(url).port).not.toBe(String(unrelated.port));
      expect(unrelatedRequests).toBe(0);
      const calls = await browserCalls();
      const session = calls[0]?.session;
      assert(session);
      expect(session.startsWith("dashboard-verify-")).toBe(true);
      expect(new Set(calls.map((call) => call.session))).toEqual(new Set([session]));
      expect(calls.every((call) => call.environmentSession === null)).toBe(true);
      expect(calls.every((call) => call.launchArgs === "--no-sandbox")).toBe(true);
      expect(calls.find((call) => call.command[0] === "open" && call.command[1]?.startsWith("http:"))?.command).toEqual(
        ["open", new URL("/tools/github-release--bat", url).href],
      );
      expect(calls.filter((call) => call.command[0] === "click").map((call) => call.command)).toEqual([
        ["click", "#source > summary"],
        ["click", "#readme > summary"],
      ]);
      expect(await Bun.file(join(sandbox, "server-args")).json()).toEqual([
        "--config=test-project/dotfiles.config.ts",
        "dashboard",
        "--host",
        "127.0.0.1",
        "--port",
        "0",
      ]);
      await assertStopped();
    } finally {
      await unrelated.stop(true);
    }
  });

  test.each([
    ["build-failure", "fixture compiler rejected source"],
    ["startup-failure", "fixture configuration is invalid"],
  ])("reports %s stderr before touching the browser", async (mode, diagnostic) => {
    await expect(verifyDashboard(options(mode))).rejects.toThrow(diagnostic);
    expect(await Bun.file(join(sandbox, "browser-log")).exists()).toBe(false);
    expect(await readdir(join(sandbox, ".tmp"))).toEqual([]);
  });

  test("times out startup with stderr and joins the child", async () => {
    await expect(verifyDashboard({ ...options("startup-hang"), startupTimeoutMs: 200 })).rejects.toThrow(
      "fixture still loading configuration",
    );
    const pid = Number(await Bun.file(join(sandbox, "server-pid")).text());
    expect(() => process.kill(pid, 0)).toThrow();
    expect(await readdir(join(sandbox, ".tmp"))).toEqual([]);
  });

  test.each([
    ["browser-failure", "fixture syntax highlighting missing"],
    ["console-error", "ReferenceError: broken bundle"],
    ["runtime-failure", "fixture server crashed"],
  ])("cleans up after %s", async (mode, diagnostic) => {
    await expect(verifyDashboard(options(mode))).rejects.toThrow(diagnostic);
    await assertStopped();
  });

  test("kills and joins a server which ignores graceful shutdown", async () => {
    await verifyDashboard(options("ignore-term"));
    await assertStopped();
  });

  test("waits for the browser daemon to finish closing", async () => {
    await verifyDashboard({ ...options("delayed-close"), shutdownTimeoutMs: 1000 });
    const calls = await browserCalls();
    expect(calls.filter((call) => call.command[0] === "session")).toHaveLength(2);
    expect(await Bun.file(join(sandbox, "browser-active")).text()).toBe("false");
    expect(await readdir(join(sandbox, ".tmp"))).toEqual([]);
    const pid = Number(await Bun.file(join(sandbox, "server-pid")).text());
    expect(() => process.kill(pid, 0)).toThrow();
  });

  test.each(["process.exit(0)", "{}"])(
    "stops its daemon and preserves the original failure when close fails (TERM handler: %s)",
    async (signalHandler) => {
      await startDaemon(signalHandler);
      const error = await verifyDashboard(options("cleanup-failure")).catch((failure: unknown) => failure);
      assert(error instanceof AggregateError);
      expect(error.message.includes("fixture syntax highlighting missing")).toBe(true);
      expect(error.message.includes("fixture close failed")).toBe(true);
      const daemonPid = Number(await Bun.file(join(sandbox, "daemon-pid")).text());
      expect(() => process.kill(daemonPid, 0)).toThrow();
      expect(await Bun.file(join(sandbox, "browser-active")).text()).toBe("false");
      expect(await readdir(join(sandbox, ".tmp"))).toEqual([]);
      const pid = Number(await Bun.file(join(sandbox, "server-pid")).text());
      expect(() => process.kill(pid, 0)).toThrow();
    },
  );

  test("refuses to signal a PID reported for another browser session", async () => {
    await startDaemon("process.exit(0)");
    const error = await verifyDashboard(options("cleanup-foreign")).catch((failure: unknown) => failure);
    assert(error instanceof AggregateError);
    expect(error.message.includes("unexpected session: unrelated-user-session")).toBe(true);
    assert(fixtureDaemon);
    expect(process.kill(fixtureDaemon.pid, 0)).toBe(true);
    expect(await readdir(join(sandbox, ".tmp"))).toEqual([]);
  });

  test("cancellation joins the active browser command and closes its session", async () => {
    const cancellation = new AbortController();
    const run = verifyDashboard({ ...options("browser-hang"), signal: cancellation.signal });
    const outcome = run.catch((error: unknown) => error);
    await waitForFile(join(sandbox, "browser-waiting"));
    const reason = new Error("cancelled by test");
    cancellation.abort(reason);
    const error = await outcome;
    assert(error instanceof Error);
    expect(error.cause).toBe(reason);
    const pid = Number(await Bun.file(join(sandbox, "browser-waiting")).text());
    expect(() => process.kill(pid, 0)).toThrow();
    await assertStopped();
  });

  test("cancellation during compilation removes scratch before returning", async () => {
    const cancellation = new AbortController();
    const run = verifyDashboard({ ...options("build-hang"), signal: cancellation.signal });
    const outcome = run.catch((error: unknown) => error);
    await waitForFile(join(sandbox, "build-started"));
    const reason = new Error("cancelled build");
    cancellation.abort(reason);
    const error = await outcome;
    assert(error instanceof Error);
    expect(error.cause).toBe(reason);
    const pid = Number(await Bun.file(join(sandbox, "build-started")).text());
    expect(() => process.kill(pid, 0)).toThrow();
    expect(await readdir(join(sandbox, ".tmp"))).toEqual([]);
  });

  test.each(["SIGINT", "SIGTERM"] as const)("the script joins cleanup before exiting after %s", async (signal) => {
    const proc = Bun.spawn([process.execPath, join(repoRoot, "packages/dashboard/scripts/verify-dashboard.ts")], {
      cwd: repoRoot,
      env: { ...options("browser-hang").env, PATH: `${sandbox}:${process.env["PATH"]}` },
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = new Response(proc.stdout).text();
    const errors = new Response(proc.stderr).text();
    try {
      await waitForFile(join(sandbox, "browser-waiting"));
      proc.kill(signal);
      expect(await proc.exited).toBe(1);
      expect((await errors).includes(`Dashboard verification interrupted (${signal})`)).toBe(true);
      expect((await output).includes("Dashboard verified successfully!")).toBe(false);
      expect(await Bun.file(join(sandbox, "browser-active")).text()).toBe("false");
      const calls = await browserCalls();
      const firstCall = calls[0];
      assert(firstCall);
      await expect(stat(dirname(firstCall.config))).rejects.toMatchObject({ code: "ENOENT" });
      const serverPid = Number(await Bun.file(join(sandbox, "server-pid")).text());
      const browserPid = Number(await Bun.file(join(sandbox, "browser-waiting")).text());
      expect(() => process.kill(serverPid, 0)).toThrow();
      expect(() => process.kill(browserPid, 0)).toThrow();
    } finally {
      proc.kill("SIGTERM");
      const timer = setTimeout(() => proc.kill("SIGKILL"), 1000);
      await proc.exited;
      clearTimeout(timer);
      await Promise.all([output, errors]);
    }
  });
});
