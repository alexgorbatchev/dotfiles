// UI test setup - registers DOM and exports testing utilities
import { fireEvent, render, screen, setupUITests } from "../../../testing/ui-setup";

import { describe, expect, mock, test } from "bun:test";

setupUITests();

import type { IUseToolActions } from "../../hooks/useToolActions";
import { ToolActionButtons } from "../ToolActionButtons";

describe("ToolActionButtons", () => {
  const defaultActions: IUseToolActions = {
    pending: null,
    outcome: null,
    dismissOutcome: mock(() => {}),
    installTool: mock(async () => {}),
    updateTool: mock(async () => {}),
    checkTool: mock(async () => {}),
  };

  test("renders check, update, and install buttons for installed tool", () => {
    render(<ToolActionButtons toolName="bat" isInstalled={true} actions={defaultActions} size="sm" />);

    expect(screen.getByRole("button", { name: "Check for updates" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Re-install" })).toBeInTheDocument();
  });

  test("renders popover banner with dismiss button when tool owns the outcome", () => {
    const dismissOutcome = mock(() => {});
    const actionsWithOutcome: IUseToolActions = {
      ...defaultActions,
      outcome: {
        toolName: "bat",
        kind: "check",
        message: "Up to date (0.24.0)",
        tone: "success",
      },
      dismissOutcome,
    };

    render(<ToolActionButtons toolName="bat" isInstalled={true} actions={actionsWithOutcome} size="sm" />);

    const banner = screen.getByTestId("ToolActionBanner");
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveClass("tool-action-popover");

    const dismissButton = screen.getByRole("button", { name: "Dismiss" });
    expect(dismissButton).toBeInTheDocument();
    fireEvent.click(dismissButton);

    expect(dismissOutcome).toHaveBeenCalledTimes(1);
  });

  test("does not render popover when outcome belongs to another tool", () => {
    const actionsWithOtherOutcome: IUseToolActions = {
      ...defaultActions,
      outcome: {
        toolName: "eza",
        kind: "check",
        message: "Up to date (0.2.0)",
        tone: "success",
      },
    };

    render(<ToolActionButtons toolName="bat" isInstalled={true} actions={actionsWithOtherOutcome} size="sm" />);

    expect(screen.queryByTestId("ToolActionBanner")).toBeNull();
  });
});
