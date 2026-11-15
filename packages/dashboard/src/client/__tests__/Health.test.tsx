import { fireEvent, render, screen, setupUITests } from "../../testing/ui-setup";

import { afterEach, describe, expect, mock, test } from "bun:test";
import { invalidateFetches } from "../invalidateFetches";
import { Health } from "../templates/Health";

setupUITests();
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function healthyResponse(): Response {
  return new Response(
    JSON.stringify({
      success: true,
      data: {
        overall: "healthy",
        lastCheck: "2026-11-14T12:00:00Z",
        checks: [{ name: "Registry Integrity", status: "pass", message: "Registry is healthy", details: [] }],
      },
    }),
  );
}

describe("Health request state", () => {
  test("failed requests show retry, then recover without inventing health", async () => {
    const request = mock(async () => healthyResponse()).mockRejectedValueOnce(new Error("Network unavailable"));
    globalThis.fetch = Object.assign(request, { preconnect: () => {} }) as typeof fetch;
    render(<Health />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("Health checks could not be loaded.")).toBeTruthy();
    expect(screen.queryByText("Unknown")).toBeNull();
    expect(screen.queryByText("Registry is healthy")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry health checks" }));
    expect(await screen.findByText("Registry is healthy")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(request).toHaveBeenCalledTimes(2);
  });

  test("a failed refresh labels retained health as last known", async () => {
    const request = mock(async () => healthyResponse());
    globalThis.fetch = Object.assign(request, { preconnect: () => {} }) as typeof fetch;
    render(<Health />);
    expect(await screen.findByText("Registry is healthy")).toBeTruthy();
    request.mockRejectedValueOnce(new Error("Server unavailable"));
    invalidateFetches("/health");
    expect(await screen.findByText("Last known: healthy")).toBeTruthy();
    expect(screen.getByText("Showing previously loaded data. It may be out of date.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry health checks" })).toBeTruthy();
  });
  test("warnings and failures preserve their diagnostic detail", async () => {
    const detail = "Tool example: missing installed binary /a/long/installation/path/example";
    globalThis.fetch = Object.assign(
      mock(
        async () =>
          new Response(
            JSON.stringify({
              success: true,
              data: {
                overall: "unhealthy",
                lastCheck: "2026-11-14T12:00:00Z",
                checks: [
                  { name: "Binaries", status: "warn", message: "Missing installed binary", details: [detail] },
                  { name: "Registry", status: "fail", message: "Registry inspection failed", details: [] },
                ],
              },
            }),
          ),
      ),
      { preconnect: () => {} },
    ) as typeof fetch;
    render(<Health />);
    expect(await screen.findByRole("heading", { name: "unhealthy" })).toBeTruthy();
    expect(screen.getByText(detail)).toBeTruthy();
    expect(screen.getByText("Registry inspection failed")).toBeTruthy();
    expect(screen.queryByText("healthy", { exact: true })).toBeNull();
  });
});
