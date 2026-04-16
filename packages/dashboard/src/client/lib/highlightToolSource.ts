type ShikiCodeToHtmlOptions = {
  lang: string;
  theme: string;
};

type ShikiApi = {
  codeToHtml: (source: string, options: ShikiCodeToHtmlOptions) => Promise<string>;
};

declare global {
  interface Window {
    shiki?: ShikiApi;
  }
}

export async function highlightToolSource(source: string): Promise<string> {
  // WORKAROUND: Temporarily load Shiki via CDN in dashboard.html to bypass Bun's HTML bundler minification bug
  // The bug causes "Ev is not defined" or similar minifier-variable collisions in production builds.

  if (typeof window !== "undefined" && window.shiki) {
    try {
      return await window.shiki.codeToHtml(source, {
        lang: "typescript",
        theme: "github-light",
      });
    } catch {
      // Fall back to plain escaped HTML if the CDN-loaded highlighter is unavailable.
    }
  }

  return `<pre class="shiki github-light"><code>${escapeHtml(source)}</code></pre>`;
}

function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
