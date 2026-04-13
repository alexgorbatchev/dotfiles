import { type JSX } from "preact";
import type { IToolReadmePayload } from "../../shared/types";
import { BookOpen, ExternalLink } from "../icons";

import { useFetch } from "../hooks/useFetch";
import { ExternalLinkButton } from "./ui/ExternalLinkButton";
import { TitledCard } from "./ui/TitledCard";

// Using global marked and DOMPurify loaded via CDN in dashboard.html
// to workaround Bun's HTMLBundle minifier issues with heavy dependencies
declare global {
  interface Window {
    marked: any;
    DOMPurify: any;
  }
}

type ReadmeCardProps = {
  toolName: string;
  repo: string;
};

// Simple relative link fixer for GitHub repos
function resolveGitHubUrls(html: string, repo: string): string {
  // A naive pass at fixing src="./" and href="./" to point to github raw/blob
  // This is a minimal replacement for what remark/rehype was doing.
  return html
    .replace(/src=(["'])(?:\.\/)?([^"']+)\1/g, (match, quote, path) => {
      if (path.startsWith("http") || path.startsWith("data:")) return match;
      return `src=${quote}https://github.com/${repo}/raw/HEAD/${path}${quote}`;
    })
    .replace(/href=(["'])(?:\.\/)?([^"']+)\1/g, (match, quote, path) => {
      if (path.startsWith("http") || path.startsWith("#") || path.startsWith("mailto:")) return match;
      return `href=${quote}https://github.com/${repo}/blob/HEAD/${path}${quote}`;
    });
}

export function ReadmeCard({ toolName, repo }: ReadmeCardProps): JSX.Element {
  const { data, loading, error } = useFetch<IToolReadmePayload>(`/tools/${encodeURIComponent(toolName)}/readme`, [
    toolName,
  ]);

  if (loading) {
    return (
      <TitledCard title="README" icon={<BookOpen class="h-4 w-4" />}>
        <div class="text-muted-foreground text-center py-8">Loading README...</div>
      </TitledCard>
    );
  }

  if (error || !data?.content) {
    return (
      <TitledCard title="README" icon={<BookOpen class="h-4 w-4" />}>
        <div class="text-muted-foreground text-center py-8">
          <p class="mb-2">README not available</p>
          <a
            href={`https://github.com/${repo}#readme`}
            target="_blank"
            rel="noopener noreferrer"
            class="text-sm text-blue-500 hover:underline inline-flex items-center gap-1"
          >
            View on GitHub <ExternalLink class="h-3 w-3" />
          </a>
        </div>
      </TitledCard>
    );
  }

  let html = "";
  if (typeof window !== "undefined" && window.marked && window.DOMPurify) {
    html = window.DOMPurify.sanitize(window.marked.parse(data.content));
    html = resolveGitHubUrls(html, repo);
  } else {
    // SSR fallback or if CDN failed
    html = `<pre>${data.content}</pre>`;
  }

  return (
    <TitledCard
      title="README"
      icon={<BookOpen class="h-4 w-4" />}
      action={<ExternalLinkButton href={`https://github.com/${repo}#readme`}>View on GitHub</ExternalLinkButton>}
    >
      <div class="markdown-body p-4 text-lg" dangerouslySetInnerHTML={{ __html: html }} />
    </TitledCard>
  );
}
