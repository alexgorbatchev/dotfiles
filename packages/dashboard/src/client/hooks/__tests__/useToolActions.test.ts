import { act, renderHook, setupUITests } from "../../../testing/ui-setup";

import { afterEach, expect, mock, test } from "bun:test";

import { ToolActionsProvider } from "../../components/ToolActionsProvider";
import { useToolActions } from "../useToolActions";

setupUITests();
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("requires the shared operation owner", () => {
  expect(() => renderHook(() => useToolActions())).toThrow("useToolActions requires ToolActionsProvider");
});

test("all consumers see the same pending operation and retained result", async () => {
  const response = Promise.withResolvers<Response>();
  const fetchMock = mock(() => response.promise);
  globalThis.fetch = Object.assign(fetchMock, { preconnect: () => {} }) as typeof fetch;
  const { result } = renderHook(() => ({ first: useToolActions(), second: useToolActions() }), {
    wrapper: ToolActionsProvider,
  });
  let request = Promise.resolve();
  act(() => {
    request = result.current.first.installTool("bat", false);
  });
  expect(result.current.second.pending?.toolName).toBe("bat");
  await act(async () => {
    response.resolve(new Response(JSON.stringify({ success: true, data: { installed: true, version: "1.0" } })));
    await request;
  });
  expect(result.current.first).toBe(result.current.second);
  expect(result.current.second.results[0]?.outcome.message).toBe("Installed 1.0");
});
