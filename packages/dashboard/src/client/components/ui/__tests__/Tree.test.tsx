// UI test setup - registers DOM and exports testing utilities
import { fireEvent, render, screen, setupUITests } from "../../../../testing/ui-setup";

import { describe, expect, mock, test } from "bun:test";

setupUITests();
import { File, Folder } from "../../../icons";

import { Tree, type ITreeItemData } from "../Tree";

describe("Tree", () => {
  const simpleItems: ITreeItemData[] = [
    { id: "1", label: "Item 1" },
    { id: "2", label: "Item 2" },
  ];

  const nestedItems: ITreeItemData[] = [
    {
      id: "folder",
      label: "Folder",
      children: [
        { id: "file1", label: "File 1" },
        { id: "file2", label: "File 2" },
      ],
    },
  ];

  test("renders flat list of items", () => {
    render(<Tree items={simpleItems} />);

    expect(screen.getByText("Item 1")).toBeInTheDocument();
    expect(screen.getByText("Item 2")).toBeInTheDocument();
  });

  test("renders nested items with children expanded by default", () => {
    render(<Tree items={nestedItems} />);

    expect(screen.getByText("Folder")).toBeInTheDocument();
    expect(screen.getByText("File 1")).toBeInTheDocument();
    expect(screen.getByText("File 2")).toBeInTheDocument();
  });

  test("renders items with icons", () => {
    const itemsWithIcons: ITreeItemData[] = [
      { id: "1", label: "Folder", icon: <Folder data-testid="folder-icon" /> },
      { id: "2", label: "File", icon: <File data-testid="file-icon" /> },
    ];

    render(<Tree items={itemsWithIcons} />);

    expect(screen.getByTestId("folder-icon")).toBeInTheDocument();
    expect(screen.getByTestId("file-icon")).toBeInTheDocument();
  });

  test("collapses and expands children on click", () => {
    render(<Tree items={nestedItems} />);

    expect(screen.getByText("File 1")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Folder"));
    expect(screen.queryByText("File 1")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Folder"));
    expect(screen.getByText("File 1")).toBeInTheDocument();
  });

  test("respects defaultExpanded=false", () => {
    render(<Tree items={nestedItems} defaultExpanded={false} />);

    expect(screen.getByText("Folder")).toBeInTheDocument();
    expect(screen.queryByText("File 1")).not.toBeInTheDocument();
  });

  test("supports controlled collapsed state", () => {
    const handleToggle = mock(() => {});
    const { rerender } = render(
      <Tree items={nestedItems} collapsedIds={new Set(["folder"])} onItemToggle={handleToggle} />,
    );

    expect(screen.getByText("Folder")).toBeInTheDocument();
    expect(screen.queryByText("File 1")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Folder"));
    expect(handleToggle).toHaveBeenCalledWith(nestedItems[0], true);

    rerender(<Tree items={nestedItems} collapsedIds={new Set()} onItemToggle={handleToggle} />);
    expect(screen.getByText("File 1")).toBeInTheDocument();
  });

  test("calls onItemClick when item is clicked", () => {
    const handleClick = mock(() => {});

    render(<Tree items={simpleItems} onItemClick={handleClick} />);

    fireEvent.click(screen.getByText("Item 1"));

    expect(handleClick).toHaveBeenCalledTimes(1);
    expect(handleClick).toHaveBeenCalledWith(simpleItems[0]);
  });

  test("renders custom label via renderLabel", () => {
    render(
      <Tree
        items={simpleItems}
        renderLabel={(item) => <span data-testid={`custom-${item.id}`}>{item.label.toUpperCase()}</span>}
      />,
    );

    expect(screen.getByTestId("custom-1")).toHaveTextContent("ITEM 1");
    expect(screen.getByTestId("custom-2")).toHaveTextContent("ITEM 2");
  });

  test("renders actions slot via renderActions", () => {
    render(
      <Tree items={simpleItems} renderActions={(item) => <button data-testid={`action-${item.id}`}>Action</button>} />,
    );

    expect(screen.getByTestId("action-1")).toBeInTheDocument();
    expect(screen.getByTestId("action-2")).toBeInTheDocument();
  });

  test("applies custom class to container", () => {
    const { container } = render(<Tree items={simpleItems} class="custom-class" />);

    expect(container.firstChild).toHaveClass("custom-class");
  });

  test("renders deeply nested tree structure", () => {
    const deepItems: ITreeItemData[] = [
      {
        id: "level1",
        label: "Level 1",
        children: [
          {
            id: "level2",
            label: "Level 2",
            children: [{ id: "level3", label: "Level 3" }],
          },
        ],
      },
    ];

    render(<Tree items={deepItems} />);

    expect(screen.getByText("Level 1")).toBeInTheDocument();
    expect(screen.getByText("Level 2")).toBeInTheDocument();
    expect(screen.getByText("Level 3")).toBeInTheDocument();
  });

  test("supports generic data payload", () => {
    interface IFileData {
      size: number;
      modified: string;
    }

    const itemsWithData: ITreeItemData<IFileData>[] = [
      { id: "1", label: "Document", data: { size: 1024, modified: "2024-01-01" } },
    ];

    const handleClick = mock((_item: ITreeItemData<IFileData>) => {});

    render(<Tree items={itemsWithData} onItemClick={handleClick} />);

    fireEvent.click(screen.getByText("Document"));

    expect(handleClick).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { size: 1024, modified: "2024-01-01" },
      }),
    );
  });
});
