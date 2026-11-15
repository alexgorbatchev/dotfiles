import type { JSX } from "preact";
import type { IHealthStatus, IToolDetail } from "../../shared/types";
import { healthFindingId } from "../utils/health";

type ToolHealthProps = { tool: IToolDetail; health: IHealthStatus | null; stale: boolean };

export function ToolHealth({ tool, health, stale }: ToolHealthProps): JSX.Element {
  if (!health || stale)
    return (
      <span data-testid="ToolHealth" class="text-sm text-muted-foreground">
        Health: unknown{stale ? " · recheck needed" : " · not checked"}
      </span>
    );
  const findings = health.checks.flatMap((check) =>
    check.findings
      .filter((finding) => finding.toolName === tool.config.name)
      .map((finding) => ({ checkId: check.id, finding })),
  );
  const first = findings[0];
  if (first)
    return (
      <a
        data-testid="ToolHealth"
        class="inline-flex min-h-11 items-center rounded text-sm font-medium text-amber-800 underline underline-offset-2 dark:text-amber-300 sm:min-h-6"
        href={`/health#${encodeURIComponent(healthFindingId(first.checkId, first.finding))}`}
      >
        Health: needs attention · {findings.length} {findings.length === 1 ? "finding" : "findings"}
      </a>
    );
  if (tool.runtime.status !== "installed")
    return (
      <span data-testid="ToolHealth" class="text-sm text-muted-foreground">
        Health: no installation to check
      </span>
    );
  if (!tool.runtime.installPath && !tool.runtime.binaryPaths?.length)
    return (
      <span data-testid="ToolHealth" class="text-sm text-muted-foreground">
        Health: no recorded paths to check
      </span>
    );
  if (
    !["tool-installations", "registry-integrity"].every((id) =>
      health.checks.some((check) => check.id === id && check.status !== "fail"),
    )
  )
    return (
      <span data-testid="ToolHealth" class="text-sm text-muted-foreground">
        Health: unknown · path checks incomplete
      </span>
    );
  return (
    <span data-testid="ToolHealth" class="text-sm">
      Health: recorded paths present
    </span>
  );
}
