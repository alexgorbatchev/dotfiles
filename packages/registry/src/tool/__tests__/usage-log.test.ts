import { describe, expect, test } from "bun:test";
import {
  TOOL_USAGE_LOG_FILE_NAME,
  createRotatedToolUsageLogName,
  getToolUsageLogDir,
  getToolUsageLogPath,
  isRotatedToolUsageLogName,
  parseToolUsageLogLine,
} from "../usage-log";

describe("usage-log helpers", () => {
  const projectConfig = {
    paths: {
      generatedDir: "/home/user/.dotfiles/.generated",
    },
  };

  test("returns the active usage log path", () => {
    expect(getToolUsageLogDir(projectConfig)).toBe("/home/user/.dotfiles/.generated/usage");
    expect(getToolUsageLogPath(projectConfig)).toBe("/home/user/.dotfiles/.generated/usage/shim-usage.log");
  });

  test("recognizes rotated usage log names", () => {
    const rotatedName = createRotatedToolUsageLogName(1234, 99);
    expect(rotatedName).toBe(`${TOOL_USAGE_LOG_FILE_NAME}.1234.99`);
    expect(isRotatedToolUsageLogName(rotatedName)).toBe(true);
    expect(isRotatedToolUsageLogName(TOOL_USAGE_LOG_FILE_NAME)).toBe(false);
  });

  test("parses versioned usage log lines", () => {
    const entry = parseToolUsageLogLine("1\t1713273296\trg\trg");
    expect(entry).toMatchObject({ toolName: "rg", binaryName: "rg" });
    expect(entry?.usedAt.getTime()).toBe(1713273296 * 1000);
  });

  test("returns null for invalid usage log lines", () => {
    expect(parseToolUsageLogLine("")).toBeNull();
    expect(parseToolUsageLogLine("1\trg\trg")).toBeNull();
    expect(parseToolUsageLogLine("2\t1713273296\trg\trg")).toBeNull();
    expect(parseToolUsageLogLine("1\tnot-a-number\trg\trg")).toBeNull();
  });
});
