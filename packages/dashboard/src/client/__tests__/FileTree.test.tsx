import { fireEvent, render, screen, setupUITests } from "../../testing/ui-setup";
import { describe, expect, mock, test } from "bun:test";
import type { ComponentProps } from "preact";
import { FileTree } from "../components/FileTree";

setupUITests();

describe("FileTree", () => {
  test("renders nested artifacts and reports stable paths when controlled folders toggle", () => {
    const nodes: ComponentProps<typeof FileTree>["nodes"] = [
      {
        name: "generated",
        path: "/project/.generated",
        type: "directory",
        children: [{ name: "bat", path: "/project/.generated/bat", type: "file", fileType: "shim" }],
      },
      { name: "empty", path: "/project/empty", type: "directory", children: [] },
      { name: "README", path: "/project/README", type: "file" },
    ];
    const handleToggle = mock<NonNullable<ComponentProps<typeof FileTree>["onItemToggle"]>>(() => {});
    const { rerender } = render(
      <FileTree nodes={nodes} collapsedIds={new Set(["/project/.generated"])} onItemToggle={handleToggle} />,
    );

    const folder = screen.getByRole("button", { name: "generated" });
    expect(folder).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("bat")).not.toBeInTheDocument();
    expect(screen.getByText("empty")).toBeInTheDocument();
    expect(screen.getByText("README")).toBeInTheDocument();
    fireEvent.click(folder);
    expect(handleToggle).toHaveBeenCalledTimes(1);
    expect(handleToggle).toHaveBeenCalledWith(
      expect.objectContaining({ id: "/project/.generated", data: nodes[0] }),
      true,
    );
    expect(screen.queryByText("bat")).not.toBeInTheDocument();

    rerender(<FileTree nodes={nodes} collapsedIds={new Set()} onItemToggle={handleToggle} />);
    expect(folder).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("bat")).toBeInTheDocument();
    expect(screen.getByText("shim")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "bat shim" })).not.toBeInTheDocument();
  });

  test.each([
    "shim",
    "binary",
    "binary-path",
    "symlink",
    "config",
    "completion",
    "init",
    "hook-generated",
    "catalog",
    "install",
    "source",
    "custom-artifact",
  ])("identifies %s artifacts without turning files into disclosure controls", (fileType) => {
    render(<FileTree nodes={[{ name: "artifact", path: "/artifact", type: "file", fileType }]} />);
    expect(screen.getByText("artifact")).toBeInTheDocument();
    expect(screen.getByText(fileType)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  test("renders no nodes for an empty registry", () => {
    render(<FileTree nodes={[]} />);
    expect(screen.getByTestId("Tree")).toBeEmptyDOMElement();
  });
});
