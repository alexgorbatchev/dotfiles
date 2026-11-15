import type { IHealthStatus, IToolMetadata, IConfigSummary, IToolDetail, IToolHistory } from "../../shared/types";
import type { IToolActionResult, IUseToolActions } from "../hooks/useToolActions";

export const fixture_idleActions: IUseToolActions = {
  pending: null,
  results: [],
  dismissResult: () => {},
  retryResult: async () => {},
  installTool: async () => {},
  updateTool: async () => {},
  checkTool: async () => {},
};

export const fixture_failedResult: IToolActionResult = {
  id: 1,
  request: { toolName: "bat", kind: "install", force: true },
  outcome: { toolName: "bat", kind: "install", message: "Network unavailable", tone: "error" },
  elapsedSeconds: 2,
};

export const fixture_projectConfig: IConfigSummary = {
  configFilePath: "/project/dotfiles.config.ts",
  dotfilesDir: "/project",
  generatedDir: "/project/.generated",
  binariesDir: "/project/bin",
  targetDir: "/home/test",
  toolConfigsDir: "/project/tools",
};

export const fixture_health: IHealthStatus = {
  overall: "healthy",
  checks: [
    {
      id: "tool-installations",
      name: "Tool Installations",
      status: "pass",
      message: "Recorded binaries present",
      findings: [],
    },
    {
      id: "registry-integrity",
      name: "Registry Integrity",
      status: "pass",
      message: "Recorded installation paths present",
      findings: [],
    },
  ],
  lastCheck: "2026-11-15T06:00:00Z",
};
export const fixture_toolMetadata: IToolMetadata = {
  applicability: "active",
  reason: "",
  kind: "installable",
  requestedVersion: "latest",
  updateMode: "update",
  actions: {
    install: { enabled: true, reason: "" },
    check: { enabled: true, reason: "" },
    update: { enabled: true, reason: "" },
    reinstall: { enabled: true, reason: "" },
  },
};

export const fixture_tool: IToolDetail = {
  metadata: fixture_toolMetadata,
  config: { name: "example", version: "1", installationMethod: "manual", binaries: ["example"] },
  runtime: {
    status: "installed",
    installedVersion: "1",
    installedAt: "2026-11-15T06:00:00Z",
    installPath: "/bin/example",
    binaryPaths: ["/bin/example"],
  },
  files: [],
  binaryDiskSize: 0,
  usage: { totalCount: 0, binaries: [] },
};

export const fixture_emptyHistory: IToolHistory = {
  entries: [],
  totalCount: 0,
  installedAt: null,
  dotfilesDir: "/project",
};

export const fixture_configurationTool: IToolDetail = {
  ...fixture_tool,
  config: { name: "configuration-only" },
  runtime: { ...fixture_tool.runtime, binaryPaths: null },
};
