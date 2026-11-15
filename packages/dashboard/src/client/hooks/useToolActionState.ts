import { useCallback, useRef, useState } from "preact/hooks";

import type {
  ICheckUpdateResponse,
  IInstallToolRequest,
  IInstallToolResponse,
  IUpdateToolResponse,
} from "../../shared/types";
import { postApi } from "../api";
import { invalidateFetches } from "../invalidateFetches";

import type {
  IToolActionOutcome,
  IToolActionPending,
  IToolActionRequest,
  IToolActionResult,
  IUseToolActions,
} from "../operations/types";

const UNSUPPORTED_CHECK_MESSAGE = "Update checking is not supported for this tool";

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

function describeUpdate(response: IUpdateToolResponse): CheckDescription {
  if (response.status === "unsupported") {
    return {
      message: `Reinstalled ${response.newVersion}; update checking is not supported for this tool`,
      tone: "info",
    };
  }
  if (response.updated) {
    return { message: `Updated ${response.oldVersion} → ${response.newVersion}`, tone: "success" };
  }
  if (response.reinstalled) {
    return { message: `Reinstalled ${response.newVersion}`, tone: "success" };
  }
  if (response.status === "ahead-of-latest") {
    return {
      message: `${response.oldVersion} is ahead of the latest known version (${response.latestVersion})`,
      tone: "info",
    };
  }
  return { message: `Already up to date (${response.newVersion})`, tone: "success" };
}

async function executeAction(request: IToolActionRequest): Promise<CheckDescription> {
  const endpoint = `/tools/${encodeURIComponent(request.toolName)}`;
  switch (request.kind) {
    case "install": {
      const response = await postApi<IInstallToolResponse, IInstallToolRequest>(`${endpoint}/install`, {
        force: request.force ?? false,
      });
      if (!response.installed) {
        return { message: response.error ?? "Installation failed", tone: "error" };
      }
      const verb = response.alreadyInstalled ? "Already installed" : request.force ? "Reinstalled" : "Installed";
      return { message: `${verb} ${response.version}`, tone: "success" };
    }
    case "update":
      return describeUpdate(await postApi<IUpdateToolResponse>(`${endpoint}/update`, {}));
    case "check":
      return describeCheck(await postApi<ICheckUpdateResponse>(`${endpoint}/check-update`, {}));
  }
}

/** The provider owns requests so navigating between route children cannot discard their result. */
export function useToolActionState(): IUseToolActions {
  const [pending, setPending] = useState<IToolActionPending | null>(null);
  const [results, setResults] = useState<IToolActionResult[]>([]);
  const runningRef = useRef(false);
  const nextIdRef = useRef(1);

  const runAction = useCallback(async (request: IToolActionRequest): Promise<void> => {
    // A state update alone leaves a window for two clicks before the next render.
    if (runningRef.current) return;
    runningRef.current = true;
    const startedAt = Date.now();
    setPending({ ...request, startedAt });

    let description: CheckDescription;
    try {
      description = await executeAction(request);
    } catch (error) {
      description = {
        message: error instanceof Error ? error.message : "The operation failed",
        tone: "error",
      };
    }
    const result: IToolActionResult = {
      id: nextIdRef.current++,
      request,
      outcome: { toolName: request.toolName, kind: request.kind, ...description },
      elapsedSeconds: Math.max(0, Math.floor((Date.now() - startedAt) / 1000)),
    };
    setResults((previous) => [...previous, result]);
    setPending(null);
    runningRef.current = false;
    // A failed mutation can still have changed files or the installation record.
    if (request.kind !== "check") invalidateFetches();
  }, []);

  const installTool = useCallback(
    (toolName: string, force: boolean): Promise<void> => runAction({ toolName, kind: "install", force }),
    [runAction],
  );
  const updateTool = useCallback(
    (toolName: string): Promise<void> => runAction({ toolName, kind: "update" }),
    [runAction],
  );
  const checkTool = useCallback(
    (toolName: string): Promise<void> => runAction({ toolName, kind: "check" }),
    [runAction],
  );
  const dismissResult = useCallback((id: number): void => {
    setResults((previous) => previous.filter((result) => result.id !== id));
  }, []);
  const retryResult = useCallback(
    async (id: number): Promise<void> => {
      const result = results.find((entry) => entry.id === id);
      if (result?.outcome.tone === "error") await runAction(result.request);
    },
    [results, runAction],
  );

  return { pending, results, dismissResult, retryResult, installTool, updateTool, checkTool };
}
