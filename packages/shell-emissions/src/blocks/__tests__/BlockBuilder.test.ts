import { describe, expect, it } from "bun:test";
import assert from "node:assert";
import {
  alias,
  completion,
  environment,
  fn,
  path,
  sourceFunction,
  withPriority,
  withSource,
} from "../../emissions/factories";
import { BlockValidationError } from "../../errors";
import { SectionPriority } from "../../renderer/constants";
import { BlockBuilder } from "../BlockBuilder";

describe("BlockBuilder", () => {
  describe("addSection", () => {
    it("adds a section with basic options", () => {
      const builder = new BlockBuilder().addSection("env", {
        title: "Environment",
        priority: SectionPriority.Path,
        hoistKinds: ["environment"],
      });

      const blocks = builder.build();

      expect(blocks).toMatchInlineSnapshot(`
        [
          {
            "children": undefined,
            "emissions": [],
            "id": "env",
            "isFileFooter": undefined,
            "isFileHeader": undefined,
            "metadata": undefined,
            "priority": 100,
            "title": "Environment",
          },
        ]
      `);
    });

    it("throws when adding duplicate section", () => {
      const builder = new BlockBuilder().addSection("env", { priority: SectionPriority.Path });

      expect(() => builder.addSection("env", { priority: SectionPriority.Environment })).toThrow(BlockValidationError);
    });

    it("throws when priority is negative", () => {
      expect(() => new BlockBuilder().addSection("invalid", { priority: -1 as SectionPriority })).toThrow(
        BlockValidationError,
      );
    });
  });

  describe("addEmission - hoisted emissions", () => {
    it("routes environment emission to correct section", () => {
      const builder = new BlockBuilder()
        .addSection("env", {
          title: "Environment",
          priority: SectionPriority.Environment,
          hoistKinds: ["environment"],
        })
        .addEmission(environment({ NODE_ENV: "production" }));

      const blocks = builder.build();

      expect(blocks).toMatchInlineSnapshot(`
        [
          {
            "children": undefined,
            "emissions": [
              {
                "kind": "environment",
                "variables": {
                  "NODE_ENV": "production",
                },
              },
            ],
            "id": "env",
            "isFileFooter": undefined,
            "isFileHeader": undefined,
            "metadata": undefined,
            "priority": 200,
            "title": "Environment",
          },
        ]
      `);
    });

    it("routes path emission to correct section", () => {
      const builder = new BlockBuilder()
        .addSection("path", { title: "PATH", priority: SectionPriority.Path, hoistKinds: ["path"] })
        .addEmission(path("/usr/local/bin"));

      const blocks = builder.build();

      expect(blocks).toMatchInlineSnapshot(`
        [
          {
            "children": undefined,
            "emissions": [
              {
                "deduplicate": true,
                "directory": "/usr/local/bin",
                "kind": "path",
                "position": "prepend",
              },
            ],
            "id": "path",
            "isFileFooter": undefined,
            "isFileHeader": undefined,
            "metadata": undefined,
            "priority": 100,
            "title": "PATH",
          },
        ]
      `);
    });

    it("routes completion emission to correct section", () => {
      const builder = new BlockBuilder()
        .addSection("completions", {
          title: "Completions",
          priority: SectionPriority.Completions,
          hoistKinds: ["completion"],
        })
        .addEmission(completion({ commands: ["node"] }));

      const blocks = builder.build();

      expect(blocks).toMatchInlineSnapshot(`
        [
          {
            "children": undefined,
            "emissions": [
              {
                "commands": [
                  "node",
                ],
                "directories": undefined,
                "files": undefined,
                "kind": "completion",
              },
            ],
            "id": "completions",
            "isFileFooter": undefined,
            "isFileHeader": undefined,
            "metadata": undefined,
            "priority": 500,
            "title": "Completions",
          },
        ]
      `);
    });

    it("throws when no section accepts hoisted kind", () => {
      const builder = new BlockBuilder().addSection("main", { priority: SectionPriority.Path, allowChildren: true });

      expect(() => builder.addEmission(environment({ VAR: "value" }))).toThrow(BlockValidationError);
    });
  });

  describe("addEmission - non-hoisted emissions", () => {
    it("adds non-hoisted emission to section with allowChildren", () => {
      const builder = new BlockBuilder()
        .addSection("main", { title: "Main", priority: SectionPriority.MainContent, allowChildren: true })
        .addEmission(fn("greet", "echo hello"));

      const blocks = builder.build();

      expect(blocks).toMatchInlineSnapshot(`
        [
          {
            "children": undefined,
            "emissions": [
              {
                "body": "echo hello",
                "kind": "function",
                "name": "greet",
              },
            ],
            "id": "main",
            "isFileFooter": undefined,
            "isFileHeader": undefined,
            "metadata": undefined,
            "priority": 300,
            "title": "Main",
          },
        ]
      `);
    });

    it("creates child block when childBlockId provided", () => {
      const builder = new BlockBuilder()
        .addSection("main", { title: "Main", priority: SectionPriority.MainContent, allowChildren: true })
        .addEmission(fn("greet", "echo hello"), "my-tool")
        .addEmission(alias({ ll: "ls -la" }), "my-tool");

      const blocks = builder.build();

      expect(blocks).toMatchInlineSnapshot(`
        [
          {
            "children": [
              {
                "emissions": [
                  {
                    "body": "echo hello",
                    "kind": "function",
                    "name": "greet",
                  },
                  {
                    "aliases": {
                      "ll": "ls -la",
                    },
                    "kind": "alias",
                  },
                ],
                "id": "my-tool",
                "metadata": undefined,
                "priority": 0,
                "title": "my-tool",
              },
            ],
            "emissions": [],
            "id": "main",
            "isFileFooter": undefined,
            "isFileHeader": undefined,
            "metadata": undefined,
            "priority": 300,
            "title": "Main",
          },
        ]
      `);
    });

    it("groups emissions by childBlockId", () => {
      const builder = new BlockBuilder()
        .addSection("main", { title: "Main", priority: SectionPriority.MainContent, allowChildren: true })
        .addEmission(fn("func1", "echo 1"), "tool-a")
        .addEmission(fn("func2", "echo 2"), "tool-b")
        .addEmission(fn("func3", "echo 3"), "tool-a");

      const blocks = builder.build();

      expect(blocks).toMatchInlineSnapshot(`
        [
          {
            "children": [
              {
                "emissions": [
                  {
                    "body": "echo 1",
                    "kind": "function",
                    "name": "func1",
                  },
                  {
                    "body": "echo 3",
                    "kind": "function",
                    "name": "func3",
                  },
                ],
                "id": "tool-a",
                "metadata": undefined,
                "priority": 0,
                "title": "tool-a",
              },
              {
                "emissions": [
                  {
                    "body": "echo 2",
                    "kind": "function",
                    "name": "func2",
                  },
                ],
                "id": "tool-b",
                "metadata": undefined,
                "priority": 1,
                "title": "tool-b",
              },
            ],
            "emissions": [],
            "id": "main",
            "isFileFooter": undefined,
            "isFileHeader": undefined,
            "metadata": undefined,
            "priority": 300,
            "title": "Main",
          },
        ]
      `);
    });

    it("throws when no section allows children", () => {
      const builder = new BlockBuilder().addSection("env", {
        priority: SectionPriority.Path,
        hoistKinds: ["environment"],
      });

      expect(() => builder.addEmission(fn("test", "echo"))).toThrow(BlockValidationError);
    });
  });

  describe("addEmissionToSection", () => {
    it("adds emission directly to specified section", () => {
      const builder = new BlockBuilder()
        .addSection("cli", { priority: SectionPriority.Cli })
        .addSection("env", { priority: SectionPriority.Environment, hoistKinds: ["environment"] })
        .addEmissionToSection(fn("dotfiles", 'echo "cli"'), "cli");

      const blocks = builder.build();
      const cliBlock = blocks.find((b) => b.id === "cli");

      expect(cliBlock?.emissions).toHaveLength(1);
      expect(cliBlock?.emissions[0]).toMatchObject({
        kind: "function",
        name: "dotfiles",
        body: 'echo "cli"',
      });
    });

    it("bypasses hoisting rules when adding to section", () => {
      const builder = new BlockBuilder()
        .addSection("custom", { priority: SectionPriority.Path })
        .addSection("env", { priority: SectionPriority.Environment, hoistKinds: ["environment"] })
        .addEmissionToSection(environment({ MY_VAR: "value" }), "custom");

      const blocks = builder.build();
      const customBlock = blocks.find((b) => b.id === "custom");
      const envBlock = blocks.find((b) => b.id === "env");

      expect(customBlock?.emissions).toHaveLength(1);
      expect(envBlock?.emissions).toHaveLength(0);
    });

    it("throws when section does not exist", () => {
      const builder = new BlockBuilder().addSection("env", { priority: SectionPriority.Environment });

      expect(() => builder.addEmissionToSection(fn("test", "echo"), "nonexistent")).toThrow(BlockValidationError);
    });

    it("supports method chaining", () => {
      const builder = new BlockBuilder()
        .addSection("cli", { priority: SectionPriority.Cli })
        .addEmissionToSection(fn("func1", "echo 1"), "cli")
        .addEmissionToSection(fn("func2", "echo 2"), "cli");

      const blocks = builder.build();
      const cliBlock = blocks.find((b) => b.id === "cli");

      expect(cliBlock?.emissions).toHaveLength(2);
    });
  });

  describe("build", () => {
    it("sorts blocks by priority", () => {
      const builder = new BlockBuilder()
        .addSection("footer", { priority: SectionPriority.FileFooter })
        .addSection("env", { priority: SectionPriority.Environment })
        .addSection("path", { priority: SectionPriority.Path })
        .addSection("header", { priority: SectionPriority.FileHeader });

      const blocks = builder.build();

      expect(blocks.map((b) => b.id)).toMatchInlineSnapshot(`
        [
          "header",
          "path",
          "env",
          "footer",
        ]
      `);
    });

    it("sorts emissions by priority within block", () => {
      const builder = new BlockBuilder()
        .addSection("env", { priority: SectionPriority.Path, hoistKinds: ["environment"] })
        .addEmission(withPriority(environment({ LAST: "value" }), 30))
        .addEmission(withPriority(environment({ FIRST: "value" }), 10))
        .addEmission(withPriority(environment({ MIDDLE: "value" }), 20));

      const blocks = builder.build();
      const firstBlock = blocks[0];
      assert(firstBlock);
      const emissions = firstBlock.emissions;

      expect(emissions.map((e) => Object.keys(e.kind === "environment" ? e.variables : {})[0])).toMatchInlineSnapshot(`
        [
          "FIRST",
          "MIDDLE",
          "LAST",
        ]
      `);
    });

    it("preserves source attribution in child block metadata", () => {
      const builder = new BlockBuilder()
        .addSection("main", { priority: SectionPriority.MainContent, allowChildren: true })
        .addEmission(withSource(fn("test", "echo"), "/path/to/config.ts"), "my-tool");

      const blocks = builder.build();
      const firstBlock = blocks[0];
      assert(firstBlock);
      const childBlock = firstBlock.children?.[0];

      expect(childBlock?.metadata).toMatchInlineSnapshot(`
        {
          "sourceFile": "/path/to/config.ts",
        }
      `);
    });

    it("sets isFileHeader and isFileFooter flags", () => {
      const builder = new BlockBuilder()
        .addSection("header", { priority: SectionPriority.FileHeader, isFileHeader: true })
        .addSection("footer", { priority: SectionPriority.FileFooter, isFileFooter: true });

      const blocks = builder.build();

      expect(blocks).toMatchInlineSnapshot(`
        [
          {
            "children": undefined,
            "emissions": [],
            "id": "header",
            "isFileFooter": undefined,
            "isFileHeader": true,
            "metadata": undefined,
            "priority": 0,
            "title": undefined,
          },
          {
            "children": undefined,
            "emissions": [],
            "id": "footer",
            "isFileFooter": true,
            "isFileHeader": undefined,
            "metadata": undefined,
            "priority": 999,
            "title": undefined,
          },
        ]
      `);
    });
  });

  describe("complete workflow", () => {
    it("builds a complete block structure", () => {
      const builder = new BlockBuilder()
        .addSection("header", { priority: SectionPriority.FileHeader, isFileHeader: true })
        .addSection("path", { title: "PATH", priority: SectionPriority.Path, hoistKinds: ["path"] })
        .addSection("env", {
          title: "Environment",
          priority: SectionPriority.Environment,
          hoistKinds: ["environment"],
        })
        .addSection("main", { title: "Initializations", priority: SectionPriority.MainContent, allowChildren: true })
        .addSection("completions", {
          title: "Completions",
          priority: SectionPriority.Completions,
          hoistKinds: ["completion"],
        })
        .addSection("footer", { priority: SectionPriority.FileFooter, isFileFooter: true });

      // Add emissions
      builder
        .addEmission(path("/usr/local/bin"))
        .addEmission(path("$HOME/.local/bin"))
        .addEmission(environment({ NODE_ENV: "production" }))
        .addEmission(fn("initNode", 'eval "$(fnm env)"'), "node")
        .addEmission(sourceFunction("initNode"), "node")
        .addEmission(alias({ ll: "ls -la" }), "common")
        .addEmission(completion({ commands: ["node", "npm"] }));

      const blocks = builder.build();

      expect(blocks).toMatchInlineSnapshot(`
        [
          {
            "children": undefined,
            "emissions": [],
            "id": "header",
            "isFileFooter": undefined,
            "isFileHeader": true,
            "metadata": undefined,
            "priority": 0,
            "title": undefined,
          },
          {
            "children": undefined,
            "emissions": [
              {
                "deduplicate": true,
                "directory": "/usr/local/bin",
                "kind": "path",
                "position": "prepend",
              },
              {
                "deduplicate": true,
                "directory": "$HOME/.local/bin",
                "kind": "path",
                "position": "prepend",
              },
            ],
            "id": "path",
            "isFileFooter": undefined,
            "isFileHeader": undefined,
            "metadata": undefined,
            "priority": 100,
            "title": "PATH",
          },
          {
            "children": undefined,
            "emissions": [
              {
                "kind": "environment",
                "variables": {
                  "NODE_ENV": "production",
                },
              },
            ],
            "id": "env",
            "isFileFooter": undefined,
            "isFileHeader": undefined,
            "metadata": undefined,
            "priority": 200,
            "title": "Environment",
          },
          {
            "children": [
              {
                "emissions": [
                  {
                    "body": "eval "$(fnm env)"",
                    "kind": "function",
                    "name": "initNode",
                  },
                  {
                    "functionName": "initNode",
                    "kind": "sourceFunction",
                  },
                ],
                "id": "node",
                "metadata": undefined,
                "priority": 0,
                "title": "node",
              },
              {
                "emissions": [
                  {
                    "aliases": {
                      "ll": "ls -la",
                    },
                    "kind": "alias",
                  },
                ],
                "id": "common",
                "metadata": undefined,
                "priority": 1,
                "title": "common",
              },
            ],
            "emissions": [],
            "id": "main",
            "isFileFooter": undefined,
            "isFileHeader": undefined,
            "metadata": undefined,
            "priority": 300,
            "title": "Initializations",
          },
          {
            "children": undefined,
            "emissions": [
              {
                "commands": [
                  "node",
                  "npm",
                ],
                "directories": undefined,
                "files": undefined,
                "kind": "completion",
              },
            ],
            "id": "completions",
            "isFileFooter": undefined,
            "isFileHeader": undefined,
            "metadata": undefined,
            "priority": 500,
            "title": "Completions",
          },
          {
            "children": undefined,
            "emissions": [],
            "id": "footer",
            "isFileFooter": true,
            "isFileHeader": undefined,
            "metadata": undefined,
            "priority": 999,
            "title": undefined,
          },
        ]
      `);
    });
  });
});
