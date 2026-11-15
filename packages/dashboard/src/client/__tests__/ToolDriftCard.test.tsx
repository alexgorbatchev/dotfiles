import { render, screen, setupUITests } from "../../testing/ui-setup";
import { describe, expect, test } from "bun:test";
import type { IDriftItem } from "../../shared/types";
import { ToolDriftCard } from "../components/ToolDriftCard";

setupUITests();

describe("ToolDriftCard", () => {
  test("explains an undeclared tool without claiming synchronization", () => {
    render(<ToolDriftCard />);
    expect(screen.getByText("No files or managed blocks declared for this tool.")).toBeInTheDocument();
    expect(screen.queryByText("In-sync")).not.toBeInTheDocument();
  });

  test("identifies synchronized files and managed blocks, then summarizes the verified count", () => {
    const driftItems: IDriftItem[] = [
      { toolName: "shell", filePath: "/home/test/.zshrc", blockId: "shell-init", type: "block", state: "in-sync" },
      { toolName: "shell", filePath: "/home/test/.config/shell", type: "symlink", state: "in-sync" },
    ];
    render(<ToolDriftCard driftItems={driftItems} />);
    expect(screen.getByTitle("/home/test/.zshrc [shell-init]")).toHaveTextContent("/home/test/.zshrc [shell-init]");
    expect(screen.getByTitle("/home/test/.config/shell")).toHaveTextContent("/home/test/.config/shell");
    expect(screen.getAllByText("In-sync")).toHaveLength(2);
    expect(screen.getByText("All 2 declared artifact(s) match the current disk state.")).toBeInTheDocument();
  });

  test("shows literal diffs and local-change explanations without a false all-synchronized summary", () => {
    const diff = "--- current\n+++ desired\n-<script>local()</script>\n+managed";
    const driftItems: IDriftItem[] = [
      { toolName: "shell", filePath: "/config/template", type: "template", state: "local-drift", diff },
      {
        toolName: "shell",
        filePath: "/config/copy",
        type: "copy",
        state: "local-drift",
        currentContent: "",
        desiredContent: "managed",
      },
      { toolName: "shell", filePath: "/config/link", type: "symlink", state: "in-sync" },
    ];
    const { container } = render(<ToolDriftCard driftItems={driftItems} />);
    expect(container.querySelector("pre")?.textContent).toBe(diff);
    expect(container.querySelector("script")).toBeNull();
    expect(screen.getAllByText("local-drift")).toHaveLength(2);
    expect(screen.getAllByText("Content modified locally on disk.")).toHaveLength(1);
    expect(screen.queryByText("All 3 declared artifact(s) match the current disk state.")).not.toBeInTheDocument();
  });
});
