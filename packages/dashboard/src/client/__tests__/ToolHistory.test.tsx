import { render, screen, setupUITests } from "../../testing/ui-setup";
import { describe, expect, test } from "bun:test";
import type { IToolHistoryEntry } from "../../shared/types";
import { ToolHistory } from "../components/ToolHistory";

setupUITests();

describe("ToolHistory", () => {
  test("distinguishes an empty history from an installation without filesystem operations", () => {
    const { rerender } = render(<ToolHistory entries={[]} installedAt={null} dotfilesDir="/project" />);
    expect(screen.getByText("No history recorded")).toBeInTheDocument();
    const installedAt = "2026-11-14T12:00:00Z";
    rerender(<ToolHistory entries={[]} installedAt={installedAt} dotfilesDir="/project" />);
    expect(screen.queryByText("No history recorded")).not.toBeInTheDocument();
    expect(screen.getByText("Installed")).toBeInTheDocument();
    expect(screen.getByText(new Date(installedAt).toLocaleString())).toBeInTheDocument();
  });

  test.each([
    ["writeFile", "Created"],
    ["chmod", "Permissions"],
    ["rm", "Removed"],
    ["mkdir", "Directory"],
    ["symlink", "Linked"],
    ["rename", "Renamed"],
    ["cp", "Copied"],
    ["custom-operation", "custom-operation"],
  ])("describes %s operations and retains path, type and relative time", (operationType, label) => {
    const entries: IToolHistoryEntry[] = [
      {
        id: 1,
        operationType,
        fileType: "config",
        filePath: "/project/.generated/shell",
        relativeTime: "2 minutes ago",
      },
    ];
    render(<ToolHistory entries={entries} installedAt={null} dotfilesDir="/project" />);
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByText("(config)")).toBeInTheDocument();
    expect(screen.getByText("2 minutes ago")).toBeInTheDocument();
    expect(screen.getByTitle("/project/.generated/shell").textContent).toBe("<dotfiles>/.generated/shell");
    expect(screen.queryByText("Installed")).not.toBeInTheDocument();
  });

  test.each([
    ["/project", "/elsewhere/config", "/elsewhere/config"],
    ["/project", "/project-backup/config", "/project-backup/config"],
    ["", "/config", "/config"],
    ["/project", "/project", "<dotfiles>"],
    ["/project/", "/project/config", "<dotfiles>/config"],
  ])("abbreviates only paths owned by root '%s'", (dotfilesDir, filePath, displayPath) => {
    const entries: IToolHistoryEntry[] = [
      { id: 1, operationType: "rm", fileType: "", filePath, relativeTime: "just now" },
    ];
    render(<ToolHistory entries={entries} installedAt={null} dotfilesDir={dotfilesDir} />);
    expect(screen.getByTitle(filePath).textContent).toBe(displayPath);
    expect(screen.queryByText("()")).not.toBeInTheDocument();
  });
});
