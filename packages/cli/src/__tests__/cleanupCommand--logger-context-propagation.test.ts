/**
 * Integration tests for logger context propagation in the cleanup command.
 *
 * Verifies that tool name context flows through log messages when cleaning up files.
 */
import type { ProjectConfig } from "@dotfiles/config";
import type { TestLogger } from "@dotfiles/logger";
import { createMockFileRegistry } from "@dotfiles/registry/file";
import { beforeEach, describe, it, mock } from "bun:test";
import { registerCleanupCommand } from "../cleanupCommand";
import { messages } from "../log-messages";
import type { IGlobalProgram } from "../types";
import { createCliTestSetup } from "./createCliTestSetup";

describe("cleanupCommand - Logger Context Propagation", () => {
  let program: IGlobalProgram;
  let mockProjectConfig: ProjectConfig;
  let mockFileRegistry: ReturnType<typeof createMockFileRegistry>;
  let logger: TestLogger;

  const TOOL_NAME = "test-tool";

  let mockShimPath = "";

  beforeEach(async () => {
    mock.restore();

    mockFileRegistry = createMockFileRegistry();

    mockFileRegistry.getFileStatesForTool = mock(async (toolName: string) => {
      if (toolName === TOOL_NAME) {
        return [
          {
            filePath: mockShimPath,
            toolName: TOOL_NAME,
            fileType: "shim" as const,
            lastOperation: "writeFile" as const,
            lastModified: Date.now(),
          },
        ];
      }
      return [];
    });

    mockFileRegistry.getRegisteredTools = mock(async () => [TOOL_NAME]);

    const setup = await createCliTestSetup({
      testName: "cleanup-context",
      services: {
        fileRegistry: mockFileRegistry,
      },
    });

    program = setup.program;
    logger = setup.logger;
    mockProjectConfig = setup.mockProjectConfig;

    mockShimPath = `${mockProjectConfig.paths.generatedDir}/bin/${TOOL_NAME}`;

    setup.mockFs.addFiles({
      [mockShimPath]: "shim content",
    });

    registerCleanupCommand(logger, program, async () => setup.createServices());
  });

  it("should include tool name in log messages when cleaning specific tool", async () => {
    await program.parseAsync(["cleanup", "--tool", TOOL_NAME], { from: "user" });

    logger.expect(
      ["INFO"],
      ["registerCleanupCommand"],
      [],
      [messages.cleanupToolFiles(TOOL_NAME), /rm/, messages.cleanupRegistryTool(TOOL_NAME, false)],
    );
  });

  it("should include tool name in log messages when cleaning all tools", async () => {
    await program.parseAsync(["cleanup", "--all"], { from: "user" });

    logger.expect(
      ["INFO"],
      ["registerCleanupCommand"],
      [],
      [messages.cleanupAllTrackedFiles(), /rm/, messages.cleanupRegistryDatabase()],
    );
  });
});
