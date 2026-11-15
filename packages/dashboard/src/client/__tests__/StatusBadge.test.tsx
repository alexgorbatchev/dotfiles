// UI test setup - registers DOM and exports testing utilities
import { render, screen, setupUITests } from "../../testing/ui-setup";

import { describe, expect, test } from "bun:test";

setupUITests();

import { StatusBadge } from "../components/StatusBadge";

describe("StatusBadge", () => {
  test("renders installed status with checkmark", () => {
    render(<StatusBadge status="installed" />);

    expect(screen.getByText("✓ Installed")).toBeInTheDocument();
  });

  test("applies success variant for installed status", () => {
    render(<StatusBadge status="installed" />);

    const badge = screen.getByText("✓ Installed");
    expect(badge).toHaveClass("bg-green-100");
    expect(badge).toHaveClass("text-green-900");
  });

  test("renders not-installed status", () => {
    render(<StatusBadge status="not-installed" />);

    expect(screen.getByText("Not installed")).toBeInTheDocument();
  });

  test("uses a neutral state for an uninstalled tool", () => {
    render(<StatusBadge status="not-installed" />);

    const badge = screen.getByText("Not installed");
    expect(badge).toHaveClass("bg-secondary");
    expect(badge).toHaveClass("text-secondary-foreground");
  });

  test("renders error status", () => {
    render(<StatusBadge status="error" />);

    expect(screen.getByText("Error")).toBeInTheDocument();
  });

  test("applies error variant for error status", () => {
    render(<StatusBadge status="error" />);

    const badge = screen.getByText("Error");
    expect(badge).toHaveClass("bg-red-100");
    expect(badge).toHaveClass("text-red-900");
  });
});
