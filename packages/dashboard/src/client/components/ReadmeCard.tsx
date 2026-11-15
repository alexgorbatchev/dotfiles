import { type JSX } from "preact";
import type { IToolReadmePayload } from "../../shared/types";
import { BookOpen } from "../icons";

import { useFetch } from "../hooks/useFetch";
import { RequestStateNotice } from "./RequestStateNotice";
import { ExternalLinkButton } from "./ui/ExternalLinkButton";
import { TitledCard } from "./ui/TitledCard";

// Using global marked and DOMPurify loaded via CDN in dashboard.html
// to workaround Bun's HTMLBundle minifier issues with heavy dependencies
type MarkedApi = {
  parse: (markdown: string) => string;
};

type DOMPurifyApi = {
  sanitize: (html: string) => string;
};

declare global {
  interface Window {
    marked?: MarkedApi;
    DOMPurify?: DOMPurifyApi;
  }
}

type ReadmeCardProps = {
  toolName: string;
  repo: string;
};

// Image hosts commonly used in READMEs (imgur among them) answer 403 when the Referer is not their
// own site. GitHub hides this by proxying README images through camo; the dashboard has no proxy, so
// it drops the referrer instead and the origin serves the image as it would to a bare request.
function dropImageReferrer(html: string): string {
  return html.replace(/<img\s/gi, '<img referrerpolicy="no-referrer" ');
}

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
  const { data, loading, error, refetch } = useFetch<IToolReadmePayload>(
    `/tools/${encodeURIComponent(toolName)}/readme`,
    [toolName],
  );

  let html: string | null = null;
  const marked = typeof window !== "undefined" ? window.marked : undefined;
  const domPurify = typeof window !== "undefined" ? window.DOMPurify : undefined;

  if (data?.content && marked && domPurify) {
    html = domPurify.sanitize(marked.parse(data.content));
    html = dropImageReferrer(resolveGitHubUrls(html, repo));
  }

  return (
    <TitledCard
      title="README"
      icon={<BookOpen class="h-4 w-4" />}
      action={<ExternalLinkButton href={`https://github.com/${repo}#readme`}>View on GitHub</ExternalLinkButton>}
    >
      <RequestStateNotice label="README" loading={loading} error={error} hasData={data !== null} onRetry={refetch} />
      {data && !data.content && !loading && !error && <p class="py-4 text-muted-foreground">README not available</p>}
      {data?.content &&
        (html === null ? (
          <pre class="whitespace-pre-wrap break-words p-4 text-sm">{data.content}</pre>
        ) : (
          <div class="markdown-body p-4 text-lg" dangerouslySetInnerHTML={{ __html: html }} />
        ))}
    </TitledCard>
  );
}
