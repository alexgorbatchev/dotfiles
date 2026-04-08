import type { IConfigService } from "@dotfiles/config";
import type { ToolConfig } from "@dotfiles/core";
import type { IGeneratorOrchestrator } from "@dotfiles/generator-orchestrator";
import type { MockedInterface } from "@dotfiles/testing-helpers";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { registerGenerateCommand } from "../generateCommand";
import { createCliTestSetup } from "./createCliTestSetup";

/**
 * Tests that shell-only tools (tools with no binaries, only shell configuration)
 * are properly passed to the generator orchestrator and do not create shims.
 */
describe("generate command with shell-only tools", () => {
  const createMockConfigService = (): MockedInterface<IConfigService> => ({
    loadSingleToolConfig: mock(async () => undefined),
    loadToolConfigs: mock(async () => ({})),
    loadToolConfigByBinary: mock(async () => undefined),
  });

  // Shell-only tool: has aliases but no binaries
  const shellOnlyFooConfig: ToolConfig = {
    name: "shell-only--foo",
    binaries: [],
    version: "1.0.0",
    shellConfigs: {
      zsh: {
        aliases: {
          foo: 'echo "This is foo tool"',
        },
        functions: {
          foosetup: 'echo "Setting up foo with HOME=$HOME"',
        },
      },
    },
    installationMethod: "manual",
    installParams: {},
  };

  let mockConfigService: MockedInterface<IConfigService>;
  let mockGeneratorOrchestrator: MockedInterface<IGeneratorOrchestrator>;

  beforeEach(async () => {
    process.env.DOTFILES_BUILT_PACKAGE_NAME = "@dotfiles/core";
  });

  afterEach(() => {
    mockConfigService.loadToolConfigs.mockReset();
    mockConfigService.loadSingleToolConfig.mockReset();
  });

  test("passes shell-only tool config to generator orchestrator", async () => {
    const setup = await createCliTestSetup({
      testName: "shell-only-foo-generate",
    });

    mockConfigService = createMockConfigService();
    mockConfigService.loadToolConfigs.mockResolvedValue({
      "shell-only--foo": shellOnlyFooConfig,
    });

    mockGeneratorOrchestrator = {
      generateAll: mock(async () => {}),
      generateCompletionsForTool: mock(async () => {}),
      cleanupToolArtifacts: mock(async () => {}),
    };

    registerGenerateCommand(setup.logger, setup.program, async () => ({
      ...setup.createServices(),
      configService: mockConfigService,
      generatorOrchestrator: mockGeneratorOrchestrator,
    }));

    await setup.program.parseAsync(["generate"], { from: "user" });

    // Verify generateAll was called with the shell-only tool config
    expect(mockGeneratorOrchestrator.generateAll).toHaveBeenCalledWith(
      { "shell-only--foo": shellOnlyFooConfig },
      expect.any(Object),
    );
  });

  test("shell-only tool does not create shim in user-bin", async () => {
    const setup = await createCliTestSetup({
      testName: "shell-only-foo-no-shim",
    });

    mockConfigService = createMockConfigService();
    mockConfigService.loadToolConfigs.mockResolvedValue({
      "shell-only--foo": shellOnlyFooConfig,
    });

    mockGeneratorOrchestrator = {
      generateAll: mock(async () => {}),
      generateCompletionsForTool: mock(async () => {}),
      cleanupToolArtifacts: mock(async () => {}),
    };

    registerGenerateCommand(setup.logger, setup.program, async () => ({
      ...setup.createServices(),
      configService: mockConfigService,
      generatorOrchestrator: mockGeneratorOrchestrator,
    }));

    await setup.program.parseAsync(["generate"], { from: "user" });

    // Verify no shim was created for the shell-only tool
    const shimPath = `${setup.mockProjectConfig.paths.targetDir}/shell-only--foo`;
    const shimExists = await setup.mockFs.fs.exists(shimPath);

    expect(shimExists).toBe(false);
  });
});
