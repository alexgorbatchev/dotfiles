import { act, fireEvent, render, screen, setupUITests, waitFor } from "../../testing/ui-setup";

import { afterEach, expect, mock, test } from "bun:test";

import type { JSX } from "preact";
import { LocationProvider, Route, Router } from "preact-iso";

import { useToolActions } from "../hooks/useToolActions";
import { ToolActionsProvider } from "../components/ToolActionsProvider";

function ActionPage(): JSX.Element {
  const actions = useToolActions();
  return (
    <>
      <a href="/other">Browse another page</a>
      <button type="button" onClick={() => actions.installTool("bat", false)}>
        Start installation
      </button>
    </>
  );
}

function OtherPage(): JSX.Element {
  return <h1>Other page</h1>;
}

function NavigationHarness(): JSX.Element {
  return (
    <LocationProvider>
      <ToolActionsProvider>
        <Router>
          <Route path="/" component={ActionPage} />
          <Route path="/other" component={OtherPage} />
        </Router>
      </ToolActionsProvider>
    </LocationProvider>
  );
}

setupUITests();
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  window.location.href = "http://localhost/";
});

test("a held request and its result survive navigation away from the initiating route", async () => {
  window.location.href = "http://localhost/";
  const response = Promise.withResolvers<Response>();
  const fetchMock = mock(() => response.promise);
  globalThis.fetch = Object.assign(fetchMock, { preconnect: () => {} }) as typeof fetch;
  render(<NavigationHarness />);
  fireEvent.click(screen.getByRole("button", { name: "Start installation" }));
  expect(screen.getByRole("status").textContent).toBe("Installing bat. Waiting for the server.");
  fireEvent.click(screen.getByRole("link", { name: "Browse another page" }), { button: 0 });
  await screen.findByRole("heading", { name: "Other page" });
  expect(screen.queryByRole("button", { name: "Start installation" })).toBeNull();
  expect(screen.getByRole("status").textContent).toBe("Installing bat. Waiting for the server.");
  await act(async () => {
    response.resolve(new Response(JSON.stringify({ success: true, data: { installed: true, version: "2.0" } })));
  });
  await waitFor(() => expect(screen.getByText("Installed 2.0")).toBeInTheDocument());
  expect(screen.getByRole("heading", { name: "Other page" })).toBeInTheDocument();
  expect(window.location.pathname).toBe("/other");
  expect(screen.queryByRole("timer")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
  expect(screen.queryByRole("region", { name: "Tool operations" })).toBeNull();
});
