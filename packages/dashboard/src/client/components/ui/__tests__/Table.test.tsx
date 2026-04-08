// UI test setup - registers DOM and exports testing utilities
import { render, screen, setupUITests } from "../../../../testing/ui-setup";

import { describe, expect, test } from "bun:test";

setupUITests();

import { Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "../Table";

describe("Table", () => {
  test("renders table element", () => {
    render(
      <Table>
        <TableBody>
          <TableRow>
            <TableCell>Cell</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  test("has table data-slot attribute", () => {
    render(
      <Table>
        <TableBody>
          <TableRow>
            <TableCell>Cell</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    expect(screen.getByRole("table")).toHaveAttribute("data-slot", "table");
  });

  test("wraps table in container", () => {
    const { container } = render(
      <Table>
        <TableBody>
          <TableRow>
            <TableCell>Cell</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    const wrapper = container.querySelector('[data-slot="table-container"]');
    expect(wrapper).toBeInTheDocument();
    expect(wrapper).toHaveClass("overflow-x-auto");
  });
});

describe("TableHeader", () => {
  test("renders thead element", () => {
    render(
      <Table>
        <TableHeader data-testid="header">
          <TableRow>
            <TableHead>Header</TableHead>
          </TableRow>
        </TableHeader>
      </Table>,
    );

    expect(screen.getByTestId("header").tagName).toBe("THEAD");
  });

  test("has table-header data-slot attribute", () => {
    render(
      <Table>
        <TableHeader data-testid="header">
          <TableRow>
            <TableHead>Header</TableHead>
          </TableRow>
        </TableHeader>
      </Table>,
    );

    expect(screen.getByTestId("header")).toHaveAttribute("data-slot", "table-header");
  });
});

describe("TableBody", () => {
  test("renders tbody element", () => {
    render(
      <Table>
        <TableBody data-testid="body">
          <TableRow>
            <TableCell>Cell</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    expect(screen.getByTestId("body").tagName).toBe("TBODY");
  });

  test("has table-body data-slot attribute", () => {
    render(
      <Table>
        <TableBody data-testid="body">
          <TableRow>
            <TableCell>Cell</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    expect(screen.getByTestId("body")).toHaveAttribute("data-slot", "table-body");
  });
});

describe("TableFooter", () => {
  test("renders tfoot element", () => {
    render(
      <Table>
        <TableFooter data-testid="footer">
          <TableRow>
            <TableCell>Footer</TableCell>
          </TableRow>
        </TableFooter>
      </Table>,
    );

    expect(screen.getByTestId("footer").tagName).toBe("TFOOT");
  });

  test("has table-footer data-slot attribute", () => {
    render(
      <Table>
        <TableFooter data-testid="footer">
          <TableRow>
            <TableCell>Footer</TableCell>
          </TableRow>
        </TableFooter>
      </Table>,
    );

    expect(screen.getByTestId("footer")).toHaveAttribute("data-slot", "table-footer");
  });
});

describe("TableRow", () => {
  test("renders tr element", () => {
    render(
      <Table>
        <TableBody>
          <TableRow data-testid="row">
            <TableCell>Cell</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    expect(screen.getByTestId("row").tagName).toBe("TR");
  });

  test("has table-row data-slot attribute", () => {
    render(
      <Table>
        <TableBody>
          <TableRow data-testid="row">
            <TableCell>Cell</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    expect(screen.getByTestId("row")).toHaveAttribute("data-slot", "table-row");
  });

  test("applies hover styles", () => {
    render(
      <Table>
        <TableBody>
          <TableRow data-testid="row">
            <TableCell>Cell</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    expect(screen.getByTestId("row")).toHaveClass("hover:bg-muted/50");
  });
});

describe("TableHead", () => {
  test("renders th element", () => {
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead data-testid="head">Header</TableHead>
          </TableRow>
        </TableHeader>
      </Table>,
    );

    expect(screen.getByTestId("head").tagName).toBe("TH");
  });

  test("has table-head data-slot attribute", () => {
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead data-testid="head">Header</TableHead>
          </TableRow>
        </TableHeader>
      </Table>,
    );

    expect(screen.getByTestId("head")).toHaveAttribute("data-slot", "table-head");
  });

  test("applies header styles", () => {
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead data-testid="head">Header</TableHead>
          </TableRow>
        </TableHeader>
      </Table>,
    );

    const head = screen.getByTestId("head");
    expect(head).toHaveClass("font-medium");
    expect(head).toHaveClass("text-foreground");
  });
});

describe("TableCell", () => {
  test("renders td element", () => {
    render(
      <Table>
        <TableBody>
          <TableRow>
            <TableCell data-testid="cell">Cell content</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    expect(screen.getByTestId("cell").tagName).toBe("TD");
  });

  test("has table-cell data-slot attribute", () => {
    render(
      <Table>
        <TableBody>
          <TableRow>
            <TableCell data-testid="cell">Cell</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    expect(screen.getByTestId("cell")).toHaveAttribute("data-slot", "table-cell");
  });

  test("applies padding styles", () => {
    render(
      <Table>
        <TableBody>
          <TableRow>
            <TableCell data-testid="cell">Cell</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    expect(screen.getByTestId("cell")).toHaveClass("p-2");
  });
});

describe("TableCaption", () => {
  test("renders caption element", () => {
    render(
      <Table>
        <TableCaption data-testid="caption">Table caption</TableCaption>
        <TableBody>
          <TableRow>
            <TableCell>Cell</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    expect(screen.getByTestId("caption").tagName).toBe("CAPTION");
  });

  test("has table-caption data-slot attribute", () => {
    render(
      <Table>
        <TableCaption data-testid="caption">Caption</TableCaption>
        <TableBody>
          <TableRow>
            <TableCell>Cell</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    expect(screen.getByTestId("caption")).toHaveAttribute("data-slot", "table-caption");
  });
});

describe("Table composition", () => {
  test("renders full table with all subcomponents", () => {
    render(
      <Table>
        <TableCaption>A list of items</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Value</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Item 1</TableCell>
            <TableCell>100</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Item 2</TableCell>
            <TableCell>200</TableCell>
          </TableRow>
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell>Total</TableCell>
            <TableCell>300</TableCell>
          </TableRow>
        </TableFooter>
      </Table>,
    );

    expect(screen.getByText("A list of items")).toBeInTheDocument();
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Value")).toBeInTheDocument();
    expect(screen.getByText("Item 1")).toBeInTheDocument();
    expect(screen.getByText("Item 2")).toBeInTheDocument();
    expect(screen.getByText("Total")).toBeInTheDocument();
  });
});
