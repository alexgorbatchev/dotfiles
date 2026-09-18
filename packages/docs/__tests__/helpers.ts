/** Collects the `href` of every element matched by `selector`, in document order. */
export async function collectHrefs(html: string, selector: string): Promise<string[]> {
  const hrefs: string[] = [];
  const rewriter = new HTMLRewriter().on(selector, {
    element(element) {
      const href = element.getAttribute("href");
      if (href !== null) {
        hrefs.push(href);
      }
    },
  });

  await rewriter.transform(new Response(html)).text();

  return hrefs;
}
