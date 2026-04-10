import { codeToHtml } from "shiki/bundle/web";

export async function highlightToolSource(source: string): Promise<string> {
  return await codeToHtml(source, {
    lang: "typescript",
    theme: "github-light",
  });
}
