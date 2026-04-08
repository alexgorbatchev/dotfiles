// UI test setup - registers DOM and exports testing utilities
import { render, screen, setupUITests } from "../../../../testing/ui-setup";

import { describe, expect, test } from "bun:test";

setupUITests();

import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../Card";

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

describe("CardDescription", () => {
  test("renders children", () => {
    render(<CardDescription>Description text</CardDescription>);

    expect(screen.getByText("Description text")).toBeInTheDocument();
  });

  test("has card-description data-slot attribute", () => {
    render(<CardDescription data-testid="desc">Description</CardDescription>);

    expect(screen.getByTestId("desc")).toHaveAttribute("data-slot", "card-description");
  });

  test("applies muted text styles", () => {
    render(<CardDescription data-testid="desc">Styled</CardDescription>);

    const desc = screen.getByTestId("desc");
    expect(desc).toHaveClass("text-muted-foreground");
    expect(desc).toHaveClass("text-sm");
  });
});

describe("CardAction", () => {
  test("renders children", () => {
    render(<CardAction>Action content</CardAction>);

    expect(screen.getByText("Action content")).toBeInTheDocument();
  });

  test("has card-action data-slot attribute", () => {
    render(<CardAction data-testid="action">Action</CardAction>);

    expect(screen.getByTestId("action")).toHaveAttribute("data-slot", "card-action");
  });
});

describe("CardContent", () => {
  test("renders children", () => {
    render(<CardContent>Content area</CardContent>);

    expect(screen.getByText("Content area")).toBeInTheDocument();
  });

  test("has card-content data-slot attribute", () => {
    render(<CardContent data-testid="content">Content</CardContent>);

    expect(screen.getByTestId("content")).toHaveAttribute("data-slot", "card-content");
  });

  test("applies padding styles", () => {
    render(<CardContent data-testid="content">Styled</CardContent>);

    expect(screen.getByTestId("content")).toHaveClass("px-6");
  });
});

describe("CardFooter", () => {
  test("renders children", () => {
    render(<CardFooter>Footer content</CardFooter>);

    expect(screen.getByText("Footer content")).toBeInTheDocument();
  });

  test("has card-footer data-slot attribute", () => {
    render(<CardFooter data-testid="footer">Footer</CardFooter>);

    expect(screen.getByTestId("footer")).toHaveAttribute("data-slot", "card-footer");
  });

  test("applies flex and padding styles", () => {
    render(<CardFooter data-testid="footer">Styled</CardFooter>);

    const footer = screen.getByTestId("footer");
    expect(footer).toHaveClass("flex");
    expect(footer).toHaveClass("px-6");
  });
});

describe("Card composition", () => {
  test("renders full card with all subcomponents", () => {
    render(
      <Card data-testid="full-card">
        <CardHeader>
          <CardTitle>Card Title</CardTitle>
          <CardDescription>Card description text</CardDescription>
          <CardAction>
            <button>Action</button>
          </CardAction>
        </CardHeader>
        <CardContent>Main content area</CardContent>
        <CardFooter>Footer area</CardFooter>
      </Card>,
    );

    expect(screen.getByText("Card Title")).toBeInTheDocument();
    expect(screen.getByText("Card description text")).toBeInTheDocument();
    expect(screen.getByText("Action")).toBeInTheDocument();
    expect(screen.getByText("Main content area")).toBeInTheDocument();
    expect(screen.getByText("Footer area")).toBeInTheDocument();
  });
});
