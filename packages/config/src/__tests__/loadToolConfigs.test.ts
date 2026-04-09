import type {
  AsyncConfigureTool,
  IInstallFunction,
  ISystemInfo,
  IToolConfigContext,
  ProjectConfig,
} from "@dotfiles/core";
import { Architecture, createToolConfigContext, Platform } from "@dotfiles/core";
import type { IResolvedFileSystem, MockedFileSystem } from "@dotfiles/file-system";
import { createMemFileSystem } from "@dotfiles/file-system";
import { TestLogger } from "@dotfiles/logger";
import { createMockProjectConfig, createTestDirectories } from "@dotfiles/testing-helpers";
import { createInstallFunction, IToolConfigBuilder as ToolConfigBuilderImpl } from "@dotfiles/tool-config-builder";
import { beforeEach, describe, expect, it } from "bun:test";
import assert from "node:assert";
import path from "node:path";

const createCompletionToolConfig =
  (generatedDir: string): AsyncConfigureTool =>
  async (install: IInstallFunction) =>
    install("manual", { binaryPath: "/usr/bin/completion-tool" })
      .bin("completion-tool")
      .version("latest")
      .zsh((shell) =>
        shell.always(/* zsh */ `
           # Generate completions to the proper directory
           if command -v completion-tool >/dev/null 2>&1; then
             completion-tool gen-completions --shell zsh > "${generatedDir}/completions/_completion-tool"
           fi
         `),
      );

describe("IToolConfigContext", () => {
  let logger: TestLogger;
  let mockProjectConfig: ProjectConfig;
  let systemInfo: ISystemInfo;
  let fileSystem: MockedFileSystem;
  let resolvedFs: IResolvedFileSystem;

  beforeEach(async () => {
    logger = new TestLogger();

    const mockFs = await createMemFileSystem({});
    fileSystem = mockFs.fs;
    resolvedFs = mockFs.fs.asIResolvedFileSystem;
    const testDirs = await createTestDirectories(logger, fileSystem, { testName: "toolconfig-context-test" });

    systemInfo = {
      platform: Platform.Linux,
      arch: Architecture.X86_64,
      homeDir: testDirs.paths.homeDir,
      hostname: "test-host",
    };

    mockProjectConfig = await createMockProjectConfig({
      config: {
        paths: testDirs.paths,
      },
      filePath: path.join(testDirs.paths.dotfilesDir, "dotfiles.config.ts"),
      fileSystem,
      logger,
      systemInfo,
      env: {},
    });
  });

  describe("Context creation and path resolution", () => {
    it("should create context with correct paths from projectConfig", async () => {
      const toolConfigFilePath = path.join(mockProjectConfig.paths.toolConfigsDir, "test-tool", "test-tool.tool.ts");
      const context = createToolConfigContext(
        mockProjectConfig,
        systemInfo,
        "test-tool",
        path.dirname(toolConfigFilePath),
        resolvedFs,
        logger,
      );

      expect(context.projectConfig.paths.homeDir).toBe(mockProjectConfig.paths.homeDir);
      expect(context.projectConfig.paths.shellScriptsDir).toBe(mockProjectConfig.paths.shellScriptsDir);
      expect(context.projectConfig.paths.dotfilesDir).toBe(mockProjectConfig.paths.dotfilesDir);
      expect(context.projectConfig.paths.generatedDir).toBe(mockProjectConfig.paths.generatedDir);
      expect(context.toolDir).toBe(path.dirname(toolConfigFilePath));

      // systemInfo should be injectable (provided by main.ts), not derived from process.
      expect(context.systemInfo.platform).toBe(Platform.Linux);
    });

    it("should work correctly with IToolConfigBuilder and context", async () => {
      const toolConfigFilePath = path.join(mockProjectConfig.paths.toolConfigsDir, "shell-tool", "shell-tool.tool.ts");
      const context = createToolConfigContext(
        mockProjectConfig,
        systemInfo,
        "shell-tool",
        path.dirname(toolConfigFilePath),
        resolvedFs,
        logger,
      );

      // Test that context can be used in a tool configuration function
      const configureToolFn: AsyncConfigureTool = async (install: IInstallFunction, ctx: IToolConfigContext) => {
        const toolBinariesDir = path.join(ctx.projectConfig.paths.binariesDir, ctx.toolName);
        return install("manual", { binaryPath: "/usr/bin/shell-tool" })
          .bin("shell-tool")
          .version("latest")
          .zsh((shell) =>
            shell.always(/* zsh */ `
              export TOOL_BINARIES_DIR="${toolBinariesDir}"
              export HOME_DIR="${ctx.projectConfig.paths.homeDir}"
              export GENERATED_DIR="${ctx.projectConfig.paths.generatedDir}"

              # Source tool-specific files
              if [[ -f "${toolBinariesDir}/shell/key-bindings.zsh" ]]; then
                source "${toolBinariesDir}/shell/key-bindings.zsh"
              fi
            `),
          );
      };

      const install = createInstallFunction(logger, "shell-tool");
      const result = await configureToolFn(install, context);

      assert(result);
      assert(result instanceof ToolConfigBuilderImpl);
      const toolConfig = result.build();

      expect(toolConfig).toBeDefined();
      expect(toolConfig.name).toBe("shell-tool");
      expect(toolConfig.shellConfigs?.zsh?.scripts).toBeDefined();
      expect(toolConfig.shellConfigs!.zsh!.scripts![0]!.value).toContain(mockProjectConfig.paths.binariesDir);
      expect(toolConfig.shellConfigs!.zsh!.scripts![0]!.value).toContain(mockProjectConfig.paths.homeDir);
      expect(toolConfig.shellConfigs!.zsh!.scripts![0]!.value).toContain(mockProjectConfig.paths.generatedDir);
    });

    it("should handle tool dependencies by composing paths from projectConfig", async () => {
      const toolConfigFilePath = path.join(
        mockProjectConfig.paths.toolConfigsDir,
        "dependent-tool",
        "dependent-tool.tool.ts",
      );
      const context = createToolConfigContext(
        mockProjectConfig,
        systemInfo,
        "dependent-tool",
        path.dirname(toolConfigFilePath),
        resolvedFs,
        logger,
      );

      // Test a tool that references other tools
      const configureToolFn: AsyncConfigureTool = async (install: IInstallFunction, ctx: IToolConfigContext) => {
        const dependentToolBinariesDir = path.join(ctx.projectConfig.paths.binariesDir, ctx.toolName);
        const fzfBinariesDir = path.join(ctx.projectConfig.paths.binariesDir, "fzf");
        return install("manual", { binaryPath: "/usr/bin/dependent-tool" })
          .bin("dependent-tool")
          .version("latest")
          .zsh((shell) =>
            shell.always(/* zsh */ `
              # Reference another tool's directory
              FZF_DIR="${fzfBinariesDir}"
              if [[ -d "$FZF_DIR" ]]; then
                export FZF_BASE="$FZF_DIR"
              fi

              # Use current tool directory
              export DEPENDENT_TOOL_CONFIG="${dependentToolBinariesDir}/config.ts"
            `),
          );
      };

      const result = await configureToolFn(createInstallFunction(logger, "dependent-tool"), context);
      assert(result);
      assert(result instanceof ToolConfigBuilderImpl);
      const toolConfig = result.build();

      expect(toolConfig.shellConfigs?.zsh?.scripts).toBeDefined();
      expect(toolConfig.shellConfigs!.zsh!.scripts![0]!.value).toContain(
        path.join(mockProjectConfig.paths.binariesDir, "fzf"),
      );
      expect(toolConfig.shellConfigs!.zsh!.scripts![0]!.value).toContain(
        path.join(mockProjectConfig.paths.binariesDir, "dependent-tool", "config.ts"),
      );
    });

    it("should handle tools that generate completions to the correct directory", async () => {
      const toolConfigFilePath = path.join(
        mockProjectConfig.paths.toolConfigsDir,
        "completion-tool",
        "completion-tool.tool.ts",
      );
      const context = createToolConfigContext(
        mockProjectConfig,
        systemInfo,
        "completion-tool",
        path.dirname(toolConfigFilePath),
        resolvedFs,
        logger,
      );

      const configureToolFn = createCompletionToolConfig(mockProjectConfig.paths.generatedDir);

      const result = await configureToolFn(createInstallFunction(logger, "completion-tool"), context);
      assert(result);
      assert(result instanceof ToolConfigBuilderImpl);
      const toolConfig = result.build();

      expect(toolConfig.shellConfigs?.zsh?.scripts).toBeDefined();
      expect(toolConfig.shellConfigs!.zsh!.scripts![0]!.value).toContain(
        path.join(mockProjectConfig.paths.generatedDir, "completions/_completion-tool"),
      );
    });
  });

  describe("Custom path resolution", () => {
    it("should create correct paths based on projectConfig values", async () => {
      // Test with custom paths in projectConfig
      const customMockFs = await createMemFileSystem({});
      const customTestDirs = await createTestDirectories(logger, customMockFs.fs, {
        testName: "custom-path-test",
      });

      const customProjectConfig = await createMockProjectConfig({
        config: {
          paths: {
            ...customTestDirs.paths,
            binariesDir: "/custom/dotfiles/.custom-generated/custom-tools",
          },
        },
        filePath: path.join(customTestDirs.paths.dotfilesDir, "dotfiles.config.ts"),
        fileSystem: customMockFs.fs,
        logger,
        systemInfo: {
          platform: Platform.Linux,
          arch: Architecture.X86_64,
          homeDir: customTestDirs.paths.homeDir,
          hostname: "test-host",
        },
        env: {},
      });

      const customSystemInfo: ISystemInfo = {
        platform: Platform.Linux,
        arch: Architecture.X86_64,
        homeDir: customTestDirs.paths.homeDir,
        hostname: "test-host",
      };

      const toolConfigFilePath = path.join(
        customProjectConfig.paths.toolConfigsDir,
        "custom-path-tool",
        "custom-path-tool.tool.ts",
      );
      const context = createToolConfigContext(
        customProjectConfig,
        customSystemInfo,
        "custom-path-tool",
        path.dirname(toolConfigFilePath),
        customMockFs.fs.asIResolvedFileSystem,
        logger,
      );

      expect(context.projectConfig.paths.homeDir).toBe(customProjectConfig.paths.homeDir);
      expect(context.projectConfig.paths.dotfilesDir).toBe(customProjectConfig.paths.dotfilesDir);
      expect(context.projectConfig.paths.generatedDir).toBe(customProjectConfig.paths.generatedDir);
      expect(path.join(context.projectConfig.paths.binariesDir, context.toolName)).toBe(
        path.join(customProjectConfig.paths.binariesDir, "custom-path-tool"),
      );
      expect(context.toolDir).toBe(path.dirname(toolConfigFilePath));
    });
  });

  describe("Real-world tool patterns", () => {
    it("should work with fzf-like tool pattern", async () => {
      const toolConfigFilePath = path.join(mockProjectConfig.paths.toolConfigsDir, "fzf-like", "fzf-like.tool.ts");
      const context = createToolConfigContext(
        mockProjectConfig,
        systemInfo,
        "fzf-like",
        path.dirname(toolConfigFilePath),
        resolvedFs,
        logger,
      );

      // Test fzf-like pattern with context
      const configureToolFn: AsyncConfigureTool = async (install: IInstallFunction, ctx: IToolConfigContext) => {
        const toolBinariesDir = path.join(ctx.projectConfig.paths.binariesDir, ctx.toolName);
        return install("github-release", { repo: "owner/fzf-like" })
          .bin("fzf-like")
          .version("latest")
          .zsh((shell) =>
            shell.completions("shell/completion.zsh").always(/* zsh */ `
              export FZF_LIKE_DEFAULT_OPTS="--color=fg+:cyan"

              # Source key bindings
              _fzf_like_install_dir="${toolBinariesDir}"
              if [ -f "$_fzf_like_install_dir/shell/key-bindings.zsh" ]; then
                source "$_fzf_like_install_dir/shell/key-bindings.zsh"
              fi
            `),
          );
      };

      const result = await configureToolFn(createInstallFunction(logger, "fzf-like"), context);
      assert(result);
      assert(result instanceof ToolConfigBuilderImpl);
      const toolConfig = result.build();

      expect(toolConfig.installationMethod).toBe("github-release");
      expect(toolConfig.shellConfigs?.zsh?.completions).toBeDefined();
      expect(toolConfig.shellConfigs?.zsh?.scripts).toBeDefined();
      expect(toolConfig.shellConfigs!.zsh!.scripts![0]!.value).toContain(
        path.join(mockProjectConfig.paths.binariesDir, "fzf-like"),
      );
    });

    it("should work with atuin-like tool pattern", async () => {
      const toolConfigFilePath = path.join(mockProjectConfig.paths.toolConfigsDir, "atuin-like", "atuin-like.tool.ts");
      const context = createToolConfigContext(
        mockProjectConfig,
        systemInfo,
        "atuin-like",
        path.dirname(toolConfigFilePath),
        resolvedFs,
        logger,
      );

      // Test atuin-like pattern with context
      const configureToolFn: AsyncConfigureTool = async (install: IInstallFunction, ctx: IToolConfigContext) => {
        const toolBinariesDir = path.join(ctx.projectConfig.paths.binariesDir, ctx.toolName);
        return install("github-release", { repo: "owner/atuin-like" })
          .bin("atuin-like")
          .version("latest")
          .symlink("./config.toml", "~/.config/atuin-like/config.toml")
          .zsh((shell) =>
            shell.always(/* zsh */ `
              export ATUIN_LIKE_CONFIG_DIR="${toolBinariesDir}"

              # Generate completions
              if command -v atuin-like >/dev/null 2>&1; then
                atuin-like gen-completions --shell zsh > "${ctx.projectConfig.paths.generatedDir}/completions/_atuin-like" 2>/dev/null || true
              fi
            `),
          );
      };

      const result = await configureToolFn(createInstallFunction(logger, "atuin-like"), context);
      assert(result);
      assert(result instanceof ToolConfigBuilderImpl);
      const toolConfig = result.build();

      expect(toolConfig.symlinks).toBeDefined();
      expect(toolConfig.shellConfigs?.zsh?.scripts).toBeDefined();
      expect(toolConfig.shellConfigs!.zsh!.scripts![0]!.value).toContain(
        path.join(mockProjectConfig.paths.binariesDir, "atuin-like"),
      );
      expect(toolConfig.shellConfigs!.zsh!.scripts![0]!.value).toContain(
        path.join(mockProjectConfig.paths.generatedDir, "completions/_atuin-like"),
      );
    });
  });
});
