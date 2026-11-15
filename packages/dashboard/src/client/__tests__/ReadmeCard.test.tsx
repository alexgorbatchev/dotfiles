import { fireEvent, render, screen, setupUITests } from "../../testing/ui-setup";

import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { ReadmeCard } from "../components/ReadmeCard";

setupUITests();
const originalFetch = globalThis.fetch;
const originalMarked = window.marked;
const originalPurify = window.DOMPurify;
afterEach(() => {
  globalThis.fetch = originalFetch;
  window.marked = originalMarked;
  window.DOMPurify = originalPurify;
});

describe("README request states", () => {
  test("reports and retries a failed README request", async () => {
    const fetchMock = spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Offline"));
    render(<ReadmeCard toolName="example" repo="owner/example" />);
    await screen.findByRole("alert");
    expect(screen.queryByText("README not available")).toBeNull();
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: { content: "" } })));
    fireEvent.click(screen.getByRole("button", { name: "Retry readme" }));
    await screen.findByText("README not available");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("renders untrusted markup as text when CDN parsing or sanitizing is unavailable", async () => {
    window.marked = undefined;
    window.DOMPurify = undefined;
    const content = '</pre><img src="x" onerror="window.readmeExecuted=true"><script>unsafe()</script>';
    spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, data: { content } })),
    );
    const { container } = render(<ReadmeCard toolName="example" repo="owner/example" />);
    await screen.findByText(content);
    expect(container.querySelector("pre")?.textContent).toBe(content);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
  });
});

test("renders sanitized Markdown and preserves repository-relative links when CDN libraries are available", async () => {
  const content = "# README";
  const html =
    '<h1>README</h1><img src="./image.png" alt="Diagram"><a href="./guide.md">Guide</a><a href="https://example.com">External</a>';
  window.marked = { parse: () => html };
  window.DOMPurify = { sanitize: () => html };
  spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: { content } })));
  render(<ReadmeCard toolName="example" repo="owner/example" />);
  await screen.findByRole("heading", { name: "README" });
  expect(screen.getByRole("img", { name: "Diagram" })).toHaveAttribute(
    "src",
    "https://github.com/owner/example/raw/HEAD/image.png",
  );
  expect(screen.getByRole("img", { name: "Diagram" })).toHaveAttribute("referrerpolicy", "no-referrer");
  expect(screen.getByRole("link", { name: "Guide" })).toHaveAttribute(
    "href",
    "https://github.com/owner/example/blob/HEAD/guide.md",
  );
  expect(screen.getByRole("link", { name: "External" })).toHaveAttribute("href", "https://example.com");
});
