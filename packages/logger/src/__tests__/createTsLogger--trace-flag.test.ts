import { describe, expect, it } from "bun:test";
import assert from "node:assert";
import { createTsLogger } from "../createTsLogger";
import { LogLevel } from "../LogLevel";

interface ITraceTemplateLog {
  settings: {
    prettyLogTemplate: string;
  };
}

function assertTraceTemplateLog(logger: unknown): asserts logger is ITraceTemplateLog {
  assert(typeof logger === "object" && logger !== null);
  assert("settings" in logger);
  assert(typeof logger.settings === "object" && logger.settings !== null);
  assert("prettyLogTemplate" in logger.settings);
  assert(typeof logger.settings.prettyLogTemplate === "string");
}

function getPrettyLogTemplate(logger: unknown): string {
  assertTraceTemplateLog(logger);
  return logger.settings.prettyLogTemplate;
}

describe("createTsLogger - trace flag", () => {
  it("should include file path with line when trace is enabled at DEFAULT log level", () => {
    const logger = createTsLogger({
      name: "test",
      level: LogLevel.DEFAULT,
      trace: true,
    });

    // Access the internal settings to verify prettyLogTemplate includes file path
    const prettyLogTemplate = getPrettyLogTemplate(logger);
    expect(prettyLogTemplate).toContain("{{filePathWithLine}}");
  });

  it("should NOT include file path with line when trace is disabled at DEFAULT log level", () => {
    const logger = createTsLogger({
      name: "test",
      level: LogLevel.DEFAULT,
      trace: false,
    });

    const prettyLogTemplate = getPrettyLogTemplate(logger);
    expect(prettyLogTemplate).not.toContain("{{filePathWithLine}}");
  });

  it("should NOT include file path with line when trace is not specified at DEFAULT log level", () => {
    const logger = createTsLogger({
      name: "test",
      level: LogLevel.DEFAULT,
    });

    const prettyLogTemplate = getPrettyLogTemplate(logger);
    expect(prettyLogTemplate).not.toContain("{{filePathWithLine}}");
  });

  it("should include file path with line when trace is enabled at VERBOSE log level", () => {
    const logger = createTsLogger({
      name: "test",
      level: LogLevel.VERBOSE,
      trace: true,
    });

    const prettyLogTemplate = getPrettyLogTemplate(logger);
    expect(prettyLogTemplate).toContain("{{filePathWithLine}}");
  });

  it("should include file path with line when trace is enabled at QUIET log level", () => {
    // Even at quiet level, if trace is enabled, the template is set (though no logs show)
    const logger = createTsLogger({
      name: "test",
      level: LogLevel.QUIET,
      trace: true,
    });

    const prettyLogTemplate = getPrettyLogTemplate(logger);
    expect(prettyLogTemplate).toContain("{{filePathWithLine}}");
  });

  it("should NOT include file path with line at VERBOSE level without trace flag", () => {
    const logger = createTsLogger({
      name: "test",
      level: LogLevel.VERBOSE,
    });

    const prettyLogTemplate = getPrettyLogTemplate(logger);
    expect(prettyLogTemplate).not.toContain("{{filePathWithLine}}");
  });
});
