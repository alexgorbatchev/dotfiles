import { type JSX } from "preact";
import { ShikiHighlighter } from "react-shiki";
import type { IToolSourcePayload } from "../../shared/types";
import { Code } from "../icons";

import { useFetch } from "../hooks/useFetch";
import { ExternalLinkButton } from "./ui/ExternalLinkButton";
import { TitledCard } from "./ui/TitledCard";

type ToolSourceCardProps = {
  toolName: string;
};

export function ToolSourceCard({ toolName }: ToolSourceCardProps): JSX.Element {
  const { data, loading, error } = useFetch<IToolSourcePayload>(`/tools/${encodeURIComponent(toolName)}/source`, [
    toolName,
  ]);

  if (loading) {
    return (
      <TitledCard title="Source" icon={<Code class="h-4 w-4" />}>
        <div class="text-muted-foreground text-center py-8">Loading source...</div>
      </TitledCard>
    );
  }

  if (error || !data?.content) {
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
      <div class="overflow-x-auto rounded-md border border-border [&_pre]:!bg-muted/25">
        <ShikiHighlighter language="typescript" theme="github-light">
          {data.content.trim()}
        </ShikiHighlighter>
      </div>
    </TitledCard>
  );
}
