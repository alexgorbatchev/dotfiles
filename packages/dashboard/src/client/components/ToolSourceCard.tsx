import { type JSX } from "preact";
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
      <div class="overflow-x-auto rounded-md border border-border bg-muted/25 p-4">
        <pre class="text-sm leading-6">
          <code>{data.content.trim()}</code>
        </pre>
      </div>
    </TitledCard>
  );
}
