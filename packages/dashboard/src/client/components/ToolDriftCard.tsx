import { type JSX } from "preact";
import { AlertTriangle, Check, Code, File } from "../icons";
import { TitledCard } from "./ui/TitledCard";

import type { IDriftItem } from "../../shared/types";

interface IToolDriftCardProps {
  driftItems?: IDriftItem[];
}

export function ToolDriftCard({ driftItems = [] }: IToolDriftCardProps): JSX.Element {
  if (driftItems.length === 0) {
    return (
      <div data-testid="ToolDriftCard">
        <TitledCard title="Drift & Declarations" icon={<Code class="h-4 w-4" />}>
          <div class="text-muted-foreground py-4 text-center">No files or managed blocks declared for this tool.</div>
        </TitledCard>
      </div>
    );
  }

  const hasDrift = driftItems.some((item) => item.state !== "in-sync");

  return (
    <div data-testid="ToolDriftCard">
      <TitledCard title="Drift & Declarations" icon={<Code class="h-4 w-4" />}>
        <div class="space-y-4">
          {driftItems.map((item, index) => {
            const isSync = item.state === "in-sync";
            const title = item.blockId ? `${item.filePath} [${item.blockId}]` : item.filePath;

            return (
              <div
                key={index}
                class={`rounded-lg border p-4 ${isSync ? "border-border bg-muted/20" : "border-amber-500/50 bg-amber-500/5"}`}
              >
                <div class="flex items-center justify-between gap-2">
                  <div class="flex items-center gap-2 min-w-0">
                    <span class="text-muted-foreground">
                      <File class="h-4 w-4 shrink-0" />
                    </span>
                    <span class="font-medium truncate" title={title}>
                      {title}
                    </span>
                    <span class="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground uppercase font-mono">
                      {item.type}
                    </span>
                  </div>
                  <div class="flex items-center gap-1.5 shrink-0 text-sm">
                    {isSync ? (
                      <span class="flex items-center gap-1 text-green-500">
                        <Check class="h-4 w-4" /> In-sync
                      </span>
                    ) : (
                      <span class="flex items-center gap-1 text-amber-500 font-medium">
                        <AlertTriangle class="h-4 w-4" /> {item.state}
                      </span>
                    )}
                  </div>
                </div>

                {item.diff && (
                  <div class="mt-3">
                    <pre class="overflow-x-auto rounded bg-background p-3 font-mono text-xs leading-relaxed border border-border">
                      {item.diff}
                    </pre>
                  </div>
                )}

                {item.currentContent !== undefined && item.desiredContent !== undefined && !item.diff && !isSync && (
                  <div class="mt-2 text-xs text-muted-foreground">Content modified locally on disk.</div>
                )}
              </div>
            );
          })}

          {!hasDrift && (
            <div class="text-xs text-muted-foreground text-center pt-2">
              All {driftItems.length} declared artifact(s) match the current disk state.
            </div>
          )}
        </div>
      </TitledCard>
    </div>
  );
}
