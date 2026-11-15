import type { JSX } from "preact";
import type { IConfigSummary } from "../../shared/types";
import { useFetch } from "../hooks/useFetch";
import { shellQuote } from "../utils/shellQuote";
import { CopyButton } from "./CopyButton";
import { RequestStateNotice } from "./RequestStateNotice";
import { Button } from "./ui/Button";

interface IFirstToolSetupProps {
  onRecheck: () => void;
}

export function FirstToolSetup({ onRecheck }: IFirstToolSetupProps): JSX.Element {
  const { data: config, loading, error, refetch } = useFetch<IConfigSummary>("/config");
  const roots = config
    ? (Array.isArray(config.toolConfigsDir) ? config.toolConfigsDir : [config.toolConfigsDir]).filter(Boolean)
    : [];
  const command = config?.configFilePath ? `dotfiles --config ${shellQuote(config.configFilePath)}` : null;

  return (
    <section
      data-testid="FirstToolSetup"
      aria-labelledby="first-tool-title"
      class="space-y-4 rounded-lg border bg-card p-4 sm:p-6"
    >
      <div class="space-y-2">
        <h2 id="first-tool-title" class="text-xl font-semibold">
          Add your first tool
        </h2>
        <p class="text-sm text-muted-foreground">
          No tools configured. Opening the dashboard does not create or install tools.
        </p>
      </div>
      <RequestStateNotice
        label="Setup configuration"
        loading={loading}
        error={error}
        hasData={!!config}
        onRetry={refetch}
      />
      {config && !error && (
        <>
          <dl class="space-y-2 text-sm">
            <div>
              <dt class="font-medium">Active configuration</dt>
              <dd class="font-mono [overflow-wrap:anywhere]">
                {config.configFilePath || "Unknown — setup commands are unavailable."}
              </dd>
            </div>
            <div>
              <dt class="font-medium">Tool configuration directories</dt>
              <dd>
                {roots.length ? (
                  <ul class="space-y-1">
                    {roots.map((root) => (
                      <li key={root} class="font-mono [overflow-wrap:anywhere]">
                        {root}
                      </li>
                    ))}
                  </ul>
                ) : (
                  "None configured. Set paths.toolConfigsDir in your configuration, then restart the dashboard."
                )}
              </dd>
            </div>
          </dl>
          {command && roots.length > 0 && (
            <ol class="space-y-5">
              <li class="space-y-2">
                <h3 class="font-semibold">1. Create starter configurations</h3>
                <p class="text-sm text-muted-foreground">
                  Run this in your terminal. It creates bundled starter files in the first directory above, preserves
                  existing files, and installs no binaries. Review the files before installing tools.
                </p>
                <code class="block rounded bg-muted p-3 text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">
                  {command} tool scaffold
                </code>
                <CopyButton text={`${command} tool scaffold`} label="Copy starter command" />
                <p class="text-sm">
                  <a
                    class="underline underline-offset-4"
                    href="https://alexgorbatchev.github.io/dotfiles/getting-started/cli-reference/#dotfiles-tool-add-ownerrepo"
                  >
                    Or add a published tool configuration
                  </a>
                </p>
              </li>
              <li class="space-y-2">
                <h3 class="font-semibold">2. Restart this dashboard</h3>
                <p class="text-sm text-muted-foreground">
                  Stop the running dashboard with Ctrl+C, then start it with the same config. Keep any host or port
                  options you used. A browser refresh alone cannot load new tool configurations.
                </p>
                <code class="block rounded bg-muted p-3 text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">
                  {command} dashboard
                </code>
                <CopyButton text={`${command} dashboard`} label="Copy dashboard command" />
                <Button variant="outline" size="sm" onClick={onRecheck}>
                  Recheck after restart
                </Button>
              </li>
            </ol>
          )}
        </>
      )}
      <a
        class="inline-block text-sm underline underline-offset-4"
        href="https://alexgorbatchev.github.io/dotfiles/getting-started/cli-reference/#dotfiles-tool-scaffold-name"
      >
        Starter configuration documentation
      </a>
    </section>
  );
}
