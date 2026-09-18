import { type JSX } from "preact";

import type { IUseToolActions } from "../hooks/useToolActions";
import { ArrowUpCircle, Download, RefreshCw, Search } from "../icons";
import { cn } from "../lib/utils";
import { ToolActionBanner } from "./ToolActionBanner";
import { Button } from "./ui/Button";

export type ToolActionButtonsSize = "xs" | "sm";

type ActionWidths = {
  check: string;
  update: string;
  install: string;
};

// Every button keeps a fixed width so the three columns line up across rows whose labels differ
// ("Install" vs "Re-install") and so a running action never reflows the row.
const WIDTHS: Record<ToolActionButtonsSize, ActionWidths> = {
  xs: { check: "w-40", update: "w-20", install: "w-28" },
  sm: { check: "w-48", update: "w-24", install: "w-32" },
};

type ToolActionButtonsProps = {
  toolName: string;
  isInstalled: boolean;
  actions: IUseToolActions;
  size: ToolActionButtonsSize;
};

export function ToolActionButtons({ toolName, isInstalled, actions, size }: ToolActionButtonsProps): JSX.Element {
  const { pending, outcome, installTool, updateTool, checkTool, dismissOutcome } = actions;
  const activeKind = pending?.toolName === toolName ? pending.kind : undefined;
  const isBusy = pending !== null;
  const iconClass = size === "xs" ? "size-3" : "size-4";
  const widths = WIDTHS[size];
  const ownsOutcome = outcome?.toolName === toolName;

  return (
    <span data-testid="ToolActionButtons" class={cn("flex items-center gap-2", ownsOutcome && "tool-action-anchor")}>
      <Button
        variant="outline"
        size={size}
        class={widths.check}
        disabled={isBusy || !isInstalled}
        title={isInstalled ? `Check ${toolName} for updates` : `${toolName} is not installed`}
        onClick={() => checkTool(toolName)}
      >
        {activeKind === "check" ? <RefreshCw class={`${iconClass} animate-spin`} /> : <Search class={iconClass} />}
        Check for updates
      </Button>
      <Button
        variant="outline"
        size={size}
        class={widths.update}
        disabled={isBusy || !isInstalled}
        title={isInstalled ? `Update ${toolName}` : `${toolName} is not installed`}
        onClick={() => updateTool(toolName)}
      >
        {activeKind === "update" ? (
          <RefreshCw class={`${iconClass} animate-spin`} />
        ) : (
          <ArrowUpCircle class={iconClass} />
        )}
        Update
      </Button>
      <Button
        variant="outline"
        size={size}
        class={widths.install}
        disabled={isBusy}
        title={isInstalled ? `Force reinstall ${toolName}` : `Install ${toolName}`}
        onClick={() => installTool(toolName, isInstalled)}
      >
        {activeKind === "install" ? <RefreshCw class={`${iconClass} animate-spin`} /> : <Download class={iconClass} />}
        {isInstalled ? "Re-install" : "Install"}
      </Button>
      {ownsOutcome && <ToolActionBanner outcome={outcome} onDismiss={dismissOutcome} class="tool-action-popover" />}
    </span>
  );
}
