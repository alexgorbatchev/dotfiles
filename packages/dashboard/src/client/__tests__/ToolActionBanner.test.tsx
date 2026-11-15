import { fireEvent, render, screen, setupUITests, waitFor } from "../../testing/ui-setup";

import { afterEach, describe, expect, mock, test } from "bun:test";

import { ToolActionBanner } from "../components/ToolActionBanner";

setupUITests();

describe("ToolActionBanner", () => {
  test("renders nothing when outcome is null", () => {
    const { container } = render(<ToolActionBanner outcome={null} />);
    expect(container.firstChild).toBeNull();
  });

  test("renders success outcome with toolName and message", () => {
    render(
      <ToolActionBanner outcome={{ toolName: "eza", kind: "check", message: "Up to date (0.2.0)", tone: "success" }} />,
    );

    expect(screen.getByText("eza")).toBeInTheDocument();
    expect(screen.getByText("Up to date (0.2.0)")).toBeInTheDocument();
  });

  test("renders dismiss button and calls onDismiss when clicked for success tone", () => {
    const onDismiss = mock(() => {});
    render(
      <ToolActionBanner
        outcome={{ toolName: "eza", kind: "check", message: "Up to date (0.2.0)", tone: "success" }}
        onDismiss={onDismiss}
      />,
    );

    const dismissButton = screen.getByRole("button", { name: "Dismiss" });
    expect(dismissButton).toBeInTheDocument();

    fireEvent.click(dismissButton);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  test("renders dismiss button and calls onDismiss when clicked for error tone", () => {
    const onDismiss = mock(() => {});
    render(
      <ToolActionBanner
        outcome={{ toolName: "eza", kind: "update", message: "Update failed: network error", tone: "error" }}
        onDismiss={onDismiss}
      />,
    );

    const dismissButton = screen.getByRole("button", { name: "Dismiss" });
    expect(dismissButton).toBeInTheDocument();

    fireEvent.click(dismissButton);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  test("renders copy button for cask trust error command", () => {
    const trustError = [
      "Error: Refusing to load cask nikitabobko/tap/aerospace from untrusted tap nikitabobko/tap.",
      "Run `brew trust --cask nikitabobko/tap/aerospace` or `brew trust nikitabobko/tap` to trust it.",
    ].join("\n");

    render(
      <ToolActionBanner outcome={{ toolName: "aerospace", kind: "install", message: trustError, tone: "error" }} />,
    );

    expect(screen.getByTitle("Copy command")).toBeInTheDocument();
    expect(screen.getByText("brew trust --cask nikitabobko/tap/aerospace")).toBeInTheDocument();
  });
});

describe("result diagnostics", () => {
  const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  afterEach(() => {
    Object.defineProperty(navigator, "clipboard", clipboardDescriptor ?? { configurable: true, value: undefined });
  });

  test("copies only the actionable trust command rather than the surrounding error", async () => {
    const writeText = mock(async () => {});
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(
      <ToolActionBanner
        outcome={{
          toolName: "aerospace",
          kind: "install",
          message:
            "Error: Refusing to load cask from an untrusted tap.\nRun " +
            "`brew trust --cask nikitabobko/tap/aerospace` to trust it.",
          tone: "error",
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Copy command" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("brew trust --cask nikitabobko/tap/aerospace"));
    expect(screen.getByText("Copied to clipboard")).toBeInTheDocument();
  });

  test("copies the complete original error and offers retry", async () => {
    const writeText = mock(async () => {});
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const retry = mock(() => {});
    render(
      <ToolActionBanner
        outcome={{ toolName: "bat", kind: "install", message: "Failed\nHTTP 502", tone: "error" }}
        onRetry={retry}
      />,
    );
    expect(screen.getByRole("alert").textContent).toBe("batFailedFailed\nHTTP 502");
    fireEvent.click(screen.getByRole("button", { name: "Copy details" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("bat · install\nFailed\nHTTP 502"));
    expect(screen.getByText("Copied to clipboard")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  test("keeps selectable diagnostics when clipboard access fails", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    render(
      <ToolActionBanner
        outcome={{ toolName: "bat", kind: "install", message: "Network unavailable", tone: "error" }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Copy details" }));
    await screen.findByText("Clipboard unavailable. Select and copy the details below.");
    expect(screen.getByText("Details")).toBeInTheDocument();
  });

  test("disables retry while another action owns the operation slot", () => {
    render(
      <ToolActionBanner
        outcome={{ toolName: "bat", kind: "install", message: "Network unavailable", tone: "error" }}
        onRetry={() => {}}
        isRetryDisabled
      />,
    );
    expect(screen.getByRole("button", { name: "Retry" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Retry" })).toHaveAttribute("aria-describedby", "tool-operation-busy");
  });
});
