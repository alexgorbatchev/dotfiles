import { fixture_toolMetadata } from "./fixtures";
import type { Meta, StoryObj } from "@storybook/preact";

import { ToolActionButtons } from "../ToolActionButtons";
import { fixture_idleActions, fixture_pendingActions } from "./fixtures";

const meta: Meta<typeof ToolActionButtons> = {
  title: "@dotfiles/dashboard/client/components/ToolActionButtons",
  component: ToolActionButtons,
  tags: ["!test"],
};

type Story = StoryObj<typeof meta>;

export const Installed: Story = {
  render: () => (
    <ToolActionButtons
      metadata={fixture_toolMetadata}
      toolName="bat"
      isInstalled
      actions={fixture_idleActions}
      size="sm"
    />
  ),
};
export const NotInstalled: Story = {
  render: () => (
    <ToolActionButtons
      metadata={fixture_toolMetadata}
      toolName="bat"
      isInstalled={false}
      actions={fixture_idleActions}
      size="sm"
    />
  ),
};
export const Compact: Story = {
  render: () => (
    <ToolActionButtons
      metadata={fixture_toolMetadata}
      toolName="bat"
      isInstalled
      actions={fixture_idleActions}
      size="xs"
    />
  ),
};
export const Busy: Story = {
  render: () => (
    <ToolActionButtons
      metadata={fixture_toolMetadata}
      toolName="bat"
      isInstalled={false}
      actions={fixture_pendingActions}
      size="sm"
    />
  ),
};

export default meta;

export const UnsupportedVersionCheck: Story = {
  render: () => (
    <ToolActionButtons
      toolName="zsh-plugin"
      isInstalled
      size="sm"
      actions={fixture_idleActions}
      metadata={{
        ...fixture_toolMetadata,
        updateMode: "reinstall",
        actions: {
          ...fixture_toolMetadata.actions,
          check: { enabled: false, reason: "This installer cannot check upstream." },
          update: {
            enabled: true,
            reason: "This installer cannot check upstream. Runs the installer again without comparing versions.",
          },
        },
      }}
    />
  ),
};
export const InactivePlatform: Story = {
  render: () => (
    <ToolActionButtons
      toolName="macos-only"
      isInstalled={false}
      size="sm"
      actions={fixture_idleActions}
      metadata={{
        ...fixture_toolMetadata,
        applicability: "inactive-platform",
        actions: {
          ...fixture_toolMetadata.actions,
          install: {
            enabled: false,
            reason: "No declarations apply to the platform selected when this dashboard started.",
          },
        },
      }}
    />
  ),
};
export const ConfigurationOnly: Story = {
  render: () => (
    <ToolActionButtons
      toolName="shell-aliases"
      isInstalled={false}
      size="sm"
      actions={fixture_idleActions}
      metadata={{
        ...fixture_toolMetadata,
        kind: "configuration-only",
        actions: {
          ...fixture_toolMetadata.actions,
          install: { enabled: false, reason: "Configuration only. Use state generate to apply declarations." },
        },
      }}
    />
  ),
};
export const PinnedVersion: Story = {
  render: () => (
    <ToolActionButtons
      toolName="bat"
      isInstalled
      size="sm"
      actions={fixture_idleActions}
      metadata={{
        ...fixture_toolMetadata,
        requestedVersion: "1.0",
        actions: {
          ...fixture_toolMetadata.actions,
          update: { enabled: false, reason: "Pinned to version 1.0. Change the requested version before updating." },
        },
      }}
    />
  ),
};
