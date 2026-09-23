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

type CheckDescription = Pick<IToolActionOutcome, "message" | "tone">;

/** Words and tone for one check-update answer, in the terms `dotfiles tool check` uses. */
function describeCheck(response: ICheckUpdateResponse): CheckDescription {
  switch (response.status) {
    case "unsupported":
      return { message: response.error ?? UNSUPPORTED_CHECK_MESSAGE, tone: "error" };
    case "update-available":
      return { message: `Update available: ${response.currentVersion} → ${response.latestVersion}`, tone: "info" };
    case "ahead-of-latest":
      return {
        message: `${response.currentVersion} is ahead of the latest known version (${response.latestVersion})`,
        tone: "info",
      };
    case "up-to-date":
      return { message: `Up to date (${response.currentVersion})`, tone: "success" };
    case "not-installed":
      return {
        message:
          response.latestVersion === "unknown"
            ? "Not installed"
            : `Not installed; the latest available version is ${response.latestVersion}`,
        tone: "info",
      };
  }
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

      if (response.status === "unsupported") {
        // Nothing upstream was asked, so whatever version the reinstall recorded says nothing about newer releases.
        setOutcome({
          toolName,
          kind: "update",
          message: `Reinstalled ${response.newVersion}; update checking is not supported for this tool`,
          tone: "info",
        });
        scheduleReload();
      } else if (response.updated) {
        setOutcome({
          toolName,
          kind: "update",
          message: `Updated ${response.oldVersion} → ${response.newVersion}`,
          tone: "success",
        });
        scheduleReload();
      } else if (response.reinstalled) {
        setOutcome({ toolName, kind: "update", message: `Reinstalled ${response.newVersion}`, tone: "success" });
        scheduleReload();
      } else if (response.status === "ahead-of-latest") {
        // An installation newer than the latest release is left alone, never moved back to it.
        setOutcome({
          toolName,
          kind: "update",
          message: `${response.oldVersion} is ahead of the latest known version (${response.latestVersion})`,
          tone: "info",
        });
      } else {
        setOutcome({
          toolName,
          kind: "update",
          message: `Already up to date (${response.newVersion})`,
          tone: "success",
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

      setOutcome({ toolName, kind: "check", ...describeCheck(response) });
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
