import { type JSX } from "preact";
import type { IDriftItem } from "../../shared/types";
import { Code } from "../icons";
import { driftPresentation } from "../utils/driftPresentation";
import { CopyButton } from "./CopyButton";
import { Badge } from "./ui/Badge";
import { TitledCard } from "./ui/TitledCard";

interface IToolDriftCardProps {
  driftItems?: IDriftItem[];
}

type DriftArtifactProps = {
  item: IDriftItem;
};

function DriftArtifact({ item }: DriftArtifactProps): JSX.Element {
  const presentation = driftPresentation(item.state);
  return (
    <article class="min-w-0 space-y-3 rounded-lg border p-3" aria-label={item.filePath}>
      <div class="flex min-w-0 flex-col items-start gap-2 sm:flex-row sm:items-center">
        <h3 class="min-w-0 flex-1 break-all font-medium">{item.filePath}</h3>
        <Badge variant={presentation.tone}>{presentation.label}</Badge>
      </div>
      <div class="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>{item.type}</span>
        {item.blockId && <span class="break-all">Managed block: {item.blockId}</span>}
        <CopyButton text={item.filePath} label="Copy path" />
      </div>
      <p class="text-sm">{presentation.explanation}</p>
      <p class="text-sm">
        <strong>Next step:</strong> {presentation.nextStep}
      </p>
      {item.diff && (
        <div class="min-w-0 space-y-2">
          <p class="text-sm">
            Comparison: local / current on disk → declaration / desired. In unified diffs, − marks local lines and +
            marks desired lines.
          </p>
          <pre
            tabIndex={0}
            aria-label={`Changes for ${item.filePath}`}
            class="max-h-80 overflow-auto rounded border bg-background p-3 text-sm leading-relaxed focus-visible:outline-2 focus-visible:outline-ring"
          >
            {item.diff}
          </pre>
        </div>
      )}
      {(item.currentContent !== undefined || item.desiredContent !== undefined) && (
        <details class="min-w-0">
          <summary class="min-h-11 cursor-pointer content-center rounded py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring sm:min-h-6">
            Compare available content
          </summary>
          <div class="mt-2 grid min-w-0 gap-3 lg:grid-cols-2">
            {item.currentContent !== undefined && (
              <div class="min-w-0 space-y-1">
                <h4 class="text-sm font-medium">Local / current on disk</h4>
                <pre
                  tabIndex={0}
                  aria-label={`Local content for ${item.filePath}`}
                  class="max-h-80 overflow-auto rounded border bg-background p-3 text-sm"
                >
                  {item.currentContent || "(empty content)"}
                </pre>
              </div>
            )}
            {item.desiredContent !== undefined && (
              <div class="min-w-0 space-y-1">
                <h4 class="text-sm font-medium">Declaration / desired</h4>
                <pre
                  tabIndex={0}
                  aria-label={`Desired content for ${item.filePath}`}
                  class="max-h-80 overflow-auto rounded border bg-background p-3 text-sm"
                >
                  {item.desiredContent || "(empty content)"}
                </pre>
              </div>
            )}
          </div>
        </details>
      )}
    </article>
  );
}

export function ToolDriftCard({ driftItems = [] }: IToolDriftCardProps): JSX.Element {
  const changed = driftItems.filter((item) => item.state !== "in-sync");
  return (
    <div data-testid="ToolDriftCard">
      <TitledCard title="Drift & Declarations" icon={<Code class="h-4 w-4" />}>
        <div class="space-y-4">
          {driftItems.length === 0 ? (
            <p class="text-sm text-muted-foreground">No files or managed blocks declared for this tool.</p>
          ) : changed.length === 0 ? (
            <p class="text-sm">All {driftItems.length} declared artifact(s) match the current disk state.</p>
          ) : (
            <p class="text-sm">
              {changed.length} of {driftItems.length} declared artifact(s) differ from the desired state. Inspect the
              findings before generating changes.
            </p>
          )}
          {changed.length > 0 && (
            <p class="text-sm text-muted-foreground">
              For read-only CLI inspection, run <code>dotfiles state diff</code> with the same <code>--config</code>{" "}
              file used to start this dashboard. The recorded base content is not included in this view.
            </p>
          )}
          {driftItems.map((item) => (
            <DriftArtifact key={`${item.filePath}:${item.blockId ?? ""}`} item={item} />
          ))}
        </div>
      </TitledCard>
    </div>
  );
}
