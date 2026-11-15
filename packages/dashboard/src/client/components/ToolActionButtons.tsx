import { type JSX } from "preact";

import type { IUseToolActions } from "../hooks/useToolActions";
import { ArrowUpCircle, Download, RefreshCw, Search } from "../icons";
import { Button } from "./ui/Button";

export type ToolActionButtonsSize = "xs" | "sm";

type ToolActionButtonsProps = {
  toolName: string;
  isInstalled: boolean;
  actions: IUseToolActions;
  size: ToolActionButtonsSize;
};

export function ToolActionButtons({ toolName, isInstalled, actions, size }: ToolActionButtonsProps): JSX.Element {
  const { pending, installTool, updateTool, checkTool } = actions;
  const activeKind = pending?.toolName === toolName ? pending.kind : undefined;
  const isBusy = pending !== null;
  const iconClass = size === "xs" ? "size-3" : "size-4";
  const busyReason = pending ? `Waiting for ${pending.toolName} to finish ${pending.kind}` : undefined;

  return (
    <span
      data-testid="ToolActionButtons"
      class="flex min-w-0 max-w-full flex-wrap items-center gap-2"
      aria-describedby={isBusy ? "tool-operation-busy" : undefined}
    >
      <Button
        variant="outline"
        size={size}
        disabled={isBusy || !isInstalled}
        title={busyReason ?? (isInstalled ? `Check ${toolName} for updates` : `${toolName} is not installed`)}
        onClick={() => checkTool(toolName)}
      >
        {activeKind === "check" ? <RefreshCw class={`${iconClass} animate-spin`} /> : <Search class={iconClass} />}
        Check for updates
      </Button>
      <Button
        variant="outline"
        size={size}
        disabled={isBusy || !isInstalled}
        title={busyReason ?? (isInstalled ? `Update ${toolName}` : `${toolName} is not installed`)}
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
        disabled={isBusy}
        title={busyReason ?? (isInstalled ? `Force reinstall ${toolName}` : `Install ${toolName}`)}
        onClick={() => installTool(toolName, isInstalled)}
      >
        {activeKind === "install" ? <RefreshCw class={`${iconClass} animate-spin`} /> : <Download class={iconClass} />}
        {isInstalled ? "Re-install" : "Install"}
      </Button>
    </span>
  );
}
