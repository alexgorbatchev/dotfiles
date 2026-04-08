import { type JSX } from "preact";
import { FolderCog } from "../icons";

import type { IConfigSummary } from "../../shared/types";
import { TitledCard } from "../components/ui/TitledCard";
import { useFetch } from "../hooks/useFetch";

export function Settings(): JSX.Element {
  const { data: config, loading } = useFetch<IConfigSummary>("/config");

  if (loading) {
    return (
      <div data-testid="Settings" class="flex items-center justify-center h-64">
        <div class="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  const paths = [
    { label: "Dotfiles Directory", value: config?.dotfilesDir },
    { label: "Generated Directory", value: config?.generatedDir },
    { label: "Binaries Directory", value: config?.binariesDir },
    { label: "Target Directory", value: config?.targetDir },
    { label: "Tool Configs Directory", value: config?.toolConfigsDir },
  ];

  return (
    <div data-testid="Settings" class="space-y-6">
      <TitledCard title="Project Paths" icon={<FolderCog class="h-4 w-4" />}>
        <div class="space-y-4">
          {paths.map((path, index) => (
            <div key={index}>
              <div class="mb-1 text-sm text-muted-foreground">{path.label}</div>
              <code class="block overflow-x-auto rounded bg-muted px-3 py-2 text-sm">{path.value || "Not configured"}</code>
            </div>
          ))}
        </div>
      </TitledCard>
    </div>
  );
}
