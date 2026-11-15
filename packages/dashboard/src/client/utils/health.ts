import type { IHealthFinding } from "../../shared/types";

export function healthFindingId(checkId: string, finding: IHealthFinding): string {
  return `finding-${JSON.stringify([checkId, finding.kind, finding.toolName, finding.path])}`;
}

type HealthGuidance = { title: string; impact: string; next: string };

export const healthFindingGuidance: Record<IHealthFinding["kind"], HealthGuidance> = {
  "missing-binary": {
    title: "Installed binary missing",
    impact: "The recorded executable is missing. Commands that depend on it may fail.",
    next: "Inspect the path and tool configuration. If the installation is still wanted, review Force reinstall under the tool’s More actions.",
  },
  "missing-installation": {
    title: "Installation directory missing",
    impact: "An installation is recorded, but its directory is gone. The tool or plugin may be unavailable.",
    next: "Check the project paths and tool configuration before reinstalling. For a tool you still need, review Force reinstall under More actions.",
  },
  "unused-version": {
    title: "Unused version directory",
    impact: "This directory uses disk space but is not the recorded active version.",
    next: "Inspect the directory and confirm that nothing else uses it before removing it. This page does not delete files.",
  },
};
