import type { Subprocess } from "bun";

type ProcessOptions = {
  cwd: string;
  env?: Record<string, string | undefined>;
  shutdownTimeoutMs: number;
};
type OutputListener = () => void;
type OutputDestination = "stdout" | "stderr";

async function within<T>(promise: Promise<T>, timeoutMs: number, signal?: AbortSignal): Promise<T> {
  signal?.throwIfAborted();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort = () => {};
  const interrupted = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs);
    onAbort = () => reject(signal?.reason ?? new Error("Verification cancelled"));
    signal?.addEventListener("abort", onAbort, { once: true });
  });
  try {
    return await Promise.race([promise, interrupted]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

/** Own one command and its process group, including drained output and joined shutdown. */
export class OwnedProcess {
  readonly completed: Promise<number>;
  stdout = "";
  stderr = "";
  private readonly process: Subprocess<"ignore", "pipe", "pipe">;
  private readonly outputListeners = new Set<OutputListener>();
  private stopped?: Promise<void>;

  constructor(
    readonly command: readonly string[],
    private readonly options: ProcessOptions,
  ) {
    this.process = Bun.spawn([...command], {
      cwd: options.cwd,
      env: options.env,
      detached: true,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
    this.completed = Promise.all([
      this.process.exited,
      this.consume(this.process.stdout, "stdout"),
      this.consume(this.process.stderr, "stderr"),
    ]).then(([status]) => status);
  }

  private async consume(stream: ReadableStream<Uint8Array>, destination: OutputDestination): Promise<void> {
    const decoder = new TextDecoder();
    for await (const chunk of stream) {
      this[destination] = (this[destination] + decoder.decode(chunk, { stream: true })).slice(-65536);
      for (const listener of this.outputListeners) listener();
    }
    this[destination] += decoder.decode();
  }

  failure(message: string, cause?: unknown): Error {
    return new Error(`${message}: ${this.command.join(" ")}\n${this.stderr || this.stdout}`.trim(), { cause });
  }

  async waitForOutput(pattern: RegExp, timeoutMs: number, signal?: AbortSignal): Promise<string> {
    let onOutput = () => {};
    const ready = new Promise<string>((resolve) => {
      onOutput = () => {
        const match = this.stdout.match(pattern)?.[1];
        if (match && this.process.exitCode === null) resolve(match);
      };
      this.outputListeners.add(onOutput);
      onOutput();
    });
    try {
      return await within(
        Promise.race([
          ready,
          this.completed.then((status) => {
            throw new Error(`Dashboard exited before readiness (status ${status})`);
          }),
        ]),
        timeoutMs,
        signal,
      );
    } catch (error) {
      await this.stop();
      throw this.failure(error instanceof Error ? error.message : String(error), error);
    } finally {
      this.outputListeners.delete(onOutput);
    }
  }

  async run(timeoutMs: number, signal?: AbortSignal): Promise<string> {
    try {
      const status = await within(this.completed, timeoutMs, signal);
      if (status !== 0) throw new Error(`Command exited with status ${status}`);
      return this.stdout;
    } catch (error) {
      await this.stop();
      throw this.failure(error instanceof Error ? error.message : String(error), error);
    } finally {
      await this.stop();
    }
  }

  private signal(signal: NodeJS.Signals): void {
    try {
      process.kill(-this.process.pid, signal);
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) throw error;
    }
  }

  stop(): Promise<void> {
    this.stopped ??= (async () => {
      this.signal("SIGTERM");
      const timer = setTimeout(() => this.signal("SIGKILL"), this.options.shutdownTimeoutMs);
      try {
        await this.completed;
      } finally {
        clearTimeout(timer);
        this.signal("SIGKILL");
      }
    })();
    return this.stopped;
  }
}
