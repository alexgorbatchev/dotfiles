// UI test setup - registers DOM and exports testing utilities
import { render, screen, setupUITests } from "../../testing/ui-setup";

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { ToolSourceCard } from "../components/ToolSourceCard";

setupUITests();

const originalFetch = globalThis.fetch;

describe("ToolSourceCard", () => {
  beforeEach(() => {
    globalThis.fetch = originalFetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("reports a source request failure without claiming source is absent", async () => {
    const mockFn = mock(async () => {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to load",
        }),
        {
          headers: { "Content-Type": "application/json" },
        },
      );
    });

    globalThis.fetch = Object.assign(mockFn, { preconnect: () => {} }) as typeof fetch;

    render(<ToolSourceCard toolName="test" />);

    await screen.findByText("Source could not be loaded.");
    expect(screen.getByRole("button", { name: "Retry source" })).toBeInTheDocument();
    expect(screen.queryByText("Source not available")).toBeNull();
  });

  test("renders fetched source content with syntax highlighting", async () => {
    const mockFn = mock(async () => {
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            content: "export default defineTool(() => {});\n",
            filePath: "/home/user/.dotfiles/tools/test.tool.ts",
          },
        }),
        {
          headers: { "Content-Type": "application/json" },
        },
      );
    });

    globalThis.fetch = Object.assign(mockFn, { preconnect: () => {} }) as typeof fetch;

    const { container } = render(<ToolSourceCard toolName="test" />);

    await screen.findByTestId("ToolSourceCard--highlighted");
    expect(container.querySelector(".shiki")?.textContent).toContain("export default defineTool(() => {});");
    const link = screen.getByText("Open in VSCode");
    expect(link).toHaveAttribute("href", "vscode://file//home/user/.dotfiles/tools/test.tool.ts");
  });
});
