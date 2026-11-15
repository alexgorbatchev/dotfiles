import { type JSX } from "preact";
import { useLocation } from "preact-iso";
import { useFetch } from "../hooks/useFetch";
import { Search } from "../icons";
import type { IConfigSummary } from "../../shared/types";

import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";

interface INavProps {
  onSearch: () => void;
}

const links = [
  { path: "/", label: "🏠 Home" },
  { path: "/health", label: "🏥 Health" },
  { path: "/settings", label: "⚙️ Settings" },
];

function getPathname(url: string): string {
  return new URL(url, "http://localhost").pathname;
}

export function Nav({ onSearch }: INavProps): JSX.Element {
  const { url } = useLocation();
  const pathname = getPathname(url);
  const { data: config } = useFetch<IConfigSummary>("/config");
  const shortcut = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘K" : "Ctrl+K";
  const formattedVersion = config?.version
    ? config.version.startsWith("v")
      ? config.version
      : `v${config.version}`
    : null;

  return (
    <nav data-testid="Nav" aria-label="Main navigation" class="bg-card border-b border-border">
      <div class="max-w-7xl mx-auto flex flex-wrap items-center gap-3 px-4 py-3">
        <div class="flex w-full min-w-0 flex-wrap items-baseline gap-2 lg:w-auto">
          <span class="text-xl font-bold text-primary">⚡ Dotfiles</span>
          {formattedVersion && (
            <Badge variant="secondary" class="font-mono text-sm text-muted-foreground">
              {formattedVersion}
            </Badge>
          )}
        </div>
        <div class="flex w-full min-w-0 flex-wrap gap-1 sm:w-auto sm:flex-1">
          {links.map((link) => {
            const isActive = pathname === link.path || (link.path !== "/" && pathname.startsWith(link.path));
            return (
              <Button key={link.path} variant={isActive ? "secondary" : "ghost"} size="sm" asChild>
                <a href={link.path} aria-current={isActive ? "page" : undefined}>
                  {link.label}
                </a>
              </Button>
            );
          })}
        </div>
        <Button variant="outline" size="sm" onClick={onSearch} aria-haspopup="dialog">
          <Search class="h-4 w-4" aria-hidden="true" />
          <span>Search...</span>
          <kbd class="rounded bg-muted px-1.5 py-0.5 text-sm">{shortcut}</kbd>
        </Button>
      </div>
    </nav>
  );
}
