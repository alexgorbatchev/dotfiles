// UI test setup - registers DOM and exports testing utilities
import { render, screen, setupUITests } from "../../testing/ui-setup";

import { describe, expect, test } from "bun:test";

setupUITests();

import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";

describe("Card", () => {
  test("renders children", () => {
    render(<Card>Card content</Card>);

    expect(screen.getByText("Card content")).toBeInTheDocument();
  });

  test("has card data-slot attribute", () => {
    render(<Card data-testid="card">Content</Card>);

    expect(screen.getByTestId("card")).toHaveAttribute("data-slot", "card");
  });

  test("applies default styles", () => {
    render(<Card data-testid="card">Styled</Card>);

    const card = screen.getByTestId("card");
    expect(card).toHaveClass("bg-card");
    expect(card).toHaveClass("rounded-xl");
    expect(card).toHaveClass("border");
  });

  test("merges custom className", () => {
    render(
      <Card class="custom-class" data-testid="card">
        Custom
      </Card>,
    );

    expect(screen.getByTestId("card")).toHaveClass("custom-class");
  });
});

describe("CardHeader", () => {
  test("renders children", () => {
    render(<CardHeader>Header content</CardHeader>);

    expect(screen.getByText("Header content")).toBeInTheDocument();
  });

  test("has card-header data-slot attribute", () => {
    render(<CardHeader data-testid="header">Content</CardHeader>);

    expect(screen.getByTestId("header")).toHaveAttribute("data-slot", "card-header");
  });

  test("applies default styles", () => {
    render(<CardHeader data-testid="header">Styled</CardHeader>);

    const header = screen.getByTestId("header");
    expect(header).toHaveClass("px-6");
  });
});

describe("CardTitle", () => {
  test("renders children", () => {
    render(<CardTitle>Title text</CardTitle>);

    expect(screen.getByText("Title text")).toBeInTheDocument();
  });

  test("has card-title data-slot attribute", () => {
    render(<CardTitle data-testid="title">Title</CardTitle>);

    expect(screen.getByTestId("title")).toHaveAttribute("data-slot", "card-title");
  });

  test("applies title styles", () => {
    render(<CardTitle data-testid="title">Styled</CardTitle>);

    const title = screen.getByTestId("title");
    expect(title).toHaveClass("text-lg");
    expect(title).toHaveClass("font-bold");
  });
});

describe("Card composition", () => {
  test("renders full card with all subcomponents", () => {
    render(
      <Card data-testid="full-card">
        <CardHeader>
          <CardTitle>Card Title</CardTitle>
        </CardHeader>
        <CardContent>Main content area</CardContent>
      </Card>,
    );

    expect(screen.getByText("Card Title")).toBeInTheDocument();
    expect(screen.getByText("Main content area")).toBeInTheDocument();
  });
});
