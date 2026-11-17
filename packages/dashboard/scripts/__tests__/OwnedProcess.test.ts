import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { OwnedProcess } from "../OwnedProcess";

function errno(code: string): Error {
  return Object.assign(new Error(`kill() failed: ${code}`), { code });
}

let killSpy: ReturnType<typeof spyOn> | undefined;

afterEach(() => {
  killSpy?.mockRestore();
  killSpy = undefined;
});

describe("OwnedProcess.stop", () => {
  // On macOS a process group whose last member is exiting answers EPERM, not ESRCH,
  // for a moment; stop waits that out instead of failing.
  test("waits out a transient EPERM from the exiting process group", async () => {
    const owned = new OwnedProcess(["sh", "-c", "exit 0"], { cwd: process.cwd(), shutdownTimeoutMs: 1000 });
    await owned.completed;
    const answers = ["EPERM", "EPERM", "ESRCH", "ESRCH"];
    killSpy = spyOn(process, "kill").mockImplementation((() => {
      throw errno(answers.shift() ?? "ESRCH");
    }) as typeof process.kill);

    await owned.stop();
    // TERM is retried through two EPERMs until ESRCH, then the final KILL sweep.
    expect(killSpy).toHaveBeenCalledTimes(4);
    expect(answers).toEqual([]);
  });

  test("rethrows EPERM that outlasts the shutdown timeout", async () => {
    const owned = new OwnedProcess(["sh", "-c", "exit 0"], { cwd: process.cwd(), shutdownTimeoutMs: 50 });
    await owned.completed;
    killSpy = spyOn(process, "kill").mockImplementation((() => {
      throw errno("EPERM");
    }) as typeof process.kill);

    await expect(owned.stop()).rejects.toThrow("EPERM");
  });
});
