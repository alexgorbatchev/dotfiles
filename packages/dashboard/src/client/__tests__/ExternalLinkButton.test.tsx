import { render, screen, setupUITests } from "../../testing/ui-setup";

import { expect, test } from "bun:test";
import { ExternalLinkButton } from "../components/ui/ExternalLinkButton";

setupUITests();

test("external links remain one native link with safe new-tab attributes", () => {
  const { container } = render(
    <ExternalLinkButton href="https://example.com/project">Project homepage</ExternalLinkButton>,
  );
  const link = screen.getByRole("link", { name: "Project homepage" });
  expect(link).toHaveAttribute("href", "https://example.com/project");
  expect(link).toHaveAttribute("target", "_blank");
  expect(link).toHaveAttribute("rel", "noopener noreferrer");
  expect(container.querySelector("button")).toBeNull();
});
