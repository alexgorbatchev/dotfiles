import { codeToHtml } from "shiki/bundle/web";

export async function highlightToolSource(source: string): Promise<string> {
  // WORKAROUND: Temporarily bypass Shiki until Bun's HTML bundler minification bug is resolved.
  // The bug causes "Ev is not defined" or similar minifier-variable collisions in production builds.
  // This just returns raw code safely wrapped.
  return Promise.resolve(`<pre class="shiki github-light"><code>${escapeHtml(source)}</code></pre>`);
}

function escapeHtml(unsafe: string) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
