import { describe, expect, test } from "bun:test";
import { getToolRuntimeState, toToolDetail, formatTimestamp, formatRelativeTime } from "../dashboardUtils";
import type { ToolConfig } from "../types.gen";
import type { IToolInstallationRecord, IFileState, ISystemInfo, IToolUsageSummary } from "../types";
import { Platform, Architecture } from "../platform.types";

describe("dashboardUtils", () => {
  test("getToolRuntimeState handles uninstalled tool", () => {
    const installations = new Map<string, IToolInstallationRecord>();
    const state = getToolRuntimeState("bat", installations);

    expect(state).toEqual({
      status: "not-installed",
      installedVersion: null,
      installedAt: null,
      installPath: null,
      binaryPaths: [],
      hasUpdate: false,
    });
  });

  test("getToolRuntimeState handles installed tool", () => {
    const installations = new Map<string, IToolInstallationRecord>();
    const now = new Date("2026-01-01T00:00:00Z");
    installations.set("bat", {
      id: 1,
      toolName: "bat",
      version: "0.24.0",
      installPath: "/bin/bat",
      timestamp: now.toISOString(),
      installedAt: now,
      binaryPaths: ["/bin/bat"],
    });

    const state = getToolRuntimeState("bat", installations);
    expect(state).toEqual({
      status: "installed",
      installedVersion: "0.24.0",
      installedAt: now.toISOString(),
      installPath: "/bin/bat",
      binaryPaths: ["/bin/bat"],
      hasUpdate: false,
    });
  });

  test("toToolDetail builds detail object", () => {
    const config: ToolConfig = {
      name: "bat",
      version: "0.24.0",
      installationMethod: "github-release",
      binaries: ["bat"],
    };
    const installations = new Map<string, IToolInstallationRecord>();
    const files: IFileState[] = [];
    const sysInfo: ISystemInfo = {
      platform: Platform.MacOS,
      arch: Architecture.Arm64,
      homeDir: "/home/user",
      hostname: "test-host",
    };
    const usage: IToolUsageSummary = { totalCount: 5, binaries: [] };

    const detail = toToolDetail(config, installations, files, sysInfo, 1024, usage);
    expect(detail.binaryDiskSize).toBe(1024);
    expect(detail.usage).toEqual(usage);
    expect(detail.config.name).toBe("bat");
  });

  test("formatTimestamp formats to ISO string", () => {
    const ts = new Date("2026-03-15T12:00:00Z").getTime();
    expect(formatTimestamp(ts)).toBe("2026-03-15T12:00:00.000Z");
  });

  test("formatRelativeTime formats time differences", () => {
    const now = Date.now();
    expect(formatRelativeTime(now - 10000)).toBe("just now");
    expect(formatRelativeTime(now - 120000)).toBe("2 minutes ago");
    expect(formatRelativeTime(now - 60000)).toBe("1 minute ago");
    expect(formatRelativeTime(now - 3600000)).toBe("1 hour ago");
    expect(formatRelativeTime(now - 7200000)).toBe("2 hours ago");
    expect(formatRelativeTime(now - 86400000)).toBe("1 day ago");
    expect(formatRelativeTime(now - 172800000)).toBe("2 days ago");
    expect(formatRelativeTime(now - 2592000000)).toBe("1 month ago");
    expect(formatRelativeTime(now - 5184000000)).toBe("2 months ago");
  });
});
