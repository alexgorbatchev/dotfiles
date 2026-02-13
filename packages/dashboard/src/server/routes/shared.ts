import type { ToolConfig } from '@dotfiles/core';
import type { TsLogger } from '@dotfiles/logger';
import type { IDashboardServices, ToolConfigsCache } from '../types';

/** Cache for loaded tool configs to avoid re-parsing on every request */
let toolConfigsCache: ToolConfigsCache | null = null;

/** Cache for git first commit dates */
let gitFirstCommitDatesCache: Map<string, Date> | null = null;

/**
 * Clear the tool configs cache. Used for testing.
 */
export function clearToolConfigsCache(): void {
  toolConfigsCache = null;
}

/**
 * Clear the git first commit dates cache. Used for testing.
 */
export function clearGitFirstCommitDatesCache(): void {
  gitFirstCommitDatesCache = null;
}

/**
 * Load tool configs, using cache if available.
 */
export async function getToolConfigs(
  logger: TsLogger,
  services: IDashboardServices,
): Promise<Record<string, ToolConfig>> {
  if (toolConfigsCache) {
    return toolConfigsCache;
  }

  const { projectConfig, fs, configService, systemInfo } = services;

  toolConfigsCache = await configService.loadToolConfigs(
    logger,
    projectConfig.paths.toolConfigsDir,
    fs,
    projectConfig,
    systemInfo,
  );

  return toolConfigsCache;
}

/**
 * Load all git first commit dates in a single git command.
 * Returns a Map from absolute file path to the Date it was first committed.
 */
async function loadGitFirstCommitDates(): Promise<Map<string, Date>> {
  const cache = new Map<string, Date>();

  try {
    // Get the repository root to resolve relative paths
    const rootProc = Bun.spawn(['git', 'rev-parse', '--show-toplevel'], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const repoRoot = (await new Response(rootProc.stdout).text()).trim();
    const rootExitCode = await rootProc.exited;

    if (rootExitCode !== 0 || !repoRoot) {
      return cache;
    }

    // Get all file additions with their dates in a single command
    // Output format: date\n\nfile1\nfile2\n\ndate2\n\nfile3\n...
    const proc = Bun.spawn(['git', 'log', '--diff-filter=A', '--name-only', '--format=%aI'], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      return cache;
    }

    // Parse the output: dates are ISO format, files follow each date
    // Format is: date\n\nfile1\nfile2\n\ndate2\n\nfile3...
    const lines = output.split('\n');
    let currentDate: Date | null = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Check if this line is an ISO date (starts with 4 digits)
      if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
        currentDate = new Date(trimmed);
      } else if (currentDate) {
        // This is a file path, make it absolute
        const absolutePath = `${repoRoot}/${trimmed}`;
        // Only store if we haven't seen this file (first commit = earliest in log)
        if (!cache.has(absolutePath)) {
          cache.set(absolutePath, currentDate);
        }
      }
    }
  } catch {
    // Return empty cache on any error
  }

  return cache;
}

/**
 * Query git for a single file's first commit date.
 * Used for files not found in the batch cache (e.g., newly added files).
 */
async function querySingleFileGitDate(filePath: string): Promise<Date | null> {
  try {
    const proc = Bun.spawn(['git', 'log', '--diff-filter=A', '--format=%aI', '--', filePath], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0 || !output.trim()) {
      return null;
    }

    const dateStr = output.trim().split('\n')[0];
    if (!dateStr) {
      return null;
    }

    return new Date(dateStr);
  } catch {
    return null;
  }
}

/**
 * Get the date when a file was first committed to git.
 * Uses a cached batch query for performance, with on-demand queries for new files.
 * Returns null if the file is not tracked by git.
 */
export async function getGitFirstCommitDate(filePath: string): Promise<Date | null> {
  if (!gitFirstCommitDatesCache) {
    gitFirstCommitDatesCache = await loadGitFirstCommitDates();
  }

  // Check cache first
  const cached = gitFirstCommitDatesCache.get(filePath);
  if (cached) {
    return cached;
  }

  // File not in cache - might be newly added, query git directly
  const date = await querySingleFileGitDate(filePath);
  if (date) {
    gitFirstCommitDatesCache.set(filePath, date);
  }
  return date;
}
