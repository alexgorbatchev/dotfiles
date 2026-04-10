import { type JSX } from "preact";
import { useEffect, useState } from "preact/hooks";
import type { IToolSourcePayload } from "../../shared/types";
import { Code } from "../icons";

import { useFetch } from "../hooks/useFetch";
import { highlightToolSource } from "../lib/highlightToolSource";
import { ExternalLinkButton } from "./ui/ExternalLinkButton";
import { TitledCard } from "./ui/TitledCard";

type ToolSourceCardProps = {
  toolName: string;
};

export function ToolSourceCard({ toolName }: ToolSourceCardProps): JSX.Element {
  const { data, loading, error } = useFetch<IToolSourcePayload>(`/tools/${encodeURIComponent(toolName)}/source`, [
    toolName,
  ]);
  const sourceContent = data?.content.trim() ?? "";
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null);

  useEffect(() => {
    if (!sourceContent) {
      setHighlightedHtml(null);
      return;
    }

    let cancelled = false;
    setHighlightedHtml(null);

    void (async () => {
      try {
        const nextHtml = await highlightToolSource(sourceContent);
        if (!cancelled) {
          setHighlightedHtml(nextHtml);
        }
      } catch {
        if (!cancelled) {
          setHighlightedHtml(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sourceContent]);

  if (loading) {
    return (
      <TitledCard title="Source" icon={<Code class="h-4 w-4" />}>
        <div class="text-muted-foreground text-center py-8">Loading source...</div>
      </TitledCard>
    );
  }

  if (error || !sourceContent) {
    return (
      <TitledCard title="Source" icon={<Code class="h-4 w-4" />}>
        <div class="text-muted-foreground text-center py-8">Source not available</div>
      </TitledCard>
    );
  }

  return (
    <TitledCard
      title="Source"
      icon={<Code class="h-4 w-4" />}
      action={<ExternalLinkButton href={`vscode://file/${data.filePath}`}>Open in VSCode</ExternalLinkButton>}
    >
      {highlightedHtml ? (
        <div
          data-testid="ToolSourceCard--highlighted"
          class="overflow-x-auto rounded-md border border-border [&_.shiki]:!m-0 [&_.shiki]:!min-w-full [&_.shiki]:!p-4"
          dangerouslySetInnerHTML={{ __html: highlightedHtml }}
        />
      ) : (
        <div
          data-testid="ToolSourceCard--fallback"
          class="overflow-x-auto rounded-md border border-border bg-muted/25 p-4"
        >
          <pre class="text-sm leading-6">
            <code>{sourceContent}</code>
          </pre>
        </div>
      )}
    </TitledCard>
  );
}
