import { render, screen, setupUITests } from "../../testing/ui-setup";
import { describe, expect, test } from "bun:test";
import type { DriftState, IDriftItem } from "../../shared/types";
import { ToolDriftCard } from "../components/ToolDriftCard";

setupUITests();

describe("ToolDriftCard", () => {
  test("explains an undeclared tool without claiming synchronization", () => {
    render(<ToolDriftCard />);
    expect(screen.getByText("No files or managed blocks declared for this tool.")).toBeInTheDocument();
    expect(screen.queryByText("In sync")).not.toBeInTheDocument();
  });

  test("identifies synchronized files and managed blocks, then summarizes the verified count", () => {
    const driftItems: IDriftItem[] = [
      { toolName: "shell", filePath: "/home/test/.zshrc", blockId: "shell-init", type: "block", state: "in-sync" },
      { toolName: "shell", filePath: "/home/test/.config/shell", type: "symlink", state: "in-sync" },
    ];
    render(<ToolDriftCard driftItems={driftItems} />);
    expect(screen.getByRole("heading", { name: "/home/test/.zshrc" })).toBeInTheDocument();
    expect(screen.getByText("Managed block: shell-init")).toBeInTheDocument();
    expect(screen.getAllByText("In sync")).toHaveLength(2);
    expect(screen.getByText("All 2 declared artifact(s) match the current disk state.")).toBeInTheDocument();
  });

  test.each([
    [
      "new",
      "Not created yet",
      "There is no recorded base for this declaration, and the expected artifact is absent.",
      "Inspect the destination and desired content before generating; preserve any existing file at that path.",
    ],
    ["in-sync", "In sync", "The artifact on disk matches the current declaration.", "No changes are needed."],
    [
      "unmanaged",
      "Existing, unmanaged",
      "The path contains an artifact that is not recognized as the managed artifact for this declaration.",
      "Inspect and save the existing content before deciding whether dotfiles should manage it.",
    ],
    [
      "missing",
      "Managed artifact missing",
      "The previously recorded artifact is absent or has been replaced by a different kind of entry.",
      "Inspect the destination for a replacement or intentional removal before restoring the declared artifact.",
    ],
    [
      "upstream-update",
      "Declaration changed",
      "The declaration changed while the local artifact still matches the recorded base.",
      "Inspect the desired changes before generating the updated artifact.",
    ],
    [
      "local-drift",
      "Local changes",
      "The artifact on disk changed while the declaration still matches the recorded base.",
      "Review and preserve local edits before changing the declaration or generating again.",
    ],
    [
      "conflict",
      "Conflict — decision needed",
      "Both the local artifact and the declaration changed differently from the recorded base.",
      "Compare both sides and preserve local edits before choosing what to keep. Do not overwrite blindly.",
    ],
  ] as const)("explains %s and its safe next step", (state: DriftState, label, explanation, nextStep) => {
    render(<ToolDriftCard driftItems={[{ toolName: "shell", filePath: "/config", type: "copy", state }]} />);
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByText(explanation)).toBeInTheDocument();
    expect(screen.getByText(nextStep, { exact: false }).textContent).toBe(`Next step: ${nextStep}`);
    expect(screen.getAllByRole("button").map((button) => button.textContent?.trim())).toEqual(["Copy path"]);
  });

  test("shows literal diffs and available sides without inventing a base or an omitted side", () => {
    const diff = "--- current\n+++ desired\n-<script>local()</script>\n+managed";
    const driftItems: IDriftItem[] = [
      {
        toolName: "shell",
        filePath: "/config/template",
        type: "template",
        state: "conflict",
        diff,
        currentContent: "<script>local()</script>",
        desiredContent: "managed",
      },
      {
        toolName: "shell",
        filePath: "/config/copy",
        type: "copy",
        state: "local-drift",
        currentContent: "",
        desiredContent: "",
      },
      { toolName: "shell", filePath: "/config/new", type: "template", state: "new", desiredContent: "new declaration" },
      { toolName: "shell", filePath: "/config/old", type: "copy", state: "unmanaged", currentContent: "unmanaged" },
    ];
    const { container } = render(<ToolDriftCard driftItems={driftItems} />);
    expect(screen.getByLabelText("Changes for /config/template").textContent).toBe(diff);
    expect(container.querySelector("script")).toBeNull();
    expect(screen.getByLabelText("Local content for /config/template").textContent).toBe("<script>local()</script>");
    expect(screen.getByLabelText("Desired content for /config/template").textContent).toBe("managed");
    expect(screen.getByLabelText("Local content for /config/copy").textContent).toBe("(empty content)");
    expect(screen.getByLabelText("Desired content for /config/copy").textContent).toBe("(empty content)");
    expect(screen.queryByLabelText("Local content for /config/new")).toBeNull();
    expect(screen.queryByLabelText("Desired content for /config/old")).toBeNull();
    expect(
      screen.getByText(
        "4 of 4 declared artifact(s) differ from the desired state. Inspect the findings before generating changes.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("For read-only CLI inspection, run", { exact: false }).textContent).toBe(
      "For read-only CLI inspection, run dotfiles state diff with the same --config file used to start this dashboard. The recorded base content is not included in this view.",
    );
  });

  test("shows a symlink comparison as provided without implying the prose is a unified diff", () => {
    const diff = "Symlink target: /config/link -> /old (expected -> /new)\n";
    render(
      <ToolDriftCard
        driftItems={[
          {
            toolName: "shell",
            filePath: "/config/link",
            type: "symlink",
            state: "upstream-update",
            diff,
            currentContent: "/old",
            desiredContent: "/new",
          },
        ]}
      />,
    );
    expect(screen.getByLabelText("Changes for /config/link").textContent).toBe(diff);
    expect(screen.getByText("Comparison:", { exact: false }).textContent).toBe(
      "Comparison: local / current on disk → declaration / desired. In unified diffs, − marks local lines and + marks desired lines.",
    );
    expect(screen.getByLabelText("Local content for /config/link").textContent).toBe("/old");
    expect(screen.getByLabelText("Desired content for /config/link").textContent).toBe("/new");
  });
});
