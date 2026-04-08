import { createShell, type Shell } from "@dotfiles/core";
import { describe, expect, it } from "bun:test";
import { createConfiguredShell } from "../createConfiguredShell";

describe("createConfiguredShell", () => {
  it("should return a Shell type", () => {
    const shell = createConfiguredShell(createShell(), {});

    // Type-level assertion: this line would fail to compile if shell is not Shell
    const _typeCheck: Shell = shell;
    expect(_typeCheck).toBeDefined();
  });

  it("should apply environment variables to commands", async () => {
    const env = {
      TEST_VAR: "test-value",
    };

    const shell = createConfiguredShell(createShell(), env);

    // Verify env var is present
    const output = await shell`echo $TEST_VAR`.text();
    expect(output.trim()).toBe("test-value");
  });

  it("should override existing environment variables", async () => {
    const env = {
      TEST_OVERRIDE: "new-value",
    };

    // Set in process.env temporarily
    process.env["TEST_OVERRIDE"] = "old-value";

    try {
      const shell = createConfiguredShell(createShell(), env);
      const output = await shell`echo $TEST_OVERRIDE`.text();
      expect(output.trim()).toBe("new-value");
    } finally {
      delete process.env["TEST_OVERRIDE"];
    }
  });

  it("should merge environment variables when chaining .env()", async () => {
    const baseEnv = { BASE: "base" };
    const shell = createConfiguredShell(createShell(), baseEnv);

    // With the fix, this should now output "BASE=base EXTRA=extra"
    const output = await shell`echo "BASE=$BASE EXTRA=$EXTRA"`.env({ EXTRA: "extra" }).text();
    expect(output.trim()).toBe("BASE=base EXTRA=extra");
  });
});
