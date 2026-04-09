import "github-markdown-css/github-markdown-light.css";

import { type JSX } from "preact";
import Markdown, { type Components } from "react-markdown";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";
import type { IToolReadmePayload } from "../../shared/types";
import { BookOpen, ExternalLink } from "../icons";

import { useFetch } from "../hooks/useFetch";
import { ExternalLinkButton } from "./ui/ExternalLinkButton";
import { TitledCard } from "./ui/TitledCard";

type ReadmeCardProps = {
  toolName: string;
  repo: string;
};

function resolveGitHubUrl(url: string | undefined, repo: string, forImage: boolean = false): string | undefined {
  if (!url) return url;
  // Already absolute URL
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("//")) {
    return url;
  }
  // Anchor links
  if (url.startsWith("#")) {
    return url;
  }
  // Relative URL - use raw for images, blob for other files (like .md)
  const cleanPath = url.startsWith("./") ? url.slice(2) : url;
  const urlType = forImage ? "raw" : "blob";
  return `https://github.com/${repo}/${urlType}/HEAD/${cleanPath}`;
}

function createMarkdownComponents(repo: string): Components {
  return {
    a: ({ href, children, ...props }) => {
      const hrefStr = typeof href === "string" ? href : undefined;
      const resolvedHref = resolveGitHubUrl(hrefStr, repo, false);
      const isAnchor = hrefStr?.startsWith("#");
      return (
        <a
          {...props}
          href={resolvedHref}
          target={isAnchor ? undefined : "_blank"}
          rel={isAnchor ? undefined : "noopener noreferrer"}
        >
          {children}
        </a>
      );
    },
    img: ({ src, alt, ...props }) => {
      const srcStr = typeof src === "string" ? src : undefined;
      return <img {...props} src={resolveGitHubUrl(srcStr, repo, true)} alt={alt} />;
    },
  };
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

  return (
    <TitledCard
      title="README"
      icon={<BookOpen class="h-4 w-4" />}
      action={<ExternalLinkButton href={`https://github.com/${repo}#readme`}>View on GitHub</ExternalLinkButton>}
    >
      <div class="markdown-body p-4 text-lg">
        <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={createMarkdownComponents(repo)}>
          {data.content}
        </Markdown>
      </div>
    </TitledCard>
  );
}
