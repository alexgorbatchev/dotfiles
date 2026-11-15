// UI test setup - registers DOM and exports testing utilities
import { fireEvent, render, screen, setupUITests } from "../../testing/ui-setup";

import { describe, expect, mock, test } from "bun:test";

setupUITests();

import { Button } from "../components/ui/Button";

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
    expect(button).toHaveClass("min-h-11", "sm:min-h-9");
  });

  test("applies small size styles", () => {
    render(<Button size="sm">Small</Button>);

    const button = screen.getByRole("button");
    expect(button).toHaveClass("min-h-11", "sm:min-h-8");
  });

  test("applies large size styles", () => {
    render(<Button size="lg">Large</Button>);

    const button = screen.getByRole("button");
    expect(button).toHaveClass("min-h-11");
  });

  test("applies icon size styles", () => {
    render(<Button size="icon">Icon</Button>);

    const button = screen.getByRole("button");
    expect(button).toHaveClass("size-11", "sm:size-9");
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
  test("renders a single native link with composed styles and event handlers", () => {
    const buttonClick = mock(() => {});
    const linkClick = mock(() => {});
    let cancelledByComponent = true;
    const { container } = render(
      <div
        onClick={(event) => {
          cancelledByComponent = event.defaultPrevented;
          event.preventDefault(); // Keep native navigation inside the test harness.
        }}
      >
        <Button asChild variant="outline" onClick={buttonClick} class="wrapper-style">
          <a href="/tools/bat" class="link-style" target="_blank" rel="noopener noreferrer" onClick={linkClick}>
            Open bat
          </a>
        </Button>
      </div>,
    );
    const link = screen.getByRole("link", { name: "Open bat" });
    expect(link).toHaveAttribute("href", "/tools/bat");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveClass("wrapper-style", "link-style", "border");
    expect(container.querySelector("button")).toBeNull();
    fireEvent.click(link, { ctrlKey: true });
    expect(cancelledByComponent).toBe(false);
    expect(buttonClick).toHaveBeenCalledTimes(1);
    expect(linkClick).toHaveBeenCalledTimes(1);
  });

  test("respects a child handler that cancels the action", () => {
    const parentClick = mock(() => {});
    render(
      <Button asChild onClick={parentClick}>
        <a href="/tools/bat" onClick={(event) => event.preventDefault()}>
          Open bat
        </a>
      </Button>,
    );
    expect(fireEvent.click(screen.getByRole("link"))).toBe(false);
    expect(parentClick).not.toHaveBeenCalled();
  });

  test("disabled slotted links cannot navigate or invoke either handler", () => {
    const parentClick = mock(() => {});
    const childClick = mock(() => {});
    render(
      <Button asChild disabled onClick={parentClick}>
        <a href="/tools/bat" onClick={childClick}>
          Open bat
        </a>
      </Button>,
    );
    const link = screen.getByText("Open bat");
    expect(link).not.toHaveAttribute("href");
    expect(link).toHaveAttribute("aria-disabled", "true");
    expect(link).toHaveAttribute("tabindex", "-1");
    fireEvent.click(link);
    expect(parentClick).not.toHaveBeenCalled();
    expect(childClick).not.toHaveBeenCalled();
  });

  test("does not accidentally submit a surrounding form", () => {
    render(
      <form>
        <Button>Run action</Button>
      </form>,
    );
    expect(screen.getByRole("button")).toHaveAttribute("type", "button");
  });
});
