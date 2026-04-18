import { always, type AsyncInstallHook, Platform, raw } from "@dotfiles/core";
import type { IGithubReleaseInstallParams } from "@dotfiles/installer-github";
import { isGitHubReleaseToolConfig } from "@dotfiles/installer-github";
import { TestLogger } from "@dotfiles/logger";
import { beforeEach, describe, expect, test } from "bun:test";
import assert from "node:assert";
import { messages } from "../log-messages";
import { IToolConfigBuilder } from "../toolConfigBuilder";

interface ITestCompletionsContext {
  version: string;
}

interface ICompletionCommandResult {
  cmd: string;
}

// Shared noop hooks for testing - defined at module scope to avoid lint warnings
const noopHook: AsyncInstallHook = async () => {};
const noopHook2: AsyncInstallHook = async () => {};
const noopHook3: AsyncInstallHook = async () => {};
const noopHook4: AsyncInstallHook = async () => {};

// Shared completions callback for testing
const testCompletionsCallback = (ctx: ITestCompletionsContext): ICompletionCommandResult => ({
  cmd: `tool completions --version ${ctx.version}`,
});

describe("IToolConfigBuilder", () => {
  let logger: TestLogger;

  beforeEach(() => {
    logger = new TestLogger();
  });

  test("constructor initializes with default values", () => {
    const builder = new IToolConfigBuilder(logger, "test-tool");
    expect(builder.toolName).toBe("test-tool");
    expect(builder.versionNum).toBe("latest");
    expect(builder.binaries).toEqual([]);
    expect(builder.shellConfigs.zsh.scripts).toEqual([]);
    expect(builder.symlinkPairs).toEqual([]);
    expect(builder.copyPairs).toEqual([]);
    expect(builder.currentInstallationMethod).toBeUndefined();
    expect(builder.currentInstallParams).toBeUndefined();
  });

  test("bin method sets binaries correctly", () => {
    const builder = new IToolConfigBuilder(logger, "test-tool");
    builder.bin("test-bin");
    expect(builder.binaries).toEqual([{ name: "test-bin", pattern: "*/test-bin" }]);

    const builder2 = new IToolConfigBuilder(logger, "test-tool");
    builder2.bin("bin1").bin("bin2");
    expect(builder2.binaries).toEqual([
      { name: "bin1", pattern: "*/bin1" },
      { name: "bin2", pattern: "*/bin2" },
    ]);
  });

  test("version method sets version correctly", () => {
    const builder = new IToolConfigBuilder(logger, "test-tool");
    builder.version("1.2.3");
    expect(builder.versionNum).toBe("1.2.3");
  });

  test("install method sets installation method and params correctly", () => {
    const builder = new IToolConfigBuilder(logger, "test-tool");
    builder.bin("test-bin"); // Add bin to make build valid
    const installParams: IGithubReleaseInstallParams = { repo: "owner/repo" };
    builder.install("github-release", installParams);
    const config = builder.build();

    expect(config.installationMethod).toBe("github-release");
    assert(isGitHubReleaseToolConfig(config));
    expect(config.installParams).toEqual(installParams);
  });

  test("hooks method sets hooks correctly on installParams", () => {
    const builder = new IToolConfigBuilder(logger, "test-tool");
    builder.bin("test-bin"); // Add bin to make build valid
    const installParams: IGithubReleaseInstallParams = { repo: "owner/repo" };

    builder.install("github-release", installParams);
    builder.hook("before-install", noopHook);

    const config = builder.build();
    assert(isGitHubReleaseToolConfig(config));
    expect(config.installParams?.hooks).toEqual({ "before-install": [noopHook] });
  });

  test("hook method sets individual hook correctly on installParams", () => {
    const builder = new IToolConfigBuilder(logger, "test-tool");
    builder.bin("test-bin");
    const installParams: IGithubReleaseInstallParams = { repo: "owner/repo" };

    builder.install("github-release", installParams);
    builder.hook("before-install", noopHook);

    const config = builder.build();
    assert(isGitHubReleaseToolConfig(config));
    expect(config.installParams?.hooks).toEqual({ "before-install": [noopHook] });
  });

  test("hook method appends multiple hooks for the same event", () => {
    const builder = new IToolConfigBuilder(logger, "test-tool");
    builder.bin("test-bin");
    const installParams: IGithubReleaseInstallParams = { repo: "owner/repo" };

    builder.install("github-release", installParams);
    builder.hook("after-install", noopHook);
    builder.hook("after-install", noopHook2);

    const config = builder.build();
    assert(isGitHubReleaseToolConfig(config));
    expect(config.installParams?.hooks).toEqual({ "after-install": [noopHook, noopHook2] });
  });

  test("hook method supports all lifecycle events", () => {
    const builder = new IToolConfigBuilder(logger, "test-tool");
    builder.bin("test-bin");
    const installParams: IGithubReleaseInstallParams = { repo: "owner/repo" };

    builder.install("github-release", installParams);
    builder.hook("before-install", noopHook);
    builder.hook("after-download", noopHook2);
    builder.hook("after-extract", noopHook3);
    builder.hook("after-install", noopHook4);

    const config = builder.build();
    assert(isGitHubReleaseToolConfig(config));
    expect(config.installParams?.hooks).toEqual({
      "before-install": [noopHook],
      "after-download": [noopHook2],
      "after-extract": [noopHook3],
      "after-install": [noopHook4],
    });
  });

  test("hook method sets hooks even if install was not called first", () => {
    const testLogger = new TestLogger();
    const builder = new IToolConfigBuilder(testLogger, "test-tool");
    builder.hook("before-install", noopHook);

    expect(builder.currentInstallParams?.["hooks"]).toEqual({ "before-install": [noopHook] });
    testLogger.expect([], [], [], []);
  });

  test("build preserves root hooks when only platform overrides provide the installer", () => {
    const builder = new IToolConfigBuilder(logger, "test-tool");

    builder
      .bin("test-bin")
      .hook("after-extract", noopHook)
      .platform(Platform.MacOS, (install) => install("manual", { binaryPath: "platform-bin" }).bin("test-bin"));

    const config = builder.build();

    expect(config.installationMethod).toBe("manual");
    expect(config.installParams).toEqual({
      hooks: {
        "after-extract": [noopHook],
      },
    });
    expect(config.platformConfigs?.[0]?.config.installParams).toEqual({ binaryPath: "platform-bin" });
  });

  test("zsh method adds zsh code correctly to zshInit", () => {
    const builder = new IToolConfigBuilder(logger, "test-tool");
    builder.zsh((shell) => shell.always(/* zsh */ `alias ll="ls -l"`));
    builder.zsh((shell) => shell.always(/* zsh */ `export PATH="$HOME/bin:$PATH"`));
    // build() is valid here as zshInit is provided
    const config = builder.build();
    expect(config.shellConfigs?.zsh?.scripts).toEqual([
      always(`alias ll="ls -l"`),
      always(`export PATH="$HOME/bin:$PATH"`),
    ]);
  });

  test("zsh functions method adds shell functions correctly", () => {
    const builder = new IToolConfigBuilder(logger, "test-tool");
    builder.zsh((shell) =>
      shell.functions({
        mycommand: 'echo "Running my command"',
        anotherFunc: "cd /some/path && ./run.sh",
      }),
    );
    const config = builder.build();
    expect(config.shellConfigs?.zsh?.functions).toEqual({
      mycommand: 'echo "Running my command"',
      anotherFunc: "cd /some/path && ./run.sh",
    });
  });

  test("bash functions method adds shell functions correctly", () => {
    const builder = new IToolConfigBuilder(logger, "test-tool");
    builder.bash((shell) =>
      shell.functions({
        myfunc: 'echo "hello from bash"',
      }),
    );
    const config = builder.build();
    expect(config.shellConfigs?.bash?.functions).toEqual({
      myfunc: 'echo "hello from bash"',
    });
  });

  test("functions method filters out invalid function names and logs error", () => {
    const builder = new IToolConfigBuilder(logger, "test-tool");
    builder.zsh((shell) =>
      shell.functions({
        valid_name: "echo valid",
        "123invalid": "echo starts with number",
        "has space": "echo has space",
        "valid-name": "echo valid with hyphen",
        "func;injection": "echo injection attempt",
      }),
    );
    const config = builder.build();

    // Only valid names should be kept
    expect(config.shellConfigs?.zsh?.functions).toEqual({
      valid_name: "echo valid",
      "valid-name": "echo valid with hyphen",
    });

    // Errors should be logged for invalid names
    logger.expect(
      ["ERROR"],
      ["IToolConfigBuilder", "ShellConfigurator"],
      [],
      [
        /Invalid function name: "123invalid"/,
        /Invalid function name: "has space"/,
        /Invalid function name: "func;injection"/,
      ],
    );
  });

  test("symlink method adds symlinks correctly", () => {
    const builder = new IToolConfigBuilder(logger, "test-tool");
    builder.symlink("configs/.mytoolrc", "~/.mytoolrc");
    builder.symlink("configs/another.conf", "~/.config/another.conf");
    // build() is valid here as symlinks are provided
    expect(builder.build().symlinks).toEqual([
      { source: "configs/.mytoolrc", target: "~/.mytoolrc" },
      { source: "configs/another.conf", target: "~/.config/another.conf" },
    ]);
  });

  test("copy method adds copies correctly", () => {
    const builder = new IToolConfigBuilder(logger, "test-tool");
    builder.copy("configs/.mytoolrc", "~/.mytoolrc");
    builder.copy("configs/another.conf", "~/.config/another.conf");
    expect(builder.build().copies).toEqual([
      { source: "configs/.mytoolrc", target: "~/.mytoolrc" },
      { source: "configs/another.conf", target: "~/.config/another.conf" },
    ]);
  });

  test("build method returns ManualToolConfig if only copies are present", () => {
    const builder = new IToolConfigBuilder(logger, "test-tool");
    builder.copy("a", "b");
    const config = builder.build();
    expect(config.installationMethod).toBe("manual");
    expect(config.installParams).toEqual({});
    expect(config.binaries).toEqual([]);
    expect(config.copies).toEqual([{ source: "a", target: "b" }]);
  });

  test("build method returns correct ToolConfig object for github-release", () => {
    const builder = new IToolConfigBuilder(logger, "test-tool");
    const installParams: IGithubReleaseInstallParams = { repo: "owner/repo" };

    builder
      .bin("tool-bin")
      .version("1.0.0")
      .install("github-release", installParams)
      .hook("after-install", noopHook)
      .zsh((shell) => shell.always(/* zsh */ `alias tt="test-tool"`).completions("completion.bash"))
      .symlink("config.yml", "~/.config/tool/config.yml");

    const config = builder.build();

    expect(config.name).toBe("test-tool");
    expect(config.binaries).toEqual(["tool-bin"]);
    expect(config.version).toBe("1.0.0");
    expect(config.installationMethod).toBe("github-release");
    assert(isGitHubReleaseToolConfig(config));
    expect(config.installParams).toEqual({ ...installParams, hooks: { "after-install": [noopHook] } });
    expect(config.shellConfigs?.zsh?.scripts).toEqual([always(`alias tt="test-tool"`)]);
    expect(config.shellConfigs?.zsh?.completions).toBe("completion.bash");
    expect(config.symlinks).toEqual([{ source: "config.yml", target: "~/.config/tool/config.yml" }]);
  });

  test("completions preserves the configured bin option", () => {
    const builder = new IToolConfigBuilder(logger, "curl-script--fnm");

    builder.zsh((shell) =>
      shell.completions({
        cmd: "fnm completions --shell zsh",
        bin: "fnm",
      }),
    );

    const config = builder.build();
    expect(config.shellConfigs?.zsh?.completions).toEqual({
      cmd: "fnm completions --shell zsh",
      bin: "fnm",
    });
  });

  test("completions accepts callback function for dynamic resolution", () => {
    const builder = new IToolConfigBuilder(logger, "test-tool");

    builder.zsh((shell) => shell.completions(testCompletionsCallback));

    const config = builder.build();
    expect(config.shellConfigs?.zsh?.completions).toBe(testCompletionsCallback);
  });

  test("zsh sourceFile generates function-based sourcing with cleanup", () => {
    const builder = new IToolConfigBuilder(logger, "test-tool");

    builder.zsh((shell) => shell.sourceFile("/path/to/init.zsh"));

    const config = builder.build();
    // Should create a function and raw scripts to source+unset
    expect(config.shellConfigs?.zsh?.functions).toEqual({
      __dotfiles_source_test_tool_0: '[[ -f "/path/to/init.zsh" ]] && cat "/path/to/init.zsh"',
    });
    expect(config.shellConfigs?.zsh?.scripts).toEqual([
      raw("source <(__dotfiles_source_test_tool_0)"),
      raw("unset -f __dotfiles_source_test_tool_0"),
    ]);
  });

  test("bash sourceFile generates function-based sourcing with cleanup", () => {
    const builder = new IToolConfigBuilder(logger, "test-tool");

    builder.bash((shell) => shell.sourceFile("/path/to/init.bash"));

    const config = builder.build();
    // Should create a function and raw scripts to source+unset
    expect(config.shellConfigs?.bash?.functions).toEqual({
      __dotfiles_source_test_tool_0: '[[ -f "/path/to/init.bash" ]] && cat "/path/to/init.bash"',
    });
    expect(config.shellConfigs?.bash?.scripts).toEqual([
      raw("source <(__dotfiles_source_test_tool_0)"),
      raw("unset -f __dotfiles_source_test_tool_0"),
    ]);
  });

  test("zsh sourceFunction generates raw source from function output (no subshell wrapping)", () => {
    const builder = new IToolConfigBuilder(logger, "test-tool");

    builder.zsh((shell) => shell.functions({ initFnm: "fnm env --use-on-cd" }).sourceFunction("initFnm"));

    const config = builder.build();
    expect(config.shellConfigs?.zsh?.scripts).toEqual([raw(`source <(initFnm)`)]);
  });

  test("bash sourceFunction generates raw source from function output (no subshell wrapping)", () => {
    const builder = new IToolConfigBuilder(logger, "test-tool");

    builder.bash((shell) => shell.functions({ initFnm: "fnm env --use-on-cd" }).sourceFunction("initFnm"));

    const config = builder.build();
    expect(config.shellConfigs?.bash?.scripts).toEqual([raw(`source <(initFnm)`)]);
  });

  test("zsh source generates function-based sourcing with inline content and cleanup", () => {
    const builder = new IToolConfigBuilder(logger, "test-tool");

    builder.zsh((shell) => shell.source('echo "my inline content"'));

    const config = builder.build();
    // Should create a function with inline content and raw scripts to source+unset
    expect(config.shellConfigs?.zsh?.functions).toEqual({
      __dotfiles_source_inline_test_tool_0: 'echo "my inline content"',
    });
    expect(config.shellConfigs?.zsh?.scripts).toEqual([
      raw("source <(__dotfiles_source_inline_test_tool_0)"),
      raw("unset -f __dotfiles_source_inline_test_tool_0"),
    ]);
  });

  test("bash source generates function-based sourcing with inline content and cleanup", () => {
    const builder = new IToolConfigBuilder(logger, "test-tool");

    builder.bash((shell) => shell.source('echo "my inline content"'));

    const config = builder.build();
    // Should create a function with inline content and raw scripts to source+unset
    expect(config.shellConfigs?.bash?.functions).toEqual({
      __dotfiles_source_inline_test_tool_0: 'echo "my inline content"',
    });
    expect(config.shellConfigs?.bash?.scripts).toEqual([
      raw("source <(__dotfiles_source_inline_test_tool_0)"),
      raw("unset -f __dotfiles_source_inline_test_tool_0"),
    ]);
  });

  test("multiple source calls generate unique function names", () => {
    const builder = new IToolConfigBuilder(logger, "test-tool");

    builder.zsh((shell) => shell.source('echo "first"').source('echo "second"'));

    const config = builder.build();
    expect(config.shellConfigs?.zsh?.functions).toEqual({
      __dotfiles_source_inline_test_tool_0: 'echo "first"',
      __dotfiles_source_inline_test_tool_1: 'echo "second"',
    });
    expect(config.shellConfigs?.zsh?.scripts).toEqual([
      raw("source <(__dotfiles_source_inline_test_tool_0)"),
      raw("unset -f __dotfiles_source_inline_test_tool_0"),
      raw("source <(__dotfiles_source_inline_test_tool_1)"),
      raw("unset -f __dotfiles_source_inline_test_tool_1"),
    ]);
  });

  test("build method returns ManualToolConfig if binaries are specified but no installation method", () => {
    const builder = new IToolConfigBuilder(logger, "test-tool");
    builder.bin("test-bin");
    const config = builder.build();
    expect(config.name).toBe("test-tool");
    expect(config.binaries).toEqual(["test-bin"]);
    expect(config.installationMethod).toBe("manual");
    expect(config.installParams).toEqual({});
    // Ensure other optional fields are undefined if not set
    expect(config.shellConfigs).toBeUndefined();
    expect(config.symlinks).toBeUndefined();
    expect(config.updateCheck).toBeUndefined();
  });

  test("build method returns ManualToolConfig if only zshInit is present", () => {
    const builder = new IToolConfigBuilder(logger, "test-tool");
    builder.zsh((shell) => shell.always(/* zsh */ `alias tt="test-tool"`));
    const config = builder.build();
    expect(config.installationMethod).toBe("manual");
    expect(config.installParams).toEqual({});
    expect(config.binaries).toEqual([]);
    expect(config.shellConfigs?.zsh?.scripts).toEqual([always(`alias tt="test-tool"`)]);
  });

  test("build method returns ManualToolConfig if only symlinks are present", () => {
    const builder = new IToolConfigBuilder(logger, "test-tool");
    builder.symlink("a", "b");
    const config = builder.build();
    expect(config.installationMethod).toBe("manual");
    expect(config.installParams).toEqual({});
    expect(config.binaries).toEqual([]);
    expect(config.symlinks).toEqual([{ source: "a", target: "b" }]);
  });

  test("build method throws error if nothing is configured", () => {
    const builder = new IToolConfigBuilder(logger, "test-tool");
    expect(() => builder.build()).toThrow(
      'Required configuration missing: tool definition. Example: Tool "test-tool" must define at least binaries, shell init scripts (zsh/bash/powershell), symlinks, or platformConfigs',
    );
  });

  test("build method returns ManualToolConfig with binaries if set, but no install method", () => {
    const builder = new IToolConfigBuilder(logger, "test-tool");
    builder.bin("my-binary");
    const config = builder.build();
    expect(config.installationMethod).toBe("manual");
    expect(config.installParams).toEqual({});
    expect(config.binaries).toEqual(["my-binary"]);
  });

  test("build method should log error when no configuration is provided", () => {
    const testLogger = new TestLogger();
    const builder = new IToolConfigBuilder(testLogger, "empty-tool");
    // Don't set any configuration - this should trigger the "nothing configured" error

    let thrownError: Error | null = null;
    try {
      builder.build();
    } catch (error) {
      thrownError = error as Error;
    }

    expect(thrownError).toBeInstanceOf(Error);
    expect(thrownError!.message).toContain("Required configuration missing: tool definition");

    testLogger.expect(
      ["ERROR"],
      ["IToolConfigBuilder"],
      [],
      [
        messages.configurationFieldRequired(
          "tool definition",
          'Tool "empty-tool" must define at least binaries, shell init scripts (zsh/bash/powershell), symlinks, or platformConfigs',
        ),
      ],
    );
  });

  test("zsh method handles aliases correctly", () => {
    const builder = new IToolConfigBuilder(logger, "test-tool");

    builder.zsh((shell) =>
      shell
        .aliases({
          g: "git",
          l: "ls -la",
          v: "vim",
        })
        .always(`echo "test init"`),
    );

    expect(builder.shellConfigs.zsh.aliases).toEqual({
      g: "git",
      l: "ls -la",
      v: "vim",
    });
    expect(builder.shellConfigs.zsh.scripts).toHaveLength(1);
  });

  test("bash method handles aliases correctly", () => {
    const builder = new IToolConfigBuilder(logger, "test-tool");

    builder.bash((shell) =>
      shell.aliases({
        g: "git",
        dc: "docker-compose",
      }),
    );

    expect(builder.shellConfigs.bash.aliases).toEqual({
      g: "git",
      dc: "docker-compose",
    });
  });

  test("powershell method handles aliases correctly", () => {
    const builder = new IToolConfigBuilder(logger, "test-tool");

    builder.powershell((shell) =>
      shell.aliases({
        g: "git",
        cat: "Get-Content",
      }),
    );

    expect(builder.shellConfigs.powershell.aliases).toEqual({
      g: "git",
      cat: "Get-Content",
    });
  });

  test("build method includes aliases in shell configs", () => {
    const builder = new IToolConfigBuilder(logger, "test-tool");

    builder.bin("test-tool").zsh((shell) =>
      shell.aliases({
        g: "git",
        l: "ls -la",
      }),
    );

    const config = builder.build();

    expect(config.shellConfigs?.zsh?.aliases).toBeDefined();
    expect(config.shellConfigs?.zsh?.aliases).toEqual({
      g: "git",
      l: "ls -la",
    });
  });

  test("build method stores PowerShell aliases correctly", () => {
    const builder = new IToolConfigBuilder(logger, "test-tool");

    builder.bin("test-tool").powershell((shell) =>
      shell.aliases({
        g: "git",
        cat: "Get-Content",
      }),
    );

    const config = builder.build();

    expect(config.shellConfigs?.powershell?.aliases).toBeDefined();
    expect(config.shellConfigs?.powershell?.aliases).toEqual({
      g: "git",
      cat: "Get-Content",
    });
  });

  test("multiple zsh calls merge aliases correctly", () => {
    const builder = new IToolConfigBuilder(logger, "test-tool");

    builder.zsh((shell) => shell.aliases({ g: "git" })).zsh((shell) => shell.aliases({ l: "ls -la", v: "vim" }));

    expect(builder.shellConfigs.zsh.aliases).toEqual({
      g: "git",
      l: "ls -la",
      v: "vim",
    });
  });

  test("shell.path method adds path to shell config", () => {
    const builder = new IToolConfigBuilder(logger, "test-tool");

    builder.zsh((shell) => shell.path("$HOME/.local/bin"));

    expect(builder.shellConfigs.zsh.paths).toEqual(["$HOME/.local/bin"]);
  });

  test("shell.path method accepts callback returning string", () => {
    const builder = new IToolConfigBuilder(logger, "test-tool");

    builder.zsh((shell) => shell.path(() => "/resolved/path"));

    expect(builder.shellConfigs.zsh.paths).toHaveLength(1);
    const pathValue = builder.shellConfigs.zsh.paths[0];
    expect(typeof pathValue).toBe("function");
  });

  test("multiple shell.path calls accumulate paths", () => {
    const builder = new IToolConfigBuilder(logger, "test-tool");

    builder.zsh((shell) => shell.path("$HOME/.local/bin").path("$HOME/.cargo/bin"));

    expect(builder.shellConfigs.zsh.paths).toEqual(["$HOME/.local/bin", "$HOME/.cargo/bin"]);
  });

  test("shell.path is included in build output", () => {
    const builder = new IToolConfigBuilder(logger, "test-tool");

    builder.bin("test-bin").zsh((shell) => shell.path("$HOME/.local/bin"));

    const config = builder.build();
    expect(config.shellConfigs?.zsh?.paths).toEqual(["$HOME/.local/bin"]);
  });

  test("disable method sets disabled to true", () => {
    const builder = new IToolConfigBuilder(logger, "test-tool");

    builder.bin("test-bin").install("github-release", { repo: "owner/repo" }).disable();

    const config = builder.build();
    expect(config.disabled).toBe(true);
  });

  test("disable method returns builder for chaining", () => {
    const builder = new IToolConfigBuilder(logger, "test-tool");

    const result = builder.disable();
    expect(result).toBe(builder);
  });

  test("build method includes disabled property when set", () => {
    const builder = new IToolConfigBuilder(logger, "test-tool");

    builder.bin("test-bin").disable();

    const config = builder.build();
    expect(config.disabled).toBe(true);
    expect(config.name).toBe("test-tool");
    expect(config.installationMethod).toBe("manual");
  });

  test("build method does not include disabled property when not set", () => {
    const builder = new IToolConfigBuilder(logger, "test-tool");

    builder.bin("test-bin");

    const config = builder.build();
    expect(config.disabled).toBeUndefined();
  });

  test("sudo method sets sudo to true", () => {
    const builder = new IToolConfigBuilder(logger, "test-tool");

    builder
      .bin("test-bin")
      .install("pkg", { source: { type: "url", url: "https://example.com/tool.pkg" } })
      .sudo();

    const config = builder.build();
    expect(config.sudo).toBe(true);
  });

  test("sudo method returns builder for chaining", () => {
    const builder = new IToolConfigBuilder(logger, "test-tool");

    const result = builder.sudo();
    expect(result).toBe(builder);
  });

  test("hostname method sets hostname pattern as string", () => {
    const builder = new IToolConfigBuilder(logger, "test-tool");

    builder.bin("test-bin").install("github-release", { repo: "owner/repo" }).hostname("my-workstation");

    const config = builder.build();
    expect(config.hostname).toBe("my-workstation");
  });

  test("hostname method converts regexp to source string", () => {
    const builder = new IToolConfigBuilder(logger, "test-tool");

    builder
      .bin("test-bin")
      .install("github-release", { repo: "owner/repo" })
      .hostname(/^work-machine-.*$/);

    const config = builder.build();
    expect(config.hostname).toBe("^work-machine-.*$");
  });

  test("hostname method returns builder for chaining", () => {
    const builder = new IToolConfigBuilder(logger, "test-tool");

    const result = builder.hostname("test-host");
    expect(result).toBe(builder);
  });

  test("build method does not include hostname property when not set", () => {
    const builder = new IToolConfigBuilder(logger, "test-tool");

    builder.bin("test-bin");

    const config = builder.build();
    expect(config.hostname).toBeUndefined();
  });
});
