import { describe, expect, it } from "bun:test";
import assert from "node:assert";
import type { ILogObj, ILogObjMeta } from "tslog";
import { LogLevel } from "../LogLevel";
import { TestLogger } from "../TestLogger";
import type { SafeLogMessage } from "../types";

interface ITslogErrorObject {
  nativeError: Error;
  name: string;
  message: string;
  stack: Array<{
    fullFilePath?: string;
    fileName?: string;
    method?: string;
  }>;
}

function isTslogErrorObject(value: unknown): value is ITslogErrorObject {
  return (
    typeof value === "object" &&
    value !== null &&
    "nativeError" in value &&
    "stack" in value &&
    Array.isArray((value as ITslogErrorObject).stack)
  );
}

function getLoggedArg(log: ILogObjMeta, index: number): unknown {
  return log[index];
}

describe("SafeLogger - error argument handling", () => {
  it("replaces error with .tool.ts location string in non-trace mode", () => {
    const logger = new TestLogger<ILogObj>({ name: "test", minLevel: LogLevel.DEFAULT });

    const error = new Error("Test error");
    error.stack = `Error: Test error
    at internalFunction (/path/to/internal/file.ts:10:5)
    at hook (/path/to/my.tool.ts:14:13)
    at moreInternalCode (/path/to/internal/other.ts:20:10)`;

    logger.error("Operation failed" as SafeLogMessage, error);

    logger.expect(["ERROR"], ["test"], [], ["Operation failed"]);

    // Error is replaced with a plain string showing .tool.ts location
    const loggedArg = getLoggedArg(logger.logs[0]!, 1);
    expect(loggedArg).toBe("(my.tool.ts:14)");
  });

  it("replaces error with .tool.ts location in warn logs", () => {
    const logger = new TestLogger<ILogObj>({ name: "test", minLevel: LogLevel.DEFAULT });

    const error = new Error("Warning condition");
    error.stack = `Error: Warning condition
    at someInternal (/internal/path.ts:5:1)
    at userHook (/tools/example.tool.ts:25:8)`;

    logger.warn("Warning occurred" as SafeLogMessage, error);

    logger.expect(["WARN"], ["test"], [], ["Warning occurred"]);

    const loggedArg = getLoggedArg(logger.logs[0]!, 1);
    expect(loggedArg).toBe("(example.tool.ts:25)");
  });

  it("drops error entirely when no .tool.ts frames exist", () => {
    const logger = new TestLogger<ILogObj>({ name: "test", minLevel: LogLevel.DEFAULT });

    const error = new Error("Internal error");
    error.stack = `Error: Internal error
    at internalFunction (/path/to/internal/file.ts:10:5)
    at frameworkCode (/node_modules/some-lib/index.js:50:10)`;

    logger.error("Operation failed" as SafeLogMessage, error);

    logger.expect(["ERROR"], ["test"], [], ["Operation failed"]);

    // No .tool.ts frames — error is dropped, only message remains
    const loggedArg = getLoggedArg(logger.logs[0]!, 1);
    expect(loggedArg).toBeUndefined();
  });

  it("shows multiple .tool.ts locations", () => {
    const logger = new TestLogger<ILogObj>({ name: "test", minLevel: LogLevel.DEFAULT });

    const error = new Error("Multi-frame error");
    error.stack = `Error: Multi-frame error
    at firstHook (/path/to/navi.tool.ts:14:13)
    at internal (/path/to/other.ts:20:10)
    at secondHook (/path/to/flux.tool.ts:8:3)`;

    logger.error("Operation failed" as SafeLogMessage, error);

    const loggedArg = getLoggedArg(logger.logs[0]!, 1);
    expect(loggedArg).toBe("(navi.tool.ts:14, flux.tool.ts:8)");
  });

  it("passes error objects through unchanged in trace mode", () => {
    const logger = new TestLogger<ILogObj>({ name: "test", trace: true });

    const error = new Error("Debug error");
    error.stack = `Error: Debug error
    at internalFunction (/path/to/internal/file.ts:10:5)
    at hook (/path/to/my.tool.ts:14:13)`;

    logger.error("Debug operation failed" as SafeLogMessage, error);

    logger.expect(["ERROR"], ["test"], [], ["Debug operation failed"]);

    // In trace mode, full error object is passed through to tslog
    const loggedArg = getLoggedArg(logger.logs[0]!, 1);
    assert(isTslogErrorObject(loggedArg));
    expect(loggedArg.message).toBe("Debug error");
    expect(loggedArg.stack.length).toBeGreaterThanOrEqual(2);
  });

  it("does not filter non-error arguments", () => {
    const logger = new TestLogger<ILogObj>({ name: "test", minLevel: LogLevel.DEFAULT });

    const context = { toolName: "my-tool", path: "/some/path" };
    logger.error("Operation failed" as SafeLogMessage, context);

    logger.expect(["ERROR"], ["test"], [], ["Operation failed"]);

    const loggedArg = getLoggedArg(logger.logs[0]!, 1) as unknown;
    expect(loggedArg).toEqual(context);
  });

  it("does not filter errors from trace-level logs", () => {
    const logger = new TestLogger<ILogObj>({ name: "test", minLevel: 0 });

    const error = new Error("Trace-level error");
    logger.trace("Trace message" as SafeLogMessage, error);

    logger.expect(["TRACE"], ["test"], [], ["Trace message"]);

    const loggedArg = getLoggedArg(logger.logs[0]!, 1);
    assert(isTslogErrorObject(loggedArg));
    expect(loggedArg.message).toBe("Trace-level error");
  });

  it("does not filter errors from debug-level logs", () => {
    const logger = new TestLogger<ILogObj>({ name: "test", minLevel: 0 });

    const error = new Error("Debug-level error");
    logger.debug("Debug message" as SafeLogMessage, error);

    logger.expect(["DEBUG"], ["test"], [], ["Debug message"]);

    const loggedArg = getLoggedArg(logger.logs[0]!, 1);
    assert(isTslogErrorObject(loggedArg));
    expect(loggedArg.message).toBe("Debug-level error");
  });
});
