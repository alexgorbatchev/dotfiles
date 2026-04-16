import path from "node:path";
import type { IToolUsageLogEntry } from "./types";

interface IUsageLogProjectConfig {
  paths: {
    generatedDir: string;
  };
}

export const TOOL_USAGE_LOG_DIR_NAME = "usage";
export const TOOL_USAGE_LOG_FILE_NAME = "shim-usage.log";
export const TOOL_USAGE_LOG_VERSION = "1";

export function getToolUsageLogDir(projectConfig: IUsageLogProjectConfig): string {
  return path.join(projectConfig.paths.generatedDir, TOOL_USAGE_LOG_DIR_NAME);
}

export function getToolUsageLogPath(projectConfig: IUsageLogProjectConfig): string {
  return path.join(getToolUsageLogDir(projectConfig), TOOL_USAGE_LOG_FILE_NAME);
}

export function createRotatedToolUsageLogName(timestampMs: number, pid: number, suffix = 0): string {
  const suffixText = suffix > 0 ? `.${suffix}` : "";
  return `${TOOL_USAGE_LOG_FILE_NAME}.${timestampMs}.${pid}${suffixText}`;
}

export function isRotatedToolUsageLogName(fileName: string): boolean {
  return fileName.startsWith(`${TOOL_USAGE_LOG_FILE_NAME}.`);
}

export function parseToolUsageLogLine(line: string): IToolUsageLogEntry | null {
  const trimmedLine = line.trim();
  if (trimmedLine.length === 0) {
    return null;
  }

  const parts = trimmedLine.split("\t");
  if (parts.length !== 4) {
    return null;
  }

  const version = parts[0];
  const timestampSecondsText = parts[1];
  const toolName = parts[2];
  const binaryName = parts[3];

  if (!version || !timestampSecondsText || !toolName || !binaryName) {
    return null;
  }

  if (version !== TOOL_USAGE_LOG_VERSION) {
    return null;
  }

  const timestampSeconds = Number.parseInt(timestampSecondsText, 10);
  if (!Number.isFinite(timestampSeconds) || timestampSeconds < 0) {
    return null;
  }

  return {
    toolName,
    binaryName,
    usedAt: new Date(timestampSeconds * 1000),
  };
}
