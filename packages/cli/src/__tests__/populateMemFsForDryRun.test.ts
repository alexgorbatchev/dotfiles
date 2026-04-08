import { createMemFileSystem, type IFileSystem } from "@dotfiles/file-system";
import { TestLogger } from "@dotfiles/logger";
import { beforeEach, describe, expect, it } from "bun:test";
import { populateMemFsForDryRun } from "../populateMemFsForDryRun";

describe("populateMemFsForDryRun", () => {
  let logger: TestLogger;

  beforeEach(() => {
    logger = new TestLogger({ name: "test" });
  });

  it("handles empty directory", async () => {
    const { fs: sourceFs } = await createMemFileSystem({
      initialVolumeJson: {
        "/tools": null,
      },
    });
    const { fs: targetFs } = await createMemFileSystem();

    await populateMemFsForDryRun(logger, {
      sourceFs,
      targetFs,
      toolConfigsDir: "/tools",
      homeDir: "/home/user",
    });

    expect(await targetFs.exists("/tools")).toBe(false);
  });

  it("finds all files in root directory and copies to target", async () => {
    const { fs: sourceFs } = await createMemFileSystem({
      initialVolumeJson: {
        "/tools/foo.tool.ts": "content1",
        "/tools/readme.md": "content2",
        "/tools/config.json": "content3",
      },
    });
    const { fs: targetFs } = await createMemFileSystem();

    await populateMemFsForDryRun(logger, {
      sourceFs,
      targetFs,
      toolConfigsDir: "/tools",
      homeDir: "/home/user",
    });

    expect(await targetFs.readFile("/tools/foo.tool.ts", "utf8")).toBe("content1");
    expect(await targetFs.readFile("/tools/readme.md", "utf8")).toBe("content2");
    expect(await targetFs.readFile("/tools/config.json", "utf8")).toBe("content3");
  });

  it("recursively scans subdirectories", async () => {
    const { fs: sourceFs } = await createMemFileSystem({
      initialVolumeJson: {
        "/tools/root.tool.ts": "root content",
        "/tools/nested/inner.ts": "inner content",
        "/tools/deep/nested/deep.txt": "deep content",
      },
    });
    const { fs: targetFs } = await createMemFileSystem();

    await populateMemFsForDryRun(logger, {
      sourceFs,
      targetFs,
      toolConfigsDir: "/tools",
      homeDir: "/home/user",
    });

    expect(await targetFs.readFile("/tools/root.tool.ts", "utf8")).toBe("root content");
    expect(await targetFs.readFile("/tools/nested/inner.ts", "utf8")).toBe("inner content");
    expect(await targetFs.readFile("/tools/deep/nested/deep.txt", "utf8")).toBe("deep content");
  });

  it("finds SSH tool supporting files in nested directories", async () => {
    const { fs: sourceFs } = await createMemFileSystem({
      initialVolumeJson: {
        "/tools/special/ssh/ssh.tool.ts": "export default ...",
        "/tools/special/ssh/id_rsa": "private key content",
        "/tools/special/ssh/id_rsa.pub": "public key content",
        "/tools/special/ssh/config": "Host *\n  IdentityFile ...",
      },
    });
    const { fs: targetFs } = await createMemFileSystem();

    await populateMemFsForDryRun(logger, {
      sourceFs,
      targetFs,
      toolConfigsDir: "/tools",
      homeDir: "/home/user",
    });

    expect(await targetFs.readFile("/tools/special/ssh/ssh.tool.ts", "utf8")).toBe("export default ...");
    expect(await targetFs.readFile("/tools/special/ssh/id_rsa", "utf8")).toBe("private key content");
    expect(await targetFs.readFile("/tools/special/ssh/id_rsa.pub", "utf8")).toBe("public key content");
    expect(await targetFs.readFile("/tools/special/ssh/config", "utf8")).toBe("Host *\n  IdentityFile ...");
  });

  it("handles mixed structure with multiple tool directories", async () => {
    const { fs: sourceFs } = await createMemFileSystem({
      initialVolumeJson: {
        "/tools/core/bat.tool.ts": "bat content",
        "/tools/development/nvim/nvim.tool.ts": "nvim content",
        "/tools/development/nvim/init.lua": "vim config",
        "/tools/special/ssh/ssh.tool.ts": "ssh content",
        "/tools/special/ssh/id_rsa": "key content",
      },
    });
    const { fs: targetFs } = await createMemFileSystem();

    await populateMemFsForDryRun(logger, {
      sourceFs,
      targetFs,
      toolConfigsDir: "/tools",
      homeDir: "/home/user",
    });

    expect(await targetFs.readFile("/tools/core/bat.tool.ts", "utf8")).toBe("bat content");
    expect(await targetFs.readFile("/tools/development/nvim/nvim.tool.ts", "utf8")).toBe("nvim content");
    expect(await targetFs.readFile("/tools/development/nvim/init.lua", "utf8")).toBe("vim config");
    expect(await targetFs.readFile("/tools/special/ssh/ssh.tool.ts", "utf8")).toBe("ssh content");
    expect(await targetFs.readFile("/tools/special/ssh/id_rsa", "utf8")).toBe("key content");
  });

  it("does nothing when directory does not exist", async () => {
    const { fs: sourceFs } = await createMemFileSystem();
    const { fs: targetFs } = await createMemFileSystem();

    await populateMemFsForDryRun(logger, {
      sourceFs,
      targetFs,
      toolConfigsDir: "/nonexistent",
      homeDir: "/home/user",
    });

    expect(await targetFs.exists("/nonexistent")).toBe(false);
  });

  it("logs warning when directory does not exist", async () => {
    const { fs: sourceFs } = await createMemFileSystem();
    const { fs: targetFs } = await createMemFileSystem();

    await populateMemFsForDryRun(logger, {
      sourceFs,
      targetFs,
      toolConfigsDir: "/nonexistent",
      homeDir: "/home/user",
    });

    logger.expect(["WARN"], ["test", "populateMemFsForDryRun"], [], ["Tool configs directory not found"]);
  });

  it("continues scanning when individual file stat fails", async () => {
    const { fs: baseSourceFs } = await createMemFileSystem({
      initialVolumeJson: {
        "/tools/good.txt": "good content",
      },
    });
    const { fs: targetFs } = await createMemFileSystem();

    const originalStat = baseSourceFs.stat.bind(baseSourceFs);
    const sourceFs: IFileSystem = {
      ...baseSourceFs,
      stat: async (filePath: string) => {
        if (filePath === "/tools/bad-file") {
          throw new Error("Permission denied");
        }
        return originalStat(filePath);
      },
      readdir: async (dirPath: string) => {
        const entries = await baseSourceFs.readdir(dirPath);
        if (dirPath === "/tools") {
          return [...entries, "bad-file"];
        }
        return entries;
      },
    };

    await populateMemFsForDryRun(logger, {
      sourceFs,
      targetFs,
      toolConfigsDir: "/tools",
      homeDir: "/home/user",
    });

    expect(await targetFs.readFile("/tools/good.txt", "utf8")).toBe("good content");
    logger.expect(["DEBUG"], ["test", "populateMemFsForDryRun"], [], ["Failed to read /tools/bad-file"]);
  });

  it("creates sublogger with correct name", async () => {
    const { fs: sourceFs } = await createMemFileSystem({
      initialVolumeJson: {
        "/tools/test.tool.ts": "content",
      },
    });
    const { fs: targetFs } = await createMemFileSystem();

    await populateMemFsForDryRun(logger, {
      sourceFs,
      targetFs,
      toolConfigsDir: "/tools",
      homeDir: "/home/user",
    });

    // Verify sublogger hierarchy is correct
    logger.expect(["TRACE"], ["test", "populateMemFsForDryRun"], [], ["tool configs for dry run"]);
  });
});
