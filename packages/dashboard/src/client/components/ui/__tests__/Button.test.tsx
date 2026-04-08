// UI test setup - registers DOM and exports testing utilities
import { fireEvent, render, screen, setupUITests } from "../../../../testing/ui-setup";

import { describe, expect, mock, test } from "bun:test";

setupUITests();

import { Button } from "../Button";

describe("Button", () => {
  test("renders children", () => {
    render(<Button>Click me</Button>);

    expect(screen.getByText("Click me")).toBeInTheDocument();
  });

  test("has button data-slot attribute", () => {
    render(<Button>Slotted</Button>);

    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("data-slot", "button");
  });

  test("applies default variant styles", () => {
    render(<Button>Default</Button>);

    const button = screen.getByRole("button");
    expect(button).toHaveClass("bg-primary");
  });

  test("applies destructive variant styles", () => {
    render(<Button variant="destructive">Destructive</Button>);

    const button = screen.getByRole("button");
    expect(button).toHaveClass("bg-destructive");
  });

  test("applies outline variant styles", () => {
    render(<Button variant="outline">Outline</Button>);

    const button = screen.getByRole("button");
    expect(button).toHaveClass("border");
    expect(button).toHaveClass("bg-background");
  });

  test("applies secondary variant styles", () => {
    render(<Button variant="secondary">Secondary</Button>);

    const button = screen.getByRole("button");
    expect(button).toHaveClass("bg-secondary");
  });

  test("applies ghost variant styles", () => {
    render(<Button variant="ghost">Ghost</Button>);

    const button = screen.getByRole("button");
    expect(button).toHaveClass("hover:bg-accent");
  });

  test("applies link variant styles", () => {
    render(<Button variant="link">Link</Button>);

    const button = screen.getByRole("button");
    expect(button).toHaveClass("text-primary");
    expect(button).toHaveClass("underline-offset-4");
  });

  test("applies default size styles", () => {
    render(<Button>Default Size</Button>);

    const button = screen.getByRole("button");
    expect(button).toHaveClass("h-9");
  });

  test("applies small size styles", () => {
    render(<Button size="sm">Small</Button>);

    const button = screen.getByRole("button");
    expect(button).toHaveClass("h-8");
  });

  test("applies large size styles", () => {
    render(<Button size="lg">Large</Button>);

    const button = screen.getByRole("button");
    expect(button).toHaveClass("h-10");
  });

  test("applies icon size styles", () => {
    render(<Button size="icon">Icon</Button>);

    const button = screen.getByRole("button");
    expect(button).toHaveClass("size-9");
  });

  test("handles click events", () => {
    const handleClick = mock(() => {});
    render(<Button onClick={handleClick}>Clickable</Button>);

    fireEvent.click(screen.getByRole("button"));

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  test("merges custom className", () => {
    render(<Button class="custom-class">Custom</Button>);

    const button = screen.getByRole("button");
    expect(button).toHaveClass("custom-class");
  });

  test("passes additional props to element", () => {
    render(<Button data-testid="custom-button">Props Test</Button>);

    expect(screen.getByTestId("custom-button")).toBeInTheDocument();
  });
});
