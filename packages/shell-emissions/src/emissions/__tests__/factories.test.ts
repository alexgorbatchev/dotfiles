import { describe, expect, it } from "bun:test";
import { EmissionValidationError } from "../../errors";
import {
  alias,
  completion,
  environment,
  fn,
  path,
  script,
  source,
  sourceFile,
  sourceFunction,
  withPriority,
  withSource,
} from "../factories";

describe("environment", () => {
  it("creates environment emission with valid variables", () => {
    const result = environment({ NODE_ENV: "production", DEBUG: "false" });

    expect(result).toMatchInlineSnapshot(`
      {
        "kind": "environment",
        "variables": {
          "DEBUG": "false",
          "NODE_ENV": "production",
        },
      }
    `);
  });

  it("throws on empty variables", () => {
    expect(() => environment({})).toThrow(EmissionValidationError);
  });

  it("throws on invalid variable name", () => {
    expect(() => environment({ "123invalid": "value" })).toThrow(EmissionValidationError);
  });

  it("throws on variable name with hyphen", () => {
    expect(() => environment({ "my-var": "value" })).toThrow(EmissionValidationError);
  });
});

describe("alias", () => {
  it("creates alias emission with valid aliases", () => {
    const result = alias({ ll: "ls -la", g: "git" });

    expect(result).toMatchInlineSnapshot(`
      {
        "aliases": {
          "g": "git",
          "ll": "ls -la",
        },
        "kind": "alias",
      }
    `);
  });

  it("allows hyphens in alias names", () => {
    const result = alias({ "my-alias": "command" });

    expect(result).toMatchInlineSnapshot(`
      {
        "aliases": {
          "my-alias": "command",
        },
        "kind": "alias",
      }
    `);
  });

  it("throws on empty aliases", () => {
    expect(() => alias({})).toThrow(EmissionValidationError);
  });

  it("throws on invalid alias name", () => {
    expect(() => alias({ "123invalid": "command" })).toThrow(EmissionValidationError);
  });
});

describe("fn", () => {
  it("creates function emission", () => {
    const result = fn("greet", 'echo "Hello"');

    expect(result).toMatchInlineSnapshot(`
      {
        "body": "echo "Hello"",
        "kind": "function",
        "name": "greet",
      }
    `);
  });

  it("allows hyphens in function names", () => {
    const result = fn("my-func", "echo test");

    expect(result).toMatchInlineSnapshot(`
      {
        "body": "echo test",
        "kind": "function",
        "name": "my-func",
      }
    `);
  });

  it("throws on invalid function name", () => {
    expect(() => fn("123func", "body")).toThrow(EmissionValidationError);
  });

  it("throws on empty body", () => {
    expect(() => fn("valid", "")).toThrow(EmissionValidationError);
  });

  it("throws on whitespace-only body", () => {
    expect(() => fn("valid", "   ")).toThrow(EmissionValidationError);
  });
});

describe("script", () => {
  it("creates script emission with always timing", () => {
    const result = script('echo "startup"', "always");

    expect(result).toMatchInlineSnapshot(`
      {
        "content": "echo "startup"",
        "kind": "script",
        "timing": "always",
      }
    `);
  });

  it("creates script emission with once timing", () => {
    const result = script("one-time-setup", "once");

    expect(result).toMatchInlineSnapshot(`
      {
        "content": "one-time-setup",
        "kind": "script",
        "timing": "once",
      }
    `);
  });

  it("creates script emission with raw timing", () => {
    const result = script("raw content", "raw");

    expect(result).toMatchInlineSnapshot(`
      {
        "content": "raw content",
        "kind": "script",
        "timing": "raw",
      }
    `);
  });

  it("throws on empty content", () => {
    expect(() => script("", "always")).toThrow(EmissionValidationError);
  });
});

describe("sourceFile", () => {
  it("creates sourceFile emission", () => {
    const result = sourceFile("$HOME/.toolrc");

    expect(result).toMatchInlineSnapshot(`
      {
        "kind": "sourceFile",
        "path": "$HOME/.toolrc",
      }
    `);
  });

  it("throws on empty path", () => {
    expect(() => sourceFile("")).toThrow(EmissionValidationError);
  });
});

describe("source", () => {
  it("creates source emission with content and function name", () => {
    const result = source('echo "hello"', "__dotfiles_source_test_0");

    expect(result).toMatchInlineSnapshot(`
      {
        "content": "echo "hello"",
        "functionName": "__dotfiles_source_test_0",
        "kind": "source",
      }
    `);
  });

  it("allows hyphens in function name", () => {
    const result = source("echo test", "my-source-fn");

    expect(result).toMatchInlineSnapshot(`
      {
        "content": "echo test",
        "functionName": "my-source-fn",
        "kind": "source",
      }
    `);
  });

  it("throws on empty content", () => {
    expect(() => source("", "validFn")).toThrow(EmissionValidationError);
  });

  it("throws on whitespace-only content", () => {
    expect(() => source("   ", "validFn")).toThrow(EmissionValidationError);
  });

  it("throws on invalid function name", () => {
    expect(() => source("echo test", "123invalid")).toThrow(EmissionValidationError);
  });
});

describe("sourceFunction", () => {
  it("creates sourceFunction emission", () => {
    const result = sourceFunction("initTool");

    expect(result).toMatchInlineSnapshot(`
      {
        "functionName": "initTool",
        "kind": "sourceFunction",
      }
    `);
  });

  it("allows hyphens in function name", () => {
    const result = sourceFunction("init-tool");

    expect(result).toMatchInlineSnapshot(`
      {
        "functionName": "init-tool",
        "kind": "sourceFunction",
      }
    `);
  });

  it("throws on invalid function name", () => {
    expect(() => sourceFunction("123invalid")).toThrow(EmissionValidationError);
  });
});

describe("completion", () => {
  it("creates completion emission with directories", () => {
    const result = completion({ directories: ["$HOME/.completions"] });

    expect(result).toMatchInlineSnapshot(`
      {
        "commands": undefined,
        "directories": [
          "$HOME/.completions",
        ],
        "files": undefined,
        "kind": "completion",
      }
    `);
  });

  it("creates completion emission with files", () => {
    const result = completion({ files: ["$HOME/.zsh/completions/_node"] });

    expect(result).toMatchInlineSnapshot(`
      {
        "commands": undefined,
        "directories": undefined,
        "files": [
          "$HOME/.zsh/completions/_node",
        ],
        "kind": "completion",
      }
    `);
  });

  it("creates completion emission with commands", () => {
    const result = completion({ commands: ["node", "npm", "git"] });

    expect(result).toMatchInlineSnapshot(`
      {
        "commands": [
          "node",
          "npm",
          "git",
        ],
        "directories": undefined,
        "files": undefined,
        "kind": "completion",
      }
    `);
  });

  it("creates completion emission with all options", () => {
    const result = completion({
      directories: ["$HOME/.completions"],
      files: ["$HOME/.zsh/_custom"],
      commands: ["node"],
    });

    expect(result).toMatchInlineSnapshot(`
      {
        "commands": [
          "node",
        ],
        "directories": [
          "$HOME/.completions",
        ],
        "files": [
          "$HOME/.zsh/_custom",
        ],
        "kind": "completion",
      }
    `);
  });

  it("throws when no options provided", () => {
    expect(() => completion({})).toThrow(EmissionValidationError);
  });

  it("throws when all arrays are empty", () => {
    expect(() => completion({ directories: [], files: [], commands: [] })).toThrow(EmissionValidationError);
  });
});

describe("path", () => {
  it("creates path emission with defaults", () => {
    const result = path("/usr/local/bin");

    expect(result).toMatchInlineSnapshot(`
      {
        "deduplicate": true,
        "directory": "/usr/local/bin",
        "kind": "path",
        "position": "prepend",
      }
    `);
  });

  it("creates path emission with append position", () => {
    const result = path("$HOME/.local/bin", { position: "append" });

    expect(result).toMatchInlineSnapshot(`
      {
        "deduplicate": true,
        "directory": "$HOME/.local/bin",
        "kind": "path",
        "position": "append",
      }
    `);
  });

  it("creates path emission without deduplication", () => {
    const result = path("/opt/bin", { deduplicate: false });

    expect(result).toMatchInlineSnapshot(`
      {
        "deduplicate": false,
        "directory": "/opt/bin",
        "kind": "path",
        "position": "prepend",
      }
    `);
  });

  it("throws on empty directory", () => {
    expect(() => path("")).toThrow(EmissionValidationError);
  });
});

describe("withSource", () => {
  it("sets source on emission", () => {
    const emission = fn("test", "echo test");
    const result = withSource(emission, "/path/to/config.ts");

    expect(result).toMatchInlineSnapshot(`
      {
        "body": "echo test",
        "kind": "function",
        "name": "test",
        "source": "/path/to/config.ts",
      }
    `);
  });
});

describe("withPriority", () => {
  it("sets priority on emission", () => {
    const emission = environment({ VAR: "value" });
    const result = withPriority(emission, 10);

    expect(result).toMatchInlineSnapshot(`
      {
        "kind": "environment",
        "priority": 10,
        "variables": {
          "VAR": "value",
        },
      }
    `);
  });
});
