import { type JSX } from "preact";
import type { IToolMetadata } from "../../shared/types";
import type { IUseToolActions } from "../hooks/useToolActions";
import { Download, RefreshCw, Search } from "../icons";
import { Button } from "./ui/Button";

export type ToolActionButtonsSize = "xs" | "sm";
type ToolActionButtonsProps = {
  toolName: string;
  isInstalled: boolean;
  metadata: IToolMetadata;
  actions: IUseToolActions;
  size: ToolActionButtonsSize;
};

export function ToolActionButtons({
  toolName,
  isInstalled,
  metadata,
  actions,
  size,
}: ToolActionButtonsProps): JSX.Element {
  const { pending, installTool, updateTool, checkTool } = actions;
  const activeKind = pending?.toolName === toolName ? pending.kind : undefined;
  const isBusy = pending !== null;
  const iconClass = size === "xs" ? "size-3" : "size-4";
  const busyReason = pending ? `Waiting for ${pending.toolName} to finish ${pending.kind}` : undefined;
  const capabilities = metadata.actions;
  const reasons = [
    ...new Set(
      (isInstalled
        ? [
            capabilities.update.reason.includes(capabilities.check.reason) ? "" : capabilities.check.reason,
            capabilities.update.reason,
          ]
        : [capabilities.install.reason]
      ).filter(Boolean),
    ),
  ];

  return (
    <div
      data-testid="ToolActionButtons"
      class="min-w-0 space-y-2 lg:max-w-md"
      aria-describedby={isBusy ? "tool-operation-busy" : undefined}
    >
      <div class="flex min-w-0 flex-wrap items-center gap-2">
        {!isInstalled && (
          <Button
            size={size}
            disabled={isBusy || !capabilities.install.enabled}
            title={busyReason}
            onClick={() => installTool(toolName, false)}
          >
            {activeKind === "install" ? (
              <RefreshCw class={`${iconClass} animate-spin`} />
            ) : (
              <Download class={iconClass} />
            )}{" "}
            Install
          </Button>
        )}
        {isInstalled && capabilities.check.enabled && (
          <Button
            variant="outline"
            size={size}
            disabled={isBusy}
            title={busyReason}
            onClick={() => checkTool(toolName)}
          >
            {activeKind === "check" ? <RefreshCw class={`${iconClass} animate-spin`} /> : <Search class={iconClass} />}{" "}
            Check for updates
          </Button>
        )}
        {isInstalled && capabilities.update.enabled && (
          <Button size={size} disabled={isBusy} title={busyReason} onClick={() => updateTool(toolName)}>
            {activeKind === "update" && <RefreshCw class={`${iconClass} animate-spin`} />}
            {metadata.updateMode === "reinstall" ? "Reinstall without version check" : "Check and update"}
          </Button>
        )}
      </div>
      {reasons.map((reason) => (
        <p key={reason} class="text-sm text-muted-foreground [overflow-wrap:anywhere]">
          {reason}
        </p>
      ))}
      {isInstalled && capabilities.reinstall.enabled && (
        <details class="text-sm">
          <summary class="min-h-11 cursor-pointer content-center rounded font-medium focus-visible:outline-2 focus-visible:outline-ring sm:min-h-6">
            More actions
          </summary>
          <div class="space-y-2 rounded-md border p-3">
            <p>
              Force reinstall runs the installer again even at the same version and may replace managed files. Review
              this tool’s configuration and paths first.
            </p>
            <Button
              variant="outline"
              size={size}
              disabled={isBusy}
              title={busyReason}
              onClick={() => installTool(toolName, true)}
            >
              {activeKind === "install" && <RefreshCw class={`${iconClass} animate-spin`} />} Force reinstall
            </Button>
          </div>
        </details>
      )}
    </div>
  );
}
