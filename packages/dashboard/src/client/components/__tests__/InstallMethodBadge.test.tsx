// UI test setup - registers DOM and exports testing utilities
import { render, screen, setupUITests } from "../../../testing/ui-setup";

import { describe, expect, test } from "bun:test";

setupUITests();

import { InstallMethodBadge } from "../InstallMethodBadge";

describe("InstallMethodBadge", () => {
  test("renders github-release method with icon", () => {
    render(<InstallMethodBadge method="github-release" />);

    expect(screen.getByText("github-release")).toBeInTheDocument();
  });

  test("renders homebrew method", () => {
    render(<InstallMethodBadge method="homebrew" />);

    expect(screen.getByText("homebrew")).toBeInTheDocument();
  });

  test("renders brew method", () => {
    render(<InstallMethodBadge method="brew" />);

    expect(screen.getByText("brew")).toBeInTheDocument();
  });

  test("renders cargo method", () => {
    render(<InstallMethodBadge method="cargo" />);

    expect(screen.getByText("cargo")).toBeInTheDocument();
  });

  test("renders curl-tar method", () => {
    render(<InstallMethodBadge method="curl-tar" />);

    expect(screen.getByText("curl-tar")).toBeInTheDocument();
  });

  test("renders curl-script method", () => {
    render(<InstallMethodBadge method="curl-script" />);

    expect(screen.getByText("curl-script")).toBeInTheDocument();
  });

  test("renders zsh-plugin method", () => {
    render(<InstallMethodBadge method="zsh-plugin" />);

    expect(screen.getByText("zsh-plugin")).toBeInTheDocument();
  });

  test("renders manual method", () => {
    render(<InstallMethodBadge method="manual" />);

    expect(screen.getByText("manual")).toBeInTheDocument();
  });

  test("renders unknown method with default icon", () => {
    render(<InstallMethodBadge method="custom-method" />);

    expect(screen.getByText("custom-method")).toBeInTheDocument();
  });

  test("renders badge with icon and text", () => {
    const { container } = render(<InstallMethodBadge method="homebrew" />);

    // Badge should contain both an SVG icon and the method text
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(screen.getByText("homebrew")).toBeInTheDocument();
  });

  test("renders github-release:cli when ghCli is true", () => {
    render(<InstallMethodBadge method="github-release" ghCli={true} />);

    expect(screen.getByText("github-release:cli")).toBeInTheDocument();
  });

  test("renders github-release when ghCli is false", () => {
    render(<InstallMethodBadge method="github-release" ghCli={false} />);

    expect(screen.getByText("github-release")).toBeInTheDocument();
  });

  test("ignores ghCli for non-github-release methods", () => {
    render(<InstallMethodBadge method="homebrew" ghCli={true} />);

    expect(screen.getByText("homebrew")).toBeInTheDocument();
  });
});
