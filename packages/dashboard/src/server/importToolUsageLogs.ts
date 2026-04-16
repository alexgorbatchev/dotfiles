import {
  createRotatedToolUsageLogName,
  getToolUsageLogDir,
  getToolUsageLogPath,
  isRotatedToolUsageLogName,
  parseToolUsageLogLine,
} from "@dotfiles/registry/tool";
import path from "node:path";
import type { IDashboardServices } from "./types";

interface IUsageImportAggregate {
  toolName: string;
  binaryName: string;
  count: number;
  lastUsedAt: Date;
}

interface IImportToolUsageLogsResult {
  fileCount: number;
  eventCount: number;
  invalidLineCount: number;
}

function createUsageAggregateKey(toolName: string, binaryName: string): string {
  return `${toolName}\u0000${binaryName}`;
}

async function rotateActiveToolUsageLog(services: IDashboardServices): Promise<string | null> {
  const activeLogPath = getToolUsageLogPath(services.projectConfig);
  if (!(await services.fs.exists(activeLogPath))) {
    return null;
  }

  const usageLogDir = getToolUsageLogDir(services.projectConfig);
  const timestampMs = Date.now();

  for (let suffix = 0; suffix < 1000; suffix += 1) {
    const rotatedPath = path.join(usageLogDir, createRotatedToolUsageLogName(timestampMs, process.pid, suffix));
    if (await services.fs.exists(rotatedPath)) {
      continue;
    }

    await services.fs.rename(activeLogPath, rotatedPath);
    return rotatedPath;
  }

  throw new Error("Could not allocate a unique rotated usage log path");
}

async function getRotatedToolUsageLogPaths(services: IDashboardServices): Promise<string[]> {
  const usageLogDir = getToolUsageLogDir(services.projectConfig);
  if (!(await services.fs.exists(usageLogDir))) {
    return [];
  }

  const entries = await services.fs.readdir(usageLogDir);
  return entries
    .filter((entry) => isRotatedToolUsageLogName(entry))
    .toSorted((left, right) => left.localeCompare(right))
    .map((entry) => path.join(usageLogDir, entry));
}

async function importToolUsageLogFile(
  services: IDashboardServices,
  filePath: string,
): Promise<IImportToolUsageLogsResult> {
  const content = await services.fs.readFile(filePath);
  const lines = content.split(/\r?\n/u);
  const aggregates = new Map<string, IUsageImportAggregate>();

  let eventCount = 0;
  let invalidLineCount = 0;

  for (const line of lines) {
    const entry = parseToolUsageLogLine(line);
    if (!entry) {
      if (line.trim().length > 0) {
        invalidLineCount += 1;
      }
      continue;
    }

    eventCount += 1;
    const key = createUsageAggregateKey(entry.toolName, entry.binaryName);
    const existing = aggregates.get(key);

    if (existing) {
      existing.count += 1;
      if (entry.usedAt > existing.lastUsedAt) {
        existing.lastUsedAt = entry.usedAt;
      }
      continue;
    }

    aggregates.set(key, {
      toolName: entry.toolName,
      binaryName: entry.binaryName,
      count: 1,
      lastUsedAt: entry.usedAt,
    });
  }

  for (const aggregate of aggregates.values()) {
    await services.toolInstallationRegistry.recordToolUsage(aggregate.toolName, aggregate.binaryName, {
      count: aggregate.count,
      lastUsedAt: aggregate.lastUsedAt,
    });
  }

  await services.fs.rm(filePath);

  return {
    fileCount: 1,
    eventCount,
    invalidLineCount,
  };
}

export async function importToolUsageLogs(services: IDashboardServices): Promise<IImportToolUsageLogsResult> {
  await rotateActiveToolUsageLog(services);
  const rotatedLogPaths = await getRotatedToolUsageLogPaths(services);

  const totals: IImportToolUsageLogsResult = {
    fileCount: 0,
    eventCount: 0,
    invalidLineCount: 0,
  };

  for (const rotatedLogPath of rotatedLogPaths) {
    const result = await importToolUsageLogFile(services, rotatedLogPath);
    totals.fileCount += result.fileCount;
    totals.eventCount += result.eventCount;
    totals.invalidLineCount += result.invalidLineCount;
  }

  return totals;
}
