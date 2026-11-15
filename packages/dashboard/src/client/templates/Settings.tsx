import { type JSX } from "preact";
import { FolderCog } from "../icons";

import type { ConfigPathValue, IConfigSummary } from "../../shared/types";
import { CopyButton } from "../components/CopyButton";
import { RequestStateNotice } from "../components/RequestStateNotice";
import { TitledCard } from "../components/ui/TitledCard";
import { useFetch } from "../hooks/useFetch";

function pathValues(value: ConfigPathValue): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

export function Settings(): JSX.Element {
  const { data: config, loading, error, refetch } = useFetch<IConfigSummary>("/config");

  if (!config) {
    return (
      <div data-testid="Settings" class="space-y-6">
        <RequestStateNotice
          label="Project configuration"
          loading={loading}
          error={error}
          hasData={false}
          onRetry={refetch}
        />
      </div>
    );
  }

  const roots = pathValues(config.toolConfigsDir);
  const paths = [
    { label: "Dotfiles directory", value: config.dotfilesDir },
    { label: "Generated directory", value: config.generatedDir },
    { label: "Binaries directory", value: config.binariesDir },
    { label: "Target directory", value: config.targetDir },
    ...roots.map((value, index) => ({ label: `Tool configuration directory ${index + 1}`, value })),
  ];

  return (
    <div data-testid="Settings" class="space-y-6">
      <header class="space-y-2">
        <h1 class="text-2xl font-bold">Project configuration</h1>
        <p class="text-sm text-muted-foreground">
          Read-only. These paths come from the configuration loaded when this dashboard started. Edit that configuration
          in your preferred editor, then restart the dashboard to load changes.
        </p>
      </header>
      <RequestStateNotice label="Project configuration" loading={loading} error={error} hasData onRetry={refetch} />
      <TitledCard title="Project Paths" icon={<FolderCog class="h-4 w-4" />}>
        <dl class="space-y-4">
          {paths.map((path) => (
            <div key={path.label} class="space-y-2">
              <dt class="text-sm font-medium">{path.label}</dt>
              <dd class="space-y-2">
                <code class="block rounded bg-muted px-3 py-2 text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">
                  {path.value || "Not configured"}
                </code>
                {path.value && <CopyButton text={path.value} label={`Copy ${path.label.toLowerCase()}`} />}
              </dd>
            </div>
          ))}
          {roots.length === 0 && (
            <div>
              <dt class="text-sm font-medium">Tool configuration directories</dt>
              <dd class="text-sm text-muted-foreground">None configured</dd>
            </div>
          )}
        </dl>
      </TitledCard>
    </div>
  );
}
