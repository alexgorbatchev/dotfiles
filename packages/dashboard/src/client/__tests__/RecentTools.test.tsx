import { act, fireEvent, render, screen, setupUITests } from "../../testing/ui-setup";

import { afterEach, expect, spyOn, test } from "bun:test";
import { RecentTools } from "../components/RecentTools";
import { invalidateFetches } from "../invalidateFetches";
import type { IRecentTools } from "../../shared/types";

setupUITests();
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("distinguishes failed recent activity from successful empty activity", async () => {
  const fetchMock = spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Offline"));
  render(<RecentTools />);
  await screen.findByRole("alert");
  expect(screen.queryByText("No tools added yet")).toBeNull();
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: { tools: [] } })));
  fireEvent.click(screen.getByRole("button", { name: "Retry recent tools" }));
  await screen.findByText("No tools added yet");
  expect(screen.queryByRole("alert")).toBeNull();
});

test("keeps recent tool links and timestamp provenance visible when a refresh fails", async () => {
  const data: IRecentTools = {
    tools: [
      {
        name: "shell/theme",
        configFilePath: "/tools/theme.tool.ts",
        relativeTime: "2 hours ago",
        timestampSource: "git",
      },
      {
        name: "editor",
        configFilePath: "/tools/editor.tool.ts",
        relativeTime: "3 hours ago",
        timestampSource: "mtime",
      },
    ],
  };
  const fetchMock = spyOn(globalThis, "fetch").mockResolvedValueOnce(
    new Response(JSON.stringify({ success: true, data })),
  );
  render(<RecentTools returnTo="/?q=shell&status=installed" />);
  const themeLink = await screen.findByRole("link", { name: /shell\/theme/ });
  expect(themeLink.getAttribute("href")).toBe("/tools/shell%2Ftheme?returnTo=%2F%3Fq%3Dshell%26status%3Dinstalled");
  expect(screen.getByTitle("From git commit date")).toBeInTheDocument();
  expect(screen.getByTitle("From file modification time")).toBeInTheDocument();
  fetchMock.mockRejectedValueOnce(new Error("Refresh unavailable"));
  act(() => invalidateFetches("/recent-tools"));
  await screen.findByRole("alert");
  expect(screen.getByText("Showing previously loaded data. It may be out of date.")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /shell\/theme/ })).toBe(themeLink);
  expect(screen.getByRole("link", { name: /editor/ }).getAttribute("href")).toBe(
    "/tools/editor?returnTo=%2F%3Fq%3Dshell%26status%3Dinstalled",
  );
  expect(screen.queryByText("No tools added yet")).toBeNull();
});
