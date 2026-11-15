import { type JSX } from "preact";
import { useEffect, useState } from "preact/hooks";
import type { IToolSourcePayload } from "../../shared/types";
import { Code } from "../icons";

import { useFetch } from "../hooks/useFetch";
import { highlightToolSource } from "../lib/highlightToolSource";
import { RequestStateNotice } from "./RequestStateNotice";
import { CopyButton } from "./CopyButton";
import { ExternalLinkButton } from "./ui/ExternalLinkButton";
import { TitledCard } from "./ui/TitledCard";

type ToolSourceCardProps = {
  toolName: string;
};

export function ToolSourceCard({ toolName }: ToolSourceCardProps): JSX.Element {
  const { data, loading, error, refetch } = useFetch<IToolSourcePayload>(
    `/tools/${encodeURIComponent(toolName)}/source`,
    [toolName],
  );
  const sourceContent = data?.content.trim() ?? "";
  const sourceFilePath = data?.filePath ?? "";
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

  if (!sourceContent || !sourceFilePath) {
    return (
      <TitledCard title="Source" icon={<Code class="h-4 w-4" />}>
        <RequestStateNotice label="Source" loading={loading} error={error} hasData={data !== null} onRetry={refetch} />
        {data && !loading && !error && <div class="text-muted-foreground text-center py-8">Source not available</div>}
      </TitledCard>
    );
  }

  return (
    <TitledCard
      title="Source"
      icon={<Code class="h-4 w-4" />}
      action={<ExternalLinkButton href={`vscode://file/${sourceFilePath}`}>Open in VSCode</ExternalLinkButton>}
    >
      <RequestStateNotice label="Source" loading={loading} error={error} hasData onRetry={refetch} />
      <div class="mb-3 flex min-w-0 flex-wrap items-center gap-2 text-sm">
        <code class="min-w-0 break-all">{sourceFilePath}</code>
        <CopyButton key={sourceFilePath} text={sourceFilePath} label="Copy source path" />
      </div>
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
