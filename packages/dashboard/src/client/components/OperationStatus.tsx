import type { JSX } from "preact";
import { useEffect, useState } from "preact/hooks";

import type { IUseToolActions, ToolActionKind } from "../hooks/useToolActions";
import { RefreshCw } from "../icons";
import { ToolActionBanner } from "./ToolActionBanner";

const ACTION_LABEL: Record<ToolActionKind, string> = {
  install: "Installing",
  update: "Updating",
  check: "Checking for updates to",
};

type OperationStatusProps = {
  actions: IUseToolActions;
};

export function OperationStatus({ actions }: OperationStatusProps): JSX.Element | null {
  const { pending, results, dismissResult, retryResult } = actions;
  const [now, setNow] = useState(Date.now);
  const startedAt = pending?.startedAt;

  useEffect(() => {
    if (startedAt === undefined) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  if (!pending && results.length === 0) return null;
  const elapsedSeconds = startedAt === undefined ? 0 : Math.max(0, Math.floor((now - startedAt) / 1000));

  return (
    <section
      data-testid="OperationStatus"
      aria-label="Tool operations"
      class="sticky top-0 z-40 mb-6 rounded-lg border bg-background p-3 shadow-md"
    >
      {pending && (
        <div class="space-y-2">
          <div class="flex flex-wrap items-center gap-2">
            <RefreshCw class="size-4 animate-spin" aria-hidden="true" />
            <p role="status" aria-live="polite" aria-atomic="true" class="min-w-0 break-words font-medium">
              {pending.force ? "Reinstalling" : ACTION_LABEL[pending.kind]} {pending.toolName}. Waiting for the server.
            </p>
            <span role="timer" aria-live="off" class="text-sm tabular-nums">
              {elapsedSeconds}s elapsed
            </span>
          </div>
          <p id="tool-operation-busy" class="text-sm">
            Other actions in this dashboard tab are paused until this operation finishes. You can keep browsing.
          </p>
        </div>
      )}
      {results.length > 0 && (
        <details open={!pending} class="mt-2">
          <summary class="cursor-pointer py-2 font-medium">
            {results.length} operation {results.length === 1 ? "result" : "results"}
          </summary>
          <div class="max-h-64 overflow-y-auto space-y-3">
            {results.toReversed().map((result) => (
              <ToolActionBanner
                key={result.id}
                outcome={result.outcome}
                elapsedSeconds={result.elapsedSeconds}
                onDismiss={() => dismissResult(result.id)}
                onRetry={result.outcome.tone === "error" ? () => retryResult(result.id) : undefined}
                isRetryDisabled={pending !== null}
              />
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
