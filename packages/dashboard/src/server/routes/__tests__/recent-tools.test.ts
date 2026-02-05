import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { setupTestContext, type TestContext } from './test-setup';

describe('getRecentTools', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await setupTestContext();
  });

  afterEach(async () => {
    ctx.registryDatabase.close();
  });

  test('returns empty array when no tool config files exist', async () => {
    // Create the tools directory but no files
    await ctx.fs.mkdir('/home/user/.dotfiles/tools', { recursive: true });

    const result = await ctx.api.getRecentTools();

    expect(result.success).toBe(true);
    expect(result.data?.tools).toEqual([]);
  });

  test('returns recently added tool config files', async () => {
    // Create the tools directory and add some .tool.ts files
    await ctx.fs.mkdir('/home/user/.dotfiles/tools', { recursive: true });
    await ctx.fs.writeFile('/home/user/.dotfiles/tools/fzf.tool.ts', 'export default {}');
    await ctx.fs.writeFile('/home/user/.dotfiles/tools/bat.tool.ts', 'export default {}');

    const result = await ctx.api.getRecentTools();

    expect(result.success).toBe(true);
    expect(result.data?.tools).toHaveLength(2);
    // Check that tool names are extracted correctly
    const names = result.data?.tools.map((t: { name: string; }) => t.name).toSorted();
    expect(names).toEqual(['bat', 'fzf']);
  });

  test('returns tools sorted by creation time descending', async () => {
    await ctx.fs.mkdir('/home/user/.dotfiles/tools', { recursive: true });

    // Create first file
    await ctx.fs.writeFile('/home/user/.dotfiles/tools/first.tool.ts', 'export default {}');

    // Small delay to ensure different timestamps
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Create second file
    await ctx.fs.writeFile('/home/user/.dotfiles/tools/second.tool.ts', 'export default {}');

    const result = await ctx.api.getRecentTools();

    expect(result.success).toBe(true);
    // Most recently created should be first
    expect(result.data?.tools[0]?.name).toBe('second');
    expect(result.data?.tools[1]?.name).toBe('first');
  });

  test('limits results to specified count', async () => {
    await ctx.fs.mkdir('/home/user/.dotfiles/tools', { recursive: true });

    // Create 5 tool files
    for (let i = 0; i < 5; i++) {
      await ctx.fs.writeFile(`/home/user/.dotfiles/tools/tool-${i}.tool.ts`, 'export default {}');
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    const result = await ctx.api.getRecentTools(3);

    expect(result.success).toBe(true);
    expect(result.data?.tools).toHaveLength(3);
  });

  test('includes tool files from subdirectories', async () => {
    await ctx.fs.mkdir('/home/user/.dotfiles/tools/cli', { recursive: true });
    await ctx.fs.mkdir('/home/user/.dotfiles/tools/dev', { recursive: true });

    await ctx.fs.writeFile('/home/user/.dotfiles/tools/fzf.tool.ts', 'export default {}');
    await ctx.fs.writeFile('/home/user/.dotfiles/tools/cli/ripgrep.tool.ts', 'export default {}');
    await ctx.fs.writeFile('/home/user/.dotfiles/tools/dev/node.tool.ts', 'export default {}');

    const result = await ctx.api.getRecentTools();

    expect(result.success).toBe(true);
    expect(result.data?.tools).toHaveLength(3);
    const names = result.data?.tools.map((t: { name: string; }) => t.name).toSorted();
    expect(names).toEqual(['fzf', 'node', 'ripgrep']);
  });

  test('returns relative time for each tool', async () => {
    await ctx.fs.mkdir('/home/user/.dotfiles/tools', { recursive: true });
    await ctx.fs.writeFile('/home/user/.dotfiles/tools/fzf.tool.ts', 'export default {}');

    const result = await ctx.api.getRecentTools();

    expect(result.success).toBe(true);
    expect(result.data?.tools[0]?.relativeTime).toBeDefined();
  });

  test('returns mtime as timestamp source for files not in git', async () => {
    await ctx.fs.mkdir('/home/user/.dotfiles/tools', { recursive: true });
    await ctx.fs.writeFile('/home/user/.dotfiles/tools/fzf.tool.ts', 'export default {}');

    const result = await ctx.api.getRecentTools();

    expect(result.success).toBe(true);
    // In-memory file system files are not tracked by git, so should use mtime
    expect(result.data?.tools[0]?.timestampSource).toBe('mtime');
  });
});
