import type { TestLogger } from "@dotfiles/logger";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { registerBinCommand } from "../binCommand";
import type { IGlobalProgram, IServices } from "../types";
import { createCliTestSetup } from "./createCliTestSetup";

describe("binCommand", () => {
  let program: IGlobalProgram;
  let testLogger: TestLogger;
  let mockServices: IServices;

  beforeEach(async () => {
    const setup = await createCliTestSetup({
      testName: "bin-command",
      services: {
        configService: true,
        systemInfo: true,
      },
    });

    program = setup.program;
    testLogger = setup.logger;
    mockServices = setup.createServices();

    registerBinCommand(testLogger, program, async () => mockServices);
  });

  test("should register bin command successfully", () => {
    const commands = program.commands;
    const binCommand = commands.find((cmd) => cmd.name() === "bin");

    expect(binCommand).toBeDefined();
    expect(binCommand?.description()).toContain("real path");
  });

  test("should require name argument", () => {
    const commands = program.commands;
    const binCommand = commands.find((cmd) => cmd.name() === "bin");
    const args = binCommand?.registeredArguments;

    expect(args).toHaveLength(1);
    const nameArg = args?.[0];
    expect(nameArg?.name()).toBe("name");
    expect(nameArg?.required).toBe(true);
  });

  test("should exit silently with code 1 when tool not found", async () => {
    mockServices.configService.loadSingleToolConfig = mock(async () => undefined);
    mockServices.configService.loadToolConfigByBinary = mock(async () => undefined);

    await expect(program.parseAsync(["node", "cli", "bin", "nonexistent"])).rejects.toThrow(
      "MOCK_EXIT_CLI_CALLED_WITH_1",
    );

    const errorLogs = testLogger.logs.filter((log) => log["_meta"]?.logLevelName === "ERROR");
    expect(errorLogs).toHaveLength(0);
  });
});
