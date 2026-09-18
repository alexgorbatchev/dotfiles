import type { Meta, StoryObj } from "@storybook/preact";

import { ToolActionBanner } from "../ToolActionBanner";

const meta: Meta<typeof ToolActionBanner> = {
  title: "@dotfiles/dashboard/client/components/ToolActionBanner",
  component: ToolActionBanner,
  tags: ["!test"],
};

type Story = StoryObj<typeof meta>;

const trustError = [
  "Error: Refusing to load cask nikitabobko/tap/aerospace from untrusted tap nikitabobko/tap.",
  "Run `brew trust --cask nikitabobko/tap/aerospace` or `brew trust nikitabobko/tap` to trust it.",
].join("\n");

const Default: Story = {
  render: () => (
    <div class="space-y-2">
      <ToolActionBanner
        outcome={{ toolName: "aerospace", kind: "install", message: "Installed 0.20.0", tone: "success" }}
      />
      <ToolActionBanner outcome={{ toolName: "aerospace", kind: "install", message: trustError, tone: "error" }} />
      <ToolActionBanner
        outcome={{ toolName: "eza", kind: "update", message: "Update failed: network unreachable", tone: "error" }}
      />
    </div>
  ),
};

export default meta;
export { Default as ToolActionBanner };
