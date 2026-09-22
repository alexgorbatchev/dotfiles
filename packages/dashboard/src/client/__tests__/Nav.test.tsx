// UI test setup - registers DOM and exports testing utilities
import { render, screen, setupUITests } from "../../testing/ui-setup";

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { LocationProvider } from "preact-iso";

setupUITests();

import { Nav } from "../components/Nav";

describe("Nav", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    window.location.href = "http://localhost/";
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function mockConfigResponse(version?: string): void {
    const mockFn = mock(async () => {
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            dotfilesDir: "/test/dotfiles",
            generatedDir: "/test/generated",
            binariesDir: "/test/binaries",
            targetDir: "/test/target",
            toolConfigsDir: "/test/tools",
            version,
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    });
    globalThis.fetch = Object.assign(mockFn, { preconnect: () => {} }) as typeof fetch;
  }

  test("renders dotfiles title and version badge when version is returned", async () => {
    mockConfigResponse("2.6.0");

    render(
      <LocationProvider>
        <Nav />
      </LocationProvider>,
    );

    const title = screen.getByText("⚡ Dotfiles");
    expect(title).toBeInTheDocument();
    expect(title.parentElement).toHaveClass("items-baseline");

    const badge = await screen.findByText("v2.6.0");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass("text-muted-foreground");
    expect(badge).toHaveClass("bg-muted-foreground/15");
  });

  test("does not duplicate v prefix when version already starts with v", async () => {
    mockConfigResponse("v1.5.0");

    render(
      <LocationProvider>
        <Nav />
      </LocationProvider>,
    );

    const badge = await screen.findByText("v1.5.0");
    expect(badge).toBeInTheDocument();
  });

  test("does not render version badge when version is missing or empty", async () => {
    mockConfigResponse("");

    render(
      <LocationProvider>
        <Nav />
      </LocationProvider>,
    );

    expect(screen.getByText("⚡ Dotfiles")).toBeInTheDocument();
    expect(screen.queryByTestId("Badge")).not.toBeInTheDocument();
  });

  test("renders navigation links and search button", () => {
    mockConfigResponse("2.6.0");

    render(
      <LocationProvider>
        <Nav />
      </LocationProvider>,
    );

    expect(screen.getByText("🏠 Home")).toBeInTheDocument();
    expect(screen.getByText("🏥 Health")).toBeInTheDocument();
    expect(screen.getByText("⚙️ Settings")).toBeInTheDocument();
    expect(screen.getByText("Search...")).toBeInTheDocument();
  });
});
