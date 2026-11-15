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
