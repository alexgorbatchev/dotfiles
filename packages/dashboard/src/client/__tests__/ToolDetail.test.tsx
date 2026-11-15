// UI test setup - registers DOM and exports testing utilities
import { act, fireEvent, render, screen, setupUITests } from "../../testing/ui-setup";

import assert from "node:assert";
import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { LocationProvider, Route, Router } from "preact-iso";
import { ToolDetail } from "../templates/ToolDetail";
import { ToolActionsProvider } from "../components/ToolActionsProvider";
import { invalidateFetches } from "../invalidateFetches";
import { fixture_configurationTool, fixture_emptyHistory, fixture_tool } from "./fixtures";

import type { ISerializableToolConfig, IToolDetail } from "../../shared/types";
import { getSourceInfo, type ISourceInfo } from "../utils/toolDetailUtils";

setupUITests();

function assertSourceInfo(sourceInfo: ISourceInfo | null): ISourceInfo {
  assert(sourceInfo !== null);
  return sourceInfo;
}

describe("ToolDetail getSourceDisplay rendering", () => {
  test("renders github-release source as link", () => {
    const config: ISerializableToolConfig = {
      name: "test",
      version: "latest",
      installationMethod: "github-release",
      installParams: { repo: "owner/repo" },
    };

    const sourceInfo = assertSourceInfo(getSourceInfo(config));

    render(
      <div>
        <a
          href={sourceInfo.url}
          target="_blank"
          rel="noopener noreferrer"
          class="text-sm text-blue-500 hover:underline break-all"
        >
          {sourceInfo.value}
        </a>
      </div>,
    );

    const link = screen.getByText("owner/repo");
    expect(link).toBeInTheDocument();
    expect(link.getAttribute("href")).toBe("https://github.com/owner/repo");
    expect(link.getAttribute("target")).toBe("_blank");
  });

  test("renders cargo source as link to crates.io", () => {
    const config: ISerializableToolConfig = {
      name: "test",
      version: "latest",
      installationMethod: "cargo",
      installParams: { crate: "my-crate" },
    };

    const sourceInfo = assertSourceInfo(getSourceInfo(config));

    render(<a href={sourceInfo.url}>{sourceInfo.value}</a>);

    const link = screen.getByText("my-crate");
    expect(link.getAttribute("href")).toBe("https://crates.io/crates/my-crate");
  });

  test("renders brew source as link to formulae.brew.sh", () => {
    const config: ISerializableToolConfig = {
      name: "test",
      version: "latest",
      installationMethod: "brew",
      installParams: { formula: "my-formula" },
    };

    const sourceInfo = assertSourceInfo(getSourceInfo(config));

    render(<a href={sourceInfo.url}>{sourceInfo.value}</a>);

    const link = screen.getByText("my-formula");
    expect(link.getAttribute("href")).toBe("https://formulae.brew.sh/formula/my-formula");
  });

  test("renders zsh-plugin source as GitHub link", () => {
    const config: ISerializableToolConfig = {
      name: "test",
      version: "latest",
      installationMethod: "zsh-plugin",
      installParams: { repo: "user/plugin" },
    };

    const sourceInfo = assertSourceInfo(getSourceInfo(config));

    render(<a href={sourceInfo.url}>{sourceInfo.value}</a>);

    const link = screen.getByText("user/plugin");
    expect(link.getAttribute("href")).toBe("https://github.com/user/plugin");
  });

  test("renders curl-script source as direct URL link", () => {
    const config: ISerializableToolConfig = {
      name: "test",
      version: "latest",
      installationMethod: "curl-script",
      installParams: { url: "https://example.com/install.sh" },
    };

    const sourceInfo = assertSourceInfo(getSourceInfo(config));

    render(<a href={sourceInfo.url}>{sourceInfo.value}</a>);

    const link = screen.getByText("https://example.com/install.sh");
    expect(link.getAttribute("href")).toBe("https://example.com/install.sh");
  });

  test("renders curl-tar source as direct URL link", () => {
    const config: ISerializableToolConfig = {
      name: "test",
      version: "latest",
      installationMethod: "curl-tar",
      installParams: { url: "https://example.com/archive.tar.gz" },
    };

    const sourceInfo = assertSourceInfo(getSourceInfo(config));

    render(<a href={sourceInfo.url}>{sourceInfo.value}</a>);

    const link = screen.getByText("https://example.com/archive.tar.gz");
    expect(link.getAttribute("href")).toBe("https://example.com/archive.tar.gz");
  });

  test("does not render source for manual installer", () => {
    const config: ISerializableToolConfig = {
      name: "test",
      version: "latest",
      installationMethod: "manual",
      installParams: {},
    };

    const sourceInfo = getSourceInfo(config);
    expect(sourceInfo).toBeNull();
  });
});

describe("ToolDetail dependency links rendering", () => {
  test("renders dependency as link with correct href", () => {
    const toolName = "fnm-tool";

    render(
      <a href={`/tools/${encodeURIComponent(toolName)}`} class="text-sm text-blue-500 hover:underline">
        {toolName}
      </a>,
    );

    const link = screen.getByText("fnm-tool");
    expect(link).toBeInTheDocument();
    expect(link.getAttribute("href")).toBe("/tools/fnm-tool");
  });

  test("encodes special characters in tool name for href", () => {
    const toolName = "tool/with/slashes";

    render(<a href={`/tools/${encodeURIComponent(toolName)}`}>{toolName}</a>);

    const link = screen.getByText("tool/with/slashes");
    expect(link.getAttribute("href")).toBe("/tools/tool%2Fwith%2Fslashes");
  });
});

describe("ToolDetail required by links rendering", () => {
  test("renders required by tool as link", () => {
    const dependentToolName = "dependent-tool";

    render(
      <a href={`/tools/${encodeURIComponent(dependentToolName)}`} class="text-sm text-blue-500 hover:underline">
        {dependentToolName}
      </a>,
    );

    const link = screen.getByText("dependent-tool");
    expect(link).toBeInTheDocument();
    expect(link.getAttribute("href")).toBe("/tools/dependent-tool");
  });
});

const originalFetch = globalThis.fetch;
const originalLocation = window.location.href;
afterEach(() => {
  globalThis.fetch = originalFetch;
  window.location.href = originalLocation;
});

type FetchInput = Parameters<typeof fetch>[0];

type RouteResponses = Record<string, () => Promise<Response>>;

function response(data: unknown): Response {
  return new Response(JSON.stringify({ success: true, data }));
}

function respondTo(routes: RouteResponses): void {
  spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(
      (input: FetchInput) =>
        routes[String(input)]?.() ?? Promise.reject(new Error(`Unexpected request: ${String(input)}`)),
      { preconnect: () => {} },
    ),
  );
}

describe("ToolDetail routing", () => {
  test.each(["percent%tool", "tool%20name"])(
    "preserves the literal tool name %s through the router",
    async (toolName) => {
      const encodedName = encodeURIComponent(toolName);
      const tool: IToolDetail = { ...fixture_tool, config: { ...fixture_tool.config, name: toolName } };
      const source = `defineTool("${toolName}")`;
      respondTo({
        "/api/tools": async () => response([tool]),
        [`/api/tools/${encodedName}/history`]: async () => response(fixture_emptyHistory),
        [`/api/tools/${encodedName}/source`]: async () =>
          response({ content: source, filePath: `/tools/${toolName}.tool.ts` }),
      });
      window.location.href = `http://localhost/tools/${encodedName}`;
      render(
        <LocationProvider>
          <ToolActionsProvider>
            <Router>{[<Route key="tool" path="/tools/:name" component={ToolDetail} />]}</Router>
          </ToolActionsProvider>
        </LocationProvider>,
      );

      expect(await screen.findByRole("heading", { name: toolName })).toBeInTheDocument();
      expect(await screen.findByText("No history recorded")).toBeInTheDocument();
      expect(await screen.findByText(source)).toBeInTheDocument();
      expect(screen.queryByRole("alert")).toBeNull();
    },
  );
});

describe("ToolDetail request states", () => {
  test("does not claim a tool is missing until the inventory successfully loads", async () => {
    const routes: RouteResponses = {
      "/api/tools": () => Promise.reject(new Error("Inventory unavailable")),
      "/api/tools/example/history": async () => response(fixture_emptyHistory),
    };
    respondTo(routes);
    render(
      <ToolActionsProvider>
        <ToolDetail params={{ name: "example" }} />
      </ToolActionsProvider>,
    );
    await screen.findByText("Inventory unavailable");
    expect(screen.queryByText("Tool not found")).toBeNull();
    routes["/api/tools"] = async () => response([]);
    fireEvent.click(screen.getByRole("button", { name: "Retry tools" }));
    await screen.findByText("Tool not found");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("shows valid tool details while optional history is pending or failed, and retries only that panel", async () => {
    const history = Promise.withResolvers<Response>();
    const routes: RouteResponses = {
      "/api/tools": async () => response([fixture_tool]),
      "/api/tools/example/history": () => history.promise,
      "/api/tools/example/source": () => Promise.reject(new Error("Source unavailable")),
    };
    respondTo(routes);
    render(
      <ToolActionsProvider>
        <ToolDetail params={{ name: "example" }} />
      </ToolActionsProvider>,
    );
    await screen.findByRole("heading", { name: "example" });
    await screen.findByText("Loading history…");
    await screen.findByText("Source unavailable");
    expect(screen.queryByText("No history recorded")).toBeNull();
    await act(async () => history.reject(new Error("History unavailable")));
    await screen.findByText("History unavailable");
    expect(screen.getByRole("heading", { name: "example" })).toBeInTheDocument();
    expect(screen.queryByText("No history recorded")).toBeNull();
    routes["/api/tools/example/history"] = async () => response(fixture_emptyHistory);
    fireEvent.click(screen.getByRole("button", { name: "Retry history" }));
    await screen.findByText("No history recorded");
    expect(screen.queryByText("History unavailable")).toBeNull();
    expect(screen.getByText("Source unavailable")).toBeInTheDocument();
  });
});

test("renders configuration-only tools with omitted installer fields", async () => {
  respondTo({
    "/api/tools": async () => response([fixture_configurationTool]),
    "/api/tools/configuration-only/history": async () => response(fixture_emptyHistory),
    "/api/tools/configuration-only/source": async () => response({ content: "", filePath: "" }),
  });
  render(
    <ToolActionsProvider>
      <ToolDetail params={{ name: "configuration-only" }} />
    </ToolActionsProvider>,
  );
  await screen.findByRole("heading", { name: "configuration-only" });
  expect(screen.getByText("No installer")).toBeInTheDocument();
  expect(screen.queryByText("Tool not found")).toBeNull();
});

test("keeps populated details and dependency navigation after an inventory refresh fails", async () => {
  const installedTool: IToolDetail = {
    ...fixture_tool,
    config: {
      ...fixture_tool.config,
      installationMethod: "github-release",
      installParams: { repo: "owner/example" },
      hostname: "workstation",
      dependencies: ["runtime-bin", "system-bin"],
    },
    binaryDiskSize: 2048,
    usage: { totalCount: 12, binaries: [{ binaryName: "example", count: 12, lastUsedAt: "2026-11-15T06:00:00Z" }] },
  };
  const dependency: IToolDetail = {
    ...fixture_tool,
    config: { name: "runtime/tool", binaries: [{ name: "runtime-bin" }] },
  };
  const dependent: IToolDetail = {
    ...fixture_tool,
    config: { name: "dependent/tool", dependencies: ["example"] },
  };
  const routes: RouteResponses = {
    "/api/tools": async () => response([installedTool, dependency, dependent]),
    "/api/tools/example/history": async () => response(fixture_emptyHistory),
    "/api/tools/example/source": async () => response({ content: "", filePath: "" }),
    "/api/tools/example/readme": async () => response({ content: "" }),
  };
  respondTo(routes);
  render(
    <ToolActionsProvider>
      <ToolDetail params={{ name: "example" }} />
    </ToolActionsProvider>,
  );
  await screen.findByRole("heading", { name: "example" });
  await screen.findByText("No history recorded");
  await screen.findByText("README not available");
  expect(screen.getByRole("link", { name: "owner/example" }).getAttribute("href")).toBe(
    "https://github.com/owner/example",
  );
  expect(screen.getByRole("link", { name: "runtime/tool" }).getAttribute("href")).toBe("/tools/runtime%2Ftool");
  expect(screen.getByRole("link", { name: "system-bin" }).getAttribute("href")).toBe("/tools/system-bin");
  expect(screen.getByRole("link", { name: "dependent/tool" }).getAttribute("href")).toBe("/tools/dependent%2Ftool");
  expect(screen.getByText("workstation")).toBeInTheDocument();
  expect(screen.getByText("2.0 KB")).toBeInTheDocument();
  expect(screen.getByText("12 runs")).toBeInTheDocument();
  expect(screen.getByText(/Last used/)).toBeInTheDocument();
  routes["/api/tools"] = () => Promise.reject(new Error("Refresh unavailable"));
  act(() => invalidateFetches("/tools"));
  await screen.findByText("Refresh unavailable");
  expect(screen.getByText("Showing previously loaded data. It may be out of date.")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "example" })).toBeInTheDocument();
  expect(screen.getByText("12 runs")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "runtime/tool" })).toBeInTheDocument();
  expect(screen.queryByText("Tool not found")).toBeNull();
});
