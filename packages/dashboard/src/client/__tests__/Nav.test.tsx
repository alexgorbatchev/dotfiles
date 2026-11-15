// UI test setup - registers DOM and exports testing utilities
import { fireEvent, render, screen, setupUITests } from "../../testing/ui-setup";

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { LocationProvider } from "preact-iso";

setupUITests();

import { Nav } from "../components/Nav";

describe("Nav", () => {
  let originalFetch: typeof fetch;
  const originalPlatform = navigator.platform;

  beforeEach(() => {
    window.location.href = "http://localhost/";
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    Object.defineProperty(navigator, "platform", { configurable: true, value: originalPlatform });
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
        <Nav onSearch={() => {}} />
      </LocationProvider>,
    );

    const title = screen.getByText("⚡ Dotfiles");
    expect(title).toBeInTheDocument();
    expect(title.parentElement).toHaveClass("items-baseline");

    const badge = await screen.findByText("v2.6.0");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass("text-muted-foreground");
  });

  test("does not duplicate v prefix when version already starts with v", async () => {
    mockConfigResponse("v1.5.0");

    render(
      <LocationProvider>
        <Nav onSearch={() => {}} />
      </LocationProvider>,
    );

    const badge = await screen.findByText("v1.5.0");
    expect(badge).toBeInTheDocument();
  });

  test("does not render version badge when version is missing or empty", async () => {
    mockConfigResponse("");

    render(
      <LocationProvider>
        <Nav onSearch={() => {}} />
      </LocationProvider>,
    );

    expect(screen.getByText("⚡ Dotfiles")).toBeInTheDocument();
    expect(screen.queryByTestId("Badge")).not.toBeInTheDocument();
  });

  test("renders navigation links and search button", () => {
    mockConfigResponse("2.6.0");

    render(
      <LocationProvider>
        <Nav onSearch={() => {}} />
      </LocationProvider>,
    );

    expect(screen.getByText("🏠 Home")).toBeInTheDocument();
    expect(screen.getByText("🏥 Health")).toBeInTheDocument();
    expect(screen.getByText("⚙️ Settings")).toBeInTheDocument();
    expect(screen.getByText("Search...")).toBeInTheDocument();
  });
  test("provides native links, current-page state and a direct search callback", () => {
    mockConfigResponse();
    window.location.href = "http://localhost/health";
    const onSearch = mock(() => {});
    const { container } = render(
      <LocationProvider>
        <Nav onSearch={onSearch} />
      </LocationProvider>,
    );
    expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeInTheDocument();
    const health = screen.getByRole("link", { name: "🏥 Health" });
    expect(health).toHaveAttribute("href", "/health");
    expect(health).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "🏠 Home" })).not.toHaveAttribute("aria-current");
    expect(container.querySelector("button a")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Search/ }));
    expect(onSearch).toHaveBeenCalledTimes(1);
  });

  test.each([
    { platform: "Linux x86_64", hint: "Ctrl+K" },
    { platform: "MacIntel", hint: "⌘K" },
  ])("shows the $platform shortcut", ({ platform, hint }) => {
    Object.defineProperty(navigator, "platform", { configurable: true, value: platform });
    mockConfigResponse();
    render(
      <LocationProvider>
        <Nav onSearch={() => {}} />
      </LocationProvider>,
    );
    expect(screen.getByText(hint)).toBeInTheDocument();
  });
});
