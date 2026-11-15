import type { JSX } from "preact";
import { useState } from "preact/hooks";

import type { IToolActionOutcome } from "../hooks/useToolActions";
import { Copy, RefreshCw, X } from "../icons";
import { formatError } from "../utils/formatError";
import { Button } from "./ui/Button";
import { Badge } from "./ui/Badge";

type ToolActionBannerProps = {
  outcome: IToolActionOutcome | null;
  elapsedSeconds?: number;
  onDismiss?: () => void;
  onRetry?: () => void;
  isRetryDisabled?: boolean;
};

export function ToolActionBanner({
  outcome,
  elapsedSeconds,
  onDismiss,
  onRetry,
  isRetryDisabled = false,
}: ToolActionBannerProps): JSX.Element | null {
  const [copyMessage, setCopyMessage] = useState("");

  const copy = async (text: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyMessage("Copied to clipboard");
    } catch {
      setCopyMessage("Clipboard unavailable. Select and copy the details below.");
    }
  };

  if (!outcome) return null;
  const { message, command } = formatError(outcome.message);
  const details = `${outcome.toolName} · ${outcome.kind}\n${outcome.message}`;

  return (
    <div data-testid="ToolActionBanner" class="rounded-md border bg-card p-3 text-sm space-y-3">
      <div role={outcome.tone === "error" ? "alert" : "status"} aria-atomic="true" class="space-y-1">
        <div class="flex flex-wrap items-center gap-2">
          <p class="font-medium break-words">{outcome.toolName}</p>
          <Badge variant={outcome.tone === "error" ? "error" : outcome.tone === "success" ? "success" : "outline"}>
            {outcome.tone === "error" ? "Failed" : outcome.tone === "success" ? "Complete" : "Information"}
          </Badge>
        </div>
        <p class="whitespace-pre-wrap break-words">{message}</p>
        {elapsedSeconds !== undefined && <p>Completed in {elapsedSeconds}s</p>}
      </div>
      {command && (
        <div class="space-y-2">
          <p>Run this command to trust the tap:</p>
          <code class="block whitespace-pre-wrap break-all">{command}</code>
          <Button variant="outline" size="sm" onClick={() => copy(command)} title="Copy command">
            <Copy class="size-4" /> Copy command
          </Button>
        </div>
      )}
      <div class="flex flex-wrap items-center gap-2">
        {onRetry && (
          <Button
            variant="outline"
            size="sm"
            disabled={isRetryDisabled}
            onClick={onRetry}
            aria-describedby={isRetryDisabled ? "tool-operation-busy" : undefined}
          >
            <RefreshCw class="size-4" /> Retry
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => copy(details)}>
          <Copy class="size-4" /> Copy details
        </Button>
        {onDismiss && (
          <Button variant="ghost" size="sm" onClick={onDismiss}>
            <X class="size-4" /> Dismiss
          </Button>
        )}
        <span role="status" aria-live="polite">
          {copyMessage}
        </span>
      </div>
      <details>
        <summary class="cursor-pointer py-1">Details</summary>
        <pre class="mt-2 whitespace-pre-wrap break-words font-mono text-sm">{details}</pre>
      </details>
    </div>
  );
}
