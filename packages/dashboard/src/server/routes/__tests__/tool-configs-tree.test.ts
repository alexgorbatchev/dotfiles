import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createMockToolConfigForTests, setupTestContext, type ITestContext } from "./test-setup";

type ReaddirOverride = (entries: string[]) => string[];
type StatOverride = () => ReturnType<ITestContext["services"]["fs"]["stat"]>;

const identityReaddirEntries: ReaddirOverride = (entries) => entries;

describe("getToolConfigsTree", () => {
  let ctx: ITestContext;

  beforeEach(async () => {
    ctx = await setupTestContext();
  });

  afterEach(async () => {
    ctx.registryDatabase.close();
  });

  test("returns empty tree when tool configs directory does not exist", async () => {
    const result = await ctx.api.getToolConfigsTree();

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      rootPath: "/home/user/.dotfiles/tools",
      entries: [],
    });
  });

  test("skips unreadable entries and still returns discovered tool files", async () => {
    await ctx.fs.mkdir("/home/user/.dotfiles/tools", { recursive: true });
    await ctx.fs.writeFile("/home/user/.dotfiles/tools/fzf.tool.ts", "export default {}");
    const toolsDir = "/home/user/.dotfiles/tools";
    const brokenPath = "/home/user/.dotfiles/tools/broken";

    ctx.toolConfigs.fzf = createMockToolConfigForTests({
      name: "fzf",
      configFilePath: "/home/user/.dotfiles/tools/fzf.tool.ts",
    });

    const originalReaddir = ctx.services.fs.readdir.bind(ctx.services.fs);
    const originalStat = ctx.services.fs.stat.bind(ctx.services.fs);
    const readdirOverrides = new Map<string, ReaddirOverride>([[toolsDir, (entries) => [...entries, "broken"]]]);
    const statOverrides = new Map<string, StatOverride>([
      [brokenPath, async () => Promise.reject(new Error("ENOENT"))],
    ]);

    ctx.services.fs.readdir = async (path) => {
      const entries = await originalReaddir(path);
      const handler = readdirOverrides.get(path) ?? identityReaddirEntries;
      return handler(entries);
    };

    ctx.services.fs.stat = async (path) => {
      const handler = statOverrides.get(path) ?? (() => originalStat(path));
      return handler();
    };

    const result = await ctx.api.getToolConfigsTree();

    expect(result.success).toBe(true);
    expect(result.data?.entries).toEqual([
      {
        name: "fzf.tool.ts",
        path: "/home/user/.dotfiles/tools/fzf.tool.ts",
        type: "file",
        toolName: "fzf",
      },
    ]);
  });
});
