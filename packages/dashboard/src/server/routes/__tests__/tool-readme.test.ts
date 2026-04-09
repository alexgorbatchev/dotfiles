import { Architecture, Platform } from "@dotfiles/core";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { createMockToolConfigForTests, setupTestContext, type ITestContext } from "./test-setup";

type DownloadFunction = ITestContext["services"]["downloader"]["download"];
type DownloadMock = ReturnType<typeof mock<DownloadFunction>>;

describe("getToolReadme", () => {
  let ctx: ITestContext;

  beforeEach(async () => {
    ctx = await setupTestContext();
  });

  afterEach(async () => {
    ctx.registryDatabase.close();
  });

  test("fetches README using platform-specific repo when top-level repo is missing", async () => {
    ctx.toolConfigs["atuin"] = createMockToolConfigForTests({
      name: "atuin",
      version: "latest",
      installationMethod: "manual",
      installParams: {},
      platformConfigs: [
        {
          platforms: Platform.MacOS,
          config: {
            installationMethod: "github-release",
            installParams: { repo: "atuinsh/atuin" },
          },
        },
      ],
    });

    const download: DownloadMock = mock<DownloadFunction>(async () => Buffer.from("# Atuin README"));
    ctx.services.downloader.download = download;

    const result = await ctx.api.getToolReadme("atuin");

    expect(result.success).toBe(true);
    expect(result.data?.content).toBe("# Atuin README");
    expect(download).toHaveBeenCalledTimes(1);
    const [, firstDownloadUrl] = download.mock.calls[0]!;
    expect(firstDownloadUrl).toBe("https://raw.githubusercontent.com/atuinsh/atuin/latest/README.md");
  });

  test("prefers active system platform repo when platform configs are in mismatched order", async () => {
    ctx.toolConfigs["atuin"] = createMockToolConfigForTests({
      name: "atuin",
      version: "latest",
      installationMethod: "manual",
      installParams: {},
      platformConfigs: [
        {
          platforms: Platform.Linux,
          config: {
            installationMethod: "github-release",
            installParams: { repo: "linux-only/repo" },
          },
        },
        {
          platforms: Platform.MacOS,
          config: {
            installationMethod: "github-release",
            installParams: { repo: "macos/repo" },
          },
        },
      ],
    });

    const download: DownloadMock = mock<DownloadFunction>(async () => Buffer.from("# Atuin README"));
    ctx.services.downloader.download = download;

    const result = await ctx.api.getToolReadme("atuin");

    expect(result.success).toBe(true);
    expect(result.data?.content).toBe("# Atuin README");
    const [, firstDownloadUrl] = download.mock.calls[0]!;
    expect(firstDownloadUrl).toBe("https://raw.githubusercontent.com/macos/repo/latest/README.md");
  });

  test("prefers active system architecture repo when platform configs share same platform", async () => {
    ctx.toolConfigs["atuin"] = createMockToolConfigForTests({
      name: "atuin",
      version: "latest",
      installationMethod: "manual",
      installParams: {},
      platformConfigs: [
        {
          platforms: Platform.MacOS,
          architectures: Architecture.X86_64,
          config: {
            installationMethod: "github-release",
            installParams: { repo: "macos-x64/repo" },
          },
        },
        {
          platforms: Platform.MacOS,
          architectures: Architecture.Arm64,
          config: {
            installationMethod: "github-release",
            installParams: { repo: "macos-arm64/repo" },
          },
        },
      ],
    });

    const download: DownloadMock = mock<DownloadFunction>(async () => Buffer.from("# Atuin README"));
    ctx.services.downloader.download = download;

    const result = await ctx.api.getToolReadme("atuin");

    expect(result.success).toBe(true);
    expect(result.data?.content).toBe("# Atuin README");
    const [, firstDownloadUrl] = download.mock.calls[0]!;
    expect(firstDownloadUrl).toBe("https://raw.githubusercontent.com/macos-arm64/repo/latest/README.md");
  });

  test("returns error when repo is missing from top-level and platform configs", async () => {
    ctx.toolConfigs["atuin"] = createMockToolConfigForTests({
      name: "atuin",
      version: "latest",
      installationMethod: "manual",
      installParams: {},
      platformConfigs: [
        {
          platforms: Platform.Linux,
          config: {
            installationMethod: "brew",
            installParams: { formula: "atuin" },
          },
        },
      ],
    });

    const result = await ctx.api.getToolReadme("atuin");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Tool does not have a GitHub repository");
  });
});
