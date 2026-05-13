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
  withSource,
} from "@dotfiles/shell-emissions";
import { beforeEach, describe, expect, it } from "bun:test";
import { ZshEmissionFormatter } from "../ZshEmissionFormatter";

describe("ZshEmissionFormatter", () => {
  const onceScriptDir = "/test/.once";
  let formatter: ZshEmissionFormatter;

  beforeEach(() => {
    formatter = new ZshEmissionFormatter({ onceScriptDir });
  });

  describe("formatEnvironment", () => {
    it("should format environment variable", () => {
      const emission = environment({ MY_VAR: "my-value" });
      const result = formatter.formatEmission(emission);

      expect(result).toMatchInlineSnapshot(`"export MY_VAR="my-value""`);
    });

    it("should format multiple environment variables", () => {
      const emission = environment({ VAR1: "value1", VAR2: "value2" });
      const result = formatter.formatEmission(emission);

      expect(result).toMatchInlineSnapshot(`
        "export VAR1="value1"
        export VAR2="value2""
      `);
    });
  });

  describe("formatAlias", () => {
    it("should format single alias", () => {
      const emission = alias({ ll: "ls -la" });
      const result = formatter.formatEmission(emission);

      expect(result).toMatchInlineSnapshot(`"alias ll='ls -la'"`);
    });

    it("should format multiple aliases", () => {
      const emission = alias({ ll: "ls -la", la: "ls -la" });
      const result = formatter.formatEmission(emission);

      expect(result).toMatchInlineSnapshot(`
        "alias ll='ls -la'
        alias la='ls -la'"
      `);
    });

    it("should not expand subshell expressions", () => {
      const emission = alias({ today: "echo $(date)" });
      const result = formatter.formatEmission(emission);

      expect(result).toMatchInlineSnapshot(`"alias today='echo $(date)'"`);
    });

    it("should escape single quotes in alias value", () => {
      const emission = alias({ greet: "echo 'hello'" });
      const result = formatter.formatEmission(emission);

      expect(result).toMatchInlineSnapshot(`"alias greet='echo '\\''hello'\\'''"`);
    });
  });

  describe("formatFunction", () => {
    it("should format function", () => {
      const emission = fn("greet", 'echo "Hello, $1!"');
      const result = formatter.formatEmission(emission);

      expect(result).toMatchInlineSnapshot(`
        "greet() {
          echo "Hello, $1!"
        }"
      `);
    });

    it("should handle multi-line function body", () => {
      const emission = fn("multi", 'echo "line1"\necho "line2"');
      const result = formatter.formatEmission(emission);

      expect(result).toMatchInlineSnapshot(`
        "multi() {
          echo "line1"
          echo "line2"
        }"
      `);
    });
  });

  describe("formatScript", () => {
    it("should format raw script without modification", () => {
      const emission = script('echo "hello"', "raw");
      const result = formatter.formatEmission(emission);

      expect(result).toMatchInlineSnapshot(`"echo "hello""`);
    });

    it("should format always script", () => {
      const emission = script('echo "hello"', "always");
      const result = formatter.formatEmission(emission);

      expect(result).toMatchInlineSnapshot(`"echo "hello""`);
    });
  });

  describe("formatOnceScript", () => {
    it("should include source attribution in once script content", () => {
      const emission = withSource(script('echo "setup"', "once"), "/tools/test.tool.ts");
      const result = formatter.formatOnceScript(emission, 1);

      expect(result.filename).toMatchInlineSnapshot(`"once-001.zsh"`);
      expect(result.content).toMatchInlineSnapshot(`
        "# Generated once script - will self-delete after execution
        # /tools/test.tool.ts
        echo "setup"
        rm "/test/.once/once-001.zsh""
      `);
    });
  });

  describe("formatSourceFile", () => {
    it("should format source file", () => {
      const emission = sourceFile("$HOME/.toolrc");
      const result = formatter.formatEmission(emission);

      expect(result).toMatchInlineSnapshot(`"source "$HOME/.toolrc""`);
    });
  });

  describe("formatSourceFunction", () => {
    it("should format source function", () => {
      const emission = sourceFunction("myFunc");
      const result = formatter.formatEmission(emission);

      expect(result).toMatchInlineSnapshot(`"source <(myFunc)"`);
    });
  });

  describe("formatSource", () => {
    it("should format source emission with inline content", () => {
      const emission = source('echo "hello"', "__dotfiles_test_0");
      const result = formatter.formatEmission(emission);

      expect(result).toMatchInlineSnapshot(`
        "__dotfiles_test_0() {
          echo "hello"
        }
        source <(__dotfiles_test_0)
        unset -f __dotfiles_test_0"
      `);
    });

    it("should handle multi-line content", () => {
      const emission = source('echo "line1"\necho "line2"', "__dotfiles_multi_0");
      const result = formatter.formatEmission(emission);

      expect(result).toMatchInlineSnapshot(`
        "__dotfiles_multi_0() {
          echo "line1"
          echo "line2"
        }
        source <(__dotfiles_multi_0)
        unset -f __dotfiles_multi_0"
      `);
    });
  });

  describe("formatCompletion", () => {
    it("should format completion with directories", () => {
      const emission = completion({ directories: ["$HOME/.completions"] });
      const result = formatter.formatEmission(emission);

      expect(result).toMatchInlineSnapshot(`
        "typeset -U fpath
        fpath=("$HOME/.completions" $fpath)"
      `);
    });

    it("should format completion with files", () => {
      const emission = completion({ files: ["/path/to/completion"] });
      const result = formatter.formatEmission(emission);

      expect(result).toMatchInlineSnapshot(`
        "typeset -U fpath
        source "/path/to/completion""
      `);
    });
  });

  describe("formatPath", () => {
    it("should format path with prepend and deduplication", () => {
      const emission = path("/usr/local/bin", { position: "prepend", deduplicate: true });
      const result = formatter.formatEmission(emission);

      expect(result).toMatchInlineSnapshot(`
        "if [[ ":$PATH:" != *":/usr/local/bin:"* ]]; then
          export PATH="/usr/local/bin:$PATH"
        fi"
      `);
    });

    it("should format path with append and deduplication", () => {
      const emission = path("/usr/local/bin", { position: "append", deduplicate: true });
      const result = formatter.formatEmission(emission);

      expect(result).toMatchInlineSnapshot(`
        "if [[ ":$PATH:" != *":/usr/local/bin:"* ]]; then
          export PATH="$PATH:/usr/local/bin"
        fi"
      `);
    });

    it("should format path without deduplication", () => {
      const emission = path("/usr/local/bin", { deduplicate: false });
      const result = formatter.formatEmission(emission);

      expect(result).toMatchInlineSnapshot(`"export PATH="/usr/local/bin:$PATH""`);
    });
  });

  describe("formatOnceScriptInitializer", () => {
    it("should generate once script loop", () => {
      const result = formatter.formatOnceScriptInitializer();

      expect(result).toMatchInlineSnapshot(`
        "# Execute once scripts (runs only once per script)
        for once_script in "/test/.once"/*.zsh(N); do
          [[ -f "$once_script" ]] && source "$once_script"
        done"
      `);
    });
  });

  describe("formatFileHeader", () => {
    it("should generate file header", () => {
      const result = formatter.formatFileHeader();

      expect(result).toMatchInlineSnapshot(`
        "# ==============================================================================
        # THIS FILE IS AUTOMATICALLY GENERATED BY THE DOTFILES MANAGEMENT TOOL
        # DO NOT EDIT THIS FILE DIRECTLY - YOUR CHANGES WILL BE OVERWRITTEN
        # ==============================================================================
        "
      `);
    });

    it("should generate file header with metadata", () => {
      const result = formatter.formatFileHeader({ sourceFile: "/path/to/dotfiles" });

      expect(result).toMatchInlineSnapshot(`
        "# ==============================================================================
        # THIS FILE IS AUTOMATICALLY GENERATED BY THE DOTFILES MANAGEMENT TOOL
        # DO NOT EDIT THIS FILE DIRECTLY - YOUR CHANGES WILL BE OVERWRITTEN
        # ==============================================================================

        # Dotfiles directory: /path/to/dotfiles
        "
      `);
    });
  });

  describe("formatSectionHeader", () => {
    it("should generate section header", () => {
      const result = formatter.formatSectionHeader("PATH Modifications");

      expect(result).toMatchInlineSnapshot(
        `"# ============================= PATH Modifications =============================="`,
      );
    });
  });

  describe("formatFileFooter", () => {
    it("should generate file footer", () => {
      const result = formatter.formatFileFooter();

      expect(result).toMatchInlineSnapshot(
        `"# ============================ End of Generated File ============================"`,
      );
    });
  });

  describe("comment", () => {
    it("should create single line comment", () => {
      const result = formatter.comment("This is a comment");

      expect(result).toMatchInlineSnapshot(`"# This is a comment"`);
    });
  });

  describe("commentBlock", () => {
    it("should create multi-line comment block", () => {
      const result = formatter.commentBlock(["Line 1", "Line 2"]);

      expect(result).toMatchInlineSnapshot(`
        "# Line 1
        # Line 2"
      `);
    });
  });
});
