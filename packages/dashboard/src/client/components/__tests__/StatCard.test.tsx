// UI test setup - registers DOM and exports testing utilities
import { render, screen, setupUITests } from "../../../testing/ui-setup";

import { describe, expect, test } from "bun:test";

setupUITests();

import { StatCard } from "../StatCard";

describe("StatCard", () => {
  test("renders value", () => {
    render(<StatCard value={42} label="Items" />);

    expect(screen.getByText("42")).toBeInTheDocument();
  });

  test("renders string value", () => {
    render(<StatCard value="N/A" label="Status" />);

    expect(screen.getByText("N/A")).toBeInTheDocument();
  });

  test("renders label", () => {
    render(<StatCard value={10} label="Total Count" />);

    expect(screen.getByText("Total Count")).toBeInTheDocument();
  });

  test("applies default text color", () => {
    render(<StatCard value={5} label="Default" />);

    const value = screen.getByText("5");
    expect(value).toHaveClass("text-foreground");
  });

  test("applies custom color", () => {
    render(<StatCard value={100} label="Success" color="text-green-500" />);

    const value = screen.getByText("100");
    expect(value).toHaveClass("text-green-500");
  });

  test("applies value styles", () => {
    render(<StatCard value={25} label="Count" />);

    const value = screen.getByText("25");
    expect(value).toHaveClass("text-3xl");
    expect(value).toHaveClass("font-bold");
  });

  test("applies label styles", () => {
    render(<StatCard value={0} label="Empty" />);

    const label = screen.getByText("Empty");
    expect(label).toHaveClass("text-muted-foreground");
    expect(label).toHaveClass("text-sm");
  });

  test("renders inside a card", () => {
    const { container } = render(<StatCard value={1} label="Test" />);

    const card = container.querySelector('[data-slot="card"]');
    expect(card).toBeInTheDocument();
    expect(card).toHaveClass("text-center");
  });
});
