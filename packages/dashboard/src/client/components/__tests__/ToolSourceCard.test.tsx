// UI test setup - registers DOM and exports testing utilities
import { render, screen, setupUITests } from "../../../testing/ui-setup";

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { ToolSourceCard } from "../ToolSourceCard";

setupUITests();

const originalFetch = globalThis.fetch;

describe("ToolSourceCard", () => {
  beforeEach(() => {
    globalThis.fetch = originalFetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("renders fetched source content in a code block", async () => {
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

    render(<ToolSourceCard toolName="test" />);

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(screen.getByText("export default defineTool(() => {});")).toBeInTheDocument();
    const link = screen.getByText("Open in VSCode");
    expect(link).toHaveAttribute("href", "vscode://file//home/user/.dotfiles/tools/test.tool.ts");
  });
});
