import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { setupTestContext, type TestContext } from "./test-setup";

describe("getConfig", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await setupTestContext();
  });

  afterEach(async () => {
    ctx.registryDatabase.close();
  });

  test("returns configuration summary", async () => {
    const result = await ctx.api.getConfig();

    expect(result.success).toBe(true);
    expect(result.data?.dotfilesDir).toBe("/home/user/.dotfiles");
    expect(result.data?.generatedDir).toBe("/home/user/.dotfiles/.generated");
    expect(result.data?.binariesDir).toBe("/home/user/.dotfiles/.generated/binaries");
  });
});
