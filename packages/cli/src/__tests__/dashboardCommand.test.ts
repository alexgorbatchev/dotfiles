import { Platform } from "@dotfiles/core";
import type { IDashboardServer, IDashboardServices } from "@dotfiles/dashboard";
import type { TsLogger } from "@dotfiles/logger";
import type { TestLogger } from "@dotfiles/logger";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { type BrowserOpener, type DashboardServerFactory, registerDashboardCommand } from "../dashboardCommand";
import type { IGlobalProgram, IServices } from "../types";
import { createCliTestSetup } from "./createCliTestSetup";

type ServicesGetter = () => IServices;
type StartServer = () => Promise<boolean>;
type StopServer = () => Promise<void>;

interface IDashboardServerLocation {
  port: number;
  host: string;
}

describe("dashboardCommand", () => {
  let program: IGlobalProgram;
  let logger: TestLogger;
  let mockOpenBrowser: ReturnType<typeof mock<BrowserOpener>>;
  let mockServerStart: ReturnType<typeof mock<StartServer>>;
  let mockServerStop: ReturnType<typeof mock<StopServer>>;
  let mockCreateServer: ReturnType<typeof mock<DashboardServerFactory>>;
  let createServicesMock: ServicesGetter;

  const runCommand = (args: string[]) => program.parseAsync(["dashboard", ...args], { from: "user" });

  beforeEach(async () => {
    mock.restore();

    mockOpenBrowser = mock(async () => {});
    mockServerStart = mock(async () => false);
    mockServerStop = mock(async () => {});

    const mockServer: IDashboardServer = {
      start: mockServerStart,
      stop: mockServerStop,
      getUrl: () => "http://localhost:3000",
    };

    mockCreateServer = mock((_logger: TsLogger, _services: IDashboardServices, options: IDashboardServerLocation) => {
      // Update getUrl to use actual options
      return {
        ...mockServer,
        getUrl: () => `http://${options.host}:${options.port}`,
      };
    });

    const setup = await createCliTestSetup({
      testName: "dashboard-command",
      services: {
        systemInfo: true,
        configService: true,
        fileRegistry: true,
        toolInstallationRegistry: true,
        versionChecker: true,
      },
    });

    program = setup.program;
    logger = setup.logger;
    createServicesMock = setup.createServices;

    registerDashboardCommand(logger, program, async () => createServicesMock(), {
      openBrowser: mockOpenBrowser,
      createServer: mockCreateServer,
    });
  });

  afterEach(() => {
    mock.restore();
  });

  it("should start the server", async () => {
    await runCommand([]);

    expect(mockServerStart).toHaveBeenCalledTimes(1);
  });

  it("should open browser by default when --open is not specified", async () => {
    await runCommand([]);

    expect(mockOpenBrowser).toHaveBeenCalledTimes(1);
    expect(mockOpenBrowser).toHaveBeenCalledWith("http://localhost:3000", Platform.Linux);
  });

  it("should not open browser when --no-open flag is set", async () => {
    await runCommand(["--no-open"]);

    expect(mockServerStart).toHaveBeenCalledTimes(1);
    expect(mockOpenBrowser).toHaveBeenCalledTimes(0);
  });

  it("should not open browser on HMR restart", async () => {
    // Simulate HMR restart by having server.start() return true
    mockServerStart.mockResolvedValueOnce(true);

    await runCommand([]);

    expect(mockServerStart).toHaveBeenCalledTimes(1);
    expect(mockOpenBrowser).toHaveBeenCalledTimes(0);
  });

  it("should use custom port when specified", async () => {
    await runCommand(["--port", "8080"]);

    expect(mockServerStart).toHaveBeenCalledTimes(1);
    expect(mockOpenBrowser).toHaveBeenCalledWith("http://localhost:8080", Platform.Linux);
  });

  it("should use custom host when specified", async () => {
    await runCommand(["--host", "0.0.0.0"]);

    expect(mockServerStart).toHaveBeenCalledTimes(1);
    expect(mockOpenBrowser).toHaveBeenCalledWith("http://0.0.0.0:3000", Platform.Linux);
  });

  it("should use custom port and host when both specified", async () => {
    await runCommand(["--port", "8080", "--host", "0.0.0.0"]);

    expect(mockServerStart).toHaveBeenCalledTimes(1);
    expect(mockOpenBrowser).toHaveBeenCalledWith("http://0.0.0.0:8080", Platform.Linux);
  });
});
