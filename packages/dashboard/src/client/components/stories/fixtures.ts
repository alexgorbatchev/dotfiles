import type { IDriftItem, IHealthStatus, IToolMetadata, IToolDetail } from "../../../shared/types";
import type { IToolActionOutcome, IToolActionResult, IUseToolActions } from "../../hooks/useToolActions";

export const fixture_idleActions: IUseToolActions = {
  pending: null,
  results: [],
  dismissResult: () => {},
  retryResult: async () => {},
  installTool: async () => {},
  updateTool: async () => {},
  checkTool: async () => {},
};

export const fixture_success: IToolActionOutcome = {
  toolName: "bat",
  kind: "install",
  message: "Installed 0.26.1",
  tone: "success",
};

export const fixture_failure: IToolActionOutcome = {
  toolName: "bat",
  kind: "update",
  message: "Update failed: network unreachable",
  tone: "error",
};

export const fixture_trustFailure: IToolActionOutcome = {
  toolName: "aerospace",
  kind: "install",
  message:
    "Error: Refusing to load cask nikitabobko/tap/aerospace from untrusted tap nikitabobko/tap.\nRun `brew trust --cask nikitabobko/tap/aerospace` or `brew trust nikitabobko/tap` to trust it.",
  tone: "error",
};

export const fixture_result: IToolActionResult = {
  id: 1,
  request: { toolName: "bat", kind: "install", force: false },
  outcome: fixture_success,
  elapsedSeconds: 12,
};

export const fixture_pendingActions: IUseToolActions = {
  ...fixture_idleActions,
  pending: { toolName: "bat", kind: "install", force: false, startedAt: Date.now() },
};

export const fixture_driftItems: IDriftItem[] = [
  {
    toolName: "shell",
    filePath: "/home/person/.config/shell/new.conf",
    type: "template",
    state: "new",
    desiredContent: "enabled=true",
  },
  { toolName: "shell", filePath: "/home/person/.zshrc", blockId: "shell-init", type: "block", state: "in-sync" },
  {
    toolName: "shell",
    filePath: "/home/person/.config/shell/existing.conf",
    type: "copy",
    state: "unmanaged",
    currentContent: "custom=true",
  },
  { toolName: "shell", filePath: "/home/person/.config/shell/missing.conf", type: "symlink", state: "missing" },
  {
    toolName: "shell",
    filePath: "/home/person/.config/shell/updated.conf",
    type: "template",
    state: "upstream-update",
    currentContent: "enabled=false",
    desiredContent: "enabled=true",
  },
  {
    toolName: "shell",
    filePath: "/home/person/.config/shell/local.conf",
    type: "copy",
    state: "local-drift",
    currentContent: "custom=true",
    desiredContent: "custom=false",
  },
  {
    toolName: "shell",
    filePath: "/home/person/.config/a-directory-with-a-long-name/shell/conflicting-configuration.conf",
    type: "template",
    state: "conflict",
    currentContent: "editor=local",
    desiredContent: "editor=repository",
    diff: "--- current\n+++ desired\n-editor=local\n+editor=repository",
  },
];

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
  config: { name: "example", version: "1", installationMethod: "github-release", binaries: ["example"] },
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
