// UI test setup - registers DOM and exports testing utilities
import { fireEvent, render, screen, setupUITests } from "../../../testing/ui-setup";

import { describe, expect, mock, test } from "bun:test";

setupUITests();

import { ToolActionBanner } from "../ToolActionBanner";

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
    expect(screen.getByText(/Up to date \(0.2.0\)/)).toBeInTheDocument();
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
