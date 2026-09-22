import { type JSX } from "preact";
import { useLocation } from "preact-iso";
import { useFetch } from "../hooks/useFetch";
import { Search } from "../icons";
import type { IConfigSummary } from "../../shared/types";

import { cn } from "../lib/utils";
import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";

const links = [
  { path: "/", label: "🏠 Home" },
  { path: "/health", label: "🏥 Health" },
  { path: "/settings", label: "⚙️ Settings" },
];

function getPathname(url: string): string {
  return new URL(url, "http://localhost").pathname;
}

function openCommandPalette(): void {
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
}

export function Nav(): JSX.Element {
  const { url } = useLocation();
  const pathname = getPathname(url);
  const { data: config } = useFetch<IConfigSummary>("/config");

  const formattedVersion = config?.version
    ? config.version.startsWith("v")
      ? config.version
      : `v${config.version}`
    : null;

  return (
    <nav data-testid="Nav" class="bg-card border-b border-border">
      <div class="max-w-7xl mx-auto px-4">
        <div class="flex items-center justify-between h-14">
          <div class="flex items-center space-x-4">
            <div class="flex items-baseline gap-2">
              <span class="text-xl font-bold text-primary">⚡ Dotfiles</span>
              {formattedVersion && (
                <Badge
                  variant="secondary"
                  class="font-mono text-xs text-muted-foreground bg-muted-foreground/15 hover:bg-muted-foreground/20"
                >
                  {formattedVersion}
                </Badge>
              )}
            </div>
            <div class="flex space-x-1">
              {links.map((link) => {
                const isActive = pathname === link.path || (link.path !== "/" && pathname.startsWith(link.path));
                return (
                  <Button key={link.path} variant={isActive ? "secondary" : "ghost"} size="sm" asChild>
                    <a href={link.path} class={cn(isActive && "pointer-events-none")}>
                      {link.label}
                    </a>
                  </Button>
                );
              })}
            </div>
          </div>
          <div class="flex items-center space-x-4">
            <button
              onClick={openCommandPalette}
              class="flex items-center gap-2 rounded-md border border-border bg-input px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent"
            >
              <Search class="h-4 w-4" />
              <span>Search...</span>
              <kbd class="bg-muted px-1.5 py-0.5 text-xs rounded">⌘K</kbd>
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
