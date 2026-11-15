import { fireEvent, render, screen, setupUITests } from "../../testing/ui-setup";

import { describe, expect, mock, test } from "bun:test";

import { ToolActionButtons } from "../components/ToolActionButtons";
import { fixture_idleActions } from "./fixtures";

setupUITests();

describe("ToolActionButtons", () => {
  test("dispatches check, update and force reinstall for an installed tool", () => {
    const actions = {
      ...fixture_idleActions,
      installTool: mock(async () => {}),
      updateTool: mock(async () => {}),
      checkTool: mock(async () => {}),
    };
    render(<ToolActionButtons toolName="bat" isInstalled actions={actions} size="sm" />);
    fireEvent.click(screen.getByRole("button", { name: "Check for updates" }));
    fireEvent.click(screen.getByRole("button", { name: "Update" }));
    fireEvent.click(screen.getByRole("button", { name: "Re-install" }));
    expect(actions.checkTool).toHaveBeenCalledWith("bat");
    expect(actions.updateTool).toHaveBeenCalledWith("bat");
    expect(actions.installTool).toHaveBeenCalledWith("bat", true);
  });

  test("only offers installation for an uninstalled tool", () => {
    const installTool = mock(async () => {});
    render(
      <ToolActionButtons
        toolName="bat"
        isInstalled={false}
        actions={{ ...fixture_idleActions, installTool }}
        size="xs"
      />,
    );
    expect(screen.getByRole("button", { name: "Check for updates" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Update" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Install" }));
    expect(installTool).toHaveBeenCalledWith("bat", false);
  });

  test("explains which pending tool disables its controls", () => {
    render(
      <ToolActionButtons
        toolName="bat"
        isInstalled
        actions={{ ...fixture_idleActions, pending: { toolName: "eza", kind: "update", startedAt: 0 } }}
        size="sm"
      />,
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(3);
    for (const button of buttons) {
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute("title", "Waiting for eza to finish update");
    }
    expect(screen.getByTestId("ToolActionButtons")).toHaveAttribute("aria-describedby", "tool-operation-busy");
  });
});
