import { useCallback, useState } from "preact/hooks";

import type {
  ICheckUpdateResponse,
  IInstallToolRequest,
  IInstallToolResponse,
  IUpdateToolResponse,
} from "../../shared/types";
import { postApi } from "../api";

const RELOAD_DELAY_MS = 1500;
const UNSUPPORTED_CHECK_MESSAGE = "Update checking is not supported for this tool";

export type ToolActionKind = "install" | "update" | "check";

/** Drives the result banner's colour: a pending update is neither a success nor a failure. */
export type ToolActionTone = "success" | "error" | "info";

export interface IToolActionPending {
  toolName: string;
  kind: ToolActionKind;
}

export interface IToolActionOutcome {
  toolName: string;
  kind: ToolActionKind;
  message: string;
  tone: ToolActionTone;
}

export interface IUseToolActions {
  pending: IToolActionPending | null;
  outcome: IToolActionOutcome | null;
  dismissOutcome: () => void;
  installTool: (toolName: string, force: boolean) => Promise<void>;
  updateTool: (toolName: string) => Promise<void>;
  checkTool: (toolName: string) => Promise<void>;
}

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

// A successful action leaves the registry stale in every view that reads it, so reload once the outcome is readable.
function scheduleReload(): void {
  setTimeout(() => window.location.reload(), RELOAD_DELAY_MS);
}

export function useToolActions(): IUseToolActions {
  const [pending, setPending] = useState<IToolActionPending | null>(null);
  const [outcome, setOutcome] = useState<IToolActionOutcome | null>(null);

  const installTool = useCallback(async (toolName: string, force: boolean): Promise<void> => {
    setPending({ toolName, kind: "install" });
    setOutcome(null);

    try {
      const response = await postApi<IInstallToolResponse, IInstallToolRequest>(
        `/tools/${encodeURIComponent(toolName)}/install`,
        { force },
      );

      if (response.installed) {
        const message = response.alreadyInstalled
          ? `Already installed (${response.version})`
          : `Installed ${response.version}`;
        setOutcome({ toolName, kind: "install", message, tone: "success" });
        scheduleReload();
      } else {
        setOutcome({
          toolName,
          kind: "install",
          message: response.error ?? "Installation failed",
          tone: "error",
        });
      }
    } catch (error) {
      setOutcome({
        toolName,
        kind: "install",
        message: toErrorMessage(error, "Installation failed"),
        tone: "error",
      });
    } finally {
      setPending(null);
    }
  }, []);

  const updateTool = useCallback(async (toolName: string): Promise<void> => {
    setPending({ toolName, kind: "update" });
    setOutcome(null);

    try {
      const response = await postApi<IUpdateToolResponse>(`/tools/${encodeURIComponent(toolName)}/update`, {});

      if (response.updated) {
        setOutcome({
          toolName,
          kind: "update",
          message: `Updated ${response.oldVersion} → ${response.newVersion}`,
          tone: "success",
        });
        scheduleReload();
      } else {
        setOutcome({
          toolName,
          kind: "update",
          message: response.error ?? "Update failed",
          tone: "error",
        });
      }
    } catch (error) {
      setOutcome({
        toolName,
        kind: "update",
        message: toErrorMessage(error, "Update failed"),
        tone: "error",
      });
    } finally {
      setPending(null);
    }
  }, []);

  const checkTool = useCallback(async (toolName: string): Promise<void> => {
    setPending({ toolName, kind: "check" });
    setOutcome(null);

    try {
      const response = await postApi<ICheckUpdateResponse>(`/tools/${encodeURIComponent(toolName)}/check-update`, {});

      if (!response.supported) {
        setOutcome({ toolName, kind: "check", message: response.error ?? UNSUPPORTED_CHECK_MESSAGE, tone: "error" });
      } else if (response.error) {
        setOutcome({ toolName, kind: "check", message: response.error, tone: "error" });
      } else if (response.hasUpdate) {
        setOutcome({
          toolName,
          kind: "check",
          message: `Update available: ${response.currentVersion} → ${response.latestVersion}`,
          tone: "info",
        });
      } else {
        setOutcome({
          toolName,
          kind: "check",
          message: `Up to date (${response.currentVersion})`,
          tone: "success",
        });
      }
    } catch (error) {
      setOutcome({
        toolName,
        kind: "check",
        message: toErrorMessage(error, "Check failed"),
        tone: "error",
      });
    } finally {
      setPending(null);
    }
  }, []);

  const dismissOutcome = useCallback((): void => {
    setOutcome(null);
  }, []);

  return { pending, outcome, dismissOutcome, installTool, updateTool, checkTool };
}
