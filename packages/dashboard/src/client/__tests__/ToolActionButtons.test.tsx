import { fireEvent, render, screen, setupUITests } from "../../testing/ui-setup";

import { describe, expect, mock, test } from "bun:test";

import { ToolActionButtons } from "../components/ToolActionButtons";
import { fixture_idleActions, fixture_toolMetadata } from "./fixtures";

setupUITests();

describe("ToolActionButtons", () => {
  test("dispatches check, update and force reinstall for an installed tool", () => {
    const actions = {
      ...fixture_idleActions,
      installTool: mock(async () => {}),
      updateTool: mock(async () => {}),
      checkTool: mock(async () => {}),
    };
    render(
      <ToolActionButtons metadata={fixture_toolMetadata} toolName="bat" isInstalled actions={actions} size="sm" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Check for updates" }));
    fireEvent.click(screen.getByRole("button", { name: "Check and update" }));
    fireEvent.click(screen.getByText("More actions"));
    fireEvent.click(screen.getByRole("button", { name: "Force reinstall", hidden: true }));
    expect(actions.checkTool).toHaveBeenCalledWith("bat");
    expect(actions.updateTool).toHaveBeenCalledWith("bat");
    expect(actions.installTool).toHaveBeenCalledWith("bat", true);
  });

  test("only offers installation for an uninstalled tool", () => {
    const installTool = mock(async () => {});
    render(
      <ToolActionButtons
        metadata={fixture_toolMetadata}
        toolName="bat"
        isInstalled={false}
        actions={{ ...fixture_idleActions, installTool }}
        size="xs"
      />,
    );
    expect(screen.queryByRole("button", { name: "Check for updates" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Check and update" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Install" }));
    expect(installTool).toHaveBeenCalledWith("bat", false);
  });

  test("explains which pending tool disables its controls", () => {
    render(
      <ToolActionButtons
        metadata={fixture_toolMetadata}
        toolName="bat"
        isInstalled
        actions={{ ...fixture_idleActions, pending: { toolName: "eza", kind: "update", startedAt: 0 } }}
        size="sm"
      />,
    );
    const buttons = screen.getAllByRole("button", { hidden: true });
    expect(buttons).toHaveLength(3);
    for (const button of buttons) {
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute("title", "Waiting for eza to finish update");
    }
    expect(screen.getByTestId("ToolActionButtons")).toHaveAttribute("aria-describedby", "tool-operation-busy");
  });
});

test("explains unsupported checks and labels unchecked reinstalls before execution", () => {
  const reason = "This installer cannot check upstream.";
  const metadata = {
    ...fixture_toolMetadata,
    updateMode: "reinstall" as const,
    actions: {
      ...fixture_toolMetadata.actions,
      check: { enabled: false, reason },
      update: { enabled: true, reason: `${reason} Runs the installer again.` },
    },
  };
  const updateTool = mock(async () => {});
  render(
    <ToolActionButtons
      toolName="plugin"
      isInstalled
      metadata={metadata}
      actions={{ ...fixture_idleActions, updateTool }}
      size="sm"
    />,
  );
  expect(screen.queryByRole("button", { name: "Check for updates" })).toBeNull();
  expect(screen.getByText(`${reason} Runs the installer again.`)).toBeInTheDocument();
  expect(screen.getByText("More actions").closest("details")).not.toHaveAttribute("open");
  expect(screen.getByText(/may replace managed files/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Reinstall without version check" }));
  expect(updateTool).toHaveBeenCalledWith("plugin");
});

test.each(["Disabled in configuration.", "Configuration only.", "No declarations apply to this platform."])(
  "blocks unavailable actions with a visible reason: %s",
  (reason) => {
    const action = { enabled: false, reason };
    const metadata = {
      ...fixture_toolMetadata,
      actions: { install: action, check: action, update: action, reinstall: action },
    };
    const installTool = mock(async () => {});
    render(
      <ToolActionButtons
        toolName="inactive"
        isInstalled={false}
        metadata={metadata}
        actions={{ ...fixture_idleActions, installTool }}
        size="sm"
      />,
    );
    expect(screen.getByText(reason)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Install" })).toBeDisabled();
    expect(screen.queryByText("More actions")).toBeNull();
    expect(installTool).not.toHaveBeenCalled();
  },
);
