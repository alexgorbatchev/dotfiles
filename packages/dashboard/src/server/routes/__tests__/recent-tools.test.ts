import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { setupTestContext, type ITestContext } from "./test-setup";

type ReaddirOverride = (entries: string[]) => string[];
type StatOverride = () => ReturnType<ITestContext["services"]["fs"]["stat"]>;

const identityReaddirEntries: ReaddirOverride = (entries) => entries;

describe("getRecentTools", () => {
  let ctx: ITestContext;

  beforeEach(async () => {
    ctx = await setupTestContext();
  });

  afterEach(async () => {
    ctx.registryDatabase.close();
  });

  test("returns empty array when no tool config files exist", async () => {
    // Create the tools directory but no files
    await ctx.fs.mkdir("/home/user/.dotfiles/tools", { recursive: true });

    const result = await ctx.api.getRecentTools();

    expect(result.success).toBe(true);
    expect(result.data?.tools).toEqual([]);
  });

  test("returns recently added tool config files", async () => {
    // Create the tools directory and add some .tool.ts files
    await ctx.fs.mkdir("/home/user/.dotfiles/tools", { recursive: true });
    await ctx.fs.writeFile("/home/user/.dotfiles/tools/fzf.tool.ts", "export default {}");
    await ctx.fs.writeFile("/home/user/.dotfiles/tools/bat.tool.ts", "export default {}");

    const result = await ctx.api.getRecentTools();

    expect(result.success).toBe(true);
    expect(result.data?.tools).toHaveLength(2);
    // Check that tool names are extracted correctly
    const names = result.data?.tools.map((tool) => tool.name).toSorted();
    expect(names).toEqual(["bat", "fzf"]);
  });

  test("returns tools sorted by creation time descending", async () => {
    await ctx.fs.mkdir("/home/user/.dotfiles/tools", { recursive: true });

    // Create first file
    await ctx.fs.writeFile("/home/user/.dotfiles/tools/first.tool.ts", "export default {}");

    // Small delay to ensure different timestamps
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Create second file
    await ctx.fs.writeFile("/home/user/.dotfiles/tools/second.tool.ts", "export default {}");

    const result = await ctx.api.getRecentTools();

    expect(result.success).toBe(true);
    // Most recently created should be first
    expect(result.data?.tools[0]?.name).toBe("second");
    expect(result.data?.tools[1]?.name).toBe("first");
  });

  test("limits results to specified count", async () => {
    await ctx.fs.mkdir("/home/user/.dotfiles/tools", { recursive: true });

    // Create 5 tool files
    for (let i = 0; i < 5; i++) {
      await ctx.fs.writeFile(`/home/user/.dotfiles/tools/tool-${i}.tool.ts`, "export default {}");
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    const result = await ctx.api.getRecentTools(3);

    expect(result.success).toBe(true);
    expect(result.data?.tools).toHaveLength(3);
  });

  test("includes tool files from subdirectories", async () => {
    await ctx.fs.mkdir("/home/user/.dotfiles/tools/cli", { recursive: true });
    await ctx.fs.mkdir("/home/user/.dotfiles/tools/dev", { recursive: true });

    await ctx.fs.writeFile("/home/user/.dotfiles/tools/fzf.tool.ts", "export default {}");
    await ctx.fs.writeFile("/home/user/.dotfiles/tools/cli/ripgrep.tool.ts", "export default {}");
    await ctx.fs.writeFile("/home/user/.dotfiles/tools/dev/node.tool.ts", "export default {}");

    const result = await ctx.api.getRecentTools();

    expect(result.success).toBe(true);
    expect(result.data?.tools).toHaveLength(3);
    const names = result.data?.tools.map((tool) => tool.name).toSorted();
    expect(names).toEqual(["fzf", "node", "ripgrep"]);
  });

  test("returns relative time for each tool", async () => {
    await ctx.fs.mkdir("/home/user/.dotfiles/tools", { recursive: true });
    await ctx.fs.writeFile("/home/user/.dotfiles/tools/fzf.tool.ts", "export default {}");

    const result = await ctx.api.getRecentTools();

    expect(result.success).toBe(true);
    expect(result.data?.tools[0]?.relativeTime).toBeDefined();
  });

  test("returns mtime as timestamp source for files not in git", async () => {
    await ctx.fs.mkdir("/home/user/.dotfiles/tools", { recursive: true });
    await ctx.fs.writeFile("/home/user/.dotfiles/tools/fzf.tool.ts", "export default {}");

    const result = await ctx.api.getRecentTools();

    expect(result.success).toBe(true);
    // In-memory file system files are not tracked by git, so should use mtime
    expect(result.data?.tools[0]?.timestampSource).toBe("mtime");
  });

  test("skips unreadable entries and still returns discovered tool files", async () => {
    await ctx.fs.mkdir("/home/user/.dotfiles/tools", { recursive: true });
    await ctx.fs.writeFile("/home/user/.dotfiles/tools/fzf.tool.ts", "export default {}");
    const toolsDir = "/home/user/.dotfiles/tools";
    const brokenPath = "/home/user/.dotfiles/tools/broken";

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

    const result = await ctx.api.getRecentTools();

    expect(result.success).toBe(true);
    expect(result.data?.tools).toHaveLength(1);
    expect(result.data?.tools[0]?.name).toBe("fzf");
  });
});
