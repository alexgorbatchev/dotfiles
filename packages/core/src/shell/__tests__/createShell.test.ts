import { TestLogger } from "@dotfiles/logger";
import { describe, expect, it } from "bun:test";
import { createShell } from "../createShell";
import { ShellError } from "../ShellError";

interface IJsonPayload {
  foo: string;
}

describe("createShell", () => {
  describe("basic execution", () => {
    it("should execute a simple command", async () => {
      const $ = createShell();
      const result = await $`echo hello`;
      expect(result.code).toBe(0);
      expect(result.stdout).toBe("hello\n");
      expect(result.stderr).toBe("");
    });

    it("should execute command passed as string", async () => {
      const $ = createShell();
      const result = await $("echo hello");
      expect(result.code).toBe(0);
      expect(result.stdout).toBe("hello\n");
    });

    it("should interpolate values in template", async () => {
      const $ = createShell();
      const name = "world";
      const result = await $`echo hello ${name}`;
      expect(result.stdout).toBe("hello world\n");
    });

    it("should escape special characters in interpolated values", async () => {
      const $ = createShell();
      const value = "hello 'world'";
      const result = await $`echo ${value}`;
      expect(result.stdout).toBe("hello 'world'\n");
    });

    it("should interpolate arrays as space-separated values", async () => {
      const $ = createShell();
      const args = ["a", "b", "c"];
      const result = await $`echo ${args}`;
      expect(result.stdout).toBe("a b c\n");
    });
  });

  describe(".text()", () => {
    it("should return stdout as trimmed string", async () => {
      const $ = createShell();
      const text = await $`echo hello`.text();
      expect(text).toBe("hello");
    });

    it("should trim trailing newline", async () => {
      const $ = createShell();
      const text = await $`printf "hello\n"`.text();
      expect(text).toBe("hello");
    });
  });

  describe(".json()", () => {
    it("should parse stdout as JSON", async () => {
      const $ = createShell();
      const data = await $`echo '{"foo": "bar"}'`.json<IJsonPayload>();
      expect(data).toEqual({ foo: "bar" });
    });
  });

  describe(".lines()", () => {
    it("should return stdout as array of lines", async () => {
      const $ = createShell();
      const lines = await $`printf "a\nb\nc"`.lines();
      expect(lines).toEqual(["a", "b", "c"]);
    });
  });

  describe(".bytes()", () => {
    it("should return stdout as Uint8Array", async () => {
      const $ = createShell();
      const bytes = await $`echo hello`.bytes();
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(new TextDecoder().decode(bytes)).toBe("hello\n");
    });
  });

  describe(".cwd()", () => {
    it("should execute command in specified directory", async () => {
      const $ = createShell();
      const result = await $`pwd`.cwd("/tmp");
      // macOS /tmp is symlink to /private/tmp
      expect(result.stdout.trim()).toMatch(/\/(private\/)?tmp/);
    });

    it("should allow chaining after cwd", async () => {
      const $ = createShell();
      const text = await $`pwd`.cwd("/tmp").text();
      expect(text).toMatch(/\/(private\/)?tmp/);
    });
  });

  describe(".env()", () => {
    it("should set environment variables", async () => {
      const $ = createShell();
      const result = await $`echo $MY_VAR`.env({ MY_VAR: "test-value" });
      expect(result.stdout.trim()).toBe("test-value");
    });

    it("should merge with existing environment", async () => {
      const $ = createShell({ env: { VAR1: "one" } });
      const result = await $`echo $VAR1 $VAR2`.env({ VAR2: "two" });
      expect(result.stdout.trim()).toBe("one two");
    });

    it("should allow unsetting variables with undefined", async () => {
      const $ = createShell({ env: { MY_VAR: "initial" } });
      const result = await $`echo "VAR=$MY_VAR"`.env({ MY_VAR: undefined });
      expect(result.stdout.trim()).toBe("VAR=");
    });
  });

  describe(".quiet()", () => {
    it("should NOT suppress logger output - logger always logs", async () => {
      // .quiet() is kept for API compatibility but doesn't suppress logging
      // The purpose of a logging shell is to log - .quiet() shouldn't defeat that
      const logger = new TestLogger();
      const $ = createShell({ logger });
      await $`echo hello`.quiet();
      logger.expect(["INFO"], [], [], ["$ echo hello", "| hello"]);
    });
  });

  describe("error handling", () => {
    it("should throw ShellError on non-zero exit", async () => {
      const $ = createShell();
      try {
        await $`exit 1`;
        expect.unreachable("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(ShellError);
      }
    });

    it("should include exit code in error", async () => {
      const $ = createShell();
      try {
        await $`exit 42`;
        expect.unreachable("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(ShellError);
        expect((error as ShellError).code).toBe(42);
      }
    });

    it("should include stderr in error", async () => {
      const $ = createShell();
      try {
        await $`echo "error message" >&2 && exit 1`;
        expect.unreachable("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(ShellError);
        expect((error as ShellError).stderr).toContain("error message");
      }
    });
  });

  describe(".noThrow()", () => {
    it("should not throw on non-zero exit", async () => {
      const $ = createShell();
      const result = await $`exit 1`.noThrow();
      expect(result.code).toBe(1);
    });

    it("should return stdout and stderr even on failure", async () => {
      const $ = createShell();
      const result = await $`echo "output" && echo "error" >&2 && exit 1`.noThrow();
      expect(result.code).toBe(1);
      expect(result.stdout).toContain("output");
      expect(result.stderr).toContain("error");
    });

    it("should work with text() method", async () => {
      const $ = createShell();
      const text = await $`echo "hello" && exit 1`.noThrow().text();
      expect(text).toBe("hello");
    });
  });

  describe("logging", () => {
    it("should log command when logger provided", async () => {
      const logger = new TestLogger();
      const $ = createShell({ logger });
      await $`echo hello`;
      logger.expect(["INFO"], [], [], ["$ echo hello"]);
    });

    it("should log stdout lines in real-time", async () => {
      const logger = new TestLogger();
      const $ = createShell({ logger });
      await $`echo first && echo second`;
      logger.expect(["INFO"], [], [], [/\$ echo first/, "| first", "| second"]);
    });

    it("should log stderr lines at info level", async () => {
      const logger = new TestLogger();
      const $ = createShell({ logger });
      await $`echo "error" >&2`;
      logger.expect(["INFO"], [], [], [/\$ echo/, "| error"]);
    });
  });

  describe("chaining", () => {
    it("should support full chain: cwd -> env -> quiet -> text", async () => {
      const logger = new TestLogger();
      const $ = createShell({ logger });
      const text = await $`echo $MY_VAR && pwd`.cwd("/tmp").env({ MY_VAR: "test" }).quiet().text();
      // macOS /tmp -> /private/tmp
      expect(text).toMatch(/test\n\/(private\/)?tmp/);
    });

    it("should not allow modification after execution starts", async () => {
      const $ = createShell();
      const cmd = $`echo hello`;
      await cmd;
      expect(() => cmd.cwd("/tmp")).toThrow("Cannot modify command after execution");
    });
  });
});
