import { render, screen, setupUITests } from "../../testing/ui-setup";
import { expect, test } from "bun:test";
import type { IHealthCheckResult } from "../../shared/types";
import { ToolHealth } from "../components/ToolHealth";
import { fixture_health, fixture_tool } from "./fixtures";
import { healthFindingId } from "../utils/health";

setupUITests();

test("links exact tool identity to its structured finding without parsing diagnostic text", () => {
  const finding = {
    kind: "missing-installation" as const,
    toolName: "plugin / 100%",
    path: "/home/a path/plugin",
    severity: "warning" as const,
    configured: true,
  };
  const tool = { ...fixture_tool, config: { name: finding.toolName, installationMethod: "zsh-plugin" } };
  const health = {
    ...fixture_health,
    checks: [
      {
        id: "registry-integrity",
        name: "Registry",
        status: "warn" as const,
        message: "Localized diagnostic",
        findings: [finding],
      },
    ],
  };
  render(<ToolHealth tool={tool} health={health} stale={false} />);
  expect(screen.getByRole("link", { name: "Health: needs attention · 1 finding" })).toHaveAttribute(
    "href",
    `/health#${encodeURIComponent(healthFindingId("registry-integrity", finding))}`,
  );
});

test.each([
  {
    health: { ...fixture_health, checks: [] as IHealthCheckResult[] },
    stale: false,
    tool: fixture_tool,
    text: "Health: unknown · path checks incomplete",
  },
  { health: null, stale: false, tool: fixture_tool, text: "Health: unknown · not checked" },
  { health: fixture_health, stale: true, tool: fixture_tool, text: "Health: unknown · recheck needed" },
  { health: fixture_health, stale: false, tool: fixture_tool, text: "Health: recorded paths present" },
  {
    health: fixture_health,
    stale: false,
    tool: { ...fixture_tool, runtime: { ...fixture_tool.runtime, status: "not-installed" as const } },
    text: "Health: no installation to check",
  },
  {
    health: fixture_health,
    stale: false,
    tool: { ...fixture_tool, runtime: { ...fixture_tool.runtime, installPath: null, binaryPaths: null } },
    text: "Health: no recorded paths to check",
  },
])("reports only the observation available: $text", ({ health, stale, tool, text }) => {
  render(<ToolHealth tool={tool} health={health} stale={stale} />);
  expect(screen.getByText(text)).toBeInTheDocument();
  expect(screen.queryByRole("link")).toBeNull();
});
