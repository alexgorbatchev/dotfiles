import { type JSX } from "preact";
import { useCallback, useState } from "preact/hooks";

import type { IToolActionOutcome, ToolActionTone } from "../hooks/useToolActions";
import { Check, Copy, X } from "../icons";
import { cn } from "../lib/utils";
import { formatError } from "../utils/formatError";

const COPY_FEEDBACK_MS = 2000;

type BannerTone = Exclude<ToolActionTone, "error">;

const TONE_CLASS: Record<BannerTone, string> = {
  success: "bg-green-500/10 border border-green-500/20 text-green-600 dark:text-green-400",
  info: "bg-yellow-500/10 border border-yellow-500/20 text-yellow-600 dark:text-yellow-400",
};

type ToolActionBannerProps = {
  outcome: IToolActionOutcome | null;
  onDismiss?: () => void;
  /** Placement classes; the caller decides whether this renders in the page flow or beside a button. */
  class?: string;
};

export function ToolActionBanner({ outcome, onDismiss, class: className }: ToolActionBannerProps): JSX.Element | null {
  const [isCopied, setIsCopied] = useState(false);

  const handleCopyCommand = useCallback((command: string) => {
    navigator.clipboard
      .writeText(command)
      .then(() => {
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), COPY_FEEDBACK_MS);
      })
      .catch(() => setIsCopied(false));
  }, []);

  if (!outcome) {
    return null;
  }

  if (outcome.tone !== "error") {
    return (
      <div
        data-testid="ToolActionBanner"
        class={cn(
          "flex items-center justify-between gap-3 px-4 py-2 rounded-md text-sm",
          TONE_CLASS[outcome.tone],
          className,
        )}
      >
        <div>
          <span class="font-medium">{outcome.toolName}</span> {outcome.message}
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            class="flex-shrink-0 p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 opacity-70 hover:opacity-100 transition-opacity"
            title="Dismiss"
            aria-label="Dismiss"
          >
            <X class="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }

  const { message, command } = formatError(outcome.message);

  return (
    <div
      data-testid="ToolActionBanner"
      class={cn(
        "bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-md text-sm space-y-2",
        className,
      )}
    >
      <div class="flex items-start justify-between gap-3">
        <div>
          <span class="font-medium">{outcome.toolName}</span> {message}
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            class="flex-shrink-0 p-0.5 rounded hover:bg-destructive/20 opacity-70 hover:opacity-100 transition-opacity"
            title="Dismiss"
            aria-label="Dismiss"
          >
            <X class="h-4 w-4" />
          </button>
        )}
      </div>
      {command && (
        <div class="space-y-2">
          <div class="text-xs text-destructive/80">Run this command to trust the tap:</div>
          <div class="flex items-center gap-2 bg-destructive/20 px-3 py-2 rounded font-mono text-xs break-all">
            <span class="flex-1">{command}</span>
            <button
              onClick={() => handleCopyCommand(command)}
              class="flex-shrink-0 p-1 hover:bg-destructive/30 rounded transition-colors"
              title="Copy command"
            >
              {isCopied ? <Check class="h-4 w-4" /> : <Copy class="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
