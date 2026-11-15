import { fireEvent, render, screen, setupUITests, waitFor } from "../../testing/ui-setup";

import { describe, expect, mock, spyOn, test } from "bun:test";

import { OperationStatus } from "../components/OperationStatus";
import { fixture_failedResult, fixture_idleActions } from "./fixtures";

setupUITests();

describe("OperationStatus", () => {
  test("is absent when idle without results", () => {
    const { container } = render(<OperationStatus actions={fixture_idleActions} />);
    expect(container.firstChild).toBeNull();
  });

  test("names the pending action and tool without inventing progress", () => {
    render(
      <OperationStatus
        actions={{
          ...fixture_idleActions,
          pending: { toolName: "bat", kind: "install", force: true, startedAt: Date.now() - 17000 },
        }}
      />,
    );
    expect(screen.getByRole("status").textContent).toBe("Reinstalling bat. Waiting for the server.");
    expect(screen.getByRole("timer").textContent).toBe("17s elapsed");
    expect(screen.getByRole("timer")).toHaveAttribute("aria-live", "off");
    expect(
      screen.getByText(
        "Other actions in this dashboard tab are paused until this operation finishes. You can keep browsing.",
      ),
    ).toBeInTheDocument();
  });

  test("retains results with independent retry and dismissal", () => {
    const retryResult = mock(async () => {});
    const dismissResult = mock(() => {});
    render(
      <OperationStatus
        actions={{ ...fixture_idleActions, results: [fixture_failedResult], retryResult, dismissResult }}
      />,
    );
    expect(screen.getByText("1 operation result")).toBeInTheDocument();
    expect(screen.getByText("Completed in 2s")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retryResult).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(dismissResult).toHaveBeenCalledWith(1);
  });

  test("advances elapsed time and stops its timer when the operation finishes", async () => {
    const clearTimer = spyOn(globalThis, "clearInterval");
    try {
      const { rerender } = render(
        <OperationStatus
          actions={{
            ...fixture_idleActions,
            pending: { toolName: "bat", kind: "update", startedAt: Date.now() },
          }}
        />,
      );
      expect(screen.getByRole("timer").textContent).toBe("0s elapsed");
      await waitFor(() => expect(screen.getByRole("timer").textContent).not.toBe("0s elapsed"), { timeout: 2500 });
      clearTimer.mockClear();
      rerender(<OperationStatus actions={fixture_idleActions} />);
      expect(screen.queryByRole("timer")).not.toBeInTheDocument();
      expect(clearTimer).toHaveBeenCalledTimes(1);
    } finally {
      clearTimer.mockRestore();
    }
  });
});
