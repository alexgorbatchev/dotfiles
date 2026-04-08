import { beforeEach, describe, expect, it, mock } from "bun:test";

/**
 * Test file for no-unnecessary-testing-helpers-import oxlint plugin rule.
 *
 * Since this is an oxlint JS plugin (ESLint-compatible), we test it by:
 * 1. Loading the plugin module
 * 2. Verifying the rule structure
 * 3. Simulating the rule behavior with mock AST nodes
 */

// Load the plugin (ESM default export)
import plugin from "../plugin.js";

interface ASTVisitor {
  // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- mock AST visitor for testing
  ImportDeclaration: (node: unknown) => void;
}

describe("no-unnecessary-testing-helpers-import rule", () => {
  describe("plugin structure", () => {
    it("exports no-unnecessary-testing-helpers-import rule", () => {
      expect(plugin.rules["no-unnecessary-testing-helpers-import"]).toBeDefined();
    });
  });

  describe("rule meta", () => {
    const rule = plugin.rules["no-unnecessary-testing-helpers-import"];

    it("has correct meta type", () => {
      expect(rule.meta?.type).toBe("problem");
    });

    it("has description in docs", () => {
      expect(rule.meta?.docs?.description).toBe("Disallow bare imports of @dotfiles/testing-helpers");
    });

    it("has message for unnecessaryImport", () => {
      expect(rule.meta?.messages?.["unnecessaryImport"]).toBe("This import is not necessary.");
    });
  });

  describe("rule.create()", () => {
    const rule = plugin.rules["no-unnecessary-testing-helpers-import"];

    it("returns visitor with ImportDeclaration handler", () => {
      const mockContext = { report: mock(() => {}) };
      const visitor = rule.create(mockContext) as ASTVisitor;

      expect(visitor.ImportDeclaration).toBeFunction();
    });

    describe("ImportDeclaration visitor", () => {
      let reportMock: ReturnType<typeof mock>;
      let visitor: ASTVisitor;

      beforeEach(() => {
        reportMock = mock(() => {});
        visitor = rule.create({ report: reportMock }) as ASTVisitor;
      });

      it("reports bare import of @dotfiles/testing-helpers", () => {
        // AST for: import '@dotfiles/testing-helpers';
        const node = {
          type: "ImportDeclaration",
          source: { value: "@dotfiles/testing-helpers" },
          specifiers: [],
        };

        visitor.ImportDeclaration(node);

        expect(reportMock).toHaveBeenCalledTimes(1);
        expect(reportMock).toHaveBeenCalledWith({
          node,
          messageId: "unnecessaryImport",
        });
      });

      it("does not report named import from @dotfiles/testing-helpers", () => {
        // AST for: import { TestLogger } from '@dotfiles/testing-helpers';
        const node = {
          type: "ImportDeclaration",
          source: { value: "@dotfiles/testing-helpers" },
          specifiers: [{ type: "ImportSpecifier", imported: { name: "TestLogger" } }],
        };

        visitor.ImportDeclaration(node);

        expect(reportMock).not.toHaveBeenCalled();
      });

      it("does not report default import from @dotfiles/testing-helpers", () => {
        // AST for: import helpers from '@dotfiles/testing-helpers';
        const node = {
          type: "ImportDeclaration",
          source: { value: "@dotfiles/testing-helpers" },
          specifiers: [{ type: "ImportDefaultSpecifier", local: { name: "helpers" } }],
        };

        visitor.ImportDeclaration(node);

        expect(reportMock).not.toHaveBeenCalled();
      });

      it("does not report namespace import from @dotfiles/testing-helpers", () => {
        // AST for: import * as helpers from '@dotfiles/testing-helpers';
        const node = {
          type: "ImportDeclaration",
          source: { value: "@dotfiles/testing-helpers" },
          specifiers: [{ type: "ImportNamespaceSpecifier", local: { name: "helpers" } }],
        };

        visitor.ImportDeclaration(node);

        expect(reportMock).not.toHaveBeenCalled();
      });

      it("does not report bare import of other packages", () => {
        // AST for: import 'some-other-package';
        const node = {
          type: "ImportDeclaration",
          source: { value: "some-other-package" },
          specifiers: [],
        };

        visitor.ImportDeclaration(node);

        expect(reportMock).not.toHaveBeenCalled();
      });

      it("does not report bare import of similar package name", () => {
        // AST for: import '@dotfiles/testing-helpers-extra';
        const node = {
          type: "ImportDeclaration",
          source: { value: "@dotfiles/testing-helpers-extra" },
          specifiers: [],
        };

        visitor.ImportDeclaration(node);

        expect(reportMock).not.toHaveBeenCalled();
      });
    });
  });
});
